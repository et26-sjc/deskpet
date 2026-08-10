import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sensitivePathMatches } from './privacy.mjs';
import { sha256File, sha256Value, writeWorkflowJson } from './workflow-state.mjs';

export const PERFORMANCE_CACHE_SCHEMA_VERSION = 1;
export const PERFORMANCE_FIXTURE_VERSION = 2;
export const PERFORMANCE_CONTRACT_VERSION = 1;
export const PERFORMANCE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function defaultPerformanceCacheRoot() {
  const codexHome = process.env.CODEX_HOME ? path.resolve(process.env.CODEX_HOME) : path.join(os.homedir(), '.codex');
  return path.join(codexHome, 'cache', 'love-roommate', 'performance-v1');
}

export function performanceContractFingerprint(audit) {
  return sha256Value({
    contractVersion: PERFORMANCE_CONTRACT_VERSION,
    reportSchemaVersion: audit.PERFORMANCE_REPORT_SCHEMA_VERSION,
    fingerprintSchemaVersion: audit.PERFORMANCE_FINGERPRINT_SCHEMA_VERSION,
    thresholds: audit.DEFAULT_PERFORMANCE_THRESHOLDS,
    metricSource: audit.PERFORMANCE_METRIC_SOURCE
  });
}

export function performanceCacheIdentity({ candidateFingerprint, electronVersion, platform, arch, performanceContractFingerprint: contractFingerprint }) {
  return {
    candidateFingerprint,
    electronVersion,
    platform,
    arch,
    performanceContractVersion: PERFORMANCE_CONTRACT_VERSION,
    performanceContractFingerprint: contractFingerprint,
    fixtureVersion: PERFORMANCE_FIXTURE_VERSION
  };
}

export function performanceCacheKey(identity) {
  return crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}

function safeRelative(value) {
  return typeof value === 'string' && value.length > 0 && !path.isAbsolute(value) && !value.split(/[\\/]/).includes('..');
}

function hasForbiddenCacheText(value) {
  const text = JSON.stringify(value);
  if (sensitivePathMatches(text).length) return true;
  return /(?:sourcePhoto|displayName|legalName|userName|originalPhoto|photoPath)\s*[\"']?\s*:/i.test(text);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function validatePerformanceCacheRecord(record, identity, cacheEntryRoot, now = Date.now()) {
  const reasons = [];
  if (!record || record.schemaVersion !== PERFORMANCE_CACHE_SCHEMA_VERSION) reasons.push('schema');
  if (JSON.stringify(record?.identity) !== JSON.stringify(identity)) reasons.push('identity');
  const createdAt = Date.parse(record?.createdAt || '');
  if (!Number.isFinite(createdAt) || now - createdAt > PERFORMANCE_CACHE_MAX_AGE_MS || createdAt > now + 60_000) reasons.push('age');
  if (record?.status !== 'pass') reasons.push('status');
  if (hasForbiddenCacheText(record)) reasons.push('privacy');
  for (const [label, expectedPeople] of [['five', 5], ['eight', 8]]) {
    const evidence = record?.evidence?.[label];
    if (!evidence || evidence.people !== expectedPeople) {
      reasons.push(`${label}-people`);
      continue;
    }
    for (const key of ['project', 'report', 'executable', 'packagedRoot']) {
      if (!safeRelative(evidence[key])) reasons.push(`${label}-${key}`);
    }
    if (reasons.some((reason) => reason.startsWith(`${label}-`))) continue;
    const reportPath = path.resolve(cacheEntryRoot, evidence.report);
    const executablePath = path.resolve(cacheEntryRoot, evidence.executable);
    const projectPath = path.resolve(cacheEntryRoot, evidence.project);
    const packagedRoot = path.resolve(cacheEntryRoot, evidence.packagedRoot);
    if (![reportPath, executablePath, projectPath, packagedRoot].every((target) => target === cacheEntryRoot || target.startsWith(`${cacheEntryRoot}${path.sep}`))) {
      reasons.push(`${label}-escape`);
      continue;
    }
    if (!fs.existsSync(reportPath) || !fs.existsSync(executablePath) || !fs.existsSync(projectPath) || !fs.existsSync(packagedRoot)) {
      reasons.push(`${label}-missing`);
      continue;
    }
    if (sha256File(reportPath) !== evidence.reportSha256) reasons.push(`${label}-report-hash`);
    if (sha256File(executablePath) !== evidence.executableSha256) reasons.push(`${label}-executable-hash`);
    try {
      const report = readJson(reportPath);
      if (hasForbiddenCacheText(report)) reasons.push(`${label}-report-privacy`);
      if (report.status !== 'pass' || report.expectedWindowCount !== expectedPeople || report.candidateFingerprint !== identity.candidateFingerprint) {
        reasons.push(`${label}-report-contract`);
      }
    } catch {
      reasons.push(`${label}-report-json`);
    }
  }
  return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function loadPerformanceCache(cacheRoot, identity, now = Date.now()) {
  const key = performanceCacheKey(identity);
  const entryRoot = path.join(path.resolve(cacheRoot), key);
  const recordPath = path.join(entryRoot, 'record.json');
  if (!fs.existsSync(recordPath)) return { hit: false, key, entryRoot, record: null, reasons: ['missing'] };
  try {
    const record = readJson(recordPath);
    const validation = validatePerformanceCacheRecord(record, identity, entryRoot, now);
    return { hit: validation.valid, key, entryRoot, record, reasons: validation.reasons };
  } catch {
    return { hit: false, key, entryRoot, record: null, reasons: ['invalid-json'] };
  }
}

export function cacheEvidencePaths(entryRoot, record) {
  const resolveEvidence = (entry) => ({
    project: path.resolve(entryRoot, entry.project),
    report: path.resolve(entryRoot, entry.report),
    executable: path.resolve(entryRoot, entry.executable),
    packagedRoot: path.resolve(entryRoot, entry.packagedRoot)
  });
  return {
    five: resolveEvidence(record.evidence.five),
    eight: resolveEvidence(record.evidence.eight)
  };
}

export function writePerformanceCacheRecord(entryRoot, identity, evidence) {
  const relativeEvidence = {};
  for (const [label, people] of [['five', 5], ['eight', 8]]) {
    const item = evidence[label];
    const relative = (target) => path.relative(entryRoot, target).replaceAll('\\', '/');
    relativeEvidence[label] = {
      people,
      project: relative(item.project),
      report: relative(item.report),
      reportSha256: sha256File(item.report),
      executable: relative(item.executable),
      executableSha256: sha256File(item.executable),
      packagedRoot: relative(item.packagedRoot)
    };
  }
  const record = {
    schemaVersion: PERFORMANCE_CACHE_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    status: 'pass',
    identity,
    evidence: relativeEvidence
  };
  if (hasForbiddenCacheText(record)) throw new Error('Performance cache record contains private or absolute path data.');
  writeWorkflowJson(path.join(entryRoot, 'record.json'), record);
  return record;
}
