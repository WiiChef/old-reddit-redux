// src/render/header.js
ORR.render = ORR.render || {};

const TIME_FILTERS = [
  { key: 'hour',  label: 'hour' },
  { key: 'day',   label: 'day' },
  { key: 'week',  label: 'week' },
  { key: 'month', label: 'month' },
  { key: 'year',  label: 'year' },
  { key: 'all',   label: 'all' },
];

function timeFilterHtml(currentSort, currentT) {
  // Only show time filters for sorts that support them (top, controversial, best)
  if (!['top', 'controversial', 'best'].includes(currentSort)) return '';
  const items = TIME_FILTERS.map((tf) => {
    const cls = tf.key === currentT ? ' selected' : '';
    return `<li class="tabmenu${cls}"><a href="?t=${tf.key}">${tf.label}</a></li>`;
  }).join('');
  return `<div class="tabmenu-container"><ul class="tabmenu">${items}</ul></div>`;
}

function breadcrumbsHtml(currentSub) {
  if (!currentSub) return '';
  return `<div class="crumb-links">
    <a href="/">home</a> &gt;
    <a href="/r/${ORR.escapeHtml(currentSub)}">r/${ORR.escapeHtml(currentSub)}</a>
  </div>`;
}

ORR.render.header = function header(identity, currentSub, currentSort) {
  const { escapeHtml } = ORR;
  const loggedIn = identity && identity.data && !identity.data.is_suspended && identity.data.name;
  const userName = loggedIn ? identity.data.name : '';
  const userIcon = loggedIn && identity.data.icon_img
    ? identity.data.icon_img
    : '';
  const hasMail = loggedIn && identity.data.has_mail;
  const modCount = loggedIn && identity.data.modname ? identity.data.modname.length : 0;

  const userHtml = loggedIn
    ? `<span class="user online">
         <span id="header-account-button" class="header-switch-or-create-dropdown">
           <span class="user klink">
             ${userIcon ? `<img src="${userIcon}" alt="" />` : ''}
             <span class="header-switch-account">${escapeHtml(userName)}</span>
           </span>
           <span class="dropdown dropdown-active">▾</span>
           <ul class="drop-down-menu">
             <li class="user-username"><span class="user klink">${escapeHtml(userName)}</span></li>
             <li class="user-karma"><span class="header-karma-link">
               ${ORR.formatScore((identity.data.link_karma || 0) + (identity.data.comment_karma || 0))} karma
             </span></li>
             <li class="separator"></li>
             <li class="user-profile"><a href="/user/${escapeHtml(userName)}">view profile</a></li>
             <li class="user-history"><a href="/user/${escapeHtml(userName)}/comments">history</a></li>
             <li class="user-preferences"><a href="/prefs">preferences</a></li>
             ${modCount ? '<li class="user-modmail"><a href="/message/moderator">mod mail</a></li>' : ''}
             <li class="separator"></li>
             <li class="user-flair"><a href="/user/${escapeHtml(userName)}/flair">flair</a></li>
             <li class="user-coins"><a href="/gold">coins</a></li>
             <li class="user-redditgifts"><a href="/gifts">gifts</a></li>
             <li class="separator"></li>
             <li class="user-log-out"><a href="/logout">log out</a></li>
           </ul>
         </span>
         <span class="header-mail-and-options-dropdown">
           <a class="header-mail" href="/message">
             <span class="mail count">${hasMail ? '1' : '0'}</span>
           </a>
           <span class="dropdown dropdown-active">▾</span>
           <ul class="drop-down-menu">
             <li class="user-inbox"><a href="/message">inbox</a></li>
             <li class="user-sent"><a href="/message/sent">sent</a></li>
           </ul>
         </span>
       </span>`
    : `<span class="user loggedout">
         <a href="/login">log in</a>
         <span class="separator">/</span>
         <a href="/register">sign up</a>
       </span>`;

  const subHeading = currentSub ? `/r/${escapeHtml(currentSub)}` : '';
  const sort = currentSort || 'hot';
  const base = currentSub ? `/r/${escapeHtml(currentSub)}` : '';

  // Build tab links — hot/new/top/rising/controversial/best
  const allSorts = ['hot', 'new', 'rising', 'top', 'controversial', 'best'];
  const tab = (name, label) =>
    `<li class="tabmenu ${sort === name ? 'selected' : ''}">
      <a href="${name === 'hot' ? base : `${base}/${name}`}">${label}</a>
    </li>`;

  const tabsHtml = allSorts.map((s) => tab(s, s)).join('');

  // Search form — scoped to current sub if applicable
  const searchAction = currentSub ? `/r/${escapeHtml(currentSub)}/search` : '/search';
  const searchHidden = currentSub ? '<input type="hidden" name="restrict_sr" value="on" />' : '';

  return `
  <div id="header" role="banner">
    <div id="sr-header-area">
      <div class="width-clip">
        <div class="dropdown srdrop">
          <span class="selected title">MY SUBREDDITS</span>
          <span class="dropdown-arrow">▾</span>
          <ul class="drop-down-menu sr-dropdown">
            <li class="heading">Popular Subreddits</li>
            <li><a href="/">home</a></li>
            <li><a href="/r/popular">popular</a></li>
            <li><a href="/r/all">all</a></li>
            <li><a href="/r/random">random</a></li>
            <li class="separator"></li>
            <li><a href="/r/AskReddit">r/AskReddit</a></li>
            <li><a href="/r/funny">r/funny</a></li>
            <li><a href="/r/pics">r/pics</a></li>
            <li><a href="/r/gaming">r/gaming</a></li>
            <li><a href="/r/news">r/news</a></li>
            <li><a href="/r/worldnews">r/worldnews</a></li>
            <li><a href="/r/todayilearned">r/todayilearned</a></li>
            <li><a href="/r/aww">r/aww</a></li>
            <li><a href="/r/movies">r/movies</a></li>
            <li><a href="/r/technology">r/technology</a></li>
            <li><a href="/r/science">r/science</a></li>
          </ul>
        </div>
        <ul class="flat-list sr-bar hover">
          <li><a href="/" class="choice ${!currentSub ? 'selected' : ''}">POPULAR</a></li>
          <li><span class="separator">-</span><a href="/r/all" class="choice">ALL</a></li>
          <li><span class="separator">-</span><a href="/r/random" class="choice">RANDOM</a></li>
          <li><span class="separator">-</span><span class="selected title">MY SUBREDDITS</span></li>
          <li><span class="separator">-</span><a href="/r/AskReddit" class="choice">ASKREDDIT</a></li>
          <li><span class="separator">-</span><a href="/r/funny" class="choice">FUNNY</a></li>
          <li><span class="separator">-</span><a href="/r/pics" class="choice">PICS</a></li>
          <li><span class="separator">-</span><a href="/r/gaming" class="choice">GAMING</a></li>
          <li><span class="separator">-</span><a href="/r/news" class="choice">NEWS</a></li>
          <li><span class="separator">-</span><a href="/r/worldnews" class="choice">WORLDNEWS</a></li>
          <li><span class="separator">-</span><a href="/r/todayilearned" class="choice">TODAYILEARNED</a></li>
          <li><span class="separator">-</span><a href="/r/aww" class="choice">AWW</a></li>
          <li><span class="separator">-</span><a href="/r/movies" class="choice">MOVIES</a></li>
          <li><span class="separator">-</span><a href="/r/technology" class="choice">TECHNOLOGY</a></li>
          <li><span class="separator">-</span><a href="/r/science" class="choice">SCIENCE</a></li>
          <li><span class="separator">-</span><a href="/subreddits" class="choice">MORE »</a></li>
        </ul>
      </div>
    </div>
    <div id="header-bottom-left">
      <a id="header-img" href="/" title="reddit: the front page of the internet"></a>
      ${currentSub ? `<span class="pagename redditname"><a href="/r/${escapeHtml(currentSub)}">${subHeading}</a></span>` : ''}
    </div>
    <div id="header-bottom-right">
      <div id="user-panel">${userHtml}</div>
      <form id="search" action="${searchAction}" method="get">
        <input type="text" name="q" placeholder="search reddit" autocomplete="off" />
        ${searchHidden}
        <button type="submit">search</button>
      </form>
      ${loggedIn ? `
      <div class="create-buttons">
        <a href="${currentSub ? `/r/${escapeHtml(currentSub)}/submit` : '/submit'}" class="create-post-btn">create post</a>
        <a href="/community" class="create-community-btn">create community</a>
      </div>` : ''}
    </div>
    <div class="tabmenu-container">
      <ul class="tabmenu">
        ${tabsHtml}
      </ul>
    </div>
    ${timeFilterHtml(sort, new URLSearchParams(location.search || '').get('t') || 'week')}
    ${breadcrumbsHtml(currentSub)}
    ${searchFiltersHtml()}
  </div>`;
};

function searchFiltersHtml() {
  // Only show search filters on search pages
  if (!location.pathname.includes('/search')) return '';
  const params = new URLSearchParams(location.search || '');
  const sort = params.get('sort') || 'relevance';
  const time = params.get('t') || 'all';

  const sortOptions = [
    { key: 'relevance', label: 'relevance' },
    { key: 'hot', label: 'hot' },
    { key: 'top', label: 'top' },
    { key: 'new', label: 'new' },
    { key: 'comments', label: 'comments' },
  ];

  const timeOptions = [
    { key: 'all', label: 'all time' },
    { key: 'hour', label: 'past hour' },
    { key: 'day', label: 'past day' },
    { key: 'week', label: 'past week' },
    { key: 'month', label: 'past month' },
    { key: 'year', label: 'past year' },
  ];

  const sortSelect = sortOptions.map((o) =>
    `<option value="${o.key}" ${o.key === sort ? 'selected' : ''}>${o.label}</option>`
  ).join('');

  const timeSelect = timeOptions.map((o) =>
    `<option value="${o.key}" ${o.key === time ? 'selected' : ''}>${o.label}</option>`
  ).join('');

  return `
  <div class="search-filters">
    <div class="search-filter-group">
      <label>Sort by:</label>
      <select id="search-sort">
        ${sortSelect}
      </select>
    </div>
    <div class="search-filter-group">
      <label>From:</label>
      <select id="search-time">
        ${timeSelect}
      </select>
    </div>
  </div>`;
}
