import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import process from 'node:process';
import PocketBase from 'pocketbase';

const AUTHENTICATED = '@request.auth.id != ""';
const MANAGER = '(@request.auth.role = "administrator" || @request.auth.role = "lead_pastor" || @request.auth.role = "district_pastor")';
const VISIBLE = '(status = "published" && publishAt <= @now && (expiresAt = "" || expiresAt > @now))';
const OWN_CALENDAR_EXPORT = 'user = @request.auth.id';
const CURRENT_EXPORTABLE_VERSION = '(@collection.calendar_exportable_events.announcementId ?= announcement && @collection.calendar_exportable_events.eventTitle ?= titleSnapshot && @collection.calendar_exportable_events.eventBody ?= bodySnapshot && @collection.calendar_exportable_events.eventDate ?= eventDateSnapshot && @collection.calendar_exportable_events.eventTime ?= eventTimeSnapshot && @collection.calendar_exportable_events.eventLocation ?= eventLocationSnapshot)';
const CURRENT_REQUEST_EXPORTABLE_VERSION = '(@collection.calendar_exportable_events.announcementId ?= announcement && @collection.calendar_exportable_events.eventTitle ?= @request.body.titleSnapshot && @collection.calendar_exportable_events.eventBody ?= @request.body.bodySnapshot && @collection.calendar_exportable_events.eventDate ?= @request.body.eventDateSnapshot && @collection.calendar_exportable_events.eventTime ?= @request.body.eventTimeSnapshot && @collection.calendar_exportable_events.eventLocation ?= @request.body.eventLocationSnapshot)';
const EXPORTABLE_EVENTS_QUERY = `
  SELECT
    a.id AS id,
    a.id AS announcementId,
    a.title AS eventTitle,
    a.body AS eventBody,
    substr(a.eventDate, 1, 10) AS eventDate,
    a.eventTime AS eventTime,
    a.eventLocation AS eventLocation
  FROM announcements a
  WHERE a.tag = 'Event'
    AND a.status = 'published'
    AND a.publishAt <= datetime('now')
    AND (a.expiresAt = '' OR a.expiresAt > datetime('now'))
`;

function eventSnapshot(event) {
  return {
    titleSnapshot: event.title,
    bodySnapshot: event.body,
    eventDateSnapshot: String(event.eventDate || '').slice(0, 10),
    eventTimeSnapshot: event.eventTime || '',
    eventLocationSnapshot: event.eventLocation || ''
  };
}

function argument(name, fallback = '') {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function hiddenQuestion(prompt) {
  if (!process.stdin.isTTY) throw new Error('A TTY is required for the credential prompt.');
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
  const merged = existingFields.flatMap((field) => {
    const next = desired.get(field.name);
    if (!next) return [field];
    desired.delete(field.name);
    if (field.type !== next.type) return [next];
    return [{ ...field, ...next, id: field.id }];
  });
  return [...merged, ...desired.values()];
}

async function reconcileCollection(pb, definition) {
  let existing;
  try { existing = await pb.collections.getOne(definition.name); } catch (error) { if (error?.status !== 404) throw error; }
  const payload = existing ? { ...definition, fields: mergeFields(existing.fields ?? [], definition.fields) } : definition;
  const saved = existing ? await pb.collections.update(existing.id, payload) : await pb.collections.create(payload);
  console.log(`✓ ${definition.name} schema, indexes, and rules reconciled`);
  return saved;
}

async function reconcileView(pb, definition) {
  let existing;
  try { existing = await pb.collections.getOne(definition.name); } catch (error) { if (error?.status !== 404) throw error; }
  const saved = existing ? await pb.collections.update(existing.id, definition) : await pb.collections.create(definition);
  console.log(`✓ ${definition.name} read-only projection reconciled`);
  return saved;
}

async function expectRejected(label, operation) {
  try { await operation(); } catch { console.log(`✓ ${label}`); return; }
  throw new Error(`${label}: expected rejection.`);
}

async function removeStaleTests(pb) {
  const announcements = await pb.collection('announcements').getList(1, 200, { filter: 'title ~ "TEST ANNOUNCEMENT"' });
  for (const item of announcements.items) await pb.collection('announcements').delete(item.id);
  const users = await pb.collection('users').getList(1, 200, { filter: 'email ~ "announce-" && email ~ "@example.com"' });
  for (const user of users.items) await pb.collection('users').delete(user.id);
  if (announcements.items.length || users.items.length) console.log('✓ Removed stale disposable announcement test data');
}

async function main() {
  const url = argument('url', 'https://churchconnect.pockethost.io').replace(/\/$/, '');
  const email = argument('email') || await hiddenQuestion('PocketBase superuser email: ');
  const password = await hiddenQuestion('PocketBase superuser password: ');
  if (argument('transport') === 'curl') globalThis.fetch = curlFetch;

  const superuser = new PocketBase(url);
  superuser.autoCancellation(false);
  await superuser.collection('_superusers').authWithPassword(email, password);
  console.log('✓ Superuser authentication');
  const users = await superuser.collections.getOne('users');

  const announcements = await reconcileCollection(superuser, {
    type: 'base', name: 'announcements',
    listRule: `${AUTHENTICATED} && (${MANAGER} || ${VISIBLE})`,
    viewRule: `${AUTHENTICATED} && (${MANAGER} || ${VISIBLE})`,
    createRule: `${AUTHENTICATED} && ${MANAGER} && createdBy = @request.auth.id && authorName = @request.auth.name && authorRole = @request.auth.role && status = "published"`,
    updateRule: `${AUTHENTICATED} && ${MANAGER} && @request.body.createdBy:changed = false && @request.body.authorName:changed = false && @request.body.authorRole:changed = false`,
    deleteRule: null,
    fields: [
      { name: 'title', type: 'text', required: true, max: 80 },
      { name: 'body', type: 'text', required: true, max: 600 },
      { name: 'tag', type: 'select', required: true, maxSelect: 1, values: ['General', 'Urgent', 'Event', 'Reminder'] },
      { name: 'pinned', type: 'bool' },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['published', 'archived'] },
      { name: 'publishAt', type: 'date', required: true }, { name: 'expiresAt', type: 'date' },
      { name: 'eventDate', type: 'date' }, { name: 'eventTime', type: 'text', max: 10 },
      { name: 'eventLocation', type: 'text', max: 200 },
      { name: 'createdBy', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: 'authorName', type: 'text', required: true, max: 120 },
      { name: 'authorRole', type: 'select', required: true, maxSelect: 1, values: ['lead_pastor', 'administrator', 'cell_leader', 'district_pastor', 'department_head', 'member', 'guest'] }
    ],
    indexes: [
      'CREATE INDEX idx_announcements_feed ON announcements (status, pinned, publishAt)',
      'CREATE INDEX idx_announcements_expiry ON announcements (status, expiresAt)'
    ]
  });

  await reconcileView(superuser, {
    type: 'view', name: 'calendar_exportable_events', viewQuery: EXPORTABLE_EVENTS_QUERY,
    listRule: AUTHENTICATED, viewRule: AUTHENTICATED,
    createRule: null, updateRule: null, deleteRule: null
  });

  await reconcileCollection(superuser, {
    type: 'base', name: 'calendar_event_exports',
    listRule: `${AUTHENTICATED} && ${OWN_CALENDAR_EXPORT}`,
    viewRule: `${AUTHENTICATED} && ${OWN_CALENDAR_EXPORT}`,
    createRule: `${AUTHENTICATED} && ${OWN_CALENDAR_EXPORT} && ${CURRENT_EXPORTABLE_VERSION}`,
    updateRule: `${AUTHENTICATED} && ${OWN_CALENDAR_EXPORT} && @request.body.user:changed = false && @request.body.announcement:changed = false && ${CURRENT_REQUEST_EXPORTABLE_VERSION}`,
    deleteRule: `${AUTHENTICATED} && ${OWN_CALENDAR_EXPORT}`,
    fields: [
      { name: 'user', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { name: 'announcement', type: 'relation', required: true, collectionId: announcements.id, maxSelect: 1, cascadeDelete: true },
      { name: 'method', type: 'select', required: true, maxSelect: 1, values: ['ics', 'google'] },
      { name: 'titleSnapshot', type: 'text', required: true, max: 80 },
      { name: 'bodySnapshot', type: 'text', required: true, max: 600 },
      { name: 'eventDateSnapshot', type: 'text', required: true, max: 10 },
      { name: 'eventTimeSnapshot', type: 'text', max: 10 },
      { name: 'eventLocationSnapshot', type: 'text', max: 200 }
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_calendar_event_exports_owner_event ON calendar_event_exports (user, announcement)'
    ]
  });

  await removeStaleTests(superuser);
  const suffix = Date.now().toString(36);
  const credentials = Object.fromEntries(['admin', 'district', 'member'].map((key) => [key, {
    email: `announce-${key}-${suffix}@example.com`, password: temporaryPassword(),
    role: key === 'admin' ? 'administrator' : key === 'district' ? 'district_pastor' : 'member'
  }]));
  const created = { users: [], announcements: [], calendar_event_exports: [] };

  try {
    const userRecords = {};
    for (const [key, item] of Object.entries(credentials)) {
      const record = await superuser.collection('users').create({
        id: recordId(), email: item.email, password: item.password, passwordConfirm: item.password,
        name: `Announcement ${key}`, role: item.role, status: 'active', verified: true
      });
      userRecords[key] = record; created.users.push(record.id);
    }
    const clients = {};
    for (const [key, item] of Object.entries(credentials)) {
      clients[key] = new PocketBase(url); clients[key].autoCancellation(false);
      await clients[key].collection('users').authWithPassword(item.email, item.password);
    }

    const base = {
      body: 'Disposable announcement rule test.', tag: 'General', pinned: false,
      status: 'published', createdBy: userRecords.admin.id,
      authorName: userRecords.admin.name, authorRole: 'administrator'
    };
    const active = await clients.admin.collection('announcements').create({
      id: recordId(), ...base, title: `TEST ANNOUNCEMENT ACTIVE ${suffix}`,
      publishAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString()
    });
    const scheduled = await clients.admin.collection('announcements').create({
      id: recordId(), ...base, title: `TEST ANNOUNCEMENT SCHEDULED ${suffix}`,
      publishAt: new Date(Date.now() + 3_600_000).toISOString(), expiresAt: ''
    });
    const expired = await clients.admin.collection('announcements').create({
      id: recordId(), ...base, title: `TEST ANNOUNCEMENT EXPIRED ${suffix}`,
      publishAt: new Date(Date.now() - 7_200_000).toISOString(), expiresAt: new Date(Date.now() - 3_600_000).toISOString()
    });
    created.announcements.push(active.id, scheduled.id, expired.id);
    const event = await clients.admin.collection('announcements').create({
      id: recordId(), ...base, title: `TEST ANNOUNCEMENT EVENT ${suffix}`, tag: 'Event',
      eventDate: new Date(Date.now() + 86_400_000).toISOString(), eventTime: '10:00', eventLocation: 'Test Sanctuary',
      publishAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString()
    });
    created.announcements.push(event.id);
    console.log('✓ Administrator created active, scheduled, and expired announcements');

    const visible = await clients.member.collection('announcements').getList(1, 200);
    if (!visible.items.some((item) => item.id === active.id) || visible.items.some((item) => item.id === scheduled.id || item.id === expired.id)) {
      throw new Error('Member timeline visibility did not enforce release and expiry windows.');
    }
    console.log('✓ Member timeline exposes only currently published announcements');
    await expectRejected('Scheduled announcement hidden from members', () => clients.member.collection('announcements').getOne(scheduled.id));
    await expectRejected('Expired announcement hidden from members', () => clients.member.collection('announcements').getOne(expired.id));
    await expectRejected('Regular member cannot publish', () => clients.member.collection('announcements').create({ ...base, title: `TEST ANNOUNCEMENT DENIED ${suffix}`, createdBy: userRecords.member.id }));
    await expectRejected('Regular member cannot edit', () => clients.member.collection('announcements').update(active.id, { pinned: true }));
    await expectRejected('Client hard-delete is disabled', () => clients.admin.collection('announcements').delete(active.id));
    await expectRejected('Manager cannot impersonate another announcement author', () => clients.district.collection('announcements').create({
      id: recordId(), ...base, title: `TEST ANNOUNCEMENT SPOOFED ${suffix}`,
      createdBy: userRecords.district.id, publishAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: ''
    }));

    const districtPost = await clients.district.collection('announcements').create({
      id: recordId(), ...base, title: `TEST ANNOUNCEMENT DISTRICT ${suffix}`,
      createdBy: userRecords.district.id, authorName: userRecords.district.name, authorRole: 'district_pastor',
      publishAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: ''
    });
    created.announcements.push(districtPost.id);
    await clients.district.collection('announcements').update(districtPost.id, { pinned: true });
    console.log('✓ District pastor management matches the existing app role');

    const eventProjection = await clients.member.collection('calendar_exportable_events').getOne(event.id);
    const snapshot = eventSnapshot(event);
    for (const [field, value] of Object.entries({
      eventTitle: snapshot.titleSnapshot,
      eventBody: snapshot.bodySnapshot,
      eventDate: snapshot.eventDateSnapshot,
      eventTime: snapshot.eventTimeSnapshot,
      eventLocation: snapshot.eventLocationSnapshot
    })) {
      if ((eventProjection[field] || '') !== value) {
        throw new Error(`Calendar event projection mismatch on ${field}: expected "${value}" but saw "${eventProjection[field] || ''}".`);
      }
    }
    console.log('✓ Calendar export projection matches the app event snapshot');

    const calendarExport = await clients.member.collection('calendar_event_exports').create({
      id: recordId(), user: userRecords.member.id, announcement: event.id,
      method: 'ics', ...snapshot
    });
    created.calendar_event_exports.push(calendarExport.id);
    const ownExports = await clients.member.collection('calendar_event_exports').getFullList();
    if (ownExports.length !== 1 || ownExports[0].announcement !== event.id) throw new Error('Member calendar export was not account-scoped.');
    console.log('✓ Member calendar export state persists under the signed-in account');
    await expectRejected('Another member cannot inspect calendar export state', () => clients.district.collection('calendar_event_exports').getOne(calendarExport.id));
    await expectRejected('Calendar export owner cannot be spoofed', () => clients.member.collection('calendar_event_exports').create({
      id: recordId(), user: userRecords.district.id, announcement: event.id, method: 'ics', ...eventSnapshot(event)
    }));
    await expectRejected('Non-event announcement cannot be tracked as a calendar export', () => clients.member.collection('calendar_event_exports').create({
      id: recordId(), user: userRecords.member.id, announcement: active.id, method: 'ics', ...eventSnapshot(active)
    }));
    await expectRejected('Duplicate event export state is rejected', () => clients.member.collection('calendar_event_exports').create({
      id: recordId(), user: userRecords.member.id, announcement: event.id, method: 'google', ...eventSnapshot(event)
    }));
    await expectRejected('Stale event version cannot be marked current', () => clients.member.collection('calendar_event_exports').update(calendarExport.id, {
      method: 'google', ...eventSnapshot(event), titleSnapshot: 'Stale event title'
    }));
    const updatedExport = await clients.member.collection('calendar_event_exports').update(calendarExport.id, {
      method: 'google', ...eventSnapshot(event)
    });
    if (updatedExport.method !== 'google') throw new Error('Calendar export method update did not persist.');
    console.log('✓ Current event version can be re-exported without creating duplicates');
    await expectRejected('Calendar export relation is immutable', () => clients.member.collection('calendar_event_exports').update(calendarExport.id, { announcement: active.id, ...eventSnapshot(active) }));
    await expectRejected('Another account cannot delete calendar export state', () => clients.district.collection('calendar_event_exports').delete(calendarExport.id));
    const anonymousExports = await new PocketBase(url).collection('calendar_event_exports').getList(1, 10);
    if (anonymousExports.totalItems !== 0) throw new Error('Anonymous calendar export listing exposed rows.');
    console.log('✓ Anonymous calendar export listing exposes no rows');
    await clients.member.collection('calendar_event_exports').delete(calendarExport.id);
    console.log('✓ Member can clear their own calendar export state');

    await clients.admin.collection('announcements').update(active.id, { status: 'archived' });
    await expectRejected('Archived announcement hidden from members', () => clients.member.collection('announcements').getOne(active.id));
    const retained = await clients.admin.collection('announcements').getOne(active.id);
    if (retained.status !== 'archived') throw new Error('Archived record was not retained for leadership.');
    console.log('✓ Archive is retained for leadership and removed from member timelines');
  } finally {
    for (const id of created.calendar_event_exports.reverse()) {
      try { await superuser.collection('calendar_event_exports').delete(id); } catch { /* Already removed. */ }
    }
    for (const id of created.announcements.reverse()) {
      try { await superuser.collection('announcements').delete(id); } catch { /* Already removed. */ }
    }
    for (const id of created.users.reverse()) {
      try { await superuser.collection('users').delete(id); } catch { /* Already removed. */ }
    }
    superuser.authStore.clear();
    console.log('✓ Disposable announcement data removed and superuser token cleared');
  }
}

main().catch((error) => {
  console.error(error?.response || error);
  process.exitCode = 1;
});
