// src/background.js
// All network requests to reddit.com are proxied through here rather than
// fetched directly from the content script. Content-script fetches are
// subject to the host page's Content-Security-Policy, and reddit.com's CSP
// can reject same-origin fetches issued that way ("Failed to fetch"). A
// service worker request is NOT subject to the page's CSP and still carries
// the browser's normal cookie jar for the domain (via host_permissions),
// so authenticated requests keep working.

const DEFAULT_SETTINGS = {
  enabled: true,
  theme: 'dark',
  fontSize: 'medium',
  compactMode: false,
  showRank: true,
  autoExpandMedia: false,
  disableAnimations: false,
};

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Old Reddit Redux] installed');
  // Initialize settings on first install
  if (details.reason === 'install') {
    chrome.storage.local.set(DEFAULT_SETTINGS);
  }
});

// Listen for settings changes from popup/options and broadcast to all tabs
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return false;

  if (message.type === 'SETTINGS_CHANGED') {
    // Broadcast to all content scripts so they can update
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'SETTINGS_APPLY',
            settings: message.settings,
          }).catch(() => {}); // tab may not have the content script loaded
        }
      });
    });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'ORR_FETCH') return false;

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
