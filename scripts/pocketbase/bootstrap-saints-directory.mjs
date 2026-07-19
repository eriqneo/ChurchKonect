import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import process from 'node:process';
import PocketBase from 'pocketbase';

const AUTHENTICATED = '@request.auth.id != ""';
const LEADERSHIP = '(@request.auth.role = "administrator" || @request.auth.role = "lead_pastor")';
const SCOPED_READER = '(user = @request.auth.id || (@request.auth.role = "cell_leader" && cellGroup.leader = @request.auth.id) || (@request.auth.role = "district_pastor" && section.pastor = @request.auth.id))';

const DIRECTORY_QUERY = `
  SELECT
    m.id AS id,
    m.user AS userId,
    m.fullName AS fullName,
    m.role AS role,
    m.avatarText AS avatarText,
    m.cellGroup AS cellGroup,
    COALESCE(cg.name, '') AS cellGroupName,
    m.section AS section,
    COALESCE(s.name, '') AS sectionName,
    COALESCE((SELECT group_concat(d.name, ', ') FROM departments d WHERE m.departments LIKE '%' || d.id || '%'), '') AS departmentNames,
    '' AS joinedAt
  FROM members m
  LEFT JOIN cell_groups cg ON cg.id = m.cellGroup
  LEFT JOIN sections s ON s.id = m.section
  LEFT JOIN user_preferences up ON up.user = m.user
  WHERE m.status = 'active' AND m.deleted = 0 AND COALESCE(up.directoryVisibility, 'listed') = 'listed'
`;

const CELL_COUNT_QUERY = `
  SELECT lower('c' || substr(cg.id, 1, 14)) AS id, 'cell' AS kind, cg.id AS targetId, COUNT(m.id) AS memberCount
  FROM cell_groups cg
  LEFT JOIN members m ON m.cellGroup = cg.id AND m.status = 'active' AND m.deleted = 0
  WHERE cg.status = 'active'
  GROUP BY cg.id
`;

const DEPARTMENT_COUNT_QUERY = `
  SELECT lower('d' || substr(d.id, 1, 14)) AS id, 'department' AS kind, d.id AS targetId, COUNT(m.id) AS memberCount
  FROM departments d
  LEFT JOIN members m ON m.status = 'active' AND m.deleted = 0 AND m.departments LIKE '%' || d.id || '%'
  WHERE d.status = 'active'
  GROUP BY d.id
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

async function reconcileView(pb, name, viewQuery) {
  const definition = { type: 'view', name, viewQuery, listRule: AUTHENTICATED, viewRule: AUTHENTICATED, createRule: null, updateRule: null, deleteRule: null };
  let existing;
  try { existing = await pb.collections.getOne(name); } catch (error) { if (error?.status !== 404) throw error; }
  const saved = existing ? await pb.collections.update(existing.id, definition) : await pb.collections.create(definition);
  console.log(`✓ ${name} privacy projection reconciled`);
  return saved;
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
  console.log(`✓ ${definition.name} schema and ownership rules reconciled`);
  return saved;
}

async function expectRejected(label, operation) {
  try { await operation(); } catch { console.log(`✓ ${label}`); return; }
  throw new Error(`${label}: expected rejection.`);
}

async function removeStaleTests(pb) {
  const users = await pb.collection('users').getList(1, 200, { filter: 'email ~ "directory-" && email ~ "@example.com"' });
  for (const user of users.items) {
    const profiles = await pb.collection('members').getList(1, 20, { filter: `user = "${user.id}"` });
    for (const profile of profiles.items) await pb.collection('members').delete(profile.id);
    try { await pb.collection('users').delete(user.id); } catch { /* removed */ }
  }
  for (const collection of ['cell_groups', 'sections', 'departments']) {
    const records = await pb.collection(collection).getList(1, 200, { filter: 'name ~ "Directory Test"' });
    for (const record of records.items) await pb.collection(collection).delete(record.id);
  }
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
  const members = await superuser.collections.getOne('members');
  const users = await superuser.collections.getOne('users');
  await superuser.collections.update(members.id, {
    listRule: `${AUTHENTICATED} && (${LEADERSHIP} || (deleted = false && status = "active" && ${SCOPED_READER}))`,
    viewRule: `${AUTHENTICATED} && (${LEADERSHIP} || (deleted = false && status = "active" && ${SCOPED_READER}))`,
    createRule: `${AUTHENTICATED} && ${LEADERSHIP}`,
    updateRule: `${AUTHENTICATED} && (${LEADERSHIP} || (user = @request.auth.id && @request.body.user:changed = false && @request.body.email:changed = false && @request.body.role:changed = false && @request.body.departments:changed = false && @request.body.cellGroup:changed = false && @request.body.section:changed = false && @request.body.qrCode:changed = false && @request.body.status:changed = false && @request.body.deleted:changed = false && @request.body.createdBy:changed = false))`,
    deleteRule: null
  });
  console.log('✓ Full member registry access tightened by ownership and ministry scope');
  await reconcileCollection(superuser, {
    type: 'base', name: 'user_preferences',
    listRule: `${AUTHENTICATED} && user = @request.auth.id`,
    viewRule: `${AUTHENTICATED} && user = @request.auth.id`,
    createRule: `${AUTHENTICATED} && user = @request.auth.id`,
    updateRule: `${AUTHENTICATED} && user = @request.auth.id && @request.body.user:changed = false`,
    deleteRule: null,
    fields: [
      { name: 'user', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { name: 'directoryVisibility', type: 'select', required: true, maxSelect: 1, values: ['listed', 'private'] }
    ],
    indexes: ['CREATE UNIQUE INDEX idx_user_preferences_user ON user_preferences (user)']
  });
  await reconcileView(superuser, 'saints_directory', DIRECTORY_QUERY);
  await reconcileView(superuser, 'saints_directory_cell_counts', CELL_COUNT_QUERY);
  await reconcileView(superuser, 'saints_directory_department_counts', DEPARTMENT_COUNT_QUERY);
  await removeStaleTests(superuser);

  const suffix = Date.now().toString(36);
  const credentials = {
    admin: { role: 'administrator', password: temporaryPassword() },
    member: { role: 'member', password: temporaryPassword() },
    other: { role: 'member', password: temporaryPassword() },
    leader: { role: 'cell_leader', password: temporaryPassword() }
  };
  const created = { users: [], members: [], departments: [], sections: [], cell_groups: [], user_preferences: [] };
  try {
    const records = {}; const clients = {};
    for (const [key, item] of Object.entries(credentials)) {
      item.email = `directory-${key}-${suffix}@example.com`;
      records[key] = await superuser.collection('users').create({
        id: recordId(), email: item.email, password: item.password, passwordConfirm: item.password,
        name: `Directory ${key}`, role: item.role, status: 'active', verified: true
      });
      created.users.push(records[key].id);
      clients[key] = new PocketBase(url); clients[key].autoCancellation(false);
      await clients[key].collection('users').authWithPassword(item.email, item.password);
    }

    const department = await clients.admin.collection('departments').create({ name: `Directory Test Ministry ${suffix}`, status: 'active' });
    const section = await clients.admin.collection('sections').create({ name: `Directory Test Section ${suffix}`, code: `D${suffix.slice(-6)}`, status: 'active' });
    const ownCell = await clients.admin.collection('cell_groups').create({ name: `Directory Test Cell ${suffix}`, leader: records.leader.id, section: section.id, status: 'active' });
    const otherCell = await clients.admin.collection('cell_groups').create({ name: `Directory Test Other ${suffix}`, leader: records.admin.id, section: section.id, status: 'active' });
    created.departments.push(department.id); created.sections.push(section.id); created.cell_groups.push(ownCell.id, otherCell.id);

    const profiles = {};
    for (const key of ['member', 'other', 'leader']) {
      profiles[key] = await clients.admin.collection('members').create({
        id: recordId(), user: records[key].id, fullName: `Directory ${key}`, email: credentials[key].email,
        phone: `+25470000${key === 'member' ? '0401' : key === 'other' ? '0402' : '0403'}`,
        role: credentials[key].role, departments: [department.id], cellGroup: key === 'other' ? otherCell.id : ownCell.id,
        section: section.id, qrCode: `CC-DIRECTORY-${key.toUpperCase()}-${suffix}`, avatarText: key.slice(0, 2).toUpperCase(),
        address: 'Private test address', dateOfBirth: '1990-01-01 00:00:00.000Z', status: 'active', deleted: false, createdBy: records.admin.id
      });
      created.members.push(profiles[key].id);
    }

    const directory = await clients.member.collection('saints_directory').getList(1, 100, { filter: `id = "${profiles.other.id}"` });
    if (directory.totalItems !== 1) throw new Error('Member could not read the directory projection.');
    const projected = directory.items[0];
    for (const privateField of ['email', 'phone', 'address', 'dateOfBirth', 'qrCode', 'createdBy']) {
      if (privateField in projected) throw new Error(`Directory leaked ${privateField}.`);
    }
    if (projected.cellGroupName !== otherCell.name || !String(projected.departmentNames).includes(department.name)) throw new Error('Directory placement projection failed.');
    console.log('✓ Authenticated directory exposes ministry placement without private registry fields');

    await expectRejected('Regular member cannot read another full registry profile', () => clients.member.collection('members').getOne(profiles.other.id));
    const ownProfile = await clients.member.collection('members').getOne(profiles.member.id);
    if (ownProfile.id !== profiles.member.id) throw new Error('Member could not read their own full profile.');
    const updatedOwn = await clients.member.collection('members').update(profiles.member.id, { phone: '+254700009999' });
    if (updatedOwn.phone !== '+254700009999') throw new Error('Member contact update failed.');
    const updatedIdentity = await clients.member.collection('users').update(records.member.id, {
      name: 'Directory member updated', avatarText: 'DU'
    });
    if (updatedIdentity.name !== 'Directory member updated') {
      throw new Error('Member login identity update failed.');
    }
    await expectRejected('Member email changes require a separate verified workflow', () => clients.member.collection('members').update(profiles.member.id, { email: `denied-${suffix}@example.com` }));
    await expectRejected('Member cannot change their registry role', () => clients.member.collection('members').update(profiles.member.id, { role: 'administrator' }));
    console.log('✓ Members can maintain linked profile and login details without changing placement or authority');

    const preference = await clients.member.collection('user_preferences').create({
      id: recordId(), user: records.member.id, directoryVisibility: 'listed'
    });
    created.user_preferences.push(preference.id);
    await expectRejected('Member cannot create preferences for another account', () => clients.member.collection('user_preferences').create({
      user: records.other.id, directoryVisibility: 'private'
    }));
    await expectRejected('Member cannot read another account preferences', () => clients.other.collection('user_preferences').getOne(preference.id));
    await clients.member.collection('user_preferences').update(preference.id, { directoryVisibility: 'private' });
    if ((await clients.other.collection('saints_directory').getList(1, 20, { filter: `id = "${profiles.member.id}"` })).totalItems !== 0) {
      throw new Error('Private member remained in the Saints Directory projection.');
    }
    if (!(await clients.admin.collection('members').getOne(profiles.member.id))) throw new Error('Directory privacy incorrectly blocked authorized registry operations.');
    await expectRejected('Preference ownership cannot be reassigned', () => clients.member.collection('user_preferences').update(preference.id, { user: records.other.id }));
    await expectRejected('Client hard-delete of preferences is disabled', () => clients.member.collection('user_preferences').delete(preference.id));
    await clients.member.collection('user_preferences').update(preference.id, { directoryVisibility: 'listed' });
    if ((await clients.other.collection('saints_directory').getList(1, 20, { filter: `id = "${profiles.member.id}"` })).totalItems !== 1) {
      throw new Error('Relisted member did not return to the Saints Directory projection.');
    }
    console.log('✓ Account-owned privacy preference hides directory listing without blocking authorized registry work');

    const leaderRoster = await clients.leader.collection('members').getList(1, 20);
    if (!leaderRoster.items.some((item) => item.id === profiles.member.id) || leaderRoster.items.some((item) => item.id === profiles.other.id)) {
      throw new Error('Cell leader roster scope failed.');
    }
    console.log('✓ Cell leader full-registry access is limited to their own fellowship roster');

    if (!(await clients.admin.collection('members').getOne(profiles.other.id))) throw new Error('Administrator registry access failed.');
    const [cellCounts, departmentCounts] = await Promise.all([
      clients.member.collection('saints_directory_cell_counts').getList(1, 100),
      clients.member.collection('saints_directory_department_counts').getList(1, 100)
    ]);
    const cellCount = cellCounts.items.find((item) => item.targetId === ownCell.id);
    const departmentCount = departmentCounts.items.find((item) => item.targetId === department.id);
    if (Number(cellCount?.memberCount) !== 2 || Number(departmentCount?.memberCount) !== 3) throw new Error('Directory aggregate counts failed.');
    console.log('✓ Cell and ministry member counts are server-derived');

    const anonymous = new PocketBase(url);
    if ((await anonymous.collection('saints_directory').getList(1, 10)).totalItems !== 0) throw new Error('Anonymous directory access exposed records.');
    await expectRejected('Directory projections reject client writes', () => clients.admin.collection('saints_directory').create({ fullName: 'Denied' }));
    await clients.admin.collection('members').update(profiles.other.id, { status: 'inactive', deleted: true });
    if ((await clients.member.collection('saints_directory').getList(1, 10, { filter: `id = "${profiles.other.id}"` })).totalItems !== 0) throw new Error('Inactive profile remained in directory.');
    console.log('✓ Anonymous access, client writes, and inactive directory rows are blocked');
  } finally {
    for (const collection of ['user_preferences', 'members', 'cell_groups', 'sections', 'departments', 'users']) {
      for (const id of created[collection].reverse()) {
        try { await superuser.collection(collection).delete(id); } catch { /* removed */ }
      }
    }
    superuser.authStore.clear();
    console.log('✓ Disposable directory records removed and superuser token cleared');
  }

  console.log('\nSaints Directory schema and live privacy tests passed.');
}

main().catch((error) => {
  console.error('\nBootstrap failed:', error?.response ?? error);
  process.exitCode = 1;
});
