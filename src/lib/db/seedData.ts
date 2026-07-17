import {
  db,
  generateUUID,
  putAppSetting,
  type UserRecord,
  type MemberRecord,
  type CellGroupRecord,
  type SectionRecord,
  type TrainingRecord,
  type TrainingEnrollmentRecord,
  type TrainingSessionRecord,
  type TrainingAttendanceRecord,
  type PrayerRequestRecord,
  type PrayerAssignmentRecord,
  type CellMeetingRecord,
  type CellAttendanceRecord,
  type CellReportRecord,
  type NotificationRecord,
  type AuditLogRecord
} from './churchConnectDB';

async function deduplicateAllTables() {
  const tablesToDeduplicate = [
    db.users,
    db.members,
    db.departments,
    db.sections,
    db.cellGroups,
    db.cellMeetings,
    db.cellAttendance,
    db.cellVisitors,
    db.cellReports,
    db.trainings,
    db.trainingSessions,
    db.trainingEnrollments,
    db.trainingAttendance,
    db.trainingCertificates,
    db.prayerRequests,
    db.prayerAssignments,
    db.intercessoryTeams,
    db.notifications,
    db.auditLogs,
    db.feedback
  ];

  for (const table of tablesToDeduplicate) {
    try {
      const records = await table.toArray();
      const seen = new Set<string>();
      const duplicateIds: number[] = [];
      for (const r of records) {
        if (r && typeof r === 'object' && 'localId' in r) {
          const key = (r as any).localId;
          if (seen.has(key)) {
            if (r.id !== undefined) {
              duplicateIds.push(r.id);
            }
          } else {
            seen.add(key);
          }
        }
      }
      if (duplicateIds.length > 0) {
        console.log(`[Deduplicate] Removing ${duplicateIds.length} duplicate records from ${table.name}`);
        await table.bulkDelete(duplicateIds);
      }
    } catch (err) {
      console.error(`Error deduplicating table ${table.name}:`, err);
    }
  }
}

let seedingPromise: Promise<void> | null = null;

export async function seedDatabase() {
  if (seedingPromise) {
    return seedingPromise;
  }

  seedingPromise = (async () => {
    // 1. Clean up any existing duplicates first
    await deduplicateAllTables();

    // 2. Check if already seeded
    const seededSetting = await db.appSettings.where('key').equals('seeded').first();
    if (seededSetting && seededSetting.value === true) {
      console.log('[Seed] Database is already seeded.');
      return;
    }

    console.log('[Seed] Database seeding started...');

  // Clear existing items just in case
  await Promise.all([
    db.users.clear(),
    db.members.clear(),
    db.departments.clear(),
    db.sections.clear(),
    db.cellGroups.clear(),
    db.cellMeetings.clear(),
    db.cellAttendance.clear(),
    db.cellVisitors.clear(),
    db.cellReports.clear(),
    db.outbox.clear(),
    db.trainings.clear(),
    db.trainingSessions.clear(),
    db.trainingEnrollments.clear(),
    db.trainingAttendance.clear(),
    db.trainingCertificates.clear(),
    db.prayerRequests.clear(),
    db.prayerAssignments.clear(),
    db.intercessoryTeams.clear(),
    db.notifications.clear(),
    db.auditLogs.clear(),
    db.feedback.clear(),
    db.appSettings.clear(),
  ]);

  const now = new Date().toISOString();

  // ==========================================
  // A. SEED SECTIONS / DISTRICTS
  // ==========================================
  const centralSectionId = 'sec-central';
  const westSectionId = 'sec-west';

  const sections: SectionRecord[] = [
    {
      localId: centralSectionId,
      name: 'Central District',
      pastorId: 'user-pastor-david',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    },
    {
      localId: westSectionId,
      name: 'West Coast District',
      pastorId: 'user-pastor-west',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    }
  ];
  await db.sections.bulkAdd(sections);

  // ==========================================
  // B. SEED CELL GROUPS
  // ==========================================
  const hopeCellId = 'cell-hope';
  const graceCellId = 'cell-grace';
  const faithCellId = 'cell-faith';

  const cellGroups: CellGroupRecord[] = [
    {
      localId: hopeCellId,
      name: 'Hope Cell',
      leaderId: 'user-cell-leader-michael',
      sectionId: centralSectionId,
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    },
    {
      localId: graceCellId,
      name: 'Grace Cell',
      leaderId: 'user-david-grace',
      sectionId: centralSectionId,
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    },
    {
      localId: faithCellId,
      name: 'Faith Fellowship',
      leaderId: 'user-sarah-faith',
      sectionId: westSectionId,
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    }
  ];
  await db.cellGroups.bulkAdd(cellGroups);

  // ==========================================
  // C. SEED USERS (System Logins / Core Roles)
  // ==========================================
  const users: UserRecord[] = [
    {
      localId: 'user-pastor-david',
      email: 'pastor.david@churchconnect.com',
      name: 'Pastor David',
      role: 'lead_pastor',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    },
    {
      localId: 'user-admin-sarah',
      email: 'sarah.admin@churchconnect.com',
      name: 'Sarah Jenkins',
      role: 'administrator',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    },
    {
      localId: 'user-cell-leader-michael',
      email: 'michael.hope@churchconnect.com',
      name: 'Michael Sterns',
      role: 'cell_leader',
      cellGroupId: hopeCellId,
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    },
    {
      localId: 'user-member-clara',
      email: 'clara.saints@churchconnect.com',
      name: 'Sister Clara',
      role: 'member',
      cellGroupId: hopeCellId,
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    }
  ];
  await db.users.bulkAdd(users);

  // ==========================================
  // D. SEED 10 MEMBERS (across the 3 cell groups)
  // ==========================================
  const members: MemberRecord[] = [
    {
      localId: 'user-cell-leader-michael', // Same as cell leader user
      fullName: 'Michael Sterns',
      email: 'michael.hope@churchconnect.com',
      phone: '+1 (555) 301-2041',
      role: 'cell_leader',
      cellGroupId: hopeCellId,
      sectionId: centralSectionId,
      qrCode: 'PASS_MICHAEL_STERNS',
      avatarText: 'MS',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    },
    {
      localId: 'user-member-clara', // Same as standard member user
      fullName: 'Sister Clara Oswald',
      email: 'clara.saints@churchconnect.com',
      phone: '+1 (555) 902-8841',
      role: 'member',
      cellGroupId: hopeCellId,
      sectionId: centralSectionId,
      qrCode: 'PASS_CLARA_OSWALD',
      avatarText: 'CO',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    },
    {
      localId: 'mem-3',
      fullName: 'John Doe',
      email: 'john.doe@gmail.com',
      phone: '+1 (555) 441-2099',
      role: 'member',
      cellGroupId: hopeCellId,
      sectionId: centralSectionId,
      qrCode: 'PASS_JOHN_DOE',
      avatarText: 'JD',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    },
    {
      localId: 'mem-4',
      fullName: 'Evelyn Carter',
      email: 'evelyn.carter@outlook.com',
      phone: '+1 (555) 881-3004',
      role: 'member',
      cellGroupId: hopeCellId,
      sectionId: centralSectionId,
      qrCode: 'PASS_EVELYN_CARTER',
      avatarText: 'EC',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    },
    {
      localId: 'mem-5',
      fullName: 'David Grace-Leader',
      email: 'david.grace@churchconnect.com',
      phone: '+1 (555) 201-9988',
      role: 'cell_leader',
      cellGroupId: graceCellId,
      sectionId: centralSectionId,
      qrCode: 'PASS_DAVID_GRACE',
      avatarText: 'DG',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    },
    {
      localId: 'mem-6',
      fullName: 'Bro James Miller',
      email: 'james.miller@yahoo.com',
      phone: '+1 (555) 124-9080',
      role: 'member',
      cellGroupId: graceCellId,
      sectionId: centralSectionId,
      qrCode: 'PASS_JAMES_MILLER',
      avatarText: 'JM',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    },
    {
      localId: 'mem-7',
      fullName: 'Sister Abigail Vance',
      email: 'abigail.vance@live.com',
      phone: '+1 (555) 404-3321',
      role: 'member',
      cellGroupId: graceCellId,
      sectionId: centralSectionId,
      qrCode: 'PASS_ABIGAIL_VANCE',
      avatarText: 'AV',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    },
    {
      localId: 'mem-8',
      fullName: 'Sarah Faith-Leader',
      email: 'sarah.faith@churchconnect.com',
      phone: '+1 (555) 902-1200',
      role: 'cell_leader',
      cellGroupId: faithCellId,
      sectionId: westSectionId,
      qrCode: 'PASS_SARAH_FAITH',
      avatarText: 'SF',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    },
    {
      localId: 'mem-9',
      fullName: 'Robert Harrison',
      email: 'robert.h@outlook.com',
      phone: '+1 (555) 334-0192',
      role: 'member',
      cellGroupId: faithCellId,
      sectionId: westSectionId,
      qrCode: 'PASS_ROBERT_HARRISON',
      avatarText: 'RH',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    },
    {
      localId: 'mem-10',
      fullName: 'Tabitha Light',
      email: 'tabitha.light@gmail.com',
      phone: '+1 (555) 890-4123',
      role: 'member',
      cellGroupId: faithCellId,
      sectionId: westSectionId,
      qrCode: 'PASS_TABITHA_LIGHT',
      avatarText: 'TL',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    }
  ];
  await db.members.bulkAdd(members);

  // ==========================================
  // E. SEED 2 TRAINING COURSES
  // ==========================================
  const course1Id = 'course-discipleship-101';
  const course2Id = 'course-leadership-201';

  const trainings: TrainingRecord[] = [
    {
      localId: course1Id,
      title: 'Discipleship Academy 101',
      description: 'Understanding the fundamentals of Christian fellowship, personal prayer altars, and biblical community living.',
      schedule: 'Saturdays at 10:00 AM',
      status: 'ongoing',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    },
    {
      localId: course2Id,
      title: 'Christian Leadership Academy 201',
      description: 'Equipping future Hope Cell leaders with administrative stewardship, relational guidance, and biblical sermon outlining skills.',
      schedule: 'Sundays at 2:00 PM',
      status: 'upcoming',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    }
  ];
  await db.trainings.bulkAdd(trainings);

  // Training enrollments for courses
  const enrollments: TrainingEnrollmentRecord[] = [
    {
      localId: 'enroll-1',
      trainingId: course1Id,
      memberId: 'user-member-clara',
      enrolledAt: now,
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    },
    {
      localId: 'enroll-2',
      trainingId: course1Id,
      memberId: 'mem-3',
      enrolledAt: now,
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    },
    {
      localId: 'enroll-3',
      trainingId: course2Id,
      memberId: 'mem-6',
      enrolledAt: now,
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    }
  ];
  await db.trainingEnrollments.bulkAdd(enrollments);

  // Training Sessions
  const session1Id = 'session-d101-s1';
  const sessions: TrainingSessionRecord[] = [
    {
      localId: session1Id,
      trainingId: course1Id,
      sessionDate: '2026-06-27',
      location: 'Cathedral Hall A',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    }
  ];
  await db.trainingSessions.bulkAdd(sessions);

  // Training Attendance
  const trainingAttendance: TrainingAttendanceRecord[] = [
    {
      localId: 't-att-1',
      sessionId: session1Id,
      memberId: 'user-member-clara',
      scannedAt: '2026-06-27T10:05:00Z',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    }
  ];
  await db.trainingAttendance.bulkAdd(trainingAttendance);

  // ==========================================
  // F. SEED 3 PRAYER REQUESTS (1 Sensitive)
  // ==========================================
  const prayerRequests: PrayerRequestRecord[] = [
    {
      localId: 'prayer-1',
      memberId: 'user-member-clara',
      memberName: 'Sister Clara Oswald',
      category: 'Healing',
      content: 'I request healing prayer for my grandmother suffering from heavy arthritis pain. We believe in the Lord\'s healing touch!',
      isSensitive: false,
      urgency: 'high',
      status: 'assigned',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    },
    {
      localId: 'prayer-2',
      memberId: 'mem-3',
      memberName: 'John Doe',
      category: 'Financial',
      content: 'Going through a confidential job transition. Requesting pastoral prayers for family guidance and financial doors to open this week.',
      isSensitive: true, // SENSITIVE (Accessible only to Lead Pastor & Admin)
      urgency: 'medium',
      status: 'submitted',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    },
    {
      localId: 'prayer-3',
      memberId: 'mem-4',
      memberName: 'Evelyn Carter',
      category: 'Family',
      content: 'Giving thanks for a healthy baby boy! Requesting sealing blessing prayers for the newborn\'s growth and strength in the sanctuary.',
      isSensitive: false,
      urgency: 'low',
      status: 'answered',
      rhemaNotes: 'Isaiah 54:13 - All your children shall be taught by the Lord, and great shall be the peace of your children.',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    }
  ];
  await db.prayerRequests.bulkAdd(prayerRequests);

  // Prayer assignment for the assigned one
  const prayerAssignments: PrayerAssignmentRecord[] = [
    {
      localId: 'assign-1',
      requestId: 'prayer-1',
      intercessorId: 'user-cell-leader-michael',
      intercessorName: 'Michael Sterns',
      prayerCount: 14,
      status: 'active',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    }
  ];
  await db.prayerAssignments.bulkAdd(prayerAssignments);

  // ==========================================
  // G. SEED CELL MEETINGS & REPORTS
  // ==========================================
  const meeting1Id = 'meet-hope-1';
  const meeting2Id = 'meet-hope-2';

  const meetings: CellMeetingRecord[] = [
    {
      localId: meeting1Id,
      cellGroupId: hopeCellId,
      meetingDate: '2026-06-24', // Past week
      status: 'completed',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    },
    {
      localId: meeting2Id,
      cellGroupId: hopeCellId,
      meetingDate: '2026-07-01', // Current week (today)
      status: 'active',
      syncStatus: 'pending', // This is pending to simulate local first sync!
      createdAt: now,
      updatedAt: now
    }
  ];
  await db.cellMeetings.bulkAdd(meetings);

  // Attendance for past meeting
  const attendance: CellAttendanceRecord[] = [
    {
      localId: 'att-1',
      meetingId: meeting1Id,
      memberId: 'user-cell-leader-michael',
      status: 'present',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    },
    {
      localId: 'att-2',
      meetingId: meeting1Id,
      memberId: 'user-member-clara',
      status: 'present',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    },
    {
      localId: 'att-3',
      meetingId: meeting1Id,
      memberId: 'mem-3',
      status: 'present',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    },
    {
      localId: 'att-4',
      meetingId: meeting1Id,
      memberId: 'mem-4',
      status: 'absent',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    }
  ];
  await db.cellAttendance.bulkAdd(attendance);

  // Reports: 1 Approved (past meeting), 1 Pending Review (current)
  const cellReports: CellReportRecord[] = [
    {
      localId: 'rep-1',
      meetingId: meeting1Id,
      cellGroupId: hopeCellId,
      highlights: 'Wonderful fellowship! Sister Clara gave a beautiful testimony regarding family grace. We shared scriptures on loving our neighbors.',
      challenges: 'Evelyn Carter was absent due to work shift conflicts.',
      reportStatus: 'approved',
      submittedBy: 'Michael Sterns',
      attendanceCount: 3,
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now
    },
    {
      localId: 'rep-2',
      meetingId: meeting2Id,
      cellGroupId: hopeCellId,
      highlights: 'Dynamic prayer session tonight! Prayed heavily for global missions and central sanctuary unity.',
      challenges: 'Need assistance arranging transportation for elder members next week.',
      reportStatus: 'pending_review', // PENDING REPORT
      submittedBy: 'Michael Sterns',
      attendanceCount: 4,
      syncStatus: 'pending', // Simulated offline state
      createdAt: now,
      updatedAt: now
    }
  ];
  await db.cellReports.bulkAdd(cellReports);

  // ==========================================
  // H. SEED 5 NOTIFICATIONS
  // ==========================================
  const notifications: NotificationRecord[] = [
    {
      localId: 'not-demo-1',
      userId: 'user-cell-leader-michael',
      type: 'announcement',
      title: 'Divine Awakening Convocation',
      message: 'Pastor David published a pinned announcement: Holy Convocation 2026 starting next Friday.',
      isRead: true,
      createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString()
    },
    {
      localId: 'not-demo-2',
      userId: 'user-cell-leader-michael',
      type: 'prayer',
      title: 'Intercession Duty Assigned',
      message: 'You have been assigned to cover Sister Clara\'s healing request in the regional prayer chain.',
      isRead: true,
      createdAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString()
    },
    {
      localId: 'not-demo-3',
      userId: 'user-cell-leader-michael',
      type: 'certificate',
      title: 'Leadership Level 2 Verified',
      message: 'Your Discipleship Academy certificate for Class 4 is signed by Clergy and ready in your Profile.',
      isRead: false,
      createdAt: new Date(Date.now() - 20 * 3600 * 1000).toISOString()
    },
    {
      localId: 'not-demo-4',
      userId: 'user-cell-leader-michael',
      type: 'report',
      title: 'Cell Attendance Submitted',
      message: 'Hope Cell Leader Michael submitted attendance log details for 12 members yesterday.',
      isRead: false,
      createdAt: new Date(Date.now() - 26 * 3600 * 1000).toISOString()
    },
    {
      localId: 'not-demo-5',
      userId: 'user-cell-leader-michael',
      type: 'member',
      title: 'First-time Seeker Card Recieved',
      message: 'visitor_492 (John Doe) has completed the Seeker form and would like to join Hope Cell.',
      isRead: false,
      createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()
    }
  ];
  await db.notifications.bulkAdd(notifications);

  // Audit Logs
  const auditLogs: AuditLogRecord[] = [
    {
      localId: 'audit-1',
      userId: 'user-admin-sarah',
      userName: 'Sarah Jenkins',
      action: 'database_seed',
      details: 'System database successfully seeded on first launch',
      createdAt: now
    }
  ];
  await db.auditLogs.bulkAdd(auditLogs);

  // ==========================================
  // I. MARK SEEDED
  // ==========================================
  await putAppSetting('seeded', true);
  await putAppSetting('lastSyncTime', now);
  
  console.log('[Seed] Database seeding completed successfully.');
  })();

  return seedingPromise;
}
