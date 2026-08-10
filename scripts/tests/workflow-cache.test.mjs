import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  loadPerformanceCache,
  performanceCacheIdentity,
  writePerformanceCacheRecord
} from '../lib/performance-cache.mjs';
import {
  createWorkflowState,
  diffProjectSnapshots,
  sha256File,
  validCachedProjectPass,
  writeWorkflowJson
} from '../lib/workflow-state.mjs';

function action(fingerprint) {
  return { fingerprint, files: [] };
}

function character(prefix, overrides = {}) {
  return {
    fingerprint: `${prefix}-character`,
    actions: {
      crawl_right: action(`${prefix}-crawl-right`),
      crawl_left: action(`${prefix}-crawl-left`),
      idle_right: action(`${prefix}-idle-right`),
      idle_left: action(`${prefix}-idle-left`),
      drag: action(`${prefix}-drag`),
      shout: action(`${prefix}-shout`),
      poop_right: action(`${prefix}-poop-right`),
      poop_left: action(`${prefix}-poop-left`),
      eat_right: action(`${prefix}-eat-right`),
      eat_left: action(`${prefix}-eat-left`),
      centipede_right: action(`${prefix}-centipede-right`),
      centipede_left: action(`${prefix}-centipede-left`),
      ...overrides
    }
  };
}

function snapshot(overrides = {}) {
  return {
    schemaVersion: 1,
    fingerprint: 'snapshot-a',
    rosterFingerprint: 'roster-a',
    behaviorFingerprint: 'behavior-a',
    candidateFingerprint: 'candidate-a',
    characters: {
      'person-1': character('one'),
      'person-2': character('two')
    },
    ...overrides
  };
}

const config = {
  characters: [{ id: 'person-1' }, { id: 'person-2' }],
  selection: { userCharacterId: 'person-1', chaseVariant: 'self-poop' }
};
const behaviors = { groupShout: { enabled: true }, poopChase: { enabled: true }, centipede: { enabled: false } };

test('incremental diff maps one changed shout action only to both shout scenes', () => {
  const previous = snapshot();
  const current = snapshot({
    fingerprint: 'snapshot-b',
    characters: {
      ...previous.characters,
      'person-2': character('two', { shout: action('two-shout-updated') })
    }
  });
  current.characters['person-2'].fingerprint = 'two-character-updated';
  const diff = diffProjectSnapshots(previous, current, config, behaviors);
  assert.deepEqual(diff.changedCharacters, ['person-2']);
  assert.deepEqual(diff.changedScenarios.sort(), ['dad-shout', 'grandpa-shout']);
});

test('incremental diff maps selected-self poop changes only to self-poop chase', () => {
  const previous = snapshot();
  const current = snapshot({
    fingerprint: 'snapshot-b',
    characters: {
      ...previous.characters,
      'person-1': character('one', { poop_right: action('one-poop-right-updated') })
    }
  });
  current.characters['person-1'].fingerprint = 'one-character-updated';
  const diff = diffProjectSnapshots(previous, current, config, behaviors);
  assert.deepEqual(diff.changedScenarios, ['poop-chase']);
});

test('runtime, roster, or behavior changes invalidate every enabled scene', () => {
  for (const override of [
    { candidateFingerprint: 'candidate-b' },
    { rosterFingerprint: 'roster-b' },
    { behaviorFingerprint: 'behavior-b' }
  ]) {
    const diff = diffProjectSnapshots(snapshot(), snapshot({ fingerprint: 'snapshot-b', ...override }), config, behaviors);
    assert.deepEqual(diff.changedScenarios, ['normal', 'dad-shout', 'grandpa-shout', 'poop-chase']);
    assert.equal(diff.refreshRuntime, true);
  }
});

test('project pass cache requires the exact snapshot and self-check report hash', (t) => {
  const preview = fs.mkdtempSync(path.join(os.tmpdir(), 'love-roommate-project-cache-'));
  t.after(() => fs.rmSync(preview, { recursive: true, force: true }));
  const report = path.join(preview, 'self-check-report.json');
  writeWorkflowJson(report, { status: 'pass', overallScore: 100, minScore: 90 });
  const current = snapshot();
  const state = createWorkflowState(current, 'iteration', { status: 'pass', score: 100, reportSha256: sha256File(report) });
  assert.equal(validCachedProjectPass(state, current, preview), true);
  writeWorkflowJson(report, { status: 'fail', overallScore: 50, minScore: 90 });
  assert.equal(validCachedProjectPass(state, current, preview), false);
});

function cacheFixture(t) {
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'love-roommate-performance-cache-'));
  t.after(() => fs.rmSync(cacheRoot, { recursive: true, force: true }));
  const identity = performanceCacheIdentity({
    candidateFingerprint: 'a'.repeat(64),
    electronVersion: '41.0.2',
    platform: 'win32',
    arch: 'x64',
    performanceContractFingerprint: 'b'.repeat(64)
  });
  assert.equal(identity.performanceContractVersion, 1);
  const entryRoot = path.join(cacheRoot, 'entry');
  const evidence = {};
  for (const [label, people] of [['five', 5], ['eight', 8]]) {
    const project = path.join(entryRoot, label, 'project');
    const packagedRoot = path.join(entryRoot, label, 'packaged');
    const executable = path.join(entryRoot, label, 'fixture.exe');
    const report = path.join(entryRoot, label, 'report.json');
    fs.mkdirSync(project, { recursive: true });
    fs.mkdirSync(packagedRoot, { recursive: true });
    fs.writeFileSync(executable, `fixture-${people}`);
    writeWorkflowJson(report, {
      status: 'pass',
      expectedWindowCount: people,
      candidateFingerprint: identity.candidateFingerprint
    });
    evidence[label] = { project, packagedRoot, executable, report };
  }
  const record = writePerformanceCacheRecord(entryRoot, identity, evidence);
  return { cacheRoot, entryRoot, identity, evidence, record };
}

test('performance cache accepts intact redacted 5+8 evidence', (t) => {
  const fixture = cacheFixture(t);
  const recordPath = path.join(fixture.entryRoot, 'record.json');
  const keyRoot = path.join(fixture.cacheRoot, 'unused');
  fs.renameSync(fixture.entryRoot, keyRoot);
  const key = path.basename(keyRoot);
  const loaded = loadPerformanceCache(fixture.cacheRoot, fixture.identity);
  assert.equal(loaded.hit, false, 'cache lookup must be bound to the computed identity key');
  fs.renameSync(keyRoot, path.join(fixture.cacheRoot, loaded.key));
  const rebound = loadPerformanceCache(fixture.cacheRoot, fixture.identity);
  assert.equal(rebound.hit, true);
  assert.equal(fs.existsSync(recordPath), false);
  assert.equal(key.length > 0, true);
});

test('performance cache rejects expiry, corruption, identity changes, and private fields', (t) => {
  const fixture = cacheFixture(t);
  const probe = loadPerformanceCache(fixture.cacheRoot, fixture.identity);
  fs.renameSync(fixture.entryRoot, probe.entryRoot);
  let recordPath = path.join(probe.entryRoot, 'record.json');
  let record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  record.createdAt = '2000-01-01T00:00:00.000Z';
  writeWorkflowJson(recordPath, record);
  assert.equal(loadPerformanceCache(fixture.cacheRoot, fixture.identity).hit, false);

  record.createdAt = new Date().toISOString();
  record.sourcePhoto = 'C:\\Users\\sample\\private.jpg';
  writeWorkflowJson(recordPath, record);
  assert.equal(loadPerformanceCache(fixture.cacheRoot, fixture.identity).reasons.includes('privacy'), true);

  delete record.sourcePhoto;
  writeWorkflowJson(recordPath, record);
  fs.writeFileSync(path.resolve(probe.entryRoot, record.evidence.five.report), '{broken');
  assert.equal(loadPerformanceCache(fixture.cacheRoot, fixture.identity).hit, false);

  const differentIdentity = { ...fixture.identity, electronVersion: '42.0.0' };
  assert.equal(loadPerformanceCache(fixture.cacheRoot, differentIdentity).hit, false);
});
