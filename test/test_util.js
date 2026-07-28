// test/test_util.js
// Tests for ORR utility functions

// describe, test, assert, assertEqual, assertDeepEqual are provided globally by runner.js

describe('ORR.escapeHtml', () => {
  test('escapes ampersands', () => {
    assertEqual(ORR.escapeHtml('a & b'), 'a &amp; b');
  });

  test('escapes less-than and greater-than', () => {
    assertEqual(ORR.escapeHtml('<div>'), '&lt;div&gt;');
  });

  test('escapes double quotes', () => {
    assertEqual(ORR.escapeHtml('say "hello"'), 'say &quot;hello&quot;');
  });

  test('escapes single quotes', () => {
    assertEqual(ORR.escapeHtml("it's"), 'it&#39;s');
  });

  test('handles empty string', () => {
    assertEqual(ORR.escapeHtml(''), '');
  });

  test('handles null (returns empty)', () => {
    assertEqual(ORR.escapeHtml(null), '');
  });

  test('handles numbers', () => {
    assertEqual(ORR.escapeHtml(42), '42');
  });

  test('does not double-escape', () => {
    assertEqual(ORR.escapeHtml('&amp;'), '&amp;amp;');
  });
});

describe('ORR.formatScore', () => {
  test('formats small numbers as-is', () => {
    assertEqual(ORR.formatScore(42), '42');
  });

  test('formats zero', () => {
    assertEqual(ORR.formatScore(0), '0');
  });

  test('formats 9999 without k suffix', () => {
    assertEqual(ORR.formatScore(9999), '9999');
  });

  test('formats 10000 as 10.0k', () => {
    assertEqual(ORR.formatScore(10000), '10.0k');
  });

  test('formats 12345 as 12.3k', () => {
    assertEqual(ORR.formatScore(12345), '12.3k');
  });

  test('formats null as bullet', () => {
    assertEqual(ORR.formatScore(null), '\u2022');
  });

  test('formats undefined as bullet', () => {
    assertEqual(ORR.formatScore(undefined), '\u2022');
  });
});

describe('ORR.debounce', () => {
  test('returns a function', () => {
    const fn = ORR.debounce(() => {}, 100);
    assert(typeof fn === 'function', 'debounce should return a function');
  });
});

describe('ORR.parseQuery', () => {
  test('parses simple query string', () => {
    assertDeepEqual(ORR.parseQuery('q=test&sort=hot'), { q: 'test', sort: 'hot' });
  });

  test('handles empty query', () => {
    assertDeepEqual(ORR.parseQuery(''), {});
  });

  test('handles multiple values (takes last)', () => {
    const result = ORR.parseQuery('a=1&a=2');
    assertEqual(result.a, '2');
  });

  test('handles null', () => {
    assertDeepEqual(ORR.parseQuery(null), {});
  });
});

describe('ORR.timeAgo', () => {
  test('formats recent time as "just now"', () => {
    const now = Math.floor(Date.now() / 1000);
    assertEqual(ORR.timeAgo(now), 'just now');
  });

  test('formats minutes', () => {
    const fiveMinAgo = Math.floor(Date.now() / 1000) - 300;
    assertEqual(ORR.timeAgo(fiveMinAgo), '5 minutes ago');
  });

  test('formats hours', () => {
    const threeHoursAgo = Math.floor(Date.now() / 1000) - 3 * 3600;
    assertEqual(ORR.timeAgo(threeHoursAgo), '3 hours ago');
  });

  test('formats days', () => {
    const twoDaysAgo = Math.floor(Date.now() / 1000) - 2 * 86400;
    assertEqual(ORR.timeAgo(twoDaysAgo), '2 days ago');
  });

  test('formats months', () => {
    const threeMonthsAgo = Math.floor(Date.now() / 1000) - 3 * 2592000;
    assertEqual(ORR.timeAgo(threeMonthsAgo), '3 months ago');
  });

  test('formats years', () => {
    const twoYearsAgo = Math.floor(Date.now() / 1000) - 2 * 31536000;
    assertEqual(ORR.timeAgo(twoYearsAgo), '2 years ago');
  });

  test('singular minute', () => {
    const oneMinAgo = Math.floor(Date.now() / 1000) - 60;
    assertEqual(ORR.timeAgo(oneMinAgo), '1 minute ago');
  });
});
