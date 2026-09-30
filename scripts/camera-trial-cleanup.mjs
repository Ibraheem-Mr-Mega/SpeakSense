// Runs on a standard GitHub runner, independently of the assistant and the Mac.
import { setTimeout as sleep } from 'node:timers/promises';

const run = process.env.GITHUB_RUN_ID;
const token = process.env.DIGITALOCEAN_CLEANUP_TOKEN;
if (!/^\d{6,20}$/.test(run ?? '') || !token) throw new Error('Cleanup credentials or run identity missing');
const name = `ss-camera-${run}`;
const cleanupOnly = process.argv.includes('--now');
const started = Date.now();
const discoveryDeadline = started + 15 * 60_000;
const deletionDeadline = started + 35 * 60_000;
const retryDeadline = started + (cleanupOnly ? 8 : 55) * 60_000;
let foundId;

async function api(path, method = 'GET') {
  const response = await fetch(`https://api.digitalocean.com/v2${path}`, {
    method, headers: { Authorization: `Bearer ${token}` },
    redirect: 'error', signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`DigitalOcean request failed (${response.status})`);
  return response.status === 204 ? {} : response.json();
}

function verify(app) {
  const spec = app.spec;
  const service = spec?.services?.[0];
  const marker = [...(spec?.envs ?? []), ...(service?.envs ?? [])]
    .find(e => e.key === 'CAMERA_TRIAL_RUN')?.value;
  if (spec?.name !== name || marker !== run ||
      spec.services.length !== 1 || service.github?.repo !== 'Ibraheem-Mr-Mega/SpeakSense' ||
      ['databases', 'workers', 'jobs', 'static_sites', 'functions'].some(k => spec[k]?.length)) {
    throw new Error('Refusing deletion: app does not match the isolated camera trial');
  }
  if (!/^[0-9a-f-]{36}$/.test(app.id)) throw new Error('Invalid app identity');
  return app;
}

async function locate() {
  // Follow only numbered pages on the fixed provider endpoint, never response URLs.
  const matches = [];
  for (let page = 1; page <= 20; page++) {
    const result = await api(`/apps?per_page=100&page=${page}`);
    if (!result || !Array.isArray(result.apps)) throw new Error('Invalid app listing');
    matches.push(...result.apps.filter(a => a.spec?.name === name));
    if (result.apps.length < 100) break;
    if (page === 20) throw new Error('App listing exceeded cleanup limit');
  }
  if (matches.length > 1) throw new Error('Ambiguous trial identity');
  return matches.length ? verify(matches[0]) : null;
}

async function destroy() {
  const app = foundId ? (await api(`/apps/${foundId}`))?.app : await locate();
  if (!app) return true;
  verify(app);
  foundId = app.id;
  await api(`/apps/${foundId}`, 'DELETE');
  const remaining = await api(`/apps/${foundId}`);
  if (remaining) throw new Error('Deletion not yet confirmed');
  console.log(`DELETED ${name} (${foundId})`);
  return true;
}

if (!cleanupOnly) {
  if (await locate()) throw new Error('Trial name already exists; refusing a fresh lease');
  console.log(`CLEANUP ARMED: app=${name}; CAMERA_TRIAL_RUN=${run}; delete-by=${new Date(deletionDeadline).toISOString()}`);
  while (Date.now() < deletionDeadline) {
    try {
      const app = await locate();
      if (app && !foundId) { foundId = app.id; console.log(`Tracking trial ${name} (${foundId})`); }
      if (!app && foundId) { console.log('Trial already deleted'); process.exit(0); }
      if (!app && Date.now() >= discoveryDeadline) { console.log('No trial created within 15 minutes; lease closed'); process.exit(0); }
    } catch (error) {
      console.error(error.message); // Provider response bodies and tokens are never logged.
      break; // Start cleanup early on a monitoring failure.
    }
    await sleep(10_000);
  }
}

while (Date.now() < retryDeadline) {
  try { if (await destroy()) { console.log('Cleanup confirmed; no matching app remains'); process.exit(0); } }
  catch (error) { console.error(error.message); }
  await sleep(10_000);
}
throw new Error(`URGENT: cleanup could not be confirmed for ${name}; delete it in DigitalOcean Apps`);
