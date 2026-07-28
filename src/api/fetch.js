// src/api/fetch.js
// All reads go through www.reddit.com/*.json — same origin as the tab, so the
// user's session cookies are sent automatically via credentials: 'include'.
// We never construct a request to old.reddit.com anywhere in this codebase.

ORR.api = ORR.api || {};

const CACHE_TTL_MS = 30_000;
const RATE_LIMIT_RETRY_MS = 4000;
const MAX_RETRIES = 3;

// Request deduplication: if the same URL is requested multiple times before
// the first resolves, all callers share the single in-flight promise.
const inFlight = new Map();

async function fetchWithRetry(url, retries = MAX_RETRIES) {
  // Deduplication: reuse in-flight request for same URL
  if (inFlight.has(url)) return inFlight.get(url);

  const request = (async () => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const res = await ORR.bgFetch(url);
      if (!res || !res.ok) {
        const status = res && res.status;
        const detail = res && (res.error || res.statusText);

        // Rate limiting — back off with exponential delay
        if (status === 429 && attempt < retries) {
          const delay = RATE_LIMIT_RETRY_MS * Math.pow(2, attempt);
          console.warn(`[Old Reddit Redux] Rate limited (${status}), retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        // Forbidden / logged out — no point retrying
        if (status === 403) {
          throw new Error(`Access forbidden (403) — you may not have permission for this resource (${url})`);
        }

        // Not found
        if (status === 404) {
          throw new Error(`Resource not found (404) (${url})`);
        }

        // Server error — retry with backoff
        if (status >= 500 && attempt < retries) {
          const delay = RATE_LIMIT_RETRY_MS * Math.pow(2, attempt);
          console.warn(`[Old Reddit Redux] Server error (${status}), retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        throw new Error(`Reddit API request failed: ${detail || 'unknown error'} (status ${status || '?'}) (${url})`);
      }
      return res.data;
    }
    throw new Error(`Reddit API request failed after ${retries} retries (${url})`);
  })();

  inFlight.set(url, request);
  request.finally(() => inFlight.delete(url));
  return request;
}

async function cachedFetch(url) {
  const hit = ORR.cache.get(url);
  if (hit && Date.now() - hit.time < CACHE_TTL_MS) return hit.data;

  const data = await fetchWithRetry(url);
  ORR.cache.set(url, { data, time: Date.now() });
  return data;
}

// path should NOT include ".json" or querystring, e.g. "/r/programming"
ORR.api.fetchListing = function fetchListing(path, params = {}) {
  const safePath = path && path.startsWith('/') ? path : `/${path || ''}`;
  const url = new URL(`https://www.reddit.com${safePath}.json`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  // raw_json=1 avoids HTML-entity-encoded punctuation in titles/selftext
  url.searchParams.set('raw_json', '1');
  return cachedFetch(url.toString());
};

// Post + comments page, e.g. "/r/programming/comments/abc123/title_slug"
ORR.api.fetchPostAndComments = function fetchPostAndComments(path, params = {}) {
  return ORR.api.fetchListing(path, params); // same shape: returns [postListing, commentListing]
};

ORR.api.fetchUser = function fetchUser(username, params = {}) {
  return ORR.api.fetchListing(`/user/${username}`, params);
};

ORR.api.fetchSubredditAbout = function fetchSubredditAbout(subreddit) {
  return ORR.api.fetchListing(`/r/${subreddit}/about`);
};

ORR.api.fetchSubredditRules = function fetchSubredditRules(subreddit) {
  return ORR.api.fetchListing(`/r/${subreddit}/about/rules`);
};

ORR.api.fetchSubredditMods = function fetchSubredditMods(subreddit) {
  return ORR.api.fetchListing(`/r/${subreddit}/about/moderators`);
};

ORR.api.fetchSubredditFlairs = function fetchSubredditFlairs(subreddit) {
  return ORR.api.fetchListing(`/r/${subreddit}/about/flair/link`);
};

ORR.api.fetchUserProfile = function fetchUserProfile(username) {
  return ORR.api.fetchListing(`/user/${username}/about`);
};

ORR.api.fetchIdentity = async function fetchIdentity() {
  const url = 'https://www.reddit.com/api/me.json';
  const hit = ORR.cache.get(url);
  if (hit && Date.now() - hit.time < CACHE_TTL_MS) return hit.data;
  const res = await ORR.bgFetch(url);
  if (!res || !res.ok || !res.data) return null; // logged out, or request failed
  ORR.cache.set(url, { data: res.data, time: Date.now() });
  return res.data;
};

ORR.api.search = function search(query, params = {}) {
  return ORR.api.fetchListing('/search', { q: query, ...params });
};

// Reddit caps a single morechildren request at 100 children ids; callers
// are responsible for chunking longer lists and issuing follow-up calls.
ORR.api.moreChildren = async function moreChildren(linkFullname, childrenIds) {
  const url = new URL('https://www.reddit.com/api/morechildren.json');
  url.searchParams.set('link_id', linkFullname);
  url.searchParams.set('children', childrenIds.join(','));
  url.searchParams.set('api_type', 'json');
  url.searchParams.set('limit_children', 'false');
  url.searchParams.set('raw_json', '1');

  const data = await fetchWithRetry(url.toString());
  const things = (data && data.json && data.json.data && data.json.data.things) || [];
  return things;
};
