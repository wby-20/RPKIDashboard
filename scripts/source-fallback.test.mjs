import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSource } from './source-fallback.mjs';

const oldTime = '2026-09-01T00:00:00Z';
const now = '2026-09-09T00:00:00Z';
const fail = async () => { throw new Error('Source request failed (curl 28)'); };

test('independent sources retain failed data while accepting fresh data', async () => {
  const [routing, rank] = await Promise.all([
    loadSource({ load: fail, previous: { query_time: oldTime, prefixes: 12 }, fallbackTime: oldTime, now }),
    loadSource({ load: async () => ({ value: { rank: 3 } }), previous: { rank: 4 }, now }),
  ]);
  assert.equal(routing.value.query_time, oldTime);
  assert.equal(routing.meta.state, 'stale');
  assert.equal(routing.meta.lastSuccessAt, oldTime);
  assert.equal(rank.meta.state, 'fresh');
  assert.equal(rank.value.rank, 3);
});

test('repeated failures do not advance the last success timestamp', async () => {
  const previous = { query_time: oldTime };
  const first = await loadSource({ load: fail, previous, fallbackTime: oldTime, now });
  const next = await loadSource({ load: fail, previous: first.value, previousMeta: first.meta, fallbackTime: now, now });
  assert.equal(next.meta.lastSuccessAt, oldTime);
  assert.deepEqual(next.value, previous);
});

test('no prior observation remains unavailable, never fabricated as zero', async () => {
  const result = await loadSource({ load: fail, now });
  assert.equal(result.value, null);
  assert.equal(result.meta.state, 'unavailable');
  assert.equal(result.meta.lastSuccessAt, null);
});

test('raw cache fallback metadata survives and recovery clears stale state', async () => {
  const stale = await loadSource({ load: async () => ({ value: { rank: 4 }, meta: { state: 'stale', lastSuccessAt: oldTime } }), now });
  assert.equal(stale.meta.state, 'stale');
  assert.equal(stale.meta.lastSuccessAt, oldTime);
  const recovered = await loadSource({ load: async () => ({ value: { rank: 3 } }), previous: stale.value, previousMeta: stale.meta, now });
  assert.equal(recovered.meta.state, 'fresh');
  assert.equal(recovered.meta.lastSuccessAt, now);
  assert.equal(recovered.meta.error, undefined);
});
