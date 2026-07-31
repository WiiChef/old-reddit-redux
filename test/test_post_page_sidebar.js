// test/test_post_page_sidebar.js
// Verify that ORR.render.postPage includes a sidebar when sidebarHtml is passed,
// and that the content-wrapper structure matches old.reddit.com layout.

const fs = require('fs');
const path = require('path');

// ---- Load source modules ----
function loadModule(filePath) {
  try {
    delete require.cache[require.resolve(filePath)];
    require(filePath);
  } catch (e) {
    // Some modules need browser APIs — that's OK
  }
}

// Load all dependencies in order
loadModule('../src/util.js');
loadModule('../src/router.js');
loadModule('../src/api/fetch.js');
loadModule('../src/render/header.js');
loadModule('../src/render/sidebar.js');
loadModule('../src/render/listing.js');
loadModule('../src/render/comments.js');

describe('Post page sidebar rendering', () => {
  test('postPage accepts sidebarHtml parameter', () => {
    const html = ORR.render.postPage(
      { data: { children: [{ data: { id3: 'abc123', title: 'Test post', author: 'testuser', subreddit: 'test', permalink: '/r/test/comments/abc123/test_post/', num_comments: 5, score: 100, ups: 100, downs: 0, url: 'https://example.com', domain: 'example.com', created_utc: 1700000000 } }] } },
      { data: { children: [] } },
      '<div id="header">Header</div>',
      '<div class="side">Sidebar content</div>'
    );
    assert(typeof html === 'string', 'postPage should return a string');
    assert(html.includes('class="side"'), 'postPage output should include sidebar');
    assert(html.includes('Sidebar content'), 'postPage output should include sidebar content');
  });

  test('postPage wraps content in content-wrapper', () => {
    const html = ORR.render.postPage(
      { data: { children: [{ data: { id3: 'abc123', title: 'Test post', author: 'testuser', subreddit: 'test', permalink: '/r/test/comments/abc123/test_post/', num_comments: 5, score: 100, ups: 100, downs: 0, url: 'https://example.com', domain: 'example.com', created_utc: 1700000000 } }] } },
      { data: { children: [] } },
      '<div id="header">Header</div>',
      '<div class="side">Sidebar</div>'
    );
    assert(html.includes('class="content-wrapper"'), 'postPage should wrap in content-wrapper');
    assert(html.includes('class="content"'), 'postPage should include content div');
  });

  test('postPage renders without sidebar when none provided', () => {
    const html = ORR.render.postPage(
      { data: { children: [{ data: { id3: 'abc123', title: 'Test post', author: 'testuser', subreddit: 'test', permalink: '/r/test/comments/abc123/test_post/', num_comments: 5, score: 100, ups: 100, downs: 0, url: 'https://example.com', domain: 'example.com', created_utc: 1700000000 } }] } },
      { data: { children: [] } },
      '<div id="header">Header</div>',
      ''
    );
    assert(!html.includes('class="side"'), 'postPage should not include sidebar when empty');
    assert(html.includes('class="content-wrapper"'), 'postPage should still use content-wrapper');
    assert(html.includes('class="content"'), 'postPage should still include content div');
  });

  test('postPage renders without sidebar when undefined', () => {
    const html = ORR.render.postPage(
      { data: { children: [{ data: { id3: 'abc123', title: 'Test post', author: 'testuser', subreddit: 'test', permalink: '/r/test/comments/abc123/test_post/', num_comments: 5, score: 100, ups: 100, downs: 0, url: 'https://example.com', domain: 'example.com', created_utc: 1700000000 } }] } },
      { data: { children: [] } },
      '<div id="header">Header</div>',
      undefined
    );
    assert(!html.includes('class="side"'), 'postPage should not include sidebar when undefined');
  });

  test('postPage includes comment count', () => {
    const html = ORR.render.postPage(
      { data: { children: [{ data: { id3: 'abc123', title: 'Test post', author: 'testuser', subreddit: 'test', permalink: '/r/test/comments/abc123/test_post/', num_comments: 42, score: 100, ups: 100, downs: 0, url: 'https://example.com', domain: 'example.com', created_utc: 1700000000 } }] } },
      { data: { children: [
        { data: { body_html: '', author: 'u1', created_utc: 1700000000, link_id: 't3_abc123', id: 'c1', depth: 0 } },
        { data: { body_html: '', author: 'u2', created_utc: 1700000000, link_id: 't3_abc123', id: 'c2', depth: 0 } },
        { data: { body_html: '', author: 'u3', created_utc: 1700000000, link_id: 't3_abc123', id: 'c3', depth: 0 } },
      ] } },
      '<div id="header">Header</div>',
      '<div class="side">Sidebar</div>'
    );
    assert(html.includes('3 comments'), 'postPage should show comment count');
  });

  test('postPage includes post title', () => {
    const html = ORR.render.postPage(
      { data: { children: [{ data: { id3: 'abc123', title: 'My Awesome Post Title', author: 'testuser', subreddit: 'test', permalink: '/r/test/comments/abc123/test_post/', num_comments: 5, score: 100, ups: 100, downs: 0, url: 'https://example.com', domain: 'example.com', created_utc: 1700000000 } }] } },
      { data: { children: [] } },
      '<div id="header">Header</div>',
      '<div class="side">Sidebar</div>'
    );
    assert(html.includes('My Awesome Post Title'), 'postPage should include post title');
  });

  test('sidebar renders with subreddit info', () => {
    const about = { data: { display_name: 'programming', name: 't5_123', public_description: 'Computer Programming', subscribers: 5000000, accounts_active: 12345, user_is_subscriber: false } };
    const html = ORR.render.sidebar(about, [], [], []);
    assert(html.includes('r/programming'), 'sidebar should include subreddit name');
    assert(html.includes('Computer Programming'), 'sidebar should include description');
    assert(html.includes('members'), 'sidebar should include member count');
    assert(html.includes('online'), 'sidebar should include online count');
    assert(html.includes('join'), 'sidebar should include join button');
  });

  test('sidebar renders with rules', () => {
    const about = { data: { display_name: 'test', name: 't5_123', public_description: 'Test', subscribers: 100, user_is_subscriber: false } };
    const rules = [{ short_name: 'Be nice', short_description: 'Be kind to others' }];
    const html = ORR.render.sidebar(about, rules, [], []);
    assert(html.includes('Rules'), 'sidebar should include rules section');
    assert(html.includes('Be nice'), 'sidebar should include rule name');
  });

  test('sidebar renders with moderators', () => {
    const about = { data: { display_name: 'test', name: 't5_123', public_description: 'Test', subscribers: 100, user_is_subscriber: false } };
    const mods = [{ name: 'mod1' }, { name: 'mod2' }];
    const html = ORR.render.sidebar(about, [], mods, []);
    assert(html.includes('Moderators'), 'sidebar should include moderators section');
    assert(html.includes('mod1'), 'sidebar should include mod names');
  });

  test('sidebar returns empty string when about is null', () => {
    const html = ORR.render.sidebar(null, [], [], []);
    assert(html === '', 'sidebar should return empty string when about is null');
  });

  test('layout structure matches old.reddit.com pattern', () => {
    // old.reddit.com uses: content-wrapper > content + side
    const html = ORR.render.postPage(
      { data: { children: [{ data: { id3: 'abc123', title: 'Test', author: 'testuser', subreddit: 'test', permalink: '/r/test/comments/abc123/test/', num_comments: 0, score: 10, ups: 10, downs: 0, url: 'https://example.com', domain: 'example.com', created_utc: 1700000000 } }] } },
      { data: { children: [] } },
      '<div id="header">H</div>',
      '<div class="side">S</div>'
    );

    // Verify content-wrapper wraps both content and side
    assert(html.includes('class="content-wrapper"'), 'Must have content-wrapper');
    assert(html.includes('class="content" role="main"'), 'Must have content with role=main');
    assert(html.includes('class="side"'), 'Must have side');

    // Verify content-wrapper comes before side (flex order)
    const wrapperIdx = html.indexOf('class="content-wrapper"');
    const contentIdx = html.indexOf('class="content"');
    const sideIdx = html.includes('class="side"') ? html.indexOf('class="side"') : -1;

    if (sideIdx >= 0) {
      assert(wrapperIdx < contentIdx, 'content-wrapper must wrap content');
      assert(contentIdx < sideIdx, 'content must come before side in flex order');
    }
  });
});
