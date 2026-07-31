#!/usr/bin/env node
// build.js — Build a plain ZIP for unpacked extension loading
//
// Produces a .zip containing manifest.json, src/, and icons/ ready
// for Chrome "Load unpacked" and Firefox "Load Temporary Add-on".
//
// Usage:
//   npm run build          # build the ZIP
//   npm run build:clean    # remove dist/

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const SRC_DIR = path.join(ROOT, 'src');
const ICONS_DIR = path.join(ROOT, 'icons');

// ---------------------------------------------------------------------------
// ZIP creation
// ---------------------------------------------------------------------------
function createZipBuffer(entries) {
  const centralDir = [];
  let offset = 0;
  const chunks = [];

  for (const entry of entries) {
    const compressed = zlib.deflateRawSync(entry.data, { level: 9 });

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

    chunks.push(header, nameBuf, compressed);

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

    centralDir.push({ record: cd, name: nameBuf });
    offset += header.length + nameBuf.length + compressed.length;
  }

  let cdSize = 0;
  for (const cd of centralDir) {
    chunks.push(cd.record, cd.name);
    cdSize += cd.record.length + cd.name.length;
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(centralDir.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(offset, 16);
  chunks.push(eocd);

  return Buffer.concat(chunks);
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
// Build
// ---------------------------------------------------------------------------
function main() {
  const target = process.argv[2] || 'build';

  if (target === 'clean') {
    if (fs.existsSync(DIST)) {
      fs.rmSync(DIST, { recursive: true, force: true });
      console.log(`[build] Cleaned ${DIST}`);
    }
    return;
  }

  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf-8')
  );
  const version = manifest.version;

  console.log(`[build] Old Reddit Redux v${version}`);

  // Clean and recreate dist
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST, { recursive: true });

  // Collect all extension files
  const entries = [];
  entries.push(...collectFiles(SRC_DIR, 'src'));
  entries.push(...collectFiles(ICONS_DIR, 'icons'));
  entries.push({
    filename: 'manifest.json',
    data: fs.readFileSync(path.join(ROOT, 'manifest.json')),
  });

  // Build ZIP
  const zipData = createZipBuffer(entries);
  const zipPath = path.join(DIST, `old-reddit-redux-${version}.zip`);
  fs.writeFileSync(zipPath, zipData);

  console.log(`\n  ${zipPath} (${formatBytes(zipData.length)})`);
  console.log(`  Files: ${entries.length}`);

  console.log(`\n[build] Done!`);
  console.log(`\n── Installation ──`);
  console.log(`Chrome:`);
  console.log(`  1. Open chrome://extensions`);
  console.log(`  2. Enable "Developer mode"`);
  console.log(`  3. Click "Load unpacked"`);
  console.log(`  4. Select the dist/ folder (or unzip first)`);
  console.log(``);
  console.log(`Firefox:`);
  console.log(`  1. Open about:debugging`);
  console.log(`  2. Click "This Firefox" → "Load Temporary Add-on"`);
  console.log(`  3. Select the manifest.json inside dist/`);
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

main();
