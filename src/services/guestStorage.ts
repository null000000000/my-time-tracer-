import {
  Project,
  Task,
  TimeEntry,
  ActiveTimer,
  PomodoroSession,
  Reminder,
  AutoActivity,
  CalendarEvent,
  UserSettings,
  WorkspaceImportRecord,
} from '../types';

export const CHRONOS_GUEST_SESSION_KEY = 'chronos_guest_session_v1';

export interface GuestSessionData {
  version: 1;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  projects: Project[];
  tasks: Task[];
  calendarEvents: CalendarEvent[];
  timeEntries: TimeEntry[];
  pomodoroSessions: PomodoroSession[];
  reminders: Reminder[];
  autoActivities: AutoActivity[];
  imports?: WorkspaceImportRecord[];
  activeTimer: ActiveTimer | null;
  preferences: UserSettings;
}

export interface GuestDataCounts {
  rootProjects: number;
  subprojects: number;
  totalProjects: number;
  tasks: number;
  calendarEvents: number;
  timeEntries: number;
  pomodoroSessions: number;
  reminders: number;
}

export const defaultGuestSettings: UserSettings = {
  userId: 'guest',
  timeFormat: '24h',
  weekStart: 'monday',
  pomodoroWorkMinutes: 25,
  pomodoroShortBreakMinutes: 5,
  pomodoroLongBreakMinutes: 15,
  pomodoroSessionsBeforeLong: 4,
  soundEnabled: true,
  notificationsEnabled: true,
};

// In-memory fallback if sessionStorage is blocked by high-security browser policies
let memoryFallback: GuestSessionData | null = null;

// Event listeners for simulated real-time updates
type ListenerType =
  | 'projects'
  | 'tasks'
  | 'calendarEvents'
  | 'timeEntries'
  | 'pomodoroSessions'
  | 'reminders'
  | 'autoActivities'
  | 'activeTimer';

const listeners: Record<ListenerType, Set<(data: any) => void>> = {
  projects: new Set(),
  tasks: new Set(),
  calendarEvents: new Set(),
  timeEntries: new Set(),
  pomodoroSessions: new Set(),
  reminders: new Set(),
  autoActivities: new Set(),
  activeTimer: new Set(),
};

function notifyListeners(type: ListenerType, data: any) {
  const set = listeners[type];
  if (set) {
    set.forEach((fn) => {
      try {
        fn(data);
      } catch (err) {
        console.error(`Error notifying guest listener [${type}]:`, err);
      }
    });
  }
}

/**
 * Safely read from sessionStorage
 */
export function getGuestSession(): GuestSessionData | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return memoryFallback;
    }
    const raw = window.sessionStorage.getItem(CHRONOS_GUEST_SESSION_KEY);
    if (!raw) return memoryFallback;
    const parsed = JSON.parse(raw) as GuestSessionData;
    if (parsed && parsed.version === 1 && parsed.sessionId) {
      return parsed;
    }
    return null;
  } catch (err) {
    console.warn('Failed reading guest session from sessionStorage, using in-memory store:', err);
    return memoryFallback;
  }
}

/**
 * Safely write to sessionStorage
 */
export function saveGuestSession(session: GuestSessionData): boolean {
  try {
    session.updatedAt = new Date().toISOString();
    memoryFallback = session;
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(CHRONOS_GUEST_SESSION_KEY, JSON.stringify(session));
      return true;
    }
    return true;
  } catch (err) {
    console.error('Failed saving guest session to sessionStorage:', err);
    return false;
  }
}

/**
 * Clear guest session completely
 */
export function clearGuestSession(): void {
  memoryFallback = null;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(CHRONOS_GUEST_SESSION_KEY);
    }
  } catch (err) {
    console.error('Failed clearing guest session:', err);
  }
}

/**
 * Check if a guest session is currently stored
 */
export function isGuestSessionActive(): boolean {
  return Boolean(getGuestSession());
}

/**
 * Initialize a brand new clean guest workspace
 */
export function initGuestSession(): GuestSessionData {
  const sessionId = `guest_sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const now = new Date().toISOString();

  const newSession: GuestSessionData = {
    version: 1,
    sessionId,
    createdAt: now,
    updatedAt: now,
    projects: [],
    tasks: [],
    calendarEvents: [],
    timeEntries: [],
    pomodoroSessions: [],
    reminders: [],
    autoActivities: [],
    imports: [],
    activeTimer: null,
    preferences: {
      ...defaultGuestSettings,
      userId: sessionId,
      displayName: 'Guest Engineer',
      createdAt: now,
      updatedAt: now,
    },
  };

  saveGuestSession(newSession);
  return newSession;
}

/**
 * Check if the guest session contains any user-created data
 */
export function hasGuestData(session?: GuestSessionData | null): boolean {
  const s = session || getGuestSession();
  if (!s) return false;
  return (
    s.projects.length > 0 ||
    s.tasks.length > 0 ||
    s.calendarEvents.length > 0 ||
    s.timeEntries.length > 0 ||
    s.pomodoroSessions.length > 0 ||
    s.reminders.length > 0 ||
    s.autoActivities.length > 0 ||
    Boolean(s.activeTimer)
  );
}

/**
 * Get itemized breakdown counts for data review
 */
export function getGuestDataCounts(session?: GuestSessionData | null): GuestDataCounts {
  const s = session || getGuestSession();
  if (!s) {
    return {
      rootProjects: 0,
      subprojects: 0,
      totalProjects: 0,
      tasks: 0,
      calendarEvents: 0,
      timeEntries: 0,
      pomodoroSessions: 0,
      reminders: 0,
    };
  }

  const rootProjects = s.projects.filter((p) => !p.parentId).length;
  const subprojects = s.projects.filter((p) => Boolean(p.parentId)).length;

  return {
    rootProjects,
    subprojects,
    totalProjects: s.projects.length,
    tasks: s.tasks.length,
    calendarEvents: s.calendarEvents.length,
    timeEntries: s.timeEntries.length,
    pomodoroSessions: s.pomodoroSessions.length,
    reminders: s.reminders.length,
  };
}

/* ---------------- SUBSCRIPTIONS ---------------- */

export function subscribeGuestProjects(callback: (projects: Project[]) => void): () => void {
  listeners.projects.add(callback);
  const session = getGuestSession();
  const sorted = (session?.projects || []).slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  callback(sorted);
  return () => {
    listeners.projects.delete(callback);
  };
}

export function subscribeGuestTasks(callback: (tasks: Task[]) => void): () => void {
  listeners.tasks.add(callback);
  const session = getGuestSession();
  const sorted = (session?.tasks || []).slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  callback(sorted);
  return () => {
    listeners.tasks.delete(callback);
  };
}

export function subscribeGuestTimeEntries(callback: (entries: TimeEntry[]) => void): () => void {
  listeners.timeEntries.add(callback);
  const session = getGuestSession();
  const sorted = (session?.timeEntries || []).slice().sort((a, b) => b.startTime - a.startTime);
  callback(sorted);
  return () => {
    listeners.timeEntries.delete(callback);
  };
}

export function subscribeGuestActiveTimer(callback: (timer: ActiveTimer | null) => void): () => void {
  listeners.activeTimer.add(callback);
  const session = getGuestSession();
  callback(session?.activeTimer || null);
  return () => {
    listeners.activeTimer.delete(callback);
  };
}

export function subscribeGuestCalendarEvents(callback: (events: CalendarEvent[]) => void): () => void {
  listeners.calendarEvents.add(callback);
  const session = getGuestSession();
  const sorted = (session?.calendarEvents || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  callback(sorted);
  return () => {
    listeners.calendarEvents.delete(callback);
  };
}

export function subscribeGuestPomodoroSessions(callback: (sessions: PomodoroSession[]) => void): () => void {
  listeners.pomodoroSessions.add(callback);
  const session = getGuestSession();
  const sorted = (session?.pomodoroSessions || []).slice().sort((a, b) => b.completedAt - a.completedAt);
  callback(sorted);
  return () => {
    listeners.pomodoroSessions.delete(callback);
  };
}

export function subscribeGuestReminders(callback: (reminders: Reminder[]) => void): () => void {
  listeners.reminders.add(callback);
  const session = getGuestSession();
  const sorted = (session?.reminders || []).slice().sort((a, b) => a.scheduledTime - b.scheduledTime);
  callback(sorted);
  return () => {
    listeners.reminders.delete(callback);
  };
}

export function subscribeGuestAutoActivities(callback: (acts: AutoActivity[]) => void): () => void {
  listeners.autoActivities.add(callback);
  const session = getGuestSession();
  const sorted = (session?.autoActivities || []).slice().sort((a, b) => b.detectedAt - a.detectedAt);
  callback(sorted);
  return () => {
    listeners.autoActivities.delete(callback);
  };
}

/* ---------------- CRUD: PROJECTS ---------------- */

export function guestCreateProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>, customId?: string): string {
  const session = getGuestSession() || initGuestSession();
  const id = customId || `proj_guest_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const newProject: Project = {
    ...project,
    id,
    userId: session.sessionId,
    createdAt: now,
    updatedAt: now,
  };

  session.projects.push(newProject);
  saveGuestSession(session);

  const sorted = session.projects.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  notifyListeners('projects', sorted);
  return id;
}

export function guestUpdateProject(id: string, updates: Partial<Project>): void {
  const session = getGuestSession();
  if (!session) return;

  const idx = session.projects.findIndex((p) => p.id === id);
  if (idx !== -1) {
    session.projects[idx] = {
      ...session.projects[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    saveGuestSession(session);
    const sorted = session.projects.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    notifyListeners('projects', sorted);
  }
}

export function guestDeleteProject(id: string): void {
  const session = getGuestSession();
  if (!session) return;

  // Cascade delete subprojects and tasks
  const subprojectIds = session.projects.filter((p) => p.parentId === id).map((p) => p.id);
  const allTargetIds = new Set([id, ...subprojectIds]);

  session.projects = session.projects.filter((p) => !allTargetIds.has(p.id));
  session.tasks = session.tasks.filter((t) => !allTargetIds.has(t.projectId));
  session.calendarEvents = session.calendarEvents.filter((e) => !e.projectId || !allTargetIds.has(e.projectId));

  saveGuestSession(session);

  notifyListeners('projects', session.projects);
  notifyListeners('tasks', session.tasks);
  notifyListeners('calendarEvents', session.calendarEvents);
}

/* ---------------- CRUD: TASKS ---------------- */

export function guestCreateTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>, customId?: string): string {
  const session = getGuestSession() || initGuestSession();
  const id = customId || `task_guest_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const newTask: Task = {
    ...task,
    id,
    userId: session.sessionId,
    createdAt: now,
    updatedAt: now,
  };

  session.tasks.push(newTask);
  saveGuestSession(session);

  const sorted = session.tasks.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  notifyListeners('tasks', sorted);
  return id;
}

export function guestUpdateTask(id: string, updates: Partial<Task>): void {
  const session = getGuestSession();
  if (!session) return;

  const idx = session.tasks.findIndex((t) => t.id === id);
  if (idx !== -1) {
    session.tasks[idx] = {
      ...session.tasks[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    saveGuestSession(session);
    const sorted = session.tasks.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    notifyListeners('tasks', sorted);
  }
}

export function guestDeleteTask(id: string): void {
  const session = getGuestSession();
  if (!session) return;

  session.tasks = session.tasks.filter((t) => t.id !== id);
  saveGuestSession(session);
  notifyListeners('tasks', session.tasks);
}

/* ---------------- CRUD: TIME ENTRIES ---------------- */

export function guestCreateTimeEntry(entry: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt'>, customId?: string): string {
  const session = getGuestSession() || initGuestSession();
  const id = customId || `entry_guest_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const newEntry: TimeEntry = {
    ...entry,
    id,
    userId: session.sessionId,
    createdAt: now,
    updatedAt: now,
  };

  session.timeEntries.push(newEntry);
  saveGuestSession(session);

  const sorted = session.timeEntries.slice().sort((a, b) => b.startTime - a.startTime);
  notifyListeners('timeEntries', sorted);
  return id;
}

export function guestUpdateTimeEntry(id: string, updates: Partial<TimeEntry>): void {
  const session = getGuestSession();
  if (!session) return;

  const idx = session.timeEntries.findIndex((e) => e.id === id);
  if (idx !== -1) {
    session.timeEntries[idx] = {
      ...session.timeEntries[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    saveGuestSession(session);
    const sorted = session.timeEntries.slice().sort((a, b) => b.startTime - a.startTime);
    notifyListeners('timeEntries', sorted);
  }
}

export function guestDeleteTimeEntry(id: string): void {
  const session = getGuestSession();
  if (!session) return;

  session.timeEntries = session.timeEntries.filter((e) => e.id !== id);
  saveGuestSession(session);
  notifyListeners('timeEntries', session.timeEntries);
}

/* ---------------- CRUD: ACTIVE TIMER ---------------- */

export function guestSaveActiveTimer(timer: ActiveTimer): void {
  const session = getGuestSession() || initGuestSession();
  session.activeTimer = timer;
  saveGuestSession(session);
  notifyListeners('activeTimer', timer);
}

export function guestDeleteActiveTimer(): void {
  const session = getGuestSession();
  if (!session) return;
  session.activeTimer = null;
  saveGuestSession(session);
  notifyListeners('activeTimer', null);
}

/* ---------------- CRUD: CALENDAR EVENTS ---------------- */

export function guestCreateCalendarEvent(event: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>): string {
  const session = getGuestSession() || initGuestSession();
  const id = `calevt_guest_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const newEvent: CalendarEvent = {
    ...event,
    id,
    userId: session.sessionId,
    createdAt: now,
    updatedAt: now,
  };

  session.calendarEvents.push(newEvent);
  saveGuestSession(session);

  const sorted = session.calendarEvents.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  notifyListeners('calendarEvents', sorted);
  return id;
}

export function guestUpdateCalendarEvent(id: string, updates: Partial<CalendarEvent>): void {
  const session = getGuestSession();
  if (!session) return;

  const idx = session.calendarEvents.findIndex((e) => e.id === id);
  if (idx !== -1) {
    session.calendarEvents[idx] = {
      ...session.calendarEvents[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    saveGuestSession(session);
    const sorted = session.calendarEvents.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    notifyListeners('calendarEvents', sorted);
  }
}

export function guestDeleteCalendarEvent(id: string): void {
  const session = getGuestSession();
  if (!session) return;

  session.calendarEvents = session.calendarEvents.filter((e) => e.id !== id);
  saveGuestSession(session);
  notifyListeners('calendarEvents', session.calendarEvents);
}

/* ---------------- CRUD: POMODORO ---------------- */

export function guestCreatePomodoroSession(sessionData: Omit<PomodoroSession, 'id' | 'createdAt'>): string {
  const session = getGuestSession() || initGuestSession();
  const id = `pomo_guest_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const newPomo: PomodoroSession = {
    ...sessionData,
    id,
    userId: session.sessionId,
    createdAt: now,
  };

  session.pomodoroSessions.push(newPomo);
  saveGuestSession(session);

  const sorted = session.pomodoroSessions.slice().sort((a, b) => b.completedAt - a.completedAt);
  notifyListeners('pomodoroSessions', sorted);
  return id;
}

/* ---------------- CRUD: REMINDERS ---------------- */

export function guestCreateReminder(reminder: Omit<Reminder, 'id' | 'createdAt' | 'updatedAt'>): string {
  const session = getGuestSession() || initGuestSession();
  const id = `rem_guest_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const newRem: Reminder = {
    ...reminder,
    id,
    userId: session.sessionId,
    createdAt: now,
    updatedAt: now,
  };

  session.reminders.push(newRem);
  saveGuestSession(session);

  const sorted = session.reminders.slice().sort((a, b) => a.scheduledTime - b.scheduledTime);
  notifyListeners('reminders', sorted);
  return id;
}

export function guestUpdateReminder(id: string, updates: Partial<Reminder>): void {
  const session = getGuestSession();
  if (!session) return;

  const idx = session.reminders.findIndex((r) => r.id === id);
  if (idx !== -1) {
    session.reminders[idx] = {
      ...session.reminders[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    saveGuestSession(session);
    const sorted = session.reminders.slice().sort((a, b) => a.scheduledTime - b.scheduledTime);
    notifyListeners('reminders', sorted);
  }
}

export function guestDeleteReminder(id: string): void {
  const session = getGuestSession();
  if (!session) return;

  session.reminders = session.reminders.filter((r) => r.id !== id);
  saveGuestSession(session);
  notifyListeners('reminders', session.reminders);
}

/* ---------------- CRUD: AUTO ACTIVITIES ---------------- */

export function guestCreateAutoActivity(activity: Omit<AutoActivity, 'id' | 'createdAt'>): string {
  const session = getGuestSession() || initGuestSession();
  const id = `auto_guest_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const newAct: AutoActivity = {
    ...activity,
    id,
    userId: session.sessionId,
    createdAt: now,
  };

  session.autoActivities.push(newAct);
  saveGuestSession(session);

  const sorted = session.autoActivities.slice().sort((a, b) => b.detectedAt - a.detectedAt);
  notifyListeners('autoActivities', sorted);
  return id;
}

export function guestUpdateAutoActivity(id: string, updates: Partial<AutoActivity>): void {
  const session = getGuestSession();
  if (!session) return;

  const idx = session.autoActivities.findIndex((a) => a.id === id);
  if (idx !== -1) {
    session.autoActivities[idx] = {
      ...session.autoActivities[idx],
      ...updates,
    };
    saveGuestSession(session);
    const sorted = session.autoActivities.slice().sort((a, b) => b.detectedAt - a.detectedAt);
    notifyListeners('autoActivities', sorted);
  }
}

export function guestDeleteAutoActivity(id: string): void {
  const session = getGuestSession();
  if (!session) return;

  session.autoActivities = session.autoActivities.filter((a) => a.id !== id);
  saveGuestSession(session);
  notifyListeners('autoActivities', session.autoActivities);
}

/* ---------------- GUEST BATCH IMPORT & PROVENANCE ---------------- */

export function guestRecordImport(record: WorkspaceImportRecord): void {
  const session = getGuestSession() || initGuestSession();
  if (!session.imports) {
    session.imports = [];
  }
  session.imports.unshift(record);
  saveGuestSession(session);
}

export function guestExecuteBatchImport(data: {
  projects: Project[];
  tasks: Task[];
  timeEntries?: TimeEntry[];
  calendarEvents?: CalendarEvent[];
  importRecord?: WorkspaceImportRecord;
}): { projectsWritten: number; tasksWritten: number; timeEntriesWritten: number; calendarEventsWritten: number } {
  const session = getGuestSession() || initGuestSession();

  if (data.projects.length > 0) {
    session.projects.push(...data.projects);
  }
  if (data.tasks.length > 0) {
    session.tasks.push(...data.tasks);
  }
  if (data.timeEntries && data.timeEntries.length > 0) {
    session.timeEntries.push(...data.timeEntries);
  }
  if (data.calendarEvents && data.calendarEvents.length > 0) {
    session.calendarEvents.push(...data.calendarEvents);
  }
  if (data.importRecord) {
    if (!session.imports) session.imports = [];
    session.imports.unshift(data.importRecord);
  }

  saveGuestSession(session);

  notifyListeners('projects', session.projects);
  notifyListeners('tasks', session.tasks);
  notifyListeners('timeEntries', session.timeEntries);
  notifyListeners('calendarEvents', session.calendarEvents);

  return {
    projectsWritten: data.projects.length,
    tasksWritten: data.tasks.length,
    timeEntriesWritten: data.timeEntries ? data.timeEntries.length : 0,
    calendarEventsWritten: data.calendarEvents ? data.calendarEvents.length : 0,
  };
}

/* ---------------- ALL DATA EXPORT FOR GUEST ---------------- */

export function fetchAllGuestData() {
  const session = getGuestSession() || initGuestSession();
  return {
    exportedAt: new Date().toISOString(),
    userId: session.sessionId,
    isGuest: true,
    projects: session.projects,
    tasks: session.tasks,
    timeEntries: session.timeEntries,
    pomodoroSessions: session.pomodoroSessions,
    reminders: session.reminders,
    autoActivities: session.autoActivities,
    calendarEvents: session.calendarEvents,
    imports: session.imports || [],
  };
}
