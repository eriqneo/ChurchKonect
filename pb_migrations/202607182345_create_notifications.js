migrate((app) => {
  const authenticated = '@request.auth.id != ""';
  const ownReceipt = 'recipient = @request.auth.id';
  const users = app.findCollectionByNameOrId('users');

  const receipts = new Collection({ type: 'base', name: 'notification_receipts' });
  receipts.listRule = `${authenticated} && ${ownReceipt}`;
  receipts.viewRule = receipts.listRule;
  receipts.createRule = receipts.listRule;
  receipts.updateRule = `${authenticated} && ${ownReceipt} && @request.body.recipient:changed = false && @request.body.notificationKey:changed = false`;
  receipts.deleteRule = null;
  receipts.fields.add(new RelationField({ name: 'recipient', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true }));
  receipts.fields.add(new TextField({ name: 'notificationKey', required: true, min: 15, max: 15, pattern: '^[a-z0-9]+$' }));
  receipts.fields.add(new BoolField({ name: 'isRead' }));
  receipts.fields.add(new BoolField({ name: 'dismissed' }));
  receipts.fields.add(new DateField({ name: 'readAt' }));
  receipts.fields.add(new DateField({ name: 'dismissedAt' }));
  receipts.fields.add(new AutodateField({ name: 'createdAt', onCreate: true, onUpdate: false }));
  receipts.fields.add(new AutodateField({ name: 'updatedAt', onCreate: true, onUpdate: true }));
  receipts.addIndex('idx_notification_receipts_unique', true, 'recipient, notificationKey', '');
  receipts.addIndex('idx_notification_receipts_recipient_updated', false, 'recipient, updatedAt', '');
  app.save(receipts);

  const reminders = new Collection({ type: 'base', name: 'notification_reminders' });
  reminders.listRule = `${authenticated} && (recipient = @request.auth.id || sender = @request.auth.id)`;
  reminders.viewRule = reminders.listRule;
  reminders.createRule = `${authenticated} && sender = @request.auth.id && eventType = "cell_report_reminder" && (@request.auth.role = "administrator" || @request.auth.role = "lead_pastor" || @request.auth.role = "district_pastor")`;
  reminders.updateRule = null;
  reminders.deleteRule = null;
  reminders.fields.add(new RelationField({ name: 'recipient', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true }));
  reminders.fields.add(new RelationField({ name: 'sender', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true }));
  reminders.fields.add(new SelectField({ name: 'eventType', required: true, maxSelect: 1, values: ['cell_report_reminder'] }));
  reminders.fields.add(new TextField({ name: 'contextId', required: true, max: 40 }));
  reminders.fields.add(new TextField({ name: 'contextLabel', required: true, max: 120 }));
  reminders.fields.add(new TextField({ name: 'sourceKey', required: true, max: 80 }));
  reminders.fields.add(new AutodateField({ name: 'eventAt', onCreate: true, onUpdate: false }));
  reminders.addIndex('idx_notification_reminders_source', true, 'sourceKey', '');
  reminders.addIndex('idx_notification_reminders_recipient_time', false, 'recipient, eventAt', '');
  app.save(reminders);

  const viewRule = `${authenticated} && recipient = @request.auth.id`;
  const views = [
    ['notification_announcements', `
      SELECT
        lower(substr(a.id, 1, 7) || substr(u.id, 1, 7) || 'a') AS id,
        u.id AS recipient,
        'announcement' AS type,
        'New announcement' AS title,
        a.title AS message,
        'announcements' AS actionUrl,
        a.publishAt AS eventAt
      FROM announcements a
      JOIN users u ON u.status = 'active'
      WHERE a.status IN ('published', 'archived') AND a.publishAt <= datetime('now')
    `],
    ['notification_prayer_assignments', `
      SELECT
        lower(substr(pa.id, 1, 7) || substr(pa.intercessor, 1, 7) || 'p') AS id,
        pa.intercessor AS recipient,
        'prayer' AS type,
        'Intercession assigned' AS title,
        printf('A %s prayer request has been assigned to you.', lower(pa.requestCategory)) AS message,
        'prayers' AS actionUrl,
        pa.assignedAt AS eventAt
      FROM prayer_assignments pa
    `],
    ['notification_prayer_outcomes', `
      SELECT
        lower(substr(po.id, 1, 7) || substr(pr.submitter, 1, 7) || 'o') AS id,
        pr.submitter AS recipient,
        'prayer' AS type,
        'Prayer outcome recorded' AS title,
        'An answered outcome has been recorded for your prayer request.' AS message,
        'prayers' AS actionUrl,
        po.reportedAt AS eventAt
      FROM prayer_outcomes po
      JOIN prayer_requests pr ON pr.id = po.request
    `],
    ['notification_report_submissions', `
      SELECT
        lower(substr(cr.id, 1, 7) || substr(u.id, 1, 7) || 's') AS id,
        u.id AS recipient,
        'report' AS type,
        'Cell report submitted' AS title,
        printf('%s submitted a fellowship report with %d present.', cg.name, cr.attendanceCount) AS message,
        'cells' AS actionUrl,
        cr.submittedAt AS eventAt
      FROM cell_reports cr
      JOIN cell_groups cg ON cg.id = cr.cellGroup
      JOIN users u ON u.status = 'active' AND u.role IN ('administrator', 'lead_pastor', 'district_pastor')
    `],
    ['notification_report_reviews', `
      SELECT
        lower(substr(cr.id, 1, 7) || substr(cr.submittedBy, 1, 7) || 'r') AS id,
        cr.submittedBy AS recipient,
        'report' AS type,
        'Cell report approved' AS title,
        printf('%s fellowship report has been approved.', cg.name) AS message,
        'cells' AS actionUrl,
        cr.reviewedAt AS eventAt
      FROM cell_reports cr
      JOIN cell_groups cg ON cg.id = cr.cellGroup
      WHERE cr.reportStatus = 'approved' AND cr.reviewedAt != '' AND cr.reviewedAt IS NOT NULL
    `],
    ['notification_certificates', `
      SELECT
        lower(substr(tc.id, 1, 7) || substr(m.user, 1, 7) || 'c') AS id,
        m.user AS recipient,
        'certificate' AS type,
        'Certificate verified' AS title,
        printf('%s certificate is verified and ready.', t.title) AS message,
        'academy' AS actionUrl,
        COALESCE(NULLIF(tc.verifiedAt, ''), tc.issuedAt) AS eventAt
      FROM training_certificates tc
      JOIN members m ON m.id = tc.member
      JOIN trainings t ON t.id = tc.training
      WHERE tc.status = 'verified' AND m.user != '' AND m.user IS NOT NULL
    `],
    ['notification_enrollments', `
      SELECT
        lower(substr(te.id, 1, 7) || substr(m.user, 1, 7) || 'e') AS id,
        m.user AS recipient,
        'system' AS type,
        'Academy enrollment confirmed' AS title,
        printf('You are enrolled in %s.', t.title) AS message,
        'academy' AS actionUrl,
        te.enrolledAt AS eventAt
      FROM training_enrollments te
      JOIN members m ON m.id = te.member
      JOIN trainings t ON t.id = te.training
      WHERE te.status IN ('enrolled', 'completed') AND m.user != '' AND m.user IS NOT NULL
    `],
    ['notification_report_reminders', `
      SELECT
        lower(substr(nr.id, 1, 7) || substr(nr.recipient, 1, 7) || 'm') AS id,
        nr.recipient AS recipient,
        'report' AS type,
        'Cell report reminder' AS title,
        printf('Please submit the weekly fellowship report for %s.', nr.contextLabel) AS message,
        'cells' AS actionUrl,
        nr.eventAt AS eventAt
      FROM notification_reminders nr
    `]
  ];

  for (const [name, viewQuery] of views) {
    const view = new Collection({ type: 'view', name, viewQuery });
    view.listRule = viewRule;
    view.viewRule = viewRule;
    app.save(view);
  }
}, (app) => {
  for (const name of [
    'notification_report_reminders', 'notification_enrollments', 'notification_certificates', 'notification_report_reviews',
    'notification_report_submissions', 'notification_prayer_outcomes',
    'notification_prayer_assignments', 'notification_announcements', 'notification_reminders', 'notification_receipts'
  ]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch { /* Already absent. */ }
  }
});
