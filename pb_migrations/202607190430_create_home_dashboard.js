migrate((app) => {
  const ownDashboard = '@request.auth.id != "" && recipient = @request.auth.id';
  const dashboard = new Collection({
    type: 'view',
    name: 'home_dashboard',
    viewQuery: `
      SELECT
        u.id AS id,
        u.id AS recipient,
        u.role AS role,
        (SELECT COUNT(*) FROM cell_reports cr LEFT JOIN cell_groups cg ON cg.id = cr.cellGroup LEFT JOIN sections s ON s.id = cg.section WHERE cr.reportStatus = 'pending_review' AND (u.role IN ('administrator', 'lead_pastor') OR (u.role = 'district_pastor' AND s.pastor = u.id))) AS pendingReviewCount,
        (SELECT COUNT(*) FROM cell_meetings cm JOIN cell_groups cg ON cg.id = cm.cellGroup LEFT JOIN cell_reports cr ON cr.meeting = cm.id WHERE u.role = 'cell_leader' AND cg.leader = u.id AND cm.status = 'completed' AND cr.id IS NULL) AS dueReportCount,
        (SELECT COUNT(*) FROM members m LEFT JOIN cell_groups cg ON cg.id = m.cellGroup LEFT JOIN sections s ON s.id = m.section WHERE m.status = 'active' AND m.deleted = 0 AND (u.role IN ('administrator', 'lead_pastor') OR (u.role = 'district_pastor' AND s.pastor = u.id) OR (u.role = 'cell_leader' AND cg.leader = u.id))) AS memberCount,
        (SELECT COUNT(*) FROM cell_groups cg LEFT JOIN sections s ON s.id = cg.section WHERE cg.status = 'active' AND (u.role IN ('administrator', 'lead_pastor') OR (u.role = 'district_pastor' AND s.pastor = u.id) OR (u.role = 'cell_leader' AND cg.leader = u.id))) AS activeCellCount,
        (SELECT COALESCE(SUM(cr.attendanceCount), 0) FROM cell_reports cr LEFT JOIN cell_groups cg ON cg.id = cr.cellGroup LEFT JOIN sections s ON s.id = cg.section WHERE cr.reportStatus != 'rejected' AND cr.submittedAt >= datetime('now', '-7 days') AND (u.role IN ('administrator', 'lead_pastor') OR (u.role = 'district_pastor' AND s.pastor = u.id) OR (u.role = 'cell_leader' AND cg.leader = u.id))) AS weeklyAttendance,
        (SELECT COUNT(*) FROM trainings t WHERE t.status IN ('upcoming', 'ongoing')) AS activeCourseCount,
        (SELECT COUNT(*) FROM training_enrollments te JOIN members m ON m.id = te.member WHERE m.user = u.id AND te.status IN ('enrolled', 'completed')) AS enrollmentCount,
        (SELECT COUNT(*) FROM training_attendance ta JOIN training_enrollments te ON te.member = ta.member JOIN members m ON m.id = te.member JOIN training_sessions ts ON ts.id = ta.session WHERE m.user = u.id AND te.status IN ('enrolled', 'completed') AND ts.training = te.training) AS academyAttendedSessions,
        (SELECT COALESCE(SUM(t.totalSessions), 0) FROM training_enrollments te JOIN members m ON m.id = te.member JOIN trainings t ON t.id = te.training WHERE m.user = u.id AND te.status IN ('enrolled', 'completed')) AS academyTotalSessions,
        COALESCE((SELECT t.title FROM training_enrollments te JOIN members m ON m.id = te.member JOIN trainings t ON t.id = te.training WHERE m.user = u.id AND te.status = 'enrolled' ORDER BY te.enrolledAt DESC LIMIT 1), '') AS currentCourseTitle
      FROM users u
      WHERE u.status = 'active'
    `
  });
  dashboard.listRule = ownDashboard;
  dashboard.viewRule = ownDashboard;
  app.save(dashboard);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId('home_dashboard')); } catch { /* Already absent. */ }
});
