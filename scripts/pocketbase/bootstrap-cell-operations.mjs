import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import process from 'node:process';
import PocketBase from 'pocketbase';

const AUTHENTICATED = '@request.auth.id != ""';
const LEADERSHIP = '(@request.auth.role = "administrator" || @request.auth.role = "lead_pastor")';
const PASTORAL_READ = `(${LEADERSHIP} || @request.auth.role = "district_pastor")`;

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
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\n');
    };
    const onData = (chunk) => {
      for (const character of String(chunk)) {
        if (character === '\r' || character === '\n') { cleanup(); resolve(value); return; }
        if (character === '\u0003') { cleanup(); reject(new Error('Cancelled.')); return; }
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else value += character;
      }
    };
    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
  });
}

function temporaryPassword() {
  return `Cc!${randomBytes(18).toString('base64url')}`;
}

function curlFetch(input, init = {}) {
  return new Promise((resolve, reject) => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const method = init.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET');
    const headers = new Headers(init.headers || (typeof input === 'object' && 'headers' in input ? input.headers : undefined));
    const body = init.body;
    const marker = `__CHURCHCONNECT_STATUS_${randomBytes(8).toString('hex')}__`;
    const args = [
      '--silent', '--show-error', '--location', '--connect-timeout', '10', '--max-time', '30',
      '--request', method, '--url', url,
      '--write-out', `\n${marker}%{http_code}`
    ];
    for (const [name, value] of headers.entries()) args.push('--header', `${name}: ${value}`);
    if (body !== undefined && body !== null) args.push('--data-binary', '@-');
    const child = spawn('curl', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new TypeError(Buffer.concat(stderr).toString('utf8').trim() || `curl exited with ${code}`));
        return;
      }
      const result = Buffer.concat(stdout).toString('utf8');
      const markerIndex = result.lastIndexOf(`\n${marker}`);
      if (markerIndex < 0) { reject(new TypeError('curl response status marker was missing.')); return; }
      const responseBody = result.slice(0, markerIndex);
      const status = Number(result.slice(markerIndex + marker.length + 1));
      resolve(new Response(status === 204 || status === 205 ? null : responseBody, { status, headers: { 'content-type': 'application/json' } }));
    });
    child.stdin.on('error', () => undefined);
    if (body === undefined || body === null) child.stdin.end();
    else if (typeof body === 'string' || body instanceof Uint8Array) child.stdin.end(body);
    else child.stdin.end(String(body));
  });
}

function recordId() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(randomBytes(15), (value) => alphabet[value % alphabet.length]).join('');
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
  try { existing = await pb.collections.getOne(definition.name); } catch (error) {
    if (error?.status !== 404) throw error;
  }
  const payload = existing
    ? { ...definition, fields: mergeFields(existing.fields ?? [], definition.fields) }
    : definition;
  const saved = existing
    ? await pb.collections.update(existing.id, payload)
    : await pb.collections.create(payload);
  console.log(`✓ ${definition.name} schema and rules reconciled`);
  return saved;
}

async function expectRejected(label, operation) {
  try { await operation(); } catch { console.log(`✓ ${label}`); return; }
  throw new Error(`${label}: expected rejection.`);
}

async function getOrCreate(pb, collection, id, payload) {
  try { return await pb.collection(collection).getOne(id); } catch (error) {
    if (error?.status !== 404) throw error;
  }
  return pb.collection(collection).create({ id, ...payload });
}

async function removeStaleTestData(pb) {
  const testUsers = await pb.collection('users').getFullList({ filter: 'email ~ "ops-" && email ~ "@example.com"' });
  if (!testUsers.length) return;
  const removeMatching = async (collection, filter) => {
    const records = await pb.collection(collection).getFullList({ filter });
    for (const record of records) await pb.collection(collection).delete(record.id);
  };
  for (const user of testUsers) {
    await removeMatching('cell_reports', `submittedBy = "${user.id}"`);
    await removeMatching('cell_attendance', `markedBy = "${user.id}"`);
    await removeMatching('cell_visitors', `createdBy = "${user.id}"`);
    await removeMatching('cell_meetings', `createdBy = "${user.id}"`);
    await removeMatching('members', `user = "${user.id}"`);
    await removeMatching('cell_groups', `leader = "${user.id}"`);
  }
  await removeMatching('sections', 'name ~ "Operations Section"');
  for (const user of testUsers) await pb.collection('users').delete(user.id);
  console.log(`✓ Removed ${testUsers.length} stale disposable test users and related records`);
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

  const users = await superuser.collections.getOne('users');
  console.log('✓ Users collection inspected');
  const members = await superuser.collections.getOne('members');
  console.log('✓ Members collection inspected');
  const cellGroups = await superuser.collections.getOne('cell_groups');
  console.log('✓ Cell groups collection inspected');

  const meetings = await reconcileCollection(superuser, {
    type: 'base', name: 'cell_meetings',
    listRule: `${AUTHENTICATED} && (${PASTORAL_READ} || cellGroup.leader = @request.auth.id)`,
    viewRule: `${AUTHENTICATED} && (${PASTORAL_READ} || cellGroup.leader = @request.auth.id)`,
    createRule: `${AUTHENTICATED} && ((${LEADERSHIP}) || (cellGroup.leader = @request.auth.id && createdBy = @request.auth.id))`,
    updateRule: `${AUTHENTICATED} && ((${LEADERSHIP}) || (cellGroup.leader = @request.auth.id && createdBy = @request.auth.id && @request.body.cellGroup:changed = false && @request.body.createdBy:changed = false))`,
    deleteRule: null,
    fields: [
      { name: 'operationId', type: 'text', required: true, max: 80 },
      { name: 'cellGroup', type: 'relation', required: true, collectionId: cellGroups.id, maxSelect: 1, cascadeDelete: false },
      { name: 'meetingDate', type: 'date', required: true },
      { name: 'startedAt', type: 'date', required: true },
      { name: 'endedAt', type: 'date' },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['scheduled', 'active', 'completed'] },
      { name: 'createdBy', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_cell_meetings_operation ON cell_meetings (operationId)',
      'CREATE INDEX idx_cell_meetings_group_date ON cell_meetings (cellGroup, meetingDate)',
      'CREATE UNIQUE INDEX idx_cell_meetings_one_active ON cell_meetings (cellGroup) WHERE status = "active"'
    ]
  });

  const visitors = await reconcileCollection(superuser, {
    type: 'base', name: 'cell_visitors',
    listRule: `${AUTHENTICATED} && (${PASTORAL_READ} || cellGroup.leader = @request.auth.id)`,
    viewRule: `${AUTHENTICATED} && (${PASTORAL_READ} || cellGroup.leader = @request.auth.id)`,
    createRule: `${AUTHENTICATED} && ((${LEADERSHIP}) || (cellGroup.leader = @request.auth.id && createdBy = @request.auth.id))`,
    updateRule: `${AUTHENTICATED} && ((${LEADERSHIP}) || (cellGroup.leader = @request.auth.id && createdBy = @request.auth.id && @request.body.cellGroup:changed = false && @request.body.meeting:changed = false && @request.body.createdBy:changed = false))`,
    deleteRule: null,
    fields: [
      { name: 'operationId', type: 'text', required: true, max: 80 },
      { name: 'meeting', type: 'relation', required: true, collectionId: meetings.id, maxSelect: 1, cascadeDelete: false },
      { name: 'cellGroup', type: 'relation', required: true, collectionId: cellGroups.id, maxSelect: 1, cascadeDelete: false },
      { name: 'fullName', type: 'text', required: true, max: 160 },
      { name: 'phone', type: 'text', max: 40 },
      { name: 'followUpStatus', type: 'select', required: true, maxSelect: 1, values: ['new', 'contacted', 'connected'] },
      { name: 'createdBy', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_cell_visitors_operation ON cell_visitors (operationId)',
      'CREATE INDEX idx_cell_visitors_meeting ON cell_visitors (meeting)',
      'CREATE INDEX idx_cell_visitors_group ON cell_visitors (cellGroup)'
    ]
  });

  const attendance = await reconcileCollection(superuser, {
    type: 'base', name: 'cell_attendance',
    listRule: `${AUTHENTICATED} && (${PASTORAL_READ} || meeting.cellGroup.leader = @request.auth.id)`,
    viewRule: `${AUTHENTICATED} && (${PASTORAL_READ} || meeting.cellGroup.leader = @request.auth.id)`,
    createRule: `${AUTHENTICATED} && ((${LEADERSHIP}) || (meeting.cellGroup.leader = @request.auth.id && markedBy = @request.auth.id))`,
    updateRule: `${AUTHENTICATED} && ((${LEADERSHIP}) || (meeting.cellGroup.leader = @request.auth.id && markedBy = @request.auth.id && @request.body.meeting:changed = false && @request.body.member:changed = false && @request.body.visitor:changed = false && @request.body.markedBy:changed = false))`,
    deleteRule: null,
    fields: [
      { name: 'operationId', type: 'text', required: true, max: 80 },
      { name: 'meeting', type: 'relation', required: true, collectionId: meetings.id, maxSelect: 1, cascadeDelete: false },
      { name: 'member', type: 'relation', collectionId: members.id, maxSelect: 1, cascadeDelete: false },
      { name: 'visitor', type: 'relation', collectionId: visitors.id, maxSelect: 1, cascadeDelete: false },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['present', 'absent', 'excused'] },
      { name: 'markedBy', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_cell_attendance_operation ON cell_attendance (operationId)',
      'CREATE UNIQUE INDEX idx_cell_attendance_member ON cell_attendance (meeting, member) WHERE member != ""',
      'CREATE UNIQUE INDEX idx_cell_attendance_visitor ON cell_attendance (meeting, visitor) WHERE visitor != ""',
      'CREATE INDEX idx_cell_attendance_meeting ON cell_attendance (meeting)'
    ]
  });

  const reports = await reconcileCollection(superuser, {
    type: 'base', name: 'cell_reports',
    listRule: `${AUTHENTICATED} && (${PASTORAL_READ} || cellGroup.leader = @request.auth.id)`,
    viewRule: `${AUTHENTICATED} && (${PASTORAL_READ} || cellGroup.leader = @request.auth.id)`,
    createRule: `${AUTHENTICATED} && ((${LEADERSHIP}) || (cellGroup.leader = @request.auth.id && submittedBy = @request.auth.id && reportStatus = "pending_review"))`,
    updateRule: `${AUTHENTICATED} && (${LEADERSHIP})`,
    deleteRule: null,
    fields: [
      { name: 'operationId', type: 'text', required: true, max: 80 },
      { name: 'meeting', type: 'relation', required: true, collectionId: meetings.id, maxSelect: 1, cascadeDelete: false },
      { name: 'cellGroup', type: 'relation', required: true, collectionId: cellGroups.id, maxSelect: 1, cascadeDelete: false },
      { name: 'highlights', type: 'text', required: true, max: 4000 },
      { name: 'challenges', type: 'text', max: 4000 },
      { name: 'reportStatus', type: 'select', required: true, maxSelect: 1, values: ['pending_review', 'approved', 'rejected'] },
      { name: 'submittedBy', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: 'submittedAt', type: 'date', required: true },
      { name: 'attendanceCount', type: 'number', min: 0, onlyInt: true },
      { name: 'excusedCount', type: 'number', min: 0, onlyInt: true },
      { name: 'absentCount', type: 'number', min: 0, onlyInt: true },
      { name: 'visitorCount', type: 'number', min: 0, onlyInt: true },
      { name: 'reviewedBy', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: 'reviewedAt', type: 'date' },
      { name: 'reviewNotes', type: 'text', max: 2000 }
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_cell_reports_operation ON cell_reports (operationId)',
      'CREATE UNIQUE INDEX idx_cell_reports_meeting ON cell_reports (meeting)',
      'CREATE INDEX idx_cell_reports_group_status ON cell_reports (cellGroup, reportStatus)'
    ]
  });

  await removeStaleTestData(superuser);

  const suffix = Date.now().toString(36);
  const credentials = {
    admin: { email: `ops-admin-${suffix}@example.com`, password: temporaryPassword(), role: 'administrator' },
    leader: { email: `ops-leader-${suffix}@example.com`, password: temporaryPassword(), role: 'cell_leader' },
    otherLeader: { email: `ops-other-${suffix}@example.com`, password: temporaryPassword(), role: 'cell_leader' },
    member: { email: `ops-member-${suffix}@example.com`, password: temporaryPassword(), role: 'member' }
  };
  const created = { users: [], members: [], sections: [], cell_groups: [], cell_meetings: [], cell_visitors: [], cell_attendance: [], cell_reports: [] };

  try {
    const userRecords = {};
    for (const [key, item] of Object.entries(credentials)) {
      const record = await superuser.collection('users').create({
        email: item.email, password: item.password, passwordConfirm: item.password,
        name: `Operations ${key}`, role: item.role, status: 'active', verified: true
      });
      userRecords[key] = record;
      created.users.push(record.id);
    }

    const appAdmin = new PocketBase(url);
    appAdmin.autoCancellation(false);
    await appAdmin.collection('users').authWithPassword(credentials.admin.email, credentials.admin.password);
    for (const key of ['leader', 'member']) {
      const profile = await appAdmin.collection('members').create({
        user: userRecords[key].id, fullName: `Operations ${key}`, email: credentials[key].email,
        phone: key === 'leader' ? '+254700000201' : '+254700000202', role: credentials[key].role,
        qrCode: `CC-OPS-${key.toUpperCase()}-${suffix}`, avatarText: key === 'leader' ? 'OL' : 'OM',
        status: 'active', deleted: false, createdBy: userRecords.admin.id
      });
      created.members.push(profile.id);
    }
    const section = await appAdmin.collection('sections').create({ name: `Operations Section ${suffix}`, code: `O${suffix.slice(-6)}`, status: 'active' });
    created.sections.push(section.id);
    const ownCell = await appAdmin.collection('cell_groups').create({
      name: `Operations Cell ${suffix}`, leader: userRecords.leader.id, section: section.id,
      meetingDay: 'Wednesday', meetingTime: '19:00', location: 'Disposable test', status: 'active'
    });
    created.cell_groups.push(ownCell.id);
    const otherCell = await appAdmin.collection('cell_groups').create({
      name: `Operations Other ${suffix}`, leader: userRecords.otherLeader.id, section: section.id,
      meetingDay: 'Thursday', meetingTime: '19:00', location: 'Disposable test', status: 'active'
    });
    created.cell_groups.push(otherCell.id);

    const appLeader = new PocketBase(url);
    appLeader.autoCancellation(false);
    await appLeader.collection('users').authWithPassword(credentials.leader.email, credentials.leader.password);
    const meetingId = recordId();
    const operationId = `start-${meetingId}`;
    const startedAt = new Date().toISOString();
    const meeting = await getOrCreate(appLeader, 'cell_meetings', meetingId, {
      operationId, cellGroup: ownCell.id, meetingDate: startedAt, startedAt,
      status: 'active', createdBy: userRecords.leader.id
    });
    created.cell_meetings.push(meeting.id);
    const replay = await getOrCreate(appLeader, 'cell_meetings', meetingId, { operationId });
    if (replay.id !== meeting.id) throw new Error('Idempotent meeting replay created a duplicate.');
    console.log('✓ Assigned leader created and idempotently replayed a meeting');

    const memberProfileId = created.members[1];
    const attendanceRecord = await appLeader.collection('cell_attendance').create({
      id: recordId(), operationId: `attendance-${meetingId}`, meeting: meeting.id,
      member: memberProfileId, status: 'present', markedBy: userRecords.leader.id
    });
    created.cell_attendance.push(attendanceRecord.id);
    const visitorRecord = await appLeader.collection('cell_visitors').create({
      id: recordId(), operationId: `visitor-${meetingId}`, meeting: meeting.id, cellGroup: ownCell.id,
      fullName: 'Disposable Visitor', phone: '+254700000203', followUpStatus: 'new', createdBy: userRecords.leader.id
    });
    created.cell_visitors.push(visitorRecord.id);
    const visitorAttendance = await appLeader.collection('cell_attendance').create({
      id: recordId(), operationId: `visitor-attendance-${meetingId}`, meeting: meeting.id,
      visitor: visitorRecord.id, status: 'present', markedBy: userRecords.leader.id
    });
    created.cell_attendance.push(visitorAttendance.id);
    const reportRecord = await appLeader.collection('cell_reports').create({
      id: recordId(), operationId: `report-${meetingId}`, meeting: meeting.id, cellGroup: ownCell.id,
      highlights: 'Disposable live integration test', challenges: '', reportStatus: 'pending_review',
      submittedBy: userRecords.leader.id, submittedAt: new Date().toISOString(), attendanceCount: 2,
      excusedCount: 0, absentCount: 0, visitorCount: 1
    });
    created.cell_reports.push(reportRecord.id);
    await appLeader.collection('cell_meetings').update(meeting.id, { status: 'completed', endedAt: new Date().toISOString() });
    console.log('✓ Leader recorded member attendance, visitor attendance, and submitted a report');

    const appMember = new PocketBase(url);
    await appMember.collection('users').authWithPassword(credentials.member.email, credentials.member.password);
    await expectRejected('Regular member cannot read operational attendance', () => appMember.collection('cell_attendance').getOne(attendanceRecord.id));
    await expectRejected('Regular member cannot create meetings', () => appMember.collection('cell_meetings').create({
      operationId: `denied-${suffix}`, cellGroup: ownCell.id, meetingDate: startedAt, startedAt,
      status: 'active', createdBy: userRecords.member.id
    }));
    await expectRejected('Leader cannot operate another leader’s cell', () => appLeader.collection('cell_meetings').create({
      operationId: `cross-${suffix}`, cellGroup: otherCell.id, meetingDate: startedAt, startedAt,
      status: 'active', createdBy: userRecords.leader.id
    }));
    await expectRejected('Leader cannot approve own report', () => appLeader.collection('cell_reports').update(reportRecord.id, { reportStatus: 'approved' }));
    await appAdmin.collection('cell_reports').update(reportRecord.id, {
      reportStatus: 'approved', reviewedBy: userRecords.admin.id, reviewedAt: new Date().toISOString(), reviewNotes: 'Live rule test'
    });
    console.log('✓ Leadership review is enforced server-side');
    await expectRejected('Client hard-delete is disabled', () => appAdmin.collection('cell_reports').delete(reportRecord.id));
  } finally {
    for (const collection of ['cell_reports', 'cell_attendance', 'cell_visitors', 'cell_meetings', 'members', 'cell_groups', 'sections', 'users']) {
      for (const id of created[collection].reverse()) {
        try { await superuser.collection(collection).delete(id); } catch { /* Already removed. */ }
      }
    }
    superuser.authStore.clear();
    console.log('✓ Disposable operations data removed and superuser token cleared');
  }

  if (!meetings.id || !visitors.id || !attendance.id || !reports.id) throw new Error('Operations bootstrap did not complete.');
  console.log('\nCell operations schema and live rule tests passed.');
}

main().catch((error) => {
  console.error('\nBootstrap failed:', {
    status: error?.status,
    message: error?.response?.message || error?.message || 'Unknown PocketBase error',
    fields: error?.response?.data ? Object.keys(error.response.data) : [],
    transport: error?.originalError?.cause?.code || error?.originalError?.message
  });
  process.exitCode = 1;
});
