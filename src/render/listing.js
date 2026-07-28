// src/render/listing.js
ORR.render = ORR.render || {};

function voteArrows(d) {
  const likes = d.likes; // true = upvoted, false = downvoted, null = no vote
  const likesNum = likes === true ? 1 : likes === false ? -1 : 0;
  return `
    <div class="midcol unvoted">
      <div class="arrow up ${likes === true ? 'upmod' : ''}" data-fullname="${d.name}" data-dir="1" title="upvote"></div>
      <div class="score" data-score="${d.score}" data-likes="${likesNum}" title="${d.score}">${ORR.formatScore(d.score)}</div>
      <div class="arrow down ${likes === false ? 'downmod' : ''}" data-fullname="${d.name}" data-dir="-1" title="downvote"></div>
    </div>`;
}

// ---- Expando (pop-out media) ----
// Old reddit's listing rows have a small arrow next to the title that pops
// open an inline preview — image, gif, reddit-hosted video, gallery, or
// (already-expanded by default) self-text — without leaving the listing.
// We detect the type from the post JSON and store just enough data on the
// button to build that preview lazily, on first click, rather than
// pre-rendering every row's media up front (which would mean every gif/video
// in a long infinite-scroll listing tries to load at once).
function detectExpando(d) {
  if (d.is_self) {
    return d.selftext ? { type: 'selftext', defaultExpanded: true } : null;
  }
  if (d.is_video && d.media && d.media.reddit_video) {
    const rv = d.media.reddit_video;
    return {
      type: 'video',
      defaultExpanded: false,
      data: { fallbackUrl: rv.fallback_url, isGif: !!rv.is_gif, width: rv.width, height: rv.height },
    };
  }
  if (d.is_gallery && d.gallery_data && d.media_metadata) {
    const items = d.gallery_data.items
      .map((item) => {
        const meta = d.media_metadata[item.media_id];
        const src = meta && meta.s && (meta.s.u || meta.s.gif);
        return src ? { url: src } : null;
      })
      .filter(Boolean);
    return items.length ? { type: 'gallery', defaultExpanded: false, data: { items, permalink: d.permalink } } : null;
  }
  // Reddit's API caches oEmbed responses (YouTube, Vimeo, Twitter/X,
  // SoundCloud, etc.) server-side under secure_media/media — this is what
  // old.reddit itself renders for these expandos, rather than making a
  // fresh oEmbed call to each provider from the browser.
  const oembed = (d.secure_media && d.secure_media.oembed) || (d.media && d.media.oembed);
  if (oembed) {
    return {
      type: 'oembed',
      defaultExpanded: false,
      data: {
        html: oembed.html || null,
        thumbnailUrl: oembed.thumbnail_url || null,
        providerName: oembed.provider_name || d.domain,
        width: oembed.width || 600,
        height: oembed.height || 338,
        permalink: d.url,
      },
    };
  }
  if (d.preview && d.preview.images && d.preview.images[0]) {
    const img = d.preview.images[0];
    const gifVariant = img.variants && (img.variants.mp4 || img.variants.gif);
    if (gifVariant && gifVariant.source) {
      return {
        type: 'gif',
        defaultExpanded: false,
        data: {
          mp4Url: img.variants.mp4 ? img.variants.mp4.source.url : null,
          fallbackUrl: img.source.url,
          width: img.source.width,
          height: img.source.height,
        },
      };
    }
    // Pick a resolution near 640px wide to avoid loading full-res originals.
    const candidates = (img.resolutions || []).concat([img.source]);
    const best = candidates.reduce((acc, r) => {
      if (!r) return acc;
      if (!acc) return r;
      return Math.abs(r.width - 640) < Math.abs(acc.width - 640) ? r : acc;
    }, null);
    if (best) {
      return {
        type: 'image',
        defaultExpanded: false,
        data: { url: best.url, width: best.width, height: best.height, permalink: d.permalink },
      };
    }
  }
  return null;
}

// Exposed so comments.js can reuse the same detection on the post page
// itself (which needs the media preview too, expanded by default — see
// renderPostHeader in comments.js).
ORR.render.detectExpando = detectExpando;

function expandoButtonHtml(expando, fullname) {
  if (!expando) return '';
  const stateClass = expando.defaultExpanded ? 'expanded' : 'collapsed';
  const dataAttr = expando.data
    ? `data-expando='${ORR.escapeHtml(JSON.stringify(expando.data))}'`
    : '';
  return `<div class="expando-button ${expando.type} ${stateClass}" data-fullname="${fullname}" data-expando-type="${expando.type}" ${dataAttr}></div>`;
}

function expandoContainerHtml(expando, d) {
  if (!expando) return '';
  if (expando.type === 'selftext') {
    // Cheap (text-only) so it's fine to render eagerly, matching old
    // reddit's default-expanded behavior for self posts in listings.
    const ta = document.createElement('textarea');
    ta.innerHTML = d.selftext_html || '';
    const bodyHtml = ORR.render.embedMedia ? ORR.render.embedMedia(ta.value) : ta.value;
    return `<div class="expando expando-expanded" data-fullname="${d.name}">
      <div class="usertext-body">${bodyHtml}</div>
    </div>`;
  }
  // Media types are populated lazily on first click (see main.js) — starts
  // empty so nothing loads/plays until the person actually opens it.
  return `<div class="expando expando-collapsed" data-fullname="${d.name}" data-populated="false" style="display:none"></div>`;
}

// Builds the inner HTML for a media expando once the person clicks it open.
// Exposed so main.js's click handler can call it lazily.
ORR.render.buildExpandoContent = function buildExpandoContent(type, data) {
  const { escapeHtml } = ORR;
  if (type === 'image') {
    return `<div class="media-preview" style="max-width:${data.width}px">
      <div class="media-preview-content">
        <a href="${data.permalink}" class="may-blank post-link">
          <img class="preview" src="${data.url}" width="${data.width}" height="${data.height}">
        </a>
      </div>
    </div>`;
  }
  if (type === 'gif') {
    const media = data.mp4Url
      ? `<video class="preview" autoplay muted loop playsinline style="width:${data.width}px;height:${data.height}px">
           <source src="${data.mp4Url}" type="video/mp4">
         </video>`
      : `<img class="preview" src="${data.fallbackUrl}" width="${data.width}" height="${data.height}">`;
    return `<div class="media-preview" style="max-width:${data.width}px">
      <div class="media-preview-content">${media}</div>
    </div>`;
  }
  if (type === 'video') {
    return `<div class="media-preview no-constraints-when-pinned" style="max-width:${data.width}px">
      <div class="media-preview-content video-player">
        <video class="preview" controls autoplay ${data.isGif ? 'muted loop' : ''} playsinline
          style="max-width:100%;max-height:512px" src="${data.fallbackUrl}"></video>
      </div>
    </div>`;
  }
  if (type === 'gallery') {
    const tiles = data.items
      .slice(0, 6)
      .map(
        (item) =>
          `<a class="gallery-tile" href="${data.permalink}"><img class="preview" src="${item.url}"></a>`
      )
      .join('');
    const more = data.items.length > 6 ? `<div class="gallery-more">+${data.items.length - 6} more</div>` : '';
    return `<div class="media-preview gallery"><div class="gallery-tiles">${tiles}${more}</div></div>`;
  }
  if (type === 'oembed') {
    // Most providers (YouTube, Vimeo, SoundCloud) hand back a plain
    // <iframe ... src="...">; pull just the src out and build our own
    // iframe with an explicit sandbox rather than injecting the provider's
    // raw HTML wholesale.
    const srcMatch = data.html && data.html.match(/src="([^"]+)"/);
    if (srcMatch) {
      const src = srcMatch[1];
      return `<div class="media-preview oembed-preview" style="max-width:${data.width}px">
        <div class="media-preview-content video-player">
          <iframe
            src="${src}"
            width="${data.width}"
            height="${data.height}"
            frameborder="0"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowfullscreen
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          ></iframe>
        </div>
      </div>`;
    }
    // "Rich" embeds (e.g. Twitter/X) ship a <blockquote> + widgets script
    // rather than a bare iframe; scripts injected via innerHTML don't
    // execute, so the interactive widget wouldn't run anyway. Fall back to
    // a simple thumbnail/link card that opens the original instead.
    const thumb = data.thumbnailUrl
      ? `<img class="preview" src="${data.thumbnailUrl}" style="max-width:${data.width}px">`
      : '';
    return `<div class="media-preview oembed-fallback">
      <a href="${data.permalink}" class="may-blank post-link" target="_blank" rel="noopener noreferrer">
        ${thumb}
        <div class="oembed-fallback-caption">${escapeHtml(data.providerName)} \u2014 view original</div>
      </a>
    </div>`;
  }
  return '<span class="error">couldn\'t load preview</span>';
};

function renderPostRow(child, rank) {
  const d = child.data;
  const { escapeHtml, timeAgo } = ORR;
  const thumb = d.thumbnail && d.thumbnail.startsWith('http')
    ? `<a class="thumbnail" href="${d.permalink}"><img src="${d.thumbnail}" /></a>`
    : `<a class="thumbnail self" href="${d.permalink}"></a>`;

  const flair = d.link_flair_text
    ? `<span class="linkflairlabel" ${d.link_flair_background_color ? `style="background:${escapeHtml(d.link_flair_background_color)};${d.link_flair_text_color ? 'color:' + escapeHtml(d.link_flair_text_color) + ';' : ''}"` : ''}>${escapeHtml(d.link_flair_text)}</span>` : '';

  // User flair on the author name
  const userFlair = d.author_flair_css_class || d.author_flair_text
    ? `<span class="userflairlabel" ${d.author_flair_background_color ? `style="background:${escapeHtml(d.author_flair_background_color)};${d.author_flair_text_color ? 'color:' + escapeHtml(d.author_flair_text_color) + ';' : ''}"` : ''}>${escapeHtml(d.author_flair_text || '')}</span>` : '';

  // NSFW badge
  const nsfwBadge = d.over_18 ? '<span class="nsfw-badge">NSFW</span>' : '';

  // Crosspost indicator
  const crosspostBadge = (d.is_crosspostable || (d.crosspost_parent_list && d.crosspost_parent_list.length))
    ? `<span class="crosspost-badge">r/${escapeHtml(d.crosspost_parent_list && d.crosspost_parent_list[0] ? d.crosspost_parent_list[0].subreddit : d.subreddit)}</span>`
    : '';

  // Archived / Locked indicators
  const statusClasses = [];
  if (d.archived) statusClasses.push('archived');
  if (d.locked) statusClasses.push('locked');
  const statusHtml = statusClasses.map((c) => `<span class="post-status ${c}">${c}</span>`).join('');

  // Award rendering (from all_awardings or awards field)
  let awardsHtml = '';
  if (d.all_awardings && d.all_awardings.length) {
    awardsHtml = d.all_awardings.map((a) => {
      const count = a.count || 1;
      const name = a.name || 'award';
      return `<span class="award" title="${escapeHtml(name)} (${count})" style="background:${a.icon_color || '#333'};${a.icon_color === 'gold' ? 'background:#b8860b;' : ''}"></span>`;
    }).join('');
  } else if (d.awards && d.awards.length) {
    awardsHtml = d.awards.map((a) =>
      `<span class="award" title="${escapeHtml(a.name)} (${a.count})"></span>`
    ).join('');
  }

  const expando = detectExpando(d);

  return `
  <div class="thing id-${d.name} ${d.stickied ? 'stickied' : ''} ${statusClasses.join(' ')}" data-fullname="${d.name}" data-permalink="${d.permalink}">
    <span class="rank">${rank}</span>
    ${voteArrows(d)}
    ${thumb}
    <div class="entry unvoted">
      <p class="title">
        <a class="title" href="${d.is_self ? d.permalink : d.url}">${escapeHtml(d.title)}</a>
        ${flair}
        ${nsfwBadge}
        ${crosspostBadge}
        ${statusHtml}
        <span class="domain">(<a href="/domain/${escapeHtml(d.domain)}">${escapeHtml(d.domain)}</a>)</span>
      </p>
      ${expandoButtonHtml(expando, d.name)}
      <p class="tagline">
        submitted ${timeAgo(d.created_utc)} by
        <a class="author" href="/user/${escapeHtml(d.author)}">${escapeHtml(d.author)}</a>
        ${userFlair}
        ${awardsHtml}
        to <a href="/r/${escapeHtml(d.subreddit)}">r/${escapeHtml(d.subreddit)}</a>
      </p>
      <ul class="flat-list buttons">
        <li class="first"><a href="${d.permalink}">${d.num_comments} comments</a></li>
        <li><a class="save-button" data-fullname="${d.name}" href="#">save</a></li>
        <li><a class="hide-button" data-fullname="${d.name}" href="#">hide</a></li>
        <li><a href="${d.permalink}">share</a></li>
        <li><a href="${d.permalink}">permalink</a></li>
      </ul>
      ${expandoContainerHtml(expando, d)}
    </div>
  </div>`;
}

// Exposed so main.js can append freshly-fetched pages (infinite scroll)
// without re-rendering the whole listing — rank continues from startRank.
ORR.render.postRows = function postRows(children, startRank) {
  return children.map((c, i) => renderPostRow(c, startRank + i)).join('');
};

ORR.render.listing = function listing(listingResponse, { headerHtml, sidebarHtml }) {
  const children = listingResponse.data.children;
  const rows = ORR.render.postRows(children, 1);
  const nextAfter = listingResponse.data.after;

  return `
  ${headerHtml}
  <div class="content-wrapper">
    <div class="content" role="main">
      <div class="sitetable linklisting">
        ${rows || '<div class="empty">No posts found.</div>'}
      </div>
      <div id="orr-infinite-sentinel" class="orr-infinite-sentinel"></div>
      <div class="nav-buttons">
        ${nextAfter ? `<a class="nextprev" data-after="${nextAfter}" href="?after=${nextAfter}">next &rsaquo;</a>` : ''}
      </div>
    </div>
    ${sidebarHtml || ''}
  </div>`;
};

ORR.render.skeleton = function skeleton() {
  return `<div id="orr-loading">
    <div class="orr-spinner"></div>
    <p>loading old reddit\u2026</p>
  </div>`;
};

// ---- User sidebar (profile/about page) ----
ORR.render.userSidebar = function userSidebar(profile) {
  const { escapeHtml, formatScore } = ORR;
  const d = profile && profile.data;

  const username = d && d.name;
  const avatar = d && d.icon_img;
  const created = d && d.created_utc
    ? new Date(d.created_utc * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  const totalKarma = d && (d.link_karma || 0) + (d.comment_karma || 0);
  const cakeDay = d && d.cake_day;

  return `
  <div class="side">
    <div class="titlebox">
      ${avatar ? `<img class="sr-icon" src="${avatar}" alt="" />` : ''}
      <h1 class="redditname"><a href="/user/${escapeHtml(username || 'u')}">${escapeHtml(username || 'user')}</a></h1>
      <p class="sr-tagline">${escapeHtml(d && d.public_description || '')}</p>
      <div class="titlebox-stats">
        <span class="total-karma"><span class="number">${formatScore(totalKarma)}</span> <span class="word">karma</span></span>
        ${d && d.link_karma ? `<span class="link-karma"><span class="number">${formatScore(d.link_karma)}</span> <span class="word">posts</span></span>` : ''}
        ${d && d.comment_karma ? `<span class="comment-karma"><span class="number">${formatScore(d.comment_karma)}</span> <span class="word">comments</span></span>` : ''}
      </div>
      ${created ? `<p class="user-created">Created ${created}</p>` : ''}
      ${cakeDay ? `<p class="user-cake"><span class="cake-icon">\uD83C\uDF82</span> Cake day: ${cakeDay}</p>` : ''}
      <ul class="user-nav">
        <li><a href="/user/${escapeHtml(username || '')}">overview</a></li>
        <li><a href="/user/${escapeHtml(username || '')}/submitted">submitted</a></li>
        <li><a href="/user/${escapeHtml(username || '')}/comments">comments</a></li>
        <li><a href="/user/${escapeHtml(username || '')}/upvoted">upvoted</a></li>
        <li><a href="/user/${escapeHtml(username || '')}/downvoted">downvoted</a></li>
        <li><a href="/user/${escapeHtml(username || '')}/saved">saved</a></li>
        <li><a href="/user/${escapeHtml(username || '')}/about">about</a></li>
      </ul>
    </div>
  </div>`;
};

// ---- Post submission page ----
ORR.render.submitPage = function submitPage(subreddit, headerHtml) {
  return `
  ${headerHtml}
  <div class="content-wrapper">
    <div class="content" role="main">
      <div class="submit-page">
        <h1>Create a post${subreddit ? ` in r/${subreddit}` : ''}</h1>
        <div class="submit-tabs">
          <button class="submit-tab active" data-type="link">Link</button>
          <button class="submit-tab" data-type="self">Text</button>
          <button class="submit-tab" data-type="image">Image &amp; Video</button>
        </div>
        <form class="submit-form" id="orr-submit-form">
          <input type="hidden" name="sr" value="${subreddit || ''}" />
          <input type="hidden" name="type" value="link" id="submit-type" />
          <div class="submit-field">
            <label for="submit-title">Title</label>
            <input type="text" id="submit-title" name="title" maxlength="300" placeholder="Title" required />
            <span class="title-count" id="title-count">0 / 300</span>
          </div>
          <div class="submit-field submit-url-field">
            <label for="submit-url">URL</label>
            <input type="url" id="submit-url" name="url" placeholder="https://" />
          </div>
          <div class="submit-field submit-text-field" style="display:none">
            <label for="submit-text">Body</label>
            <textarea id="submit-text" name="text" rows="8" placeholder="Text post body (Markdown supported)"></textarea>
          </div>
          <div class="submit-field submit-file-field" style="display:none">
            <label for="submit-file">Image or Video</label>
            <input type="file" id="submit-file" name="file" accept="image/*,video/*" />
          </div>
          <div class="submit-options">
            <label class="toggle-label">
              <input type="checkbox" id="submit-nsfw" name="nsfw" />
              <span>NSFW</span>
            </label>
            <label class="toggle-label">
              <input type="checkbox" id="submit-spoiler" name="spoiler" />
              <span>Spoiler</span>
            </label>
          </div>
          <div class="submit-field submit-flair-field" style="display:none">
            <label for="submit-flair">Post Flair</label>
            <select id="submit-flair" name="flair">
              <option value="">(none)</option>
            </select>
          </div>
          <div class="submit-actions">
            <button type="submit" class="submit-post-btn">Post</button>
          </div>
        </form>
      </div>
    </div>
  </div>`;
};
