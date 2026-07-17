migrate((app) => {
  const authenticated = '@request.auth.id != ""';
  const manager = '(@request.auth.role = "administrator" || @request.auth.role = "lead_pastor")';
  const users = app.findCollectionByNameOrId('users');
  const members = app.findCollectionByNameOrId('members');

  const trainings = new Collection({ type: 'base', name: 'trainings' });
  trainings.listRule = `${authenticated} && (status != "draft" || ${manager})`;
  trainings.viewRule = trainings.listRule;
  trainings.createRule = `${authenticated} && ${manager}`;
  trainings.updateRule = `${authenticated} && ${manager}`;
  trainings.deleteRule = null;
  trainings.fields.add(new TextField({ name: 'code', required: true, max: 40 }));
  trainings.fields.add(new TextField({ name: 'title', required: true, max: 180 }));
  trainings.fields.add(new TextField({ name: 'description', max: 4000 }));
  trainings.fields.add(new TextField({ name: 'schedule', max: 240 }));
  trainings.fields.add(new SelectField({ name: 'status', required: true, maxSelect: 1, values: ['draft', 'upcoming', 'ongoing', 'completed'] }));
  trainings.fields.add(new DateField({ name: 'startDate' }));
  trainings.fields.add(new DateField({ name: 'endDate' }));
  trainings.fields.add(new NumberField({ name: 'totalSessions', min: 1, max: 100, onlyInt: true }));
  trainings.fields.add(new NumberField({ name: 'requiredAttendanceRate', min: 0, max: 100, onlyInt: true }));
  trainings.fields.add(new NumberField({ name: 'maxEnrollment', min: 0, onlyInt: true }));
  trainings.fields.add(new TextField({ name: 'startTime', max: 10 }));
  trainings.fields.add(new NumberField({ name: 'lateGraceMinutes', min: 0, max: 240, onlyInt: true }));
  trainings.fields.add(new RelationField({ name: 'createdBy', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
  trainings.addIndex('idx_trainings_code', true, 'code', '');
  trainings.addIndex('idx_trainings_status_dates', false, 'status, startDate, endDate', '');
  app.save(trainings);

  const sessions = new Collection({ type: 'base', name: 'training_sessions' });
  sessions.listRule = `${authenticated} && (training.status != "draft" || ${manager})`;
  sessions.viewRule = sessions.listRule;
  sessions.createRule = `${authenticated} && ${manager}`;
  sessions.updateRule = `${authenticated} && ${manager}`;
  sessions.deleteRule = null;
  sessions.fields.add(new RelationField({ name: 'training', required: true, collectionId: trainings.id, maxSelect: 1, cascadeDelete: false }));
  sessions.fields.add(new NumberField({ name: 'sessionNumber', required: true, min: 1, max: 100, onlyInt: true }));
  sessions.fields.add(new DateField({ name: 'sessionDate', required: true }));
  sessions.fields.add(new TextField({ name: 'location', max: 240 }));
  sessions.fields.add(new SelectField({ name: 'status', required: true, maxSelect: 1, values: ['scheduled', 'completed', 'cancelled'] }));
  sessions.fields.add(new RelationField({ name: 'createdBy', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
  sessions.addIndex('idx_training_sessions_number', true, 'training, sessionNumber', '');
  sessions.addIndex('idx_training_sessions_date', false, 'sessionDate, status', '');
  app.save(sessions);

  const enrollments = new Collection({ type: 'base', name: 'training_enrollments' });
  enrollments.listRule = `${authenticated} && (${manager} || member.user = @request.auth.id)`;
  enrollments.viewRule = enrollments.listRule;
  enrollments.createRule = `${authenticated} && (${manager} || (member.user = @request.auth.id && enrolledBy = @request.auth.id && status = "enrolled" && training.status != "draft" && training.status != "completed"))`;
  enrollments.updateRule = `${authenticated} && ${manager} && @request.body.training:changed = false && @request.body.member:changed = false`;
  enrollments.deleteRule = null;
  enrollments.fields.add(new RelationField({ name: 'training', required: true, collectionId: trainings.id, maxSelect: 1, cascadeDelete: false }));
  enrollments.fields.add(new RelationField({ name: 'member', required: true, collectionId: members.id, maxSelect: 1, cascadeDelete: false }));
  enrollments.fields.add(new SelectField({ name: 'status', required: true, maxSelect: 1, values: ['enrolled', 'withdrawn', 'completed'] }));
  enrollments.fields.add(new DateField({ name: 'enrolledAt', required: true }));
  enrollments.fields.add(new RelationField({ name: 'enrolledBy', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
  enrollments.addIndex('idx_training_enrollments_unique', true, 'training, member', '');
  enrollments.addIndex('idx_training_enrollments_member_status', false, 'member, status', '');
  app.save(enrollments);

  const attendance = new Collection({ type: 'base', name: 'training_attendance' });
  attendance.listRule = `${authenticated} && (${manager} || member.user = @request.auth.id)`;
  attendance.viewRule = attendance.listRule;
  attendance.createRule = `${authenticated} && ${manager}`;
  attendance.updateRule = null;
  attendance.deleteRule = null;
  attendance.fields.add(new TextField({ name: 'operationId', required: true, max: 80 }));
  attendance.fields.add(new RelationField({ name: 'session', required: true, collectionId: sessions.id, maxSelect: 1, cascadeDelete: false }));
  attendance.fields.add(new RelationField({ name: 'member', required: true, collectionId: members.id, maxSelect: 1, cascadeDelete: false }));
  attendance.fields.add(new DateField({ name: 'scannedAt', required: true }));
  attendance.fields.add(new SelectField({ name: 'timing', required: true, maxSelect: 1, values: ['on_time', 'late'] }));
  attendance.fields.add(new RelationField({ name: 'markedBy', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
  attendance.addIndex('idx_training_attendance_operation', true, 'operationId', '');
  attendance.addIndex('idx_training_attendance_unique', true, 'session, member', '');
  attendance.addIndex('idx_training_attendance_member', false, 'member, scannedAt', '');
  app.save(attendance);

  const certificates = new Collection({ type: 'base', name: 'training_certificates' });
  certificates.listRule = `${authenticated} && (${manager} || member.user = @request.auth.id)`;
  certificates.viewRule = certificates.listRule;
  certificates.createRule = `${authenticated} && (@request.auth.role = "lead_pastor" || (@request.auth.role = "administrator" && status = "pending" && verifiedBy = ""))`;
  certificates.updateRule = `${authenticated} && @request.auth.role = "lead_pastor" && @request.body.training:changed = false && @request.body.member:changed = false && @request.body.certificateNumber:changed = false && @request.body.requestedBy:changed = false`;
  certificates.deleteRule = null;
  certificates.fields.add(new RelationField({ name: 'training', required: true, collectionId: trainings.id, maxSelect: 1, cascadeDelete: false }));
  certificates.fields.add(new RelationField({ name: 'member', required: true, collectionId: members.id, maxSelect: 1, cascadeDelete: false }));
  certificates.fields.add(new TextField({ name: 'certificateNumber', required: true, max: 80 }));
  certificates.fields.add(new SelectField({ name: 'status', required: true, maxSelect: 1, values: ['pending', 'verified'] }));
  certificates.fields.add(new NumberField({ name: 'attendanceRate', min: 0, max: 100, onlyInt: true }));
  certificates.fields.add(new DateField({ name: 'issuedAt', required: true }));
  certificates.fields.add(new RelationField({ name: 'requestedBy', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
  certificates.fields.add(new RelationField({ name: 'verifiedBy', collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
  certificates.fields.add(new DateField({ name: 'verifiedAt' }));
  certificates.addIndex('idx_training_certificates_unique', true, 'training, member', '');
  certificates.addIndex('idx_training_certificates_number', true, 'certificateNumber', '');
  certificates.addIndex('idx_training_certificates_status', false, 'status, issuedAt', '');
  app.save(certificates);
}, (app) => {
  for (const name of ['training_certificates', 'training_attendance', 'training_enrollments', 'training_sessions', 'trainings']) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch { /* Already absent. */ }
  }
});
