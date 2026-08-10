import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const buildScript = path.join(skillRoot, 'scripts', 'build_project.mjs');

function fixture(t, { scenario, selfId }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'love-roommate-sequence-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, 'project');
  const reportDir = path.join(root, 'preview', 'scenarios', scenario);
  const configDir = path.join(project, 'src', 'config');
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(reportDir, { recursive: true });
  const ids = ['person-1', 'person-2', 'person-3'];
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'sequence-evidence-fixture' }));
  fs.writeFileSync(path.join(configDir, 'pet.config.json'), JSON.stringify({
    selection: { userCharacterId: selfId },
    characters: ids.map((id) => ({ id }))
  }));
  fs.writeFileSync(path.join(configDir, 'behaviors.json'), JSON.stringify({}));
  const movingLeader = scenario === 'centipede';
  const samples = Array.from({ length: 10 }, (_, index) => ({
    phase: scenario === 'centipede' ? 'centipede' : 'poopChase',
    cursor: { x: 100 + index * 10, y: 100 },
    leader: { x: movingLeader ? 100 + index * 10 : 100, y: 100, vx: movingLeader ? 100 : 0, vy: 0, frame: 0 },
    pets: ids.map((id, petIndex) => ({ id, x: (movingLeader ? 100 + index * 10 : 100) - petIndex * 60, y: 100, vx: movingLeader ? 100 : 0, vy: 0, frame: 0 })),
    droppings: scenario === 'poop-chase' ? [{
      sourceId: selfId,
      targetId: index < 5 ? 'person-2' : 'person-3',
      cursorControlled: false
    }] : []
  }));
  return { project, reportDir, ids, samples };
}

function cleanEffectEvidence(extra = {}) {
  return {
    id: 'poop-1',
    visible: true,
    transparentPixelRatio: 0.65,
    visiblePixelRatio: 0.35,
    partialAlphaPixelRatio: 0.02,
    desktopForegroundRatio: 0.55,
    desktopMatchRatio: 1,
    transparentUnderlayMatchRatio: 1,
    edgeTransparentUnderlayMatchRatio: 1,
    cornerTransparentUnderlayMatchRatio: 1,
    transparentNeutralArtifactRatio: 0,
    visibleNeutralPixelRatio: 0,
    visiblePalePixelRatio: 0,
    visibleCompositorChangeRatio: 1,
    ...extra
  };
}

function cleanDroppingEvidence() {
  return [cleanEffectEvidence()];
}

function addEffectUnderlays(reportDir, captures) {
  for (const capture of captures) {
    const file = `${capture.label || 'active'}-effect-underlay.png`;
    fs.writeFileSync(path.join(reportDir, file), 'underlay');
    capture.effectUnderlay = file;
  }
  return captures;
}

function verify(project, scenario, reportPath) {
  return spawnSync(process.execPath, [
    buildScript,
    '--project', project,
    '--verify-scenario-report',
    '--scenario', scenario,
    '--report', reportPath
  ], { encoding: 'utf8' });
}

function writePoopChaseReport(reportDir, samples, ids) {
  for (const label of ['active', 'eating-person-2', 'eating-person-3', 'handoff-person-2-to-person-3']) {
    fs.writeFileSync(path.join(reportDir, `${label}.png`), label);
  }
  const horizontalFrames = ids.map((id, index) => ({
    id,
    bounds: { x: 100 + index * 180, y: 240, width: 180, height: 180 }
  }));
  const report = {
    scenario: 'poop-chase',
    samples,
    captures: [
      {
        label: 'active', composition: 'active.png', captureKind: 'desktop-compositor', releaseEligible: true,
        frames: structuredClone(horizontalFrames), droppings: cleanDroppingEvidence(),
        evidence: null
      },
      {
        label: 'eating-person-2', composition: 'eating-person-2.png', captureKind: 'desktop-compositor', releaseEligible: true,
        frames: structuredClone(horizontalFrames), droppings: cleanDroppingEvidence(),
        evidence: { kind: 'eating-climax', elapsedMs: 900, eaterId: 'person-2' }
      },
      {
        label: 'eating-person-3', composition: 'eating-person-3.png', captureKind: 'desktop-compositor', releaseEligible: true,
        frames: structuredClone(horizontalFrames), droppings: cleanDroppingEvidence(),
        evidence: { kind: 'eating-climax', elapsedMs: 2100, eaterId: 'person-3' }
      },
      {
        label: 'handoff-person-2-to-person-3', composition: 'handoff-person-2-to-person-3.png', captureKind: 'desktop-compositor', releaseEligible: true,
        frames: structuredClone(horizontalFrames), droppings: cleanDroppingEvidence(),
        evidence: { kind: 'handoff-return', elapsedMs: 1500, returningEaterId: 'person-2', nextEaterId: 'person-3' }
      }
    ]
  };
  addEffectUnderlays(reportDir, report.captures);
  const reportPath = path.join(reportDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return { reportPath, report };
}

test('scenario gate rejects synthetic development captures and requires release-eligible desktop compositor evidence', (t) => {
  const { project, reportDir, samples, ids } = fixture(t, { scenario: 'centipede', selfId: null });
  const captures = [
    { label: 'centipede-early', elapsedMs: 400, x: 120 },
    { label: 'centipede-late', elapsedMs: 1100, x: 210 }
  ].map(({ label, elapsedMs, x }) => {
    const composition = `${label}.png`;
    fs.writeFileSync(path.join(reportDir, composition), label);
    return {
      label,
      composition,
      captureKind: 'synthetic-development',
      releaseEligible: false,
      frames: ids.map((id) => ({ id })),
      effects: [cleanEffectEvidence({ role: 'cursor-poop', id: undefined })],
      compositionBounds: { x: 0, y: 0, width: 800, height: 600 },
      evidence: { kind: 'cursor-centipede', elapsedMs, leaderPosition: { x, y: 100 } }
    };
  });
  const reportPath = path.join(reportDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ scenario: 'centipede', samples, captures }, null, 2));

  const rejected = verify(project, 'centipede', reportPath);
  assert.notEqual(rejected.status, 0, 'synthetic development captures unexpectedly passed the release scenario gate');
  assert.match(rejected.stderr, /desktop compositor|release eligible|synthetic/i);

  for (const capture of captures) {
    capture.captureKind = 'desktop-compositor';
    capture.releaseEligible = true;
  }
  addEffectUnderlays(reportDir, captures);
  fs.writeFileSync(reportPath, JSON.stringify({ scenario: 'centipede', samples, captures }, null, 2));
  const accepted = verify(project, 'centipede', reportPath);
  assert.equal(accepted.status, 0, accepted.stderr);
});

test('scenario gate rejects a no-self centipede report without two distinct full-composition moments', (t) => {
  const { project, reportDir, samples, ids } = fixture(t, { scenario: 'centipede', selfId: null });
  fs.writeFileSync(path.join(reportDir, 'composition.png'), 'one moment');
  const reportPath = path.join(reportDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    scenario: 'centipede',
    samples,
    captures: [{ label: 'active', composition: 'composition.png', captureKind: 'desktop-compositor', releaseEligible: true }]
  }, null, 2));

  const result = verify(project, 'centipede', reportPath);
  assert.notEqual(result.status, 0, 'one generic centipede composition unexpectedly passed');
  assert.match(result.stderr, /two distinct.*centipede|centipede.*two distinct/i);

  const captures = [
    { label: 'centipede-early', elapsedMs: 400, x: 120 },
    { label: 'centipede-late', elapsedMs: 1100, x: 210 }
  ].map(({ label, elapsedMs, x }) => {
    const composition = `${label}.png`;
    fs.writeFileSync(path.join(reportDir, composition), label);
    return {
      label,
      composition,
      captureKind: 'desktop-compositor',
      releaseEligible: true,
      frames: ids.map((id) => ({ id })),
      effects: [cleanEffectEvidence({ role: 'cursor-poop', id: undefined })],
      compositionBounds: { x: 0, y: 0, width: 800, height: 600 },
      evidence: { kind: 'cursor-centipede', elapsedMs, leaderPosition: { x, y: 100 } }
    };
  });
  addEffectUnderlays(reportDir, captures);
  const valid = { scenario: 'centipede', samples, captures };
  fs.writeFileSync(reportPath, JSON.stringify(valid, null, 2));
  assert.equal(verify(project, 'centipede', reportPath).status, 0, 'two distinct centipede moments should pass');

  const sameMoment = structuredClone(valid);
  sameMoment.captures[1].evidence.elapsedMs = sameMoment.captures[0].evidence.elapsedMs;
  fs.writeFileSync(reportPath, JSON.stringify(sameMoment, null, 2));
  const forged = verify(project, 'centipede', reportPath);
  assert.notEqual(forged.status, 0, 'different positions forged at one timestamp unexpectedly passed');
  assert.match(forged.stderr, /distinct.*time|time.*distinct/i);

  const recropped = structuredClone(valid);
  recropped.captures[1].compositionBounds.x = 40;
  recropped.captures[1].compositionBounds.width = 760;
  fs.writeFileSync(reportPath, JSON.stringify(recropped, null, 2));
  const mismatchedViewport = verify(project, 'centipede', reportPath);
  assert.notEqual(mismatchedViewport.status, 0, 'dynamically recropped centipede sequence unexpectedly passed');
  assert.match(mismatchedViewport.stderr, /fixed.*viewport|viewport.*match|composition bounds/i);
});

test('scenario gate rejects self-poop evidence with only one eater and no return handoff', (t) => {
  const { project, reportDir, samples, ids } = fixture(t, { scenario: 'poop-chase', selfId: 'person-1' });
  fs.writeFileSync(path.join(reportDir, 'eating-person-2.png'), 'one eater');
  const reportPath = path.join(reportDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    scenario: 'poop-chase',
    samples,
    captures: [{
      label: 'eating',
      composition: 'eating-person-2.png',
      captureKind: 'desktop-compositor',
      releaseEligible: true,
      frames: ids.map((id) => ({ id })),
      evidence: { kind: 'eating-climax', eaterId: 'person-2' }
    }]
  }, null, 2));

  const result = verify(project, 'poop-chase', reportPath);
  assert.notEqual(result.status, 0, 'one eater without a return handoff unexpectedly passed');
  assert.match(result.stderr, /two different eater|two distinct eater|handoff|return/i);

  for (const label of ['active', 'eating-person-2', 'eating-person-3', 'handoff-person-2-to-person-3']) {
    fs.writeFileSync(path.join(reportDir, `${label}.png`), label);
  }
  const fullFrames = ids.map((id, index) => ({
    id,
    bounds: { x: 100 + index * 180, y: 240, width: 180, height: 180 }
  }));
  const valid = {
    scenario: 'poop-chase',
    samples,
    captures: [
      {
        label: 'active', composition: 'active.png', captureKind: 'desktop-compositor', releaseEligible: true, frames: fullFrames, droppings: cleanDroppingEvidence(),
        evidence: null
      },
      {
        label: 'eating-person-2', composition: 'eating-person-2.png', captureKind: 'desktop-compositor', releaseEligible: true, frames: fullFrames, droppings: cleanDroppingEvidence(),
        evidence: { kind: 'eating-climax', elapsedMs: 900, eaterId: 'person-2' }
      },
      {
        label: 'eating-person-3', composition: 'eating-person-3.png', captureKind: 'desktop-compositor', releaseEligible: true, frames: fullFrames, droppings: cleanDroppingEvidence(),
        evidence: { kind: 'eating-climax', elapsedMs: 2100, eaterId: 'person-3' }
      },
      {
        label: 'handoff-person-2-to-person-3', composition: 'handoff-person-2-to-person-3.png', captureKind: 'desktop-compositor', releaseEligible: true, frames: fullFrames, droppings: cleanDroppingEvidence(),
        evidence: { kind: 'handoff-return', elapsedMs: 1500, returningEaterId: 'person-2', nextEaterId: 'person-3' }
      }
    ]
  };
  addEffectUnderlays(reportDir, valid.captures);
  fs.writeFileSync(reportPath, JSON.stringify(valid, null, 2));
  const accepted = verify(project, 'poop-chase', reportPath);
  assert.equal(accepted.status, 0, accepted.stderr);
});

test('scenario gate rejects selected-self poop chase that follows ordinary cursor movement', (t) => {
  const { project, reportDir, samples, ids } = fixture(t, { scenario: 'poop-chase', selfId: 'person-1' });
  const movingSamples = samples.map((sample, index) => ({
    ...sample,
    leader: { ...sample.leader, x: sample.leader.x + index * 4, vx: 40 },
    pets: sample.pets.map((pet) => ({ ...pet, x: pet.x + index * 4, vx: 40 }))
  }));
  const { reportPath } = writePoopChaseReport(reportDir, movingSamples, ids);

  const result = verify(project, 'poop-chase', reportPath);
  assert.notEqual(result.status, 0, 'self-poop report that follows ordinary cursor movement unexpectedly passed');
  assert.match(result.stderr, /fixed formation|ordinary cursor|moved self|moved the fixed queue/i);
});

test('scenario gate rejects a white or opaque dropping rectangle even when the capture exists', (t) => {
  const { project, reportDir, samples, ids } = fixture(t, { scenario: 'poop-chase', selfId: 'person-1' });
  const { reportPath, report } = writePoopChaseReport(reportDir, samples, ids);
  report.captures[0].droppings[0] = {
    ...report.captures[0].droppings[0],
    transparentPixelRatio: 0,
    visiblePixelRatio: 1,
    desktopForegroundRatio: 1
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const result = verify(project, 'poop-chase', reportPath);
  assert.notEqual(result.status, 0, 'opaque dropping rectangle unexpectedly passed');
  assert.match(result.stderr, /opaque box|white border|gray halo|transparent-edge/i);
});

test('scenario gate rejects a compositor white box even when the effect PNG claims clean alpha', (t) => {
  const { project, reportDir, samples, ids } = fixture(t, { scenario: 'poop-chase', selfId: 'person-1' });
  const { reportPath, report } = writePoopChaseReport(reportDir, samples, ids);
  report.captures[0].droppings[0] = {
    ...report.captures[0].droppings[0],
    transparentPixelRatio: 0.65,
    visiblePixelRatio: 0.35,
    transparentUnderlayMatchRatio: 0.35,
    edgeTransparentUnderlayMatchRatio: 0,
    cornerTransparentUnderlayMatchRatio: 0,
    transparentNeutralArtifactRatio: 0.6
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const result = verify(project, 'poop-chase', reportPath);
  assert.notEqual(result.status, 0, 'desktop-composited white box unexpectedly passed because the effect PNG alpha looked clean');
  assert.match(result.stderr, /opaque box|white border|gray halo|compositor transparency mismatch/i);
});

test('scenario gate rejects self-poop samples whose horizontal queue Y spread exceeds one pixel', (t) => {
  const { project, reportDir, samples, ids } = fixture(t, { scenario: 'poop-chase', selfId: 'person-1' });
  const diagonalSamples = samples.map((sample) => ({
    ...sample,
    pets: sample.pets.map((pet, index) => ({ ...pet, y: 100 + index * 2 }))
  }));
  const { reportPath } = writePoopChaseReport(reportDir, diagonalSamples, ids);

  const result = verify(project, 'poop-chase', reportPath);
  assert.notEqual(result.status, 0, 'poop-chase samples with a 4px Y spread unexpectedly passed the horizontal queue release gate');
  assert.match(result.stderr, /horizontal|y spread|aligned|one pixel/i);
});

test('scenario gate requires the scheduled active self-poop compositor capture', (t) => {
  const { project, reportDir, samples, ids } = fixture(t, { scenario: 'poop-chase', selfId: 'person-1' });
  const { reportPath, report } = writePoopChaseReport(reportDir, samples, ids);
  report.captures = report.captures.filter((capture) => capture.label !== 'active');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const result = verify(project, 'poop-chase', reportPath);
  assert.notEqual(result.status, 0, 'poop-chase report without the scheduled active compositor unexpectedly passed');
  assert.match(result.stderr, /active.*capture|capture.*active/i);
});

test('scenario gate rejects a self-poop sample that duplicates one character while omitting another', (t) => {
  const { project, reportDir, samples, ids } = fixture(t, { scenario: 'poop-chase', selfId: 'person-1' });
  const forgedSamples = structuredClone(samples);
  forgedSamples[4].pets[2] = { ...forgedSamples[4].pets[1] };
  const { reportPath } = writePoopChaseReport(reportDir, forgedSamples, ids);

  const result = verify(project, 'poop-chase', reportPath);
  assert.notEqual(result.status, 0, 'sample with a duplicate person-2 and no person-3 unexpectedly passed');
  assert.match(result.stderr, /every character|duplicate|missing|participant/i);
});

test('scenario gate accepts a self-poop row whose Y spread is exactly one pixel', (t) => {
  const { project, reportDir, samples, ids } = fixture(t, { scenario: 'poop-chase', selfId: 'person-1' });
  const boundarySamples = samples.map((sample) => ({
    ...sample,
    pets: sample.pets.map((pet, index) => ({ ...pet, y: 100 + (index === 1 ? 1 : 0) }))
  }));
  const { reportPath } = writePoopChaseReport(reportDir, boundarySamples, ids);

  const result = verify(project, 'poop-chase', reportPath);
  assert.equal(result.status, 0, result.stderr);
});

for (const captureLabel of ['active', 'eating-person-2', 'eating-person-3', 'handoff-person-2-to-person-3']) {
  test(`scenario gate rejects ${captureLabel} compositor frame bounds whose horizontal queue Y spread exceeds one pixel`, (t) => {
    const { project, reportDir, samples, ids } = fixture(t, { scenario: 'poop-chase', selfId: 'person-1' });
    const { reportPath, report } = writePoopChaseReport(reportDir, samples, ids);
    const capture = report.captures.find((entry) => entry.label === captureLabel);
    capture.frames = capture.frames.map((frame, index) => ({
      ...frame,
      bounds: { ...frame.bounds, y: frame.bounds.y + index * 2 }
    }));
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    const result = verify(project, 'poop-chase', reportPath);
    assert.notEqual(result.status, 0, `${captureLabel} compositor bounds with a 4px Y spread unexpectedly passed the horizontal queue release gate`);
    assert.match(result.stderr, /horizontal|y spread|aligned|one pixel/i);
  });
}
