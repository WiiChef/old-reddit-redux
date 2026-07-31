# Old Reddit Redux — Comprehensive Code Audit Report

> Generated after full codebase review (all 14 source files, ~3,000 lines)

---

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 Critical | 4 | 3 fixed, 1 noted |
| 🟡 Security | 3 | All noted, low risk |
| 🟠 Performance | 3 | 1 fixed, 2 noted |
| 🔵 Code Quality | 10 | 4 fixed, 6 noted |

**Total issues found: 20**
**Fixed in this session: 8**

---

## 🔴 Critical Bugs

### ✅ FIXED — Router regex captures `search` as path segment
**File:** `src/router.js:14`

The search route pattern used a capturing group `(r\/[\w-]+\/)?` which captured `"r/pics/"` as `match.params[0]`. This string was then re-parsed in `main.js` with another regex. Fixed by using a non-capturing group `(?:r\/([\w-]+)\/)?` so the subreddit name is captured directly.

**Before:**
```js
{ name: 'search', pattern: /^\/(r\/[\w-]+\/)?search\/?$/ },
```
**After:**
```js
{ name: 'search', pattern: /^\/(?:r\/([\w-]+)\/)?search\/?$/ },
```

---

### ✅ FIXED — No-op `fetchQuery.t = fetchQuery.t` (dead code)
**File:** `src/main.js:92, 158`

Two instances of `if (fetchQuery.t) fetchQuery.t = fetchQuery.t;` which assign a value to itself. This was likely a placeholder for time-filter validation that was never implemented. Removed both instances.

---

### ✅ FIXED — Search filter `change` event fires twice
**File:** `src/main.js:390-402`

The search sort/time `<select>` elements were handled in BOTH the `click` event listener AND the `change` event listener, causing `applySearchFilters()` to fire twice per filter change. Removed the duplicate handlers from the `click` listener since the `change` event listener handles this correctly.

---

### ⚠️ NOTED — Missing null checks on post page API responses
**File:** `src/main.js:72-75`

```js
const [postListing, commentListing] = await ORR.api.fetchPostAndComments(
  `/r/${sub}/comments/${id}`
);
```

If Reddit returns a redirect (e.g., login required) or unexpected JSON shape, destructuring will produce `undefined` values and `ORR.render.postPage()` will crash. **Risk: Low** — Reddit's API is stable, but a try/catch with shape validation would be more defensive.

---

## 🟡 Security Issues

### ⚠️ NOTED — `alert()` used for error feedback
**File:** `src/main.js` (multiple lines: 425, 447, 462, 477, 787)

Throughout the codebase, `alert(err.message)` is used for error feedback from vote/save/hide/comment/submit actions. `alert()` is:
- Blocking (freezes the main thread)
- Cannot be styled
- Inconsistent with the modal-based UI used elsewhere (share/report modals)

**Recommendation:** Replace with inline toast notifications using the existing `.orr-action-success` pattern.

---

### ⚠️ NOTED — Potential open redirect on submit navigation
**File:** `src/main.js:798-801`

```js
const permalink = result && result.json && result.json.data && result.json.data.permalink;
if (permalink) {
  window.location.href = `https://www.reddit.com${permalink}`;
}
```

If `permalink` from Reddit's API contained `//evil.com`, this would redirect to an external site. In practice, Reddit's own API would never return such data, but defense-in-depth would validate:
```js
if (permalink && permalink.startsWith('/')) {
  window.location.href = `https://www.reddit.com${permalink}`;
}
```

---

### ⚠️ NOTED — `innerHTML` usage assumes API data is safe
**File:** `src/main.js`, `src/render.js`

The extension uses `innerHTML` extensively to inject rendered HTML. API data from Reddit's JSON endpoint is assumed safe (no `<script>` tags). This is a reasonable assumption for Reddit's own API, but if the extension were ever adapted for a different data source, XSS would be a concern.

**Current mitigation:** `ORR.escapeHtml()` is used for all user-generated content (reply text, error messages). API data is trusted.

---

## 🟠 Performance Issues

### ✅ FIXED — `getVisibleThings()` triggers layout recalculation on every keypress
**File:** `src/main.js:852-854`

```js
function getVisibleThings() {
  return Array.from(document.querySelectorAll('.thing')).filter(
    (el) => el.offsetWidth > 0 && el.offsetHeight > 0
  );
}
```

Accessing `offsetWidth`/`offsetHeight` forces browser reflow. This was called on every keyboard navigation event. Fixed by caching the result and invalidating on route change (via `mount()`).

---

### ⚠️ NOTED — No debounce on vote/save/hide actions
**File:** `src/main.js:405-430`

Rapid clicking on vote buttons fires multiple concurrent API requests. Reddit's API has rate limiting (429 responses), but client-side debouncing would improve UX. **Recommendation:** Add a 500ms debounce or disable the button during in-flight requests.

---

### ⚠️ NOTED — `applySettings()` re-queries DOM unnecessarily
**File:** `src/main.js:30-33`

```js
qsa('.thing .rank', root).forEach((el) => {
  el.style.display = settings.showRank ? '' : 'none';
});
```

This runs on every settings change message, even if `showRank` didn't actually change. **Recommendation:** Track previous settings and only apply deltas.

---

## 🔵 Code Quality / Maintainability

### ✅ FIXED — `morecomments` error destroys retry capability
**File:** `src/main.js:845`

When `ORR.api.moreChildren()` threw an error, `stub.outerHTML` was replaced with an error span, permanently losing the `data-children` JSON. Fixed to preserve the stub and show a retryable error message.

---

### ✅ FIXED — `chrome.storage.local.get` could overwrite defaults with `undefined`
**File:** `src/main.js:305-311`

When `chrome.storage.local.get(keys)` returns `undefined` for a key, the spread `{...defaults, ...stored}` would overwrite the default with `undefined`. Fixed to filter out `undefined`/`null` values before merging.

---

### ✅ FIXED — Trailing semicolon after function closing brace
**File:** `src/api/actions.js:25`

Minor style issue: `};` after `postForm` function closing brace. Removed.

---

### ⚠️ NOTED — Large monolithic click handler (~250 lines)
**File:** `src/main.js:388-630`

The single `document.addEventListener('click', ...)` handler contains ~250 lines of deeply nested conditionals. Each action (vote, save, hide, reply, share, report, collapse, expando, submit, morecomments) could be its own delegated handler.

**Recommendation:** Split into separate event listeners keyed by CSS selector, or use a small event delegation utility.

---

### ✅ FIXED — `ORR._expandoData` declared explicitly in `util.js`
**File:** `src/util.js`, `src/render/listing.js`, `src/main.js`

Expando (media preview) data is stored in `ORR._expandoData` (a `Map`) which is populated in `listing.js` and read in `main.js`. Previously this was lazily initialized in `listing.js` with `ORR._expandoData = ORR._expandoData || new Map()` — an implicit contract between files. Now declared explicitly in `util.js` alongside other shared state (`ORR.cache`).

---

### ⚠️ NOTED — Duplicate route handling for `user` and `user-profile`
**File:** `src/main.js:98-116`

Both `user-profile` (`/user/username/about`) and `user` (`/user/username`) routes:
- Fetch the same data: `fetchUser(username)` + `fetchUserProfile(username)`
- Render nearly identical HTML via `ORR.render.listing()`
- The only difference is `userSidebar` receives slightly different arguments

**Recommendation:** Consolidate into a single handler.

---

### ⚠️ NOTED — `infiniteObserver` cleanup race condition
**File:** `src/main.js:58, 220`

`teardownInfiniteScroll()` disconnects the observer, but `setupInfiniteScroll` creates a new one only after `mount(html)`. If navigation happens during the async fetch (before `mount`), the old sentinel element is gone but the observer might still reference it.

**Recommendation:** Pass the sentinel element through the render cycle or re-query it in `setupInfiniteScroll`.

---

### ⚠️ NOTED — CSS specificity inconsistencies
**File:** `src/styles/oldreddit.css`

Some theme rules use `#orr-root.theme-dark` while others use `#orr-root.theme-classic`. The base styles are prefixed with `#orr-root` but some rules (e.g., modal styles at line 2010) lack the `#orr-root` prefix entirely, meaning they could leak into the page's own styles.

**Recommendation:** Audit all CSS rules to ensure `#orr-root` scoping is consistent.

---

### ⚠️ NOTED — Missing `content_security_policy` in manifest
**File:** `manifest.json`

The manifest doesn't include a `content_security_policy` field. Chrome extensions default to a restrictive CSP which might block `eval`/`Function` in the service worker. While the current code doesn't use these, it's best practice to declare CSP explicitly.

---

### ⚠️ NOTED — `render.js` `buildMoreChildrenTree` mutates input
**File:** `src/render.js:350-370`

The `buildMoreChildrenTree` function sorts `things` in-place (`things.sort(...)`). If the caller reuses the array, it would see the sorted version. **Recommendation:** Use `[...things].sort(...)` to avoid mutation.

---

## Files Reviewed

| File | Lines | Issues |
|------|-------|--------|
| `manifest.json` | 35 | 1 |
| `background.js` | 90 | 0 |
| `src/util.js` | 70 | 0 |
| `src/router.js` | 40 | 1 (fixed) |
| `src/api/fetch.js` | 130 | 0 |
| `src/api/actions.js` | 70 | 1 (fixed) |
| `src/render.js` | 700 | 1 |
| `src/main.js` | 950 | 12 (7 fixed) |
| `src/styles/oldreddit.css` | 2100 | 1 |
| `popup.html` | 150 | 0 |
| `popup.js` | 120 | 0 |
| `options.html` | 100 | 0 |
| `options.js` | 80 | 0 |
| `README.md` | 50 | 0 |

---

## Recommendations for Next Iteration

1. **Replace `alert()` with toast notifications** — consistent UX
2. **Split the click handler** — improve maintainability
3. **Add client-side rate limiting** on vote/save/hide actions
4. **Declare `ORR._expandoData` in `util.js`** — explicit shared state
5. **Consolidate user/user-profile routes** — reduce duplication
6. **Add CSS scoping audit** — ensure all rules are `#orr-root`-prefixed
7. **Add `content_security_policy` to manifest** — best practice
8. **Add shape validation** to API responses in `handleRoute()`
