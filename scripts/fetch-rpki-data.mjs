import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { loadSource } from './source-fallback.mjs';

const execFileAsync = promisify(execFile);

const STATUS_URL = 'https://rpki-validator.ripe.net/api/v1/status';
const HISTORY_BASE = 'https://lirportal.ripe.net/certification/content/static/statistics';
const GENERATED_URL = new URL('../src/generated/rpki-data.json', import.meta.url);
const GENERATED_TEMP_URL = new URL('../src/generated/rpki-data.json.tmp', import.meta.url);
const CACHE_DIRECTORY_URL = new URL('../.cache/api/', import.meta.url);
const AS_WATCHLIST_URL = new URL('../data/as-watchlist.json', import.meta.url);
const AS_PROFILES_PUBLIC_URL = new URL('../public/data/as-watchlist-profiles.json', import.meta.url);
const AS_PROFILES_TEMP_URL = new URL('../public/data/as-watchlist-profiles.json.tmp', import.meta.url);
const LAST_AS_PROFILES_URL = new URL('../.cache/snapshots/as-profiles.json', import.meta.url);
const sourceStates = new Map();
const profileArgument = process.argv.find((argument) => argument.startsWith('--profile='));
const syncProfile = profileArgument?.split('=')[1] || 'full';
const validProfiles = new Set(['fast', 'medium', 'daily', 'full']);
if (!validProfiles.has(syncProfile)) throw new Error(`Unknown sync profile: ${syncProfile}`);
const cacheCounters = { hits: 0, misses: 0, network: 0 };
const historyFiles = {
  AFRINIC: 'afrinic.tal.txt',
  APNIC: 'apnic.tal.txt',
  ARIN: 'arin.tal.txt',
  LACNIC: 'lacnic.tal.txt',
  RIPE: 'ripencc.tal.txt',
};

let previousOutput = null;
try {
  previousOutput = JSON.parse(await readFile(GENERATED_URL, 'utf8'));
} catch {
  // A clean checkout can bootstrap the full history without a previous snapshot.
}
let previousProfiles = {};
let previousProfilesTime = null;
for (const file of [LAST_AS_PROFILES_URL, AS_PROFILES_PUBLIC_URL]) {
  try {
    const saved = JSON.parse(await readFile(file, 'utf8'));
    if (!saved.byAsn) continue;
    previousProfiles = saved.byAsn;
    previousProfilesTime = saved.generatedAt;
    break;
  } catch { /* use the bundled snapshot if no successful cache exists */ }
}

const asWatchlist = JSON.parse(await readFile(AS_WATCHLIST_URL, 'utf8')).asns;
if (!Array.isArray(asWatchlist) || asWatchlist.some((asn) => !Number.isInteger(asn) || asn <= 0)) {
  throw new Error('Invalid data/as-watchlist.json');
}

const risCityCentroids = {
  RRC00: [52.3676, 4.9041], RRC01: [51.5074, -0.1278], RRC02: [48.8566, 2.3522],
  RRC03: [52.3676, 4.9041], RRC04: [46.2044, 6.1432], RRC05: [48.2082, 16.3738],
  RRC06: [35.6762, 139.6503], RRC07: [59.3293, 18.0686], RRC08: [37.3382, -121.8863],
  RRC09: [47.3769, 8.5417], RRC10: [45.4642, 9.19], RRC11: [40.7128, -74.006],
  RRC12: [50.1109, 8.6821], RRC13: [55.7558, 37.6173], RRC14: [37.4419, -122.143],
  RRC15: [-23.5505, -46.6333], RRC16: [25.7617, -80.1918], RRC18: [41.3874, 2.1686],
  RRC19: [-26.2041, 28.0473], RRC20: [47.3769, 8.5417], RRC21: [48.8566, 2.3522],
  RRC22: [44.4268, 26.1025], RRC23: [1.3521, 103.8198], RRC24: [-34.9011, -56.1645],
  RRC25: [52.3676, 4.9041], RRC26: [25.2048, 55.2708],
};

function sourceGroup(url) {
  if (url === STATUS_URL) return 'current';
  if (url.includes('rpki-monitor.antd.nist.gov') || url.includes('stat.ripe.net') || url.includes('api.cloudflare.com')) return 'medium';
  return 'daily';
}

function shouldForceSource(group) {
  if (syncProfile === 'full' || syncProfile === 'daily') return true;
  if (syncProfile === 'medium') return group === 'current' || group === 'medium';
  return group === 'current';
}

function cacheMaxAge(group) {
  if (group === 'medium') return 8 * 60 * 60 * 1000;
  if (group === 'daily') return 24 * 60 * 60 * 1000;
  return 10 * 60 * 1000;
}

function cacheUrlFor(sourceUrl, suffix = '') {
  const key = createHash('sha256').update(sourceUrl).digest('hex');
  return new URL(`${key}${suffix}.cache`, CACHE_DIRECTORY_URL);
}

async function readCachedResponse(sourceUrl, maxAgeMs) {
  const cacheUrl = cacheUrlFor(sourceUrl);
  try {
    const details = await stat(cacheUrl);
    if (Date.now() - details.mtimeMs > maxAgeMs) return null;
    cacheCounters.hits += 1;
    return await readFile(cacheUrl, 'utf8');
  } catch {
    cacheCounters.misses += 1;
    return null;
  }
}

async function writeCachedResponse(sourceUrl, body) {
  await mkdir(CACHE_DIRECTORY_URL, { recursive: true });
  const cacheUrl = cacheUrlFor(sourceUrl);
  const temporaryUrl = cacheUrlFor(sourceUrl, '.tmp');
  await writeFile(temporaryUrl, body);
  await rename(temporaryUrl, cacheUrl);
}

async function fetchText(url, bearerToken) {
  const group = sourceGroup(url);
  if (!shouldForceSource(group)) {
    const cached = await readCachedResponse(url, cacheMaxAge(group));
    if (cached != null) {
      sourceStates.set(url, { state: 'cached', lastSuccessAt: (await stat(cacheUrlFor(url))).mtime.toISOString() });
      return cached;
    }
  }
  const args = [
    '-L', '--retry', '5', '--retry-all-errors', '--retry-delay', '1', '--max-time', '45',
    '-A', 'RPKI-Global-Observatory/0.1', '-sSf',
  ];
  if (bearerToken) args.push('-H', `Authorization: Bearer ${bearerToken}`);
  args.push(url);
  try {
    const { stdout } = await execFileAsync('curl', args, { maxBuffer: 8 * 1024 * 1024 });
    validateResponse(url, stdout);
    cacheCounters.network += 1;
    await writeCachedResponse(url, stdout);
    sourceStates.set(url, { state: 'fresh', lastSuccessAt: new Date().toISOString() });
    return stdout;
  } catch (error) {
    return staleResponse(url, url, error);
  }
}

async function fetchPostText(url, body) {
  const cacheKey = `${url}\n${body}`;
  const group = sourceGroup(url);
  if (!shouldForceSource(group)) {
    const cached = await readCachedResponse(cacheKey, cacheMaxAge(group));
    if (cached != null) {
      sourceStates.set(cacheKey, { state: 'cached', lastSuccessAt: (await stat(cacheUrlFor(cacheKey))).mtime.toISOString() });
      return cached;
    }
  }
  const args = [
    '-L', '--retry', '5', '--retry-all-errors', '--retry-delay', '1', '--max-time', '45',
    '-A', 'RPKI-Global-Observatory/0.1', '-sSf', '-X', 'POST',
    '-H', 'Content-Type: application/json', '--data-binary', body, url,
  ];
  try {
    const { stdout } = await execFileAsync('curl', args, { maxBuffer: 8 * 1024 * 1024 });
    validateResponse(url, stdout);
    cacheCounters.network += 1;
    await writeCachedResponse(cacheKey, stdout);
    sourceStates.set(cacheKey, { state: 'fresh', lastSuccessAt: new Date().toISOString() });
    return stdout;
  } catch (error) {
    return staleResponse(cacheKey, url, error);
  }
}

function validateResponse(url, text) {
  if (!text.trim()) throw new Error('Empty response');
  if (url.includes(HISTORY_BASE)) {
    if (!parseHistory(text).size) throw new Error('Invalid history response');
    return;
  }
  if (url.includes('rpki-monitor.antd.nist.gov')) return; // HTML/CSV source
  const payload = JSON.parse(text);
  if (payload.success === false || payload.errors?.length || (payload.status && payload.status !== 'ok')) {
    throw new Error('Upstream returned an error response');
  }
  if (url.includes('api.asrank.caida.org') && !payload.data?.asn) throw new Error('AS Rank profile missing');
  if (url.includes('stat.ripe.net/data/') && !payload.data) throw new Error('RIPEstat data missing');
  if (url.includes('/routing-status/') && !payload.data?.announced_space) throw new Error('Routing state missing');
  if (url.includes('/rpki-history/') && !Array.isArray(payload.data?.timeseries)) throw new Error('VRP history missing');
  if (url.includes('/as-overview/') && Number(String(payload.data?.resource).replace(/^AS/i, '')) !== Number(new URL(url).searchParams.get('resource').replace(/^AS/i, ''))) throw new Error('AS identity mismatch');
}

async function staleResponse(key, url, error) {
  const message = `Source request failed: ${url} (${error.code ? `curl ${error.code}` : 'invalid response'})`;
  const previous = await readCachedResponse(key, Infinity);
  if (previous != null) {
    validateResponse(url, previous);
    const meta = { state: 'stale', lastSuccessAt: (await stat(cacheUrlFor(key))).mtime.toISOString(), attemptedAt: new Date().toISOString(), error: message };
    sourceStates.set(key, meta);
    console.warn(`${message}; retained response from ${meta.lastSuccessAt}`);
    return previous;
  }
  throw new Error(message);
}

let routeViewsRequestQueue = Promise.resolve();
let routeViewsNextRequestAt = 0;
function fetchRouteViewsText(url) {
  const request = routeViewsRequestQueue.then(async () => {
    const waitMs = Math.max(0, routeViewsNextRequestAt - Date.now());
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    const response = await fetchText(url);
    routeViewsNextRequestAt = Date.now() + 1100;
    return response;
  });
  routeViewsRequestQueue = request.catch(() => {});
  return request;
}

function parseHistory(text) {
  const rows = new Map();
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const [date, certs, roas, roaAsn, roaV4, roaV4Units, roaV6, roaV6Units] = line.trim().split(/\s+/);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !roaV6Units) continue;
    rows.set(date, {
      date,
      certs: Number(certs),
      roas: Number(roas),
      roaAsn: Number(roaAsn),
      roaV4: Number(roaV4),
      roaV4Units: Number(roaV4Units),
      roaV6: Number(roaV6),
      roaV6Units: Number(roaV6Units),
    });
  }
  return rows;
}

function lastObservationPerMonth(rows) {
  const months = new Map();
  for (const row of rows) months.set(row.date.slice(0, 7), row);
  return [...months.values()];
}

function quantile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return Math.round(sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower));
}

function prefixDistribution(peers, field) {
  const values = peers.map((peer) => Number(peer[field])).filter((value) => value > 0);
  return { p25: quantile(values, 0.25), median: quantile(values, 0.5), p75: quantile(values, 0.75) };
}

function vrpHistoryValue(row) {
  const value = row?.rpki?.vrp_count;
  if (typeof value === 'number') return value;
  return value?.last ?? value?.avg ?? value?.max ?? null;
}

function mergeAsRpkiHistory(ipv4Rows, ipv6Rows) {
  const months = new Map();
  for (const [family, rows] of [['ipv4', ipv4Rows], ['ipv6', ipv6Rows]]) {
    for (const row of rows || []) {
      const date = row.time?.slice(0, 10);
      if (!date) continue;
      months.set(date, { ...(months.get(date) || { date }), [family]: vrpHistoryValue(row) });
    }
  }
  return [...months.values()].sort((left, right) => left.date.localeCompare(right.date)).slice(-60);
}

async function fetchAsProfile(asn) {
  const base = 'https://stat.ripe.net/data';
  const asRankQuery = `query { asn(asn: "${asn}") { date asn asnName rank source cliqueMember seen country { iso } organization { orgId orgName rank country { iso } } cone { numberAsns numberPrefixes numberAddresses } asnDegree { total customer peer provider } asnLinks(first: 200, sort: "-numberPaths") { totalCount edges { node { relationship numberPaths rank asn0 { asn asnName rank } asn1 { asn asnName rank } } } } } }`;
  const previous = previousProfiles[String(asn)] || {};
  const asRankUrl = 'https://api.asrank.caida.org/v2/graphql';
  const body = JSON.stringify({ query: asRankQuery });
  const historyFallback = (family) => previous.rpkiHistory && previous.sourceStatus?.[family === 'ipv4' ? 'rpkiV4' : 'rpkiV6']?.state !== 'unavailable'
    ? { timeseries: previous.rpkiHistory.filter((row) => row[family] != null).map((row) => ({ time: row.date, rpki: { vrp_count: row[family] } })) }
    : null;
  const definitions = [
    ['overview', `${base}/as-overview/data.json?resource=AS${asn}`, previous.overview],
    ['routing', `${base}/routing-status/data.json?resource=AS${asn}`, previous.routing],
    ['rpkiV4', `${base}/rpki-history/data.json?resource=AS${asn}&family=4&resolution=m`, historyFallback('ipv4')],
    ['rpkiV6', `${base}/rpki-history/data.json?resource=AS${asn}&family=6&resolution=m`, historyFallback('ipv6')],
    ['asRank', asRankUrl, previous.asRank],
  ];
  const results = Object.fromEntries(await Promise.all(definitions.map(async ([name, url, previousValue]) => {
    const result = await loadSource({
      previous: previousValue,
      previousMeta: previous.sourceStatus?.[name],
      fallbackTime: previousProfilesTime,
      load: async () => {
        const raw = name === 'asRank' ? await fetchPostText(url, body) : await fetchText(url);
        const payload = JSON.parse(raw);
        const value = name === 'asRank' ? payload.data.asn : payload.data;
        if (name === 'overview' && Number(String(value.resource).replace(/^AS/i, '')) !== asn) throw new Error('AS identity mismatch');
        if (name === 'routing' && !value.announced_space) throw new Error('Routing state missing');
        if (name.startsWith('rpki') && !Array.isArray(value.timeseries)) throw new Error('VRP history missing');
        return { value, meta: sourceStates.get(name === 'asRank' ? `${url}\n${body}` : url) };
      },
    });
    if (['stale', 'unavailable'].includes(result.meta.state)) console.warn(`AS${asn} ${name}: ${result.meta.state}`);
    return [name, result];
  })));
  const sourceStatus = Object.fromEntries(Object.entries(results).map(([name, result]) => [name, result.meta]));
  return {
    asn,
    overview: results.overview.value,
    routing: results.routing.value,
    routingState: results.routing.value ? 'ready' : 'unavailable',
    routingError: results.routing.value ? null : 'Scheduled source unavailable',
    rpkiHistory: mergeAsRpkiHistory(results.rpkiV4.value?.timeseries, results.rpkiV6.value?.timeseries),
    asRank: results.asRank.value,
    asRankState: results.asRank.value ? 'ready' : 'unavailable',
    asRankError: results.asRank.value ? null : 'Scheduled source unavailable',
    sourceStatus,
  };
}

function routeViewsHistoryPages(previousRows) {
  const latestDate = previousRows?.at(-1)?.date;
  if (!latestDate) return 21;
  const ageDays = Math.max(0, (Date.now() - new Date(latestDate).getTime()) / 86_400_000);
  return Math.min(21, Math.max(1, Math.ceil(ageDays / 80)));
}

function extractJavaScriptArray(html, variableName) {
  const marker = `var ${variableName} = `;
  const start = html.indexOf(marker);
  if (start < 0) throw new Error(`Could not find ${variableName} in NIST response`);
  const arrayStart = start + marker.length;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = arrayStart; index < html.length; index += 1) {
    const character = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '[') depth += 1;
    else if (character === ']' && --depth === 0) return JSON.parse(html.slice(arrayStart, index + 1));
  }
  throw new Error(`Unterminated ${variableName} array in NIST response`);
}

function parseNistRov(rows, version) {
  return rows.flatMap((row) => {
    const values = row[`POV${version}`];
    if (!values || !/^\d{8}\.\d{2}$/.test(row.Time)) return [];
    const byState = Object.fromEntries(values.map((item) => [item.V, item.C]));
    const valid = byState.V || 0;
    const invalid = byState.I || 0;
    const notFound = byState.NF || 0;
    const total = valid + invalid + notFound;
    return [{
      date: `${row.Time.slice(0, 4)}-${row.Time.slice(4, 6)}-${row.Time.slice(6, 8)}T${row.Time.slice(9, 11)}:00:00Z`,
      valid, invalid, notFound, total,
      validRatio: total ? valid / total * 100 : 0,
      invalidRatio: total ? invalid / total * 100 : 0,
      notFoundRatio: total ? notFound / total * 100 : 0,
    }];
  });
}

async function fetchNistRovRows(version) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const html = await fetchText(`https://rpki-monitor.antd.nist.gov/ROV/All/${version}`);
      return extractJavaScriptArray(html, 'rovData1');
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError;
}

async function fetchRouteViewsHistory(collectorId, family, pages = 21) {
  const records = [];
  for (let pageStart = 1; pageStart <= pages; pageStart += 5) {
    const pageNumbers = Array.from({ length: Math.min(5, pages - pageStart + 1) }, (_, index) => pageStart + index);
    const responses = await Promise.all(pageNumbers.map(async (page) => JSON.parse(await fetchRouteViewsText(
      `https://api.routeviews.org/timeseries/?collector=${collectorId}&ordering=-date&page=${page}`,
    ))));
    for (const response of responses) records.push(...response.results);
  }
  const field = family === 4 ? 'ipv4_prefix_count' : 'ipv6_prefix_count';
  return lastObservationPerMonth(records
    .filter((row) => row[field] > 0)
    .map((row) => ({ date: row.date, prefixes: row[field], peers: row[family === 4 ? 'ipv4_peer_count' : 'ipv6_peer_count'] }))
    .sort((a, b) => a.date.localeCompare(b.date)));
}

function hostnameFromUri(uri) {
  try { return new URL(uri).hostname; } catch { return uri.split('/')[2] || uri; }
}

const status = JSON.parse(await fetchText(STATUS_URL));
const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN;
let cloudflare = previousOutput?.cloudflare || null;
if (cloudflareToken) {
  const dateStart = '2021-01-01T00:00:00Z';
  const dateEnd = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
  const cloudflareBase = 'https://api.cloudflare.com/client/v4/radar/bgp';
  const [coverageV4Response, coverageV6Response, spaceV4Response, spaceV6Response, aspaResponse, routeStatsResponse, hijacksResponse, leaksResponse, invalidMoasResponse] = await Promise.all([
    fetchText(`${cloudflareBase}/rpki/roas/timeseries?metric=validPfxsV4Ratio&dateStart=${encodeURIComponent(dateStart)}&dateEnd=${encodeURIComponent(dateEnd)}`, cloudflareToken),
    fetchText(`${cloudflareBase}/rpki/roas/timeseries?metric=validPfxsV6Ratio&dateStart=${encodeURIComponent(dateStart)}&dateEnd=${encodeURIComponent(dateEnd)}`, cloudflareToken),
    fetchText(`${cloudflareBase}/rpki/roas/timeseries?metric=validIpsV4Ratio&dateStart=${encodeURIComponent(dateStart)}&dateEnd=${encodeURIComponent(dateEnd)}`, cloudflareToken),
    fetchText(`${cloudflareBase}/rpki/roas/timeseries?metric=validIpsV6Ratio&dateStart=${encodeURIComponent(dateStart)}&dateEnd=${encodeURIComponent(dateEnd)}`, cloudflareToken),
    fetchText(`${cloudflareBase}/rpki/aspa/timeseries?dateStart=${encodeURIComponent(dateStart)}&dateEnd=${encodeURIComponent(dateEnd)}`, cloudflareToken),
    fetchText(`${cloudflareBase}/routes/stats`, cloudflareToken),
    fetchText(`${cloudflareBase}/hijacks/events?dateRange=7d&per_page=20&sortBy=TIME&sortOrder=DESC`, cloudflareToken),
    fetchText(`${cloudflareBase}/leaks/events?dateRange=7d&per_page=20&sortBy=TIME&sortOrder=DESC`, cloudflareToken),
    fetchText(`${cloudflareBase}/routes/moas?invalid_only=true`, cloudflareToken),
  ]);
  const coverageV4 = JSON.parse(coverageV4Response);
  const coverageV6 = JSON.parse(coverageV6Response);
  const spaceV4 = JSON.parse(spaceV4Response);
  const spaceV6 = JSON.parse(spaceV6Response);
  const aspa = JSON.parse(aspaResponse);
  const routeStats = JSON.parse(routeStatsResponse);
  const hijacks = JSON.parse(hijacksResponse);
  const leaks = JSON.parse(leaksResponse);
  const invalidMoas = JSON.parse(invalidMoasResponse);
  for (const [name, response] of Object.entries({ coverageV4, coverageV6, spaceV4, spaceV6, aspa, routeStats, hijacks, leaks, invalidMoas })) {
    if (!response.success) throw new Error(`Cloudflare Radar request failed: ${name}: ${JSON.stringify(response.errors)}`);
  }
  const mergeFamilySeries = (v4Response, v6Response, multiplier = 1) => {
    const months = new Map();
    for (const [family, response] of [['ipv4', v4Response], ['ipv6', v6Response]]) {
      const series = response.result.serie_0;
      series.timestamps.forEach((timestamp, index) => {
        const month = timestamp.slice(0, 7);
        months.set(month, { ...(months.get(month) || { date: timestamp.slice(0, 10) }), [family]: Number(series.values[index]) * multiplier });
      });
    }
    return [...months.values()].filter((row) => Number.isFinite(row.ipv4) && Number.isFinite(row.ipv6)).sort((a, b) => a.date.localeCompare(b.date));
  };
  const aspaSeries = aspa.result.serie_0;
  const aspaMonths = new Map();
  aspaSeries.timestamps.forEach((timestamp, index) => aspaMonths.set(timestamp.slice(0, 7), { date: timestamp.slice(0, 10), count: Number(aspaSeries.values[index]) }));
  cloudflare = {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ? 'configured' : 'not-configured',
    coverage: mergeFamilySeries(coverageV4, coverageV6, 100),
    addressSpaceCoverage: mergeFamilySeries(spaceV4, spaceV6, 100),
    coverageDataTime: coverageV4.result.meta.dataTime,
    aspa: [...aspaMonths.values()].sort((a, b) => a.date.localeCompare(b.date)),
    aspaDataTime: aspa.result.meta.dataTime,
    routeStats: routeStats.result,
    anomalies: {
      hijacks: hijacks.result.events.slice(0, 20),
      hijackAsnInfo: hijacks.result.asn_info,
      hijackResultInfo: hijacks.result_info,
      totalMonitors: hijacks.result.total_monitors,
      leaks: leaks.result.events.slice(0, 20),
      leakAsnInfo: leaks.result.asn_info,
      leakResultInfo: leaks.result_info,
      invalidMoas: invalidMoas.result.moas.slice(0, 100),
      invalidMoasMeta: invalidMoas.result.meta,
    },
  };
}
const routeViewsPages = routeViewsHistoryPages(previousOutput?.bgp?.routeViews);
const [nistV4Rows, nistV6Rows, routeViewsV4, routeViewsV6, routeViewsCollectorsResponse, routeViewsRibCollectorsResponse, routeViewsLatestTimeseriesResponse, risRrcInfoResponse, risPeersResponse] = await Promise.all([
  fetchNistRovRows(4),
  fetchNistRovRows(6),
  fetchRouteViewsHistory(3, 4, routeViewsPages),
  fetchRouteViewsHistory(6, 6, routeViewsPages),
  fetchRouteViewsText('https://api.routeviews.org/collector/?page_size=200'),
  fetchRouteViewsText('https://api.routeviews.org/rib/collectors'),
  fetchRouteViewsText('https://api.routeviews.org/timeseries/?ordering=-date&page_size=200'),
  fetchText('https://stat.ripe.net/data/rrc-info/data.json'),
  fetchText('https://stat.ripe.net/data/ris-peers/data.json'),
]);
const routeViewsCollectorPayload = JSON.parse(routeViewsCollectorsResponse);
const routeViewsRibCollectors = JSON.parse(routeViewsRibCollectorsResponse);
const routeViewsLatestTimeseries = JSON.parse(routeViewsLatestTimeseriesResponse);
const risRrcPayload = JSON.parse(risRrcInfoResponse);
const risPeersPayload = JSON.parse(risPeersResponse);
const latestRouteViewsStats = new Map();
for (const row of routeViewsLatestTimeseries.results || []) {
  const previous = latestRouteViewsStats.get(row.collector);
  if (!previous || row.date > previous.date) latestRouteViewsStats.set(row.collector, row);
}
const routeViewsCollectors = routeViewsCollectorPayload.results.map((collector) => ({
  name: collector.name,
  label: collector.label,
  type: collector.type,
  latitude: Number(collector.lat),
  longitude: Number(collector.lng),
  country: collector.country,
  rirRegion: collector.rir_region,
  ipv4: String(collector.ipv4 || '').split(',').map((address) => address.trim()).filter(Boolean).join(', '),
  ipv6: String(collector.ipv6 || '').split(',').map((address) => address.trim()).filter(Boolean).join(', '),
  bmp: Boolean(collector.bmp),
  rpki: Boolean(collector.rpki),
  ixSpeedMbps: collector.ix_speed,
  multihop: Boolean(collector.multihop),
  installed: collector.installed,
  removed: collector.removed,
  scamper: Boolean(collector.scamper),
  notRetired: collector.removed == null,
  ...(() => {
    const stats = latestRouteViewsStats.get(collector.name) || latestRouteViewsStats.get(collector.label);
    return { latestStats: stats ? {
      observedAt: stats.date,
      ipv4Peers: stats.ipv4_peer_count,
      ipv6Peers: stats.ipv6_peer_count,
      ipv4Prefixes: stats.ipv4_prefix_count,
      ipv6Prefixes: stats.ipv6_prefix_count,
      ipv4RibRoutes: stats.ipv4_rib_count,
      ipv6RibRoutes: stats.ipv6_rib_count,
    } : null };
  })(),
}));
const risSnapshotPeers = risPeersPayload.data.peers || {};
const risCollectors = risRrcPayload.data.rrcs.map((rrc) => ({
  id: rrc.id,
  name: rrc.name,
  geographicalLocation: rrc.geographical_location,
  topologicalLocation: rrc.topological_location,
  multihop: rrc.multihop,
  activatedOn: rrc.activated_on,
  deactivatedOn: rrc.deactivated_on || null,
  notDeactivated: !rrc.deactivated_on,
  latitude: risCityCentroids[rrc.name]?.[0] ?? null,
  longitude: risCityCentroids[rrc.name]?.[1] ?? null,
  coordinateBasis: risCityCentroids[rrc.name] ? 'approximate city centroid from official geographical_location' : null,
  ...(() => {
    const peers = risSnapshotPeers[`rrc${String(rrc.id).padStart(2, '0')}`] || [];
    return {
      peers: peers.length,
      uniquePeerAsns: new Set(peers.map((peer) => String(peer.asn))).size,
      ipv4Peers: peers.filter((peer) => peer.v4_prefix_count > 0).length,
      ipv6Peers: peers.filter((peer) => peer.v6_prefix_count > 0).length,
      prefixesPerPeer: {
        ipv4: prefixDistribution(peers, 'v4_prefix_count'),
        ipv6: prefixDistribution(peers, 'v6_prefix_count'),
      },
    };
  })(),
}));
const allRisSnapshotPeers = Object.values(risSnapshotPeers).flat();
const asProfiles = Object.fromEntries(await Promise.all(asWatchlist.map(async (asn) => [String(asn), await fetchAsProfile(asn)])));
const nistV4 = lastObservationPerMonth(parseNistRov(nistV4Rows, 4));
const nistV6 = lastObservationPerMonth(parseNistRov(nistV6Rows, 6));
const nistMonths = new Map(nistV4.map((row) => [row.date.slice(0, 7), { date: row.date.slice(0, 10), ipv4: row }]));
for (const row of nistV6) {
  const month = row.date.slice(0, 7);
  nistMonths.set(month, { ...(nistMonths.get(month) || { date: row.date.slice(0, 10) }), ipv6: row });
}
const routeViewsMonths = new Map((previousOutput?.bgp?.routeViews || []).map((row) => [row.date.slice(0, 7), { ...row }]));
for (const row of routeViewsV4) {
  const month = row.date.slice(0, 7);
  routeViewsMonths.set(month, { ...(routeViewsMonths.get(month) || {}), date: row.date.slice(0, 10), ipv4: row.prefixes, ipv4Peers: row.peers });
}
for (const row of routeViewsV6) {
  const month = row.date.slice(0, 7);
  routeViewsMonths.set(month, { ...(routeViewsMonths.get(month) || { date: row.date.slice(0, 10) }), ipv6: row.prefixes, ipv6Peers: row.peers });
}
const histories = {};
for (const [rir, filename] of Object.entries(historyFiles)) {
  histories[rir] = parseHistory(await fetchText(`${HISTORY_BASE}/${filename}`));
}

const commonDates = [...histories.RIPE.keys()].filter((date) => Object.values(histories).every((rows) => rows.has(date)));
const globalDaily = commonDates.map((date) => {
  const observations = Object.values(histories).map((rows) => rows.get(date));
  return observations.reduce((total, row) => ({
    date,
    certs: total.certs + row.certs,
    roas: total.roas + row.roas,
    roaV4: total.roaV4 + row.roaV4,
    roaV4Units: total.roaV4Units + row.roaV4Units,
    roaV6: total.roaV6 + row.roaV6,
    roaV6Units: total.roaV6Units + row.roaV6Units,
  }), { certs: 0, roas: 0, roaV4: 0, roaV4Units: 0, roaV6: 0, roaV6Units: 0 });
});

const rirHistory = Object.fromEntries(Object.entries(histories).map(([rir, rows]) => [rir, lastObservationPerMonth([...rows.values()])]));
const tals = Object.fromEntries(Object.entries(status.tals).map(([name, tal]) => [name.toUpperCase(), {
  validCACerts: tal.validCACerts,
  invalidCerts: tal.invalidCerts,
  validROAs: tal.validROAs,
  invalidROAs: tal.invalidROAs,
  vrpsFinal: tal.vrpsFinal,
  vrpsV4: tal.payload.routeOriginsIPv4.final,
  vrpsV6: tal.payload.routeOriginsIPv6.final,
  validASPAs: tal.validASPAs,
  aspasFinal: tal.payload.aspas.final,
  validPublicationPoints: tal.validPublicationPoints,
  rejectedPublicationPoints: tal.rejectedPublicationPoints,
  validManifests: tal.validManifests,
  invalidManifests: tal.invalidManifests,
  staleManifests: tal.staleManifests,
  missingManifests: tal.missingManifests,
} ]));

const repositories = Object.entries(status.repositories).map(([uri, repository]) => ({
  uri,
  hostname: hostnameFromUri(uri),
  type: repository.type,
  vrpsFinal: repository.vrpsFinal,
  validROAs: repository.validROAs,
  validCACerts: repository.validCACerts,
  validPublicationPoints: repository.validPublicationPoints,
})).sort((a, b) => b.vrpsFinal - a.vrpsFinal);

const rrdp = Object.entries(status.rrdp || {}).map(([uri, item]) => ({ uri, hostname: hostnameFromUri(uri), status: item.status, duration: item.duration }));
const rsync = Object.entries(status.rsync || {}).map(([uri, item]) => ({ uri, hostname: hostnameFromUri(uri), status: item.status, duration: item.duration }));
const talValues = Object.values(tals);
const sum = (field) => talValues.reduce((total, tal) => total + tal[field], 0);

const output = {
  provenance: {
    generatedAt: new Date().toISOString(),
    syncProfile,
    cache: { ...cacheCounters },
    sourceFailures: [...sourceStates.entries()].filter(([, meta]) => meta.state === 'stale').map(([key, meta]) => ({ source: key.split('\n')[0], ...meta })),
    asSourceFailures: Object.values(asProfiles).flatMap((profile) => Object.entries(profile.sourceStatus).filter(([, meta]) => ['stale', 'unavailable'].includes(meta.state)).map(([source, meta]) => ({ asn: profile.asn, source, ...meta }))),
    currentSource: STATUS_URL,
    historySource: `${HISTORY_BASE}/{rir}.tal.txt`,
    historyDescription: 'RIPE NCC RIR Trust Anchor Statistics; monthly points are the last available daily observation in each calendar month.',
    nistSource: 'https://rpki-monitor.antd.nist.gov/ROV/All/{4,6}',
    routeViewsSource: 'https://api.routeviews.org/timeseries/ (collectors route-views2 and route-views6)',
  },
  current: {
    observedAt: status.now,
    lastUpdateStart: status.lastUpdateStart,
    lastUpdateDone: status.lastUpdateDone,
    lastUpdateDuration: status.lastUpdateDuration,
    version: status.version,
    serial: status.serial,
    totals: {
      validCACerts: sum('validCACerts'),
      invalidCerts: sum('invalidCerts'),
      validROAs: sum('validROAs'),
      invalidROAs: sum('invalidROAs'),
      vrpsFinal: status.payload.routeOriginsIPv4.final + status.payload.routeOriginsIPv6.final,
      vrpsV4: status.payload.routeOriginsIPv4.final,
      vrpsV6: status.payload.routeOriginsIPv6.final,
      aspasFinal: status.payload.aspas.final,
      routerKeysFinal: status.payload.routerKeys.final,
      validPublicationPoints: sum('validPublicationPoints'),
      rejectedPublicationPoints: sum('rejectedPublicationPoints'),
      missingManifests: sum('missingManifests'),
      staleManifests: sum('staleManifests'),
      repositoryEndpoints: repositories.length,
      distinctFqdns: new Set(repositories.map((item) => item.hostname)).size,
      rrdpAttempts: rrdp.length,
      rrdpSuccessful: rrdp.filter((item) => item.status >= 200 && item.status < 400).length,
      rsyncAttempts: rsync.length,
      rsyncSuccessful: rsync.filter((item) => item.status === 0).length,
    },
    tals,
    repositories,
    retrieval: { rrdp, rsync },
  },
  history: {
    global: lastObservationPerMonth(globalDaily),
    byRir: rirHistory,
  },
  bgp: {
    routeViews: [...routeViewsMonths.values()].filter((row) => row.ipv4 && row.ipv6).sort((a, b) => a.date.localeCompare(b.date)),
    nistRov: [...nistMonths.values()].filter((row) => row.ipv4 && row.ipv6).sort((a, b) => a.date.localeCompare(b.date)),
  },
  cloudflare,
  collectors: {
    routeViews: {
      source: 'https://api.routeviews.org/collector/',
      currentRibApiSource: 'https://api.routeviews.org/rib/collectors',
      latestStatsSource: 'https://api.routeviews.org/timeseries/?ordering=-date',
      entries: routeViewsCollectors,
      currentRibApiCollectors: routeViewsRibCollectors,
    },
    ripeRis: {
      source: 'https://stat.ripe.net/data/rrc-info/data.json',
      peersSource: 'https://stat.ripe.net/data/ris-peers/data.json',
      latestTime: risPeersPayload.data.latest_time,
      earliestTime: risPeersPayload.data.earliest_time,
      queryTime: risPeersPayload.data.parameters?.query_time || risPeersPayload.data.latest_time,
      peerSnapshot: {
        peerRecords: allRisSnapshotPeers.length,
        uniquePeerAsns: new Set(allRisSnapshotPeers.map((peer) => String(peer.asn))).size,
        ipv4PeerRecords: allRisSnapshotPeers.filter((peer) => peer.v4_prefix_count > 0).length,
        ipv6PeerRecords: allRisSnapshotPeers.filter((peer) => peer.v6_prefix_count > 0).length,
      },
      entries: risCollectors,
    },
  },
  asProfiles: {
    source: 'RIPEstat AS APIs and https://api.asrank.caida.org/v2/graphql',
    cachePolicy: 'medium profile: 8 hours; arbitrary ASNs are queried on demand by the frontend',
    watchlist: asWatchlist,
    asset: 'data/as-watchlist-profiles.json',
  },
};

function assertEqual(label, actual, expected) {
  if (actual !== expected) throw new Error(`Data invariant failed: ${label}: ${actual} !== ${expected}`);
}

assertEqual('valid CA certificate total', sum('validCACerts'), output.current.totals.validCACerts);
assertEqual('ROA total', sum('validROAs'), output.current.totals.validROAs);
assertEqual('publication point total', sum('validPublicationPoints'), output.current.totals.validPublicationPoints);
assertEqual('rejected publication point total', sum('rejectedPublicationPoints'), output.current.totals.rejectedPublicationPoints);
assertEqual('VRP address-family total', output.current.totals.vrpsV4 + output.current.totals.vrpsV6, output.current.totals.vrpsFinal);
assertEqual('VRP trust-anchor total', Object.values(tals).reduce((total, tal) => total + tal.vrpsFinal, 0), output.current.totals.vrpsFinal);
assertEqual('ASPA trust-anchor total', Object.values(tals).reduce((total, tal) => total + tal.aspasFinal, 0), output.current.totals.aspasFinal);
assertEqual('repository count', repositories.length, output.current.totals.repositoryEndpoints);
assertEqual('repository VRP total', repositories.reduce((total, repository) => total + repository.vrpsFinal, 0), output.current.totals.vrpsFinal);
assertEqual('RRDP attempt count', rrdp.length, output.current.totals.rrdpAttempts);
assertEqual('rsync attempt count', rsync.length, output.current.totals.rsyncAttempts);
if (!output.history.global.length || output.history.global.some((row) => !/^\d{4}-\d{2}-\d{2}$/.test(row.date))) {
  throw new Error('Data invariant failed: invalid or empty global history');
}
if (!output.bgp.routeViews.length || output.bgp.routeViews.some((row) => row.ipv4 <= 0 || row.ipv6 <= 0)) {
  throw new Error('Data invariant failed: invalid or empty RouteViews prefix history');
}
if (!output.bgp.nistRov.length || output.bgp.nistRov.some((row) => Math.abs(row.ipv4.valid + row.ipv4.invalid + row.ipv4.notFound - row.ipv4.total) > 0 || Math.abs(row.ipv6.valid + row.ipv6.invalid + row.ipv6.notFound - row.ipv6.total) > 0)) {
  throw new Error('Data invariant failed: invalid or empty NIST ROV history');
}
if (!output.cloudflare) {
  throw new Error('Data invariant failed: Cloudflare data is unavailable; configure CLOUDFLARE_API_TOKEN or retain a previous generated snapshot');
}
if (!output.cloudflare.coverage.length || !output.cloudflare.addressSpaceCoverage.length || !output.cloudflare.aspa.length || !output.cloudflare.routeStats.stats || !output.cloudflare.anomalies) {
  throw new Error('Data invariant failed: invalid Cloudflare Radar response');
}
if (!output.collectors.routeViews.entries.length || !output.collectors.ripeRis.entries.length) {
  throw new Error('Data invariant failed: empty BGP collector inventory');
}
if (!output.collectors.routeViews.currentRibApiCollectors.length || !output.collectors.ripeRis.queryTime) {
  throw new Error('Data invariant failed: missing collector-subset or RIS snapshot metadata');
}
if (!latestRouteViewsStats.size || routeViewsCollectors.filter((collector) => collector.notRetired && collector.latestStats).length < 40) {
  throw new Error('Data invariant failed: insufficient latest RouteViews collector statistics');
}
if (Object.keys(asProfiles).length !== asWatchlist.length) {
  throw new Error('Data invariant failed: incomplete AS watchlist profiles');
}
assertEqual('RIS peer records by RRC', risCollectors.reduce((total, collector) => total + collector.peers, 0), allRisSnapshotPeers.length);
if (output.collectors.ripeRis.peerSnapshot.uniquePeerAsns > output.collectors.ripeRis.peerSnapshot.peerRecords) {
  throw new Error('Data invariant failed: unique RIS peer ASNs exceed peer records');
}

await mkdir(new URL('../src/generated/', import.meta.url), { recursive: true });
await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
await writeFile(AS_PROFILES_TEMP_URL, `${JSON.stringify({ generatedAt: output.provenance.generatedAt, watchlist: asWatchlist, byAsn: asProfiles })}\n`);
await rename(AS_PROFILES_TEMP_URL, AS_PROFILES_PUBLIC_URL);
await writeFile(GENERATED_TEMP_URL, `${JSON.stringify(output, null, 2)}\n`);
await rename(GENERATED_TEMP_URL, GENERATED_URL);
await mkdir(new URL('../.cache/snapshots/', import.meta.url), { recursive: true });
await writeFile(new URL('./as-profiles.json.tmp', LAST_AS_PROFILES_URL), JSON.stringify({ generatedAt: output.provenance.generatedAt, byAsn: asProfiles }));
await rename(new URL('./as-profiles.json.tmp', LAST_AS_PROFILES_URL), LAST_AS_PROFILES_URL);
const failures = output.provenance.sourceFailures.length + output.provenance.asSourceFailures.length;
if (failures) console.warn(`::warning::Snapshot refreshed with ${failures} source fallback/unavailable records; see data provenance for retained timestamps.`);
console.log(`Wrote ${output.history.global.length} RPKI, ${output.bgp.routeViews.length} BGP, ${output.bgp.nistRov.length} NIST ROV, and ${output.cloudflare?.coverage.length || 0} Cloudflare coverage observations; collector inventories: RouteViews ${routeViewsCollectors.length}, RIPE RIS ${risCollectors.length}; profile ${syncProfile}, cache ${cacheCounters.hits} hit(s), ${cacheCounters.network} network request(s).`);
