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

// Render subreddit rules list
function renderRules(rules) {
  if (!rules || !rules.length) return '';
  const items = rules.map((r, i) => {
    const shortDesc = r.short_description || r.description || '';
    const ta = document.createElement('textarea');
    ta.innerHTML = shortDesc;
    const desc = ta.value.replace(/\n/g, ' ').trim();
    return `<li class="rule-item">
      <span class="rule-number">${i + 1}.</span>
      <div class="rule-content">
        <span class="rule-name">${r.short_name || r.name || 'Rule ' + (i + 1)}</span>
        ${desc ? `<span class="rule-short-desc">${desc}</span>` : ''}
      </div>
    </li>`;
  }).join('');
  return `<div class="rules-section">
    <h3>Rules</h3>
    <ul class="rules-list">${items}</ul>
  </div>`;
}

// Render moderator list
function renderModerators(mods) {
  if (!mods || !mods.length) return '';
  const items = mods.map((m) =>
    `<li><a href="/user/${m.name}" class="mod-link">${m.name}</a></li>`
  ).join('');
  return `<div class="mods-section">
    <h3>Moderators (${mods.length})</h3>
    <ul class="mods-list">${items}</ul>
  </div>`;
}

// Render flair list/legend from subreddit's link_flair_types
function renderFlairLegend(flairTypes) {
  if (!flairTypes || !flairTypes.length) return '';
  const items = flairTypes.slice(0, 15).map((f) => {
    const bg = f.background_color || '';
    const fg = f.text_color === 'dark' ? '#000000' : f.text_color === 'light' ? '#d7dadc' : '';
    const style = bg ? `background:${bg};${fg ? 'color:' + fg + ';' : ''}` : '';
    return `<li class="flair-legend-item">
      <span class="flair-legend-preview" ${style ? `style="${style}"` : ''}>${f.text || ''}</span>
      ${f.description ? `<span class="flair-legend-desc">${f.description}</span>` : ''}
    </li>`;
  }).join('');
  return `<div class="flair-legend-section">
    <h3>Post Flairs</h3>
    <ul class="flair-legend-list">${items}</ul>
  </div>`;
}

// Render sidebar footer links (Flair, Report, etc.)
function renderSidebarFooter(subName) {
  return `<div class="sidebar-footer">
    <a href="/r/${subName}/about/flair" class="sidebar-footer-link">flair</a>
    <a href="/r/${subName}/report" class="sidebar-footer-link">report</a>
  </div>`;
}

// Render about community section
function renderAbout(about) {
  if (!about || !about.data) return '';
  const d = about.data;
  const createdDate = d.created_utc
    ? new Date(d.created_utc * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  return `<div class="about-community">
    <h3>About Community</h3>
    ${createdDate ? `<p class="community-created">Created ${createdDate}</p>` : ''}
    ${d.public_description ? `<p class="community-desc">${d.public_description}</p>` : ''}
  </div>`;
}

ORR.render.sidebar = function sidebar(about, rules, moderators, flairTypes) {
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
    ${renderRules(rules)}
    ${renderModerators(moderators)}
    ${renderFlairLegend(flairTypes)}
    ${renderAbout(about)}
    <div class="sidebar-nav">
      <a href="/r/${escapeHtml(d.display_name)}/about">About</a>
      <a href="/r/${escapeHtml(d.display_name)}/wiki">Wiki</a>
      <a href="/r/${escapeHtml(d.display_name)}/search">Search</a>
      <a href="/r/${escapeHtml(d.display_name)}/random">Random post</a>
    </div>
    ${renderSidebarFooter(d.display_name)}
  </div>`;
};
