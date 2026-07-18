import { db, putAppSetting } from './churchConnectDB';

/**
 * Removes the pre-PocketBase demo dataset once without touching account-scoped
 * server caches or durable outbox work. Production never seeds personas.
 */
export async function retireLegacyDemoData(): Promise<void> {
  const marker = await db.appSettings.where('key').equals('legacyDemoRetiredV1').first();
  if (marker?.value === true) return;
  const tables = [
    db.users, db.members, db.departments, db.sections, db.cellGroups,
    db.cellMeetings, db.cellAttendance, db.cellVisitors, db.cellReports,
    db.trainings, db.trainingSessions, db.trainingEnrollments,
    db.trainingAttendance, db.trainingCertificates, db.announcements,
    db.prayerRequests, db.prayerAssignments, db.intercessoryTeams,
    db.notifications, db.auditLogs, db.feedback
  ];
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((table) => table
      .filter((record: { cacheOwnerId?: string; remoteId?: string }) => !record.cacheOwnerId && !record.remoteId)
      .delete()));
  });
  await db.appSettings.where('key').anyOf('seeded', 'lastSyncTime').delete();
  await putAppSetting('legacyDemoRetiredV1', true);
}
