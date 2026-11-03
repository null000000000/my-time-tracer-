import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
import {
  Project,
  Task,
  TimeEntry,
  ActiveTimer,
  PomodoroSession,
  Reminder,
  AutoActivity,
  CalendarEvent,
  WorkspaceImportRecord,
} from '../types';
import {
  isGuestSessionActive,
  getGuestSession,
  guestCreateProject,
  guestUpdateProject,
  guestDeleteProject,
  subscribeGuestProjects,
  guestCreateTask,
  guestUpdateTask,
  guestDeleteTask,
  subscribeGuestTasks,
  guestCreateTimeEntry,
  guestUpdateTimeEntry,
  guestDeleteTimeEntry,
  subscribeGuestTimeEntries,
  guestSaveActiveTimer,
  guestDeleteActiveTimer,
  subscribeGuestActiveTimer,
  guestCreateCalendarEvent,
  guestUpdateCalendarEvent,
  guestDeleteCalendarEvent,
  subscribeGuestCalendarEvents,
  guestCreatePomodoroSession,
  subscribeGuestPomodoroSessions,
  guestCreateReminder,
  guestUpdateReminder,
  guestDeleteReminder,
  subscribeGuestReminders,
  guestCreateAutoActivity,
  guestUpdateAutoActivity,
  guestDeleteAutoActivity,
  subscribeGuestAutoActivities,
  fetchAllGuestData,
} from './guestStorage';

/**
 * Check if the given target ID or userId belongs to an active guest session.
 */
function isGuestTarget(userIdOrDocId?: string): boolean {
  if (!userIdOrDocId) return isGuestSessionActive();
  if (userIdOrDocId.startsWith('guest_') || userIdOrDocId.includes('guest')) return true;
  return isGuestSessionActive();
}

/**
 * Recursively removes all undefined values from an object,
 * ensuring no document payload ever causes Firestore to reject writes.
 */
export function cleanPayload<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(cleanPayload) as unknown as T;
  }
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const cleaned: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (val !== undefined) {
        cleaned[key] = cleanPayload(val);
      }
    }
    return cleaned as T;
  }
  return obj;
}

/* ---------------- PROJECTS ---------------- */

export async function createProject(
  project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>,
  id?: string
): Promise<string> {
  if (isGuestTarget(project.userId)) {
    return guestCreateProject(project, id);
  }

  const projectId = id || `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const newProject: Project = {
    ...project,
    id: projectId,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await setDoc(doc(db, 'projects', projectId), cleanPayload(newProject));
    return projectId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `projects/${projectId}`);
  }
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<void> {
  const session = getGuestSession();
  if (session && session.projects.some((p) => p.id === id)) {
    guestUpdateProject(id, updates);
    return;
  }

  const path = `projects/${id}`;
  try {
    await updateDoc(
      doc(db, 'projects', id),
      cleanPayload({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteProject(id: string): Promise<void> {
  const session = getGuestSession();
  if (session && session.projects.some((p) => p.id === id)) {
    guestDeleteProject(id);
    return;
  }

  const path = `projects/${id}`;
  try {
    await deleteDoc(doc(db, 'projects', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeProjects(userId: string, callback: (projects: Project[]) => void): Unsubscribe {
  if (isGuestTarget(userId)) {
    return subscribeGuestProjects(callback);
  }

  const q = query(collection(db, 'projects'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as Project);
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      callback(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'projects');
    }
  );
}

/* ---------------- TASKS ---------------- */

export async function createTask(
  task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>,
  id?: string
): Promise<string> {
  if (isGuestTarget(task.userId)) {
    return guestCreateTask(task, id);
  }

  const taskId = id || `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const newTask: Task = {
    ...task,
    id: taskId,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await setDoc(doc(db, 'tasks', taskId), cleanPayload(newTask));
    return taskId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `tasks/${taskId}`);
  }
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<void> {
  const session = getGuestSession();
  if (session && session.tasks.some((t) => t.id === id)) {
    guestUpdateTask(id, updates);
    return;
  }

  const path = `tasks/${id}`;
  try {
    await updateDoc(
      doc(db, 'tasks', id),
      cleanPayload({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteTask(id: string): Promise<void> {
  const session = getGuestSession();
  if (session && session.tasks.some((t) => t.id === id)) {
    guestDeleteTask(id);
    return;
  }

  const path = `tasks/${id}`;
  try {
    await deleteDoc(doc(db, 'tasks', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeTasks(userId: string, callback: (tasks: Task[]) => void): Unsubscribe {
  if (isGuestTarget(userId)) {
    return subscribeGuestTasks(callback);
  }

  const q = query(collection(db, 'tasks'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as Task);
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      callback(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tasks');
    }
  );
}

/* ---------------- TIME ENTRIES ---------------- */

export async function createTimeEntry(
  entry: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt'>,
  id?: string
): Promise<string> {
  if (isGuestTarget(entry.userId)) {
    return guestCreateTimeEntry(entry, id);
  }

  const entryId = id || `entry_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const newEntry: TimeEntry = {
    ...entry,
    id: entryId,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await setDoc(doc(db, 'timeEntries', entryId), cleanPayload(newEntry));
    return entryId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `timeEntries/${entryId}`);
  }
}

export async function updateTimeEntry(id: string, updates: Partial<TimeEntry>): Promise<void> {
  const session = getGuestSession();
  if (session && session.timeEntries.some((e) => e.id === id)) {
    guestUpdateTimeEntry(id, updates);
    return;
  }

  const path = `timeEntries/${id}`;
  try {
    await updateDoc(
      doc(db, 'timeEntries', id),
      cleanPayload({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteTimeEntry(id: string): Promise<void> {
  const session = getGuestSession();
  if (session && session.timeEntries.some((e) => e.id === id)) {
    guestDeleteTimeEntry(id);
    return;
  }

  const path = `timeEntries/${id}`;
  try {
    await deleteDoc(doc(db, 'timeEntries', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeTimeEntries(userId: string, callback: (entries: TimeEntry[]) => void): Unsubscribe {
  if (isGuestTarget(userId)) {
    return subscribeGuestTimeEntries(callback);
  }

  const q = query(collection(db, 'timeEntries'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as TimeEntry);
      list.sort((a, b) => b.startTime - a.startTime);
      callback(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'timeEntries');
    }
  );
}

/* ---------------- ACTIVE TIMER ---------------- */

export async function saveActiveTimer(timer: ActiveTimer): Promise<void> {
  if (isGuestTarget(timer.userId)) {
    guestSaveActiveTimer(timer);
    return;
  }

  const path = `activeTimers/${timer.userId}`;
  try {
    await setDoc(doc(db, 'activeTimers', timer.userId), cleanPayload(timer));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteActiveTimer(userId: string): Promise<void> {
  if (isGuestTarget(userId)) {
    guestDeleteActiveTimer();
    return;
  }

  const path = `activeTimers/${userId}`;
  try {
    await deleteDoc(doc(db, 'activeTimers', userId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeActiveTimer(userId: string, callback: (timer: ActiveTimer | null) => void): Unsubscribe {
  if (isGuestTarget(userId)) {
    return subscribeGuestActiveTimer(callback);
  }

  return onSnapshot(
    doc(db, 'activeTimers', userId),
    (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data() as ActiveTimer);
      } else {
        callback(null);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, `activeTimers/${userId}`);
    }
  );
}

/* ---------------- POMODORO SESSIONS ---------------- */

export async function createPomodoroSession(session: Omit<PomodoroSession, 'id' | 'createdAt'>): Promise<string> {
  if (isGuestTarget(session.userId)) {
    return guestCreatePomodoroSession(session);
  }

  const id = `pomo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const newSession: PomodoroSession = {
    ...session,
    id,
    createdAt: now,
  };
  try {
    await setDoc(doc(db, 'pomodoroSessions', id), cleanPayload(newSession));
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `pomodoroSessions/${id}`);
  }
}

export function subscribePomodoroSessions(userId: string, callback: (sessions: PomodoroSession[]) => void): Unsubscribe {
  if (isGuestTarget(userId)) {
    return subscribeGuestPomodoroSessions(callback);
  }

  const q = query(collection(db, 'pomodoroSessions'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as PomodoroSession);
      list.sort((a, b) => b.completedAt - a.completedAt);
      callback(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'pomodoroSessions');
    }
  );
}

/* ---------------- REMINDERS ---------------- */

export async function createReminder(reminder: Omit<Reminder, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  if (isGuestTarget(reminder.userId)) {
    return guestCreateReminder(reminder);
  }

  const id = `rem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const newReminder: Reminder = {
    ...reminder,
    id,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await setDoc(doc(db, 'reminders', id), cleanPayload(newReminder));
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `reminders/${id}`);
  }
}

export async function updateReminder(id: string, updates: Partial<Reminder>): Promise<void> {
  const session = getGuestSession();
  if (session && session.reminders.some((r) => r.id === id)) {
    guestUpdateReminder(id, updates);
    return;
  }

  const path = `reminders/${id}`;
  try {
    await updateDoc(
      doc(db, 'reminders', id),
      cleanPayload({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteReminder(id: string): Promise<void> {
  const session = getGuestSession();
  if (session && session.reminders.some((r) => r.id === id)) {
    guestDeleteReminder(id);
    return;
  }

  const path = `reminders/${id}`;
  try {
    await deleteDoc(doc(db, 'reminders', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeReminders(userId: string, callback: (reminders: Reminder[]) => void): Unsubscribe {
  if (isGuestTarget(userId)) {
    return subscribeGuestReminders(callback);
  }

  const q = query(collection(db, 'reminders'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as Reminder);
      list.sort((a, b) => a.scheduledTime - b.scheduledTime);
      callback(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'reminders');
    }
  );
}

/* ---------------- AUTO ACTIVITIES ---------------- */

export async function createAutoActivity(activity: Omit<AutoActivity, 'id' | 'createdAt'>): Promise<string> {
  if (isGuestTarget(activity.userId)) {
    return guestCreateAutoActivity(activity);
  }

  const id = `auto_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const newActivity: AutoActivity = {
    ...activity,
    id,
    createdAt: now,
  };
  try {
    await setDoc(doc(db, 'autoActivities', id), cleanPayload(newActivity));
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `autoActivities/${id}`);
  }
}

export async function updateAutoActivity(id: string, updates: Partial<AutoActivity>): Promise<void> {
  const session = getGuestSession();
  if (session && session.autoActivities.some((a) => a.id === id)) {
    guestUpdateAutoActivity(id, updates);
    return;
  }

  const path = `autoActivities/${id}`;
  try {
    await updateDoc(doc(db, 'autoActivities', id), cleanPayload(updates));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteAutoActivity(id: string): Promise<void> {
  const session = getGuestSession();
  if (session && session.autoActivities.some((a) => a.id === id)) {
    guestDeleteAutoActivity(id);
    return;
  }

  const path = `autoActivities/${id}`;
  try {
    await deleteDoc(doc(db, 'autoActivities', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeAutoActivities(userId: string, callback: (acts: AutoActivity[]) => void): Unsubscribe {
  if (isGuestTarget(userId)) {
    return subscribeGuestAutoActivities(callback);
  }

  const q = query(collection(db, 'autoActivities'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as AutoActivity);
      list.sort((a, b) => b.detectedAt - a.detectedAt);
      callback(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'autoActivities');
    }
  );
}

/* ---------------- CALENDAR EVENTS ---------------- */

export async function createCalendarEvent(
  event: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  if (isGuestTarget(event.userId)) {
    return guestCreateCalendarEvent(event);
  }

  const id = `calevt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const newEvent: CalendarEvent = {
    ...event,
    id,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await setDoc(doc(db, 'calendarEvents', id), cleanPayload(newEvent));
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `calendarEvents/${id}`);
  }
}

export async function updateCalendarEvent(id: string, updates: Partial<CalendarEvent>): Promise<void> {
  const session = getGuestSession();
  if (session && session.calendarEvents.some((e) => e.id === id)) {
    guestUpdateCalendarEvent(id, updates);
    return;
  }

  const path = `calendarEvents/${id}`;
  try {
    await updateDoc(
      doc(db, 'calendarEvents', id),
      cleanPayload({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  const session = getGuestSession();
  if (session && session.calendarEvents.some((e) => e.id === id)) {
    guestDeleteCalendarEvent(id);
    return;
  }

  const path = `calendarEvents/${id}`;
  try {
    await deleteDoc(doc(db, 'calendarEvents', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeCalendarEvents(userId: string, callback: (events: CalendarEvent[]) => void): Unsubscribe {
  if (isGuestTarget(userId)) {
    return subscribeGuestCalendarEvents(callback);
  }

  const q = query(collection(db, 'calendarEvents'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as CalendarEvent);
      list.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      callback(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'calendarEvents');
    }
  );
}

/* ---------------- WORKSPACE IMPORTS PROVENANCE ---------------- */

export async function createImportRecord(record: WorkspaceImportRecord): Promise<string> {
  if (isGuestTarget(record.userId)) {
    const { guestRecordImport } = await import('./guestStorage');
    guestRecordImport(record);
    return record.id;
  }

  const path = `imports/${record.id}`;
  try {
    await setDoc(doc(db, 'imports', record.id), cleanPayload(record));
    return record.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/* ---------------- ALL DATA EXPORT ---------------- */

export async function fetchAllUserData(userId: string) {
  if (isGuestTarget(userId)) {
    return fetchAllGuestData();
  }

  const [projectsSnap, tasksSnap, entriesSnap, pomodoroSnap, remindersSnap, autoSnap, calendarSnap, importsSnap] = await Promise.all([
    getDocs(query(collection(db, 'projects'), where('userId', '==', userId))),
    getDocs(query(collection(db, 'tasks'), where('userId', '==', userId))),
    getDocs(query(collection(db, 'timeEntries'), where('userId', '==', userId))),
    getDocs(query(collection(db, 'pomodoroSessions'), where('userId', '==', userId))),
    getDocs(query(collection(db, 'reminders'), where('userId', '==', userId))),
    getDocs(query(collection(db, 'autoActivities'), where('userId', '==', userId))),
    getDocs(query(collection(db, 'calendarEvents'), where('userId', '==', userId))),
    getDocs(query(collection(db, 'imports'), where('userId', '==', userId))),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    userId,
    isGuest: false,
    projects: projectsSnap.docs.map((d) => d.data() as Project),
    tasks: tasksSnap.docs.map((d) => d.data() as Task),
    timeEntries: entriesSnap.docs.map((d) => d.data() as TimeEntry),
    pomodoroSessions: pomodoroSnap.docs.map((d) => d.data() as PomodoroSession),
    reminders: remindersSnap.docs.map((d) => d.data() as Reminder),
    autoActivities: autoSnap.docs.map((d) => d.data() as AutoActivity),
    calendarEvents: calendarSnap.docs.map((d) => d.data() as CalendarEvent),
    imports: importsSnap.docs.map((d) => d.data() as WorkspaceImportRecord),
  };
}
