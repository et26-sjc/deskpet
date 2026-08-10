import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  applyCodexRuntimeArgs,
  ensureElectronRuntime,
  fail,
  parseArgs
} from './lib/common.mjs';
import {
  cacheEvidencePaths,
  defaultPerformanceCacheRoot,
  loadPerformanceCache,
  performanceCacheIdentity,
  performanceContractFingerprint,
  writePerformanceCacheRecord
} from './lib/performance-cache.mjs';
import {
  WORKFLOW_SUMMARY_SCHEMA_VERSION,
  createWorkflowState,
  diffProjectSnapshots,
  readSelfCheckGate,
  readWorkflowState,
  sha256File,
  snapshotProject,
  validCachedProjectPass,
  writeWorkflowJson
} from './lib/workflow-state.mjs';

const args = parseArgs(process.argv.slice(2));
applyCodexRuntimeArgs(args);
const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptRoot, '..');
const profile = args.profile;
const allowedProfiles = new Set(['iteration', 'delivery', 'skill-release']);
if (!allowedProfiles.has(profile)) {
  fail('Usage: node run_workflow.mjs --profile <iteration|delivery|skill-release> [--root <output-root>] [--source <photo>] [--pnpm <path>] [--node-modules <path>]');
}

const startedAt = Date.now();
const logRoot = path.join(os.tmpdir(), 'love-roommate-workflow-logs', `${Date.now()}-${process.pid}`);
fs.mkdirSync(logRoot, { recursive: true });
const stages = [];

function safeStageName(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'stage';
}

function tail(text, lines = 120) {
  return String(text || '').split(/\r?\n/).slice(-lines).join('\n').trim();
}

function runStage(label, command, commandArgs, options = {}) {
  const stageStartedAt = Date.now();
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd || skillRoot,
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: options.timeoutMs
  });
  const elapsedMs = Date.now() - stageStartedAt;
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  fs.writeFileSync(path.join(logRoot, `${String(stages.length + 1).padStart(2, '0')}-${safeStageName(label)}.log`), output, 'utf8');
  const status = result.status === 0 && !result.error ? 'pass' : 'fail';
  stages.push({ id: safeStageName(label), label, status, durationMs: elapsedMs, cache: options.cache || 'miss' });
  if (status === 'pass') {
    console.log(`[pass] ${label} (${(elapsedMs / 1000).toFixed(1)}s${options.cache ? `, cache ${options.cache}` : ''})`);
    return { ...result, output };
  }
  console.error(`[fail] ${label} (${(elapsedMs / 1000).toFixed(1)}s)`);
  if (result.error) console.error(result.error.message);
  const excerpt = tail(output);
  if (excerpt) console.error(excerpt);
  console.error(`Full diagnostic log: ${logRoot}`);
  throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}.`);
}

function runNodeStage(label, script, scriptArgs, options = {}) {
  return runStage(label, process.execPath, [script, ...scriptArgs], options);
}

function runtimeCliArgs() {
  const values = [];
  if (typeof args.pnpm === 'string') values.push('--pnpm', path.resolve(args.pnpm));
  if (typeof args['node-modules'] === 'string') values.push('--node-modules', path.resolve(args['node-modules']));
  return values;
}

function parseLastJson(text) {
  const source = String(text || '').trim();
  for (let index = source.lastIndexOf('{'); index >= 0; index = source.lastIndexOf('{', index - 1)) {
    try {
      return JSON.parse(source.slice(index));
    } catch {
      // Continue to an earlier object boundary.
    }
  }
  return null;
}

function findPackagedExecutable(artifact) {
  if (process.platform === 'win32') {
    const executables = fs.readdirSync(artifact, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.exe'))
      .map((entry) => path.join(artifact, entry.name));
    if (executables.length !== 1) throw new Error(`Expected one packaged executable, found ${executables.length}.`);
    return executables[0];
  }
  const name = path.basename(artifact, '.app');
  return path.join(artifact, 'Contents', 'MacOS', name);
}

function projectSummaryBase(root, changes) {
  return {
    schemaVersion: WORKFLOW_SUMMARY_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    profile,
    status: 'running',
    people: changes.people,
    cache: changes.cache,
    changes: {
      runtime: changes.diff.runtimeChanged,
      roster: changes.diff.rosterChanged,
      behavior: changes.diff.behaviorChanged,
      characters: changes.diff.changedCharacters,
      scenarios: changes.diff.changedScenarios
    },
    stages,
    evidenceRefs: [],
    manualChecksRequired: [],
    durationMs: 0
  };
}

function readGateOrThrow(preview) {
  const gate = readSelfCheckGate(preview);
  if (gate.status !== 'pass' || gate.score < 90) throw new Error(`Self-check gate is ${gate.status} at ${gate.score ?? 'unknown'}/100.`);
  return gate;
}

function enabledScenarioRefresh(diff) {
  return diff.changedScenarios.filter((scenario) => scenario !== 'normal');
}

async function runProjectWorkflow() {
  if (typeof args.root !== 'string') fail(`--root is required for the ${profile} profile.`);
  const root = path.resolve(args.root);
  const initial = snapshotProject(root, skillRoot);
  const previousState = readWorkflowState(initial.preview);
  let diff = diffProjectSnapshots(previousState?.snapshot || null, initial.snapshot, initial.config, initial.behaviors);
  const sourceArgs = typeof args.source === 'string' ? ['--source', path.resolve(args.source)] : [];
  const nodeArgs = runtimeCliArgs();
  const validateScript = path.join(scriptRoot, 'validate_project.mjs');
  const selfCheckScript = path.join(scriptRoot, 'self_check_project.mjs');
  const contactSheetScript = path.join(scriptRoot, 'make_contact_sheet.mjs');
  const privacyScript = path.join(scriptRoot, 'audit_output_privacy.mjs');
  const buildScript = path.join(scriptRoot, 'build_project.mjs');
  const performanceScript = path.join(scriptRoot, 'run_performance_audit.mjs');
  const performanceValidator = path.join(scriptRoot, 'validate_performance_report.mjs');
  const contactSheet = path.join(initial.preview, 'action-contact-sheet.png');

  runNodeStage('project validation', validateScript, ['--project', initial.project, ...sourceArgs, ...nodeArgs]);
  if (!fs.existsSync(contactSheet) || (previousState && diff.changedCharacters.length > 0)) {
    runNodeStage('action contact sheet', contactSheetScript, ['--project', initial.project, '--out', contactSheet, ...nodeArgs]);
  } else {
    stages.push({ id: 'action-contact-sheet', label: 'action contact sheet', status: 'pass', durationMs: 0, cache: 'hit' });
    console.log('[pass] action contact sheet (cache hit)');
  }

  let current = snapshotProject(root, skillRoot);
  diff = diffProjectSnapshots(previousState?.snapshot || null, current.snapshot, current.config, current.behaviors);
  const cacheHit = validCachedProjectPass(previousState, current.snapshot, current.preview);
  if (profile === 'iteration' && cacheHit) {
    stages.push({ id: 'self-check', label: 'self-check', status: 'pass', durationMs: 0, cache: 'hit' });
    console.log('[pass] self-check (cache hit)');
  } else {
    runNodeStage('self-check', selfCheckScript, ['--project', current.project, '--preview', current.preview, '--warn-only', ...nodeArgs]);
  }
  let gate = readSelfCheckGate(current.preview);

  if (!previousState && gate.status === 'pass') {
    diff = {
      coldStart: false,
      runtimeChanged: false,
      rosterChanged: false,
      behaviorChanged: false,
      changedCharacters: [],
      changedScenarios: [],
      refreshRuntime: false
    };
  }

  const changeContext = {
    people: current.snapshot.people,
    cache: cacheHit ? 'hit' : 'miss',
    diff
  };
  const summary = projectSummaryBase(root, changeContext);

  if (profile === 'iteration') {
    summary.status = gate.status;
    summary.evidenceRefs = ['preview/identity-board.png', 'preview/action-contact-sheet.png', 'preview/self-check-report.json'];
    summary.nextAction = gate.status === 'pass'
      ? 'No changed project evidence requires review.'
      : 'Review only the changed characters and affected scenarios listed in this summary.';
    summary.durationMs = Date.now() - startedAt;
    const state = createWorkflowState(current.snapshot, profile, gate);
    writeWorkflowJson(path.join(current.preview, '.workflow-state-v1.json'), state);
    writeWorkflowJson(path.join(current.preview, 'workflow-summary.json'), summary);
    console.log(`[done] iteration ${summary.status}; ${diff.changedCharacters.length} character(s), ${diff.changedScenarios.length} scenario(s) changed.`);
    return;
  }

  const buildArgs = [
    '--project', current.project,
    ...sourceArgs,
    ...nodeArgs,
    '--performance-profile', 'quick'
  ];
  if (diff.refreshRuntime) buildArgs.push('--refresh-runtime');
  const scenarioRefresh = enabledScenarioRefresh(diff);
  if (scenarioRefresh.length) buildArgs.push('--refresh-scenarios', scenarioRefresh.join(','));
  const build = runNodeStage('packaged delivery build', buildScript, buildArgs, { timeoutMs: 30 * 60 * 1000 });
  const buildResult = parseLastJson(build.stdout || build.output);
  if (!buildResult || !Array.isArray(buildResult.artifacts) || buildResult.artifacts.length !== 1) {
    throw new Error('Packaged build did not return one release artifact.');
  }
  const artifact = path.resolve(root, buildResult.artifacts[0]);
  const executable = findPackagedExecutable(artifact);
  const packagedRoot = process.platform === 'win32'
    ? path.join(artifact, 'resources', 'app')
    : path.join(artifact, 'Contents', 'Resources', 'app');

  let performanceSmoke = false;
  if (process.platform === 'win32') {
    const report = path.join(current.preview, 'performance', 'windows-performance-smoke.json');
    runNodeStage('packaged performance smoke', performanceScript, [
      '--project', current.project,
      '--executable', executable,
      '--report', report,
      '--quick',
      '--timeout-ms', '120000'
    ], { timeoutMs: 150000 });
    runNodeStage('performance smoke validation', performanceValidator, [
      '--project', current.project,
      '--report', report,
      '--executable', executable,
      '--packaged-root', packagedRoot,
      '--profile', 'quick'
    ]);
    performanceSmoke = true;
  }
  runNodeStage('post-delivery privacy audit', privacyScript, ['--root', root, ...sourceArgs]);
  gate = readGateOrThrow(current.preview);
  current = snapshotProject(root, skillRoot);
  const state = createWorkflowState(current.snapshot, profile, {
    ...gate,
    packagedSmoke: true,
    performanceSmoke
  });
  writeWorkflowJson(path.join(current.preview, '.workflow-state-v1.json'), state);
  summary.status = 'pass-automated';
  summary.evidenceRefs = [
    'preview/self-check-report.json',
    `preview/${process.platform === 'win32' ? 'windows' : 'macos'}-packaged-evidence-manifest.json`,
    ...(performanceSmoke ? ['preview/performance/windows-performance-smoke.json'] : [])
  ];
  summary.manualChecksRequired = ['tray pause/quit', 'drag', 'right-click', 'transparent-pixel click-through'];
  summary.artifact = buildResult.artifacts[0];
  summary.durationMs = Date.now() - startedAt;
  writeWorkflowJson(path.join(current.preview, 'workflow-summary.json'), summary);
  console.log(`[done] delivery automated gates passed; manual packaged interaction checks remain (${summary.manualChecksRequired.length}).`);
}

function fixtureManifest(count) {
  const frames = {
    crawl_right: ['placeholder.svg'],
    crawl_left: ['placeholder.svg'],
    idle_right: ['placeholder.svg'],
    idle_left: ['placeholder.svg'],
    centipede_right: ['placeholder.svg'],
    centipede_left: ['placeholder.svg'],
    shout: ['placeholder.svg', 'placeholder.svg', 'placeholder.svg'],
    drag: ['placeholder.svg'],
    poop_right: ['placeholder.svg'],
    poop_left: ['placeholder.svg'],
    eat_right: ['placeholder.svg'],
    eat_left: ['placeholder.svg']
  };
  return {
    schemaVersion: 1,
    spriteSize: 112,
    characters: Array.from({ length: count }, (_, index) => ({
      id: `person-${index + 1}`,
      frames,
      anchors: {
        right: { head: [0.82, 0.38], mouth: [0.82, 0.38], rear: [0.18, 0.62] },
        left: { head: [0.18, 0.38], mouth: [0.18, 0.38], rear: [0.82, 0.62] }
      }
    }))
  };
}

function preparePerformanceFixture(count, entryRoot) {
  const label = count === 5 ? 'five' : 'eight';
  const fixtureRoot = path.join(entryRoot, 'fixtures', label);
  const project = path.join(fixtureRoot, 'project');
  if (!fixtureRoot.startsWith(`${entryRoot}${path.sep}`)) throw new Error('Unsafe performance fixture path.');
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  fs.mkdirSync(fixtureRoot, { recursive: true });
  fs.cpSync(path.join(skillRoot, 'assets', 'electron-template'), project, {
    recursive: true,
    filter: (source) => !['node_modules', 'dist'].includes(path.basename(source))
  });
  const configPath = path.join(project, 'src', 'config', 'pet.config.json');
  const behaviorsPath = path.join(project, 'src', 'config', 'behaviors.json');
  const manifestPath = path.join(project, 'src', 'assets', 'sprites', 'manifest.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.app.name = 'Love Roommate Performance Fixture';
  config.characters = Array.from({ length: count }, (_, index) => ({ id: `person-${index + 1}`, displayName: `Fixture ${index + 1}`, hueRotate: 0 }));
  config.selection = {
    mode: 'all',
    userCharacterId: 'person-1',
    prankExcludedCharacterIds: ['person-1'],
    chaseVariant: 'self-poop',
    groupShoutSkippedReason: null,
    chaseSkippedReason: null
  };
  const behaviors = JSON.parse(fs.readFileSync(behaviorsPath, 'utf8'));
  behaviors.groupShout.enabled = true;
  behaviors.groupShout.skippedReason = null;
  behaviors.poopChase.enabled = true;
  behaviors.poopChase.leaderId = 'person-1';
  behaviors.poopChase.followerIds = config.characters.slice(1).map(({ id }) => id);
  behaviors.poopChase.skippedReason = null;
  writeWorkflowJson(configPath, config);
  writeWorkflowJson(behaviorsPath, behaviors);
  writeWorkflowJson(manifestPath, fixtureManifest(count));
  return project;
}

function packagePerformanceFixture(label, project) {
  const electronRuntime = ensureElectronRuntime(project);
  const packageScript = path.join(project, 'tools', 'package-current.mjs');
  runNodeStage(`${label} fixture package`, packageScript, [], {
    cwd: project,
    env: { PET_ELECTRON_DIST: electronRuntime.dist },
    timeoutMs: 10 * 60 * 1000
  });
  const artifact = path.join(project, 'dist', 'windows', 'Love Roommate');
  const executable = path.join(artifact, 'Love Roommate.exe');
  const packagedRoot = path.join(artifact, 'resources', 'app');
  if (!fs.existsSync(executable) || !fs.existsSync(packagedRoot)) throw new Error(`${label} performance fixture packaging is incomplete.`);
  return { project, artifact, executable, packagedRoot };
}

function warmPerformanceFixture(label, fixture, entryRoot) {
  const warmupRoot = path.join(entryRoot, 'warmup', label);
  if (warmupRoot === entryRoot || !warmupRoot.startsWith(`${entryRoot}${path.sep}`)) throw new Error('Unsafe performance warmup path.');
  fs.rmSync(warmupRoot, { recursive: true, force: true });
  fs.mkdirSync(warmupRoot, { recursive: true });
  const smoke = path.join(warmupRoot, 'smoke.png');
  const errorFile = path.join(warmupRoot, 'runtime-smoke-error.txt');
  runStage(`${label} fixture packaged smoke`, fixture.executable, [`--user-data-dir=${path.join(warmupRoot, 'user-data')}`], {
    cwd: fixture.artifact,
    env: {
      PET_SMOKE_TEST: '1',
      PET_SMOKE_OUT: smoke,
      PET_SMOKE_CAPTURE_AT_MS: '1800',
      PET_SMOKE_TIMEOUT_MS: '12000'
    },
    timeoutMs: 20_000
  });
  if (fs.existsSync(errorFile)) throw new Error(`${label} packaged smoke failed: ${tail(fs.readFileSync(errorFile, 'utf8'), 20)}`);
  if (!fs.existsSync(smoke)) throw new Error(`${label} packaged smoke did not produce its technical frame.`);
  fs.rmSync(warmupRoot, { recursive: true, force: true });
}

function validatePerformanceRelease(evidence, cache = 'miss') {
  return runNodeStage('5+8 performance release validation', path.join(scriptRoot, 'validate_performance_release.mjs'), [
    '--five-project', evidence.five.project,
    '--five-report', evidence.five.report,
    '--five-executable', evidence.five.executable,
    '--five-packaged-root', evidence.five.packagedRoot,
    '--eight-project', evidence.eight.project,
    '--eight-report', evidence.eight.report,
    '--eight-executable', evidence.eight.executable,
    '--eight-packaged-root', evidence.eight.packagedRoot
  ], { cache });
}

async function runSkillReleaseWorkflow() {
  runNodeStage('complete Skill release check', path.join(scriptRoot, 'release_check.mjs'), [], { timeoutMs: 30 * 60 * 1000 });
  const require = createRequire(import.meta.url);
  const audit = require(path.join(skillRoot, 'assets', 'electron-template', 'src', 'performance-audit.js'));
  const template = path.join(skillRoot, 'assets', 'electron-template');
  const packageJson = JSON.parse(fs.readFileSync(path.join(template, 'package.json'), 'utf8'));
  const identity = performanceCacheIdentity({
    candidateFingerprint: audit.candidateFingerprintForProject(template),
    electronVersion: packageJson.devDependencies.electron,
    platform: process.platform,
    arch: process.arch,
    performanceContractFingerprint: performanceContractFingerprint(audit)
  });
  const cacheRoot = typeof args['cache-root'] === 'string' ? path.resolve(args['cache-root']) : defaultPerformanceCacheRoot();
  fs.mkdirSync(cacheRoot, { recursive: true });
  let cached = loadPerformanceCache(cacheRoot, identity);
  if (args['refresh-performance-cache']) cached = { ...cached, hit: false, reasons: ['forced-refresh'] };
  let evidence;
  let cacheStatus;
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    stages.push({ id: 'windows-performance-cache', label: 'Windows 5+8 performance cache', status: 'pass', durationMs: 0, cache: 'not-applicable' });
    cacheStatus = 'not-applicable';
  } else if (cached.hit) {
    evidence = cacheEvidencePaths(cached.entryRoot, cached.record);
    validatePerformanceRelease(evidence, 'hit');
    cacheStatus = 'hit';
  } else {
    const entryRoot = cached.entryRoot;
    const resolvedCacheRoot = path.resolve(cacheRoot);
    if (entryRoot === resolvedCacheRoot || !entryRoot.startsWith(`${resolvedCacheRoot}${path.sep}`)) throw new Error('Unsafe performance cache entry path.');
    fs.rmSync(entryRoot, { recursive: true, force: true });
    fs.mkdirSync(entryRoot, { recursive: true });
    const fiveProject = preparePerformanceFixture(5, entryRoot);
    const eightProject = preparePerformanceFixture(8, entryRoot);
    const five = packagePerformanceFixture('five-window', fiveProject);
    const eight = packagePerformanceFixture('eight-window', eightProject);
    const reports = path.join(entryRoot, 'reports');
    fs.mkdirSync(reports, { recursive: true });
    five.report = path.join(reports, 'five.json');
    eight.report = path.join(reports, 'eight.json');
    warmPerformanceFixture('five-window', five, entryRoot);
    runNodeStage('five-window full performance audit', path.join(scriptRoot, 'run_performance_audit.mjs'), [
      '--project', five.project,
      '--executable', five.executable,
      '--report', five.report
    ], { timeoutMs: 30 * 60 * 1000 });
    warmPerformanceFixture('eight-window', eight, entryRoot);
    runNodeStage('eight-window full performance audit', path.join(scriptRoot, 'run_performance_audit.mjs'), [
      '--project', eight.project,
      '--executable', eight.executable,
      '--report', eight.report
    ], { timeoutMs: 30 * 60 * 1000 });
    evidence = { five, eight };
    validatePerformanceRelease(evidence, 'miss');
    writePerformanceCacheRecord(entryRoot, identity, evidence);
    const validation = loadPerformanceCache(cacheRoot, identity);
    if (!validation.hit) throw new Error(`New performance cache failed validation: ${validation.reasons.join(', ')}`);
    cacheStatus = 'miss-refreshed';
  }
  const summary = {
    schemaVersion: WORKFLOW_SUMMARY_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    profile,
    status: 'pass',
    candidateFingerprint: identity.candidateFingerprint,
    performanceCache: cacheStatus,
    stages,
    durationMs: Date.now() - startedAt
  };
  writeWorkflowJson(path.join(cacheRoot, 'last-skill-release-summary.json'), summary);
  console.log(`[done] Skill release passed; performance cache ${cacheStatus}.`);
}

try {
  if (profile === 'skill-release') await runSkillReleaseWorkflow();
  else await runProjectWorkflow();
} catch (error) {
  console.error(`ERROR: ${error?.message || error}`);
  process.exit(1);
}
