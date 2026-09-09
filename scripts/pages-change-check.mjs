import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Acquisition bookkeeping is not a change in the observed dataset.
// Keep sample dates, durations, measurements and stale/unavailable transitions.
const bookkeeping = new Set(['generatedAt', 'fetchedAt', 'attemptedAt', 'lastSuccessAt']);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().filter((key) => !bookkeeping.has(key)).map((key) => [
    key, key === 'state' && ['fresh', 'cached'].includes(value[key]) ? 'available' : canonical(value[key]),
  ]));
}

export function dataFingerprint(dashboard, profiles) {
  const data = structuredClone(dashboard);
  delete data.provenance.cache;
  delete data.provenance.syncProfile;
  for (const field of ['observedAt', 'lastUpdateStart', 'lastUpdateDone', 'serial']) delete data.current[field];
  for (const field of ['sourceFailures', 'asSourceFailures']) {
    data.provenance[field] = (data.provenance[field] || []).map(canonical)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return createHash('sha256').update(JSON.stringify(canonical({ dashboard: data, profiles }))).digest('hex');
}

export function shouldDeploy(current, published, event = 'schedule', force = false) {
  return force || event === 'push' || published?.version !== current.version
    || current.codeVersion !== published?.codeVersion || current.fingerprint !== published?.fingerprint;
}

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const dashboard = JSON.parse(await readFile(path.join(root, 'src/generated/rpki-data.json'), 'utf8'));
  const profiles = JSON.parse(await readFile(path.join(root, 'public/data/as-watchlist-profiles.json'), 'utf8'));
  // Hash tracked build inputs, not commit IDs: a documentation commit changes no build inputs.
  const inputs = execFileSync('git', ['ls-files', '-s', '--', 'src', 'public', 'scripts', 'data',
    'package.json', 'package-lock.json', 'index.html', 'vite.config.js', '.github/workflows/pages.yml',
    ':(exclude)src/generated/**', ':(exclude)public/data/**'], { cwd: root, encoding: 'utf8' });
  const state = { version: 1, codeVersion: createHash('sha256').update(inputs).digest('hex'), fingerprint: dataFingerprint(dashboard, profiles) };
  let published = null;
  try {
    const raw = execFileSync('curl', ['-fsSL', '--max-time', '15', '--retry', '1', '-H', 'Cache-Control: no-cache',
      `${process.env.PAGES_URL.replace(/\/$/, '')}/data/deployment-state.json?run=${process.env.GITHUB_RUN_ID || Date.now()}`], { encoding: 'utf8' });
    published = JSON.parse(raw);
  } catch {
    console.log('Published comparison state unavailable; deploy to establish a baseline.');
  }
  const changed = shouldDeploy(state, published, process.env.GITHUB_EVENT_NAME, process.env.FORCE_DEPLOY === 'true');
  await mkdir(path.join(root, 'public/data'), { recursive: true });
  await writeFile(path.join(root, 'public/data/deployment-state.json'), JSON.stringify(state) + '\n');
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  const summary = changed ? 'Publish: code, observations or source availability changed (or publish was forced).' : 'No data changes: build, upload and deployment skipped. Collection still completed.';
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Pages update\n\n${summary}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
