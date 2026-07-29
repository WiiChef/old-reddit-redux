// Tests for user activity endpoint selection and sidebar navigation.

describe('ORR.api.fetchUserListing', () => {
  test('uses the requested user activity endpoint', () => {
    const original = ORR.api.fetchListing;
    let received;
    ORR.api.fetchListing = (path, params) => { received = { path, params }; };

    ORR.api.fetchUserListing('spez', 'comments', { sort: 'new' });

    ORR.api.fetchListing = original;
    assertDeepEqual(received, { path: '/user/spez/comments', params: { sort: 'new' } });
  });

  test('does not append an unrecognized activity endpoint', () => {
    const original = ORR.api.fetchListing;
    let received;
    ORR.api.fetchListing = (path, params) => { received = { path, params }; };

    ORR.api.fetchUserListing('spez', 'invalid', {});

    ORR.api.fetchListing = original;
    assertDeepEqual(received, { path: '/user/spez', params: {} });
  });
});

describe('ORR.render.userSidebar', () => {
  test('uses the route username when profile data is unavailable', () => {
    const html = ORR.render.userSidebar(null, 'example_user');

    assert(html.includes('href="/user/example_user/comments"'));
    assert(html.includes('>example_user</a>'));
  });
});
