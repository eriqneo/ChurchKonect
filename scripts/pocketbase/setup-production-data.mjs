import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import process from 'node:process';
import PocketBase from 'pocketbase';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ROLES = new Set(['lead_pastor', 'administrator', 'cell_leader', 'district_pastor', 'department_head', 'member', 'guest']);
const WEEKDAYS = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);

function argument(name, fallback = '') {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
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

function curlFetch(input, init = {}) {
  return new Promise((resolvePromise, reject) => {
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
      resolvePromise(new Response(status === 204 || status === 205 ? null : responseBody, { status, headers: { 'content-type': 'application/json' } }));
    });
    if (body === undefined || body === null) child.stdin.end();
    else if (typeof body === 'string' || body instanceof Uint8Array) child.stdin.end(body);
    else child.stdin.end(String(body));
  });
}

function temporaryPassword() {
  return `Cc!${randomBytes(18).toString('base64url')}`;
}

function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 4) || 'CC';
}

function dateForPocketBase(value) {
  if (!value) return '';
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value} 00:00:00.000Z` : String(value);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueKey(label, value, errors) {
  const key = text(value).toLowerCase();
  if (!key) errors.push(`${label} is required.`);
  return key;
}

function assertUnique(rows, label, keyFn, errors) {
  const seen = new Map();
  for (const [index, row] of rows.entries()) {
    const key = keyFn(row, index);
    if (!key) continue;
    if (seen.has(key)) errors.push(`${label} "${key}" appears more than once in the file.`);
    seen.set(key, index);
  }
}

function validate(data) {
  const errors = [];
  for (const [index, user] of array(data.users).entries()) {
    uniqueKey(`users[${index}].email`, user.email, errors);
    if (!text(user.name)) errors.push(`users[${index}].name is required.`);
    if (!ROLES.has(user.role)) errors.push(`users[${index}].role must be a valid app role.`);
  }
  for (const [index, department] of array(data.departments).entries()) {
    uniqueKey(`departments[${index}].name`, department.name, errors);
  }
  for (const [index, section] of array(data.sections).entries()) {
    uniqueKey(`sections[${index}].name`, section.name, errors);
    if (section.code && !/^[a-z0-9_-]+$/i.test(section.code)) errors.push(`sections[${index}].code should contain letters, numbers, hyphen, or underscore.`);
  }
  for (const [index, cell] of array(data.cells).entries()) {
    uniqueKey(`cells[${index}].name`, cell.name, errors);
    const day = text(cell.meetingDay || data.setup?.defaultMeetingDay);
    if (day && !WEEKDAYS.has(day)) errors.push(`cells[${index}].meetingDay must be a weekday.`);
  }
  for (const [index, member] of array(data.members).entries()) {
    if (!text(member.fullName)) errors.push(`members[${index}].fullName is required.`);
    if (!text(member.phone || data.setup?.defaultMemberPhone)) errors.push(`members[${index}].phone is required.`);
    if (!ROLES.has(member.role || 'member')) errors.push(`members[${index}].role must be a valid app role.`);
    uniqueKey(`members[${index}].qrCode`, member.qrCode, errors);
  }
  for (const [index, training] of array(data.trainings).entries()) {
    uniqueKey(`trainings[${index}].code`, training.code, errors);
    if (!text(training.title)) errors.push(`trainings[${index}].title is required.`);
    for (const session of array(training.sessions)) {
      if (!Number.isInteger(Number(session.sessionNumber)) || Number(session.sessionNumber) < 1) {
        errors.push(`training ${training.code} has a session without a valid sessionNumber.`);
      }
      if (!text(session.sessionDate)) errors.push(`training ${training.code} session ${session.sessionNumber} needs sessionDate.`);
    }
  }
  assertUnique(array(data.users), 'User email', (row) => text(row.email).toLowerCase(), errors);
  assertUnique(array(data.departments), 'Department name', (row) => text(row.name).toLowerCase(), errors);
  assertUnique(array(data.sections), 'Section code', (row) => text(row.code || row.name).toLowerCase(), errors);
  assertUnique(array(data.cells), 'Cell name', (row) => text(row.name).toLowerCase(), errors);
  assertUnique(array(data.members), 'Member QR code', (row) => text(row.qrCode).toLowerCase(), errors);
  assertUnique(array(data.trainings), 'Training code', (row) => text(row.code).toLowerCase(), errors);
  return errors;
}

async function findFirst(pb, collection, filter) {
  try {
    return await pb.collection(collection).getFirstListItem(filter);
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
}

function quote(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function relation(map, key, label) {
  const normalized = text(key).toLowerCase();
  if (!normalized) return '';
  const record = map.get(normalized);
  if (!record) throw new Error(`${label} "${key}" was referenced but not found in the setup file or PocketBase.`);
  return record.id;
}

function optionalRelation(map, key, currentValue = '') {
  const normalized = text(key).toLowerCase();
  if (!normalized) return currentValue || '';
  return map.get(normalized)?.id || currentValue || '';
}

function upsertLabel(existing, collection, label) {
  return `${existing ? 'update' : 'create'} ${collection}: ${label}`;
}

class Reconciler {
  constructor(pb, dryRun) {
    this.pb = pb;
    this.dryRun = dryRun;
    this.plan = [];
    this.generatedCredentials = [];
  }

  log(existing, collection, label) {
    const action = upsertLabel(existing, collection, label);
    this.plan.push(action);
    console.log(`${this.dryRun ? '• would ' : '✓ '}${action}`);
  }

  async save(collection, existing, payload, label) {
    this.log(existing, collection, label);
    if (this.dryRun) return existing || { id: `dry-${collection}-${this.plan.length}`, ...payload };
    return existing
      ? this.pb.collection(collection).update(existing.id, payload)
      : this.pb.collection(collection).create(payload);
  }
}

async function loadExisting(pb, collection, keyField, rows, rowKey) {
  const result = new Map();
  for (const row of rows) {
    const key = text(rowKey(row));
    if (!key) continue;
    const existing = await findFirst(pb, collection, `${keyField} = "${quote(key)}"`);
    if (existing) result.set(key.toLowerCase(), existing);
  }
  return result;
}

async function reconcileUsers(reconciler, data) {
  const users = array(data.users);
  const existing = await loadExisting(reconciler.pb, 'users', 'email', users, (row) => row.email);
  const byEmail = new Map(existing);
  for (const user of users) {
    const email = text(user.email).toLowerCase();
    const found = byEmail.get(email);
    const payload = {
      email,
      name: text(user.name),
      role: user.role,
      avatarText: text(user.avatarText) || initials(user.name),
      department: text(user.department),
      status: text(user.status) || 'active',
      verified: user.verified !== false
    };
    if (!found && user.createLogin !== false) {
      const password = text(user.password) || temporaryPassword();
      payload.password = password;
      payload.passwordConfirm = password;
      reconciler.generatedCredentials.push({ email, name: payload.name, role: payload.role, temporaryPassword: password });
    }
    const saved = await reconciler.save('users', found, payload, email);
    byEmail.set(email, saved);
  }
  return byEmail;
}

async function reconcileDepartments(reconciler, data, usersByEmail, membersByKey, known = new Map()) {
  const rows = array(data.departments);
  const existing = await loadExisting(reconciler.pb, 'departments', 'name', rows, (row) => row.name);
  for (const [key, value] of known.entries()) existing.set(key, value);
  const byName = new Map(existing);
  for (const department of rows) {
    const name = text(department.name);
    const found = byName.get(name.toLowerCase());
    const payload = {
      name,
      description: text(department.description),
      head: optionalRelation(usersByEmail, department.headEmail, found?.head),
      headMember: optionalRelation(membersByKey, department.headMemberQr, found?.headMember),
      status: text(department.status) || 'active'
    };
    const saved = await reconciler.save('departments', found, payload, name);
    byName.set(name.toLowerCase(), saved);
  }
  return byName;
}

async function reconcileSections(reconciler, data, usersByEmail, membersByKey, known = new Map()) {
  const rows = array(data.sections);
  const existing = new Map(known);
  for (const section of rows) {
    const code = text(section.code);
    const found = code
      ? await findFirst(reconciler.pb, 'sections', `code = "${quote(code)}"`)
      : await findFirst(reconciler.pb, 'sections', `name = "${quote(text(section.name))}"`);
    if (found) existing.set(text(code || section.name).toLowerCase(), found);
  }
  const byKey = new Map(existing);
  for (const section of rows) {
    const name = text(section.name);
    const code = text(section.code);
    const key = text(code || name).toLowerCase();
    const found = byKey.get(key);
    const payload = {
      name,
      code,
      pastor: optionalRelation(usersByEmail, section.pastorEmail, found?.pastor),
      pastorMember: optionalRelation(membersByKey, section.pastorMemberQr, found?.pastorMember),
      status: text(section.status) || 'active'
    };
    const saved = await reconciler.save('sections', found, payload, code || name);
    byKey.set(key, saved);
    byKey.set(name.toLowerCase(), saved);
  }
  return byKey;
}

async function reconcileCells(reconciler, data, usersByEmail, membersByKey, sectionsByKey, known = new Map()) {
  const rows = array(data.cells);
  const existing = await loadExisting(reconciler.pb, 'cell_groups', 'name', rows, (row) => row.name);
  for (const [key, value] of known.entries()) existing.set(key, value);
  const byName = new Map(existing);
  for (const cell of rows) {
    const name = text(cell.name);
    const found = byName.get(name.toLowerCase());
    const sectionKey = text(cell.sectionCode || cell.sectionName);
    const payload = {
      name,
      leader: optionalRelation(usersByEmail, cell.leaderEmail, found?.leader),
      leaderMember: optionalRelation(membersByKey, cell.leaderMemberQr, found?.leaderMember),
      section: sectionKey ? relation(sectionsByKey, sectionKey, 'Cell section') : '',
      meetingDay: text(cell.meetingDay || data.setup?.defaultMeetingDay),
      meetingTime: text(cell.meetingTime || data.setup?.defaultMeetingTime),
      location: text(cell.location),
      status: text(cell.status) || 'active'
    };
    const saved = await reconciler.save('cell_groups', found, payload, name);
    byName.set(name.toLowerCase(), saved);
  }
  return byName;
}

async function reconcileMembers(reconciler, data, usersByEmail, departmentsByName, sectionsByKey, cellsByName) {
  const rows = array(data.members);
  const existing = new Map();
  for (const member of rows) {
    const qr = text(member.qrCode);
    const found = await findFirst(reconciler.pb, 'members', `qrCode = "${quote(qr)}"`);
    if (found) existing.set(qr.toLowerCase(), found);
  }
  const byKey = new Map(existing);
  const createdByEmail = text(data.setup?.createdByEmail || array(data.users).find((user) => ['administrator', 'lead_pastor'].includes(user.role))?.email);
  const createdBy = relation(usersByEmail, createdByEmail, 'setup.createdByEmail');
  for (const member of rows) {
    const qrCode = text(member.qrCode);
    const found = byKey.get(qrCode.toLowerCase());
    const departmentIds = array(member.departments).map((name) => relation(departmentsByName, name, 'Member department'));
    const sectionKey = text(member.sectionCode || member.sectionName);
    const cellName = text(member.cellGroup || member.cellGroupName);
    const userId = member.userEmail ? relation(usersByEmail, member.userEmail, 'Member user email') : found?.user || '';
    const payload = {
      user: userId,
      fullName: text(member.fullName),
      email: text(member.email).toLowerCase(),
      phone: text(member.phone || data.setup?.defaultMemberPhone),
      role: member.role || 'member',
      departments: departmentIds,
      cellGroup: cellName ? relation(cellsByName, cellName, 'Member cell group') : '',
      section: sectionKey ? relation(sectionsByKey, sectionKey, 'Member section') : '',
      qrCode,
      avatarText: text(member.avatarText) || initials(member.fullName),
      address: text(member.address),
      dateOfBirth: dateForPocketBase(member.dateOfBirth),
      status: text(member.status) || 'active',
      deleted: Boolean(member.deleted),
      createdBy
    };
    const saved = await reconciler.save('members', found, payload, member.fullName);
    byKey.set(qrCode.toLowerCase(), saved);
    if (payload.email) byKey.set(payload.email, saved);
  }
  return byKey;
}

async function reconcileTrainings(reconciler, data, usersByEmail) {
  const rows = array(data.trainings);
  const existing = await loadExisting(reconciler.pb, 'trainings', 'code', rows, (row) => row.code);
  const byCode = new Map(existing);
  const createdByEmail = text(data.setup?.createdByEmail || array(data.users).find((user) => ['administrator', 'lead_pastor'].includes(user.role))?.email);
  const createdBy = relation(usersByEmail, createdByEmail, 'setup.createdByEmail');
  for (const training of rows) {
    const code = text(training.code);
    const found = byCode.get(code.toLowerCase());
    const sessions = array(training.sessions);
    const payload = {
      code,
      title: text(training.title),
      description: text(training.description),
      schedule: text(training.schedule),
      status: text(training.status) || 'upcoming',
      startDate: dateForPocketBase(training.startDate),
      endDate: dateForPocketBase(training.endDate),
      totalSessions: Number(training.totalSessions || sessions.length || 1),
      requiredAttendanceRate: Number(training.requiredAttendanceRate || 80),
      maxEnrollment: Number(training.maxEnrollment || 0),
      startTime: text(training.startTime),
      lateGraceMinutes: Number(training.lateGraceMinutes || 0),
      createdBy
    };
    const savedTraining = await reconciler.save('trainings', found, payload, code);
    byCode.set(code.toLowerCase(), savedTraining);
    for (const session of sessions) {
      const sessionNumber = Number(session.sessionNumber);
      const existingSession = await findFirst(reconciler.pb, 'training_sessions', `training = "${savedTraining.id}" && sessionNumber = ${sessionNumber}`);
      await reconciler.save('training_sessions', existingSession, {
        training: savedTraining.id,
        sessionNumber,
        sessionDate: dateForPocketBase(session.sessionDate),
        location: text(session.location),
        status: text(session.status) || 'scheduled',
        createdBy
      }, `${code} session ${sessionNumber}`);
    }
  }
  return byCode;
}

function writeCredentials(credentials) {
  if (!credentials.length) return '';
  const output = argument('credentials-out', resolve('/tmp', `churchconnect-production-credentials-${Date.now()}.json`));
  writeFileSync(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), accounts: credentials }, null, 2)}\n`, { mode: 0o600 });
  try { chmodSync(output, 0o600); } catch { /* best effort on platforms without chmod */ }
  return output;
}

async function main() {
  const file = resolve(ROOT, argument('file', 'data/production/church-data.json'));
  const apply = hasFlag('apply');
  const dryRun = !apply;
  const email = argument('email');
  const url = argument('url', 'https://churchconnect.pockethost.io').replace(/\/$/, '');
  if (!email) throw new Error('Pass --email=YOUR_SUPERUSER_EMAIL.');
  if (hasFlag('transport') || argument('transport') === 'curl') globalThis.fetch = curlFetch;

  const data = JSON.parse(readFileSync(file, 'utf8'));
  const errors = validate(data);
  if (errors.length) {
    console.error('Production data file has validation errors:');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  const password = await hiddenQuestion('PocketBase superuser password: ');
  const pb = new PocketBase(url);
  pb.autoCancellation(false);
  await pb.collection('_superusers').authWithPassword(email, password);
  console.log(`✓ Superuser authenticated for ${dryRun ? 'dry-run' : 'apply'} mode`);

  const reconciler = new Reconciler(pb, dryRun);
  const usersByEmail = await reconcileUsers(reconciler, data);
  let membersByKey = new Map();
  const departmentsByName = await reconcileDepartments(reconciler, data, usersByEmail, membersByKey);
  const sectionsByKey = await reconcileSections(reconciler, data, usersByEmail, membersByKey);
  const cellsByName = await reconcileCells(reconciler, data, usersByEmail, membersByKey, sectionsByKey);
  membersByKey = await reconcileMembers(reconciler, data, usersByEmail, departmentsByName, sectionsByKey, cellsByName);
  await reconcileDepartments(reconciler, data, usersByEmail, membersByKey, departmentsByName);
  await reconcileSections(reconciler, data, usersByEmail, membersByKey, sectionsByKey);
  await reconcileCells(reconciler, data, usersByEmail, membersByKey, sectionsByKey, cellsByName);
  await reconcileTrainings(reconciler, data, usersByEmail);

  if (dryRun) {
    console.log(`\nDry run complete: ${reconciler.plan.length} planned upserts. Re-run with --apply to write them.`);
  } else {
    const credentialPath = writeCredentials(reconciler.generatedCredentials);
    if (credentialPath) console.log(`\nTemporary account passwords were written to ${credentialPath}`);
    console.log(`Production data setup complete: ${reconciler.plan.length} upserts applied.`);
  }
  pb.authStore.clear();
}

main().catch((error) => {
  console.error('\nProduction data setup failed:', error?.response ?? error);
  process.exitCode = 1;
});
