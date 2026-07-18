migrate((app) => {
  const authenticated = '@request.auth.id != ""';
  const manager = '(@request.auth.role = "administrator" || @request.auth.role = "lead_pastor")';
  const users = app.findCollectionByNameOrId('users');

  const requests = new Collection({ type: 'base', name: 'prayer_requests' });
  requests.listRule = `${authenticated} && (${manager} || submitter = @request.auth.id)`;
  requests.viewRule = requests.listRule;
  requests.createRule = `${authenticated} && submitter = @request.auth.id && status = "submitted" && urgency = "low" && assignedIntercessors:length = 0 && ((isAnonymous = true && displayName = "Anonymous Member" && displayAvatar = "??") || (isAnonymous = false && displayName = @request.auth.name))`;
  requests.updateRule = `${authenticated} && ${manager} && @request.body.submitter:changed = false && @request.body.displayName:changed = false && @request.body.displayAvatar:changed = false && @request.body.isAnonymous:changed = false && @request.body.category:changed = false && @request.body.content:changed = false`;
  requests.deleteRule = null;
  requests.fields.add(new RelationField({ name: 'submitter', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
  requests.fields.add(new TextField({ name: 'displayName', required: true, max: 120 }));
  requests.fields.add(new TextField({ name: 'displayAvatar', required: true, max: 4 }));
  requests.fields.add(new BoolField({ name: 'isAnonymous' }));
  requests.fields.add(new SelectField({ name: 'category', required: true, maxSelect: 1, values: ['Healing', 'Guidance', 'Family', 'Deliverance', 'Thanksgiving', 'Financial', 'Spiritual Growth', 'Other'] }));
  requests.fields.add(new TextField({ name: 'content', required: true, max: 2000 }));
  requests.fields.add(new SelectField({ name: 'urgency', required: true, maxSelect: 1, values: ['low', 'medium', 'high'] }));
  requests.fields.add(new SelectField({ name: 'status', required: true, maxSelect: 1, values: ['submitted', 'assigned', 'archived'] }));
  requests.fields.add(new RelationField({ name: 'assignedIntercessors', collectionId: users.id, maxSelect: 20, cascadeDelete: false }));
  requests.fields.add(new DateField({ name: 'answeredAt' }));
  requests.fields.add(new DateField({ name: 'archivedAt' }));
  requests.addIndex('idx_prayer_requests_status_urgency', false, 'status, urgency', '');
  requests.addIndex('idx_prayer_requests_submitter_status', false, 'submitter, status', '');
  requests.addIndex('idx_prayer_requests_category_status', false, 'category, status', '');
  app.save(requests);

  const assignments = new Collection({ type: 'base', name: 'prayer_assignments' });
  assignments.listRule = `${authenticated} && (${manager} || intercessor = @request.auth.id || request.submitter = @request.auth.id)`;
  assignments.viewRule = assignments.listRule;
  assignments.createRule = `${authenticated} && ${manager} && assignedBy = @request.auth.id && status = "active" && requestCategory = request.category && requestContent = request.content && requestDisplayName = request.displayName && requestDisplayAvatar = request.displayAvatar && requestIsAnonymous = request.isAnonymous && requestUrgency = request.urgency`;
  assignments.updateRule = `${authenticated} && (${manager} || (intercessor = @request.auth.id && @request.body.status = "completed" && @request.body.request:changed = false && @request.body.intercessor:changed = false && @request.body.intercessorName:changed = false && @request.body.assignedBy:changed = false && @request.body.assignedAt:changed = false && @request.body.requestCategory:changed = false && @request.body.requestContent:changed = false && @request.body.requestDisplayName:changed = false && @request.body.requestDisplayAvatar:changed = false && @request.body.requestIsAnonymous:changed = false && @request.body.requestUrgency:changed = false && @request.body.requestCreatedAt:changed = false))`;
  assignments.deleteRule = null;
  assignments.fields.add(new RelationField({ name: 'request', required: true, collectionId: requests.id, maxSelect: 1, cascadeDelete: false }));
  assignments.fields.add(new RelationField({ name: 'intercessor', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
  assignments.fields.add(new TextField({ name: 'intercessorName', required: true, max: 120 }));
  assignments.fields.add(new SelectField({ name: 'status', required: true, maxSelect: 1, values: ['active', 'completed'] }));
  assignments.fields.add(new RelationField({ name: 'assignedBy', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
  assignments.fields.add(new DateField({ name: 'assignedAt', required: true }));
  assignments.fields.add(new SelectField({ name: 'requestCategory', required: true, maxSelect: 1, values: ['Healing', 'Guidance', 'Family', 'Deliverance', 'Thanksgiving', 'Financial', 'Spiritual Growth', 'Other'] }));
  assignments.fields.add(new TextField({ name: 'requestContent', required: true, max: 2000 }));
  assignments.fields.add(new TextField({ name: 'requestDisplayName', required: true, max: 120 }));
  assignments.fields.add(new TextField({ name: 'requestDisplayAvatar', required: true, max: 4 }));
  assignments.fields.add(new BoolField({ name: 'requestIsAnonymous' }));
  assignments.fields.add(new SelectField({ name: 'requestUrgency', required: true, maxSelect: 1, values: ['low', 'medium', 'high'] }));
  assignments.fields.add(new DateField({ name: 'requestCreatedAt', required: true }));
  assignments.addIndex('idx_prayer_assignments_unique', true, 'request, intercessor', '');
  assignments.addIndex('idx_prayer_assignments_intercessor_status', false, 'intercessor, status', '');
  app.save(assignments);

  const outcomes = new Collection({ type: 'base', name: 'prayer_outcomes' });
  outcomes.listRule = `${authenticated} && (${manager} || request.submitter = @request.auth.id || request.assignedIntercessors.id ?= @request.auth.id)`;
  outcomes.viewRule = outcomes.listRule;
  outcomes.createRule = `${authenticated} && reportedBy = @request.auth.id && reporterName = @request.auth.name && (${manager} || request.assignedIntercessors.id ?= @request.auth.id)`;
  outcomes.updateRule = null;
  outcomes.deleteRule = null;
  outcomes.fields.add(new RelationField({ name: 'request', required: true, collectionId: requests.id, maxSelect: 1, cascadeDelete: false }));
  outcomes.fields.add(new RelationField({ name: 'reportedBy', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
  outcomes.fields.add(new TextField({ name: 'reporterName', required: true, max: 120 }));
  outcomes.fields.add(new DateField({ name: 'reportedAt', required: true }));
  outcomes.addIndex('idx_prayer_outcomes_request', true, 'request', '');
  app.save(outcomes);

  const notes = new Collection({ type: 'base', name: 'prayer_notes' });
  notes.listRule = `${authenticated} && (${manager} || request.submitter = @request.auth.id || request.assignedIntercessors.id ?= @request.auth.id)`;
  notes.viewRule = notes.listRule;
  notes.createRule = `${authenticated} && author = @request.auth.id && authorName = @request.auth.name && (${manager} || request.assignedIntercessors.id ?= @request.auth.id)`;
  notes.updateRule = null;
  notes.deleteRule = null;
  notes.fields.add(new RelationField({ name: 'request', required: true, collectionId: requests.id, maxSelect: 1, cascadeDelete: false }));
  notes.fields.add(new RelationField({ name: 'author', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
  notes.fields.add(new TextField({ name: 'authorName', required: true, max: 120 }));
  notes.fields.add(new TextField({ name: 'text', required: true, max: 1200 }));
  notes.addIndex('idx_prayer_notes_request', false, 'request', '');
  app.save(notes);

  const events = new Collection({ type: 'base', name: 'prayer_watch_events' });
  events.listRule = `${authenticated} && (${manager} || request.submitter = @request.auth.id || request.assignedIntercessors.id ?= @request.auth.id)`;
  events.viewRule = events.listRule;
  events.createRule = `${authenticated} && offeredBy = @request.auth.id && (${manager} || request.assignedIntercessors.id ?= @request.auth.id)`;
  events.updateRule = null;
  events.deleteRule = null;
  events.fields.add(new TextField({ name: 'operationId', required: true, max: 80 }));
  events.fields.add(new RelationField({ name: 'request', required: true, collectionId: requests.id, maxSelect: 1, cascadeDelete: false }));
  events.fields.add(new RelationField({ name: 'offeredBy', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
  events.fields.add(new DateField({ name: 'offeredAt', required: true }));
  events.addIndex('idx_prayer_watch_events_operation', true, 'operationId', '');
  events.addIndex('idx_prayer_watch_events_request_time', false, 'request, offeredAt', '');
  app.save(events);
}, (app) => {
  for (const name of ['prayer_watch_events', 'prayer_notes', 'prayer_outcomes', 'prayer_assignments', 'prayer_requests']) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch { /* Already absent. */ }
  }
});
