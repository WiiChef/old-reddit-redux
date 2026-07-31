#!/usr/bin/env node
// build.js — Build installable Chrome (.crx) and Firefox (.xpi) extensions
//
// Chrome .crx: CRX3 format with RSA-2048 signing key (key stored in dist/)
// Firefox .xpi: Signed via web-ext sign (requires AMO account)
//
// Usage:
//   npm run build          # build both
//   npm run build:chrome   # Chrome .crx only
//   npm run build:firefox  # Firefox .xpi only (attempts web-ext sign)
//   npm run build:clean    # remove dist/

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const SRC_DIR = path.join(ROOT, 'src');
const ICONS_DIR = path.join(ROOT, 'icons');

// ---------------------------------------------------------------------------
// ZIP creation (used by both CRX and XPI)
// ---------------------------------------------------------------------------
function createZipBuffer(entries) {
  // Returns a Buffer containing the ZIP archive
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
// Chrome CRX3 builder
// ---------------------------------------------------------------------------
function buildChromeCrx(version) {
  console.log('\n── Chrome .crx ──');

  const entries = [];
  entries.push(...collectFiles(SRC_DIR, 'src'));
  entries.push(...collectFiles(ICONS_DIR, 'icons'));
  entries.push({
    filename: 'manifest.json',
    data: fs.readFileSync(path.join(ROOT, 'manifest.json')),
  });

  // CRX3 key management — persist key across builds so extension ID stays stable
  const keyPath = path.join(DIST, 'extension.key');
  const pubKeyPath = path.join(DIST, 'extension.pub');
  let privateKey;
  let publicKey;

  if (fs.existsSync(keyPath) && fs.existsSync(pubKeyPath)) {
    console.log('  Reusing existing signing key (stable extension ID)');
    privateKey = fs.readFileSync(keyPath);
    publicKey = fs.readFileSync(pubKeyPath);
  } else {
    console.log('  Generating new RSA-2048 signing key');
    const pair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    });
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
    fs.writeFileSync(keyPath, privateKey);
    fs.writeFileSync(pubKeyPath, publicKey);
  }

  // Extension ID = SHA256(public key) first 16 bytes encoded as base32-like
  // (Chrome uses lowercase a-p for the ID)
  const hash = crypto.createHash('sha256').update(publicKey).digest();
  const idChars = 'abcdefghijklmnopqrstuvwxyz';
  let extId = '';
  // Use the first 16 bytes of the hash, mod 26 for each character
  for (let i = 0; i < 16; i++) {
    extId += idChars[hash[i] % 26];
  }
  console.log(`  Extension ID: ${extId}`);

  // Build the ZIP
  const zipData = createZipBuffer(entries);

  // CRX3 header format:
  //   Magic: "Cr24" (4 bytes)
  //   Encrypted key length (4 bytes LE, usually 0 for unencrypted)
  //   RSA signature length (4 bytes LE)
  //   RSA signature (variable)
  //   Public key length (4 bytes LE)
  //   Public key (variable)
  //   ZIP data (variable)

  // Sign the SHA256 hash of the ZIP data
  const keyObj = crypto.createPrivateKey({ key: privateKey, format: 'der', type: 'pkcs8' });
  const signer = crypto.createSign('SHA256');
  signer.update(zipData);
  const signature = signer.sign(keyObj);
  // Ensure signature is a Buffer
  const sigBuf = Buffer.isBuffer(signature) ? signature : Buffer.from(signature, 'binary');

  // Build CRX3
  const magic = Buffer.from('Cr24', 'ascii');
  const encKeyLen = Buffer.alloc(4);
  encKeyLen.writeUInt32LE(0, 0); // no encryption
  const sigLen = Buffer.alloc(4);
  sigLen.writeUInt32LE(sigBuf.length, 0);
  const pubKeyLen = Buffer.alloc(4);
  pubKeyLen.writeUInt32LE(publicKey.length, 0);

  const crxData = Buffer.concat([
    magic,
    encKeyLen,
    sigLen,
    sigBuf,
    pubKeyLen,
    publicKey,
    zipData,
  ]);

  const crxPath = path.join(DIST, `old-reddit-redux-${version}-chrome.crx`);
  fs.writeFileSync(crxPath, crxData);

  console.log(`  ${crxPath} (${formatBytes(crxData.length)})`);
  console.log(`  Files: ${entries.length}`);
  console.log(`  Signing key saved to: ${keyPath}`);
  return crxPath;
}

// ---------------------------------------------------------------------------
// Firefox XPI builder (uses web-ext sign for AMO signing)
// ---------------------------------------------------------------------------
function buildFirefoxXpi(version) {
  console.log('\n── Firefox .xpi ──');

  const entries = [];
  entries.push(...collectFiles(SRC_DIR, 'src'));
  entries.push(...collectFiles(ICONS_DIR, 'icons'));

  const ffManifestPath = path.join(ROOT, 'manifest.firefox.json');
  const ffManifest = JSON.parse(fs.readFileSync(ffManifestPath, 'utf-8'));
  console.log(`  Manifest V${ffManifest.manifest_version}`);
  console.log(
    `  Firefox min: ${ffManifest.browser_specific_settings.gecko.strict_min_version}`
  );
  console.log(`  Gecko ID: ${ffManifest.browser_specific_settings.gecko.id}`);

  entries.push({
    filename: 'manifest.json',
    data: fs.readFileSync(ffManifestPath),
  });

  // Create a temporary source directory for web-ext
  const srcDir = path.join(DIST, 'firefox-src');
  if (fs.existsSync(srcDir)) {
    fs.rmSync(srcDir, { recursive: true, force: true });
  }
  fs.mkdirSync(srcDir, { recursive: true });

  // Write files to temp dir
  for (const entry of entries) {
    const outPath = path.join(srcDir, entry.filename);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, entry.data);
  }

  console.log(`  Files: ${entries.length}`);

  // Try to sign with web-ext
  const xpiPath = path.join(DIST, `old-reddit-redux-${version}-firefox.xpi`);

  // Check if web-ext is available
  let hasWebExt = false;
  try {
    execSync('web-ext --version', { stdio: 'pipe' });
    hasWebExt = true;
  } catch {
    // web-ext not available, create unsigned XPI
  }

  if (hasWebExt) {
    console.log('  Signing with web-ext (AMO)...');
    try {
      // web-ext sign requires FxA authentication
      // Check if already authenticated
      const webExtDir = path.join(
        process.env.APPDATA || process.env.HOME,
        '.web-ext-artifacts'
      );
      fs.mkdirSync(webExtDir, { recursive: true });

      const result = execSync(
        `web-ext sign --source-dir "${srcDir}" --artifacts-dir "${DIST}" --verbose`,
        { encoding: 'utf8', timeout: 120000 }
      );
      console.log('  Signed successfully!');
      console.log(result);

      // web-ext places the signed XPI in the artifacts dir
      const signedFiles = fs.readdirSync(DIST).filter(f => f.endsWith('.xpi'));
      if (signedFiles.length > 0) {
        const signedPath = path.join(DIST, signedFiles[0]);
        console.log(`  ${signedPath} (${formatBytes(fs.statSync(signedPath).size)})`);
      }
    } catch (err) {
      console.log('  web-ext sign failed (AMO authentication required).');
      console.log('  Creating unsigned XPI for local use...');
      console.log(`  ${err.message}`.slice(0, 200));

      // Fall back to unsigned XPI
      const zipData = createZipBuffer(entries);
      fs.writeFileSync(xpiPath, zipData);
      console.log(`  ${xpiPath} (${formatBytes(zipData.length)}) [unsigned]`);
      console.log('  To sign: run `web-ext sign --source-dir ' + srcDir + '`');
      console.log('  (requires Firefox Accounts login via web-ext)');
    }
  } else {
    console.log('  web-ext not installed — creating unsigned XPI');
    const zipData = createZipBuffer(entries);
    fs.writeFileSync(xpiPath, zipData);
    console.log(`  ${xpiPath} (${formatBytes(zipData.length)}) [unsigned]`);
    console.log('  To sign for AMO: npm install -g web-ext && web-ext sign');
  }

  // Clean up temp dir
  try {
    fs.rmSync(srcDir, { recursive: true, force: true });
  } catch {}

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

  // Clean dist (but preserve signing key for Chrome so extension ID stays stable)
  const existingKey = path.join(DIST, 'extension.key');
  const existingPub = path.join(DIST, 'extension.pub');
  let savedKey = null;
  let savedPub = null;
  if (fs.existsSync(existingKey)) {
    savedKey = fs.readFileSync(existingKey);
  }
  if (fs.existsSync(existingPub)) {
    savedPub = fs.readFileSync(existingPub);
  }

  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST, { recursive: true });

  // Restore signing key
  if (savedKey) fs.writeFileSync(existingKey, savedKey);
  if (savedPub) fs.writeFileSync(existingPub, savedPub);

  if (target === 'both' || target === 'chrome') {
    buildChromeCrx(version);
  }
  if (target === 'both' || target === 'firefox') {
    buildFirefoxXpi(version);
  }

  console.log(`\n[build] Done! Packages in dist/`);
  console.log(`\n── Installation ──`);
  console.log(`Chrome (.crx):`);
  console.log(`  1. Open chrome://extensions`);
  console.log(`  2. Enable "Developer mode"`);
  console.log(`  3. Drag the .crx file onto the page`);
  console.log(`  → Chrome will install it as a proper extension`);
  console.log(`\nFirefox (.xpi):`);
  console.log(`  Signed .xpi:`);
  console.log(`    1. Double-click the .xpi file (opens in Firefox)`);
  console.log(`    2. Click "Add" → "Add Extension"`);
  console.log(`  Unsigned .xpi (local dev only):`);
  console.log(`    1. about:debugging → Load Temporary Add-on`);
  console.log(`    2. Select the .xpi file`);
  console.log(`\nTo sign Firefox for AMO distribution:`);
  console.log(`  npm install -g web-ext`);
  console.log(`  web-ext sign --source-dir <source>`);
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

main();
