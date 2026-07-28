// src/api/fetch.js
// All reads go through www.reddit.com/*.json — same origin as the tab, so the
// user's session cookies are sent automatically via credentials: 'include'.
// We never construct a request to old.reddit.com anywhere in this codebase.

ORR.api = ORR.api || {};

const CACHE_TTL_MS = 30_000;

async function cachedFetch(url) {
  const hit = ORR.cache.get(url);
  if (hit && Date.now() - hit.time < CACHE_TTL_MS) return hit.data;

  const res = await ORR.bgFetch(url);
  if (!res || !res.ok) {
    const detail = res && (res.error || res.statusText);
    throw new Error(`Reddit API request failed: ${detail || 'unknown error'} (${url})`);
  }
  ORR.cache.set(url, { data: res.data, time: Date.now() });
  return res.data;
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

  const res = await ORR.bgFetch(url.toString());
  if (!res || !res.ok) {
    const detail = res && (res.error || res.statusText);
    throw new Error(`Failed to load more comments: ${detail || 'unknown error'}`);
  }
  const things = (res.data && res.data.json && res.data.json.data && res.data.json.data.things) || [];
  return things;
};
