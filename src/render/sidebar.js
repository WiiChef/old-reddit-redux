// src/render/sidebar.js
// old.reddit.com's defining second column: the .side/.titlebox subreddit
// info panel. This was entirely missing before — listings only rendered a
// single content column — which is the biggest structural gap versus the
// real layout. Only rendered for actual /r/<sub> pages; the front page,
// user profiles, and search results don't get one (same as upstream).
ORR.render = ORR.render || {};

function decodeEntities(html) {
  const ta = document.createElement('textarea');
  ta.innerHTML = html || '';
  return ta.value;
}

ORR.render.sidebar = function sidebar(about) {
  if (!about || !about.data) return '';
  const d = about.data;
  const { escapeHtml, formatScore } = ORR;

  const icon = (d.community_icon && d.community_icon.split('?')[0]) || d.icon_img || '';
  const description = decodeEntities(d.description_html || '');
  const subscribed = !!d.user_is_subscriber;
  const displayName = d.display_name_prefixed || `r/${d.display_name}`;

  return `
  <div class="side">
    <div class="titlebox">
      ${icon ? `<img class="sr-icon" src="${icon}" alt="" />` : ''}
      <h1 class="redditname"><a href="/r/${escapeHtml(d.display_name)}">${escapeHtml(displayName)}</a></h1>
      <p class="sr-tagline">${escapeHtml(d.public_description || '')}</p>
      <div class="titlebox-stats">
        <span class="subscribers"><span class="number">${formatScore(d.subscribers)}</span> <span class="word">members</span></span>
        ${d.accounts_active != null ? `<span class="users-online"><span class="number">${formatScore(d.accounts_active)}</span> <span class="word">online</span></span>` : ''}
      </div>
      <a class="sr-submit-link" href="/r/${escapeHtml(d.display_name)}/submit">submit a new link/text post</a>
      <button
        class="orr-subscribe-btn ${subscribed ? 'subscribed' : ''}"
        data-sr-fullname="${d.name}"
        data-subscribed="${subscribed}"
      >${subscribed ? 'leave' : 'join'}</button>
      ${description ? `<div class="usertext-body sidebar-description">${description}</div>` : ''}
    </div>
  </div>`;
};
