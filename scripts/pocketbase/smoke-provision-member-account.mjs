import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import process from 'node:process';
import PocketBase from 'pocketbase';

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

  const suffix = Date.now().toString(36);
  const adminPassword = temporaryPassword();
  const memberEmail = `provision-member-${suffix}@example.com`;
  const created = { users: [], members: [], audit_logs: [] };

  try {
    const admin = await superuser.collection('users').create({
      id: recordId(), email: `provision-admin-${suffix}@example.com`, password: adminPassword, passwordConfirm: adminPassword,
      name: 'Provision Test Admin', role: 'administrator', status: 'active', verified: true
    });
    created.users.push(admin.id);

    const member = await superuser.collection('members').create({
      id: recordId(), fullName: 'Provision Test Member', email: memberEmail, phone: '+254700009901',
      role: 'member', qrCode: `CC-PROVISION-${suffix}`, avatarText: 'PT', status: 'active',
      deleted: false, createdBy: admin.id
    });
    created.members.push(member.id);

    const adminClient = new PocketBase(url);
    adminClient.autoCancellation(false);
    await adminClient.collection('users').authWithPassword(admin.email, adminPassword);

    const result = await adminClient.send('/api/churchconnect/provision-member-account', {
      method: 'POST',
      body: { memberId: member.id }
    });
    if (!result?.ok || !result.account?.temporaryPassword || result.account.email !== memberEmail) {
      throw new Error('Provisioning endpoint returned an invalid response.');
    }
    created.users.push(result.account.userId);
    console.log('✓ Hook provisioned and linked a login account');

    const provisionedClient = new PocketBase(url);
    provisionedClient.autoCancellation(false);
    await provisionedClient.collection('users').authWithPassword(memberEmail, result.account.temporaryPassword);
    console.log('✓ Temporary password authenticates the provisioned account');

    const linked = await superuser.collection('members').getOne(member.id);
    if (linked.user !== result.account.userId) throw new Error('Registry profile was not linked to the provisioned account.');
    console.log('✓ Registry profile points to the provisioned account');

    const audit = await superuser.collection('audit_logs').getList(1, 5, {
      filter: `entityId = "${member.id}" && action = "member_account_provisioned" && source = "server"`
    });
    if (audit.totalItems !== 1) throw new Error('Server audit row was not recorded.');
    created.audit_logs.push(...audit.items.map((item) => item.id));
    console.log('✓ Server audit event recorded');

    await expectRejected('Duplicate provisioning is rejected', () => adminClient.send('/api/churchconnect/provision-member-account', {
      method: 'POST',
      body: { memberId: member.id }
    }));

    const anonymous = new PocketBase(url);
    await expectRejected('Anonymous provisioning is rejected', () => anonymous.send('/api/churchconnect/provision-member-account', {
      method: 'POST',
      body: { memberId: member.id }
    }));
  } finally {
    for (const id of created.audit_logs.reverse()) { try { await superuser.collection('audit_logs').delete(id); } catch { /* removed */ } }
    for (const id of created.members.reverse()) { try { await superuser.collection('members').delete(id); } catch { /* removed */ } }
    for (const id of created.users.reverse()) { try { await superuser.collection('users').delete(id); } catch { /* removed */ } }
    superuser.authStore.clear();
    console.log('✓ Disposable provisioning data removed and superuser token cleared');
  }

  console.log('\nMember account provisioning hook smoke test passed.');
}

main().catch((error) => {
  console.error('\nProvisioning hook smoke test failed:', error?.response ?? error);
  process.exitCode = 1;
});
