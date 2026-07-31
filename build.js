#!/usr/bin/env node
// build.js — Unified build for Chrome (.crx) and Firefox (.xpi)
//
// No external dependencies — uses Node.js built-in zlib to create ZIPs.
//
// Usage:
//   node build.js           # build both Chrome and Firefox packages
//   node build.js chrome    # build Chrome only
//   node build.js firefox   # build Firefox only
//   node build.js clean     # remove dist/ directory

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const SRC_DIR = path.join(ROOT, 'src');
const ICONS_DIR = path.join(ROOT, 'icons');

// ---------------------------------------------------------------------------
// Minimal ZIP writer (no external deps)
// ---------------------------------------------------------------------------
function createZipFile(entries, outputPath) {
  const centralDir = [];
  let offset = 0;

  for (const entry of entries) {
    const compressed = zlib.deflateRawSync(entry.data, { level: 9 });

    // Local file header
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    const crc = crc32(entry.data);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(entry.data.length, 22);
    const nameBuf = Buffer.from(entry.filename, 'utf8');
    header.writeUInt16LE(nameBuf.length, 26);

    fs.appendFileSync(outputPath, header);
    fs.appendFileSync(outputPath, nameBuf);
    fs.appendFileSync(outputPath, compressed);

    // Central directory record
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(entry.data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);

    centralDir.push({ record: cd, name: nameBuf, offset });
    offset += header.length + nameBuf.length + compressed.length;
  }

  let cdSize = 0;
  for (const cd of centralDir) {
    fs.appendFileSync(outputPath, cd.record);
    fs.appendFileSync(outputPath, cd.name);
    cdSize += cd.record.length + cd.name.length;
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(centralDir.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(offset, 16);
  fs.appendFileSync(outputPath, eocd);
}

let _crcTable = null;
function crc32(data) {
  const table = _crcTable || (_crcTable = buildCrcTable());
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function buildCrcTable() {
  const t = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
}

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------
function collectFiles(dir, prefix) {
  const entries = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const src = path.join(dir, item.name);
    const dest = prefix ? path.posix.join(prefix, item.name) : item.name;
    if (item.isDirectory()) {
      entries.push(...collectFiles(src, dest));
    } else {
      entries.push({ filename: dest, data: fs.readFileSync(src) });
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Build targets
// ---------------------------------------------------------------------------
function buildChrome(version) {
  console.log('\n── Chrome extension ──');
  const entries = [];
  entries.push(...collectFiles(SRC_DIR, 'src'));
  entries.push(...collectFiles(ICONS_DIR, 'icons'));

  // Chrome uses manifest.json directly
  entries.push({
    filename: 'manifest.json',
    data: fs.readFileSync(path.join(ROOT, 'manifest.json')),
  });

  // .zip (Chrome Web Store accepts .zip; Chrome also loads .crx but that
  // requires a signing key. The .zip works for sideloading via
  // chrome://extensions → Developer mode → Load unpacked).
  const zipPath = path.join(DIST, `old-reddit-redux-${version}-chrome.zip`);
  createZipFile(entries, zipPath);
  const size = fs.statSync(zipPath).size;
  console.log(`  ${zipPath} (${formatBytes(size)})`);
  console.log(`  Files: ${entries.length}`);
  return zipPath;
}

function buildFirefox(version) {
  console.log('\n── Firefox extension ──');
  const entries = [];
  entries.push(...collectFiles(SRC_DIR, 'src'));
  entries.push(...collectFiles(ICONS_DIR, 'icons'));

  // Firefox needs the Firefox-specific manifest
  const ffManifestPath = path.join(ROOT, 'manifest.firefox.json');
  const ffManifest = JSON.parse(fs.readFileSync(ffManifestPath, 'utf-8'));
  console.log(`  Manifest V${ffManifest.manifest_version}`);
  console.log(
    `  Firefox min: ${ffManifest.browser_specific_settings.gecko.strict_min_version}`
  );

  entries.push({
    filename: 'manifest.json',
    data: fs.readFileSync(ffManifestPath),
  });

  const xpiPath = path.join(DIST, `old-reddit-redux-${version}-firefox.xpi`);
  createZipFile(entries, xpiPath);
  const size = fs.statSync(xpiPath).size;
  console.log(`  ${xpiPath} (${formatBytes(size)})`);
  console.log(`  Files: ${entries.length}`);
  return xpiPath;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const target = process.argv[2] || 'both';

  if (target === 'clean') {
    if (fs.existsSync(DIST)) {
      fs.rmSync(DIST, { recursive: true, force: true });
      console.log(`[build] Cleaned ${DIST}`);
    }
    return;
  }

  const chromeManifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf-8')
  );
  const version = chromeManifest.version;

  console.log(`[build] Old Reddit Redux v${version}`);

  // Clean dist
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST, { recursive: true });

  if (target === 'both' || target === 'chrome') {
    buildChrome(version);
  }
  if (target === 'both' || target === 'firefox') {
    buildFirefox(version);
  }

  console.log(`\n[build] Done! Packages in dist/`);
  console.log(`\n── Installation ──`);
  console.log(`Chrome:`);
  console.log(`  1. Open chrome://extensions`);
  console.log(`  2. Enable "Developer mode"`);
  console.log(`  3. Drag the .zip onto the page (or extract → "Load unpacked")`);
  console.log(`\nFirefox:`);
  console.log(`  1. Open about:debugging#/runtime/this-firefox`);
  console.log(`  2. Drag the .xpi onto the page`);
  console.log(`  3. Click "Add"`);
  console.log(`\nNote: Unsigned extensions work for local/temporary use.`);
  console.log(`     To publish: Chrome Web Store or AMO (addons.mozilla.org)`);
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

main();
