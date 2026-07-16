migrate((app) => {
  const authenticated = '@request.auth.id != ""';
  const leadership = '(@request.auth.role = "administrator" || @request.auth.role = "lead_pastor")';
  const roles = [
    'lead_pastor',
    'administrator',
    'cell_leader',
    'district_pastor',
    'department_head',
    'member',
    'guest'
  ];

  const ensureCollection = (name) => {
    try {
      const existing = app.findCollectionByNameOrId(name);
      if (existing.type !== 'base') throw new Error(`${name} exists but is not a base collection.`);
      return existing;
    } catch (error) {
      if (String(error).includes('not a base collection')) throw error;
      return new Collection({ type: 'base', name });
    }
  };

  const ensureField = (collection, name, createField, options) => {
    try {
      Object.assign(collection.fields.getByName(name), options);
    } catch {
      collection.fields.add(createField());
    }
  };

  const applyReferenceRules = (collection) => {
    collection.listRule = authenticated;
    collection.viewRule = authenticated;
    collection.createRule = `${authenticated} && ${leadership}`;
    collection.updateRule = `${authenticated} && ${leadership}`;
    collection.deleteRule = `${authenticated} && ${leadership}`;
  };

  const users = app.findCollectionByNameOrId('users');

  const departments = ensureCollection('departments');
  applyReferenceRules(departments);
  ensureField(departments, 'name', () => new TextField({ name: 'name', required: true, max: 120 }), { required: true, max: 120 });
  ensureField(departments, 'description', () => new TextField({ name: 'description', max: 500 }), { max: 500 });
  ensureField(departments, 'status', () => new SelectField({ name: 'status', required: true, maxSelect: 1, values: ['active', 'inactive'] }), { required: true, maxSelect: 1, values: ['active', 'inactive'] });
  departments.addIndex('idx_departments_name', true, 'name', '');
  app.save(departments);

  const sections = ensureCollection('sections');
  applyReferenceRules(sections);
  ensureField(sections, 'name', () => new TextField({ name: 'name', required: true, max: 120 }), { required: true, max: 120 });
  ensureField(sections, 'code', () => new TextField({ name: 'code', max: 30 }), { max: 30 });
  ensureField(sections, 'pastor', () => new RelationField({ name: 'pastor', collectionId: users.id, maxSelect: 1, cascadeDelete: false }), { collectionId: users.id, maxSelect: 1, cascadeDelete: false });
  ensureField(sections, 'status', () => new SelectField({ name: 'status', required: true, maxSelect: 1, values: ['active', 'inactive'] }), { required: true, maxSelect: 1, values: ['active', 'inactive'] });
  sections.addIndex('idx_sections_name', true, 'name', '');
  sections.addIndex('idx_sections_code', true, 'code', 'code != ""');
  app.save(sections);

  const cellGroups = ensureCollection('cell_groups');
  applyReferenceRules(cellGroups);
  ensureField(cellGroups, 'name', () => new TextField({ name: 'name', required: true, max: 120 }), { required: true, max: 120 });
  ensureField(cellGroups, 'leader', () => new RelationField({ name: 'leader', collectionId: users.id, maxSelect: 1, cascadeDelete: false }), { collectionId: users.id, maxSelect: 1, cascadeDelete: false });
  ensureField(cellGroups, 'section', () => new RelationField({ name: 'section', collectionId: sections.id, maxSelect: 1, cascadeDelete: false }), { collectionId: sections.id, maxSelect: 1, cascadeDelete: false });
  ensureField(cellGroups, 'meetingDay', () => new SelectField({ name: 'meetingDay', maxSelect: 1, values: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] }), { maxSelect: 1, values: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] });
  ensureField(cellGroups, 'meetingTime', () => new TextField({ name: 'meetingTime', max: 10 }), { max: 10 });
  ensureField(cellGroups, 'location', () => new TextField({ name: 'location', max: 200 }), { max: 200 });
  ensureField(cellGroups, 'status', () => new SelectField({ name: 'status', required: true, maxSelect: 1, values: ['active', 'inactive'] }), { required: true, maxSelect: 1, values: ['active', 'inactive'] });
  cellGroups.addIndex('idx_cell_groups_name', true, 'name', '');
  app.save(cellGroups);

  const members = ensureCollection('members');
  members.listRule = `${authenticated} && ((deleted = false && status = "active") || ${leadership})`;
  members.viewRule = `${authenticated} && ((deleted = false && status = "active") || ${leadership})`;
  members.createRule = `${authenticated} && ${leadership}`;
  members.updateRule = `${authenticated} && ${leadership}`;
  members.deleteRule = null;
  ensureField(members, 'user', () => new RelationField({ name: 'user', collectionId: users.id, maxSelect: 1, cascadeDelete: false }), { collectionId: users.id, maxSelect: 1, cascadeDelete: false });
  ensureField(members, 'fullName', () => new TextField({ name: 'fullName', required: true, max: 160 }), { required: true, max: 160 });
  ensureField(members, 'email', () => new EmailField({ name: 'email' }), {});
  ensureField(members, 'phone', () => new TextField({ name: 'phone', required: true, max: 40 }), { required: true, max: 40 });
  ensureField(members, 'role', () => new SelectField({ name: 'role', required: true, maxSelect: 1, values: roles }), { required: true, maxSelect: 1, values: roles });
  ensureField(members, 'departments', () => new RelationField({ name: 'departments', collectionId: departments.id, maxSelect: 20, cascadeDelete: false }), { collectionId: departments.id, maxSelect: 20, cascadeDelete: false });
  ensureField(members, 'cellGroup', () => new RelationField({ name: 'cellGroup', collectionId: cellGroups.id, maxSelect: 1, cascadeDelete: false }), { collectionId: cellGroups.id, maxSelect: 1, cascadeDelete: false });
  ensureField(members, 'section', () => new RelationField({ name: 'section', collectionId: sections.id, maxSelect: 1, cascadeDelete: false }), { collectionId: sections.id, maxSelect: 1, cascadeDelete: false });
  ensureField(members, 'qrCode', () => new TextField({ name: 'qrCode', required: true, max: 40 }), { required: true, max: 40 });
  ensureField(members, 'avatarText', () => new TextField({ name: 'avatarText', max: 4 }), { max: 4 });
  ensureField(members, 'address', () => new TextField({ name: 'address', max: 240 }), { max: 240 });
  ensureField(members, 'dateOfBirth', () => new DateField({ name: 'dateOfBirth' }), {});
  ensureField(members, 'status', () => new SelectField({ name: 'status', required: true, maxSelect: 1, values: ['active', 'inactive'] }), { required: true, maxSelect: 1, values: ['active', 'inactive'] });
  ensureField(members, 'deleted', () => new BoolField({ name: 'deleted' }), {});
  ensureField(members, 'createdBy', () => new RelationField({ name: 'createdBy', collectionId: users.id, maxSelect: 1, cascadeDelete: false }), { collectionId: users.id, maxSelect: 1, cascadeDelete: false });
  members.addIndex('idx_members_email', true, 'email', 'email != ""');
  members.addIndex('idx_members_qr_code', true, 'qrCode', '');
  members.addIndex('idx_members_name', false, 'fullName', '');
  members.addIndex('idx_members_status', false, 'status, deleted', '');
  app.save(members);
}, (app) => {
  for (const name of ['members', 'cell_groups', 'sections', 'departments']) {
    try {
      app.delete(app.findCollectionByNameOrId(name));
    } catch {
      // Already absent.
    }
  }
});
