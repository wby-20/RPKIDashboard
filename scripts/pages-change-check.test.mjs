import test from 'node:test';
import assert from 'node:assert/strict';
import { dataFingerprint, shouldDeploy } from './pages-change-check.mjs';

const data = { provenance: { generatedAt: 'old', cache: { hits: 1 }, syncProfile: 'fast' },
  current: { observedAt: 'old', serial: 1, lastUpdateDuration: 5, totals: { validCACerts: 100 } },
  history: [{ date: '2026-09-01', count: 20 }] };
const profiles = { generatedAt: 'old', byAsn: { 13335: { routing: { query_time: 'old', count: 5 }, sourceStatus: { routing: { state: 'fresh', lastSuccessAt: 'old' } } } } };

test('only acquisition times, cache bookkeeping and serial changes skip deployment', () => {
  const next = structuredClone(data);
  next.provenance = { generatedAt: 'new', cache: { hits: 20 }, syncProfile: 'medium' };
  next.current.observedAt = 'new'; next.current.serial = 2;
  const nextProfiles = structuredClone(profiles);
  nextProfiles.generatedAt = 'new';
  nextProfiles.byAsn[13335].sourceStatus.routing = { state: 'cached', lastSuccessAt: 'new', attemptedAt: 'new' };
  assert.equal(dataFingerprint(data, profiles), dataFingerprint(next, nextProfiles));
});

test('measurements, historical sample dates and source failures trigger deployment', () => {
  for (const mutate of [d => d.current.totals.validCACerts++, d => d.current.lastUpdateDuration++, d => d.history[0].date = '2026-09-02']) {
    const next = structuredClone(data); mutate(next);
    assert.notEqual(dataFingerprint(data, profiles), dataFingerprint(next, profiles));
  }
  const failed = structuredClone(profiles);
  failed.byAsn[13335].sourceStatus.routing.state = 'stale';
  assert.notEqual(dataFingerprint(data, profiles), dataFingerprint(data, failed));
});

test('compare against published state; force, code change or no baseline publish', () => {
  const published = { version: 1, codeVersion: 'abc', fingerprint: '123' };
  assert.equal(shouldDeploy(published, { ...published }), false);
  assert.equal(shouldDeploy(published, null), true);
  assert.equal(shouldDeploy(published, { ...published, codeVersion: 'old' }), true);
  assert.equal(shouldDeploy(published, published, 'workflow_dispatch', true), true);
  assert.equal(shouldDeploy(published, published, 'push'), true);
});
