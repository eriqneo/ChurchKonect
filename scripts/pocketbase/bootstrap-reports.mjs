import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import process from 'node:process';
import PocketBase from 'pocketbase';

const REPORT_READER = '@request.auth.id != "" && (@request.auth.role = "administrator" || @request.auth.role = "lead_pastor" || @request.auth.role = "district_pastor")';

function argument(name, fallback = '') {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function hiddenQuestion(prompt) {
  if (!process.stdin.isTTY) throw new Error('A TTY is required for the hidden password prompt.');
  return new Promise((resolve, reject) => {
    let value = '';
    const stdin = process.stdin;
    const cleanup = () => { stdin.off('data', onData); stdin.setRawMode(false); stdin.pause(); process.stdout.write('\n'); };
    const onData = (chunk) => {
      for (const character of String(chunk)) {
        if (character === '\r' || character === '\n') { cleanup(); resolve(value); return; }
        if (character === '\u0003') { cleanup(); reject(new Error('Cancelled.')); return; }
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else value += character;
      }
    };
    process.stdout.write(prompt);
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8'); stdin.on('data', onData);
  });
}

function temporaryPassword() { return `Cc!${randomBytes(18).toString('base64url')}`; }
function recordId() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(randomBytes(15), (value) => alphabet[value % alphabet.length]).join('');
}

function curlFetch(input, init = {}) {
  return new Promise((resolve, reject) => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const method = init.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET');
    const headers = new Headers(init.headers || (typeof input === 'object' && 'headers' in input ? input.headers : undefined));
    const body = init.body;
    const marker = `__CHURCHCONNECT_STATUS_${randomBytes(8).toString('hex')}__`;
    const args = [
      '--silent', '--show-error', '--location', '--connect-timeout', '20', '--max-time', '90',
      '--retry', '3', '--retry-delay', '1', '--retry-all-errors',
      '--request', method, '--url', url, '--write-out', `\n${marker}%{http_code}`
    ];
    for (const [name, value] of headers.entries()) args.push('--header', `${name}: ${value}`);
    if (body !== undefined && body !== null) args.push('--data-binary', '@-');
    const child = spawn('curl', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = []; const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.stdin.on('error', () => undefined);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) { reject(new TypeError(Buffer.concat(stderr).toString('utf8').trim() || `curl exited with ${code}`)); return; }
      const result = Buffer.concat(stdout).toString('utf8');
      const markerIndex = result.lastIndexOf(`\n${marker}`);
      if (markerIndex < 0) { reject(new TypeError('curl response status marker was missing.')); return; }
      const responseBody = result.slice(0, markerIndex);
      const status = Number(result.slice(markerIndex + marker.length + 1));
      resolve(new Response(status === 204 || status === 205 ? null : responseBody, { status, headers: { 'content-type': 'application/json' } }));
    });
    if (body === undefined || body === null) child.stdin.end();
    else if (typeof body === 'string' || body instanceof Uint8Array) child.stdin.end(body);
    else child.stdin.end(String(body));
  });
}

async function reconcileView(pb, name, viewQuery) {
  const definition = {
    type: 'view', name, viewQuery,
    listRule: REPORT_READER, viewRule: REPORT_READER,
    createRule: null, updateRule: null, deleteRule: null
  };
  let existing;
  try { existing = await pb.collections.getOne(name); } catch (error) { if (error?.status !== 404) throw error; }
  const saved = existing
    ? await pb.collections.update(existing.id, definition)
    : await pb.collections.create(definition);
  console.log(`✓ ${name} server aggregate reconciled`);
  return saved;
}

async function expectRejected(label, operation) {
  try { await operation(); } catch { console.log(`✓ ${label}`); return; }
  throw new Error(`${label}: expected rejection.`);
}

async function main() {
  const url = argument('url', 'https://churchconnect.pockethost.io').replace(/\/$/, '');
  const email = argument('email');
  if (!email) throw new Error('Pass --email=YOUR_SUPERUSER_EMAIL.');
  const password = await hiddenQuestion('PocketBase superuser password: ');
  if (argument('transport') === 'curl') globalThis.fetch = curlFetch;

  const superuser = new PocketBase(url);
  superuser.autoCancellation(false);
  await superuser.collection('_superusers').authWithPassword(email, password);
  console.log('✓ Superuser authentication');

  await reconcileView(superuser, 'report_overview', `
    SELECT
      'overview0000000' AS id,
      (SELECT COUNT(*) FROM members WHERE status = 'active' AND deleted = 0) AS totalMembers,
      (SELECT COUNT(*) FROM cell_groups WHERE status = 'active') AS activeCells,
      (SELECT COUNT(*) FROM prayer_requests) AS totalPrayers,
      (SELECT COUNT(*) FROM prayer_requests pr WHERE pr.status IN ('submitted', 'assigned') AND NOT EXISTS (SELECT 1 FROM prayer_outcomes po WHERE po.request = pr.id)) AS activePrayers,
      (SELECT COUNT(*) FROM prayer_outcomes) AS answeredPrayers,
      (SELECT COUNT(DISTINCT intercessor) FROM prayer_assignments WHERE status = 'active') AS activeIntercessors,
      (SELECT COUNT(*) FROM training_certificates WHERE status = 'verified') AS verifiedCertificates,
      (SELECT COUNT(*) FROM announcements WHERE status = 'published' AND publishAt <= datetime('now') AND (expiresAt = '' OR expiresAt IS NULL OR expiresAt > datetime('now'))) AS activeAnnouncements
  `);

  await reconcileView(superuser, 'report_cell_summary', `
    SELECT
      cg.id AS id,
      cg.name AS name,
      COALESCE(NULLIF(u.name, ''), 'Not assigned') AS leader,
      (SELECT COUNT(*) FROM members m WHERE m.cellGroup = cg.id AND m.status = 'active' AND m.deleted = 0) AS membersCount
    FROM cell_groups cg
    LEFT JOIN users u ON u.id = cg.leader
    WHERE cg.status = 'active'
  `);

  await reconcileView(superuser, 'report_cell_daily', `
    SELECT
      lower(substr(cg.id, 1, 7) || replace(substr(cm.meetingDate, 1, 10), '-', '')) AS id,
      cg.id AS cellGroup,
      substr(cm.meetingDate, 1, 10) AS metricDate,
      COUNT(DISTINCT cm.id) AS meetingsCount,
      COUNT(DISTINCT cr.id) AS reportsCount,
      COUNT(DISTINCT ca.id) AS attendanceCount,
      COUNT(DISTINCT CASE WHEN ca.status = 'present' THEN ca.id END) AS presentCount
    FROM cell_groups cg
    JOIN cell_meetings cm ON cm.cellGroup = cg.id
    LEFT JOIN cell_attendance ca ON ca.meeting = cm.id
    LEFT JOIN cell_reports cr ON cr.meeting = cm.id
    WHERE cg.status = 'active'
    GROUP BY cg.id, substr(cm.meetingDate, 1, 10)
  `);

  await reconcileView(superuser, 'report_training_summary', `
    SELECT
      t.id AS id,
      t.title AS name,
      t.status AS status,
      (SELECT COUNT(*) FROM training_enrollments e WHERE e.training = t.id AND e.status != 'withdrawn') AS enrolledCount,
      (SELECT COUNT(*) FROM training_enrollments e WHERE e.training = t.id AND e.status = 'completed') AS completedCount,
      (SELECT COUNT(*) FROM training_certificates c WHERE c.training = t.id AND c.status = 'verified') AS certificateCount
    FROM trainings t
    WHERE t.status != 'draft'
  `);

  await reconcileView(superuser, 'report_prayer_daily', `
    SELECT
      lower(substr(hex(pr.category), 1, 7) || replace(substr(pr.submittedAt, 1, 10), '-', '')) AS id,
      substr(pr.submittedAt, 1, 10) AS metricDate,
      pr.category AS category,
      COUNT(DISTINCT pr.id) AS requestCount,
      COUNT(DISTINCT CASE WHEN po.id IS NULL AND pr.status IN ('submitted', 'assigned') THEN pr.id END) AS activeCount,
      COUNT(DISTINCT po.id) AS answeredCount,
      COALESCE(AVG(CASE WHEN po.id IS NOT NULL THEN julianday(po.reportedAt) - julianday(pr.submittedAt) END), 0) AS averageResponseDays
    FROM prayer_requests pr
    LEFT JOIN prayer_outcomes po ON po.request = pr.id
    WHERE pr.submittedAt != '' AND pr.submittedAt IS NOT NULL
    GROUP BY substr(pr.submittedAt, 1, 10), pr.category
  `);

  await reconcileView(superuser, 'report_announcement_summary', `
    SELECT
      lower(substr(hex(tag), 1, 15)) AS id,
      tag AS tag,
      COUNT(*) AS totalCount,
      SUM(CASE WHEN status = 'published' AND publishAt <= datetime('now') AND (expiresAt = '' OR expiresAt IS NULL OR expiresAt > datetime('now')) THEN 1 ELSE 0 END) AS activeCount,
      SUM(CASE WHEN status = 'published' AND publishAt > datetime('now') THEN 1 ELSE 0 END) AS scheduledCount,
      SUM(CASE WHEN status = 'archived' OR (expiresAt != '' AND expiresAt IS NOT NULL AND expiresAt <= datetime('now')) THEN 1 ELSE 0 END) AS archivedCount
    FROM announcements
    GROUP BY tag
  `);

  const suffix = Date.now().toString(36);
  const roles = ['administrator', 'district_pastor', 'member'];
  const users = [];
  try {
    const clients = {};
    for (const role of roles) {
      const password = temporaryPassword();
      const email = `reports-${role}-${suffix}@example.com`;
      const user = await superuser.collection('users').create({
        id: recordId(), email, password, passwordConfirm: password,
        name: `Reports ${role}`, role, status: 'active', verified: true
      });
      users.push(user.id);
      clients[role] = new PocketBase(url);
      clients[role].autoCancellation(false);
      await clients[role].collection('users').authWithPassword(email, password);
    }

    const adminOverview = await clients.administrator.collection('report_overview').getList(1, 1);
    if (adminOverview.totalItems !== 1) throw new Error('Administrator could not read the report overview.');
    for (const collection of ['report_cell_summary', 'report_training_summary', 'report_announcement_summary']) {
      await clients.administrator.collection(collection).getList(1, 10);
    }
    for (const collection of ['report_cell_daily', 'report_prayer_daily']) {
      await clients.administrator.collection(collection).getList(1, 10, { filter: 'metricDate >= "2026-01-01"' });
    }
    console.log('✓ Administrator can read and date-filter every server aggregate');

    const districtOverview = await clients.district_pastor.collection('report_overview').getList(1, 1);
    if (districtOverview.totalItems !== 1) throw new Error('District Pastor could not read the report overview.');
    console.log('✓ District Pastor has read-only aggregate access');

    const anonymous = new PocketBase(url);
    const anonymousOverview = await anonymous.collection('report_overview').getList(1, 1);
    if (anonymousOverview.totalItems !== 0) throw new Error('Anonymous analytics listing exposed data.');
    console.log('✓ Anonymous analytics listing exposes no records');

    const memberOverview = await clients.member.collection('report_overview').getList(1, 1);
    if (memberOverview.totalItems !== 0) throw new Error('Regular member analytics listing exposed data.');
    console.log('✓ Regular member analytics listing exposes no records');

    await expectRejected('Aggregate views reject client writes', () => clients.administrator.collection('report_overview').create({ totalMembers: 999 }));
  } finally {
    for (const userId of users.reverse()) {
      try { await superuser.collection('users').delete(userId); } catch { /* already removed */ }
    }
    superuser.authStore.clear();
    console.log('✓ Disposable analytics users removed and superuser token cleared');
  }

  console.log('\nReports and Analytics schema and live rule tests passed.');
}

main().catch((error) => {
  console.error('\nBootstrap failed:', error?.response ?? error);
  process.exitCode = 1;
});
