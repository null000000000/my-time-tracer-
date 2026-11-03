export type ProjectStatus = 'active' | 'completed' | 'archived';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'todo';
export type PomodoroType = 'work' | 'short_break' | 'long_break';
export type AutoActivityStatus = 'pending' | 'converted' | 'dismissed';

export interface UserSettings {
  userId: string;
  email?: string;
  displayName?: string;
  timeFormat: '12h' | '24h';
  weekStart: 'monday' | 'sunday';
  pomodoroWorkMinutes: number;
  pomodoroShortBreakMinutes: number;
  pomodoroLongBreakMinutes: number;
  pomodoroSessionsBeforeLong: number;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkspaceImportRecord {
  id: string;
  userId: string;
  sourceFileName?: string;
  createdAt: string;
  counts: {
    projects: number;
    tasks: number;
    timeEntries: number;
    calendarEvents: number;
  };
  schemaVersion: number;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description?: string;
  color: string;
  status: ProjectStatus;
  startDate?: string;
  deadline?: string;
  budgetHours?: number;
  parentId?: string | null;
  showOnCalendar?: boolean;
  importId?: string;
  createdAt: string;
  updatedAt: string;
}

export type CalendarEventType = 'event' | 'deadline' | 'study' | 'milestone';

export interface CalendarEvent {
  id: string;
  userId: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  startTime?: string;
  endTime?: string;
  projectId?: string;
  color?: string;
  type: CalendarEventType;
  isCompleted?: boolean;
  importId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  userId: string;
  projectId: string; // ID of the Project or Subproject it belongs to
  name: string;
  description?: string;
  status: TaskStatus;
  estimatedHours?: number;
  deadline?: string;
  scheduledDate?: string; // Explicit day assigned for calendar (YYYY-MM-DD)
  importId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimeEntry {
  id: string;
  userId: string;
  projectId?: string;
  taskId?: string;
  description: string;
  tags: string[];
  startTime: number; // Unix timestamp in ms
  endTime: number;   // Unix timestamp in ms
  duration: number;  // Duration in seconds
  isManual: boolean;
  importId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActiveTimer {
  userId: string;
  projectId?: string;
  taskId?: string;
  description: string;
  tags: string[];
  startTime: number; // Unix timestamp in ms when started or resumed
  isPaused: boolean;
  accumulatedSeconds: number; // Seconds counted before the latest pause
  lastPausedAt?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PomodoroSession {
  id: string;
  userId: string;
  projectId?: string;
  taskId?: string;
  type: PomodoroType;
  durationMinutes: number;
  completedAt: number;
  loggedAsTimeEntry: boolean;
  createdAt: string;
}

export interface Reminder {
  id: string;
  userId: string;
  title: string;
  description?: string;
  scheduledTime: number; // Unix timestamp in ms
  isRecurring: boolean;
  recurrenceRule?: 'daily' | 'weekdays' | 'weekly' | 'custom';
  isCompleted: boolean;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AutoActivity {
  id: string;
  userId: string;
  appName: string;
  windowTitle: string;
  durationSeconds: number;
  category?: string;
  detectedAt: number; // Unix timestamp in ms
  status: AutoActivityStatus;
  createdAt: string;
}

export interface TimeAuditIssue {
  id: string;
  type: 'overlap' | 'missing_description' | 'long_session' | 'inconsistent_time' | 'unassigned_project';
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  entryIds: string[];
  entries: TimeEntry[];
}

export type NavigationTab =
  | 'dashboard'
  | 'tracker'
  | 'projects'
  | 'timesheet'
  | 'calendar'
  | 'reports'
  | 'pomodoro'
  | 'estimates'
  | 'autotracker'
  | 'reminders_audit'
  | 'settings';
