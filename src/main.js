// src/main.js
(function () {
  const { qs, qsa, debounce, parseQuery } = ORR;
  let renderToken = 0; // guards against a stale async render clobbering a newer one
  let infiniteObserver = null; // current IntersectionObserver, one per mounted listing page
  let currentUsername = ''; // cached from identity, used by reply button outside handleRoute scope
  let currentSettings = null; // loaded from chrome.storage, updated via SETTINGS_APPLY

  // Listen for settings changes from popup/options page
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== 'SETTINGS_APPLY') return;
    currentSettings = message.settings;
    applySettings(currentSettings);
  });

  // Apply settings to the current page
  function applySettings(settings) {
    if (!settings) return;
    const root = document.getElementById('orr-root');
    if (!root) return;

    // Toggle extension on/off
    if (!settings.enabled) {
      document.documentElement.classList.remove('orr-active');
      return;
    }
    document.documentElement.classList.add('orr-active');

    // Theme
    root.className = root.className.replace(/theme-\w+/g, '').trim();
    root.classList.add(`theme-${settings.theme}`);

    // Font size
    root.className = root.className.replace(/font-size-\w+/g, '').trim();
    root.classList.add(`font-size-${settings.fontSize}`);

    // Compact mode
    root.classList.toggle('compact-mode', !!settings.compactMode);

    // Show/hide rank numbers
    qsa('.thing .rank', root).forEach((el) => {
      el.style.display = settings.showRank ? '' : 'none';
    });

    // Auto-expand media
    if (settings.autoExpandMedia) {
      qsa('.expando-button.collapsed', root).forEach((btn) => {
        btn.click();
      });
    }

    // Disable animations
    if (settings.disableAnimations) {
      root.classList.add('no-animations');
    } else {
      root.classList.remove('no-animations');
    }

    // Reload page if enabled was toggled on (to re-render)
    if (settings._reload) {
      location.reload();
    }
  }

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
        const listing = await ORR.api.fetchUser(username, query);
        if (myToken !== renderToken) return;
        const headerHtml = ORR.render.header(identity, null);
        const sidebarHtml = ORR.render.userSidebar(null);
        html = ORR.render.listing(listing, { headerHtml, sidebarHtml, isUserPage: true });
        listingAfter = listing.data.after;
        nextPageFetcher = (after) => ORR.api.fetchUser(username, { ...query, after });
      } else if (match.name === 'user-comments' || match.name === 'user-submitted' || match.name === 'user-upvoted' || match.name === 'user-downvoted' || match.name === 'user-saved') {
        const username = match.params[0];
        const page = match.name.replace('user-', '');
        const listing = await ORR.api.fetchUser(username, { ...query, sort: query.sort || 'new' });
        if (myToken !== renderToken) return;
        const headerHtml = ORR.render.header(identity, null);
        const sidebarHtml = ORR.render.userSidebar(null);
        html = ORR.render.listing(listing, { headerHtml, sidebarHtml, isUserPage: true });
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
      } else if (match.name === 'submit') {
        const sub = match.params[0] || '';
        if (myToken !== renderToken) return;
        const headerHtml = ORR.render.header(identity, sub || null);
        html = ORR.render.submitPage(sub, headerHtml);
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
    const newUrl = `${location.pathname}?${params.toString()}`;
    history.pushState(null, '', newUrl);
    window.dispatchEvent(new Event('orr:locationchange'));
  }

  // ---- Event delegation for votes / save / hide / collapse / reply / etc ----
  document.addEventListener('click', async (e) => {
    // Search filter changes (use change event, but also handle click for selects)
    const searchSort = e.target.closest('#search-sort');
    if (searchSort) {
      e.preventDefault();
      applySearchFilters();
      return;
    }
    const searchTime = e.target.closest('#search-time');
    if (searchTime) {
      e.preventDefault();
      applySearchFilters();
      return;
    }
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
      const linkId = replySubmit.dataset.linkId;
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

    const collapseToggle = e.target.closest('.collapse-toggle');
    if (collapseToggle) {
      e.preventDefault();
      const thing = collapseToggle.closest('.thing.comment');
      thing.classList.toggle('collapsed');
      collapseToggle.textContent = thing.classList.contains('collapsed') ? '[+]' : '[\u2013]';
      return;
    }

    // Collapse all / Expand all
    const collapseAllBtn = e.target.closest('.orr-collapse-all');
    if (collapseAllBtn) {
      e.preventDefault();
      qsa('.thing.comment', document).forEach((c) => {
        if (!c.classList.contains('collapsed')) {
          c.classList.add('collapsed');
          const toggle = c.querySelector('.collapse-toggle');
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
          const toggle = c.querySelector('.collapse-toggle');
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

  // Search filter change events (selects fire 'change', not 'click')
  document.addEventListener('change', (e) => {
    if (e.target.id === 'search-sort' || e.target.id === 'search-time') {
      applySearchFilters();
    }
  });

  window.addEventListener('orr:locationchange', debounce(handleRoute, 50));
  window.addEventListener('DOMContentLoaded', handleRoute);
  // In case the script runs after DOMContentLoaded already fired:
  if (document.readyState !== 'loading') handleRoute();
})();
