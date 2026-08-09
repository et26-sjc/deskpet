import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { repairMissingMacFrameworkSymlinks } from '../lib/common.mjs';

test('macOS packaging ad-hoc signs and strictly verifies the app after plist and resource changes', () => {
  const packagerSource = fs.readFileSync(
    new URL('../../assets/electron-template/tools/package-current.mjs', import.meta.url),
    'utf8'
  );
  const installIndex = packagerSource.indexOf("installApp(path.join(contents, 'Resources'))");
  const plistIndex = packagerSource.indexOf("spawnSync('/usr/bin/plutil'");
  const signIndex = packagerSource.indexOf("spawnSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', output]");
  const verifyIndex = packagerSource.indexOf("spawnSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', output]");
  const reportIndex = packagerSource.indexOf("console.log(JSON.stringify({ platform: 'macos'");

  assert.ok(installIndex >= 0, 'macOS packaging must install app resources');
  assert.ok(plistIndex > installIndex, 'macOS packaging must update Info.plist after installing resources');
  assert.ok(signIndex > plistIndex, 'macOS packaging must ad-hoc sign after plist and resource mutations');
  assert.ok(verifyIndex > signIndex, 'macOS packaging must strictly verify after signing');
  assert.ok(reportIndex > verifyIndex, 'macOS packaging must not report success before signature verification');
});

test('repairs every pinned macOS framework symlink from the verified Electron archive', (t) => {
  if (process.platform !== 'darwin') return t.skip('macOS-only filesystem semantics');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-electron-links-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const frameworksRoot = path.join(
    root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'Frameworks'
  );
  const specs = [
    ['Electron Framework', ['Electron Framework', 'Resources', 'Libraries', 'Helpers']],
    ['ReactiveObjC', ['ReactiveObjC', 'Resources']],
    ['Squirrel', ['Squirrel', 'Resources']],
    ['Mantle', ['Mantle', 'Resources']]
  ];

  for (const [name, entries] of specs) {
    const framework = path.join(frameworksRoot, `${name}.framework`);
    const version = path.join(framework, 'Versions', 'A');
    fs.mkdirSync(version, { recursive: true });
    for (const entry of entries) {
      const target = path.join(version, entry);
      if (entry === name) fs.writeFileSync(target, 'fixture');
      else {
        fs.mkdirSync(target, { recursive: true });
        fs.writeFileSync(path.join(target, 'fixture.txt'), 'fixture');
      }
    }
    fs.cpSync(version, path.join(framework, 'Versions', 'Current'), { recursive: true });
    for (const entry of entries) {
      const source = path.join(version, entry);
      const duplicate = path.join(framework, entry);
      if (entry === name) fs.copyFileSync(source, duplicate);
      else fs.cpSync(source, duplicate, { recursive: true });
    }
  }

  repairMissingMacFrameworkSymlinks(root);

  for (const [name, entries] of specs) {
    const framework = path.join(frameworksRoot, `${name}.framework`);
    assert.equal(fs.readlinkSync(path.join(framework, 'Versions', 'Current')), 'A');
    for (const entry of entries) {
      assert.equal(
        fs.readlinkSync(path.join(framework, entry)),
        path.join('Versions', 'Current', entry)
      );
    }
  }
});

test('does not create a framework symlink when its fixed target is absent', (t) => {
  if (process.platform !== 'darwin') return t.skip('macOS-only filesystem semantics');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-electron-links-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const framework = path.join(
    root,
    'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'Frameworks',
    'Electron Framework.framework'
  );
  fs.mkdirSync(framework, { recursive: true });

  repairMissingMacFrameworkSymlinks(root);

  assert.equal(fs.existsSync(path.join(framework, 'Versions', 'Current')), false);
  assert.equal(fs.existsSync(path.join(framework, 'Resources')), false);
  assert.equal(fs.existsSync(path.join(framework, 'Electron Framework')), false);
});
