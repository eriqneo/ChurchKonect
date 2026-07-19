migrate((app) => {
  const authenticated = '@request.auth.id != ""';
  const users = app.findCollectionByNameOrId('users');

  const preferences = new Collection({ type: 'base', name: 'user_preferences' });
  preferences.listRule = `${authenticated} && user = @request.auth.id`;
  preferences.viewRule = preferences.listRule;
  preferences.createRule = `${authenticated} && user = @request.auth.id`;
  preferences.updateRule = `${authenticated} && user = @request.auth.id && @request.body.user:changed = false`;
  preferences.deleteRule = null;
  preferences.fields.add(new RelationField({ name: 'user', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true }));
  preferences.fields.add(new SelectField({ name: 'directoryVisibility', required: true, maxSelect: 1, values: ['listed', 'private'] }));
  preferences.addIndex('idx_user_preferences_user', true, 'user', '');
  app.save(preferences);

  const directory = app.findCollectionByNameOrId('saints_directory');
  directory.viewQuery = `
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
  app.save(directory);
}, (app) => {
  const directory = app.findCollectionByNameOrId('saints_directory');
  directory.viewQuery = `
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
  `;
  app.save(directory);
  try { app.delete(app.findCollectionByNameOrId('user_preferences')); } catch { /* Already absent. */ }
});
