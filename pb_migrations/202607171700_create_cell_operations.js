migrate((app) => {
  const authenticated = '@request.auth.id != ""';
  const leadership = '(@request.auth.role = "administrator" || @request.auth.role = "lead_pastor")';
  const pastoralRead = `(${leadership} || @request.auth.role = "district_pastor")`;
  const users = app.findCollectionByNameOrId('users');
  const members = app.findCollectionByNameOrId('members');
  const cellGroups = app.findCollectionByNameOrId('cell_groups');

  const meetings = new Collection({ type: 'base', name: 'cell_meetings' });
  meetings.listRule = `${authenticated} && (${pastoralRead} || cellGroup.leader = @request.auth.id)`;
  meetings.viewRule = meetings.listRule;
  meetings.createRule = `${authenticated} && ((${leadership}) || (cellGroup.leader = @request.auth.id && createdBy = @request.auth.id))`;
  meetings.updateRule = `${authenticated} && ((${leadership}) || (cellGroup.leader = @request.auth.id && createdBy = @request.auth.id && @request.body.cellGroup:changed = false && @request.body.createdBy:changed = false))`;
  meetings.deleteRule = null;
  meetings.fields.add(new TextField({ name: 'operationId', required: true, max: 80 }));
  meetings.fields.add(new RelationField({ name: 'cellGroup', required: true, collectionId: cellGroups.id, maxSelect: 1, cascadeDelete: false }));
  meetings.fields.add(new DateField({ name: 'meetingDate', required: true }));
  meetings.fields.add(new DateField({ name: 'startedAt', required: true }));
  meetings.fields.add(new DateField({ name: 'endedAt' }));
  meetings.fields.add(new SelectField({ name: 'status', required: true, maxSelect: 1, values: ['scheduled', 'active', 'completed'] }));
  meetings.fields.add(new RelationField({ name: 'createdBy', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
  meetings.addIndex('idx_cell_meetings_operation', true, 'operationId', '');
  meetings.addIndex('idx_cell_meetings_group_date', false, 'cellGroup, meetingDate', '');
  meetings.addIndex('idx_cell_meetings_one_active', true, 'cellGroup', 'status = "active"');
  app.save(meetings);

  const visitors = new Collection({ type: 'base', name: 'cell_visitors' });
  visitors.listRule = `${authenticated} && (${pastoralRead} || cellGroup.leader = @request.auth.id)`;
  visitors.viewRule = visitors.listRule;
  visitors.createRule = `${authenticated} && ((${leadership}) || (cellGroup.leader = @request.auth.id && createdBy = @request.auth.id))`;
  visitors.updateRule = `${authenticated} && ((${leadership}) || (cellGroup.leader = @request.auth.id && createdBy = @request.auth.id && @request.body.cellGroup:changed = false && @request.body.meeting:changed = false && @request.body.createdBy:changed = false))`;
  visitors.deleteRule = null;
  visitors.fields.add(new TextField({ name: 'operationId', required: true, max: 80 }));
  visitors.fields.add(new RelationField({ name: 'meeting', required: true, collectionId: meetings.id, maxSelect: 1, cascadeDelete: false }));
  visitors.fields.add(new RelationField({ name: 'cellGroup', required: true, collectionId: cellGroups.id, maxSelect: 1, cascadeDelete: false }));
  visitors.fields.add(new TextField({ name: 'fullName', required: true, max: 160 }));
  visitors.fields.add(new TextField({ name: 'phone', max: 40 }));
  visitors.fields.add(new SelectField({ name: 'followUpStatus', required: true, maxSelect: 1, values: ['new', 'contacted', 'connected'] }));
  visitors.fields.add(new RelationField({ name: 'createdBy', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
  visitors.addIndex('idx_cell_visitors_operation', true, 'operationId', '');
  visitors.addIndex('idx_cell_visitors_meeting', false, 'meeting', '');
  visitors.addIndex('idx_cell_visitors_group', false, 'cellGroup', '');
  app.save(visitors);

  const attendance = new Collection({ type: 'base', name: 'cell_attendance' });
  attendance.listRule = `${authenticated} && (${pastoralRead} || meeting.cellGroup.leader = @request.auth.id)`;
  attendance.viewRule = attendance.listRule;
  attendance.createRule = `${authenticated} && ((${leadership}) || (meeting.cellGroup.leader = @request.auth.id && markedBy = @request.auth.id))`;
  attendance.updateRule = `${authenticated} && ((${leadership}) || (meeting.cellGroup.leader = @request.auth.id && markedBy = @request.auth.id && @request.body.meeting:changed = false && @request.body.member:changed = false && @request.body.visitor:changed = false && @request.body.markedBy:changed = false))`;
  attendance.deleteRule = null;
  attendance.fields.add(new TextField({ name: 'operationId', required: true, max: 80 }));
  attendance.fields.add(new RelationField({ name: 'meeting', required: true, collectionId: meetings.id, maxSelect: 1, cascadeDelete: false }));
  attendance.fields.add(new RelationField({ name: 'member', collectionId: members.id, maxSelect: 1, cascadeDelete: false }));
  attendance.fields.add(new RelationField({ name: 'visitor', collectionId: visitors.id, maxSelect: 1, cascadeDelete: false }));
  attendance.fields.add(new SelectField({ name: 'status', required: true, maxSelect: 1, values: ['present', 'absent', 'excused'] }));
  attendance.fields.add(new RelationField({ name: 'markedBy', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
  attendance.addIndex('idx_cell_attendance_operation', true, 'operationId', '');
  attendance.addIndex('idx_cell_attendance_member', true, 'meeting, member', 'member != ""');
  attendance.addIndex('idx_cell_attendance_visitor', true, 'meeting, visitor', 'visitor != ""');
  attendance.addIndex('idx_cell_attendance_meeting', false, 'meeting', '');
  app.save(attendance);

  const reports = new Collection({ type: 'base', name: 'cell_reports' });
  reports.listRule = `${authenticated} && (${pastoralRead} || cellGroup.leader = @request.auth.id)`;
  reports.viewRule = reports.listRule;
  reports.createRule = `${authenticated} && ((${leadership}) || (cellGroup.leader = @request.auth.id && submittedBy = @request.auth.id && reportStatus = "pending_review"))`;
  reports.updateRule = `${authenticated} && (${leadership})`;
  reports.deleteRule = null;
  reports.fields.add(new TextField({ name: 'operationId', required: true, max: 80 }));
  reports.fields.add(new RelationField({ name: 'meeting', required: true, collectionId: meetings.id, maxSelect: 1, cascadeDelete: false }));
  reports.fields.add(new RelationField({ name: 'cellGroup', required: true, collectionId: cellGroups.id, maxSelect: 1, cascadeDelete: false }));
  reports.fields.add(new TextField({ name: 'highlights', required: true, max: 4000 }));
  reports.fields.add(new TextField({ name: 'challenges', max: 4000 }));
  reports.fields.add(new SelectField({ name: 'reportStatus', required: true, maxSelect: 1, values: ['pending_review', 'approved', 'rejected'] }));
  reports.fields.add(new RelationField({ name: 'submittedBy', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
  reports.fields.add(new DateField({ name: 'submittedAt', required: true }));
  reports.fields.add(new NumberField({ name: 'attendanceCount', min: 0, onlyInt: true }));
  reports.fields.add(new NumberField({ name: 'excusedCount', min: 0, onlyInt: true }));
  reports.fields.add(new NumberField({ name: 'absentCount', min: 0, onlyInt: true }));
  reports.fields.add(new NumberField({ name: 'visitorCount', min: 0, onlyInt: true }));
  reports.fields.add(new RelationField({ name: 'reviewedBy', collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
  reports.fields.add(new DateField({ name: 'reviewedAt' }));
  reports.fields.add(new TextField({ name: 'reviewNotes', max: 2000 }));
  reports.addIndex('idx_cell_reports_operation', true, 'operationId', '');
  reports.addIndex('idx_cell_reports_meeting', true, 'meeting', '');
  reports.addIndex('idx_cell_reports_group_status', false, 'cellGroup, reportStatus', '');
  app.save(reports);
}, (app) => {
  for (const name of ['cell_reports', 'cell_attendance', 'cell_visitors', 'cell_meetings']) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch { /* Already absent. */ }
  }
});
