migrate((app) => {
  const authenticated = '@request.auth.id != ""';
  const leadership = '(@request.auth.role = "administrator" || @request.auth.role = "lead_pastor")';
  const activeOrLeadership = `${authenticated} && (status = "active" || ${leadership})`;
  const leadershipWrite = `${authenticated} && ${leadership}`;
  const users = app.findCollectionByNameOrId('users');
  const members = app.findCollectionByNameOrId('members');

  const ensureRelation = (collection, name, collectionId) => {
    try {
      const field = collection.fields.getByName(name);
      Object.assign(field, { collectionId, maxSelect: 1, cascadeDelete: false });
    } catch {
      collection.fields.add(new RelationField({
        name,
        collectionId,
        maxSelect: 1,
        cascadeDelete: false
      }));
    }
  };

  const departments = app.findCollectionByNameOrId('departments');
  departments.listRule = activeOrLeadership;
  departments.viewRule = activeOrLeadership;
  departments.createRule = leadershipWrite;
  departments.updateRule = leadershipWrite;
  departments.deleteRule = null;
  ensureRelation(departments, 'head', users.id);
  ensureRelation(departments, 'headMember', members.id);
  departments.addIndex('idx_departments_status', false, 'status', '');
  app.save(departments);

  const sections = app.findCollectionByNameOrId('sections');
  sections.listRule = activeOrLeadership;
  sections.viewRule = activeOrLeadership;
  sections.createRule = leadershipWrite;
  sections.updateRule = leadershipWrite;
  sections.deleteRule = null;
  ensureRelation(sections, 'pastor', users.id);
  ensureRelation(sections, 'pastorMember', members.id);
  sections.addIndex('idx_sections_status', false, 'status', '');
  app.save(sections);

  const cellGroups = app.findCollectionByNameOrId('cell_groups');
  cellGroups.listRule = activeOrLeadership;
  cellGroups.viewRule = activeOrLeadership;
  cellGroups.createRule = leadershipWrite;
  cellGroups.updateRule = leadershipWrite;
  cellGroups.deleteRule = null;
  ensureRelation(cellGroups, 'leader', users.id);
  ensureRelation(cellGroups, 'leaderMember', members.id);
  cellGroups.addIndex('idx_cell_groups_status', false, 'status', '');
  cellGroups.addIndex('idx_cell_groups_leader', false, 'leader', '');
  cellGroups.addIndex('idx_cell_groups_section', false, 'section', '');
  app.save(cellGroups);
}, (app) => {
  const authenticated = '@request.auth.id != ""';
  const leadership = '(@request.auth.role = "administrator" || @request.auth.role = "lead_pastor")';
  for (const [name, relationFields] of [
    ['cell_groups', ['leaderMember']],
    ['sections', ['pastorMember']],
    ['departments', ['head', 'headMember']]
  ]) {
    try {
      const collection = app.findCollectionByNameOrId(name);
      collection.listRule = authenticated;
      collection.viewRule = authenticated;
      collection.createRule = `${authenticated} && ${leadership}`;
      collection.updateRule = `${authenticated} && ${leadership}`;
      collection.deleteRule = `${authenticated} && ${leadership}`;
      for (const fieldName of relationFields) {
        try { collection.fields.removeByName(fieldName); } catch { /* Already absent. */ }
      }
      app.save(collection);
    } catch {
      // Collection already absent.
    }
  }
});
