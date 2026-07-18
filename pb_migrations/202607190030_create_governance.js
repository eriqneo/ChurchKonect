migrate((app) => {
  const authenticated = '@request.auth.id != ""';
  const manager = '(@request.auth.role = "administrator" || @request.auth.role = "lead_pastor")';
  const users = app.findCollectionByNameOrId('users');

  const audit = new Collection({ type: 'base', name: 'audit_logs' });
  audit.listRule = `${authenticated} && (actor = @request.auth.id || ${manager})`;
  audit.viewRule = audit.listRule;
  audit.createRule = `${authenticated} && actor = @request.auth.id && @request.body.actorName = @request.auth.name && @request.body.source = "client"`;
  audit.updateRule = null;
  audit.deleteRule = null;
  audit.fields.add(new RelationField({ name: 'actor', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true }));
  audit.fields.add(new TextField({ name: 'actorName', required: true, max: 120 }));
  audit.fields.add(new TextField({ name: 'action', required: true, min: 3, max: 80, pattern: '^[a-z][a-z0-9_]+$' }));
  audit.fields.add(new TextField({ name: 'summary', required: true, max: 500 }));
  audit.fields.add(new TextField({ name: 'entityType', max: 50, pattern: '^[a-z0-9_]*$' }));
  audit.fields.add(new TextField({ name: 'entityId', max: 80 }));
  audit.fields.add(new SelectField({ name: 'source', required: true, maxSelect: 1, values: ['client'] }));
  audit.fields.add(new TextField({ name: 'operationId', required: true, min: 15, max: 15, pattern: '^[a-z0-9]+$' }));
  audit.fields.add(new AutodateField({ name: 'occurredAt', onCreate: true, onUpdate: false }));
  audit.addIndex('idx_audit_logs_operation', true, 'operationId', '');
  audit.addIndex('idx_audit_logs_actor_time', false, 'actor, occurredAt', '');
  audit.addIndex('idx_audit_logs_action_time', false, 'action, occurredAt', '');
  app.save(audit);

  const feedback = new Collection({ type: 'base', name: 'feedback' });
  feedback.listRule = `${authenticated} && (submitter = @request.auth.id || ${manager})`;
  feedback.viewRule = feedback.listRule;
  feedback.createRule = `${authenticated} && submitter = @request.auth.id && @request.body.submitterName = @request.auth.name && @request.body.status = "new" && @request.body.response = "" && @request.body.assignedTo = ""`;
  feedback.updateRule = `${authenticated} && ${manager} && @request.body.submitter:changed = false && @request.body.submitterName:changed = false && @request.body.type:changed = false && @request.body.content:changed = false && @request.body.submittedAt:changed = false`;
  feedback.deleteRule = null;
  feedback.fields.add(new RelationField({ name: 'submitter', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true }));
  feedback.fields.add(new TextField({ name: 'submitterName', required: true, max: 120 }));
  feedback.fields.add(new SelectField({ name: 'type', required: true, maxSelect: 1, values: ['bug', 'suggestion', 'support', 'other'] }));
  feedback.fields.add(new TextField({ name: 'content', required: true, min: 10, max: 2000 }));
  feedback.fields.add(new SelectField({ name: 'status', required: true, maxSelect: 1, values: ['new', 'reviewing', 'resolved'] }));
  feedback.fields.add(new TextField({ name: 'response', max: 2000 }));
  feedback.fields.add(new RelationField({ name: 'assignedTo', collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
  feedback.fields.add(new AutodateField({ name: 'submittedAt', onCreate: true, onUpdate: false }));
  feedback.fields.add(new DateField({ name: 'reviewedAt' }));
  feedback.addIndex('idx_feedback_submitter_time', false, 'submitter, submittedAt', '');
  feedback.addIndex('idx_feedback_status_time', false, 'status, submittedAt', '');
  app.save(feedback);
}, (app) => {
  for (const name of ['feedback', 'audit_logs']) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch { /* Already absent. */ }
  }
});
