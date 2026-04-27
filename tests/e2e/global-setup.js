// global-setup.js — runs once before the entire test suite
// Performs a cold-start DB wipe so no residual data from previous runs bleeds in.

export default async function globalSetup() {
  const res = await fetch('http://localhost:3001/api/__reset', { method: 'POST' });
  if (!res.ok) {
    throw new Error(
      `DB reset failed (${res.status}). Is the server running with NODE_ENV=test?`
    );
  }
  console.log('[global-setup] Database wiped — clean slate for E2E suite.');
}
