import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import process from 'node:process';
import PocketBase from 'pocketbase';

const AUTHENTICATED = '@request.auth.id != ""';
const MANAGER = '(@request.auth.role = "administrator" || @request.auth.role = "lead_pastor")';

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

async function expectRejected(label, operation) {
  try { await operation(); } catch { console.log(`✓ ${label}`); return; }
  throw new Error(`${label}: expected rejection.`);
}

async function removeMatching(pb, collection, filter) {
  const page = await pb.collection(collection).getList(1, 200, { filter });
  for (const record of page.items) await pb.collection(collection).delete(record.id);
}

async function removeStaleTests(pb) {
  const requests = await pb.collection('prayer_requests').getList(1, 200, { filter: 'content ~ "TEST PRAYER"' });
  for (const request of requests.items) {
    await removeMatching(pb, 'prayer_watch_events', `request = "${request.id}"`);
    await removeMatching(pb, 'prayer_notes', `request = "${request.id}"`);
    await removeMatching(pb, 'prayer_outcomes', `request = "${request.id}"`);
    await removeMatching(pb, 'prayer_assignments', `request = "${request.id}"`);
    await pb.collection('prayer_requests').delete(request.id);
  }
  const users = await pb.collection('users').getList(1, 200, { filter: 'email ~ "prayer-" && email ~ "@example.com"' });
  for (const user of users.items) await pb.collection('users').delete(user.id);
  if (requests.items.length || users.items.length) console.log('✓ Removed stale disposable prayer test data');
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
  try {
    const obsoleteOwners = await superuser.collections.getOne('prayer_request_owners');
    const ownerCount = await superuser.collection('prayer_request_owners').getList(1, 1);
    if (ownerCount.totalItems === 0) {
      await superuser.collections.delete(obsoleteOwners.id);
      console.log('✓ Removed obsolete prayer ownership projection');
    }
  } catch (error) {
    if (error?.status !== 404) throw error;
  }

  const requests = await reconcileCollection(superuser, {
    type: 'base', name: 'prayer_requests',
    listRule: `${AUTHENTICATED} && (${MANAGER} || submitter = @request.auth.id)`,
    viewRule: `${AUTHENTICATED} && (${MANAGER} || submitter = @request.auth.id)`,
    createRule: `${AUTHENTICATED} && submitter = @request.auth.id && status = "submitted" && urgency = "low" && assignedIntercessors:length = 0 && ((isAnonymous = true && displayName = "Anonymous Member" && displayAvatar = "??") || (isAnonymous = false && displayName = @request.auth.name))`,
    updateRule: `${AUTHENTICATED} && ${MANAGER} && @request.body.submitter:changed = false && @request.body.displayName:changed = false && @request.body.displayAvatar:changed = false && @request.body.isAnonymous:changed = false && @request.body.category:changed = false && @request.body.content:changed = false`,
    deleteRule: null,
    fields: [
      { name: 'submitter', type: 'relation', required: true, hidden: false, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: 'displayName', type: 'text', required: true, max: 120 }, { name: 'displayAvatar', type: 'text', required: true, max: 4 },
      { name: 'isAnonymous', type: 'bool' },
      { name: 'category', type: 'select', required: true, maxSelect: 1, values: ['Healing', 'Guidance', 'Family', 'Deliverance', 'Thanksgiving', 'Financial', 'Spiritual Growth', 'Other'] },
      { name: 'content', type: 'text', required: true, max: 2000 },
      { name: 'urgency', type: 'select', required: true, maxSelect: 1, values: ['low', 'medium', 'high'] },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['submitted', 'assigned', 'archived'] },
      { name: 'assignedIntercessors', type: 'relation', collectionId: users.id, maxSelect: 20, cascadeDelete: false },
      { name: 'answeredAt', type: 'date' }, { name: 'archivedAt', type: 'date' }
    ],
    indexes: [
      'CREATE INDEX idx_prayer_requests_status_urgency ON prayer_requests (status, urgency)',
      'CREATE INDEX idx_prayer_requests_submitter_status ON prayer_requests (submitter, status)',
      'CREATE INDEX idx_prayer_requests_category_status ON prayer_requests (category, status)'
    ]
  });

  await reconcileCollection(superuser, {
    type: 'base', name: 'prayer_assignments',
    listRule: `${AUTHENTICATED} && (${MANAGER} || intercessor = @request.auth.id || request.submitter = @request.auth.id)`,
    viewRule: `${AUTHENTICATED} && (${MANAGER} || intercessor = @request.auth.id || request.submitter = @request.auth.id)`,
    createRule: `${AUTHENTICATED} && ${MANAGER} && assignedBy = @request.auth.id && status = "active" && requestCategory = request.category && requestContent = request.content && requestDisplayName = request.displayName && requestDisplayAvatar = request.displayAvatar && requestIsAnonymous = request.isAnonymous && requestUrgency = request.urgency`,
    updateRule: `${AUTHENTICATED} && (${MANAGER} || (intercessor = @request.auth.id && @request.body.status = "completed" && @request.body.request:changed = false && @request.body.intercessor:changed = false && @request.body.intercessorName:changed = false && @request.body.assignedBy:changed = false && @request.body.assignedAt:changed = false && @request.body.requestCategory:changed = false && @request.body.requestContent:changed = false && @request.body.requestDisplayName:changed = false && @request.body.requestDisplayAvatar:changed = false && @request.body.requestIsAnonymous:changed = false && @request.body.requestUrgency:changed = false && @request.body.requestCreatedAt:changed = false))`,
    deleteRule: null,
    fields: [
      { name: 'request', type: 'relation', required: true, collectionId: requests.id, maxSelect: 1, cascadeDelete: false },
      { name: 'intercessor', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: 'intercessorName', type: 'text', required: true, max: 120 },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['active', 'completed'] },
      { name: 'assignedBy', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: 'assignedAt', type: 'date', required: true },
      { name: 'requestCategory', type: 'select', required: true, maxSelect: 1, values: ['Healing', 'Guidance', 'Family', 'Deliverance', 'Thanksgiving', 'Financial', 'Spiritual Growth', 'Other'] },
      { name: 'requestContent', type: 'text', required: true, max: 2000 },
      { name: 'requestDisplayName', type: 'text', required: true, max: 120 },
      { name: 'requestDisplayAvatar', type: 'text', required: true, max: 4 },
      { name: 'requestIsAnonymous', type: 'bool' },
      { name: 'requestUrgency', type: 'select', required: true, maxSelect: 1, values: ['low', 'medium', 'high'] },
      { name: 'requestCreatedAt', type: 'date', required: true }
    ],
    indexes: ['CREATE UNIQUE INDEX idx_prayer_assignments_unique ON prayer_assignments (request, intercessor)', 'CREATE INDEX idx_prayer_assignments_intercessor_status ON prayer_assignments (intercessor, status)']
  });

  await reconcileCollection(superuser, {
    type: 'base', name: 'prayer_outcomes',
    listRule: `${AUTHENTICATED} && (${MANAGER} || request.submitter = @request.auth.id || request.assignedIntercessors.id ?= @request.auth.id)`,
    viewRule: `${AUTHENTICATED} && (${MANAGER} || request.submitter = @request.auth.id || request.assignedIntercessors.id ?= @request.auth.id)`,
    createRule: `${AUTHENTICATED} && reportedBy = @request.auth.id && reporterName = @request.auth.name && (${MANAGER} || request.assignedIntercessors.id ?= @request.auth.id)`,
    updateRule: null, deleteRule: null,
    fields: [
      { name: 'request', type: 'relation', required: true, collectionId: requests.id, maxSelect: 1, cascadeDelete: false },
      { name: 'reportedBy', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: 'reporterName', type: 'text', required: true, max: 120 },
      { name: 'reportedAt', type: 'date', required: true }
    ],
    indexes: ['CREATE UNIQUE INDEX idx_prayer_outcomes_request ON prayer_outcomes (request)']
  });

  await reconcileCollection(superuser, {
    type: 'base', name: 'prayer_notes',
    listRule: `${AUTHENTICATED} && (${MANAGER} || request.submitter = @request.auth.id || request.assignedIntercessors.id ?= @request.auth.id)`,
    viewRule: `${AUTHENTICATED} && (${MANAGER} || request.submitter = @request.auth.id || request.assignedIntercessors.id ?= @request.auth.id)`,
    createRule: `${AUTHENTICATED} && author = @request.auth.id && authorName = @request.auth.name && (${MANAGER} || request.assignedIntercessors.id ?= @request.auth.id)`,
    updateRule: null, deleteRule: null,
    fields: [
      { name: 'request', type: 'relation', required: true, collectionId: requests.id, maxSelect: 1, cascadeDelete: false },
      { name: 'author', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: 'authorName', type: 'text', required: true, max: 120 }, { name: 'text', type: 'text', required: true, max: 1200 }
    ],
    indexes: ['CREATE INDEX idx_prayer_notes_request ON prayer_notes (request)']
  });

  await reconcileCollection(superuser, {
    type: 'base', name: 'prayer_watch_events',
    listRule: `${AUTHENTICATED} && (${MANAGER} || request.submitter = @request.auth.id || request.assignedIntercessors.id ?= @request.auth.id)`,
    viewRule: `${AUTHENTICATED} && (${MANAGER} || request.submitter = @request.auth.id || request.assignedIntercessors.id ?= @request.auth.id)`,
    createRule: `${AUTHENTICATED} && offeredBy = @request.auth.id && (${MANAGER} || request.assignedIntercessors.id ?= @request.auth.id)`,
    updateRule: null, deleteRule: null,
    fields: [
      { name: 'operationId', type: 'text', required: true, max: 80 },
      { name: 'request', type: 'relation', required: true, collectionId: requests.id, maxSelect: 1, cascadeDelete: false },
      { name: 'offeredBy', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: 'offeredAt', type: 'date', required: true }
    ],
    indexes: ['CREATE UNIQUE INDEX idx_prayer_watch_events_operation ON prayer_watch_events (operationId)', 'CREATE INDEX idx_prayer_watch_events_request_time ON prayer_watch_events (request, offeredAt)']
  });

  await removeStaleTests(superuser);
  const suffix = Date.now().toString(36);
  const credentials = {
    admin: { role: 'administrator', password: temporaryPassword() },
    member: { role: 'member', password: temporaryPassword() },
    other: { role: 'member', password: temporaryPassword() },
    intercessor: { role: 'cell_leader', password: temporaryPassword() }
  };
  for (const [key, item] of Object.entries(credentials)) item.email = `prayer-${key}-${suffix}@example.com`;
  const created = { users: [], prayer_requests: [], prayer_assignments: [], prayer_outcomes: [], prayer_notes: [], prayer_watch_events: [] };

  try {
    const userRecords = {};
    for (const [key, item] of Object.entries(credentials)) {
      const record = await superuser.collection('users').create({
        id: recordId(), email: item.email, password: item.password, passwordConfirm: item.password,
        name: `Prayer ${key}`, role: item.role, department: key === 'intercessor' ? 'Intercessory Ministry' : '', status: 'active', verified: true
      });
      userRecords[key] = record; created.users.push(record.id);
    }
    const clients = {};
    for (const [key, item] of Object.entries(credentials)) {
      clients[key] = new PocketBase(url); clients[key].autoCancellation(false);
      await clients[key].collection('users').authWithPassword(item.email, item.password);
    }

    const request = await clients.member.collection('prayer_requests').create({
      id: recordId(), submitter: userRecords.member.id, displayName: 'Anonymous Member', displayAvatar: '??',
      isAnonymous: true, category: 'Guidance', content: `TEST PRAYER anonymous ${suffix}`,
      urgency: 'low', status: 'submitted', assignedIntercessors: [], answeredAt: '', archivedAt: ''
    });
    created.prayer_requests.push(request.id);
    console.log('✓ Member submitted an anonymous prayer with server-enforced ownership');
    await expectRejected('Anonymous display identity cannot be spoofed', () => clients.member.collection('prayer_requests').create({
      id: recordId(), submitter: userRecords.member.id, displayName: userRecords.member.name, displayAvatar: 'PM',
      isAnonymous: true, category: 'Other', content: `TEST PRAYER spoof ${suffix}`, urgency: 'low', status: 'submitted', assignedIntercessors: []
    }));
    await expectRejected('Unrelated member cannot read prayer', () => clients.other.collection('prayer_requests').getOne(request.id));
    await expectRejected('Unassigned intercessor cannot read prayer', () => clients.intercessor.collection('prayer_requests').getOne(request.id));
    if ((await clients.admin.collection('prayer_requests').getOne(request.id)).id !== request.id) throw new Error('Manager could not triage prayer.');
    console.log('✓ Owner-only and pastoral triage visibility enforced before assignment');

    const assignment = await clients.admin.collection('prayer_assignments').create({
      id: recordId(), request: request.id, intercessor: userRecords.intercessor.id,
      intercessorName: userRecords.intercessor.name, status: 'active', assignedBy: userRecords.admin.id, assignedAt: new Date().toISOString(),
      requestCategory: request.category, requestContent: request.content,
      requestDisplayName: request.displayName, requestDisplayAvatar: request.displayAvatar,
      requestIsAnonymous: request.isAnonymous, requestUrgency: request.urgency,
      requestCreatedAt: request.created || new Date().toISOString()
    });
    created.prayer_assignments.push(assignment.id);
    await clients.admin.collection('prayer_requests').update(request.id, { assignedIntercessors: [userRecords.intercessor.id], status: 'assigned' });
    await expectRejected('Assigned intercessor still cannot read identity-bearing request', () => clients.intercessor.collection('prayer_requests').getOne(request.id));
    const safeAssignment = await clients.intercessor.collection('prayer_assignments').getOne(assignment.id);
    if (safeAssignment.requestDisplayName !== 'Anonymous Member' || 'submitter' in safeAssignment) throw new Error('Anonymous identity leaked through assignment projection.');
    if ((await clients.member.collection('prayer_assignments').getOne(assignment.id)).id !== assignment.id) throw new Error('Submitter could not see assignment metadata.');
    await expectRejected('Unrelated member cannot read assignment', () => clients.other.collection('prayer_assignments').getOne(assignment.id));
    console.log('✓ Assignment grants prayer access without exposing anonymous identity');

    const note = await clients.intercessor.collection('prayer_notes').create({
      id: recordId(), request: request.id, author: userRecords.intercessor.id,
      authorName: userRecords.intercessor.name, text: 'TEST PRAYER note'
    });
    created.prayer_notes.push(note.id);
    const operationId = `prayer-watch-${suffix}`;
    const watch = await clients.intercessor.collection('prayer_watch_events').create({
      id: recordId(), operationId, request: request.id, offeredBy: userRecords.intercessor.id, offeredAt: new Date().toISOString()
    });
    created.prayer_watch_events.push(watch.id);
    await expectRejected('Prayer watch operation is idempotent', () => clients.intercessor.collection('prayer_watch_events').create({
      id: recordId(), operationId, request: request.id, offeredBy: userRecords.intercessor.id, offeredAt: new Date().toISOString()
    }));
    if ((await clients.member.collection('prayer_notes').getOne(note.id)).id !== note.id) throw new Error('Submitter could not read intercessory note.');
    await expectRejected('Unrelated member cannot add prayer note', () => clients.other.collection('prayer_notes').create({
      id: recordId(), request: request.id, author: userRecords.other.id, authorName: userRecords.other.name, text: 'Denied'
    }));
    await expectRejected('Assigned intercessor cannot alter identity-bearing request', () => clients.intercessor.collection('prayer_requests').update(request.id, { content: 'Denied edit' }));
    await expectRejected('Submitter cannot alter submitted prayer text', () => clients.member.collection('prayer_requests').update(request.id, { content: 'Denied owner edit' }));
    console.log('✓ Append-only notes and prayer-count events enforce participant access');

    const outcome = await clients.intercessor.collection('prayer_outcomes').create({
      id: recordId(), request: request.id, reportedBy: userRecords.intercessor.id,
      reporterName: userRecords.intercessor.name, reportedAt: new Date().toISOString()
    });
    created.prayer_outcomes.push(outcome.id);
    if ((await clients.member.collection('prayer_outcomes').getOne(outcome.id)).id !== outcome.id) throw new Error('Submitter could not see answered outcome.');
    await expectRejected('Unrelated member cannot report prayer outcome', () => clients.other.collection('prayer_outcomes').create({
      id: recordId(), request: request.id, reportedBy: userRecords.other.id,
      reporterName: userRecords.other.name, reportedAt: new Date().toISOString()
    }));
    await clients.intercessor.collection('prayer_assignments').update(assignment.id, { status: 'completed' });
    await expectRejected('Client hard-delete is disabled', () => clients.admin.collection('prayer_requests').delete(request.id));
    await clients.admin.collection('prayer_requests').update(request.id, { status: 'archived', archivedAt: new Date().toISOString() });
    console.log('✓ Assigned intercessor completed the watch; pastoral archive retained the request');
  } finally {
    for (const collection of ['prayer_watch_events', 'prayer_notes', 'prayer_outcomes', 'prayer_assignments', 'prayer_requests', 'users']) {
      for (const id of created[collection].reverse()) {
        try { await superuser.collection(collection).delete(id); } catch { /* Already removed. */ }
      }
    }
    superuser.authStore.clear();
    console.log('✓ Disposable prayer data removed and superuser token cleared');
  }
}

main().catch((error) => {
  console.error(JSON.stringify(error?.response || { message: error?.message, status: error?.status }, null, 2));
  process.exitCode = 1;
});
