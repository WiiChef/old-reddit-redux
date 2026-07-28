// test/runner.js
// Minimal test runner for Node.js environment
// Tests run without a browser by mocking the ORR global and chrome API

const fs = require('fs');
const path = require('path');

// ---- Mock environment ----
global.ORR = {};
global.chrome = {
  runtime: {
    onMessage: { addListener() {} },
    onInstalled: { addListener() {} },
    sendMessage(msg, cb) { if (cb) cb({ ok: true, data: {} }); },
    openOptionsPage() {},
    lastError: null,
  },
  storage: {
    local: {
      get(keys) { return Promise.resolve(typeof keys === 'object' ? keys : {}); },
      set(obj) { return Promise.resolve(obj); },
    },
  },
};
global.document = {
  readyState: 'complete',
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  getElementById() { return null; },
  createElement() { return { classList: { add() {}, remove() {}, toggle() {} }, style: {}, innerHTML: '' }; },
  classList: { add() {}, remove() {}, toggle() {} },
};
global.window = {
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  location: { pathname: '/', search: '' },
  history: { pushState() {} },
  IntersectionObserver: class { observe() {}; disconnect() {} },
};
global.fetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve('{}') });
global.Array = global.Array;

// ---- Test framework ----
let passed = 0;
let failed = 0;
let total = 0;

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

function test(name, fn) {
  total++;
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.then(() => { passed++; }).catch((err) => { failed++; console.log(`  FAIL: ${name} — ${err.message}`); });
    } else {
      passed++;
    }
  } catch (err) {
    failed++;
    console.log(`  FAIL: ${name} — ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || `Expected ${expected}, got ${actual}`));
  }
}

function assertDeepEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error((message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`));
  }
}

function assertThrows(fn, message) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error(message || 'Expected function to throw');
}

// Export test functions to global scope so test files can use them
// without requiring this module (avoiding circular dependency)
global.describe = describe;
global.test = test;
global.assert = assert;
global.assertEqual = assertEqual;
global.assertDeepEqual = assertDeepEqual;
global.assertThrows = assertThrows;

// ---- Load source modules that define ORR globals ----
// Load util first (defines ORR.escapeHtml, etc.)
try {
  delete require.cache[require.resolve('../src/util.js')];
  require('../src/util.js');
} catch (e) {
  // OK - util.js may reference DOM APIs
}

// Load router (defines ORR.router)
try {
  delete require.cache[require.resolve('../src/router.js')];
  require('../src/router.js');
} catch (e) {
  // OK - router may reference DOM APIs
}

// ---- Load test files ----
async function runTests() {
  const testDir = path.join(__dirname);
  const files = fs.readdirSync(testDir)
    .filter(f => f.startsWith('test_') && f.endsWith('.js'))
    .map(f => path.join(testDir, f));

  for (const file of files) {
    try {
      delete require.cache[require.resolve(file)];
      require(file);
    } catch (err) {
      console.error(`Error loading ${file}:`, err.message);
    }
  }

  // Wait for any async tests
  await new Promise(resolve => setTimeout(resolve, 500));

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed}/${total} passed${failed > 0 ? `, ${failed} failed` : ''}`);
  console.log('='.repeat(50));

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
