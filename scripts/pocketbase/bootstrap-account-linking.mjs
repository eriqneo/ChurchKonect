import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import process from 'node:process';
import PocketBase from 'pocketbase';

const AUTHENTICATED = '@request.auth.id != ""';
const LEADERSHIP = '(@request.auth.role = "administrator" || @request.auth.role = "lead_pastor")';
const SCOPED_READER = '(user = @request.auth.id || (@request.auth.role = "cell_leader" && cellGroup.leader = @request.auth.id) || (@request.auth.role = "district_pastor" && section.pastor = @request.auth.id))';
const PROTECTED_LEADERSHIP_TARGET = '(@request.auth.role = "lead_pastor" || (role != "administrator" && role != "lead_pastor"))';
const PROTECTED_ROLE_CHANGE = '(@request.auth.role = "lead_pastor" || (@request.body.role:changed = false || (@request.body.role != "administrator" && @request.body.role != "lead_pastor")))';
const MATCHING_REQUESTED_ACCOUNT = '(@collection.users.id ?= @request.body.user && @collection.users.email ?= email && @collection.users.role ?= role && @collection.users.status ?= "active")';
const SAFE_ACCOUNT_TRANSITION = `((user = "" && (@request.body.user:changed = false || (@request.body.email:changed = false && @request.body.role:changed = false && @request.body.user != "" && ${MATCHING_REQUESTED_ACCOUNT}))) || (user != "" && @request.body.email:changed = false && @request.body.role:changed = false && (@request.body.user:changed = false || @request.body.user = "")))`;

const MEMBER_LIST_RULE = `${AUTHENTICATED} && (${LEADERSHIP} || (deleted = false && status = "active" && ${SCOPED_READER}))`;
const MEMBER_CREATE_RULE = `${AUTHENTICATED} && ${LEADERSHIP} && ${PROTECTED_LEADERSHIP_TARGET} && (user = "" || (user.email = email && user.role = role))`;
const MEMBER_UPDATE_RULE = `${AUTHENTICATED} && ((${LEADERSHIP} && ${PROTECTED_LEADERSHIP_TARGET} && ${PROTECTED_ROLE_CHANGE} && ${SAFE_ACCOUNT_TRANSITION}) || (user = @request.auth.id && @request.body.user:changed = false && @request.body.email:changed = false && @request.body.role:changed = false && @request.body.departments:changed = false && @request.body.cellGroup:changed = false && @request.body.section:changed = false && @request.body.qrCode:changed = false && @request.body.status:changed = false && @request.body.deleted:changed = false && @request.body.createdBy:changed = false))`;
const ACCOUNT_RULE = `${AUTHENTICATED} && ${LEADERSHIP}`;
const ACCOUNT_QUERY = `
  SELECT
    u.id AS id,
    u.id AS userId,
    u.name AS name,
    u.email AS email,
    u.role AS role,
    u.status AS status,
    COALESCE(m.id, '') AS memberId,
    COALESCE(m.fullName, '') AS memberName
  FROM users u
  LEFT JOIN members m ON m.user = u.id
  WHERE u.status = 'active' OR m.id IS NOT NULL
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

async function assertNoDuplicateLinks(pb) {
  const linked = await pb.collection('members').getFullList({ filter: 'user != ""', fields: 'id,user,fullName' });
  const owners = new Map();
  for (const member of linked) {
    if (owners.has(member.user)) {
      throw new Error(`Account ${member.user} is already linked to both ${owners.get(member.user)} and ${member.fullName}. Resolve duplicate links before reconciliation.`);
    }
    owners.set(member.user, member.fullName);
  }
}

async function reconcileSchema(pb) {
  const members = await pb.collections.getOne('members');
  await assertNoDuplicateLinks(pb);
  const preservedIndexes = (members.indexes ?? []).filter((index) => !index.includes('idx_members_user'));
  await pb.collections.update(members.id, {
    listRule: MEMBER_LIST_RULE,
    viewRule: MEMBER_LIST_RULE,
    createRule: MEMBER_CREATE_RULE,
    updateRule: MEMBER_UPDATE_RULE,
    deleteRule: null,
    indexes: [...preservedIndexes, 'CREATE UNIQUE INDEX idx_members_user ON members (user) WHERE user != ""']
  });
  console.log('✓ Member account-link integrity rules reconciled');

  const definition = {
    type: 'view', name: 'member_account_directory', viewQuery: ACCOUNT_QUERY,
    listRule: ACCOUNT_RULE, viewRule: ACCOUNT_RULE, createRule: null, updateRule: null, deleteRule: null
  };
  let existing;
  try { existing = await pb.collections.getOne(definition.name); } catch (error) { if (error?.status !== 404) throw error; }
  if (existing) await pb.collections.update(existing.id, definition);
  else await pb.collections.create(definition);
  console.log('✓ Leadership-only account directory reconciled');
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
  await reconcileSchema(superuser);

  const created = { users: [], members: [] };
  const suffix = Date.now().toString(36);
  const credentials = {
    admin: { email: `links-admin-${suffix}@example.com`, password: temporaryPassword(), role: 'administrator' },
    target: { email: `links-target-${suffix}@example.com`, password: temporaryPassword(), role: 'member' },
    other: { email: `links-other-${suffix}@example.com`, password: temporaryPassword(), role: 'member' }
  };

  try {
    const users = {};
    for (const [key, item] of Object.entries(credentials)) {
      users[key] = await superuser.collection('users').create({
        id: recordId(), email: item.email, password: item.password, passwordConfirm: item.password,
        name: `Link Test ${key}`, role: item.role, status: 'active', verified: true
      });
      created.users.push(users[key].id);
    }

    const clients = {};
    for (const [key, item] of Object.entries(credentials)) {
      clients[key] = new PocketBase(url);
      clients[key].autoCancellation(false);
      await clients[key].collection('users').authWithPassword(item.email, item.password);
    }

    const profile = await clients.admin.collection('members').create({
      fullName: 'Link Test Member', email: credentials.target.email, phone: '+254700001001', role: 'member',
      qrCode: `CC-LINK-${suffix}`, avatarText: 'LT', status: 'active', deleted: false, createdBy: users.admin.id
    });
    created.members.push(profile.id);
    const secondProfile = await clients.admin.collection('members').create({
      fullName: 'Link Test Second', email: credentials.other.email, phone: '+254700001002', role: 'member',
      qrCode: `CC-LINK2-${suffix}`, avatarText: 'LS', status: 'active', deleted: false, createdBy: users.admin.id
    });
    created.members.push(secondProfile.id);
    await expectRejected('Mismatched account cannot be linked during enrollment', () => clients.admin.collection('members').create({
      user: users.other.id, fullName: 'Link Test Invalid', email: credentials.target.email, phone: '+254700001003', role: 'member',
      qrCode: `CC-LINK3-${suffix}`, avatarText: 'LI', status: 'active', deleted: false, createdBy: users.admin.id
    }));

    const accounts = await clients.admin.collection('member_account_directory').getFullList({ sort: 'name' });
    if (!accounts.some((account) => account.userId === users.target.id && !account.memberId)) throw new Error('Eligible unlinked account was not projected.');
    console.log('✓ Administrator can see account link status');
    await expectRejected('Regular member cannot inspect account directory', () => clients.target.collection('member_account_directory').getOne(users.admin.id));

    await clients.admin.collection('members').update(profile.id, { user: users.target.id });
    const linked = await clients.admin.collection('members').getOne(profile.id);
    if (linked.user !== users.target.id) throw new Error('Matching account was not linked.');
    console.log('✓ Matching email and role account linked');

    await expectRejected('One login cannot link to two profiles', () => clients.admin.collection('members').update(secondProfile.id, { user: users.target.id }));
    await expectRejected('Mismatched email account cannot be linked', () => clients.admin.collection('members').update(profile.id, { user: users.other.id }));
    await expectRejected('Linked registry email cannot drift from login email', () => clients.admin.collection('members').update(profile.id, { email: `changed-${suffix}@example.com` }));
    await expectRejected('Linked registry role cannot drift from login role', () => clients.admin.collection('members').update(profile.id, { role: 'cell_leader' }));
    await expectRejected('Administrator cannot assign protected administrator role', () => clients.admin.collection('members').update(secondProfile.id, { role: 'administrator' }));

    await clients.admin.collection('members').update(profile.id, { user: '' });
    if ((await clients.admin.collection('members').getOne(profile.id)).user) throw new Error('Account unlink did not persist.');
    console.log('✓ Authorized unlink succeeds without deleting either record');

    const anonymous = new PocketBase(url);
    if ((await anonymous.collection('member_account_directory').getList(1, 10)).totalItems !== 0) throw new Error('Anonymous account directory listing exposed rows.');
    console.log('✓ Anonymous account directory listing exposes no rows');
  } finally {
    for (const id of created.members.reverse()) { try { await superuser.collection('members').delete(id); } catch { /* Already removed. */ } }
    for (const id of created.users.reverse()) { try { await superuser.collection('users').delete(id); } catch { /* Already removed. */ } }
    superuser.authStore.clear();
    console.log('✓ Disposable account-linking data removed and superuser token cleared');
  }

  console.log('\nMember account-linking schema and live rule tests passed.');
}

main().catch((error) => {
  console.error('\nBootstrap failed:', error?.response ?? error);
  process.exitCode = 1;
});
