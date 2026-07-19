migrate((app) => {
  const authenticated = '@request.auth.id != ""';
  const leadership = '(@request.auth.role = "administrator" || @request.auth.role = "lead_pastor")';
  const scopedReader = '(user = @request.auth.id || (@request.auth.role = "cell_leader" && cellGroup.leader = @request.auth.id) || (@request.auth.role = "district_pastor" && section.pastor = @request.auth.id))';
  const protectedLeadershipTarget = '(@request.auth.role = "lead_pastor" || (role != "administrator" && role != "lead_pastor"))';
  const protectedRoleChange = '(@request.auth.role = "lead_pastor" || (@request.body.role:changed = false || (@request.body.role != "administrator" && @request.body.role != "lead_pastor")))';
  const matchingRequestedAccount = '(@collection.users.id ?= @request.body.user && @collection.users.email ?= email && @collection.users.role ?= role && @collection.users.status ?= "active")';
  const safeAccountTransition = `((user = "" && (@request.body.user:changed = false || (@request.body.email:changed = false && @request.body.role:changed = false && @request.body.user != "" && ${matchingRequestedAccount}))) || (user != "" && @request.body.email:changed = false && @request.body.role:changed = false && (@request.body.user:changed = false || @request.body.user = "")))`;

  const members = app.findCollectionByNameOrId('members');
  members.listRule = `${authenticated} && (${leadership} || (deleted = false && status = "active" && ${scopedReader}))`;
  members.viewRule = members.listRule;
  members.createRule = `${authenticated} && ${leadership} && ${protectedLeadershipTarget} && (user = "" || (user.email = email && user.role = role))`;
  members.updateRule = `${authenticated} && ((${leadership} && ${protectedLeadershipTarget} && ${protectedRoleChange} && ${safeAccountTransition}) || (user = @request.auth.id && @request.body.user:changed = false && @request.body.email:changed = false && @request.body.role:changed = false && @request.body.departments:changed = false && @request.body.cellGroup:changed = false && @request.body.section:changed = false && @request.body.qrCode:changed = false && @request.body.status:changed = false && @request.body.deleted:changed = false && @request.body.createdBy:changed = false))`;
  members.addIndex('idx_members_user', true, 'user', 'user != ""');
  app.save(members);

  const accountDirectory = new Collection({
    type: 'view',
    name: 'member_account_directory',
    viewQuery: `
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
    `
  });
  accountDirectory.listRule = `${authenticated} && ${leadership}`;
  accountDirectory.viewRule = `${authenticated} && ${leadership}`;
  app.save(accountDirectory);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId('member_account_directory')); } catch { /* Already absent. */ }
  try {
    const members = app.findCollectionByNameOrId('members');
    members.removeIndex('idx_members_user');
    app.save(members);
  } catch { /* Collection or index already absent. */ }
});
