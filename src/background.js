// src/background.js
// All network requests to reddit.com are proxied through here rather than
// fetched directly from the content script. Content-script fetches are
// subject to the host page's Content-Security-Policy, and reddit.com's CSP
// can reject same-origin fetches issued that way ("Failed to fetch"). A
// service worker request is NOT subject to the page's CSP and still carries
// the browser's normal cookie jar for the domain (via host_permissions),
// so authenticated requests keep working.

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Old Reddit Redux] installed');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'ORR_FETCH') return false;

  const { url, options } = message;

  fetch(url, { credentials: 'include', ...options })
    .then(async (res) => {
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (e) {
        // Non-JSON response (e.g. an HTML error page) — surface raw text for debugging.
        data = null;
      }
      sendResponse({
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        data,
        rawText: data === null ? text : undefined,
      });
    })
    .catch((err) => {
      sendResponse({ ok: false, status: 0, statusText: 'network-error', error: err.message });
    });

  return true; // keep the message channel open for the async sendResponse
});
