import { randomBytes } from 'node:crypto';
import process from 'node:process';
import PocketBase from 'pocketbase';

const ROLE_VALUES = [
  'lead_pastor',
  'administrator',
  'cell_leader',
  'district_pastor',
  'department_head',
  'member',
  'guest'
];

const USERS_SCHEMA = {
  type: 'auth',
  name: 'users',
  listRule: '@request.auth.id != "" && (@request.auth.role = "administrator" || @request.auth.role = "lead_pastor")',
  viewRule: 'id = @request.auth.id || @request.auth.role = "administrator" || @request.auth.role = "lead_pastor"',
  createRule: null,
  updateRule: 'id = @request.auth.id && @request.body.role:isset = false && @request.body.status:isset = false',
  deleteRule: null,
  manageRule: null,
  authRule: 'status = "active"',
  fields: [
    { name: 'name', type: 'text', required: true, max: 120, presentable: true },
    { name: 'role', type: 'select', required: true, maxSelect: 1, values: ROLE_VALUES },
    { name: 'avatarText', type: 'text', max: 4 },
    { name: 'department', type: 'text', max: 120 },
    { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['active', 'inactive', 'suspended'] }
  ],
  indexes: [
    'CREATE INDEX idx_users_role ON users (role)',
    'CREATE INDEX idx_users_status ON users (status)'
  ],
  passwordAuth: { enabled: true, identityFields: ['email'] },
  authToken: { duration: 604800 }
};

function argument(name, fallback = '') {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function hiddenQuestion(prompt) {
  if (!process.stdin.isTTY) {
    throw new Error('A TTY is required for the hidden superuser password prompt.');
  }

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
          cleanup();
          resolve(value);
          return;
        }
        if (character === '\u0003') {
          cleanup();
          reject(new Error('Cancelled.'));
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
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

async function expectRejected(label, operation) {
  try {
    await operation();
  } catch {
    console.log(`✓ ${label}`);
    return;
  }
  throw new Error(`${label}: expected the operation to be rejected.`);
}

function mergeFields(existingFields, desiredFields) {
  const desiredByName = new Map(desiredFields.map((field) => [field.name, field]));
  const merged = existingFields.map((field) => {
    const desired = desiredByName.get(field.name);
    if (!desired) return field;
    desiredByName.delete(field.name);
    return { ...field, ...desired, id: field.id };
  });

  return [...merged, ...desiredByName.values()];
}

async function reconcileUsersCollection(admin) {
  let collection;
  try {
    collection = await admin.collections.getOne('users');
    if (collection.type !== 'auth') {
      throw new Error('The existing users collection is not an auth collection.');
    }

    const preservedIndexes = (collection.indexes ?? []).filter(
      (index) => !index.includes('idx_users_role') && !index.includes('idx_users_status')
    );

    collection = await admin.collections.update(collection.id, {
      listRule: USERS_SCHEMA.listRule,
      viewRule: USERS_SCHEMA.viewRule,
      createRule: USERS_SCHEMA.createRule,
      updateRule: USERS_SCHEMA.updateRule,
      deleteRule: USERS_SCHEMA.deleteRule,
      manageRule: USERS_SCHEMA.manageRule,
      authRule: USERS_SCHEMA.authRule,
      fields: mergeFields(collection.fields ?? [], USERS_SCHEMA.fields),
      indexes: [...preservedIndexes, ...USERS_SCHEMA.indexes],
      passwordAuth: USERS_SCHEMA.passwordAuth,
      authToken: USERS_SCHEMA.authToken
    });
    console.log('✓ Existing users auth collection reconciled');
  } catch (error) {
    if (error?.status !== 404) throw error;
    collection = await admin.collections.create(USERS_SCHEMA);
    console.log('✓ Users auth collection created');
  }

  return collection;
}

async function main() {
  const url = argument('url', 'https://churchconnect.pockethost.io').replace(/\/$/, '');
  const email = argument('email');
  if (!email) throw new Error('Pass the superuser email with --email=address@example.com.');

  const password = await hiddenQuestion('PocketBase superuser password: ');
  const admin = new PocketBase(url);
  admin.autoCancellation(false);

  await admin.collection('_superusers').authWithPassword(email, password);
  console.log('✓ Superuser authentication');

  await reconcileUsersCollection(admin);

  const suffix = Date.now().toString(36);
  const testAdminEmail = `module1-admin-${suffix}@example.com`;
  const testMemberEmail = `module1-member-${suffix}@example.com`;
  const testAdminPassword = temporaryPassword();
  const testMemberPassword = temporaryPassword();
  const createdIds = [];

  try {
    const testAdmin = await admin.collection('users').create({
      email: testAdminEmail,
      password: testAdminPassword,
      passwordConfirm: testAdminPassword,
      name: 'Module One Administrator',
      role: 'administrator',
      avatarText: 'MA',
      department: 'System Test',
      status: 'active',
      verified: true
    });
    createdIds.push(testAdmin.id);

    const testMember = await admin.collection('users').create({
      email: testMemberEmail,
      password: testMemberPassword,
      passwordConfirm: testMemberPassword,
      name: 'Module One Member',
      role: 'member',
      avatarText: 'MM',
      department: 'System Test',
      status: 'active',
      verified: true
    });
    createdIds.push(testMember.id);
    console.log('✓ Disposable auth users created');

    const anonymous = new PocketBase(url);
    const anonymousList = await anonymous.collection('users').getList(1, 10);
    if (anonymousList.totalItems !== 0) throw new Error('Anonymous user listing exposed records.');
    console.log('✓ Anonymous user listing exposes no records');

    const appAdmin = new PocketBase(url);
    await appAdmin.collection('users').authWithPassword(testAdminEmail, testAdminPassword);
    await appAdmin.collection('users').authRefresh();
    const adminList = await appAdmin.collection('users').getList(1, 10);
    if (adminList.totalItems < 2) throw new Error('Administrator could not list authorized users.');
    console.log('✓ Administrator login, refresh, and role-scoped list');

    const member = new PocketBase(url);
    await member.collection('users').authWithPassword(testMemberEmail, testMemberPassword);
    const memberList = await member.collection('users').getList(1, 10);
    if (memberList.totalItems !== 0) throw new Error('Member list exposed other user records.');
    console.log('✓ Member user listing exposes no records');
    const self = await member.collection('users').getOne(testMember.id);
    if (self.id !== testMember.id) throw new Error('Member could not read their own record.');
    console.log('✓ Member can read their own record');

    await expectRejected('Member cannot read another user', () => member.collection('users').getOne(testAdmin.id));
    await expectRejected('Member cannot elevate their own role', () => member.collection('users').update(testMember.id, { role: 'administrator' }));

    const updated = await member.collection('users').update(testMember.id, { name: 'Updated Module Member' });
    if (updated.name !== 'Updated Module Member') throw new Error('Allowed profile update failed.');
    console.log('✓ Member profile update allowed without privilege escalation');

    await expectRejected('Incorrect password rejected', () => new PocketBase(url).collection('users').authWithPassword(testMemberEmail, 'incorrect-password'));
  } finally {
    for (const id of createdIds.reverse()) {
      try {
        await admin.collection('users').delete(id);
      } catch (error) {
        console.warn(`Could not delete disposable user ${id}:`, error?.message ?? error);
      }
    }
    admin.authStore.clear();
    console.log('✓ Disposable auth users removed and superuser token cleared');
  }

  console.log('\nModule 1 backend auth bootstrap and rule tests passed.');
}

main().catch((error) => {
  console.error('\nBootstrap failed:', error?.response ?? error);
  process.exitCode = 1;
});
