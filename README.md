# Old Reddit Redux

Recreates the old.reddit.com layout using data pulled live from `www.reddit.com`'s
own JSON endpoints. It never sends a request to old.reddit.com — it reskins
the modern site's data in your browser.

## How it works

1. A content script runs at `document_start` on `www.reddit.com`.
2. It patches `history.pushState`/`replaceState` so in-app (SPA) navigation
   is detected the same way as a fresh page load.
3. On each route change, it matches the URL against a small route table
   (front page, subreddit listing, post + comments, user profile, search).
4. For matched routes, it fetches `https://www.reddit.com/<path>.json`
   (same-origin, so your session cookies are included) and renders the
   result into hand-written HTML/CSS styled after the classic layout.
5. Unmatched routes (chat, modmail, settings, etc.) are left alone — native
   reddit.com renders normally.

## Install (unpacked, for local testing)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Visit `https://www.reddit.com/` — the classic layout should take over
   automatically on supported routes.

## Supported routes (v0.1)

- `/`, `/hot`, `/new`, `/top`, `/rising` — front page listings
- `/r/<sub>`, `/r/<sub>/<sort>` — subreddit listings
- `/r/<sub>/comments/<id>/...` — post + comment thread
- `/user/<name>` — user overview
- `/search`, `/r/<sub>/search` — search results

Everything else (chat, modmail, settings, mod tools, galleries/polls
rendering) currently falls through to native reddit.com.

## Working features

- Post listings with vote arrows, thumbnails, flair, domain, tagline
- **Expando (pop-out media)** — the classic old.reddit arrow next to each
  title that pops open an inline preview without leaving the listing:
  images, gifs (as silent looping video), reddit-hosted (v.redd.it) video,
  galleries, **oEmbed embeds (YouTube, Vimeo, SoundCloud, etc., via Reddit's
  own cached oEmbed data)**, and self-text (expanded by default, matching
  upstream). Media is built lazily on first click, not pre-rendered for
  every row, so a long infinite-scroll listing doesn't try to autoplay
  dozens of videos at once; collapsing a video/iframe also stops it rather
  than just hiding it, so background audio doesn't linger
- **Subreddit sidebar** (`.side`/`.titlebox`) — icon, subscriber/online counts,
  description, and a working join/leave button via `/api/subscribe`
- **Infinite scroll** (RES-style) — front page, subreddit, user, and search
  listings auto-load the next page as you approach the bottom, appending
  rows in place rather than re-rendering the page; falls back to a classic
  "next ›" link if JS/observer support is unavailable
- Voting (up/down/unvote) via `/api/vote`
- Save / hide via `/api/save` and `/api/hide`
- Comment threads with recursive nesting and collapse/expand
- Load more comments, via `/api/morechildren` — requests are chunked at
  100 ids (Reddit's per-request cap); if a stub has more than that, a
  follow-up "load more" stub is appended for the remainder
- Inline image/gif previews for direct media links in comments and
  selftext (old reddit itself never did this — genuine enhancement)
- Classic header with search box and login/karma display

## Bug fixes from code review

A full pass turned up four real bugs, now fixed:

1. **Permanent write-action failure after any transient auth hiccup.**
   `getModhash()` cached its result in a module-level promise forever,
   including a *failed* (`undefined`) result. If the very first identity
   check happened before login state was ready, voting/saving/hiding/
   commenting/subscribing would fail with "not logged in" for the rest of
   the tab's life, even once genuinely logged in. Now re-checks each time
   (cheap, since `fetchIdentity()` has its own 30s cache).
2. **Tabmenu ignored subreddit context.** Clicking "new"/"top"/"rising"
   while browsing a subreddit linked to the sitewide sort pages, silently
   dropping you out of the subreddit. Tab links are now built relative to
   the current subreddit, and the tab matching the actual current sort is
   marked selected (previously only "hot" was ever highlighted).
3. **Subreddit-scoped search silently searched all of Reddit.** The router
   correctly parsed `/r/<sub>/search`, but the search handler discarded
   that scope entirely. Now passes `restrict_sr=on` and hits the scoped
   endpoint when the search originated from inside a subreddit.
4. **Vote score never visually updated.** Clicking an arrow recolored it
   but left the displayed number untouched, in listings, the post header,
   and comments alike. Score elements now carry their baseline score/vote
   state so the count updates immediately on vote/un-vote.
5. **The post/comments page never showed the post's own media at all.**
   Image/gif/video/gallery/oEmbed previews only ever worked in listing
   rows — opening a media post's own thread showed just the title with no
   picture. Confirmed against a real post-page HTML export and fixed by
   reusing the same expando detection, shown **expanded by default** on the
   permalink page (matching upstream) rather than click-to-open. That same
   export also showed link posts can carry their own written caption
   alongside the media — previously dropped because caption rendering was
   gated on `is_self`, which caption-bearing link posts don't have set.

## A note on "copying old.reddit.com exactly"

`old.reddit.com` is not reachable by web-fetch tooling in the environment
this extension was built in, so most of the markup/CSS here was
reconstructed from detailed knowledge of the site rather than pulled from a
live page. The expando feature above, however, *was* built directly against
a real HTML export of old.reddit's r/popular page (provided by the user),
so its class names, behavior, and per-post-type logic (self-text/image/
gif/video/gallery) closely mirror the genuine markup. If you spot a
remaining structural or styling difference elsewhere, flag it and it can be
corrected directly.

## Known gaps / good next steps

- **Submitting posts/comments** isn't hooked to the UI yet (the `ORR.actions.comment`
  function exists but there's no reply textarea rendered).
- **Multi-reddits, polls, and crossposts** don't get an expando yet.
  Embed-only domains are now covered via Reddit's cached oEmbed data
  (YouTube, Vimeo, SoundCloud, etc.); providers that ship a "rich" embed
  instead of a plain iframe (e.g. Twitter/X) fall back to a thumbnail/link
  card rather than a live interactive widget, since scripts injected via
  innerHTML don't execute.
- **modhash/auth**: reddit has changed how write-endpoint auth works more
  than once historically; if voting/saving stops working, check the Network
  tab on a logged-in session and adjust `src/api/actions.js` accordingly.
- **Rate limiting**: there's a 30s in-memory cache per URL
  (`src/api/fetch.js`) to cut down on redundant calls; tune `CACHE_TTL_MS`
  if you hit rate limits. Infinite scroll issues fresh requests per page
  (not cached), so heavy scrolling can hit rate limits faster than normal
  browsing — the sentinel auto-retries on failure.
- **Other RES features not yet built**: keyboard navigation, user/subreddit
  tagging, account switcher, filter by flair/domain. Ask if you want any of
  these added — this extension only covers what's listed above so far.

## File map

```
manifest.json
src/
  util.js              shared helpers (escaping, time formatting, cache)
  router.js             URL -> route matching, SPA navigation hooks
  main.js                orchestrates fetch -> render -> mount, event delegation
  api/fetch.js            reads: listings, posts, comments, user, search
  api/actions.js         writes: vote, save, hide, comment, subscribe
  render/header.js        nav bar
  render/sidebar.js       subreddit info panel (.side/.titlebox)
  render/listing.js       post list rows + expando (pop-out media)
  render/comments.js      post page + recursive comment tree
  styles/oldreddit.css    classic layout, recreated from scratch
background.js            fetch proxy (avoids page CSP) + service worker
```
