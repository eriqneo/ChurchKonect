migrate((app) => {
  const authenticated = '@request.auth.id != ""';
  const manager = '(@request.auth.role = "administrator" || @request.auth.role = "lead_pastor" || @request.auth.role = "district_pastor")';
  const visible = '(status = "published" && publishAt <= @now && (expiresAt = "" || expiresAt > @now))';
  const users = app.findCollectionByNameOrId('users');

  const announcements = new Collection({ type: 'base', name: 'announcements' });
  announcements.listRule = `${authenticated} && (${manager} || ${visible})`;
  announcements.viewRule = announcements.listRule;
  announcements.createRule = `${authenticated} && ${manager} && createdBy = @request.auth.id && authorName = @request.auth.name && authorRole = @request.auth.role && status = "published"`;
  announcements.updateRule = `${authenticated} && ${manager} && @request.body.createdBy:changed = false && @request.body.authorName:changed = false && @request.body.authorRole:changed = false`;
  announcements.deleteRule = null;
  announcements.fields.add(new TextField({ name: 'title', required: true, max: 80 }));
  announcements.fields.add(new TextField({ name: 'body', required: true, max: 600 }));
  announcements.fields.add(new SelectField({ name: 'tag', required: true, maxSelect: 1, values: ['General', 'Urgent', 'Event', 'Reminder'] }));
  announcements.fields.add(new BoolField({ name: 'pinned' }));
  announcements.fields.add(new SelectField({ name: 'status', required: true, maxSelect: 1, values: ['published', 'archived'] }));
  announcements.fields.add(new DateField({ name: 'publishAt', required: true }));
  announcements.fields.add(new DateField({ name: 'expiresAt' }));
  announcements.fields.add(new DateField({ name: 'eventDate' }));
  announcements.fields.add(new TextField({ name: 'eventTime', max: 10 }));
  announcements.fields.add(new TextField({ name: 'eventLocation', max: 200 }));
  announcements.fields.add(new RelationField({ name: 'createdBy', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
  announcements.fields.add(new TextField({ name: 'authorName', required: true, max: 120 }));
  announcements.fields.add(new SelectField({
    name: 'authorRole', required: true, maxSelect: 1,
    values: ['lead_pastor', 'administrator', 'cell_leader', 'district_pastor', 'department_head', 'member', 'guest']
  }));
  announcements.addIndex('idx_announcements_feed', false, 'status, pinned, publishAt', '');
  announcements.addIndex('idx_announcements_expiry', false, 'status, expiresAt', '');
  app.save(announcements);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId('announcements')); } catch { /* Already absent. */ }
});
