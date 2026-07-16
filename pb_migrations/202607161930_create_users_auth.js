migrate((app) => {
  let collection;
  let created = false;

  try {
    collection = app.findCollectionByNameOrId('users');
  } catch {
    collection = new Collection({ type: 'auth', name: 'users' });
    created = true;
  }

  if (collection.type !== 'auth') {
    throw new Error('The users collection exists but is not an auth collection.');
  }

  collection.listRule = '@request.auth.id != "" && (@request.auth.role = "administrator" || @request.auth.role = "lead_pastor")';
  collection.viewRule = 'id = @request.auth.id || @request.auth.role = "administrator" || @request.auth.role = "lead_pastor"';
  collection.createRule = null;
  collection.updateRule = 'id = @request.auth.id && @request.body.role:isset = false && @request.body.status:isset = false';
  collection.deleteRule = null;
  collection.manageRule = null;
  collection.authRule = 'status = "active"';
  collection.passwordAuth = { enabled: true, identityFields: ['email'] };
  collection.authToken = { duration: 604800 };

  const ensureTextField = (name, options) => {
    try {
      const field = collection.fields.getByName(name);
      Object.assign(field, options);
    } catch {
      collection.fields.add(new TextField({ name, ...options }));
    }
  };

  const ensureSelectField = (name, options) => {
    try {
      const field = collection.fields.getByName(name);
      Object.assign(field, options);
    } catch {
      collection.fields.add(new SelectField({ name, ...options }));
    }
  };

  ensureTextField('name', { required: true, max: 120, presentable: true });
  ensureSelectField('role', {
    required: true,
    maxSelect: 1,
    values: [
      'lead_pastor',
      'administrator',
      'cell_leader',
      'district_pastor',
      'department_head',
      'member',
      'guest'
    ]
  });
  ensureTextField('avatarText', { max: 4 });
  ensureTextField('department', { max: 120 });
  ensureSelectField('status', {
    required: true,
    maxSelect: 1,
    values: ['active', 'inactive', 'suspended']
  });

  collection.addIndex('idx_users_role', false, 'role', '');
  collection.addIndex('idx_users_status', false, 'status', '');
  app.save(collection);

  if (created) {
    console.log('Created users auth collection.');
  }
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId('users');
    app.delete(collection);
  } catch {
    // Already absent.
  }
});
