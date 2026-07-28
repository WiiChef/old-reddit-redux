// src/router.js
// Reddit.com is a client-rendered SPA, so navigation often happens via
// history.pushState rather than a full page load. We patch pushState/replaceState
// to emit a 'locationchange' event so our router can react to in-app navigation
// exactly like a fresh load.

ORR.router = ORR.router || {};

const ROUTES = [
  { name: 'subreddit', pattern: /^\/r\/([\w-]+)\/?$/ },
  { name: 'subreddit-sort', pattern: /^\/r\/([\w-]+)\/(hot|new|top|rising|controversial)\/?$/ },
  { name: 'post', pattern: /^\/r\/([\w-]+)\/comments\/(\w+)(?:\/[\w-]*)?\/?$/ },
  { name: 'user', pattern: /^\/user\/([\w-]+)\/?$/ },
  { name: 'front', pattern: /^\/(hot|new|top|rising)?\/?$/ },
  { name: 'search', pattern: /^\/(r\/[\w-]+\/)?search\/?$/ },
];

ORR.router.match = function match(pathname) {
  for (const route of ROUTES) {
    const m = pathname.match(route.pattern);
    if (m) return { name: route.name, params: m.slice(1) };
  }
  return null;
};

(function installHistoryHooks() {
  ['pushState', 'replaceState'].forEach((fn) => {
    const orig = history[fn];
    history[fn] = function (...args) {
      const ret = orig.apply(this, args);
      window.dispatchEvent(new Event('orr:locationchange'));
      return ret;
    };
  });
  window.addEventListener('popstate', () => window.dispatchEvent(new Event('orr:locationchange')));
})();
