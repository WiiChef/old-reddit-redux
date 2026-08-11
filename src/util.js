// src/util.js
// Small shared helpers. Loaded first, attaches to window.ORR (Old Reddit Redux) namespace
// so later scripts (which are plain classic scripts, not modules) can reference it.

window.ORR = window.ORR || {};

ORR.escapeHtml = function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// Old reddit's classic relative-time strings ("3 hours ago")
ORR.timeAgo = function timeAgo(unixSeconds) {
  const seconds = Math.floor(Date.now() / 1000 - unixSeconds);
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [name, secs] of units) {
    const val = Math.floor(seconds / secs);
    if (val >= 1) return `${val} ${name}${val > 1 ? 's' : ''} ago`;
  }
  return 'just now';
};

ORR.formatScore = function formatScore(n) {
  if (n == null) return '\u2022'; // bullet, old reddit shows this for hidden scores
  if (Math.abs(n) >= 10000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
};

ORR.qs = function qs(sel, root) { return (root || document).querySelector(sel); };
ORR.qsa = function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); };

ORR.parseQuery = function parseQuery(search) {
  const out = {};
  new URLSearchParams(search || '').forEach((v, k) => (out[k] = v));
  return out;
};

// Very small debounce, used to coalesce rapid pushState/popstate bursts
ORR.debounce = function debounce(fn, ms) {
  let t = null;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
};

// In-memory response cache, keyed by full request URL. Cleared on hard reload only,
// which is fine for a content-script-lifetime cache.
ORR.cache = new Map();

// Sends a fetch request to the background service worker rather than calling
// fetch() directly here. Content-script fetches are subject to the host
// page's CSP, which reddit.com uses in a way that can reject even
// same-origin requests issued from a content script ("Failed to fetch").
// The service worker is exempt from the page's CSP, so all reads/writes
// route through it. Returns { ok, status, statusText, data, error? }.
ORR.bgFetch = function bgFetch(url, options) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'ORR_FETCH', url, options }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
};
