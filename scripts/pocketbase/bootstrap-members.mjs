import { randomBytes } from 'node:crypto';
import process from 'node:process';
import PocketBase from 'pocketbase';

const APP_ROLES = [
  'lead_pastor', 'administrator', 'cell_leader', 'district_pastor',
  'department_head', 'member', 'guest'
];
const LEADERSHIP = '(@request.auth.role = "administrator" || @request.auth.role = "lead_pastor")';
const AUTHENTICATED = '@request.auth.id != ""';

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
        if (character === '\r' || character === '\n') {
          cleanup(); resolve(value); return;
        }
        if (character === '\u0003') {
          cleanup(); reject(new Error('Cancelled.')); return;
        }
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

async function ensureCollection(pb, schema) {
  try {
    const existing = await pb.collections.getOne(schema.name);
    if (existing.type !== schema.type) throw new Error(`${schema.name} has the wrong collection type.`);
    const managedIndexNames = (schema.indexes ?? [])
      .map((index) => index.match(/INDEX\s+`?([^`\s]+)`?/i)?.[1])
      .filter(Boolean);
    const preservedIndexes = (existing.indexes ?? []).filter(
      (index) => !managedIndexNames.some((name) => index.includes(name))
    );
    const updated = await pb.collections.update(existing.id, {
      listRule: schema.listRule,
      viewRule: schema.viewRule,
      createRule: schema.createRule,
      updateRule: schema.updateRule,
      deleteRule: schema.deleteRule,
      fields: mergeFields(existing.fields ?? [], schema.fields ?? []),
      indexes: [...preservedIndexes, ...(schema.indexes ?? [])]
    });
    console.log(`✓ ${schema.name} collection reconciled`);
    return updated;
  } catch (error) {
    if (error?.status !== 404) throw error;
    const created = await pb.collections.create(schema);
    console.log(`✓ ${schema.name} collection created`);
    return created;
  }
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
  const superuser = new PocketBase(url);
  superuser.autoCancellation(false);
  await superuser.collection('_superusers').authWithPassword(email, password);
  console.log('✓ Superuser authentication');

  const users = await superuser.collections.getOne('users');
  const commonRules = {
    listRule: AUTHENTICATED,
    viewRule: AUTHENTICATED,
    createRule: `${AUTHENTICATED} && ${LEADERSHIP}`,
    updateRule: `${AUTHENTICATED} && ${LEADERSHIP}`,
    deleteRule: `${AUTHENTICATED} && ${LEADERSHIP}`
  };

  const departments = await ensureCollection(superuser, {
    type: 'base', name: 'departments', ...commonRules,
    fields: [
      { name: 'name', type: 'text', required: true, max: 120 },
      { name: 'description', type: 'text', max: 500 },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['active', 'inactive'] }
    ],
    indexes: ['CREATE UNIQUE INDEX idx_departments_name ON departments (name)']
  });

  const sections = await ensureCollection(superuser, {
    type: 'base', name: 'sections', ...commonRules,
    fields: [
      { name: 'name', type: 'text', required: true, max: 120 },
      { name: 'code', type: 'text', max: 30 },
      { name: 'pastor', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['active', 'inactive'] }
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_sections_name ON sections (name)',
      'CREATE UNIQUE INDEX idx_sections_code ON sections (code) WHERE code != ""'
    ]
  });

  const cellGroups = await ensureCollection(superuser, {
    type: 'base', name: 'cell_groups', ...commonRules,
    fields: [
      { name: 'name', type: 'text', required: true, max: 120 },
      { name: 'leader', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: 'section', type: 'relation', collectionId: sections.id, maxSelect: 1, cascadeDelete: false },
      { name: 'meetingDay', type: 'select', maxSelect: 1, values: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
      { name: 'meetingTime', type: 'text', max: 10 },
      { name: 'location', type: 'text', max: 200 },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['active', 'inactive'] }
    ],
    indexes: ['CREATE UNIQUE INDEX idx_cell_groups_name ON cell_groups (name)']
  });

  const members = await ensureCollection(superuser, {
    type: 'base', name: 'members',
    listRule: `${AUTHENTICATED} && ((deleted = false && status = "active") || ${LEADERSHIP})`,
    viewRule: `${AUTHENTICATED} && ((deleted = false && status = "active") || ${LEADERSHIP})`,
    createRule: `${AUTHENTICATED} && ${LEADERSHIP}`,
    updateRule: `${AUTHENTICATED} && ${LEADERSHIP}`,
    deleteRule: null,
    fields: [
      { name: 'user', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: 'fullName', type: 'text', required: true, max: 160 },
      { name: 'email', type: 'email' },
      { name: 'phone', type: 'text', required: true, max: 40 },
      { name: 'role', type: 'select', required: true, maxSelect: 1, values: APP_ROLES },
      { name: 'departments', type: 'relation', collectionId: departments.id, maxSelect: 20, cascadeDelete: false },
      { name: 'cellGroup', type: 'relation', collectionId: cellGroups.id, maxSelect: 1, cascadeDelete: false },
      { name: 'section', type: 'relation', collectionId: sections.id, maxSelect: 1, cascadeDelete: false },
      { name: 'qrCode', type: 'text', required: true, max: 40 },
      { name: 'avatarText', type: 'text', max: 4 },
      { name: 'address', type: 'text', max: 240 },
      { name: 'dateOfBirth', type: 'date' },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['active', 'inactive'] },
      { name: 'deleted', type: 'bool' },
      { name: 'createdBy', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: false }
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_members_email ON members (email) WHERE email != ""',
      'CREATE UNIQUE INDEX idx_members_qr_code ON members (qrCode)',
      'CREATE INDEX idx_members_name ON members (fullName)',
      'CREATE INDEX idx_members_status ON members (status, deleted)'
    ]
  });

  const suffix = Date.now().toString(36);
  const adminEmail = `module2-admin-${suffix}@example.com`;
  const memberEmail = `module2-member-${suffix}@example.com`;
  const adminPassword = temporaryPassword();
  const memberPassword = temporaryPassword();
  const cleanup = [];

  try {
    const adminRecord = await superuser.collection('users').create({
      email: adminEmail, password: adminPassword, passwordConfirm: adminPassword,
      name: 'Module Two Admin', role: 'administrator', status: 'active', verified: true
    });
    cleanup.push(['users', adminRecord.id]);
    const memberRecord = await superuser.collection('users').create({
      email: memberEmail, password: memberPassword, passwordConfirm: memberPassword,
      name: 'Module Two Member', role: 'member', status: 'active', verified: true
    });
    cleanup.push(['users', memberRecord.id]);

    const appAdmin = new PocketBase(url);
    await appAdmin.collection('users').authWithPassword(adminEmail, adminPassword);
    const department = await appAdmin.collection('departments').create({ name: `Test Ministry ${suffix}`, status: 'active' });
    cleanup.push(['departments', department.id]);
    const section = await appAdmin.collection('sections').create({ name: `Test District ${suffix}`, code: `T${suffix.slice(-5)}`, status: 'active' });
    cleanup.push(['sections', section.id]);
    const cell = await appAdmin.collection('cell_groups').create({ name: `Test Cell ${suffix}`, section: section.id, meetingDay: 'Wednesday', meetingTime: '19:30', status: 'active' });
    cleanup.push(['cell_groups', cell.id]);
    const person = await appAdmin.collection('members').create({
      fullName: 'Module Two Registry Member', email: `registry-${suffix}@example.com`, phone: '+254700000000',
      role: 'member', departments: [department.id], cellGroup: cell.id, section: section.id,
      qrCode: `CC-TEST-${suffix}`, avatarText: 'MT', status: 'active', deleted: false, createdBy: adminRecord.id
    });
    cleanup.push(['members', person.id]);
    console.log('✓ Administrator created related member registry records');

    const anonymous = new PocketBase(url);
    const anonymousMembers = await anonymous.collection('members').getList(1, 10);
    if (anonymousMembers.totalItems !== 0) throw new Error('Anonymous members listing exposed data.');
    console.log('✓ Anonymous member listing exposes no records');

    const appMember = new PocketBase(url);
    await appMember.collection('users').authWithPassword(memberEmail, memberPassword);
    const visible = await appMember.collection('members').getOne(person.id, { expand: 'departments,cellGroup,section' });
    if (visible.id !== person.id) throw new Error('Authenticated member could not read active directory data.');
    console.log('✓ Authenticated member can read active directory records');
    await expectRejected('Regular member cannot create registry records', () => appMember.collection('members').create({ fullName: 'Denied', phone: '0', role: 'member', qrCode: `DENIED-${suffix}`, status: 'active' }));
    await expectRejected('Regular member cannot modify registry records', () => appMember.collection('members').update(person.id, { role: 'administrator' }));
    await expectRejected('Duplicate member email rejected', () => appAdmin.collection('members').create({ fullName: 'Duplicate', email: `registry-${suffix}@example.com`, phone: '0', role: 'member', qrCode: `DUP-${suffix}`, status: 'active' }));

    await appAdmin.collection('members').update(person.id, { status: 'inactive', deleted: true });
    await expectRejected('Inactive member hidden from regular directory', () => appMember.collection('members').getOne(person.id));
    const adminVisible = await appAdmin.collection('members').getOne(person.id);
    if (adminVisible.id !== person.id) throw new Error('Administrator could not inspect inactive record.');
    console.log('✓ Soft-deleted member hidden from members but visible to administrators');
  } finally {
    for (const [collection, id] of cleanup.reverse()) {
      try { await superuser.collection(collection).delete(id); } catch { /* already removed */ }
    }
    superuser.authStore.clear();
    console.log('✓ Disposable registry data removed and superuser token cleared');
  }

  if (!members?.id || !cellGroups?.id) throw new Error('Collection bootstrap did not complete.');
  console.log('\nModule 2 member registry schema and live rule tests passed.');
}

main().catch((error) => {
  console.error('\nBootstrap failed:', error?.response ?? error);
  process.exitCode = 1;
});
