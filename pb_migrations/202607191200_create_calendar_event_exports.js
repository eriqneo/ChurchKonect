migrate((app) => {
  const authenticated = '@request.auth.id != ""';
  const own = 'user = @request.auth.id';
  const currentExportableVersion = '(@collection.calendar_exportable_events.announcementId ?= announcement && @collection.calendar_exportable_events.eventTitle ?= titleSnapshot && @collection.calendar_exportable_events.eventBody ?= bodySnapshot && @collection.calendar_exportable_events.eventDate ?= eventDateSnapshot && @collection.calendar_exportable_events.eventTime ?= eventTimeSnapshot && @collection.calendar_exportable_events.eventLocation ?= eventLocationSnapshot)';
  const currentRequestExportableVersion = '(@collection.calendar_exportable_events.announcementId ?= announcement && @collection.calendar_exportable_events.eventTitle ?= @request.body.titleSnapshot && @collection.calendar_exportable_events.eventBody ?= @request.body.bodySnapshot && @collection.calendar_exportable_events.eventDate ?= @request.body.eventDateSnapshot && @collection.calendar_exportable_events.eventTime ?= @request.body.eventTimeSnapshot && @collection.calendar_exportable_events.eventLocation ?= @request.body.eventLocationSnapshot)';
  const users = app.findCollectionByNameOrId('users');
  const announcements = app.findCollectionByNameOrId('announcements');

  const exportableEvents = new Collection({
    type: 'view',
    name: 'calendar_exportable_events',
    viewQuery: `
      SELECT
        a.id AS id,
        a.id AS announcementId,
        a.title AS eventTitle,
        a.body AS eventBody,
        substr(a.eventDate, 1, 10) AS eventDate,
        a.eventTime AS eventTime,
        a.eventLocation AS eventLocation
      FROM announcements a
      WHERE a.tag = 'Event'
        AND a.status = 'published'
        AND a.publishAt <= datetime('now')
        AND (a.expiresAt = '' OR a.expiresAt > datetime('now'))
    `
  });
  exportableEvents.listRule = authenticated;
  exportableEvents.viewRule = authenticated;
  app.save(exportableEvents);

  const exports = new Collection({ type: 'base', name: 'calendar_event_exports' });
  exports.listRule = `${authenticated} && ${own}`;
  exports.viewRule = exports.listRule;
  exports.createRule = `${authenticated} && ${own} && ${currentExportableVersion}`;
  exports.updateRule = `${authenticated} && ${own} && @request.body.user:changed = false && @request.body.announcement:changed = false && ${currentRequestExportableVersion}`;
  exports.deleteRule = `${authenticated} && ${own}`;
  exports.fields.add(new RelationField({ name: 'user', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true }));
  exports.fields.add(new RelationField({ name: 'announcement', required: true, collectionId: announcements.id, maxSelect: 1, cascadeDelete: true }));
  exports.fields.add(new SelectField({ name: 'method', required: true, maxSelect: 1, values: ['ics', 'google'] }));
  exports.fields.add(new TextField({ name: 'titleSnapshot', required: true, max: 80 }));
  exports.fields.add(new TextField({ name: 'bodySnapshot', required: true, max: 600 }));
  exports.fields.add(new TextField({ name: 'eventDateSnapshot', required: true, max: 10 }));
  exports.fields.add(new TextField({ name: 'eventTimeSnapshot', max: 10 }));
  exports.fields.add(new TextField({ name: 'eventLocationSnapshot', max: 200 }));
  exports.addIndex('idx_calendar_event_exports_owner_event', true, 'user, announcement', '');
  app.save(exports);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId('calendar_event_exports')); } catch { /* Already absent. */ }
  try { app.delete(app.findCollectionByNameOrId('calendar_exportable_events')); } catch { /* Already absent. */ }
});
