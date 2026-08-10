import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export const WORKFLOW_STATE_SCHEMA_VERSION = 1;
export const WORKFLOW_SUMMARY_SCHEMA_VERSION = 1;

const ACTION_GROUPS = Object.freeze({
  normalOther: ['crawl_right', 'crawl_left', 'idle_right', 'idle_left', 'drag'],
  normalSelf: ['idle_right', 'idle_left', 'drag'],
  shoutOther: ['shout'],
  shoutSelf: ['idle_right', 'idle_left'],
  poopSelf: ['poop_right', 'poop_left', 'idle_right', 'idle_left', 'drag'],
  poopOther: ['eat_right', 'eat_left', 'idle_right', 'idle_left'],
  centipede: ['centipede_right', 'centipede_left', 'idle_right', 'idle_left']
});

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256Buffer(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function sha256File(file) {
  return sha256Buffer(fs.readFileSync(file));
}

export function sha256Value(value) {
  return sha256Buffer(stableSerialize(value));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function relativeFileHash(root, file) {
  const resolved = path.resolve(file);
  const relative = path.relative(root, resolved).replaceAll('\\', '/');
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Unsafe project file: ${file}`);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`Project file is missing: ${relative}`);
  return { file: relative, sha256: sha256File(resolved) };
}

function actionSnapshot(project, spritesRoot, action, files) {
  const normalizedFiles = Array.isArray(files) ? files : [];
  const evidence = normalizedFiles.map((file) => relativeFileHash(project, path.join(spritesRoot, file)));
  return {
    fingerprint: sha256Value({ action, evidence }),
    files: evidence
  };
}

function characterSnapshot(project, spritesRoot, character) {
  const actions = {};
  for (const [action, files] of Object.entries(character.frames || {}).sort(([left], [right]) => left.localeCompare(right, 'en'))) {
    actions[action] = actionSnapshot(project, spritesRoot, action, files);
  }
  return {
    fingerprint: sha256Value({ id: character.id, anchors: character.anchors || null, actions }),
    actions
  };
}

function optionalArtifact(outputRoot, file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  return relativeFileHash(outputRoot, file);
}

function runtimeAudit(project, skillRoot) {
  const require = createRequire(import.meta.url);
  const audit = require(path.join(skillRoot, 'assets', 'electron-template', 'src', 'performance-audit.js'));
  return {
    runtimeFingerprint: audit.runtimeFingerprintForProject(project),
    candidateFingerprint: audit.candidateFingerprintForProject(project)
  };
}

export function enabledScenarios(config, behaviors) {
  const scenarios = ['normal'];
  if (behaviors.groupShout?.enabled) scenarios.push('dad-shout', 'grandpa-shout');
  if (config.selection?.chaseVariant === 'self-poop' && behaviors.poopChase?.enabled) scenarios.push('poop-chase');
  if (config.selection?.chaseVariant === 'cursor-centipede' && behaviors.centipede?.enabled) scenarios.push('centipede');
  return scenarios;
}

export function snapshotProject(outputRoot, skillRoot) {
  const root = path.resolve(outputRoot);
  const project = path.join(root, 'project');
  const preview = path.join(root, 'preview');
  const configPath = path.join(project, 'src', 'config', 'pet.config.json');
  const behaviorsPath = path.join(project, 'src', 'config', 'behaviors.json');
  const manifestPath = path.join(project, 'src', 'assets', 'sprites', 'manifest.json');
  const spritesRoot = path.dirname(manifestPath);
  for (const file of [configPath, behaviorsPath, manifestPath]) {
    if (!fs.existsSync(file)) throw new Error(`Workflow project input is missing: ${path.relative(root, file).replaceAll('\\', '/')}`);
  }
  const config = readJson(configPath);
  const behaviors = readJson(behaviorsPath);
  const manifest = readJson(manifestPath);
  const characters = {};
  for (const character of manifest.characters || []) characters[character.id] = characterSnapshot(project, spritesRoot, character);
  const audit = runtimeAudit(project, skillRoot);
  const snapshot = {
    schemaVersion: WORKFLOW_STATE_SCHEMA_VERSION,
    people: Array.isArray(config.characters) ? config.characters.length : 0,
    rosterFingerprint: sha256Value({
      ids: (config.characters || []).map(({ id }) => id),
      selection: {
        mode: config.selection?.mode || null,
        userCharacterId: config.selection?.userCharacterId || null,
        chaseVariant: config.selection?.chaseVariant || null,
        groupShoutSkippedReason: config.selection?.groupShoutSkippedReason || null,
        chaseSkippedReason: config.selection?.chaseSkippedReason || null
      }
    }),
    behaviorFingerprint: sha256Value(behaviors),
    runtimeFingerprint: audit.runtimeFingerprint,
    candidateFingerprint: audit.candidateFingerprint,
    characters,
    scenarios: enabledScenarios(config, behaviors),
    artifacts: {
      identityBoard: optionalArtifact(root, path.join(preview, 'identity-board.png')),
      actionContactSheet: optionalArtifact(root, path.join(preview, 'action-contact-sheet.png')),
      runtimeEvidence: optionalArtifact(root, path.join(preview, 'runtime-evidence-manifest.json')),
      selfCheckReview: optionalArtifact(root, path.join(preview, 'self-check-review.json'))
    }
  };
  snapshot.fingerprint = sha256Value({ ...snapshot, fingerprint: undefined });
  return { root, project, preview, config, behaviors, manifest, snapshot };
}

function actionChanged(previousCharacter, currentCharacter, action) {
  return previousCharacter?.actions?.[action]?.fingerprint !== currentCharacter?.actions?.[action]?.fingerprint;
}

function scenarioDependsOnChange(scenario, characterId, previousCharacter, currentCharacter, selfId) {
  let actions;
  if (scenario === 'normal') actions = characterId === selfId ? ACTION_GROUPS.normalSelf : ACTION_GROUPS.normalOther;
  else if (scenario === 'dad-shout' || scenario === 'grandpa-shout') actions = characterId === selfId ? ACTION_GROUPS.shoutSelf : ACTION_GROUPS.shoutOther;
  else if (scenario === 'poop-chase') actions = characterId === selfId ? ACTION_GROUPS.poopSelf : ACTION_GROUPS.poopOther;
  else if (scenario === 'centipede') actions = ACTION_GROUPS.centipede;
  else return true;
  return actions.some((action) => actionChanged(previousCharacter, currentCharacter, action));
}

export function diffProjectSnapshots(previous, current, config, behaviors) {
  const scenarios = enabledScenarios(config, behaviors);
  if (!previous || previous.schemaVersion !== WORKFLOW_STATE_SCHEMA_VERSION) {
    return {
      coldStart: true,
      runtimeChanged: true,
      rosterChanged: true,
      behaviorChanged: true,
      changedCharacters: Object.keys(current.characters),
      changedScenarios: scenarios,
      refreshRuntime: true
    };
  }
  const runtimeChanged = previous.candidateFingerprint !== current.candidateFingerprint;
  const rosterChanged = previous.rosterFingerprint !== current.rosterFingerprint;
  const behaviorChanged = previous.behaviorFingerprint !== current.behaviorFingerprint;
  const ids = [...new Set([...Object.keys(previous.characters || {}), ...Object.keys(current.characters || {})])].sort();
  const changedCharacters = ids.filter((id) => previous.characters?.[id]?.fingerprint !== current.characters?.[id]?.fingerprint);
  const changedScenarios = new Set();
  if (runtimeChanged || rosterChanged || behaviorChanged) {
    scenarios.forEach((scenario) => changedScenarios.add(scenario));
  } else {
    const selfId = config.selection?.userCharacterId || null;
    for (const characterId of changedCharacters) {
      for (const scenario of scenarios) {
        if (scenarioDependsOnChange(scenario, characterId, previous.characters?.[characterId], current.characters?.[characterId], selfId)) {
          changedScenarios.add(scenario);
        }
      }
    }
  }
  return {
    coldStart: false,
    runtimeChanged,
    rosterChanged,
    behaviorChanged,
    changedCharacters,
    changedScenarios: [...changedScenarios],
    refreshRuntime: runtimeChanged || rosterChanged || behaviorChanged || changedCharacters.length > 0
  };
}

export function readWorkflowState(preview) {
  const file = path.join(preview, '.workflow-state-v1.json');
  if (!fs.existsSync(file)) return null;
  try {
    const state = readJson(file);
    return state.schemaVersion === WORKFLOW_STATE_SCHEMA_VERSION ? state : null;
  } catch {
    return null;
  }
}

export function validCachedProjectPass(state, snapshot, preview) {
  if (!state || state.snapshot?.fingerprint !== snapshot.fingerprint || state.gate?.status !== 'pass') return false;
  const reportPath = path.join(preview, 'self-check-report.json');
  if (!fs.existsSync(reportPath) || state.gate.reportSha256 !== sha256File(reportPath)) return false;
  try {
    const report = readJson(reportPath);
    return report.status === 'pass' && Number(report.overallScore) >= Number(report.minScore || 90);
  } catch {
    return false;
  }
}

export function createWorkflowState(snapshot, profile, gate = {}) {
  return {
    schemaVersion: WORKFLOW_STATE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    profile,
    snapshot,
    gate: {
      status: gate.status || 'unknown',
      score: Number.isFinite(gate.score) ? gate.score : null,
      reportSha256: gate.reportSha256 || null,
      packagedSmoke: gate.packagedSmoke === true,
      performanceSmoke: gate.performanceSmoke === true
    }
  };
}

export function writeWorkflowJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.rmSync(file, { force: true });
  fs.renameSync(temporary, file);
}

export function readSelfCheckGate(preview) {
  const file = path.join(preview, 'self-check-report.json');
  if (!fs.existsSync(file)) return { status: 'missing', score: null, reportSha256: null };
  try {
    const report = readJson(file);
    return { status: report.status || 'unknown', score: Number(report.overallScore), reportSha256: sha256File(file) };
  } catch {
    return { status: 'invalid', score: null, reportSha256: sha256File(file) };
  }
}
