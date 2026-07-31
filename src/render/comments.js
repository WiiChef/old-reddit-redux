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
  return `<div class="usertext-body may-blank-within md-container " itemprop="text">${embedMedia(ta.value)}</div>`;
}

// Build the ISO datetime string for <time> elements (matches old.reddit)
function isoDatetime(createdUtc) {
  if (!createdUtc) return '';
  const d = new Date(createdUtc * 1000);
  return d.toISOString().replace('.000Z', '+00:00');
}

// Build the title attribute for <time> (matches old.reddit format)
function timeTitle(createdUtc) {
  if (!createdUtc) return '';
  const d = new Date(createdUtc * 1000);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}:${String(d.getUTCSeconds()).padStart(2,'0')} ${d.getUTCFullYear()} UTC`;
}

// Build the three score spans (dislikes, unvoted, likes) — only one visible at a time
function scoreSpans(score, _likes) {
  const s = ORR.formatScore(score);
  const title = score;
  const dislikesScore = Math.max(0, score - 1);
  const likesScore = score + 1;
  return `<span class="score dislikes" title="${dislikesScore}">${ORR.formatScore(dislikesScore)} points</span><span class="score unvoted" title="${title}">${s} points</span><span class="score likes" title="${likesScore}">${ORR.formatScore(likesScore)} points</span>`;
}

// Build the hidden itemprop spans for schema.org markup (matches real old Reddit)
function hiddenSchemaSpans(score, permalink) {
  return `<span hidden="" itemprop="upvoteCount">${score}</span><span hidden="" itemprop="downvoteCount">0</span><a hidden="" itemprop="url" href="https://www.reddit.com${permalink}/">Answer Link</a>`;
}

// Build the usertext form wrapper (matches real old Reddit structure)
function usertextForm(fullname, bodyHtml) {
  // Generate a random form suffix (matches real old Reddit pattern like "h8x", "o7i", "wns")
  const formSuffix = Math.random().toString(36).substring(2, 5);
  return `<form action="#" class="usertext warn-on-unload" onsubmit="return post_form(this, 'editusertext')" id="form-${fullname}${formSuffix}"><input type="hidden" name="thing_id" value="${fullname}"><div class="usertext-body may-blank-within md-container " itemprop="text"><div class="md">${bodyHtml}</div></div></form>`;
}

// Build the buttons ul (matches real old Reddit structure)
function commentButtons(d, isRoot) {
  const { escapeHtml } = ORR;
  const permalink = d.permalink || '';
  const subreddit = d.subreddit || '';
  const title = d.title || '';
  const commentId = d.id || '';

  return `<ul class="flat-list buttons"><li class="first"><a href="https://old.reddit.com${permalink}" data-event-action="permalink" class="bylink" rel="nofollow">permalink</a></li><li><a href="javascript:void(0)" data-comment="${permalink}" data-media="www.redditmedia.com" data-link="/r/${escapeHtml(subreddit)}/comments/${(d.link_id || '').replace('t3_', '') || ''}/${commentId}/" data-root="${isRoot ? 'true' : 'false'}" data-title="${escapeHtml(title)}" class="embed-comment">embed</a></li><li class="comment-save-button save-button login-required"><a href="javascript:void(0)">save</a></li>${!isRoot ? `<li><a href="#${commentId}" data-event-action="parent" class="bylink" rel="nofollow">parent</a></li>` : ''}<li class="report-button login-required"><a href="javascript:void(0)" class="reportbtn access-required" data-event-action="report">report</a></li><li class="reply-button login-required"><a class="access-required" href="javascript:void(0)" data-event-action="comment" onclick="return reply(this)">reply</a></li></ul><div class="reportform report-${d.name}"></div>`;
}

// Build the midcol arrows (matches real old Reddit structure)
function midcolHtml(d) {
  return `<div class="midcol unvoted"><div class="arrow up login-required access-required" data-event-action="upvote" data-fullname="${d.name}" data-dir="1" role="button" aria-label="upvote" tabindex="0"></div><div class="arrow down login-required access-required" data-event-action="downvote" data-fullname="${d.name}" data-dir="-1" role="button" aria-label="downvote" tabindex="0"></div></div>`;
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

  const permalink = d.permalink || '';
  const subreddit = d.subreddit || '';
  const commentId = d.id || '';

  return `
  <div class=" thing id-${d.name} link " id="thing_${d.name}" onclick="click_thing(this)" data-fullname="${d.name}" data-type="link" data-gildings="0" data-subreddit="${escapeHtml(subreddit)}" data-subreddit-prefixed="r/${escapeHtml(subreddit)}" data-subreddit-fullname="${(d.subreddit_id || '').replace('t5_', 't5_')}" data-subreddit-type="public" data-author="${escapeHtml(d.author)}" data-author-fullname="${(d.author_fullname || '').replace('t2_', 't2_')}" data-replies="0" data-permalink="${permalink}">
    <p class="parent"><a name="${commentId}"></a></p>
    ${midcolHtml(d)}
    <div class="entry unvoted">
      <p class="tagline">
        <a href="https://old.reddit.com/user/${escapeHtml(d.author)}" class="author may-blank">${escapeHtml(d.author)}</a>
        <span class="userattrs"></span>
        ${hiddenSchemaSpans(d.score, permalink)}
        ${scoreSpans(d.score, likesNum)}
        <time title="${timeTitle(d.created_utc)}" datetime="${isoDatetime(d.created_utc)}" class="live-timestamp">${timeAgo(d.created_utc)}</time>
      </p>
      <p class="title">
        <a class="title" href="${d.is_self ? permalink : d.url}">${escapeHtml(d.title)}</a>
        <span class="domain">(${escapeHtml(d.domain || 'self.' + subreddit)})</span>
      </p>
      ${expandoButtonHtml}
      ${expando ? `<div class="expando expando-expanded" data-fullname="${d.name}">${expandoInnerHtml}</div>` : ''}
      ${commentButtons(d, true)}
    </div>
    <div class="clearleft"></div>
  </div>`;
}

function renderComment(child, isRoot = false) {
  if (child.kind === 'more') {
    const d = child.data;
    if (!d.count) return '';
    // Store children IDs as a plain JSON string inside a <template> so the
    // browser's HTML serializer doesn't touch it (no entity-encoding issues).
    // main.js reads it back via the data-children attribute on the .morecomments
    // element — because we use single-quotes around the attribute value and
    // the IDs themselves contain only alphanumeric chars + underscores, there
    // is no risk of HTML entity corruption here.
    const countLabel = d.count === 1 ? '1 reply' : `${d.count} replies`;
    return `<div class=" thing id-${d.name || 'more'} noncollapsed   morechildren " id="thing_${d.name || 'more'}" onclick="click_thing(this)" data-fullname="${d.name || 'more'}" data-type="morechildren" data-gildings="0"><p class="parent"></p><div class="entry unvoted"><p class="tagline"></p><span class="morecomments" data-parent-id="${d.parent_id}" data-children='${JSON.stringify(d.children || [])}'><a style="font-size: smaller; font-weight: bold" class="button" id="more_${d.name || 'more'}" href="javascript:void(0)" onclick="return morechildren(this, '${(d.parent_id || '').replace('t3_', '') || ''}', 'confidence', 'c1:${d.name || ''}', 'False')">load more comments<span class="gray">&nbsp;(${countLabel})</span></a></span><ul class="flat-list buttons"></ul><div class="reportform report-${d.name || 'more'}"></div></div><div class="child"></div><div class="clearleft"></div></div>`;
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

  // Children count for collapse toggle
  const childCount = d.replies && d.replies.data ? d.replies.data.children.length : 0;
  const childrenLabel = childCount === 1 ? '1 child' : `${childCount} children`;

  // Schema markup for comments (Answer type)
  const hasSchema = isRoot;

  const replies = d.replies && d.replies.data && d.replies.data.children.length
    ? `<div class="child"><div id="siteTable_${d.name}" class="sitetable listing">${d.replies.data.children.map((c) => renderComment(c, false)).join('')}</div></div>`
    : '';

  const subreddit = d.subreddit || '';

  return `
<div class=" thing id-${d.name} noncollapsed   comment ${stickiedClass}${archivedClass}${lockedClass}" id="thing_${d.name}" onclick="click_thing(this)" data-fullname="${d.name}" data-type="comment" data-gildings="0" data-subreddit="${escapeHtml(subreddit)}" data-subreddit-prefixed="r/${escapeHtml(subreddit)}" data-subreddit-fullname="${(d.subreddit_id || '').replace('t5_', 't5_')}" data-subreddit-type="public" data-author="${escapeHtml(d.author || '')}" data-author-fullname="${(d.author_fullname || '').replace('t2_', 't2_')}" data-replies="${childCount}" data-permalink="${d.permalink || ''}"${hasSchema ? ' itemprop="acceptedAnswer" itemscope="" itemtype="https://schema.org/Answer"' : ''}><p class="parent"><a name="${d.id || ''}"></a></p>${midcolHtml(d)}<div class="entry unvoted"><p class="tagline"><a href="javascript:void(0)" class="expand" onclick="return togglecomment(this)">[–]</a><a href="https://old.reddit.com/user/${escapeHtml(d.author || '')}" class="author may-blank id-t2_${(d.author_fullname || '').replace('t2_', '')}">${escapeHtml(d.author || '')}</a><span class="userattrs"></span>${commentFlair} ${hiddenSchemaSpans(d.score, d.permalink || '')}${scoreSpans(d.score, likesNum)} ${awardCount}<time title="${timeTitle(d.created_utc)}" datetime="${isoDatetime(d.created_utc)}" class="live-timestamp">${timeAgo(d.created_utc)}</time>&nbsp;${childCount > 0 ? `<a href="javascript:void(0)" class="numchildren" onclick="return togglecomment(this)">(${childrenLabel})</a>` : ''}</p>${usertextForm(d.name, bodyHtml)}${commentButtons(d, isRoot)}${replies}</div><div class="clearleft"></div></div>`;
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

ORR.render.postPage = function postPage(postListing, commentListing, headerHtml, sidebarHtml) {
  const post = postListing.data.children[0].data;
  const comments = commentListing.data.children.map((c) => renderComment(c, true)).join('');
  const query = ORR.parseQuery(location.search);
  const currentSort = query.sort || 'conf';

  return `
  ${headerHtml}
  <div class="content-wrapper">
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
    </div>
    ${sidebarHtml || ''}
  </div>`;
};
