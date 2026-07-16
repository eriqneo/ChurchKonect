import React from 'react';
import { 
  Users, 
  LayoutGrid, 
  Calendar, 
  ClipboardCheck, 
  BookOpen, 
  GraduationCap, 
  Award, 
  HeartHandshake, 
  Bell, 
  Search, 
  Megaphone 
} from 'lucide-react';

// Custom HandsPraying SVG icon for Altar Watch
export const HandsPrayingIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {/* Stylized premium prayer hands */}
    <path d="M12 3c-1.2 0-2.4.8-2.8 2L7 11.5c-.3.8-.3 1.7 0 2.5l2.2 5.5c.4 1.2 1.6 2 2.8 2s2.4-.8 2.8-2l2.2-5.5c.3-.8.3-1.7 0-2.5L14.8 5c-.4-1.2-1.6-2-2.8-2Z" />
    <path d="M10 8c-2 0-3.5 1.5-3.5 3.5s1.5 3.5 3.5 3.5" />
    <path d="M14 8c2 0 3.5 1.5 3.5 3.5s-1.5 3.5-3.5 3.5" />
    <path d="M12 3v18" strokeDasharray="2 2" />
  </svg>
);

export interface EmptyStateModuleConfig {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: { label: string };
}

export const MODULE_EMPTY_STATES: Record<string, EmptyStateModuleConfig> = {
  members: {
    icon: <Users />,
    title: 'No members yet',
    description: 'Start building your congregation and tracking your discipleship path.',
    action: { label: 'Enroll Member' }
  },
  cellGroups: {
    icon: <LayoutGrid />,
    title: 'No cell groups',
    description: 'Organize your fellowship structure and group assignments.',
    action: { label: 'Create Group' }
  },
  cellAttendance: {
    icon: <Calendar />,
    title: 'No fellowship today',
    description: 'Start a fellowship meeting to take attendance and log highlights.',
    action: { label: 'Start Fellowship' }
  },
  pendingReports: {
    icon: <ClipboardCheck />,
    title: 'All reports reviewed',
    description: 'Reports will appear here when cell leaders submit them for approval.'
  },
  trainingCourses: {
    icon: <BookOpen />,
    title: 'No courses available',
    description: 'Launch your first discipleship track to empower leaders.',
    action: { label: 'Create Course' }
  },
  enrolledCourses: {
    icon: <GraduationCap />,
    title: 'Not enrolled yet',
    description: 'Browse available courses to start learning and advancing.',
    action: { label: 'Browse Academy' }
  },
  certificates: {
    icon: <Award />,
    title: 'No certificates yet',
    description: 'Complete a course to earn your first certified credential.'
  },
  prayerRequests: {
    icon: <HeartHandshake />,
    title: 'No prayer requests',
    description: "When members submit prayers, they'll appear here for intercession."
  },
  altarWatch: {
    icon: <HandsPrayingIcon />,
    title: 'No active assignments',
    description: "Rest in peace — you'll be notified when prayers need your watch."
  },
  notifications: {
    icon: <Bell />,
    title: 'All caught up',
    description: "You'll be notified here of important updates and action items."
  },
  searchResults: {
    icon: <Search />,
    title: 'No results',
    description: 'Try checking your spelling or using different terms.'
  },
  announcements: {
    icon: <Megaphone />,
    title: 'No announcements',
    description: 'Share news, events, and words of encouragement with your congregation.',
    action: { label: 'Create Announcement' }
  }
};

/**
 * Helper to get a configured empty state with a custom search term if needed.
 */
export function getSearchEmptyState(query: string): EmptyStateModuleConfig {
  return {
    icon: <Search />,
    title: `No results for "${query}"`,
    description: 'Try checking your spelling or using different search terms.'
  };
}
