migrate((app) => {
  const authenticated = '@request.auth.id != ""';
  const leadership = '(@request.auth.role = "administrator" || @request.auth.role = "lead_pastor")';
  const scopedReader = `(user = @request.auth.id || (@request.auth.role = "cell_leader" && cellGroup.leader = @request.auth.id) || (@request.auth.role = "district_pastor" && section.pastor = @request.auth.id))`;
  const members = app.findCollectionByNameOrId('members');

  members.listRule = `${authenticated} && (${leadership} || (deleted = false && status = "active" && ${scopedReader}))`;
  members.viewRule = members.listRule;
  members.createRule = `${authenticated} && ${leadership}`;
  members.updateRule = `${authenticated} && (${leadership} || (user = @request.auth.id && @request.body.user:changed = false && @request.body.email:changed = false && @request.body.role:changed = false && @request.body.departments:changed = false && @request.body.cellGroup:changed = false && @request.body.section:changed = false && @request.body.qrCode:changed = false && @request.body.status:changed = false && @request.body.deleted:changed = false && @request.body.createdBy:changed = false))`;
  members.deleteRule = null;
  app.save(members);

  const directory = new Collection({
    type: 'view',
    name: 'saints_directory',
    viewQuery: `
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
      WHERE m.status = 'active' AND m.deleted = 0
    `
  });
  directory.listRule = authenticated;
  directory.viewRule = authenticated;
  app.save(directory);

  const cellCounts = new Collection({
    type: 'view',
    name: 'saints_directory_cell_counts',
    viewQuery: `
      SELECT
        lower('c' || substr(cg.id, 1, 14)) AS id,
        'cell' AS kind,
        cg.id AS targetId,
        COUNT(m.id) AS memberCount
      FROM cell_groups cg
      LEFT JOIN members m ON m.cellGroup = cg.id AND m.status = 'active' AND m.deleted = 0
      WHERE cg.status = 'active'
      GROUP BY cg.id
    `
  });
  cellCounts.listRule = authenticated;
  cellCounts.viewRule = authenticated;
  app.save(cellCounts);

  const departmentCounts = new Collection({
    type: 'view',
    name: 'saints_directory_department_counts',
    viewQuery: `
      SELECT
        lower('d' || substr(d.id, 1, 14)) AS id,
        'department' AS kind,
        d.id AS targetId,
        COUNT(m.id) AS memberCount
      FROM departments d
      LEFT JOIN members m ON m.status = 'active' AND m.deleted = 0 AND m.departments LIKE '%' || d.id || '%'
      WHERE d.status = 'active'
      GROUP BY d.id
    `
  });
  departmentCounts.listRule = authenticated;
  departmentCounts.viewRule = authenticated;
  app.save(departmentCounts);
}, (app) => {
  for (const name of ['saints_directory_department_counts', 'saints_directory_cell_counts', 'saints_directory']) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch { /* Already absent. */ }
  }
  try {
    const members = app.findCollectionByNameOrId('members');
    const authenticated = '@request.auth.id != ""';
    const leadership = '(@request.auth.role = "administrator" || @request.auth.role = "lead_pastor")';
    members.listRule = `${authenticated} && ((deleted = false && status = "active") || ${leadership})`;
    members.viewRule = members.listRule;
    members.createRule = `${authenticated} && ${leadership}`;
    members.updateRule = `${authenticated} && ${leadership}`;
    members.deleteRule = null;
    app.save(members);
  } catch { /* Members collection already absent. */ }
});
