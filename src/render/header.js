// src/render/header.js
ORR.render = ORR.render || {};

ORR.render.header = function header(identity, currentSub, currentSort) {
  const { escapeHtml } = ORR;
  const loggedIn = identity && identity.data && !identity.data.is_suspended && identity.data.name;
  const userHtml = loggedIn
    ? `<span class="user online">
         <a href="/user/${escapeHtml(identity.data.name)}">${escapeHtml(identity.data.name)}</a>
         <span class="karma">(${ORR.formatScore(identity.data.link_karma + identity.data.comment_karma)})</span>
       </span>`
    : `<span class="user loggedout"><a href="/login">log in</a> / <a href="/register">sign up</a></span>`;

  const subHeading = currentSub ? `/r/${escapeHtml(currentSub)}` : '';
  // Tab links stay scoped to the current subreddit (e.g. /r/pics/new, not a
  // sitewide /new that would silently drop you out of the subreddit), and
  // the tab matching currentSort is marked selected rather than always
  // defaulting to "hot" regardless of which sort is actually active.
  const sort = currentSort || 'hot';
  const base = currentSub ? `/r/${escapeHtml(currentSub)}` : '';
  const tab = (name, label) =>
    `<li class="${sort === name ? 'selected' : ''}"><a href="${base}${name === 'hot' ? '/' : `/${name}`}">${label}</a></li>`;

  return `
  <div id="header">
    <div id="header-bottom-left">
      <a id="header-img" href="/"></a>
      <ul id="sr-header-area">
        <li class="current-sr">${subHeading}</li>
      </ul>
    </div>
    <div id="header-bottom-right">
      <div id="user-panel">${userHtml}</div>
      <form id="search" action="${currentSub ? `/r/${escapeHtml(currentSub)}/search` : '/search'}" method="get">
        <input type="text" name="q" placeholder="search" autocomplete="off" />
        ${currentSub ? '<input type="hidden" name="restrict_sr" value="on" />' : ''}
        <button type="submit">search</button>
      </form>
    </div>
    <div class="tabmenu-container">
      <ul class="tabmenu">
        ${tab('hot', 'hot')}
        ${tab('new', 'new')}
        ${tab('top', 'top')}
        ${tab('rising', 'rising')}
      </ul>
    </div>
  </div>`;
};
