import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
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
} from '../types';

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

export async function createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>, id?: string): Promise<string> {
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
  const path = `projects/${id}`;
  try {
    await updateDoc(doc(db, 'projects', id), cleanPayload({
      ...updates,
      updatedAt: new Date().toISOString(),
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteProject(id: string): Promise<void> {
  const path = `projects/${id}`;
  try {
    await deleteDoc(doc(db, 'projects', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeProjects(userId: string, callback: (projects: Project[]) => void): Unsubscribe {
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

export async function createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>, id?: string): Promise<string> {
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
  const path = `tasks/${id}`;
  try {
    await updateDoc(doc(db, 'tasks', id), cleanPayload({
      ...updates,
      updatedAt: new Date().toISOString(),
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteTask(id: string): Promise<void> {
  const path = `tasks/${id}`;
  try {
    await deleteDoc(doc(db, 'tasks', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeTasks(userId: string, callback: (tasks: Task[]) => void): Unsubscribe {
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

export async function createTimeEntry(entry: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt'>, id?: string): Promise<string> {
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
  const path = `timeEntries/${id}`;
  try {
    await updateDoc(doc(db, 'timeEntries', id), cleanPayload({
      ...updates,
      updatedAt: new Date().toISOString(),
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteTimeEntry(id: string): Promise<void> {
  const path = `timeEntries/${id}`;
  try {
    await deleteDoc(doc(db, 'timeEntries', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeTimeEntries(userId: string, callback: (entries: TimeEntry[]) => void): Unsubscribe {
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
  const path = `activeTimers/${timer.userId}`;
  try {
    await setDoc(doc(db, 'activeTimers', timer.userId), cleanPayload(timer));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteActiveTimer(userId: string): Promise<void> {
  const path = `activeTimers/${userId}`;
  try {
    await deleteDoc(doc(db, 'activeTimers', userId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeActiveTimer(userId: string, callback: (timer: ActiveTimer | null) => void): Unsubscribe {
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
  const path = `reminders/${id}`;
  try {
    await updateDoc(doc(db, 'reminders', id), cleanPayload({
      ...updates,
      updatedAt: new Date().toISOString(),
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteReminder(id: string): Promise<void> {
  const path = `reminders/${id}`;
  try {
    await deleteDoc(doc(db, 'reminders', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeReminders(userId: string, callback: (reminders: Reminder[]) => void): Unsubscribe {
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
  const path = `autoActivities/${id}`;
  try {
    await updateDoc(doc(db, 'autoActivities', id), cleanPayload(updates));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteAutoActivity(id: string): Promise<void> {
  const path = `autoActivities/${id}`;
  try {
    await deleteDoc(doc(db, 'autoActivities', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeAutoActivities(userId: string, callback: (acts: AutoActivity[]) => void): Unsubscribe {
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

export async function createCalendarEvent(event: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
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
  const path = `calendarEvents/${id}`;
  try {
    await updateDoc(doc(db, 'calendarEvents', id), cleanPayload({
      ...updates,
      updatedAt: new Date().toISOString(),
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  const path = `calendarEvents/${id}`;
  try {
    await deleteDoc(doc(db, 'calendarEvents', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeCalendarEvents(userId: string, callback: (events: CalendarEvent[]) => void): Unsubscribe {
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

/* ---------------- ALL DATA EXPORT ---------------- */

export async function fetchAllUserData(userId: string) {
  const [projectsSnap, tasksSnap, entriesSnap, pomodoroSnap, remindersSnap, autoSnap, calendarSnap] = await Promise.all([
    getDocs(query(collection(db, 'projects'), where('userId', '==', userId))),
    getDocs(query(collection(db, 'tasks'), where('userId', '==', userId))),
    getDocs(query(collection(db, 'timeEntries'), where('userId', '==', userId))),
    getDocs(query(collection(db, 'pomodoroSessions'), where('userId', '==', userId))),
    getDocs(query(collection(db, 'reminders'), where('userId', '==', userId))),
    getDocs(query(collection(db, 'autoActivities'), where('userId', '==', userId))),
    getDocs(query(collection(db, 'calendarEvents'), where('userId', '==', userId))),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    userId,
    projects: projectsSnap.docs.map(d => d.data() as Project),
    tasks: tasksSnap.docs.map(d => d.data() as Task),
    timeEntries: entriesSnap.docs.map(d => d.data() as TimeEntry),
    pomodoroSessions: pomodoroSnap.docs.map(d => d.data() as PomodoroSession),
    reminders: remindersSnap.docs.map(d => d.data() as Reminder),
    autoActivities: autoSnap.docs.map(d => d.data() as AutoActivity),
    calendarEvents: calendarSnap.docs.map(d => d.data() as CalendarEvent),
  };
}
