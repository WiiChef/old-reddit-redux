#!/usr/bin/env node
// build-firefox.js
// Builds a Firefox-compatible XPI package from the Chrome extension source.
//
// Firefox supports Manifest V3 since v113+, but with some differences:
//   - background.service_worker -> background.scripts (WebExtension background scripts)
//   - host_permissions -> permissions (merged into permissions array)
//   - options_page -> options_ui (recommended)
//   - chrome.* namespace is supported for backward compatibility
//
// Usage: node build-firefox.js [--sign]
//   --sign: attempt to sign with web-ext-sign (requiresamo account setup)

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BUILD_DIR = path.join(__dirname, 'build', 'firefox');
const SRC_DIR = path.join(__dirname, 'src');
const ICONS_DIR = path.join(__dirname, 'icons');

function rmrf(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const shouldSign = args.includes('--sign');

  console.log('[build-firefox] Cleaning build directory...');
  rmrf(BUILD_DIR);
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  console.log('[build-firefox] Copying source files...');
  copyDir(SRC_DIR, path.join(BUILD_DIR, 'src'));

  console.log('[build-firefox] Copying icons...');
  copyDir(ICONS_DIR, path.join(BUILD_DIR, 'icons'));

  console.log('[build-firefox] Copying Firefox manifest...');
  fs.copyFileSync(
    path.join(__dirname, 'manifest.firefox.json'),
    path.join(BUILD_DIR, 'manifest.json')
  );

  // Verify the manifest is valid JSON
  const manifest = JSON.parse(fs.readFileSync(path.join(BUILD_DIR, 'manifest.json'), 'utf-8'));
  console.log(`[build-firefox] Manifest V${manifest.manifest_version} — ${manifest.name} v${manifest.version}`);
  console.log(`[build-firefox] Firefox min version: ${manifest.browser_specific_settings.gecko.strict_min_version}`);

  // Package as XPI (XPI is just a ZIP with a different extension)
  const xpiPath = path.join(__dirname, 'build', 'old-reddit-redux-${version}.xpi');
  console.log(`[build-firefox] Packaging XPI...`);

  try {
    // Use web-ext if available, otherwise fall back to zip
    execSync('which web-ext || where web-ext', { stdio: 'ignore' });
    execSync(
      `web-ext build --source-dir "${BUILD_DIR}" --artifacts-dir "${path.join(__dirname, 'build')}" --filename "old-reddit-redux-${manifest.version}.xpi"`,
      { stdio: 'inherit' }
    );
    console.log('[build-firefox] XPI packaged successfully with web-ext');
  } catch {
    // web-ext not available, use zip directly
    try {
      execSync(
        `cd "${BUILD_DIR}" && zip -r "${path.join(__dirname, 'build', `old-reddit-redux-${manifest.version}.xpi`)}" .`,
        { stdio: 'inherit' }
      );
      console.log('[build-firefox] XPI packaged successfully with zip');
    } catch (err) {
      console.error('[build-firefox] Failed to package XPI:', err.message);
      console.log(`[build-firefox] Build directory available at: ${BUILD_DIR}`);
      console.log('[build-firefox] You can load it in Firefox as an unpacked add-on:');
      console.log('  1. Open Firefox and go to about:debugging');
      console.log('  2. Click "This Firefox" -> "Load Temporary Add-on"');
      console.log(`  3. Select manifest.json from: ${BUILD_DIR}`);
      process.exit(1);
    }
  }

  if (shouldSign) {
    console.log('[build-firefox] Attempting to sign for AMO submission...');
    try {
      execSync('web-ext sign --source-dir build/firefox', { stdio: 'inherit' });
      console.log('[build-firefox] Signed successfully!');
    } catch (err) {
      console.error('[build-firefox] Signing failed. Make sure you have web-ext installed and are logged in.');
      console.log('[build-firefox] To sign manually: npm install -g web-ext && web-ext sign --source-dir build/firefox');
    }
  }

  console.log(`\n[build-firefox] Done! Output: ${BUILD_DIR}`);
  console.log('[build-firefox] To load in Firefox:');
  console.log('  1. Open about:debugging#/runtime/this-firefox');
  console.log('  2. Click "Load Temporary Add-on"');
  console.log(`  3. Select ${BUILD_DIR}/manifest.json`);
}

main();
