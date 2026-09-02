import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Database,
  Info,
  Network,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatNumber } from '../data';
import AsRelationshipGraph from './AsRelationshipGraph';

const CACHE_TTL_MS = 8 * 60 * 60 * 1000;
const STATIC_ONLY = import.meta.env.VITE_STATIC_ONLY === 'true';
const EXAMPLE_ASNS = [13335, 15169, 4134, 3356];
const EXAMPLE_ORGANIZATIONS = ['Cloudflare', 'Google', 'China Telecom', 'Lumen'];
const ORGANIZATION_SEARCH_QUERY = `query SearchOrganizations($name: String!) { organizations(first: 8, name: $name) { totalCount edges { node { date orgId orgName rank seen country { iso } cone { numberAsns numberPrefixes numberAddresses } asnDegree { total customer peer provider } } } } }`;
const ORGANIZATION_DETAIL_QUERY = `query Organization($orgId: String!) { organization(orgId: $orgId) { date orgId orgName rank seen source country { iso } cone { numberAsns numberPrefixes numberAddresses } asnDegree { total customer peer provider } members { numberAsns numberAsnsSeen asns(first: 20, sort: "rank") { edges { node { asn asnName rank source country { iso } } } } } } }`;
let watchlistProfilesPromise;

function fetchWatchlistProfiles() {
  if (!watchlistProfilesPromise) {
    watchlistProfilesPromise = fetch(`${import.meta.env.BASE_URL}data/as-watchlist-profiles.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`AS watchlist: HTTP ${response.status}`);
        return response.json();
      });
  }
  return watchlistProfilesPromise;
}

function normalizeAsn(value) {
  const normalized = String(value).trim().toUpperCase().replace(/^AS/, '');
  if (!/^\d+$/.test(normalized)) return null;
  const asn = Number(normalized);
  return Number.isSafeInteger(asn) && asn > 0 && asn <= 4_294_967_295 ? asn : null;
}

function readCache(key) {
  try {
    const cached = JSON.parse(localStorage.getItem(key));
    return cached && Date.now() - cached.savedAt < CACHE_TTL_MS ? cached.value : null;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value }));
  } catch {
    // The page still works when storage is unavailable or full.
  }
}

async function fetchRipeStat(call, asn, extra = '', signal) {
  const response = await fetch(`https://stat.ripe.net/data/${call}/data.json?resource=AS${asn}${extra}`, { signal });
  if (!response.ok) throw new Error(`RIPEstat ${call}: HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.status !== 'ok' || !payload.data) throw new Error(`RIPEstat ${call}: invalid response`);
  return payload.data;
}

async function fetchAsRankGraphql(query, variables = {}, signal) {
  const response = await fetch(`${import.meta.env.BASE_URL}api/asrank`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  if (!response.ok) throw new Error(`CAIDA AS Rank: HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.errors?.length || !payload.data) throw new Error(`CAIDA AS Rank: ${payload.errors?.[0]?.message || 'invalid response'}`);
  return payload.data;
}

async function fetchAsRankProfile(asn, signal) {
  const query = `query { asn(asn: "${asn}") { date asn asnName rank source cliqueMember seen country { iso } organization { orgId orgName rank country { iso } } cone { numberAsns numberPrefixes numberAddresses } asnDegree { total customer peer provider } asnLinks(first: 200, sort: "-numberPaths") { totalCount edges { node { relationship numberPaths rank asn0 { asn asnName rank } asn1 { asn asnName rank } } } } } }`;
  const data = await fetchAsRankGraphql(query, {}, signal);
  return data.asn;
}

async function withTimeout(loader, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await loader(controller.signal);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function requestErrorLabel(error, language) {
  if (error?.name === 'AbortError') return language === 'zh' ? '上游接口响应超时，请稍后重试。' : 'The upstream API timed out; try again later.';
  return error?.message || (language === 'zh' ? '未知请求错误' : 'Unknown request error');
}

function vrpValue(row) {
  const value = row?.rpki?.vrp_count;
  if (value == null) return null;
  if (typeof value === 'number') return value;
  return value.last ?? value.avg ?? value.max ?? null;
}

function mergeRpkiHistory(ipv4Rows, ipv6Rows) {
  const months = new Map();
  for (const [family, rows] of [['ipv4', ipv4Rows], ['ipv6', ipv6Rows]]) {
    for (const row of rows || []) {
      const date = row.time?.slice(0, 10);
      if (!date) continue;
      months.set(date, { ...(months.get(date) || { date }), [family]: vrpValue(row) });
    }
  }
  return [...months.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function AsTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tooltip"><div className="tooltip-label">{label}</div>{payload.map((item) => <div className="tooltip-row" key={item.dataKey}><span className="tooltip-key"><i style={{ background: item.color }} />{item.name}</span><strong>{formatNumber(item.value)}</strong></div>)}</div>;
}

function ExternalAsLinks({ asn, language }) {
  if (!asn) return null;
  const links = [
    ['RIPEstat', `https://stat.ripe.net/AS${asn}`],
    ['CAIDA AS Rank', `https://asrank.caida.org/asns/${asn}`],
    ['PeeringDB', `https://www.peeringdb.com/asn/${asn}`],
    ['RouteViews API', `https://api.routeviews.org/asn/${asn}`],
    ['Cloudflare Radar', `https://radar.cloudflare.com/routing/as${asn}`],
    ['BGP.tools', `https://bgp.tools/as/${asn}`],
    ['HE BGP Toolkit', `https://bgp.he.net/AS${asn}`],
  ];
  return <nav className="as-external-links" aria-label={language === 'zh' ? `AS${asn} 外部数据源` : `External data sources for AS${asn}`}><span>{language === 'zh' ? `外部查询 · AS${asn}` : `External lookups · AS${asn}`}</span><div>{links.map(([label, href]) => <a key={label} href={href} target="_blank" rel="noreferrer">{label}<ArrowUpRight size={12} /></a>)}</div></nav>;
}

export default function AsProfile({ language }) {
  const [queryMode, setQueryMode] = useState('asn');
  const [query, setQuery] = useState('13335');
  const [activeAsn, setActiveAsn] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [neighbours, setNeighbours] = useState(null);
  const [neighboursLoading, setNeighboursLoading] = useState(false);
  const [organizationResults, setOrganizationResults] = useState(null);
  const [organizationProfile, setOrganizationProfile] = useState(null);
  const [organizationLoading, setOrganizationLoading] = useState(false);
  const [watchlistProfiles, setWatchlistProfiles] = useState(null);
  const requestSequence = useRef(0);
  const compact = useMemo(() => new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en', { notation: 'compact', maximumFractionDigits: 1 }), [language]);
  const formatTime = (value) => {
    if (!value) return '—';
    const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`;
    return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-GB', { timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(normalized));
  };

  const loadProfile = async (asn, force = false, profileSource = watchlistProfiles || {}) => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError('');
    setNeighbours(null);
    setActiveAsn(asn);
    setQuery(String(asn));
    const cacheKey = `rpki-observatory:as-profile:v1:${asn}`;
    const cached = force ? null : readCache(cacheKey);
    if (cached) {
      setProfile(cached);
      setLoading(false);
      return;
    }
    const preloaded = force ? null : profileSource[String(asn)];
    if (preloaded) {
      setProfile({ ...preloaded, source: 'scheduled-snapshot' });
      setLoading(false);
      return;
    }
    const routingPromise = withTimeout((signal) => fetchRipeStat('routing-status', asn, '', signal), 60_000)
      .then((routing) => ({ ok: true, routing }))
      .catch((routingError) => ({ ok: false, routingError }));
    const asRankPromise = STATIC_ONLY
      ? Promise.resolve({ ok: false, asRankError: new Error(language === 'zh' ? 'GitHub Pages 静态模式仅提供 watchlist 中预取的 CAIDA 数据。' : 'GitHub Pages static mode only includes pre-fetched CAIDA data for watchlist ASNs.') })
      : withTimeout((signal) => fetchAsRankProfile(asn, signal), 25_000)
        .then((asRank) => ({ ok: true, asRank }))
        .catch((asRankError) => ({ ok: false, asRankError }));
    try {
      const [overviewResult, rpkiV4Result, rpkiV6Result] = await Promise.allSettled([
        withTimeout((signal) => fetchRipeStat('as-overview', asn, '', signal), 20_000),
        withTimeout((signal) => fetchRipeStat('rpki-history', asn, '&family=4&resolution=m', signal), 20_000),
        withTimeout((signal) => fetchRipeStat('rpki-history', asn, '&family=6&resolution=m', signal), 20_000),
      ]);
      if (overviewResult.status !== 'fulfilled') throw overviewResult.reason;
      const rpkiV4 = rpkiV4Result.status === 'fulfilled' ? rpkiV4Result.value : null;
      const rpkiV6 = rpkiV6Result.status === 'fulfilled' ? rpkiV6Result.value : null;
      const value = {
        asn,
        overview: overviewResult.value,
        routing: null,
        routingState: 'loading',
        routingError: null,
        rpkiHistory: mergeRpkiHistory(rpkiV4?.timeseries, rpkiV6?.timeseries),
        asRank: null,
        asRankState: 'loading',
        asRankError: null,
        missingSources: [rpkiV4 ? null : 'RPKI IPv4', rpkiV6 ? null : 'RPKI IPv6'].filter(Boolean),
        fetchedAt: new Date().toISOString(),
      };
      if (sequence === requestSequence.current) {
        setProfile(value);
        setLoading(false);
      }
      asRankPromise.then((asRankResult) => {
        if (sequence !== requestSequence.current) return;
        setProfile((currentProfile) => {
          if (!currentProfile || currentProfile.asn !== asn) return currentProfile;
          const updated = asRankResult.ok
            ? { ...currentProfile, asRank: asRankResult.asRank, asRankState: 'ready', asRankError: null }
            : { ...currentProfile, asRankState: 'unavailable', asRankError: requestErrorLabel(asRankResult.asRankError, language) };
          if (updated.routing) writeCache(cacheKey, updated);
          return updated;
        });
      });
      routingPromise.then((routingResult) => {
        if (sequence !== requestSequence.current) return;
        setProfile((currentProfile) => {
          if (!currentProfile || currentProfile.asn !== asn) return currentProfile;
          const updated = routingResult.ok
            ? { ...currentProfile, routing: routingResult.routing, routingState: 'ready', routingError: null }
            : { ...currentProfile, routingState: 'unavailable', routingError: requestErrorLabel(routingResult.routingError, language) };
          if (updated.routing) writeCache(cacheKey, updated);
          return updated;
        });
      });
    } catch (requestError) {
      if (sequence === requestSequence.current) {
        setProfile(null);
        setError(language === 'zh' ? `无法加载 AS${asn} 的基础身份信息：${requestErrorLabel(requestError, language)}` : `Could not load the identity for AS${asn}: ${requestErrorLabel(requestError, language)}`);
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  };

  const retryRoutingStatus = async () => {
    if (!profile?.asn) return;
    const asn = profile.asn;
    const sequence = requestSequence.current;
    setProfile((currentProfile) => ({ ...currentProfile, routingState: 'loading', routingError: null }));
    try {
      const routing = await withTimeout((signal) => fetchRipeStat('routing-status', asn, '', signal), 65_000);
      if (sequence !== requestSequence.current) return;
      setProfile((currentProfile) => {
        const completeValue = { ...currentProfile, routing, routingState: 'ready', routingError: null };
        writeCache(`rpki-observatory:as-profile:v1:${asn}`, completeValue);
        return completeValue;
      });
    } catch (requestError) {
      if (sequence === requestSequence.current) setProfile((currentProfile) => ({ ...currentProfile, routingState: 'unavailable', routingError: requestErrorLabel(requestError, language) }));
    }
  };

  const retryAsRank = async () => {
    if (!profile?.asn || STATIC_ONLY) return;
    const asn = profile.asn;
    const sequence = requestSequence.current;
    setProfile((currentProfile) => ({ ...currentProfile, asRankState: 'loading', asRankError: null }));
    try {
      const asRank = await withTimeout((signal) => fetchAsRankProfile(asn, signal), 30_000);
      if (sequence !== requestSequence.current) return;
      setProfile((currentProfile) => {
        const updated = { ...currentProfile, asRank, asRankState: 'ready', asRankError: null };
        if (updated.routing) writeCache(`rpki-observatory:as-profile:v1:${asn}`, updated);
        return updated;
      });
    } catch (requestError) {
      if (sequence === requestSequence.current) setProfile((currentProfile) => ({ ...currentProfile, asRankState: 'unavailable', asRankError: requestErrorLabel(requestError, language) }));
    }
  };

  useEffect(() => {
    let mounted = true;
    fetchWatchlistProfiles()
      .then((payload) => {
        if (!mounted) return;
        const profiles = payload.byAsn || {};
        setWatchlistProfiles(profiles);
        loadProfile(13335, false, profiles);
      })
      .catch(() => mounted && loadProfile(13335));
    return () => { mounted = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const searchOrganizations = async (name) => {
    if (STATIC_ONLY) {
      setError(language === 'zh' ? 'GitHub Pages 是纯静态托管，不支持任意组织查询；固定 ASN watchlist 仍可正常使用。' : 'GitHub Pages is static hosting and cannot provide arbitrary organization queries; the fixed ASN watchlist remains available.');
      return;
    }
    const normalized = name.trim();
    if (normalized.length < 2) {
      setError(language === 'zh' ? '组织名称至少输入 2 个字符。' : 'Enter at least two characters for an organization name.');
      return;
    }
    setOrganizationLoading(true);
    setOrganizationResults(null);
    setOrganizationProfile(null);
    setError('');
    const cacheKey = `rpki-observatory:organization-search:v1:${normalized.toLowerCase()}`;
    const cached = readCache(cacheKey);
    if (cached) {
      setOrganizationResults(cached);
      setOrganizationLoading(false);
      return;
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const data = await fetchAsRankGraphql(ORGANIZATION_SEARCH_QUERY, { name: normalized }, controller.signal);
      const value = { totalCount: data.organizations.totalCount, entries: data.organizations.edges.map((edge) => edge.node) };
      writeCache(cacheKey, value);
      setOrganizationResults(value);
    } catch (requestError) {
      setError(language === 'zh' ? `组织查询失败：${requestError.message}` : `Organization search failed: ${requestError.message}`);
    } finally {
      window.clearTimeout(timeoutId);
      setOrganizationLoading(false);
    }
  };

  const loadOrganization = async (orgId) => {
    setOrganizationLoading(true);
    setError('');
    const cacheKey = `rpki-observatory:organization-profile:v1:${orgId}`;
    const cached = readCache(cacheKey);
    if (cached) {
      setOrganizationProfile(cached);
      setOrganizationLoading(false);
      return;
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const data = await fetchAsRankGraphql(ORGANIZATION_DETAIL_QUERY, { orgId }, controller.signal);
      writeCache(cacheKey, data.organization);
      setOrganizationProfile(data.organization);
    } catch (requestError) {
      setError(language === 'zh' ? `组织详情加载失败：${requestError.message}` : `Organization detail failed: ${requestError.message}`);
    } finally {
      window.clearTimeout(timeoutId);
      setOrganizationLoading(false);
    }
  };

  const switchQueryMode = (mode) => {
    setQueryMode(mode);
    setQuery(mode === 'asn' ? '13335' : 'Cloudflare');
    setError('');
    setOrganizationResults(null);
    setOrganizationProfile(null);
  };

  const submit = (event) => {
    event.preventDefault();
    if (queryMode === 'organization') {
      searchOrganizations(query);
      return;
    }
    const asn = normalizeAsn(query);
    if (!asn) {
      setError(language === 'zh' ? '请输入有效的 1–4294967295 范围内 ASN。' : 'Enter a valid ASN between 1 and 4294967295.');
      return;
    }
    loadProfile(asn);
  };

  const openAsn = (asn) => {
    setQueryMode('asn');
    loadProfile(asn);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const loadNeighbours = async (force = false) => {
    if (!activeAsn) return;
    setNeighboursLoading(true);
    const cacheKey = `rpki-observatory:as-neighbours:v1:${activeAsn}`;
    const cached = force ? null : readCache(cacheKey);
    if (cached) {
      setNeighbours(cached);
      setNeighboursLoading(false);
      return;
    }
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 20_000);
      const value = await fetchRipeStat('asn-neighbours', activeAsn, '&lod=1', controller.signal).finally(() => window.clearTimeout(timeoutId));
      writeCache(cacheKey, value);
      setNeighbours(value);
    } catch (requestError) {
      setError(language === 'zh' ? `邻居数据加载失败：${requestError.message}` : `Neighbour data failed: ${requestError.message}`);
    } finally {
      setNeighboursLoading(false);
    }
  };

  const latestRpki = profile?.rpkiHistory?.at(-1);
  const chartData = profile?.rpkiHistory?.slice(-60) || [];
  const topNeighbours = neighbours?.neighbours
    ? [...neighbours.neighbours].sort((left, right) => (right.path_count ?? right.power ?? 0) - (left.path_count ?? left.power ?? 0)).slice(0, 12)
    : [];

  return <>
    <section className="as-query-panel">
      <div className="as-query-mode"><button className={queryMode === 'asn' ? 'active' : ''} onClick={() => switchQueryMode('asn')}>{language === 'zh' ? '按 ASN' : 'By ASN'}</button><button disabled={STATIC_ONLY} title={STATIC_ONLY ? (language === 'zh' ? '完整服务模式可用' : 'Available in full-server mode') : undefined} className={queryMode === 'organization' ? 'active' : ''} onClick={() => switchQueryMode('organization')}>{language === 'zh' ? '按组织' : 'By organization'}</button></div>
      <form onSubmit={submit}><label htmlFor="asn-query">{queryMode === 'asn' ? 'ASN' : (language === 'zh' ? '组织' : 'Organization')}</label><div className={queryMode === 'organization' ? 'organization' : ''}><span>{queryMode === 'asn' ? 'AS' : 'ORG'}</span><input id="asn-query" inputMode={queryMode === 'asn' ? 'numeric' : 'text'} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={queryMode === 'asn' ? '13335' : 'Cloudflare'} /><button type="submit" disabled={loading || organizationLoading}><Search size={15} />{language === 'zh' ? '查询' : 'Search'}</button></div></form>
      <div className="as-query-examples"><span>{language === 'zh' ? '示例' : 'Examples'}</span>{queryMode === 'asn' ? EXAMPLE_ASNS.map((asn) => <button key={asn} onClick={() => loadProfile(asn)}>AS{asn}</button>) : EXAMPLE_ORGANIZATIONS.map((name) => <button key={name} onClick={() => { setQuery(name); searchOrganizations(name); }}>{name}</button>)}</div>
      <p><Info size={13} />{queryMode === 'asn' ? (STATIC_ONLY ? (language === 'zh' ? 'GitHub Pages 模式：watchlist 含完整 CAIDA 数据，任意 ASN 提供 RIPEstat 数据。' : 'GitHub Pages mode: full CAIDA data for watchlist ASNs and RIPEstat data for arbitrary ASNs.') : (language === 'zh' ? 'Watchlist 定时预取；任意 ASN 查询在当前浏览器缓存 8 小时。' : 'Watchlist ASNs are pre-fetched; arbitrary ASN queries are cached here for eight hours.')) : (language === 'zh' ? '组织与成员关系来自 CAIDA AS Rank 的推断映射，不等同于工商登记或法律实体。' : 'Organization and membership data comes from CAIDA AS Rank inference, not corporate or legal registration.')}</p>
    </section>

    {queryMode === 'asn' && <ExternalAsLinks asn={activeAsn} language={language} />}

    {(loading || organizationLoading) && <div className="as-loading"><RefreshCw size={18} />{queryMode === 'asn' ? (language === 'zh' ? `正在查询 AS${activeAsn}…` : `Loading AS${activeAsn}…`) : (language === 'zh' ? '正在查询 CAIDA 组织映射…' : 'Searching CAIDA organization mappings…')}</div>}
    {error && <div className="as-error"><Info size={15} />{error}</div>}

    {!organizationLoading && queryMode === 'organization' && organizationResults && <section className="as-organization-results">
      <div className="as-organization-results-head"><div><span>CAIDA AS RANK</span><h2>{language === 'zh' ? '组织搜索结果' : 'Organization search results'}</h2><p>{language === 'zh' ? `共匹配 ${organizationResults.totalCount} 个推断组织；当前显示前 ${organizationResults.entries.length} 个。` : `${organizationResults.totalCount} inferred organizations matched; showing the first ${organizationResults.entries.length}.`}</p></div></div>
      <div className="as-organization-grid">{organizationResults.entries.map((organization) => <button key={organization.orgId} className={organizationProfile?.orgId === organization.orgId ? 'selected' : ''} onClick={() => loadOrganization(organization.orgId)}><span><b>{organization.orgName || organization.orgId}</b><small>{organization.orgId} · {organization.country?.iso || '—'} · {organization.date}</small></span><em>#{formatNumber(organization.rank || 0)}</em><dl><div><dt>{language === 'zh' ? 'Cone AS' : 'Cone ASes'}</dt><dd>{formatNumber(organization.cone?.numberAsns || 0)}</dd></div><div><dt>{language === 'zh' ? 'Cone 前缀' : 'Cone prefixes'}</dt><dd>{formatNumber(organization.cone?.numberPrefixes || 0)}</dd></div></dl></button>)}</div>
    </section>}

    {!organizationLoading && queryMode === 'organization' && organizationProfile && <section className="as-organization-detail">
      <div className="as-identity-card"><div><span>{organizationProfile.orgId}</span><h2>{organizationProfile.orgName}</h2><p>{organizationProfile.country?.iso || '—'} · CAIDA snapshot {organizationProfile.date}</p></div><div className="as-profile-actions"><a href={`https://asrank.caida.org/orgs/${organizationProfile.orgId}`} target="_blank" rel="noreferrer">AS Rank<ArrowUpRight size={13} /></a></div></div>
      <div className="as-metric-strip"><div><span>AS Rank</span><strong>#{formatNumber(organizationProfile.rank || 0)}</strong></div><div><span>{language === 'zh' ? '成员 ASN' : 'Member ASNs'}</span><strong>{formatNumber(organizationProfile.members?.numberAsns || 0)}</strong></div><div><span>{language === 'zh' ? '已观测成员' : 'Seen members'}</span><strong>{formatNumber(organizationProfile.members?.numberAsnsSeen || 0)}</strong></div><div><span>{language === 'zh' ? 'Customer cone AS' : 'Customer-cone ASes'}</span><strong>{formatNumber(organizationProfile.cone?.numberAsns || 0)}</strong></div><div><span>{language === 'zh' ? 'Cone 前缀' : 'Cone prefixes'}</span><strong>{formatNumber(organizationProfile.cone?.numberPrefixes || 0)}</strong></div></div>
      <article className="chart-card as-organization-members"><div className="card-header"><div><h3>{language === 'zh' ? '排名靠前的成员 ASN' : 'Top-ranked member ASNs'}</h3><p>{language === 'zh' ? '最多显示 20 个；点击进入对应 AS 详情' : 'Up to 20 entries; select one to open its AS profile'}</p></div></div><div>{organizationProfile.members?.asns?.edges?.map((edge) => <button key={edge.node.asn} onClick={() => openAsn(Number(edge.node.asn))}><b>AS{edge.node.asn}</b><span>{edge.node.asnName || '—'}</span><em>#{edge.node.rank || '—'} · {edge.node.country?.iso || '—'}</em></button>)}</div><div className="as-card-note"><Info size={13} />{language === 'zh' ? '组织聚合来自 CAIDA AS-to-Organization 映射，是面向拓扑分析的实体归并；同名组织可能存在多个 orgId。' : 'Organization aggregation comes from CAIDA AS-to-Organization mapping for topology analysis; similarly named organizations may have multiple orgIds.'}</div></article>
    </section>}

    {!loading && queryMode === 'asn' && profile && <div className="as-profile-content">
      <section className="as-identity-card">
        <div><span>AS{profile.asn}</span><h2>{profile.overview.holder || (language === 'zh' ? '未找到注册持有者名称' : 'No registered holder name')}</h2><p>{profile.overview.block?.desc || '—'} · {profile.overview.block?.resource || '—'}</p></div>
        <div className="as-profile-actions"><button onClick={() => loadProfile(profile.asn, !STATIC_ONLY)}><RefreshCw size={13} />{language === 'zh' ? '刷新数据' : 'Refresh data'}</button></div>
      </section>

      {profile.asRank && <section className="as-rank-summary">
        <div className="as-rank-title"><span>CAIDA AS RANK</span><div><strong>#{formatNumber(profile.asRank.rank || 0)}</strong><p>{profile.asRank.organization?.orgName || profile.asRank.asnName || `AS${profile.asn}`} · {profile.asRank.country?.iso || '—'} · {profile.asRank.date}</p></div></div>
        <div className="as-rank-metrics"><span><small>{language === 'zh' ? 'Customer cone AS' : 'Customer-cone ASes'}</small><b>{formatNumber(profile.asRank.cone?.numberAsns || 0)}</b></span><span><small>{language === 'zh' ? 'Cone 前缀' : 'Cone prefixes'}</small><b>{formatNumber(profile.asRank.cone?.numberPrefixes || 0)}</b></span><span><small>Customers</small><b>{formatNumber(profile.asRank.asnDegree?.customer || 0)}</b></span><span><small>Peers</small><b>{formatNumber(profile.asRank.asnDegree?.peer || 0)}</b></span><span><small>Providers</small><b>{formatNumber(profile.asRank.asnDegree?.provider || 0)}</b></span></div>
        <div className="as-rank-note"><Info size={13} />{language === 'zh' ? 'AS Rank 按推断的 customer cone 进行拓扑排名，不是流量、收入、用户数或安全性排名；CAIDA 数据时间与右侧 RIS 快照时间不同。' : 'AS Rank is a topology rank based on inferred customer cone, not traffic, revenue, users, or security. Its data date differs from the RIS snapshot.'}</div>
      </section>}
      {!profile.asRank && <section className={`as-rank-unavailable ${profile.asRankState || 'loading'}`}><RefreshCw size={18} /><div><b>{profile.asRankState === 'loading' ? (language === 'zh' ? 'CAIDA AS Rank 正在独立加载' : 'CAIDA AS Rank is loading separately') : (language === 'zh' ? 'CAIDA AS Rank 暂未返回' : 'CAIDA AS Rank has not returned')}</b><p>{profile.asRankError || (language === 'zh' ? '这不会阻塞 RIPEstat 身份和 RPKI 历史。' : 'This does not block RIPEstat identity or RPKI history.')}</p></div>{profile.asRankState === 'unavailable' && !STATIC_ONLY && <button onClick={retryAsRank}><RefreshCw size={13} />{language === 'zh' ? '重试 AS Rank' : 'Retry AS Rank'}</button>}</section>}

      <section className="as-metric-strip">
        <div><span>{language === 'zh' ? 'RIS 可见起源公告' : 'RIS-visible origin'}</span><strong className={profile.overview.announced ? 'positive' : 'neutral'}>{profile.overview.announced ? (language === 'zh' ? '有' : 'Yes') : (language === 'zh' ? '未观测' : 'Not observed')}</strong></div>
        <div><span>{language === 'zh' ? 'IPv4 公告前缀' : 'IPv4 prefixes'}</span><strong>{profile.routing ? formatNumber(profile.routing.announced_space?.v4?.prefixes || 0) : '—'}</strong></div>
        <div><span>{language === 'zh' ? 'IPv6 公告前缀' : 'IPv6 prefixes'}</span><strong>{profile.routing ? formatNumber(profile.routing.announced_space?.v6?.prefixes || 0) : '—'}</strong></div>
        <div><span>{language === 'zh' ? 'RIS 观测邻居' : 'RIS-observed neighbours'}</span><strong>{profile.routing ? formatNumber(profile.routing.observed_neighbours || 0) : '—'}</strong></div>
        <div><span>VRP IPv4 / IPv6</span><strong>{latestRpki ? `${formatNumber(latestRpki.ipv4 || 0)} / ${formatNumber(latestRpki.ipv6 || 0)}` : '—'}</strong></div>
      </section>

      <div className="as-two-column">
        <article className="chart-card as-routing-card">
          <div className="card-header"><div><h3>{language === 'zh' ? '当前路由状态' : 'Current routing state'}</h3><p>{language === 'zh' ? 'RIPE RIS 最新对齐 RIB 快照；与其他资料独立加载' : 'Latest aligned RIPE RIS RIB snapshot, loaded independently'}</p></div>{profile.routing ? <span className="snapshot-label">{formatTime(profile.routing.query_time)}</span> : <span className="snapshot-label"><RefreshCw size={12} />{profile.routingState === 'loading' ? (language === 'zh' ? '单独加载中' : 'Loading separately') : (language === 'zh' ? '暂不可用' : 'Unavailable')}</span>}</div>
          <div className="as-space-definition"><Info size={13} /><span>{language === 'zh' ? 'Prefix 数量是公告条目数；地址空间是把这些前缀去重合并后覆盖的地址数量。例如一个 /16 只算 1 个 prefix，却覆盖 65,536 个 IPv4 地址。两者不是同一单位。' : 'Prefix count is the number of announcement entries. Address space is the deduplicated coverage of those prefixes: one /16 is one prefix but covers 65,536 IPv4 addresses. They are different units.'}</span></div>
          {profile.routing ? <><div className="as-routing-list">
            <div><span><Route size={14} />{language === 'zh' ? 'IPv4 唯一地址数（去重）' : 'Unique IPv4 addresses'}</span><b>{compact.format(profile.routing.announced_space?.v4?.ips || 0)} IP</b></div>
            <div><span><Route size={14} />{language === 'zh' ? 'IPv6 唯一 /48 等价空间' : 'Unique IPv6 /48 equivalents'}</span><b>{compact.format(profile.routing.announced_space?.v6?.['48s'] || 0)} × /48</b></div>
            <div><span><Users size={14} />IPv4 RIS peers</span><b>{profile.routing.visibility?.v4?.ris_peers_seeing || 0} / {profile.routing.visibility?.v4?.total_ris_peers || 0}</b></div>
            <div><span><Users size={14} />IPv6 RIS peers</span><b>{profile.routing.visibility?.v6?.ris_peers_seeing || 0} / {profile.routing.visibility?.v6?.total_ris_peers || 0}</b></div>
            <div><span><Database size={14} />{language === 'zh' ? '首次观测' : 'First observed'}</span><b>{formatTime(profile.routing.first_seen?.time)}</b></div>
          </div>
          <div className="as-card-note"><Info size={13} />{language === 'zh' ? '“announced”只表示至少 10 个 RIS full-feed peer 看见该 ASN 作为路由起源；纯 transit ASN 可能显示为未观测。' : '“Announced” means at least ten RIS full-feed peers see the ASN as an origin; a transit-only ASN may appear not observed.'}</div></> : <div className={`as-routing-pending ${profile.routingState || 'loading'}`}><RefreshCw size={19} /><b>{profile.routingState === 'loading' ? (profile.asRank ? (language === 'zh' ? '基础身份、VRP 和 AS Rank 已加载，路由状态仍在单独计算。' : 'Identity, VRPs, and AS Rank are ready; routing status is still being computed.') : (language === 'zh' ? '基础身份与 RPKI 历史已加载，其他来源仍在独立加载。' : 'Identity and RPKI history are ready; other sources continue independently.')) : (language === 'zh' ? 'RIPEstat 路由状态暂未返回。' : 'RIPEstat routing status has not returned.')}</b><p>{profile.routingError || (language === 'zh' ? '大型或复杂 ASN 的 routing-status 可能需要几十秒，不影响页面其他资料。' : 'Routing status for large or complex ASNs can take tens of seconds without blocking the rest of the profile.')}</p>{profile.routingState === 'unavailable' && <button onClick={retryRoutingStatus}><RefreshCw size={13} />{language === 'zh' ? '重试路由状态' : 'Retry routing status'}</button>}</div>}
        </article>

        <article className="chart-card as-rpki-card">
          <div className="card-header"><div><h3>{language === 'zh' ? '以该 ASN 为起源的 VRP 历史' : 'VRP history for this origin ASN'}</h3><p>{language === 'zh' ? '最近 60 个月 · 月末值' : 'Last 60 months · last value per month'}</p></div><span className="snapshot-label"><ShieldCheck size={13} />RIPEstat</span></div>
          <div className="as-rpki-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 10, right: 12, left: -4, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e8edf3" strokeDasharray="3 3" /><XAxis dataKey="date" axisLine={false} tickLine={false} minTickGap={35} tick={{ fontSize: 12, fill: '#7b8794' }} /><YAxis axisLine={false} tickLine={false} tickFormatter={(value) => compact.format(value)} tick={{ fontSize: 12, fill: '#7b8794' }} /><Tooltip content={<AsTooltip />} /><Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} /><Line type="monotone" dataKey="ipv4" name="IPv4 VRP" stroke="#2563eb" strokeWidth={2} dot={false} connectNulls /><Line type="monotone" dataKey="ipv6" name="IPv6 VRP" stroke="#0891b2" strokeWidth={2} dot={false} connectNulls /></LineChart></ResponsiveContainer></div>
          <div className="as-card-note"><Info size={13} />{language === 'zh' ? 'VRP 数量表示授权该 ASN 作为 origin 的有效载荷，不等于当前活跃 BGP 前缀，也不证明网络部署了 ROV。' : 'VRP counts are authorizations naming this origin ASN; they are not active BGP-prefix counts or evidence of ROV deployment.'}</div>
        </article>
      </div>

      {profile.asRank?.asnLinks && <article className="chart-card as-topology-card">
        <div className="card-header"><div><h3>{language === 'zh' ? 'CAIDA 推断的 AS 关系邻域' : 'CAIDA inferred AS relationship neighbourhood'}</h3><p>{language === 'zh' ? '固定布局的裁剪子图；与下方 RIS 路径邻居是不同数据和不同语义' : 'A clipped, fixed-layout subgraph with different data and semantics from RIS path neighbours below'}</p></div><span className="snapshot-label">AS Rank · {profile.asRank.date}</span></div>
        <AsRelationshipGraph asn={profile.asn} asName={profile.asRank.asnName} connection={profile.asRank.asnLinks} language={language} onSelectAsn={openAsn} />
      </article>}

      <article className="chart-card as-neighbours-card">
        <div className="card-header"><div><h3>{language === 'zh' ? 'RIS 观测到的 AS 邻居' : 'AS neighbours observed by RIS'}</h3><p>{language === 'zh' ? '按 AS path 中相邻组合的出现次数排序；不是商业关系判定' : 'Ranked by occurrences of adjacent combinations in AS paths; not a business-relationship inference'}</p></div>{neighbours ? <span className="snapshot-label">{formatTime(neighbours.query_endtime)}</span> : <button className="as-load-neighbours" onClick={() => loadNeighbours()} disabled={neighboursLoading}><Network size={14} />{neighboursLoading ? (language === 'zh' ? '加载中…' : 'Loading…') : (language === 'zh' ? '加载邻居详情' : 'Load neighbour details')}</button>}</div>
        {!neighbours && <div className="as-neighbours-placeholder"><Network size={20} /><span>{language === 'zh' ? '邻居详情可能是基础查询的数倍，仅在需要时请求。' : 'Neighbour details can be several times larger than the base profile and are fetched only on demand.'}</span></div>}
        {neighbours && <><div className="as-neighbour-summary"><span>Left <b>{neighbours.neighbour_counts?.left || 0}</b></span><span>Right <b>{neighbours.neighbour_counts?.right || 0}</b></span><span>Unique <b>{neighbours.neighbour_counts?.unique || 0}</b></span><span>Uncertain <b>{neighbours.neighbour_counts?.uncertain || 0}</b></span></div><div className="as-neighbour-table table-scroll"><div className="as-neighbour-row head"><span>ASN</span><span>{language === 'zh' ? '方向' : 'Position'}</span><span>{language === 'zh' ? '路径出现次数' : 'Path occurrences'}</span><span>IPv4 / IPv6 observations</span></div>{topNeighbours.map((item, index) => <div className="as-neighbour-row" key={`${item.asn}-${item.type}-${index}`}><span><b>AS{item.asn}</b></span><span><em className={`as-neighbour-type ${item.type}`}>{item.type}</em></span><span>{formatNumber(item.path_count ?? item.power ?? 0)}</span><span>{formatNumber(item.v4_peers || 0)} / {formatNumber(item.v6_peers || 0)}</span></div>)}</div></>}
        <div className="as-card-note"><Info size={13} />{language === 'zh' ? 'Left/Right 只是 ASN 在 RIS 所见 AS path 中的相对位置；Uncertain 通常与 RIS collector 的直接 peering 造成的观测歧义有关。' : 'Left/right is relative position in AS paths seen by RIS. “Uncertain” often reflects ambiguity introduced by direct peering with a RIS collector.'}</div>
      </article>
    </div>}
  </>;
}
