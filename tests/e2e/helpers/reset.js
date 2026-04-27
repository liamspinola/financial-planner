/**
 * resetDb — wipes all data via the test-only API endpoint.
 * Call this in beforeEach to give every test a clean slate.
 *
 * @param {import('@playwright/test').APIRequestContext} request
 */
export async function resetDb(request) {
  const res = await request.post('/api/__reset');
  if (!res.ok()) {
    throw new Error(`resetDb failed: ${res.status()} ${await res.text()}`);
  }
}
