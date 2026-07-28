// src/main.js
(function () {
  const { qs, qsa, debounce, parseQuery } = ORR;
  let renderToken = 0; // guards against a stale async render clobbering a newer one
  let infiniteObserver = null; // current IntersectionObserver, one per mounted listing page

  async function handleRoute() {
    const myToken = ++renderToken;
    teardownInfiniteScroll(); // stop any previous page's auto-loading immediately
    const match = ORR.router.match(location.pathname);

    if (!match) {
      // Unhandled route (chat, modmail, settings, etc.) — let native reddit.com render.
      document.documentElement.classList.remove('orr-active');
      return;
    }

    document.documentElement.classList.add('orr-active');
    renderSkeleton();

    try {
      const identity = await ORR.api.fetchIdentity().catch(() => null);
      const query = parseQuery(location.search);

      let html;
      // Set for listing-type pages only: lets us wire up infinite scroll
      // after mount without re-deriving the route's fetch semantics.
      let listingAfter = null;
      let nextPageFetcher = null;

      if (match.name === 'post') {
        const [sub, id] = match.params;
        const [postListing, commentListing] = await ORR.api.fetchPostAndComments(
          `/r/${sub}/comments/${id}`
        );
        if (myToken !== renderToken) return;
        const headerHtml = ORR.render.header(identity, sub);
        html = ORR.render.postPage(postListing, commentListing, headerHtml);
      } else if (match.name === 'subreddit' || match.name === 'subreddit-sort') {
        const sub = match.params[0];
        const sort = match.params[1] || query.sort || 'hot';
        // Pass through time filter param (t=hour/day/week/month/year/all)
        const fetchQuery = { ...query };
        if (fetchQuery.t) fetchQuery.t = fetchQuery.t;
        const [listing, about] = await Promise.all([
          ORR.api.fetchListing(`/r/${sub}/${sort}`, fetchQuery),
          ORR.api.fetchSubredditAbout(sub).catch(() => null),
        ]);
        if (myToken !== renderToken) return;
        const headerHtml = ORR.render.header(identity, sub, sort);
        const sidebarHtml = ORR.render.sidebar(about);
        html = ORR.render.listing(listing, { headerHtml, sidebarHtml });
        listingAfter = listing.data.after;
        nextPageFetcher = (after) => ORR.api.fetchListing(`/r/${sub}/${sort}`, { ...fetchQuery, after });
      } else if (match.name === 'user') {
        const username = match.params[0];
        const listing = await ORR.api.fetchUser(username, query);
        if (myToken !== renderToken) return;
        const headerHtml = ORR.render.header(identity, null);
        html = ORR.render.listing(listing, { headerHtml });
        listingAfter = listing.data.after;
        nextPageFetcher = (after) => ORR.api.fetchUser(username, { ...query, after });
      } else if (match.name === 'user-comments' || match.name === 'user-submitted' || match.name === 'user-upvoted' || match.name === 'user-downvoted' || match.name === 'user-saved') {
        const username = match.params[0];
        const page = match.name.replace('user-', '');
        const listing = await ORR.api.fetchUser(username, { ...query, sort: query.sort || 'new' });
        if (myToken !== renderToken) return;
        const headerHtml = ORR.render.header(identity, null);
        html = ORR.render.listing(listing, { headerHtml });
        listingAfter = listing.data.after;
        nextPageFetcher = (after) => ORR.api.fetchUser(username, { ...query, after });
      } else if (match.name === 'search') {
        // match.params[0] is "r/<sub>/" when this is a subreddit-scoped
        // search (e.g. /r/pics/search) and undefined for sitewide search.
        // This was previously discarded entirely, so a search made from
        // inside a subreddit would silently search all of Reddit instead.
        const scopedSubMatch = match.params[0] && match.params[0].match(/^r\/([\w-]+)\//);
        const scopedSub = scopedSubMatch && scopedSubMatch[1];
        const searchPath = scopedSub ? `/r/${scopedSub}/search` : '/search';
        const searchParams = scopedSub ? { ...query, restrict_sr: 'on' } : query;
        const listing = await ORR.api.fetchListing(searchPath, { q: query.q || '', ...searchParams });
        if (myToken !== renderToken) return;
        const headerHtml = ORR.render.header(identity, scopedSub);
        html = ORR.render.listing(listing, { headerHtml });
        listingAfter = listing.data.after;
        nextPageFetcher = (after) =>
          ORR.api.fetchListing(searchPath, { q: query.q || '', ...searchParams, after });
      } else if (match.name === 'domain') {
        // /domain/example.com
        const domain = match.params[0];
        const listing = await ORR.api.fetchListing(`/domain/${domain}`, query);
        if (myToken !== renderToken) return;
        const headerHtml = ORR.render.header(identity, null);
        html = ORR.render.listing(listing, { headerHtml });
        listingAfter = listing.data.after;
        nextPageFetcher = (after) => ORR.api.fetchListing(`/domain/${domain}`, { ...query, after });
      } else {
        // front page, /hot, /new, /top, /rising, /controversial, /best
        const sort = (match.params[0] || 'hot');
        const path = sort === 'hot' ? '/' : `/${sort}`;
        // Pass through time filter param (t=hour/day/week/month/year/all)
        const fetchQuery = { ...query };
        if (fetchQuery.t) fetchQuery.t = fetchQuery.t;
        const listing = await ORR.api.fetchListing(path, fetchQuery);
        if (myToken !== renderToken) return;
        const headerHtml = ORR.render.header(identity, null, sort);
        html = ORR.render.listing(listing, { headerHtml });
        listingAfter = listing.data.after;
        nextPageFetcher = (after) => ORR.api.fetchListing(path, { ...fetchQuery, after });
      }

      mount(html);
      if (nextPageFetcher) setupInfiniteScroll(nextPageFetcher, listingAfter);
    } catch (err) {
      console.error('[Old Reddit Redux]', err, err && err.stack);
      if (myToken === renderToken) mountError(err);
    }
  }

  function teardownInfiniteScroll() {
    if (infiniteObserver) {
      infiniteObserver.disconnect();
      infiniteObserver = null;
    }
  }

  // RES-style infinite scroll: watches a sentinel element at the bottom of
  // the listing and, once it enters the viewport, fetches the next page via
  // the route's own `after` cursor and appends rows directly into the
  // existing .sitetable rather than re-rendering the whole page. Falls back
  // gracefully to the classic "next ›" link, which stays in the markup.
  function setupInfiniteScroll(fetchNextPage, initialAfter) {
    const sentinel = document.getElementById('orr-infinite-sentinel');
    if (!sentinel) return;

    const state = { loading: false, done: !initialAfter, after: initialAfter };
    setSentinelStatus(sentinel, state.done ? 'end' : 'idle');
    if (state.done) return;

    async function attemptLoad() {
      if (state.loading || state.done) return;
      state.loading = true;
      setSentinelStatus(sentinel, 'loading');
      try {
        const listing = await fetchNextPage(state.after);
        const children = (listing && listing.data && listing.data.children) || [];
        const sitetable = document.querySelector('.sitetable.linklisting');
        if (children.length && sitetable) {
          const startRank = sitetable.querySelectorAll('.thing').length + 1;
          sitetable.insertAdjacentHTML('beforeend', ORR.render.postRows(children, startRank));
        }
        state.after = listing && listing.data && listing.data.after;
        if (!state.after || !children.length) {
          state.done = true;
          setSentinelStatus(sentinel, 'end');
          obs.disconnect();
        } else {
          setSentinelStatus(sentinel, 'idle');
        }
      } catch (err) {
        setSentinelStatus(sentinel, 'error', err.message);
        // Auto-retry after a few seconds (e.g. transient rate limiting)
        // rather than requiring the person to scroll away and back.
        setTimeout(() => {
          state.loading = false;
          attemptLoad();
        }, 4000);
        return;
      }
      state.loading = false;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) attemptLoad();
      },
      { rootMargin: '800px 0px' } // start loading well before it's actually visible
    );
    obs.observe(sentinel);
    infiniteObserver = obs;
  }

  function setSentinelStatus(sentinel, status, detail) {
    if (status === 'idle') {
      sentinel.innerHTML = '';
    } else if (status === 'loading') {
      sentinel.innerHTML = '<div class="orr-spinner"></div>';
    } else if (status === 'end') {
      sentinel.innerHTML = '<p class="orr-end-of-listing">\u2014 end of listing \u2014</p>';
    } else if (status === 'error') {
      sentinel.innerHTML = `<p class="orr-infinite-error">couldn't load more posts${detail ? `: ${ORR.escapeHtml(detail)}` : ''} \u2014 retrying\u2026</p>`;
    }
  }

  function renderSkeleton() {
    mount(ORR.render.skeleton());
  }

  function mount(html) {
    let root = document.getElementById('orr-root');
    if (!root) {
      // Reddit's own app shell sets inline styles/attributes directly on
      // <html> and <body> (e.g. width/overflow constraints) before we take
      // over. We only ever replaced body's *contents*, never those inline
      // styles, so they kept silently capping our container's width even
      // though our own CSS asked for something wider. Strip them here.
      document.documentElement.removeAttribute('style');
      document.body.removeAttribute('style');
      document.body.innerHTML = '';
      root = document.createElement('div');
      root.id = 'orr-root';
      document.body.appendChild(root);
    }
    root.innerHTML = html;
  }

  function mountError(err) {
    mount(`<div id="orr-error">
      <h2>Old Reddit Redux hit a snag</h2>
      <p>${ORR.escapeHtml(err.message)}</p>
      <p><a href="${location.pathname}">reload</a></p>
    </div>`);
  }

  // ---- Event delegation for votes / save / hide / collapse ----
  document.addEventListener('click', async (e) => {
    const arrow = e.target.closest('.arrow');
    if (arrow) {
      e.preventDefault();
      const fullname = arrow.dataset.fullname;
      const dir = Number(arrow.dataset.dir);
      const alreadyActive = arrow.classList.contains('upmod') || arrow.classList.contains('downmod');
      const effectiveDir = alreadyActive ? 0 : dir;
      try {
        await ORR.actions.vote(fullname, effectiveDir);
        const container = arrow.closest('.midcol');
        qsa('.arrow', container).forEach((a) => a.classList.remove('upmod', 'downmod'));
        if (effectiveDir !== 0) arrow.classList.add(dir === 1 ? 'upmod' : 'downmod');

        // Update the displayed number too — previously only the arrow
        // color changed, so the score shown never reflected the vote.
        // Comments keep their score in the tagline text, not the midcol,
        // so look it up via the enclosing .thing rather than .midcol.
        const thing = arrow.closest('.thing');
        const scoreEl = thing && thing.querySelector('.score[data-score]');
        if (scoreEl) {
          const baseScore = Number(scoreEl.dataset.score);
          const baseLikes = Number(scoreEl.dataset.likes || '0');
          const newScore = baseScore - baseLikes + effectiveDir;
          const suffix = scoreEl.dataset.suffix || '';
          scoreEl.textContent = ORR.formatScore(newScore) + suffix;
          scoreEl.dataset.likes = String(effectiveDir);
          if (scoreEl.hasAttribute('title')) scoreEl.title = String(newScore);
        }
      } catch (err) {
        alert(err.message);
      }
      return;
    }

    const saveBtn = e.target.closest('.save-button');
    if (saveBtn) {
      e.preventDefault();
      try {
        await ORR.actions.save(saveBtn.dataset.fullname);
        saveBtn.textContent = 'saved';
      } catch (err) {
        alert(err.message);
      }
      return;
    }

    const hideBtn = e.target.closest('.hide-button');
    if (hideBtn) {
      e.preventDefault();
      try {
        await ORR.actions.hide(hideBtn.dataset.fullname);
        const thing = hideBtn.closest('.thing');
        if (thing) thing.style.display = 'none';
      } catch (err) {
        alert(err.message);
      }
      return;
    }

    const collapseToggle = e.target.closest('.collapse-toggle');
    if (collapseToggle) {
      e.preventDefault();
      const thing = collapseToggle.closest('.thing.comment');
      thing.classList.toggle('collapsed');
      collapseToggle.textContent = thing.classList.contains('collapsed') ? '[+]' : '[\u2013]';
      return;
    }

    const subBtn = e.target.closest('.orr-subscribe-btn');
    if (subBtn) {
      e.preventDefault();
      const srFullname = subBtn.dataset.srFullname;
      const currentlySubscribed = subBtn.dataset.subscribed === 'true';
      subBtn.disabled = true;
      try {
        await ORR.actions.subscribe(srFullname, !currentlySubscribed);
        subBtn.dataset.subscribed = String(!currentlySubscribed);
        subBtn.textContent = !currentlySubscribed ? 'leave' : 'join';
        subBtn.classList.toggle('subscribed', !currentlySubscribed);
      } catch (err) {
        alert(err.message);
      } finally {
        subBtn.disabled = false;
      }
      return;
    }

    const expandoBtn = e.target.closest('.expando-button');
    if (expandoBtn) {
      e.preventDefault();
      const thing = expandoBtn.closest('.thing');
      const expandoDiv = thing && thing.querySelector('.expando');
      if (!expandoDiv) return;

      const collapsed = expandoBtn.classList.contains('collapsed');
      if (collapsed) {
        // First open: lazily build the media preview so nothing loads/plays
        // until the person actually asks for it.
        if (expandoDiv.dataset.populated === 'false') {
          const type = expandoBtn.dataset.expandoType;
          let data = {};
          try {
            data = JSON.parse(expandoBtn.dataset.expando || '{}');
          } catch (err) {
            data = {};
          }
          expandoDiv.innerHTML = ORR.render.buildExpandoContent(type, data);
          expandoDiv.dataset.populated = 'true';
        } else {
          // Re-opening after a collapse: restore any iframe src we cleared
          // (see below) so a YouTube/Vimeo embed reloads instead of staying blank.
          ORR.qsa('iframe[data-orr-src]', expandoDiv).forEach((f) => {
            f.src = f.dataset.orrSrc;
          });
        }
        expandoDiv.style.display = '';
        expandoDiv.classList.add('expando-expanded');
        expandoDiv.classList.remove('expando-collapsed');
        expandoBtn.classList.remove('collapsed');
        expandoBtn.classList.add('expanded');
      } else {
        // Collapse: hide and stop any playing media rather than destroying
        // it, so re-opening doesn't need to refetch. display:none alone
        // doesn't reliably stop a cross-origin <iframe> (e.g. YouTube) from
        // continuing to play audio in the background, so its src is
        // cleared too (and restored on next expand, above).
        expandoDiv.style.display = 'none';
        expandoDiv.classList.remove('expando-expanded');
        expandoDiv.classList.add('expando-collapsed');
        expandoBtn.classList.remove('expanded');
        expandoBtn.classList.add('collapsed');
        ORR.qsa('video', expandoDiv).forEach((v) => v.pause());
        ORR.qsa('iframe', expandoDiv).forEach((f) => {
          if (!f.dataset.orrSrc) f.dataset.orrSrc = f.src;
          f.src = '';
        });
      }
      return;
    }

    const more = e.target.closest('.morecomments a');
    if (more) {
      e.preventDefault();
      const stub = more.closest('.morecomments');
      const parentId = stub.dataset.parentId;
      const commentarea = stub.closest('.commentarea');
      const linkId = commentarea && commentarea.dataset.linkId;

      let childrenIds = [];
      try {
        childrenIds = JSON.parse(stub.dataset.children || '[]');
      } catch (err) {
        childrenIds = [];
      }

      if (!linkId || !childrenIds.length) {
        stub.outerHTML = '<div class="morecomments">nothing more to load</div>';
        return;
      }

      more.textContent = 'loading\u2026';
      try {
        // Reddit's morechildren endpoint caps each request at ~100 ids.
        const CHUNK_SIZE = 100;
        const chunk = childrenIds.slice(0, CHUNK_SIZE);
        const remaining = childrenIds.slice(CHUNK_SIZE);

        const things = await ORR.api.moreChildren(linkId, chunk);
        const roots = ORR.render.buildMoreChildrenTree(things, parentId);
        let html = roots.map(ORR.render.commentNode).join('');

        if (remaining.length) {
          html += `<div class="morecomments" data-parent-id="${parentId}" data-children='${ORR.escapeHtml(JSON.stringify(remaining))}'>
            <a href="#">load more comments (${remaining.length})</a>
          </div>`;
        }

        stub.outerHTML = html || '<div class="morecomments">no more comments</div>';
      } catch (err) {
        stub.innerHTML = `<span class="morecomments-error">${ORR.escapeHtml(err.message)}</span>`;
      }
      return;
    }
  });

  window.addEventListener('orr:locationchange', debounce(handleRoute, 50));
  window.addEventListener('DOMContentLoaded', handleRoute);
  // In case the script runs after DOMContentLoaded already fired:
  if (document.readyState !== 'loading') handleRoute();
})();
