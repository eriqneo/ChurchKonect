import { randomBytes } from 'node:crypto';
import process from 'node:process';
import PocketBase from 'pocketbase';

const AUTHENTICATED = '@request.auth.id != ""';
const LEADERSHIP = '(@request.auth.role = "administrator" || @request.auth.role = "lead_pastor")';
const ACTIVE_READ = `${AUTHENTICATED} && (status = "active" || ${LEADERSHIP})`;
const LEADERSHIP_WRITE = `${AUTHENTICATED} && ${LEADERSHIP}`;

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

async function reconcileCollection(pb, name, fields, indexes) {
  const existing = await pb.collections.getOne(name);
  const managedNames = indexes.map((index) => index.match(/INDEX\s+`?([^`\s]+)`?/i)?.[1]).filter(Boolean);
  const preserved = (existing.indexes ?? []).filter((index) => !managedNames.some((managed) => index.includes(managed)));
  const updated = await pb.collections.update(existing.id, {
    listRule: ACTIVE_READ,
    viewRule: ACTIVE_READ,
    createRule: LEADERSHIP_WRITE,
    updateRule: LEADERSHIP_WRITE,
    deleteRule: null,
    fields: mergeFields(existing.fields ?? [], fields),
    indexes: [...preserved, ...indexes]
  });
  console.log(`✓ ${name} schema and rules reconciled`);
  return updated;
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
  const members = await superuser.collections.getOne('members');
  const departments = await reconcileCollection(superuser, 'departments', [
    { name: 'name', type: 'text', required: true, max: 120 },
    { name: 'description', type: 'text', max: 500 },
    { name: 'head', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
    { name: 'headMember', type: 'relation', collectionId: members.id, maxSelect: 1, cascadeDelete: false },
    { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['active', 'inactive'] }
  ], [
    'CREATE UNIQUE INDEX idx_departments_name ON departments (name)',
    'CREATE INDEX idx_departments_status ON departments (status)'
  ]);
  const sections = await reconcileCollection(superuser, 'sections', [
    { name: 'name', type: 'text', required: true, max: 120 },
    { name: 'code', type: 'text', max: 30 },
    { name: 'pastor', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
    { name: 'pastorMember', type: 'relation', collectionId: members.id, maxSelect: 1, cascadeDelete: false },
    { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['active', 'inactive'] }
  ], [
    'CREATE UNIQUE INDEX idx_sections_name ON sections (name)',
    'CREATE UNIQUE INDEX idx_sections_code ON sections (code) WHERE code != ""',
    'CREATE INDEX idx_sections_status ON sections (status)'
  ]);
  const cellGroups = await reconcileCollection(superuser, 'cell_groups', [
    { name: 'name', type: 'text', required: true, max: 120 },
    { name: 'leader', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
    { name: 'leaderMember', type: 'relation', collectionId: members.id, maxSelect: 1, cascadeDelete: false },
    { name: 'section', type: 'relation', collectionId: sections.id, maxSelect: 1, cascadeDelete: false },
    { name: 'meetingDay', type: 'select', maxSelect: 1, values: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
    { name: 'meetingTime', type: 'text', max: 10 },
    { name: 'location', type: 'text', max: 200 },
    { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['active', 'inactive'] }
  ], [
    'CREATE UNIQUE INDEX idx_cell_groups_name ON cell_groups (name)',
    'CREATE INDEX idx_cell_groups_status ON cell_groups (status)',
    'CREATE INDEX idx_cell_groups_leader ON cell_groups (leader)',
    'CREATE INDEX idx_cell_groups_section ON cell_groups (section)'
  ]);

  const suffix = Date.now().toString(36);
  const adminEmail = `structure-admin-${suffix}@example.com`;
  const leaderEmail = `structure-leader-${suffix}@example.com`;
  const memberEmail = `structure-member-${suffix}@example.com`;
  const adminPassword = temporaryPassword();
  const leaderPassword = temporaryPassword();
  const memberPassword = temporaryPassword();
  const created = { users: [], members: [], departments: [], sections: [], cell_groups: [] };

  try {
    const adminUser = await superuser.collection('users').create({
      email: adminEmail, password: adminPassword, passwordConfirm: adminPassword,
      name: 'Structure Admin', role: 'administrator', status: 'active', verified: true
    });
    created.users.push(adminUser.id);
    const leaderUser = await superuser.collection('users').create({
      email: leaderEmail, password: leaderPassword, passwordConfirm: leaderPassword,
      name: 'Structure Cell Leader', role: 'cell_leader', status: 'active', verified: true
    });
    created.users.push(leaderUser.id);
    const memberUser = await superuser.collection('users').create({
      email: memberEmail, password: memberPassword, passwordConfirm: memberPassword,
      name: 'Structure Member', role: 'member', status: 'active', verified: true
    });
    created.users.push(memberUser.id);

    const appAdmin = new PocketBase(url);
    await appAdmin.collection('users').authWithPassword(adminEmail, adminPassword);
    const leaderProfile = await appAdmin.collection('members').create({
      user: leaderUser.id, fullName: 'Structure Cell Leader', email: leaderEmail,
      phone: '+254700000101', role: 'cell_leader', qrCode: `CC-LEADER-${suffix}`,
      avatarText: 'SL', status: 'active', deleted: false, createdBy: adminUser.id
    });
    created.members.push(leaderProfile.id);
    const memberProfile = await appAdmin.collection('members').create({
      user: memberUser.id, fullName: 'Structure Member', email: memberEmail,
      phone: '+254700000102', role: 'member', qrCode: `CC-MEMBER-${suffix}`,
      avatarText: 'SM', status: 'active', deleted: false, createdBy: adminUser.id
    });
    created.members.push(memberProfile.id);

    const department = await appAdmin.collection('departments').create({
      name: `Structure Ministry ${suffix}`, description: 'Disposable rule test',
      head: leaderUser.id, headMember: leaderProfile.id, status: 'active'
    });
    created.departments.push(department.id);
    const section = await appAdmin.collection('sections').create({
      name: `Structure Section ${suffix}`, code: `S${suffix.slice(-6)}`,
      pastor: leaderUser.id, pastorMember: leaderProfile.id, status: 'active'
    });
    created.sections.push(section.id);
    const cell = await appAdmin.collection('cell_groups').create({
      name: `Structure Cell ${suffix}`, leader: leaderUser.id, leaderMember: leaderProfile.id,
      section: section.id, meetingDay: 'Wednesday', meetingTime: '19:30',
      location: 'Disposable test location', status: 'active'
    });
    created.cell_groups.push(cell.id);
    await appAdmin.collection('members').update(memberProfile.id, { cellGroup: cell.id, section: section.id });
    console.log('✓ Administrator created structures and assigned a member');

    const appMember = new PocketBase(url);
    await appMember.collection('users').authWithPassword(memberEmail, memberPassword);
    const visibleCell = await appMember.collection('cell_groups').getOne(cell.id, { expand: 'leaderMember,section' });
    if (visibleCell.expand?.leaderMember?.fullName !== 'Structure Cell Leader') {
      throw new Error('Leader display relation was not visible to a regular member.');
    }
    console.log('✓ Regular member can read active structure and leader display data');
    await expectRejected('Regular member cannot create cell groups', () => appMember.collection('cell_groups').create({ name: `Denied ${suffix}`, status: 'active' }));
    await expectRejected('Regular member cannot edit cell groups', () => appMember.collection('cell_groups').update(cell.id, { name: 'Denied edit' }));
    await expectRejected('Regular member cannot assign registry members', () => appMember.collection('members').update(memberProfile.id, { cellGroup: '' }));
    await expectRejected('Duplicate cell-group name rejected', () => appAdmin.collection('cell_groups').create({ name: `Structure Cell ${suffix}`, status: 'active' }));
    await expectRejected('Client hard-delete is disabled', () => appAdmin.collection('cell_groups').delete(cell.id));

    await appAdmin.collection('cell_groups').update(cell.id, { status: 'inactive' });
    await expectRejected('Inactive cell hidden from regular members', () => appMember.collection('cell_groups').getOne(cell.id));
    const adminVisible = await appAdmin.collection('cell_groups').getOne(cell.id);
    if (adminVisible.id !== cell.id) throw new Error('Administrator could not inspect inactive cell.');
    console.log('✓ Inactive structures are hidden from members and retained for administrators');
  } finally {
    for (const collection of ['members', 'cell_groups', 'sections', 'departments', 'users']) {
      for (const id of created[collection].reverse()) {
        try { await superuser.collection(collection).delete(id); } catch { /* Already removed. */ }
      }
    }
    superuser.authStore.clear();
    console.log('✓ Disposable structure data removed and superuser token cleared');
  }

  if (!departments.id || !sections.id || !cellGroups.id) throw new Error('Structure bootstrap did not complete.');
  console.log('\nCell structure schema and live rule tests passed.');
}

main().catch((error) => {
  console.error('\nBootstrap failed:', {
    status: error?.status,
    message: error?.response?.message || error?.message || 'Unknown PocketBase error',
    fields: error?.response?.data ? Object.keys(error.response.data) : []
  });
  process.exitCode = 1;
});
