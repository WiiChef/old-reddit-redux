// src/api/actions.js
// Write actions (vote/save/hide) require the modhash from an authenticated
// identity call. If the user is logged out, these calls will simply fail and
// we surface that to the UI rather than pretending they worked.

ORR.actions = ORR.actions || {};

// Deliberately NOT caching this in a module-level promise: fetchIdentity()
// already has its own 30s cache (see fetch.js), so wrapping it in another
// promise here just to "cache the cache" caused a real bug — if the very
// first call happened before the person was logged in (or hit a transient
// failure), it would resolve to undefined and, being a resolved promise, was
// then permanently reused for the rest of the tab's lifetime. Every vote/
// save/hide/comment/subscribe would keep failing with "not logged in" even
// once the person genuinely was. Just re-check each time; the identity
// fetch's own cache keeps this cheap.
async function getModhash() {
  const me = await ORR.api.fetchIdentity();
  return me && me.data && me.data.modhash;
}

async function postForm(path, fields) {
  const modhash = await getModhash();
  if (!modhash) throw new Error('Not logged in (no modhash) — cannot perform this action.');
  const body = new URLSearchParams({ ...fields, uh: modhash, api_type: 'json' });
  const res = await ORR.bgFetch(`https://www.reddit.com${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res || !res.ok) {
    const detail = res && (res.error || res.statusText);
    throw new Error(`Action failed: ${detail || 'unknown error'}`);
  }
  return res.data || {};
};

// dir: 1 = upvote, -1 = downvote, 0 = unvote
ORR.actions.vote = function vote(fullname, dir) {
  return postForm('/api/vote', { id: fullname, dir: String(dir) });
};

ORR.actions.save = function save(fullname, unsave = false) {
  return postForm(unsave ? '/api/unsave' : '/api/save', { id: fullname });
};

ORR.actions.hide = function hide(fullname, unhide = false) {
  return postForm(unhide ? '/api/unhide' : '/api/hide', { id: fullname });
};

ORR.actions.comment = function comment(parentFullname, text) {
  return postForm('/api/comment', { thing_id: parentFullname, text });
};

ORR.actions.subscribe = function subscribe(srFullname, shouldSubscribe) {
  return postForm('/api/subscribe', { sr: srFullname, action: shouldSubscribe ? 'sub' : 'unsub' });
};
