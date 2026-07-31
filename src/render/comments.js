// src/render/comments.js
ORR.render = ORR.render || {};

// Reddit's own body_html only ever gives back a plain <a> for links, even
// when the link is a direct image or gif — that's true to how old reddit
// itself behaved, but it makes image-heavy threads tedious to read. This
// scans decoded comment/selftext HTML for anchors pointing at direct media
// and appends an inline preview after them, without touching the original
// link (still there, still clickable through to the source).
const DIRECT_IMAGE_RE = /\.(jpe?g|png|gif|webp)(\?[^\s"']*)?$/i;
const IMGUR_GIFV_RE = /\.gifv(\?[^\s"']*)?$/i;

function embedMedia(html) {
  if (!html) return html;
  const container = document.createElement('div');
  container.innerHTML = html;

  ORR.qsa('a[href]', container).forEach((a) => {
    const href = a.getAttribute('href');
    if (!href) return;

    if (DIRECT_IMAGE_RE.test(href)) {
      const wrapper = document.createElement('div');
      wrapper.className = 'orr-inline-media';
      const link = document.createElement('a');
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const img = document.createElement('img');
      img.src = href;
      img.loading = 'lazy';
      img.alt = '';
      link.appendChild(img);
      wrapper.appendChild(link);
      a.insertAdjacentElement('afterend', wrapper);
    } else if (IMGUR_GIFV_RE.test(href)) {
      // Imgur's .gifv pages aren't a media file themselves; the actual
      // video lives at the same path with an .mp4 extension.
      const mp4Src = href.replace(IMGUR_GIFV_RE, '.mp4');
      const wrapper = document.createElement('div');
      wrapper.className = 'orr-inline-media';
      const video = document.createElement('video');
      video.src = mp4Src;
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.controls = true;
      wrapper.appendChild(video);
      a.insertAdjacentElement('afterend', wrapper);
    }
  });

  return container.innerHTML;
}
// Exposed so listing.js can reuse this for self-text expando previews.
ORR.render.embedMedia = embedMedia;

// Renders the post's usertext-body (the actual written text), independent
// of whether it's a pure self-post or a link/media post with an added
// caption. Previously gated on `d.is_self`, which silently dropped caption
// text on link posts that have both an image/video AND written text — a
// real feature Reddit supports (e.g. an OC image post with a story
// attached), confirmed against a real post-page HTML export.
function renderUsertextBody(d) {
  if (!d.selftext) return '';
  const ta = document.createElement('textarea');
  ta.innerHTML = d.selftext_html || '';
  return `<div class="usertext-body">${embedMedia(ta.value)}</div>`;
}

function renderPostHeader(d) {
  const { escapeHtml, timeAgo } = ORR;
  const likesNum = d.likes === true ? 1 : d.likes === false ? -1 : 0;

  // The post page needs the same image/gif/video/gallery/oEmbed preview the
  // listing already shows via its expando — this was missing entirely
  // before, so opening a media post's own thread showed no picture at all.
  // Unlike the listing (collapsed, built lazily on click), old.reddit shows
  // this expanded immediately on the permalink page, confirmed against a
  // real post-page HTML export, so it's built eagerly here — there's only
  // ever one hero post per page, so there's no lazy-loading concern.
  const expando = ORR.render.detectExpando ? ORR.render.detectExpando(d) : null;
  let expandoButtonHtml = '';
  let expandoInnerHtml = '';
  if (expando && expando.type === 'selftext') {
    // Pure self-post: the expando *is* the text, already handled below.
    expandoInnerHtml = renderUsertextBody(d);
  } else if (expando) {
    const mediaHtml = ORR.render.buildExpandoContent(expando.type, expando.data);
    // A link/media post can still carry its own written caption alongside
    // the preview (see comment above) — include it if present.
    expandoInnerHtml = mediaHtml + renderUsertextBody(d);
    expandoButtonHtml = `<div class="expando-button ${expando.type} expanded" data-fullname="${d.name}"></div>`;
  }

  return `
  <div class="thing id-${d.name} link" data-fullname="${d.name}">
    <div class="midcol">
      <div class="arrow up ${d.likes === true ? 'upmod' : ''}" data-fullname="${d.name}" data-dir="1"></div>
      <div class="score" data-score="${d.score}" data-likes="${likesNum}">${ORR.formatScore(d.score)}</div>
      <div class="arrow down ${d.likes === false ? 'downmod' : ''}" data-fullname="${d.name}" data-dir="-1"></div>
    </div>
    <div class="entry">
      <p class="title">
        <a class="title" href="${d.is_self ? d.permalink : d.url}">${escapeHtml(d.title)}</a>
        <span class="domain">(${escapeHtml(d.domain)})</span>
      </p>
      ${expandoButtonHtml}
      <p class="tagline">
        submitted ${timeAgo(d.created_utc)} by
        <a class="author" href="/user/${escapeHtml(d.author)}">${escapeHtml(d.author)}</a>
        to <a href="/r/${escapeHtml(d.subreddit)}">r/${escapeHtml(d.subreddit)}</a>
      </p>
      ${expando ? `<div class="expando expando-expanded" data-fullname="${d.name}">${expandoInnerHtml}</div>` : ''}
    </div>
  </div>`;
}

function renderComment(child) {
  if (child.kind === 'more') {
    const d = child.data;
    if (!d.count) return '';
    // Store children IDs as a plain JSON string inside a <template> so the
    // browser's HTML serializer doesn't touch it (no entity-encoding issues).
    // main.js reads it back via the data-children attribute on the .morecomments
    // element — because we use single-quotes around the attribute value and
    // the IDs themselves contain only alphanumeric chars + underscores, there
    // is no risk of HTML entity corruption here.
    return `<div class="morecomments" data-parent-id="${d.parent_id}" data-children='${JSON.stringify(d.children)}'>
      <a href="#">load more comments (${d.count})</a>
    </div>`;
  }
  const d = child.data;
  const { escapeHtml, timeAgo } = ORR;
  const ta = document.createElement('textarea');
  ta.innerHTML = d.body_html || '';
  const bodyHtml = embedMedia(ta.value);
  const likesNum = d.likes === true ? 1 : d.likes === false ? -1 : 0;

  // Stickied (moderator pinned) comment styling
  const stickiedClass = d.stickied ? ' stickied-comment' : '';

  // Comment flair
  const commentFlair = d.author_flair_css_class || d.author_flair_text
    ? `<span class="comment-flair" ${d.author_flair_background_color ? `style="background:${escapeHtml(d.author_flair_background_color)};${d.author_flair_text_color ? 'color:' + escapeHtml(d.author_flair_text_color) + ';' : ''}"` : ''}>${escapeHtml(d.author_flair_text || '')}</span>`
    : '';

  // Award count display
  const awardCount = (d.all_awardings && d.all_awardings.length) || (d.awards && d.awards.length)
    ? `<span class="comment-awards" title="awarded">${(d.all_awardings ? d.all_awardings.reduce((s, a) => s + (a.count || 1), 0) : d.awards ? d.awards.reduce((s, a) => s + (a.count || 1), 0) : 0)} awards</span>`
    : '';

  // Archived / locked
  const archivedClass = d.archived ? ' archived' : '';
  const lockedClass = d.locked ? ' locked' : '';

  const replies = d.replies && d.replies.data
    ? `<div class="child">${d.replies.data.children.map(renderComment).join('')}</div>`
    : '';

  return `
  <div class="thing comment id-${d.name}${stickiedClass}${archivedClass}${lockedClass}" data-fullname="${d.name}">
    <div class="midcol">
      <div class="arrow up ${d.likes === true ? 'upmod' : ''}" data-fullname="${d.name}" data-dir="1"></div>
      <div class="arrow down ${d.likes === false ? 'downmod' : ''}" data-fullname="${d.name}" data-dir="-1"></div>
    </div>
    <div class="entry">
      <p class="tagline">
        <a class="author" href="/user/${escapeHtml(d.author)}">${escapeHtml(d.author)}</a>
        ${commentFlair}
        <span class="score" data-score="${d.score}" data-likes="${likesNum}" data-suffix=" points">${ORR.formatScore(d.score)} points</span>
        ${awardCount}
        <time>${timeAgo(d.created_utc)}</time>
        <a href="#" class="collapse-toggle">[\u2013]</a>
      </p>
      <div class="usertext-body">${bodyHtml}</div>
      <ul class="flat-list buttons">
        <li><a href="#" class="comment-sort-link" data-sort="best">sort comments</a></li>
        <li><a href="#" class="reply-button" data-fullname="${d.name}">reply</a></li>
        <li><a href="#" class="share-button" data-permalink="${d.permalink}">share</a></li>
        <li><a href="#" class="save-button" data-fullname="${d.name}">save</a></li>
        <li><a href="#" class="report-button" data-fullname="${d.name}">report</a></li>
      </ul>
      ${replies}
    </div>
  </div>`;
}
// Exposed so main.js can render freshly-fetched "more comments" nodes with
// the exact same markup/behavior as the initial comment tree.
ORR.render.commentNode = renderComment;

// The morechildren API returns a FLAT list of {kind, data} things (comments
// and, for very deep threads, further "more" stubs), tied together only by
// parent_id. renderComment/commentNode expects the normal nested shape
// (d.replies.data.children), so this rebuilds that nested tree from the flat
// list before rendering — starting from rootParentId (the fullname of the
// comment/post the batch was requested under).
ORR.render.buildMoreChildrenTree = function buildMoreChildrenTree(things, rootParentId) {
  const byName = new Map();
  things.forEach((t) => {
    if (t.kind === 't1') byName.set(t.data.name, { kind: 't1', data: { ...t.data }, kids: [] });
  });

  things.forEach((t) => {
    const parentId = t.data.parent_id;
    if (t.kind === 't1') {
      const node = byName.get(t.data.name);
      const parent = byName.get(parentId);
      if (parent) parent.kids.push(node);
    } else if (t.kind === 'more') {
      const moreNode = { kind: 'more', data: t.data };
      const parent = byName.get(parentId);
      if (parent) parent.kids.push(moreNode);
      else if (parentId === rootParentId) byName.set(`__root_more_${t.data.id}`, moreNode);
    }
  });

  function finalize(node) {
    if (node.kind !== 't1') return node;
    const kids = node.kids.map(finalize);
    node.data.replies = kids.length ? { data: { children: kids } } : '';
    delete node.kids;
    return node;
  }

  const roots = [];
  things.forEach((t) => {
    if (t.data.parent_id === rootParentId) {
      if (t.kind === 't1') roots.push(finalize(byName.get(t.data.name)));
      else if (t.kind === 'more') roots.push({ kind: 'more', data: t.data });
    }
  });
  return roots;
};

// Comment sorting controls HTML
function renderCommentSortControls(currentSort) {
  const sorts = [
    { key: 'conf', label: 'Confident' },
    { key: 'top', label: 'Best' },
    { key: 'new', label: 'New' },
    { key: 'controversial', label: 'Controversial' },
    { key: 'old', label: 'Old' },
    { key: 'qa', label: 'Live' },
  ];
  const items = sorts.map((s) =>
    `<li class="${s.key === currentSort ? 'selected' : ''}"><a href="?sort=${s.key}">${s.label}</a></li>`
  ).join('');
  return `<ul class="comment-sort-menu">${items}</ul>`;
}

// Collapse all / expand all buttons
function renderCollapseControls() {
  return `
    <a href="#" class="orr-collapse-all" data-action="collapse-all">[-] Collapse all</a>
    <a href="#" class="orr-expand-all" data-action="expand-all">[+] Expand all</a>`;
}

ORR.render.postPage = function postPage(postListing, commentListing, headerHtml) {
  const post = postListing.data.children[0].data;
  const comments = commentListing.data.children.map(renderComment).join('');
  const query = ORR.parseQuery(location.search);
  const currentSort = query.sort || 'conf';

  return `
  ${headerHtml}
  <div class="content" role="main">
    <div class="sitetable linklisting">${renderPostHeader(post)}</div>
    <div class="commentarea" data-link-id="${post.name}">
      <div class="menuarea">
        <span class="comment-count">${commentListing.data.children.length} comments</span>
        ${renderCommentSortControls(currentSort)}
        <span class="collapse-controls">
          ${renderCollapseControls()}
        </span>
      </div>
      <div class="sitetable nestedlisting">${comments}</div>
    </div>
  </div>`;
};
