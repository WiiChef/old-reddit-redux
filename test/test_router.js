// test/test_router.js
// Tests for ORR router

// describe, test, assert, assertEqual, assertDeepEqual are provided globally by runner.js

describe('ORR.router.match', () => {
  test('matches frontpage', () => {
    const result = ORR.router.match('/');
    assertEqual(result.name, 'front');
  });

  test('matches front with sort', () => {
    const result = ORR.router.match('/top');
    assertEqual(result.name, 'front');
  });

  test('matches subreddit', () => {
    const result = ORR.router.match('/r/programming');
    assertEqual(result.name, 'subreddit');
    assertDeepEqual(result.params, ['programming']);
  });

  test('matches subreddit with sort', () => {
    const result = ORR.router.match('/r/programming/top');
    assertEqual(result.name, 'subreddit-sort');
    assertDeepEqual(result.params, ['programming', 'top']);
  });

  test('matches post', () => {
    const result = ORR.router.match('/r/programming/comments/abc123/hello-world');
    assertEqual(result.name, 'post');
    assertDeepEqual(result.params, ['programming', 'abc123']);
  });

  test('matches post without title', () => {
    const result = ORR.router.match('/r/programming/comments/abc123');
    assertEqual(result.name, 'post');
  });

  test('matches user', () => {
    const result = ORR.router.match('/user/testuser');
    assertEqual(result.name, 'user');
    assertDeepEqual(result.params, ['testuser']);
  });

  test('matches user-comments', () => {
    const result = ORR.router.match('/user/testuser/comments');
    assertEqual(result.name, 'user-comments');
  });

  test('matches user-submitted', () => {
    const result = ORR.router.match('/user/testuser/submitted');
    assertEqual(result.name, 'user-submitted');
  });

  test('matches domain', () => {
    const result = ORR.router.match('/domain/github.com');
    assertEqual(result.name, 'domain');
    assertDeepEqual(result.params, ['github.com']);
  });

  test('matches search', () => {
    const result = ORR.router.match('/search');
    assertEqual(result.name, 'search');
  });

  test('matches scoped search', () => {
    const result = ORR.router.match('/r/programming/search');
    assertEqual(result.name, 'search');
  });

  test('matches submit with subreddit', () => {
    const result = ORR.router.match('/r/programming/submit');
    assertEqual(result.name, 'submit');
    assertDeepEqual(result.params, ['programming']);
  });

  test('returns null for unknown paths', () => {
    const result = ORR.router.match('/nonexistent/path');
    assertEqual(result, null);
  });

  test('handles paths with trailing slash', () => {
    const result = ORR.router.match('/r/programming/');
    assertEqual(result.name, 'subreddit');
  });

  test('matches random', () => {
    const result = ORR.router.match('/random');
    assertEqual(result.name, 'random');
  });

  test('matches subreddit with hyphen', () => {
    const result = ORR.router.match('/r/old_school');
    assertEqual(result.name, 'subreddit');
    assertDeepEqual(result.params, ['old_school']);
  });
});
