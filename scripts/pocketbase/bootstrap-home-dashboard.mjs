import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import process from 'node:process';
import PocketBase from 'pocketbase';

const OWN_DASHBOARD = '@request.auth.id != "" && recipient = @request.auth.id';
const DASHBOARD_QUERY = `
  SELECT
    u.id AS id,
    u.id AS recipient,
    u.role AS role,
    (SELECT COUNT(*) FROM cell_reports cr LEFT JOIN cell_groups cg ON cg.id = cr.cellGroup LEFT JOIN sections s ON s.id = cg.section WHERE cr.reportStatus = 'pending_review' AND (u.role IN ('administrator', 'lead_pastor') OR (u.role = 'district_pastor' AND s.pastor = u.id))) AS pendingReviewCount,
    (SELECT COUNT(*) FROM cell_meetings cm JOIN cell_groups cg ON cg.id = cm.cellGroup LEFT JOIN cell_reports cr ON cr.meeting = cm.id WHERE u.role = 'cell_leader' AND cg.leader = u.id AND cm.status = 'completed' AND cr.id IS NULL) AS dueReportCount,
    (SELECT COUNT(*) FROM members m LEFT JOIN cell_groups cg ON cg.id = m.cellGroup LEFT JOIN sections s ON s.id = m.section WHERE m.status = 'active' AND m.deleted = 0 AND (u.role IN ('administrator', 'lead_pastor') OR (u.role = 'district_pastor' AND s.pastor = u.id) OR (u.role = 'cell_leader' AND cg.leader = u.id))) AS memberCount,
    (SELECT COUNT(*) FROM cell_groups cg LEFT JOIN sections s ON s.id = cg.section WHERE cg.status = 'active' AND (u.role IN ('administrator', 'lead_pastor') OR (u.role = 'district_pastor' AND s.pastor = u.id) OR (u.role = 'cell_leader' AND cg.leader = u.id))) AS activeCellCount,
    (SELECT COALESCE(SUM(cr.attendanceCount), 0) FROM cell_reports cr LEFT JOIN cell_groups cg ON cg.id = cr.cellGroup LEFT JOIN sections s ON s.id = cg.section WHERE cr.reportStatus != 'rejected' AND cr.submittedAt >= datetime('now', '-7 days') AND (u.role IN ('administrator', 'lead_pastor') OR (u.role = 'district_pastor' AND s.pastor = u.id) OR (u.role = 'cell_leader' AND cg.leader = u.id))) AS weeklyAttendance,
    (SELECT COUNT(*) FROM trainings t WHERE t.status IN ('upcoming', 'ongoing')) AS activeCourseCount,
    (SELECT COUNT(*) FROM training_enrollments te JOIN members m ON m.id = te.member WHERE m.user = u.id AND te.status IN ('enrolled', 'completed')) AS enrollmentCount,
    (SELECT COUNT(*) FROM training_attendance ta JOIN training_enrollments te ON te.member = ta.member JOIN members m ON m.id = te.member JOIN training_sessions ts ON ts.id = ta.session WHERE m.user = u.id AND te.status IN ('enrolled', 'completed') AND ts.training = te.training) AS academyAttendedSessions,
    (SELECT COALESCE(SUM(t.totalSessions), 0) FROM training_enrollments te JOIN members m ON m.id = te.member JOIN trainings t ON t.id = te.training WHERE m.user = u.id AND te.status IN ('enrolled', 'completed')) AS academyTotalSessions,
    COALESCE((SELECT t.title FROM training_enrollments te JOIN members m ON m.id = te.member JOIN trainings t ON t.id = te.training WHERE m.user = u.id AND te.status = 'enrolled' ORDER BY te.enrolledAt DESC LIMIT 1), '') AS currentCourseTitle
  FROM users u
  WHERE u.status = 'active'
`;

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
    const args = ['--silent', '--show-error', '--location', '--connect-timeout', '20', '--max-time', '90', '--retry', '3', '--retry-delay', '1', '--retry-all-errors', '--request', method, '--url', url, '--write-out', `\n${marker}%{http_code}`];
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

  let existing;
  try { existing = await superuser.collections.getOne('home_dashboard'); } catch (error) { if (error?.status !== 404) throw error; }
  const definition = { type: 'view', name: 'home_dashboard', viewQuery: DASHBOARD_QUERY, listRule: OWN_DASHBOARD, viewRule: OWN_DASHBOARD, createRule: null, updateRule: null, deleteRule: null };
  if (existing) await superuser.collections.update(existing.id, definition);
  else await superuser.collections.create(definition);
  console.log('✓ Account-scoped home dashboard reconciled');

  const users = [];
  try {
    const clients = {};
    for (const role of ['administrator', 'member']) {
      const userPassword = temporaryPassword();
      const userEmail = `home-${role}-${Date.now().toString(36)}@example.com`;
      const user = await superuser.collection('users').create({
        id: recordId(), email: userEmail, password: userPassword, passwordConfirm: userPassword,
        name: `Home ${role}`, role, status: 'active', verified: true
      });
      users.push(user.id);
      clients[role] = new PocketBase(url);
      clients[role].autoCancellation(false);
      await clients[role].collection('users').authWithPassword(userEmail, userPassword);
    }

    for (const role of ['administrator', 'member']) {
      const ownRows = await clients[role].collection('home_dashboard').getList(1, 10);
      if (ownRows.totalItems !== 1 || ownRows.items[0].recipient !== clients[role].authStore.record.id) throw new Error(`${role} did not receive exactly one own dashboard row.`);
      for (const field of ['pendingReviewCount', 'dueReportCount', 'memberCount', 'activeCellCount', 'weeklyAttendance', 'activeCourseCount', 'enrollmentCount', 'academyAttendedSessions', 'academyTotalSessions']) {
        if (!Number.isFinite(Number(ownRows.items[0][field]))) throw new Error(`${field} is not numeric.`);
      }
    }
    console.log('✓ Leadership and member accounts receive numeric, role-aware summaries');

    await clients.member.collection('announcements').getList(1, 20, {
      filter: 'tag = "Event" && status = "published" && publishAt <= @now && (expiresAt = "" || expiresAt > @now) && eventDate >= "2026-01-01"',
      sort: 'eventDate,eventTime,title'
    });
    console.log('✓ Member gathering query is accepted under announcement visibility rules');

    await expectRejected('Cross-account dashboard row is denied', () => clients.member.collection('home_dashboard').getOne(users[0]));
    await expectRejected('Dashboard projection rejects client writes', () => clients.administrator.collection('home_dashboard').create({ memberCount: 999 }));
    const anonymous = new PocketBase(url);
    if ((await anonymous.collection('home_dashboard').getList(1, 10)).totalItems !== 0) throw new Error('Anonymous dashboard listing exposed rows.');
    console.log('✓ Anonymous dashboard listing exposes no rows');
  } finally {
    for (const id of users.reverse()) { try { await superuser.collection('users').delete(id); } catch { /* Already removed. */ } }
    superuser.authStore.clear();
    console.log('✓ Disposable dashboard users removed and superuser token cleared');
  }

  console.log('\nHome dashboard schema and live rule tests passed.');
}

main().catch((error) => {
  console.error('\nBootstrap failed:', error?.response ?? error);
  process.exitCode = 1;
});
