import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import process from 'node:process';
import PocketBase from 'pocketbase';

const AUTHENTICATED = '@request.auth.id != ""';
const OWN_RECEIPT = 'recipient = @request.auth.id';
const FEED_QUERY = `
  SELECT
    lower(substr(a.id, 1, 7) || substr(u.id, 1, 7) || 'a') AS id,
    u.id AS recipient,
    'announcement' AS type,
    'New announcement' AS title,
    a.title AS message,
    'announcements' AS actionUrl,
    a.publishAt AS eventAt
  FROM announcements a
  JOIN users u ON u.status = 'active'
  WHERE a.status IN ('published', 'archived') AND a.publishAt <= datetime('now')

  UNION ALL

  SELECT
    lower(substr(pa.id, 1, 7) || substr(pa.intercessor, 1, 7) || 'p') AS id,
    pa.intercessor AS recipient,
    'prayer' AS type,
    'Intercession assigned' AS title,
    printf('A %s prayer request has been assigned to you.', lower(pa.requestCategory)) AS message,
    'prayers' AS actionUrl,
    pa.assignedAt AS eventAt
  FROM prayer_assignments pa

  UNION ALL

  SELECT
    lower(substr(po.id, 1, 7) || substr(pr.submitter, 1, 7) || 'o') AS id,
    pr.submitter AS recipient,
    'prayer' AS type,
    'Prayer outcome recorded' AS title,
    'An answered outcome has been recorded for your prayer request.' AS message,
    'prayers' AS actionUrl,
    po.reportedAt AS eventAt
  FROM prayer_outcomes po
  JOIN prayer_requests pr ON pr.id = po.request

  UNION ALL

  SELECT
    lower(substr(cr.id, 1, 7) || substr(u.id, 1, 7) || 's') AS id,
    u.id AS recipient,
    'report' AS type,
    'Cell report submitted' AS title,
    printf('%s submitted a fellowship report with %d present.', cg.name, cr.attendanceCount) AS message,
    'cells' AS actionUrl,
    cr.submittedAt AS eventAt
  FROM cell_reports cr
  JOIN cell_groups cg ON cg.id = cr.cellGroup
  JOIN users u ON u.status = 'active' AND u.role IN ('administrator', 'lead_pastor', 'district_pastor')

  UNION ALL

  SELECT
    lower(substr(cr.id, 1, 7) || substr(cr.submittedBy, 1, 7) || 'r') AS id,
    cr.submittedBy AS recipient,
    'report' AS type,
    'Cell report approved' AS title,
    printf('%s fellowship report has been approved.', cg.name) AS message,
    'cells' AS actionUrl,
    cr.reviewedAt AS eventAt
  FROM cell_reports cr
  JOIN cell_groups cg ON cg.id = cr.cellGroup
  WHERE cr.reportStatus = 'approved' AND cr.reviewedAt != '' AND cr.reviewedAt IS NOT NULL

  UNION ALL

  SELECT
    lower(substr(tc.id, 1, 7) || substr(m.user, 1, 7) || 'c') AS id,
    m.user AS recipient,
    'certificate' AS type,
    'Certificate verified' AS title,
    printf('%s certificate is verified and ready.', t.title) AS message,
    'academy' AS actionUrl,
    COALESCE(NULLIF(tc.verifiedAt, ''), tc.issuedAt) AS eventAt
  FROM training_certificates tc
  JOIN members m ON m.id = tc.member
  JOIN trainings t ON t.id = tc.training
  WHERE tc.status = 'verified' AND m.user != '' AND m.user IS NOT NULL

  UNION ALL

  SELECT
    lower(substr(te.id, 1, 7) || substr(m.user, 1, 7) || 'e') AS id,
    m.user AS recipient,
    'system' AS type,
    'Academy enrollment confirmed' AS title,
    printf('You are enrolled in %s.', t.title) AS message,
    'academy' AS actionUrl,
    te.enrolledAt AS eventAt
  FROM training_enrollments te
  JOIN members m ON m.id = te.member
  JOIN trainings t ON t.id = te.training
  WHERE te.status IN ('enrolled', 'completed') AND m.user != '' AND m.user IS NOT NULL

  UNION ALL

  SELECT
    lower(substr(nr.id, 1, 7) || substr(nr.recipient, 1, 7) || 'm') AS id,
    nr.recipient AS recipient,
    'report' AS type,
    'Cell report reminder' AS title,
    printf('Please submit the weekly fellowship report for %s.', nr.contextLabel) AS message,
    'cells' AS actionUrl,
    nr.eventAt AS eventAt
  FROM notification_reminders nr
`;
const FEED_VIEW_NAMES = [
  'notification_announcements',
  'notification_prayer_assignments',
  'notification_prayer_outcomes',
  'notification_report_submissions',
  'notification_report_reviews',
  'notification_certificates',
  'notification_enrollments',
  'notification_report_reminders'
];
const FEED_VIEWS = FEED_QUERY.trim().split(/\n\s*UNION ALL\s*\n/g).map((viewQuery, index) => ({
  name: FEED_VIEW_NAMES[index], viewQuery
}));

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

function mergeFields(existingFields, desiredFields) {
  const desired = new Map(desiredFields.map((field) => [field.name, field]));
  const merged = existingFields.map((field) => {
    const next = desired.get(field.name);
    if (!next) return field;
    desired.delete(field.name);
    return { ...field, ...next, id: field.id };
  });
  return [...merged, ...desired.values()];
}

async function reconcileCollection(pb, definition) {
  let existing;
  try { existing = await pb.collections.getOne(definition.name); } catch (error) { if (error?.status !== 404) throw error; }
  const payload = existing ? { ...definition, fields: mergeFields(existing.fields ?? [], definition.fields) } : definition;
  const saved = existing ? await pb.collections.update(existing.id, payload) : await pb.collections.create(payload);
  console.log(`✓ ${definition.name} schema and rules reconciled`);
  return saved;
}

async function reconcileView(pb, name, viewQuery) {
  const definition = {
    type: 'view', name, viewQuery,
    listRule: `${AUTHENTICATED} && recipient = @request.auth.id`,
    viewRule: `${AUTHENTICATED} && recipient = @request.auth.id`,
    createRule: null, updateRule: null, deleteRule: null
  };
  let existing;
  try { existing = await pb.collections.getOne(name); } catch (error) { if (error?.status !== 404) throw error; }
  const saved = existing ? await pb.collections.update(existing.id, definition) : await pb.collections.create(definition);
  console.log(`✓ ${name} event projection reconciled`);
  return saved;
}

async function expectRejected(label, operation) {
  try { await operation(); } catch { console.log(`✓ ${label}`); return; }
  throw new Error(`${label}: expected rejection.`);
}

async function removeStaleTests(pb) {
  const announcements = await pb.collection('announcements').getList(1, 200, { filter: 'title ~ "TEST NOTIFICATION"' });
  for (const item of announcements.items) await pb.collection('announcements').delete(item.id);
  const receipts = await pb.collection('notification_receipts').getList(1, 200, { filter: 'notificationKey ~ "ntest"' });
  for (const item of receipts.items) await pb.collection('notification_receipts').delete(item.id);
  const reminders = await pb.collection('notification_reminders').getList(1, 200, { filter: 'sourceKey ~ "TEST-NOTIFICATION"' });
  for (const item of reminders.items) await pb.collection('notification_reminders').delete(item.id);
  const users = await pb.collection('users').getList(1, 200, { filter: 'email ~ "notification-" && email ~ "@example.com"' });
  for (const item of users.items) await pb.collection('users').delete(item.id);
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
  const usersCollection = await superuser.collections.getOne('users');

  await reconcileCollection(superuser, {
    type: 'base', name: 'notification_receipts',
    listRule: `${AUTHENTICATED} && ${OWN_RECEIPT}`,
    viewRule: `${AUTHENTICATED} && ${OWN_RECEIPT}`,
    createRule: `${AUTHENTICATED} && ${OWN_RECEIPT}`,
    updateRule: `${AUTHENTICATED} && ${OWN_RECEIPT} && @request.body.recipient:changed = false && @request.body.notificationKey:changed = false`,
    deleteRule: null,
    fields: [
      { name: 'recipient', type: 'relation', required: true, collectionId: usersCollection.id, maxSelect: 1, cascadeDelete: true },
      { name: 'notificationKey', type: 'text', required: true, min: 15, max: 15, pattern: '^[a-z0-9]+$' },
      { name: 'isRead', type: 'bool' },
      { name: 'dismissed', type: 'bool' },
      { name: 'readAt', type: 'date' },
      { name: 'dismissedAt', type: 'date' },
      { name: 'createdAt', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updatedAt', type: 'autodate', onCreate: true, onUpdate: true }
    ],
    indexes: ['CREATE UNIQUE INDEX idx_notification_receipts_unique ON notification_receipts (recipient, notificationKey)', 'CREATE INDEX idx_notification_receipts_recipient_updated ON notification_receipts (recipient, updatedAt)']
  });
  await reconcileCollection(superuser, {
    type: 'base', name: 'notification_reminders',
    listRule: `${AUTHENTICATED} && (recipient = @request.auth.id || sender = @request.auth.id)`,
    viewRule: `${AUTHENTICATED} && (recipient = @request.auth.id || sender = @request.auth.id)`,
    createRule: `${AUTHENTICATED} && sender = @request.auth.id && eventType = "cell_report_reminder" && (@request.auth.role = "administrator" || @request.auth.role = "lead_pastor" || @request.auth.role = "district_pastor")`,
    updateRule: null, deleteRule: null,
    fields: [
      { name: 'recipient', type: 'relation', required: true, collectionId: usersCollection.id, maxSelect: 1, cascadeDelete: true },
      { name: 'sender', type: 'relation', required: true, collectionId: usersCollection.id, maxSelect: 1, cascadeDelete: true },
      { name: 'eventType', type: 'select', required: true, maxSelect: 1, values: ['cell_report_reminder'] },
      { name: 'contextId', type: 'text', required: true, max: 40 },
      { name: 'contextLabel', type: 'text', required: true, max: 120 },
      { name: 'sourceKey', type: 'text', required: true, max: 80 },
      { name: 'eventAt', type: 'autodate', onCreate: true, onUpdate: false }
    ],
    indexes: ['CREATE UNIQUE INDEX idx_notification_reminders_source ON notification_reminders (sourceKey)', 'CREATE INDEX idx_notification_reminders_recipient_time ON notification_reminders (recipient, eventAt)']
  });
  for (const view of FEED_VIEWS) await reconcileView(superuser, view.name, view.viewQuery);
  await removeStaleTests(superuser);

  const suffix = Date.now().toString(36);
  const credentials = {
    admin: { email: `notification-admin-${suffix}@example.com`, password: temporaryPassword(), role: 'administrator' },
    member: { email: `notification-member-${suffix}@example.com`, password: temporaryPassword(), role: 'member' },
    other: { email: `notification-other-${suffix}@example.com`, password: temporaryPassword(), role: 'member' }
  };
  const created = { users: [], announcements: [], notification_receipts: [], notification_reminders: [] };
  try {
    const records = {};
    const clients = {};
    for (const [key, item] of Object.entries(credentials)) {
      records[key] = await superuser.collection('users').create({
        id: recordId(), email: item.email, password: item.password, passwordConfirm: item.password,
        name: `Notification ${key}`, role: item.role, status: 'active', verified: true
      });
      created.users.push(records[key].id);
      clients[key] = new PocketBase(url); clients[key].autoCancellation(false);
      await clients[key].collection('users').authWithPassword(item.email, item.password);
    }

    const announcement = await clients.admin.collection('announcements').create({
      id: recordId(), title: `TEST NOTIFICATION ${suffix}`, body: 'Disposable notification projection test.',
      tag: 'General', pinned: false, status: 'published', publishAt: new Date(Date.now() - 1000).toISOString(),
      createdBy: records.admin.id, authorName: records.admin.name, authorRole: records.admin.role
    });
    created.announcements.push(announcement.id);

    const memberFeed = await clients.member.collection('notification_announcements').getList(1, 20, { filter: `message = "${announcement.title}"` });
    const otherFeed = await clients.other.collection('notification_announcements').getList(1, 20, { filter: `message = "${announcement.title}"` });
    if (memberFeed.totalItems !== 1 || memberFeed.items[0].recipient !== records.member.id) throw new Error('Member feed projection failed.');
    if (otherFeed.totalItems !== 1 || otherFeed.items[0].recipient !== records.other.id) throw new Error('Other member feed projection failed.');
    console.log('✓ Published event creates one recipient-scoped feed row per active user');
    await expectRejected('Recipient cannot read another user feed row', () => clients.member.collection('notification_announcements').getOne(otherFeed.items[0].id));

    const anonymous = new PocketBase(url);
    if ((await anonymous.collection('notification_announcements').getList(1, 10)).totalItems !== 0) throw new Error('Anonymous feed exposed records.');
    console.log('✓ Anonymous feed exposes no notification rows');

    const reminder = await clients.admin.collection('notification_reminders').create({
      id: recordId(), recipient: records.member.id, sender: records.admin.id,
      eventType: 'cell_report_reminder', contextId: 'test-cell', contextLabel: 'Test Fellowship',
      sourceKey: `TEST-NOTIFICATION-${suffix}`
    });
    created.notification_reminders.push(reminder.id);
    const reminderFeed = await clients.member.collection('notification_report_reminders').getList(1, 10, { filter: `recipient = "${records.member.id}"` });
    if (!reminderFeed.items.some((item) => item.message.includes('Test Fellowship'))) throw new Error('Pastoral reminder was not projected to its recipient.');
    console.log('✓ Pastoral report reminder is delivered through a controlled template');
    await expectRejected('Regular member cannot send reminders', () => clients.other.collection('notification_reminders').create({
      id: recordId(), recipient: records.member.id, sender: records.other.id,
      eventType: 'cell_report_reminder', contextId: 'denied', contextLabel: 'Denied', sourceKey: `TEST-NOTIFICATION-DENIED-${suffix}`
    }));

    const receipt = await clients.member.collection('notification_receipts').create({
      id: recordId(), recipient: records.member.id, notificationKey: memberFeed.items[0].id,
      isRead: true, dismissed: false, readAt: new Date().toISOString()
    });
    created.notification_receipts.push(receipt.id);
    await clients.member.collection('notification_receipts').update(receipt.id, { dismissed: true, dismissedAt: new Date().toISOString() });
    console.log('✓ Recipient can persist read and dismissed state across devices');
    await expectRejected('Other member cannot read receipt', () => clients.other.collection('notification_receipts').getOne(receipt.id));
    await expectRejected('Other member cannot alter receipt', () => clients.other.collection('notification_receipts').update(receipt.id, { isRead: false }));
    await expectRejected('Member cannot create receipt for another recipient', () => clients.member.collection('notification_receipts').create({ id: recordId(), recipient: records.other.id, notificationKey: otherFeed.items[0].id }));
    await expectRejected('Receipt identity cannot be reassigned', () => clients.member.collection('notification_receipts').update(receipt.id, { recipient: records.other.id }));
    await expectRejected('Client hard-delete of receipt is disabled', () => clients.member.collection('notification_receipts').delete(receipt.id));
    await expectRejected('Notification feed rejects client writes', () => clients.admin.collection('notification_announcements').create({ title: 'Denied' }));
  } finally {
    for (const id of created.notification_receipts.reverse()) { try { await superuser.collection('notification_receipts').delete(id); } catch { /* removed */ } }
    for (const id of created.notification_reminders.reverse()) { try { await superuser.collection('notification_reminders').delete(id); } catch { /* removed */ } }
    for (const id of created.announcements.reverse()) { try { await superuser.collection('announcements').delete(id); } catch { /* removed */ } }
    for (const id of created.users.reverse()) { try { await superuser.collection('users').delete(id); } catch { /* removed */ } }
    superuser.authStore.clear();
    console.log('✓ Disposable notification data removed and superuser token cleared');
  }

  console.log('\nCommunication and Notifications schema and live rule tests passed.');
}

main().catch((error) => {
  console.error('\nBootstrap failed:', error?.response ?? error);
  process.exitCode = 1;
});
