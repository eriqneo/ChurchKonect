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

async function expectRejected(label, operation) {
  try { await operation(); } catch { console.log(`✓ ${label}`); return; }
  throw new Error(`${label}: expected rejection.`);
}

async function removeStaleTests(pb) {
  for (const collection of ['audit_logs', 'feedback']) {
    const records = await pb.collection(collection).getList(1, 200, { filter: collection === 'audit_logs' ? 'summary ~ "TEST GOVERNANCE"' : 'content ~ "TEST GOVERNANCE"' });
    for (const item of records.items) await pb.collection(collection).delete(item.id);
  }
  const users = await pb.collection('users').getList(1, 200, { filter: 'email ~ "governance-" && email ~ "@example.com"' });
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
    type: 'base', name: 'audit_logs',
    listRule: `${AUTHENTICATED} && (actor = @request.auth.id || ${MANAGER})`,
    viewRule: `${AUTHENTICATED} && (actor = @request.auth.id || ${MANAGER})`,
    createRule: `${AUTHENTICATED} && actor = @request.auth.id && @request.body.actorName = @request.auth.name && @request.body.source = "client"`,
    updateRule: null, deleteRule: null,
    fields: [
      { name: 'actor', type: 'relation', required: true, collectionId: usersCollection.id, maxSelect: 1, cascadeDelete: true },
      { name: 'actorName', type: 'text', required: true, max: 120 },
      { name: 'action', type: 'text', required: true, min: 3, max: 80, pattern: '^[a-z][a-z0-9_]+$' },
      { name: 'summary', type: 'text', required: true, max: 500 },
      { name: 'entityType', type: 'text', max: 50, pattern: '^[a-z0-9_]*$' },
      { name: 'entityId', type: 'text', max: 80 },
      { name: 'source', type: 'select', required: true, maxSelect: 1, values: ['client', 'server'] },
      { name: 'operationId', type: 'text', required: true, min: 15, max: 15, pattern: '^[a-z0-9]+$' },
      { name: 'occurredAt', type: 'autodate', onCreate: true, onUpdate: false }
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_audit_logs_operation ON audit_logs (operationId)',
      'CREATE INDEX idx_audit_logs_actor_time ON audit_logs (actor, occurredAt)',
      'CREATE INDEX idx_audit_logs_action_time ON audit_logs (action, occurredAt)'
    ]
  });

  await reconcileCollection(superuser, {
    type: 'base', name: 'feedback',
    listRule: `${AUTHENTICATED} && (submitter = @request.auth.id || ${MANAGER})`,
    viewRule: `${AUTHENTICATED} && (submitter = @request.auth.id || ${MANAGER})`,
    createRule: `${AUTHENTICATED} && submitter = @request.auth.id && @request.body.submitterName = @request.auth.name && @request.body.status = "new" && @request.body.response = "" && @request.body.assignedTo = ""`,
    updateRule: `${AUTHENTICATED} && ${MANAGER} && @request.body.submitter:changed = false && @request.body.submitterName:changed = false && @request.body.type:changed = false && @request.body.content:changed = false && @request.body.submittedAt:changed = false`,
    deleteRule: null,
    fields: [
      { name: 'submitter', type: 'relation', required: true, collectionId: usersCollection.id, maxSelect: 1, cascadeDelete: true },
      { name: 'submitterName', type: 'text', required: true, max: 120 },
      { name: 'type', type: 'select', required: true, maxSelect: 1, values: ['bug', 'suggestion', 'support', 'other'] },
      { name: 'content', type: 'text', required: true, min: 10, max: 2000 },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['new', 'reviewing', 'resolved'] },
      { name: 'response', type: 'text', max: 2000 },
      { name: 'assignedTo', type: 'relation', collectionId: usersCollection.id, maxSelect: 1, cascadeDelete: false },
      { name: 'submittedAt', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'reviewedAt', type: 'date' }
    ],
    indexes: [
      'CREATE INDEX idx_feedback_submitter_time ON feedback (submitter, submittedAt)',
      'CREATE INDEX idx_feedback_status_time ON feedback (status, submittedAt)'
    ]
  });

  await removeStaleTests(superuser);
  const suffix = Date.now().toString(36);
  const credentials = {
    admin: { email: `governance-admin-${suffix}@example.com`, password: temporaryPassword(), role: 'administrator' },
    member: { email: `governance-member-${suffix}@example.com`, password: temporaryPassword(), role: 'member' },
    other: { email: `governance-other-${suffix}@example.com`, password: temporaryPassword(), role: 'member' }
  };
  const created = { users: [], audit_logs: [], feedback: [] };
  try {
    const records = {}; const clients = {};
    for (const [key, item] of Object.entries(credentials)) {
      records[key] = await superuser.collection('users').create({
        id: recordId(), email: item.email, password: item.password, passwordConfirm: item.password,
        name: `Governance ${key}`, role: item.role, status: 'active', verified: true
      });
      created.users.push(records[key].id);
      clients[key] = new PocketBase(url); clients[key].autoCancellation(false);
      await clients[key].collection('users').authWithPassword(item.email, item.password);
    }

    const auditId = recordId();
    const audit = await clients.member.collection('audit_logs').create({
      id: auditId, actor: records.member.id, actorName: records.member.name,
      action: 'test_action', summary: `TEST GOVERNANCE ${suffix}`, entityType: 'test', entityId: suffix,
      source: 'client', operationId: auditId
    });
    created.audit_logs.push(audit.id);
    if ((await clients.member.collection('audit_logs').getList(1, 10)).totalItems !== 1) throw new Error('Member could not read their own activity.');
    if ((await clients.other.collection('audit_logs').getList(1, 10)).totalItems !== 0) throw new Error('Another member could read activity.');
    if (!(await clients.admin.collection('audit_logs').getOne(audit.id))) throw new Error('Administrator could not read activity.');
    console.log('✓ Activity history is actor-scoped and visible to authorized leadership');
    await expectRejected('Actor cannot be spoofed', () => clients.member.collection('audit_logs').create({
      id: recordId(), actor: records.other.id, actorName: records.member.name, action: 'test_action', summary: 'Denied', source: 'client', operationId: recordId()
    }));
    await expectRejected('Actor name cannot be spoofed', () => clients.member.collection('audit_logs').create({
      id: recordId(), actor: records.member.id, actorName: 'Someone Else', action: 'test_action', summary: 'Denied', source: 'client', operationId: recordId()
    }));
    await expectRejected('Activity events cannot be edited', () => clients.member.collection('audit_logs').update(audit.id, { summary: 'Changed' }));
    await expectRejected('Activity events cannot be deleted', () => clients.admin.collection('audit_logs').delete(audit.id));

    const feedback = await clients.member.collection('feedback').create({
      id: recordId(), submitter: records.member.id, submitterName: records.member.name,
      type: 'support', content: `TEST GOVERNANCE support request ${suffix}`, status: 'new', response: '', assignedTo: ''
    });
    created.feedback.push(feedback.id);
    if ((await clients.member.collection('feedback').getList(1, 10)).totalItems !== 1) throw new Error('Submitter could not read feedback.');
    if ((await clients.other.collection('feedback').getList(1, 10)).totalItems !== 0) throw new Error('Another member could read feedback.');
    console.log('✓ Feedback is private to its submitter and authorized leadership');
    await expectRejected('Submitter cannot self-resolve feedback', () => clients.member.collection('feedback').update(feedback.id, { status: 'resolved' }));
    const reviewed = await clients.admin.collection('feedback').update(feedback.id, {
      status: 'resolved', response: 'Disposable test response.', assignedTo: records.admin.id, reviewedAt: new Date().toISOString()
    });
    if (reviewed.status !== 'resolved') throw new Error('Administrator review failed.');
    const memberCopy = await clients.member.collection('feedback').getOne(feedback.id);
    if (memberCopy.response !== 'Disposable test response.') throw new Error('Submitter could not read leadership response.');
    console.log('✓ Leadership can review and the submitter receives the response');
    await expectRejected('Feedback identity and content are immutable', () => clients.admin.collection('feedback').update(feedback.id, { content: 'Changed by reviewer' }));
    await expectRejected('Feedback cannot be hard-deleted', () => clients.admin.collection('feedback').delete(feedback.id));
    await expectRejected('Feedback submitter cannot be spoofed', () => clients.member.collection('feedback').create({
      id: recordId(), submitter: records.other.id, submitterName: records.member.name,
      type: 'support', content: 'TEST GOVERNANCE denied support request', status: 'new', response: '', assignedTo: ''
    }));
    const anonymous = new PocketBase(url);
    if ((await anonymous.collection('feedback').getList(1, 10)).totalItems !== 0 || (await anonymous.collection('audit_logs').getList(1, 10)).totalItems !== 0) {
      throw new Error('Anonymous client received governance records.');
    }
    console.log('✓ Anonymous clients receive no governance records');
  } finally {
    for (const id of created.feedback.reverse()) { try { await superuser.collection('feedback').delete(id); } catch { /* removed */ } }
    for (const id of created.audit_logs.reverse()) { try { await superuser.collection('audit_logs').delete(id); } catch { /* removed */ } }
    for (const id of created.users.reverse()) { try { await superuser.collection('users').delete(id); } catch { /* removed */ } }
    superuser.authStore.clear();
    console.log('✓ Disposable governance records removed and superuser token cleared');
  }

  console.log('\nAudit Logs and Feedback schema and live rule tests passed.');
}

main().catch((error) => {
  console.error('\nBootstrap failed:', error?.response ?? error);
  process.exitCode = 1;
});
