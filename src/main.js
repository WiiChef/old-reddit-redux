// src/main.js
(function () {
  const { qsa, debounce, parseQuery } = ORR;

  // Mark the content-script <style> tag so renderMount doesn't strip it.
  // Content-script CSS is injected at document_start as a bare <style> in
  // <head> with no identifying attribute.  Tag it NOW (before renderMount
  // runs and removes every style:not([data-orr])).
  document.querySelectorAll('head style').forEach((s) => {
    if (s.textContent.includes('#orr-root')) {
      s.setAttribute('data-orr', '1');
    }
  });
  let renderToken = 0; // guards against a stale async render clobbering a newer one
  let infiniteObserver = null; // current IntersectionObserver, one per mounted listing page
  let currentUsername = ''; // cached from identity, used by reply button outside handleRoute scope
  let currentSubreddit = ''; // cached subreddit for search scoping

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
      currentUsername = identity && identity.data && identity.data.name ? identity.data.name : '';
      const query = parseQuery(location.search);

      let html;
      // Set for listing-type pages only: lets us wire up infinite scroll
      // after mount without re-deriving the route's fetch semantics.
      let listingAfter = null;
      let nextPageFetcher = null;

      // Cache current subreddit for search scoping
      let routeSub = null;
      if (['post', 'subreddit', 'subreddit-sort'].includes(match.name)) {
        routeSub = match.params[0];
      } else if (match.name === 'search') {
        const sm = match.params[0] && match.params[0].match(/^r\/([\w-]+)\//);
        routeSub = sm ? sm[1] : null;
      }

      if (match.name === 'post') {
        const [sub, id] = match.params;
        const [[postListing, commentListing], about, rules, mods, flairs] = await Promise.all([
          ORR.api.fetchPostAndComments(`/r/${sub}/comments/${id}`),
          ORR.api.fetchSubredditAbout(sub).catch(() => null),
          ORR.api.fetchSubredditRules(sub).catch(() => []),
          ORR.api.fetchSubredditMods(sub).catch(() => []),
          ORR.api.fetchSubredditFlairs(sub).catch(() => []),
        ]);
        if (myToken !== renderToken) return;
        const headerHtml = ORR.render.header(identity, sub);
        const flairTypes = (flairs && flairs.data) || (flairs && flairs.link_flair_types) || [];
        const sidebarHtml = ORR.render.sidebar(about, rules ? (rules.data || rules) : [], mods ? mods.data : [], flairTypes);
        html = ORR.render.postPage(postListing, commentListing, headerHtml, sidebarHtml);
      } else if (match.name === 'subreddit' || match.name === 'subreddit-sort') {
        const sub = match.params[0];
        const sort = match.params[1] || query.sort || 'hot';
        const fetchQuery = { ...query };
        const [listing, about, rules, mods, flairs] = await Promise.all([
          ORR.api.fetchListing(`/r/${sub}/${sort}`, fetchQuery),
          ORR.api.fetchSubredditAbout(sub).catch(() => null),
          ORR.api.fetchSubredditRules(sub).catch(() => []),
          ORR.api.fetchSubredditMods(sub).catch(() => []),
          ORR.api.fetchSubredditFlairs(sub).catch(() => []),
        ]);
        if (myToken !== renderToken) return;
        const headerHtml = ORR.render.header(identity, sub, sort);
        const flairTypes = (flairs && flairs.data) || (flairs && flairs.link_flair_types) || [];
        const sidebarHtml = ORR.render.sidebar(about, rules ? (rules.data || rules) : [], mods ? mods.data : [], flairTypes);
        html = ORR.render.listing(listing, { headerHtml, sidebarHtml });
        listingAfter = listing.data.after;
        nextPageFetcher = (after) => ORR.api.fetchListing(`/r/${sub}/${sort}`, { ...fetchQuery, after });
      } else if (match.name === 'user-profile') {
        const username = match.params[0];
        const [listing, profile] = await Promise.all([
          ORR.api.fetchUser(username, query),
          ORR.api.fetchUserProfile(username).catch(() => null),
        ]);
        if (myToken !== renderToken) return;
        const headerHtml = ORR.render.header(identity, null);
        const sidebarHtml = ORR.render.userSidebar(profile);
        html = ORR.render.listing(listing, { headerHtml, sidebarHtml, isUserPage: true });
        listingAfter = listing.data.after;
        nextPageFetcher = (after) => ORR.api.fetchUser(username, { ...query, after });
      } else if (match.name === 'user') {
        const username = match.params[0];
        const [listing, profile] = await Promise.all([
          ORR.api.fetchUser(username, query),
          ORR.api.fetchUserProfile(username).catch(() => null),
        ]);
        if (myToken !== renderToken) return;
        const headerHtml = ORR.render.header(identity, null);
        const sidebarHtml = ORR.render.userSidebar(profile, username);
        html = ORR.render.listing(listing, { headerHtml, sidebarHtml, isUserPage: true });
        listingAfter = listing.data.after;
        nextPageFetcher = (after) => ORR.api.fetchUser(username, { ...query, after });
      } else if (match.name === 'user-comments' || match.name === 'user-submitted' || match.name === 'user-upvoted' || match.name === 'user-downvoted' || match.name === 'user-saved') {
        const username = match.params[0];
        const page = match.name.replace('user-', '');
        const params = { ...query, sort: query.sort || 'new' };
        const [listing, profile] = await Promise.all([
          ORR.api.fetchUserListing(username, page, params),
          ORR.api.fetchUserProfile(username).catch(() => null),
        ]);
        if (myToken !== renderToken) return;
        const headerHtml = ORR.render.header(identity, null);
        const sidebarHtml = ORR.render.userSidebar(profile, username);
        html = ORR.render.listing(listing, { headerHtml, sidebarHtml, isUserPage: true });
        listingAfter = listing.data.after;
        nextPageFetcher = (after) => ORR.api.fetchUserListing(username, page, { ...params, after });
      } else if (match.name === 'search') {
        // The search route pattern captures just the subreddit name in group 1,
        // so match.params[0] is the sub name (e.g. "pics") or undefined for
        // sitewide search.
        const scopedSub = match.params[0] || null;
        // Also check pathname directly as fallback — prevents silent
        // sitewide search if restrict_sr param was lost during navigation.
        const pathScoped = location.pathname.includes('/search') && !scopedSub;
        const isScoped = !!scopedSub || (pathScoped && query.restrict_sr);
        const finalSub = scopedSub;
        const searchPath = finalSub ? `/r/${finalSub}/search` : '/search';
        // Always force restrict_sr=on for subreddit-scoped searches
        const searchParams = isScoped ? { ...query, restrict_sr: 'on' } : query;
        const listing = await ORR.api.fetchListing(searchPath, { q: query.q || '', ...searchParams, restrict_sr: finalSub ? 'on' : undefined });
        if (myToken !== renderToken) return;
        const headerHtml = ORR.render.header(identity, scopedSub);
        html = ORR.render.listing(listing, { headerHtml });
        listingAfter = listing.data.after;
        nextPageFetcher = (after) =>
          ORR.api.fetchListing(searchPath, { q: query.q || '', ...searchParams, restrict_sr: finalSub ? 'on' : undefined, after });
      } else if (match.name === 'domain') {
        // /domain/example.com
        const domain = match.params[0];
        const listing = await ORR.api.fetchListing(`/domain/${domain}`, query);
        if (myToken !== renderToken) return;
        const headerHtml = ORR.render.header(identity, null);
        html = ORR.render.listing(listing, { headerHtml });
        listingAfter = listing.data.after;
        nextPageFetcher = (after) => ORR.api.fetchListing(`/domain/${domain}`, { ...query, after });
      } else if (match.name === 'submit') {
        const sub = match.params[0] || '';
        if (myToken !== renderToken) return;
        const headerHtml = ORR.render.header(identity, sub || null);
        html = ORR.render.submitPage(sub, headerHtml);
      } else {
        // front page, /hot, /new, /top, /rising, /controversial, /best
        const sort = (match.params[0] || 'hot');
        const path = sort === 'hot' ? '/' : `/${sort}`;
        const fetchQuery = { ...query };
        const listing = await ORR.api.fetchListing(path, fetchQuery);
        if (myToken !== renderToken) return;
        const headerHtml = ORR.render.header(identity, null, sort);
        html = ORR.render.listing(listing, { headerHtml });
        listingAfter = listing.data.after;
        nextPageFetcher = (after) => ORR.api.fetchListing(path, { ...fetchQuery, after });
      }

      currentSubreddit = routeSub || '';

      mount(html);
      if (nextPageFetcher) setupInfiniteScroll(nextPageFetcher, listingAfter);
      if (match.name === 'submit') initSubmitPage();
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
    renderMount(ORR.render.skeleton());
  }

  function renderMount(html) {
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

    // Remove Reddit's injected <style> tags from <head> on EVERY render.
    // The SPA can re-inject styles during navigation (e.g. dark-theme CSS
    // vars, subreddit theme overrides). If we don't strip them each time,
    // they leak into #orr-root and override our hardcoded dark palette —
    // e.g. comment text turning dark-on-dark. Only our own CSS carries
    // data-orr and is preserved.
    document.querySelectorAll('head style:not([data-orr])').forEach((s) => s.remove());
    document.querySelectorAll('head link[rel="stylesheet"]:not([data-orr])').forEach((l) => l.remove());

    root.innerHTML = html;
  }


  function mountError(err) {
    mount(`<div id="orr-error">
      <h2>Old Reddit Redux hit a snag</h2>
      <p>${ORR.escapeHtml(err.message)}</p>
      <p><a href="${location.pathname}">reload</a></p>
    </div>`);
  }

  // Title character counter for submit page
  function initTitleCounter() {
    const titleInput = document.getElementById('submit-title');
    const counter = document.getElementById('title-count');
    if (!titleInput || !counter) return;
    const update = () => { counter.textContent = `${titleInput.value.length} / 300`; };
    titleInput.addEventListener('input', update);
    update();
  }

  // Load post flair options for submit page
  async function loadSubmitFlairs(subreddit) {
    if (!subreddit) return;
    const flairSelect = document.getElementById('submit-flair');
    const flairField = document.querySelector('.submit-flair-field');
    if (!flairSelect) return;
    try {
      const flairs = await ORR.api.fetchSubredditFlairs(subreddit).catch(() => null);
      const types = (flairs && flairs.data) || (flairs && flairs.link_flair_types) || [];
      if (types.length && flairField) {
        flairField.style.display = '';
        types.forEach((f) => {
          const opt = document.createElement('option');
          opt.value = f.text || '';
          opt.textContent = f.text || '(blank)';
          flairSelect.appendChild(opt);
        });
      }
    } catch (err) {
      // Flair loading is optional, ignore errors
    }
  }

  // Initialize submit page after render
  function initSubmitPage() {
    const form = document.getElementById('orr-submit-form');
    if (!form) return;
    initTitleCounter();
    const subreddit = form.querySelector('input[name="sr"]').value;
    if (subreddit) loadSubmitFlairs(subreddit);
  }

  // Search filter change handler
  function applySearchFilters() {
    const sortSelect = document.getElementById('search-sort');
    const timeSelect = document.getElementById('search-time');
    if (!sortSelect || !timeSelect) return;
    const params = new URLSearchParams(location.search || '');
    params.set('sort', sortSelect.value);
    params.set('t', timeSelect.value);
    // Always enforce restrict_sr on subreddit-scoped search paths so
    // changing sort/time filters never silently widens to all of Reddit.
    if (location.pathname.match(/\/r\/[\w-]+\/search/)) {
      params.set('restrict_sr', 'on');
    }
    const newUrl = `${location.pathname}?${params.toString()}`;
    history.pushState(null, '', newUrl);
    window.dispatchEvent(new Event('orr:locationchange'));
  }

  // ---- Event delegation for votes / save / hide / collapse / reply / etc ----
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

        // Handle the new three-span score structure (dislikes/unvoted/likes)
        // The visible span is controlled by CSS based on midcol-upvoted/midcol-downvoted classes
        const scoreUnvoted = thing && thing.querySelector('.score.unvoted');
        const scoreLikes = thing && thing.querySelector('.score.likes');
        const scoreDislikes = thing && thing.querySelector('.score.dislikes');

        if (scoreUnvoted) {
          const baseScore = Number(scoreUnvoted.title || scoreUnvoted.textContent);

          // Update all three spans
          scoreUnvoted.textContent = `${ORR.formatScore(baseScore)} points`;
          scoreUnvoted.title = String(baseScore);

          if (scoreLikes) {
            scoreLikes.textContent = `${ORR.formatScore(baseScore + 1)} points`;
            scoreLikes.title = String(baseScore + 1);
          }
          if (scoreDislikes) {
            scoreDislikes.textContent = `${ORR.formatScore(Math.max(0, baseScore - 1))} points`;
            scoreDislikes.title = String(Math.max(0, baseScore - 1));
          }

          // Toggle CSS classes to show/hide the right span
          thing.classList.remove('midcol-upvoted', 'midcol-downvoted');
          if (effectiveDir === 1) thing.classList.add('midcol-upvoted');
          else if (effectiveDir === -1) thing.classList.add('midcol-downvoted');
        } else {
          // Fallback for old single-score structure
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
        }
      } catch (err) {
        alert(err.message);
      }
      return;
    }

    // Reply button — show/hide reply form
    const replyBtn = e.target.closest('.reply-button');
    if (replyBtn) {
      e.preventDefault();
      const thing = replyBtn.closest('.thing.comment');
      const existing = thing && thing.querySelector('.reply-form');
      if (existing) {
        existing.remove();
        return;
      }
      const parentFullname = replyBtn.dataset.fullname;
      const postThing = document.querySelector('.thing.link[data-fullname]');
      const linkId = postThing ? postThing.dataset.fullname : '';
      const formHtml = `
        <div class="reply-form">
          <textarea class="reply-textarea" placeholder="Reply as ${currentUsername || 'guest'}..." rows="4"></textarea>
          <div class="reply-actions">
            <button class="reply-submit-btn" data-parent="${parentFullname}" data-link-id="${linkId}">reply</button>
            <button class="reply-cancel-btn">cancel</button>
          </div>
        </div>`;
      if (thing) {
        const buttonsUl = thing.querySelector('.buttons');
        if (buttonsUl) {
          buttonsUl.insertAdjacentHTML('afterend', formHtml);
        }
      }
      const textarea = thing && thing.querySelector('.reply-textarea');
      if (textarea) textarea.focus();
      return;
    }

    // Reply form submit
    const replySubmit = e.target.closest('.reply-submit-btn');
    if (replySubmit) {
      e.preventDefault();
      const parentFullname = replySubmit.dataset.parent;
      const form = replySubmit.closest('.reply-form');
      const textarea = form && form.querySelector('.reply-textarea');
      const text = (textarea && textarea.value.trim()) || '';
      if (!text) { alert('Please enter some text.'); textarea && textarea.focus(); return; }
      replySubmit.disabled = true;
      replySubmit.textContent = 'posting...';
      try {
        await ORR.actions.comment(parentFullname, text);
        form.remove();
        // Show a brief success indicator
        const thing = replySubmit.closest('.thing.comment') || replySubmit.closest('.commentarea');
        if (thing) {
          const indicator = document.createElement('div');
          indicator.className = 'orr-action-success';
          indicator.textContent = 'Comment posted!';
          thing.appendChild(indicator);
          setTimeout(() => indicator.remove(), 2000);
        }
      } catch (err) {
        alert(err.message);
      } finally {
        replySubmit.disabled = false;
        replySubmit.textContent = 'reply';
      }
      return;
    }

    // Reply form cancel
    const replyCancel = e.target.closest('.reply-cancel-btn');
    if (replyCancel) {
      e.preventDefault();
      const form = replyCancel.closest('.reply-form');
      if (form) form.remove();
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

    // Share button modal/popover
    const shareBtn = e.target.closest('.share-button, .buttons a:not([class]):nth-child(4)');
    if (shareBtn && shareBtn.textContent === 'share') {
      e.preventDefault();
      const thing = shareBtn.closest('.thing');
      const permalink = shareBtn.dataset.permalink || (thing && thing.dataset.permalink) || '';
      const fullUrl = permalink.startsWith('http') ? permalink : `https://www.reddit.com${permalink}`;
      // Extract post ID for redd.it shortlink
      const idMatch = permalink.match(/\/comments\/(\w+)/);
      const shortUrl = idMatch ? `https://redd.it/${idMatch[1]}` : fullUrl;

      let modal = document.getElementById('orr-share-modal');
      if (modal) modal.remove();
      modal = document.createElement('div');
      modal.id = 'orr-share-modal';
      modal.className = 'orr-modal-overlay';
      modal.innerHTML = `
        <div class="orr-modal">
          <div class="orr-modal-header">
            <h2>Share Post / Link</h2>
            <button class="orr-modal-close">&times;</button>
          </div>
          <div class="orr-modal-body">
            <div class="orr-share-field">
              <label>Permalink:</label>
              <input type="text" readonly value="${ORR.escapeHtml(fullUrl)}" id="orr-share-url" />
              <button id="orr-copy-permalink-btn">Copy</button>
            </div>
            ${idMatch ? `
            <div class="orr-share-field" style="margin-top:10px">
              <label>Shortlink:</label>
              <input type="text" readonly value="${ORR.escapeHtml(shortUrl)}" id="orr-share-shorturl" />
              <button id="orr-copy-shortlink-btn">Copy</button>
            </div>` : ''}
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.querySelector('.orr-modal-close').addEventListener('click', () => modal.remove());
      modal.addEventListener('click', (ev) => { if (ev.target === modal) modal.remove(); });
      modal.querySelector('#orr-copy-permalink-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(fullUrl);
        modal.querySelector('#orr-copy-permalink-btn').textContent = 'Copied!';
      });
      if (idMatch) {
        modal.querySelector('#orr-copy-shortlink-btn').addEventListener('click', () => {
          navigator.clipboard.writeText(shortUrl);
          modal.querySelector('#orr-copy-shortlink-btn').textContent = 'Copied!';
        });
      }
      return;
    }

    // Report button modal
    const reportBtn = e.target.closest('.report-button');
    if (reportBtn) {
      e.preventDefault();
      const fullname = reportBtn.dataset.fullname;
      let modal = document.getElementById('orr-report-modal');
      if (modal) modal.remove();
      modal = document.createElement('div');
      modal.id = 'orr-report-modal';
      modal.className = 'orr-modal-overlay';
      modal.innerHTML = `
        <div class="orr-modal">
          <div class="orr-modal-header">
            <h2>Report Content</h2>
            <button class="orr-modal-close">&times;</button>
          </div>
          <div class="orr-modal-body">
            <label style="display:block;margin-bottom:6px;font-size:11px">Select a reason for reporting:</label>
            <select id="orr-report-reason" style="width:100%;padding:6px;background:#0a0a0a;color:#d7dadc;border:1px solid #333;border-radius:3px">
              <option value="spam">Spam</option>
              <option value="harassment">Harassment or bullying</option>
              <option value="hate">Hate speech</option>
              <option value="violence">Violence or threats</option>
              <option value="impersonation">Impersonation</option>
              <option value="copyright">Copyright / IP infringement</option>
              <option value="other">Other issue</option>
            </select>
            <div style="margin-top:12px;text-align:right">
              <button id="orr-submit-report-btn" class="submit-post-btn" style="padding:4px 12px">Submit Report</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.querySelector('.orr-modal-close').addEventListener('click', () => modal.remove());
      modal.addEventListener('click', (ev) => { if (ev.target === modal) modal.remove(); });
      modal.querySelector('#orr-submit-report-btn').addEventListener('click', async () => {
        const reason = modal.querySelector('#orr-report-reason').value;
        const btn = modal.querySelector('#orr-submit-report-btn');
        btn.disabled = true;
        btn.textContent = 'submitting...';
        try {
          await ORR.actions.report(fullname, reason);
          modal.remove();
          alert('Report submitted. Thank you for keeping Reddit safe.');
        } catch (err) {
          alert(err.message);
          btn.disabled = false;
          btn.textContent = 'Submit Report';
        }
      });
      return;
    }

    // Collapse/expand toggle — old Reddit uses .expand and .numchildren
    const expandToggle = e.target.closest('.expand, .numchildren');
    if (expandToggle) {
      e.preventDefault();
      const thing = expandToggle.closest('.thing.comment');
      thing.classList.toggle('collapsed');
      const isCollapsed = thing.classList.contains('collapsed');
      // Update the [–] / [+] expand link
      const expandLink = thing && thing.querySelector('.expand');
      if (expandLink) expandLink.textContent = isCollapsed ? '[+]' : '[\u2013]';
      return;
    }

    // Collapse all / Expand all
    const collapseAllBtn = e.target.closest('.orr-collapse-all');
    if (collapseAllBtn) {
      e.preventDefault();
      qsa('.thing.comment', document).forEach((c) => {
        if (!c.classList.contains('collapsed')) {
          c.classList.add('collapsed');
          const toggle = c.querySelector('.expand');
          if (toggle) toggle.textContent = '[+]';
        }
      });
      return;
    }

    const expandAllBtn = e.target.closest('.orr-expand-all');
    if (expandAllBtn) {
      e.preventDefault();
      qsa('.thing.comment', document).forEach((c) => {
        if (c.classList.contains('collapsed')) {
          c.classList.remove('collapsed');
          const toggle = c.querySelector('.expand');
          if (toggle) toggle.textContent = '[\u2013]';
        }
      });
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
          const fullname = expandoBtn.dataset.fullname;
          // Data is stored in a Map keyed by fullname to avoid round-tripping
          // JSON through an HTML attribute (which would require HTML-escaping
          // and then unescaping + JSON.parse on read — error-prone).
          const data = (ORR._expandoData && ORR._expandoData.get(fullname)) || {};
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

    // Submit page tab switching
    const submitTab = e.target.closest('.submit-tab');
    if (submitTab) {
      e.preventDefault();
      const type = submitTab.dataset.type;
      const form = document.getElementById('orr-submit-form');
      if (form) {
        qsa('.submit-tab', form).forEach((t) => t.classList.remove('active'));
        submitTab.classList.add('active');
        const typeInput = form.querySelector('#submit-type');
        if (typeInput) typeInput.value = type;
        // Show/hide fields based on type
        const urlField = form.querySelector('.submit-url-field');
        const textField = form.querySelector('.submit-text-field');
        const fileField = form.querySelector('.submit-file-field');
        if (urlField) urlField.style.display = type === 'link' ? '' : 'none';
        if (textField) textField.style.display = type === 'self' ? '' : 'none';
        if (fileField) fileField.style.display = type === 'image' ? '' : 'none';
      }
      return;
    }

    // Submit form submission
    const submitForm = e.target.closest('#orr-submit-form');
    if (submitForm && e.target.type === 'submit') {
      e.preventDefault();
      const title = submitForm.querySelector('#submit-title').value.trim();
      if (!title) { alert('Please enter a title.'); return; }
      const type = submitForm.querySelector('#submit-type').value;
      const subreddit = submitForm.querySelector('input[name="sr"]').value;
      if (!subreddit) { alert('Please select a subreddit.'); return; }

      // Image uploads require multipart/form-data — redirect to Reddit for those
      if (type === 'image') {
        const fileInput = submitForm.querySelector('#submit-file');
        if (!fileInput || !fileInput.files.length) { alert('Please select a file.'); return; }
        const submitUrl = new URL(`https://www.reddit.com/r/${subreddit}/submit`);
        submitUrl.searchParams.set('title', title);
        submitUrl.searchParams.set('type', 'image');
        window.location.href = submitUrl.toString();
        return;
      }

      // Text and link posts can use the API directly
      const submitBtn = submitForm.querySelector('.submit-post-btn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'posting...';
      try {
        let url = '', text = '';
        if (type === 'link') {
          url = submitForm.querySelector('#submit-url').value.trim();
          if (!url) { alert('Please enter a URL.'); return; }
        } else if (type === 'self') {
          text = submitForm.querySelector('#submit-text').value.trim();
          if (!text) { alert('Please enter some text.'); return; }
        }
        const nsfw = submitForm.querySelector('#submit-nsfw').checked;
        const spoiler = submitForm.querySelector('#submit-spoiler').checked;
        const result = await ORR.actions.submit(subreddit, title, type, url, text, nsfw, spoiler);
        // Navigate to the newly created post
        const permalink = result && result.json && result.json.data && result.json.data.permalink;
        if (permalink) {
          window.location.href = `https://www.reddit.com${permalink}`;
        } else {
          window.location.href = `https://www.reddit.com/r/${subreddit}`;
        }
      } catch (err) {
        alert(err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Post';
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

      more.textContent = 'loading...';
      try {
        // Reddit's morechildren endpoint caps each request at ~100 ids.
        const CHUNK_SIZE = 100;
        const chunk = childrenIds.slice(0, CHUNK_SIZE);
        const remaining = childrenIds.slice(CHUNK_SIZE);

        const things = await ORR.api.moreChildren(linkId, chunk);
        const roots = ORR.render.buildMoreChildrenTree(things, parentId);
        let html = roots.map(ORR.render.commentNode).join('');

        if (remaining.length) {
          html += `<div class="morecomments" data-parent-id="${parentId}" data-children='${JSON.stringify(remaining)}'>
            <a href="#">load more comments (${remaining.length})</a>
          </div>`;
        }

        stub.outerHTML = html || '<div class="morecomments">no more comments</div>';
      } catch (err) {
        // Preserve retry capability by keeping the stub with its data attributes
        // and showing a retryable error message instead of destroying the stub.
        more.textContent = `error: ${ORR.escapeHtml(err.message)} — click to retry`;
        more.style.color = '#ff4500';
        return;
      }
      return;
    }
  });

  // ---- Keyboard Navigation Shortcuts ----
  let currentFocusedIndex = -1;
  let cachedVisibleThings = null;

  // Invalidate cache on navigation or DOM mutations
  function invalidateThingsCache() {
    cachedVisibleThings = null;
  }

  function getVisibleThings() {
    if (!cachedVisibleThings) {
      cachedVisibleThings = Array.from(document.querySelectorAll('.thing')).filter(
        (el) => el.offsetWidth > 0 && el.offsetHeight > 0
      );
    }
    return cachedVisibleThings;
  }

  // Invalidate cache after mount (DOM changed)
  function mount(html) {
    invalidateThingsCache();
    renderMount(html);
  }

  function setFocusedThing(index) {
    const things = getVisibleThings();
    if (!things.length) return;
    things.forEach((t) => t.classList.remove('keyboard-focus'));
    if (index < 0) index = 0;
    if (index >= things.length) index = things.length - 1;
    currentFocusedIndex = index;
    const target = things[index];
    if (target) {
      target.classList.add('keyboard-focus');
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function toggleShortcutsModal() {
    let modal = document.getElementById('orr-shortcuts-modal');
    if (modal) {
      modal.remove();
      return;
    }
    modal = document.createElement('div');
    modal.id = 'orr-shortcuts-modal';
    modal.className = 'orr-modal-overlay';
    modal.innerHTML = `
      <div class="orr-modal">
        <div class="orr-modal-header">
          <h2>Keyboard Shortcuts</h2>
          <button class="orr-modal-close">&times;</button>
        </div>
        <div class="orr-modal-body">
          <table class="orr-shortcuts-table">
            <tr><td><kbd>j</kbd> / <kbd>↓</kbd></td><td>Next post / comment</td></tr>
            <tr><td><kbd>k</kbd> / <kbd>↑</kbd></td><td>Previous post / comment</td></tr>
            <tr><td><kbd>a</kbd></td><td>Upvote</td></tr>
            <tr><td><kbd>z</kbd></td><td>Downvote</td></tr>
            <tr><td><kbd>e</kbd></td><td>Toggle expando (media preview)</td></tr>
            <tr><td><kbd>c</kbd></td><td>Open comments</td></tr>
            <tr><td><kbd>l</kbd></td><td>Open post link in new tab</td></tr>
            <tr><td><kbd>s</kbd></td><td>Save post / comment</td></tr>
            <tr><td><kbd>h</kbd></td><td>Hide post</td></tr>
            <tr><td><kbd>r</kbd></td><td>Reply to comment</td></tr>
            <tr><td><kbd>?</kbd></td><td>Toggle shortcuts help</td></tr>
          </table>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.orr-modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  document.addEventListener('keydown', (e) => {
    // Ignore input/textarea/editable
    const tag = e.target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    const things = getVisibleThings();
    if (!things.length && e.key !== '?') return;

    switch (e.key) {
      case 'j':
      case 'ArrowDown':
        e.preventDefault();
        setFocusedThing(currentFocusedIndex + 1);
        break;
      case 'k':
      case 'ArrowUp':
        e.preventDefault();
        setFocusedThing(currentFocusedIndex - 1);
        break;
      case 'a':
        if (currentFocusedIndex >= 0 && things[currentFocusedIndex]) {
          const upBtn = things[currentFocusedIndex].querySelector('.arrow.up');
          if (upBtn) upBtn.click();
        }
        break;
      case 'z':
        if (currentFocusedIndex >= 0 && things[currentFocusedIndex]) {
          const downBtn = things[currentFocusedIndex].querySelector('.arrow.down');
          if (downBtn) downBtn.click();
        }
        break;
      case 'e':
        if (currentFocusedIndex >= 0 && things[currentFocusedIndex]) {
          const expando = things[currentFocusedIndex].querySelector('.expando-button');
          if (expando) expando.click();
        }
        break;
      case 'c':
        if (currentFocusedIndex >= 0 && things[currentFocusedIndex]) {
          const link = things[currentFocusedIndex].querySelector('a.title, .flat-list a[href*="/comments/"]');
          if (link) window.location.href = link.href;
        }
        break;
      case 'l':
        if (currentFocusedIndex >= 0 && things[currentFocusedIndex]) {
          const link = things[currentFocusedIndex].querySelector('a.title');
          if (link) window.open(link.href, '_blank', 'noopener,noreferrer');
        }
        break;
      case 's':
        if (currentFocusedIndex >= 0 && things[currentFocusedIndex]) {
          const saveBtn = things[currentFocusedIndex].querySelector('.save-button');
          if (saveBtn) saveBtn.click();
        }
        break;
      case 'h':
        if (currentFocusedIndex >= 0 && things[currentFocusedIndex]) {
          const hideBtn = things[currentFocusedIndex].querySelector('.hide-button');
          if (hideBtn) hideBtn.click();
        }
        break;
      case 'r':
        if (currentFocusedIndex >= 0 && things[currentFocusedIndex]) {
          const replyBtn = things[currentFocusedIndex].querySelector('.reply-button');
          if (replyBtn) replyBtn.click();
        }
        break;
      case '?':
        e.preventDefault();
        toggleShortcutsModal();
        break;
      case 'Escape':
        const modal = document.getElementById('orr-shortcuts-modal');
        if (modal) modal.remove();
        break;
    }
  });

  // Search form submission — append query to current subreddit URL instead of using Reddit's search API
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'search') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const input = e.target.querySelector('input[name="q"]');
    if (!input || !input.value.trim()) return;

    const restrictCheckbox = e.target.querySelector('#search-restrict-sr');
    const isScoped = restrictCheckbox && restrictCheckbox.checked && currentSubreddit;

    if (isScoped) {
      // Old.reddit style: /r/sub/search?q=term&restrict_sr=on
      const searchUrl = `/r/${currentSubreddit}/search?q=${encodeURIComponent(input.value.trim())}&restrict_sr=on`;
      history.pushState(null, '', searchUrl);
      window.dispatchEvent(new Event('orr:locationchange'));
    } else {
      // Sitewide search
      const searchUrl = `/search?q=${encodeURIComponent(input.value.trim())}`;
      history.pushState(null, '', searchUrl);
      window.dispatchEvent(new Event('orr:locationchange'));
    }
  }, true); // capture phase

  // Search filter change events (selects fire 'change', not 'click')
  document.addEventListener('change', (e) => {
    if (e.target.id === 'search-sort' || e.target.id === 'search-time') {
      applySearchFilters();
    }
  });

  window.addEventListener('orr:locationchange', debounce(handleRoute, 50));
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', handleRoute, { once: true });
} else {
  handleRoute();
}
})();
