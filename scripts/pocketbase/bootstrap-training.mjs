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

async function getOrCreate(pb, collection, id, payload) {
  try { return await pb.collection(collection).getOne(id); } catch (error) { if (error?.status !== 404) throw error; }
  return pb.collection(collection).create({ id, ...payload });
}

async function removeMatching(pb, collection, filter) {
  const page = await pb.collection(collection).getList(1, 200, { filter });
  for (const record of page.items) await pb.collection(collection).delete(record.id);
}

async function removeStaleTests(pb) {
  const coursePage = await pb.collection('trainings').getList(1, 200, { filter: 'code ~ "TEST-ACADEMY-"' });
  for (const course of coursePage.items) {
    const sessionPage = await pb.collection('training_sessions').getList(1, 200, { filter: `training = "${course.id}"` });
    for (const session of sessionPage.items) await removeMatching(pb, 'training_attendance', `session = "${session.id}"`);
    await removeMatching(pb, 'training_certificates', `training = "${course.id}"`);
    await removeMatching(pb, 'training_enrollments', `training = "${course.id}"`);
    for (const session of sessionPage.items) await pb.collection('training_sessions').delete(session.id);
    await pb.collection('trainings').delete(course.id);
  }
  const users = await pb.collection('users').getList(1, 200, { filter: 'email ~ "academy-" && email ~ "@example.com"' });
  for (const user of users.items) {
    await removeMatching(pb, 'members', `user = "${user.id}"`);
    await pb.collection('users').delete(user.id);
  }
  if (coursePage.items.length || users.items.length) console.log('✓ Removed stale disposable Academy test data');
}

async function backfillCertificateAuthorities(pb) {
  const certificates = await pb.collection('training_certificates').getFullList({
    filter: 'status = "verified" && verifiedBy != "" && (verifierName = "" || verifierRole = "")'
  });
  for (const certificate of certificates) {
    const verifier = await pb.collection('users').getOne(certificate.verifiedBy);
    await pb.collection('training_certificates').update(certificate.id, {
      verifierName: verifier.name,
      verifierRole: verifier.role
    });
  }
  if (certificates.length) console.log(`✓ Backfilled authority identity on ${certificates.length} verified certificate${certificates.length === 1 ? '' : 's'}`);
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
  const members = await superuser.collections.getOne('members');

  const trainings = await reconcileCollection(superuser, {
    type: 'base', name: 'trainings',
    listRule: `${AUTHENTICATED} && (status != "draft" || ${MANAGER})`,
    viewRule: `${AUTHENTICATED} && (status != "draft" || ${MANAGER})`,
    createRule: `${AUTHENTICATED} && ${MANAGER}`, updateRule: `${AUTHENTICATED} && ${MANAGER}`, deleteRule: null,
    fields: [
      { name: 'code', type: 'text', required: true, max: 40 },
      { name: 'title', type: 'text', required: true, max: 180 },
      { name: 'description', type: 'text', max: 4000 }, { name: 'schedule', type: 'text', max: 240 },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['draft', 'upcoming', 'ongoing', 'completed'] },
      { name: 'startDate', type: 'date' }, { name: 'endDate', type: 'date' },
      { name: 'totalSessions', type: 'number', min: 1, max: 100, onlyInt: true },
      { name: 'requiredAttendanceRate', type: 'number', min: 0, max: 100, onlyInt: true },
      { name: 'maxEnrollment', type: 'number', min: 0, onlyInt: true },
      { name: 'startTime', type: 'text', max: 10 },
      { name: 'lateGraceMinutes', type: 'number', min: 0, max: 240, onlyInt: true },
      { name: 'createdBy', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }
    ],
    indexes: ['CREATE UNIQUE INDEX idx_trainings_code ON trainings (code)', 'CREATE INDEX idx_trainings_status_dates ON trainings (status, startDate, endDate)']
  });

  const sessions = await reconcileCollection(superuser, {
    type: 'base', name: 'training_sessions',
    listRule: `${AUTHENTICATED} && (training.status != "draft" || ${MANAGER})`,
    viewRule: `${AUTHENTICATED} && (training.status != "draft" || ${MANAGER})`,
    createRule: `${AUTHENTICATED} && ${MANAGER}`, updateRule: `${AUTHENTICATED} && ${MANAGER}`, deleteRule: null,
    fields: [
      { name: 'training', type: 'relation', required: true, collectionId: trainings.id, maxSelect: 1, cascadeDelete: false },
      { name: 'sessionNumber', type: 'number', required: true, min: 1, max: 100, onlyInt: true },
      { name: 'sessionDate', type: 'date', required: true }, { name: 'location', type: 'text', max: 240 },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['scheduled', 'completed', 'cancelled'] },
      { name: 'createdBy', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }
    ],
    indexes: ['CREATE UNIQUE INDEX idx_training_sessions_number ON training_sessions (training, sessionNumber)', 'CREATE INDEX idx_training_sessions_date ON training_sessions (sessionDate, status)']
  });

  const enrollments = await reconcileCollection(superuser, {
    type: 'base', name: 'training_enrollments',
    listRule: `${AUTHENTICATED} && (${MANAGER} || member.user = @request.auth.id)`,
    viewRule: `${AUTHENTICATED} && (${MANAGER} || member.user = @request.auth.id)`,
    createRule: `${AUTHENTICATED} && (${MANAGER} || (member.user = @request.auth.id && enrolledBy = @request.auth.id && status = "enrolled" && training.status != "draft" && training.status != "completed"))`,
    updateRule: `${AUTHENTICATED} && ${MANAGER} && @request.body.training:changed = false && @request.body.member:changed = false`, deleteRule: null,
    fields: [
      { name: 'training', type: 'relation', required: true, collectionId: trainings.id, maxSelect: 1, cascadeDelete: false },
      { name: 'member', type: 'relation', required: true, collectionId: members.id, maxSelect: 1, cascadeDelete: false },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['enrolled', 'withdrawn', 'completed'] },
      { name: 'enrolledAt', type: 'date', required: true },
      { name: 'enrolledBy', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }
    ],
    indexes: ['CREATE UNIQUE INDEX idx_training_enrollments_unique ON training_enrollments (training, member)', 'CREATE INDEX idx_training_enrollments_member_status ON training_enrollments (member, status)']
  });

  const attendance = await reconcileCollection(superuser, {
    type: 'base', name: 'training_attendance',
    listRule: `${AUTHENTICATED} && (${MANAGER} || member.user = @request.auth.id)`,
    viewRule: `${AUTHENTICATED} && (${MANAGER} || member.user = @request.auth.id)`,
    createRule: `${AUTHENTICATED} && ${MANAGER}`, updateRule: null, deleteRule: null,
    fields: [
      { name: 'operationId', type: 'text', required: true, max: 80 },
      { name: 'session', type: 'relation', required: true, collectionId: sessions.id, maxSelect: 1, cascadeDelete: false },
      { name: 'member', type: 'relation', required: true, collectionId: members.id, maxSelect: 1, cascadeDelete: false },
      { name: 'scannedAt', type: 'date', required: true },
      { name: 'timing', type: 'select', required: true, maxSelect: 1, values: ['on_time', 'late'] },
      { name: 'markedBy', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_training_attendance_operation ON training_attendance (operationId)',
      'CREATE UNIQUE INDEX idx_training_attendance_unique ON training_attendance (session, member)',
      'CREATE INDEX idx_training_attendance_member ON training_attendance (member, scannedAt)'
    ]
  });

  const certificates = await reconcileCollection(superuser, {
    type: 'base', name: 'training_certificates',
    listRule: `${AUTHENTICATED} && (${MANAGER} || member.user = @request.auth.id)`,
    viewRule: `${AUTHENTICATED} && (${MANAGER} || member.user = @request.auth.id)`,
    createRule: `${AUTHENTICATED} && requestedBy = @request.auth.id && ((@request.auth.role = "administrator" && status = "pending" && verifiedBy = "" && verifiedAt = "" && verifierName = "" && verifierRole = "") || (@request.auth.role = "lead_pastor" && status = "verified" && verifiedBy = @request.auth.id && verifiedAt != "" && verifierName = @request.auth.name && verifierRole = @request.auth.role))`,
    updateRule: `${AUTHENTICATED} && @request.auth.role = "lead_pastor" && status = "pending" && verifiedBy = "" && @request.body.status = "verified" && @request.body.verifiedBy = @request.auth.id && @request.body.verifiedAt != "" && @request.body.verifierName = @request.auth.name && @request.body.verifierRole = @request.auth.role && @request.body.training:changed = false && @request.body.member:changed = false && @request.body.certificateNumber:changed = false && @request.body.attendanceRate:changed = false && @request.body.issuedAt:changed = false && @request.body.requestedBy:changed = false`, deleteRule: null,
    fields: [
      { name: 'training', type: 'relation', required: true, collectionId: trainings.id, maxSelect: 1, cascadeDelete: false },
      { name: 'member', type: 'relation', required: true, collectionId: members.id, maxSelect: 1, cascadeDelete: false },
      { name: 'certificateNumber', type: 'text', required: true, max: 80 },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['pending', 'verified'] },
      { name: 'attendanceRate', type: 'number', min: 0, max: 100, onlyInt: true },
      { name: 'issuedAt', type: 'date', required: true },
      { name: 'requestedBy', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: 'verifiedBy', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: 'verifiedAt', type: 'date' },
      { name: 'verifierName', type: 'text', max: 120 },
      { name: 'verifierRole', type: 'text', max: 40 }
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_training_certificates_unique ON training_certificates (training, member)',
      'CREATE UNIQUE INDEX idx_training_certificates_number ON training_certificates (certificateNumber)',
      'CREATE INDEX idx_training_certificates_status ON training_certificates (status, issuedAt)'
    ]
  });

  await backfillCertificateAuthorities(superuser);

  await removeStaleTests(superuser);

  const suffix = Date.now().toString(36);
  const credentials = {
    admin: { email: `academy-admin-${suffix}@example.com`, role: 'administrator', password: temporaryPassword() },
    lead: { email: `academy-lead-${suffix}@example.com`, role: 'lead_pastor', password: temporaryPassword() },
    member: { email: `academy-member-${suffix}@example.com`, role: 'member', password: temporaryPassword() },
    other: { email: `academy-other-${suffix}@example.com`, role: 'member', password: temporaryPassword() }
  };
  const created = { users: [], members: [], trainings: [], training_sessions: [], training_enrollments: [], training_attendance: [], training_certificates: [] };

  try {
    const userRecords = {};
    for (const [key, item] of Object.entries(credentials)) {
      const record = await superuser.collection('users').create({
        id: recordId(), email: item.email, password: item.password, passwordConfirm: item.password,
        name: `Academy ${key}`, role: item.role, status: 'active', verified: true
      });
      userRecords[key] = record; created.users.push(record.id);
    }
    const appAdmin = new PocketBase(url); appAdmin.autoCancellation(false);
    await appAdmin.collection('users').authWithPassword(credentials.admin.email, credentials.admin.password);
    const profiles = {};
    for (const key of ['member', 'other']) {
      const profile = await appAdmin.collection('members').create({
        id: recordId(), user: userRecords[key].id, fullName: `Academy ${key}`,
        email: credentials[key].email, phone: key === 'member' ? '+254700000301' : '+254700000302',
        role: 'member', qrCode: `CC-ACADEMY-${key.toUpperCase()}-${suffix}`,
        avatarText: key === 'member' ? 'AM' : 'AO', status: 'active', deleted: false, createdBy: userRecords.admin.id
      });
      profiles[key] = profile; created.members.push(profile.id);
    }
    const now = new Date().toISOString();
    const course = await appAdmin.collection('trainings').create({
      id: recordId(), code: `TEST-ACADEMY-${suffix}`, title: `Academy Test ${suffix}`,
      description: 'Disposable integration test', schedule: 'Saturday 10:00', status: 'ongoing',
      startDate: now, endDate: new Date(Date.now() + 28 * 86400000).toISOString(), totalSessions: 4,
      requiredAttendanceRate: 80, maxEnrollment: 20, startTime: '10:00', lateGraceMinutes: 15, createdBy: userRecords.admin.id
    });
    created.trainings.push(course.id);
    const draft = await appAdmin.collection('trainings').create({
      id: recordId(), code: `TEST-ACADEMY-DRAFT-${suffix}`, title: `Academy Draft ${suffix}`,
      status: 'draft', totalSessions: 1, requiredAttendanceRate: 80, maxEnrollment: 0, createdBy: userRecords.admin.id
    });
    created.trainings.push(draft.id);
    const session = await appAdmin.collection('training_sessions').create({
      id: recordId(), training: course.id, sessionNumber: 1, sessionDate: now,
      location: 'Disposable Hall', status: 'scheduled', createdBy: userRecords.admin.id
    });
    created.training_sessions.push(session.id);
    const draftSession = await appAdmin.collection('training_sessions').create({
      id: recordId(), training: draft.id, sessionNumber: 1, sessionDate: now,
      location: 'Hidden Draft Hall', status: 'scheduled', createdBy: userRecords.admin.id
    });
    created.training_sessions.push(draftSession.id);
    console.log('✓ Administrator created published/draft courses and a session');

    const appMember = new PocketBase(url); appMember.autoCancellation(false);
    await appMember.collection('users').authWithPassword(credentials.member.email, credentials.member.password);
    await appMember.collection('trainings').getOne(course.id);
    await expectRejected('Draft courses are hidden from regular members', () => appMember.collection('trainings').getOne(draft.id));
    await expectRejected('Draft sessions are hidden from regular members', () => appMember.collection('training_sessions').getOne(draftSession.id));
    await expectRejected('Regular members cannot create courses', () => appMember.collection('trainings').create({ code: `DENIED-${suffix}`, title: 'Denied', status: 'ongoing', createdBy: userRecords.member.id }));
    const ownEnrollment = await appMember.collection('training_enrollments').create({
      id: recordId(), training: course.id, member: profiles.member.id,
      status: 'enrolled', enrolledAt: now, enrolledBy: userRecords.member.id
    });
    created.training_enrollments.push(ownEnrollment.id);
    console.log('✓ Regular member can read the catalog and enroll their own registry profile');
    await expectRejected('Member cannot enroll another registry profile', () => appMember.collection('training_enrollments').create({
      training: course.id, member: profiles.other.id, status: 'enrolled', enrolledAt: now, enrolledBy: userRecords.member.id
    }));
    await expectRejected('Member cannot record training attendance', () => appMember.collection('training_attendance').create({
      operationId: `denied-${suffix}`, session: session.id, member: profiles.member.id,
      scannedAt: now, timing: 'on_time', markedBy: userRecords.member.id
    }));

    const otherEnrollment = await appAdmin.collection('training_enrollments').create({
      id: recordId(), training: course.id, member: profiles.other.id,
      status: 'enrolled', enrolledAt: now, enrolledBy: userRecords.admin.id
    });
    created.training_enrollments.push(otherEnrollment.id);
    await expectRejected('Duplicate enrollment is rejected', () => appAdmin.collection('training_enrollments').create({
      training: course.id, member: profiles.member.id, status: 'enrolled', enrolledAt: now, enrolledBy: userRecords.admin.id
    }));

    const attendanceId = recordId();
    const attendancePayload = {
      operationId: `training-attendance-${attendanceId}`, session: session.id, member: profiles.member.id,
      scannedAt: now, timing: 'on_time', markedBy: userRecords.admin.id
    };
    const attendanceRecord = await getOrCreate(appAdmin, 'training_attendance', attendanceId, attendancePayload);
    created.training_attendance.push(attendanceRecord.id);
    const replay = await getOrCreate(appAdmin, 'training_attendance', attendanceId, attendancePayload);
    if (replay.id !== attendanceRecord.id) throw new Error('Attendance replay created a duplicate.');
    console.log('✓ Administrator recorded idempotent training attendance');
    await expectRejected('Confirmed attendance is append-only', () => appAdmin.collection('training_attendance').update(attendanceRecord.id, { timing: 'late' }));
    await expectRejected('Enrollment identity cannot be reassigned', () => appAdmin.collection('training_enrollments').update(ownEnrollment.id, { member: profiles.other.id }));

    const appOther = new PocketBase(url); await appOther.collection('users').authWithPassword(credentials.other.email, credentials.other.password);
    await expectRejected('Members cannot read another student’s enrollment', () => appOther.collection('training_enrollments').getOne(ownEnrollment.id));
    await expectRejected('Members cannot read another student’s attendance', () => appOther.collection('training_attendance').getOne(attendanceRecord.id));
    await expectRejected('Administrator cannot create an already-verified certificate', () => appAdmin.collection('training_certificates').create({
      training: course.id, member: profiles.other.id, certificateNumber: `CC-CERT-DENIED-${suffix}`,
      status: 'verified', attendanceRate: 100, issuedAt: now,
      requestedBy: userRecords.admin.id, verifiedBy: userRecords.admin.id, verifiedAt: now
    }));
    await expectRejected('Administrator cannot impersonate another certificate requester', () => appAdmin.collection('training_certificates').create({
      training: course.id, member: profiles.other.id, certificateNumber: `CC-CERT-SPOOF-${suffix}`,
      status: 'pending', attendanceRate: 100, issuedAt: now,
      requestedBy: userRecords.lead.id, verifiedBy: '', verifiedAt: '', verifierName: '', verifierRole: ''
    }));
    const certificate = await appAdmin.collection('training_certificates').create({
      id: recordId(), training: course.id, member: profiles.member.id,
      certificateNumber: `CC-CERT-TEST-${suffix}`, status: 'pending', attendanceRate: 100,
      issuedAt: now, requestedBy: userRecords.admin.id, verifiedBy: '', verifierName: '', verifierRole: ''
    });
    created.training_certificates.push(certificate.id);
    await expectRejected('Administrator cannot self-verify a pastoral certificate', () => appAdmin.collection('training_certificates').update(certificate.id, {
      status: 'verified', verifiedBy: userRecords.admin.id, verifiedAt: now
    }));
    const appLead = new PocketBase(url); await appLead.collection('users').authWithPassword(credentials.lead.email, credentials.lead.password);
    await expectRejected('Lead Pastor cannot attribute verification to another account', () => appLead.collection('training_certificates').update(certificate.id, {
      status: 'verified', verifiedBy: userRecords.admin.id, verifiedAt: now,
      verifierName: userRecords.lead.name, verifierRole: userRecords.lead.role
    }));
    await expectRejected('Lead Pastor cannot spoof the verifier display name', () => appLead.collection('training_certificates').update(certificate.id, {
      status: 'verified', verifiedBy: userRecords.lead.id, verifiedAt: now,
      verifierName: 'Different Pastor', verifierRole: userRecords.lead.role
    }));
    await appLead.collection('training_certificates').update(certificate.id, {
      status: 'verified', verifiedBy: userRecords.lead.id, verifiedAt: now,
      verifierName: userRecords.lead.name, verifierRole: userRecords.lead.role
    });
    await expectRejected('Verified certificate identity cannot be reassigned', () => appLead.collection('training_certificates').update(certificate.id, { member: profiles.other.id }));
    await expectRejected('Verified certificate authority fields are immutable', () => appLead.collection('training_certificates').update(certificate.id, { attendanceRate: 80 }));
    const ownCertificate = await appMember.collection('training_certificates').getOne(certificate.id);
    if (ownCertificate.status !== 'verified') throw new Error('Member could not read their verified certificate.');
    if (ownCertificate.verifiedBy !== userRecords.lead.id || ownCertificate.verifierName !== userRecords.lead.name || ownCertificate.verifierRole !== 'lead_pastor') throw new Error('Certificate verifier identity was not server-confirmed.');
    const directCertificate = await appLead.collection('training_certificates').create({
      id: recordId(), training: course.id, member: profiles.other.id,
      certificateNumber: `CC-CERT-DIRECT-${suffix}`, status: 'verified', attendanceRate: 100,
      issuedAt: now, requestedBy: userRecords.lead.id, verifiedBy: userRecords.lead.id, verifiedAt: now,
      verifierName: userRecords.lead.name, verifierRole: userRecords.lead.role
    });
    created.training_certificates.push(directCertificate.id);
    const directOwnCertificate = await appOther.collection('training_certificates').getOne(directCertificate.id);
    if (directOwnCertificate.verifierName !== userRecords.lead.name) throw new Error('Direct Lead Pastor issuance lost its authority identity.');
    console.log('✓ Lead Pastor direct issuance remains server-attributed and owner-readable');
    console.log('✓ Lead Pastor verification and member certificate visibility are enforced');
    await expectRejected('Client hard-delete is disabled', () => appAdmin.collection('trainings').delete(course.id));
  } finally {
    for (const collection of ['training_certificates', 'training_attendance', 'training_enrollments', 'training_sessions', 'trainings', 'members', 'users']) {
      for (const id of created[collection].reverse()) {
        try { await superuser.collection(collection).delete(id); } catch { /* Already removed. */ }
      }
    }
    superuser.authStore.clear();
    console.log('✓ Disposable Academy data removed and superuser token cleared');
  }

  if (!trainings.id || !sessions.id || !enrollments.id || !attendance.id || !certificates.id) throw new Error('Training bootstrap did not complete.');
  console.log('\nTraining Academy schema and live rule tests passed.');
}

main().catch((error) => {
  console.error('\nBootstrap failed:', {
    status: error?.status, message: error?.response?.message || error?.message || 'Unknown PocketBase error',
    fields: error?.response?.data ? Object.keys(error.response.data) : [],
    transport: error?.originalError?.cause?.code || error?.originalError?.message
  });
  process.exitCode = 1;
});
