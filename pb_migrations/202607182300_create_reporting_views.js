migrate((app) => {
  const reportReader = '@request.auth.id != "" && (@request.auth.role = "administrator" || @request.auth.role = "lead_pastor" || @request.auth.role = "district_pastor")';
  const requests = app.findCollectionByNameOrId('prayer_requests');
  requests.fields.add(new AutodateField({ name: 'submittedAt', onCreate: true, onUpdate: false }));
  requests.addIndex('idx_prayer_requests_submitted_at', false, 'submittedAt', '');
  app.save(requests);

  const views = [
    ['report_overview', `
      SELECT
        'overview0000000' AS id,
        (SELECT COUNT(*) FROM members WHERE status = 'active' AND deleted = 0) AS totalMembers,
        (SELECT COUNT(*) FROM cell_groups WHERE status = 'active') AS activeCells,
        (SELECT COUNT(*) FROM prayer_requests) AS totalPrayers,
        (SELECT COUNT(*) FROM prayer_requests pr WHERE pr.status IN ('submitted', 'assigned') AND NOT EXISTS (SELECT 1 FROM prayer_outcomes po WHERE po.request = pr.id)) AS activePrayers,
        (SELECT COUNT(*) FROM prayer_outcomes) AS answeredPrayers,
        (SELECT COUNT(DISTINCT intercessor) FROM prayer_assignments WHERE status = 'active') AS activeIntercessors,
        (SELECT COUNT(*) FROM training_certificates WHERE status = 'verified') AS verifiedCertificates,
        (SELECT COUNT(*) FROM announcements WHERE status = 'published' AND publishAt <= datetime('now') AND (expiresAt = '' OR expiresAt IS NULL OR expiresAt > datetime('now'))) AS activeAnnouncements
    `],
    ['report_cell_summary', `
      SELECT
        cg.id AS id,
        cg.name AS name,
        COALESCE(NULLIF(u.name, ''), 'Not assigned') AS leader,
        (SELECT COUNT(*) FROM members m WHERE m.cellGroup = cg.id AND m.status = 'active' AND m.deleted = 0) AS membersCount
      FROM cell_groups cg
      LEFT JOIN users u ON u.id = cg.leader
      WHERE cg.status = 'active'
    `],
    ['report_cell_daily', `
      SELECT
        lower(substr(cg.id, 1, 7) || replace(substr(cm.meetingDate, 1, 10), '-', '')) AS id,
        cg.id AS cellGroup,
        substr(cm.meetingDate, 1, 10) AS metricDate,
        COUNT(DISTINCT cm.id) AS meetingsCount,
        COUNT(DISTINCT cr.id) AS reportsCount,
        COUNT(DISTINCT ca.id) AS attendanceCount,
        COUNT(DISTINCT CASE WHEN ca.status = 'present' THEN ca.id END) AS presentCount
      FROM cell_groups cg
      JOIN cell_meetings cm ON cm.cellGroup = cg.id
      LEFT JOIN cell_attendance ca ON ca.meeting = cm.id
      LEFT JOIN cell_reports cr ON cr.meeting = cm.id
      WHERE cg.status = 'active'
      GROUP BY cg.id, substr(cm.meetingDate, 1, 10)
    `],
    ['report_training_summary', `
      SELECT
        t.id AS id,
        t.title AS name,
        t.status AS status,
        (SELECT COUNT(*) FROM training_enrollments e WHERE e.training = t.id AND e.status != 'withdrawn') AS enrolledCount,
        (SELECT COUNT(*) FROM training_enrollments e WHERE e.training = t.id AND e.status = 'completed') AS completedCount,
        (SELECT COUNT(*) FROM training_certificates c WHERE c.training = t.id AND c.status = 'verified') AS certificateCount
      FROM trainings t
      WHERE t.status != 'draft'
    `],
    ['report_prayer_daily', `
      SELECT
        lower(substr(hex(pr.category), 1, 7) || replace(substr(pr.submittedAt, 1, 10), '-', '')) AS id,
        substr(pr.submittedAt, 1, 10) AS metricDate,
        pr.category AS category,
        COUNT(DISTINCT pr.id) AS requestCount,
        COUNT(DISTINCT CASE WHEN po.id IS NULL AND pr.status IN ('submitted', 'assigned') THEN pr.id END) AS activeCount,
        COUNT(DISTINCT po.id) AS answeredCount,
        COALESCE(AVG(CASE WHEN po.id IS NOT NULL THEN julianday(po.reportedAt) - julianday(pr.submittedAt) END), 0) AS averageResponseDays
      FROM prayer_requests pr
      LEFT JOIN prayer_outcomes po ON po.request = pr.id
      WHERE pr.submittedAt != '' AND pr.submittedAt IS NOT NULL
      GROUP BY substr(pr.submittedAt, 1, 10), pr.category
    `],
    ['report_announcement_summary', `
      SELECT
        lower(substr(hex(tag), 1, 15)) AS id,
        tag AS tag,
        COUNT(*) AS totalCount,
        SUM(CASE WHEN status = 'published' AND publishAt <= datetime('now') AND (expiresAt = '' OR expiresAt IS NULL OR expiresAt > datetime('now')) THEN 1 ELSE 0 END) AS activeCount,
        SUM(CASE WHEN status = 'published' AND publishAt > datetime('now') THEN 1 ELSE 0 END) AS scheduledCount,
        SUM(CASE WHEN status = 'archived' OR (expiresAt != '' AND expiresAt IS NOT NULL AND expiresAt <= datetime('now')) THEN 1 ELSE 0 END) AS archivedCount
      FROM announcements
      GROUP BY tag
    `]
  ];

  for (const [name, viewQuery] of views) {
    const view = new Collection({ type: 'view', name, viewQuery });
    view.listRule = reportReader;
    view.viewRule = reportReader;
    app.save(view);
  }
}, (app) => {
  for (const name of ['report_announcement_summary', 'report_prayer_daily', 'report_training_summary', 'report_cell_daily', 'report_cell_summary', 'report_overview']) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch { /* Already absent. */ }
  }
  try {
    const requests = app.findCollectionByNameOrId('prayer_requests');
    requests.fields.removeByName('submittedAt');
    requests.removeIndex('idx_prayer_requests_submitted_at');
    app.save(requests);
  } catch { /* Already absent. */ }
});
