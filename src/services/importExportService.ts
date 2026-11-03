import {
  writeBatch,
  doc,
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { cleanPayload, fetchAllUserData } from './db';
import { Project, Task, TimeEntry, CalendarEvent } from '../types';

export const TARGET_USER_ID = 'rAzbSJxTAPRP3ctC94XPpO83BT63';

export interface ImportValidationResult {
  isValid: boolean;
  error?: string;
  counts: {
    projects: number;
    rootProjects: number;
    subprojects: number;
    tasks: number;
    timeEntries: number;
    calendarEvents: number;
    tasksWithDates: number;
  };
  sampleRoots: string[];
}

export interface GeminiReviewResponse {
  success: boolean;
  analysis?: {
    summary: string;
    recommendedFocus: string[];
    hierarchyRating: string;
    productivityInsights: string[];
    suggestedTimePacing: string;
    tags: string[];
  };
  error?: string;
  fallbackAvailable?: boolean;
}

/**
 * Validates the raw JSON object structure before import
 */
export function validateImportJson(raw: any): ImportValidationResult {
  if (!raw || typeof raw !== 'object') {
    return {
      isValid: false,
      error: 'The uploaded file is not a valid JSON object.',
      counts: { projects: 0, rootProjects: 0, subprojects: 0, tasks: 0, timeEntries: 0, calendarEvents: 0, tasksWithDates: 0 },
      sampleRoots: [],
    };
  }

  const projects = Array.isArray(raw.projects) ? raw.projects : [];
  const tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
  const timeEntries = Array.isArray(raw.timeEntries) ? raw.timeEntries : [];
  const calendarEvents = Array.isArray(raw.calendarEvents) ? raw.calendarEvents : [];

  if (projects.length === 0 && tasks.length === 0 && timeEntries.length === 0) {
    return {
      isValid: false,
      error: 'The JSON file contains no projects, tasks, or time entries to import.',
      counts: { projects: 0, rootProjects: 0, subprojects: 0, tasks: 0, timeEntries: 0, calendarEvents: 0, tasksWithDates: 0 },
      sampleRoots: [],
    };
  }

  const rootProjects = projects.filter((p: any) => !p.parentId);
  const subprojects = projects.filter((p: any) => Boolean(p.parentId));
  const tasksWithDates = tasks.filter((t: any) => Boolean(t.scheduledDate || t.deadline || t.dueDate || t.plannedDate)).length;

  return {
    isValid: true,
    counts: {
      projects: projects.length,
      rootProjects: rootProjects.length,
      subprojects: subprojects.length,
      tasks: tasks.length,
      timeEntries: timeEntries.length,
      calendarEvents: calendarEvents.length,
      tasksWithDates,
    },
    sampleRoots: rootProjects.slice(0, 8).map((p: any) => p.name || 'Untitled Project'),
  };
}

/**
 * Sanitizes and prepares dataset for import into target user's workspace:
 * - Reassigns all items to target userId
 * - Forces showOnCalendar: false on all projects and subprojects
 * - Strips scheduledDate, deadline, dueDate, plannedDate from all tasks
 */
export function sanitizeDatasetForImport(
  raw: any,
  targetUserId: string,
  stripTaskDates: boolean = true
): {
  projects: Project[];
  tasks: Task[];
  timeEntries: TimeEntry[];
  calendarEvents: CalendarEvent[];
} {
  const rawProjects = Array.isArray(raw.projects) ? raw.projects : [];
  const rawTasks = Array.isArray(raw.tasks) ? raw.tasks : [];
  const rawEntries = Array.isArray(raw.timeEntries) ? raw.timeEntries : [];
  const rawCal = Array.isArray(raw.calendarEvents) ? raw.calendarEvents : [];

  const now = new Date().toISOString();

  // 1. Projects sanitization
  const projects: Project[] = rawProjects.map((p: any, idx: number) => {
    const id = p.id || `proj_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`;
    return {
      id,
      userId: targetUserId,
      name: (p.name || 'Untitled Project').trim(),
      description: p.description?.trim() || undefined,
      color: p.color || '#388bfd',
      status: p.status || 'active',
      parentId: p.parentId || null,
      showOnCalendar: false, // Explicitly false per production specification
      createdAt: p.createdAt || now,
      updatedAt: p.updatedAt || now,
    };
  });

  // 2. Tasks sanitization
  const tasks: Task[] = rawTasks.map((t: any, idx: number) => {
    const id = t.id || `task_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`;
    const sanitizedTask: any = {
      id,
      userId: targetUserId,
      projectId: t.projectId || projects[0]?.id || 'default_project',
      name: (t.name || 'Untitled Task').trim(),
      status: t.status || 'pending',
      createdAt: t.createdAt || now,
      updatedAt: t.updatedAt || now,
    };

    if (t.description?.trim()) {
      sanitizedTask.description = t.description.trim();
    }
    if (typeof t.estimatedHours === 'number') {
      sanitizedTask.estimatedHours = t.estimatedHours;
    }

    if (!stripTaskDates) {
      if (t.deadline) sanitizedTask.deadline = t.deadline;
      if (t.scheduledDate) sanitizedTask.scheduledDate = t.scheduledDate;
    }
    // If stripTaskDates is true (default), deadline, scheduledDate, dueDate, plannedDate are omitted entirely

    return sanitizedTask as Task;
  });

  // 3. Time entries sanitization
  const timeEntries: TimeEntry[] = rawEntries.map((e: any, idx: number) => {
    const id = e.id || `entry_${Date.now()}_${idx}`;
    return {
      id,
      userId: targetUserId,
      projectId: e.projectId || undefined,
      taskId: e.taskId || undefined,
      description: e.description || 'Imported session',
      tags: Array.isArray(e.tags) ? e.tags : ['imported'],
      startTime: Number(e.startTime) || Date.now(),
      endTime: Number(e.endTime) || Date.now() + 1800000,
      duration: Number(e.duration) || 1800,
      isManual: Boolean(e.isManual),
      createdAt: e.createdAt || now,
      updatedAt: e.updatedAt || now,
    };
  });

  // 4. Calendar events (starts empty unless specifically preserved)
  const calendarEvents: CalendarEvent[] = rawCal.map((c: any, idx: number) => {
    const id = c.id || `cal_${Date.now()}_${idx}`;
    return {
      id,
      userId: targetUserId,
      title: c.title || 'Event',
      description: c.description || undefined,
      date: c.date || toISODate(new Date()),
      startTime: c.startTime || undefined,
      endTime: c.endTime || undefined,
      projectId: c.projectId || undefined,
      color: c.color || '#388bfd',
      type: c.type || 'event',
      isCompleted: Boolean(c.isCompleted),
      createdAt: c.createdAt || now,
      updatedAt: c.updatedAt || now,
    };
  });

  return { projects, tasks, timeEntries, calendarEvents };
}

function toISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Reset all work records strictly for a specific user ID.
 * Protects against accidental cross-tenant data loss.
 */
export async function executeTargetUserReset(
  userId: string,
  onProgress?: (message: string, percent: number) => void
): Promise<{ deletedCounts: Record<string, number> }> {
  if (!userId) {
    throw new Error('User ID is required for reset operation.');
  }

  const collectionsToClear = [
    'projects',
    'tasks',
    'timeEntries',
    'calendarEvents',
    'pomodoroSessions',
    'reminders',
    'autoActivities',
  ];

  const deletedCounts: Record<string, number> = {};
  const totalCollections = collectionsToClear.length;

  for (let cIdx = 0; cIdx < totalCollections; cIdx++) {
    const colName = collectionsToClear[cIdx];
    onProgress?.(`Inspecting ${colName}...`, Math.round((cIdx / totalCollections) * 100));

    const snap = await getDocs(query(collection(db, colName), where('userId', '==', userId)));
    deletedCounts[colName] = snap.size;

    if (snap.size > 0) {
      const docs = snap.docs;
      const CHUNK_SIZE = 400;
      for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
        const chunk = docs.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        onProgress?.(
          `Deleting ${colName} (${Math.min(i + CHUNK_SIZE, docs.length)}/${docs.length})...`,
          Math.round(((cIdx + (i / docs.length)) / totalCollections) * 100)
        );
      }
    }
  }

  onProgress?.('Reset completed successfully.', 100);
  return { deletedCounts };
}

/**
 * Bulk writes sanitized projects, tasks, and entries in safe Firestore batches (max 400 docs/batch).
 */
export async function executeBatchImport(
  data: {
    projects: Project[];
    tasks: Task[];
    timeEntries?: TimeEntry[];
    calendarEvents?: CalendarEvent[];
  },
  onProgress?: (message: string, percent: number) => void
): Promise<{ projectsWritten: number; tasksWritten: number; timeEntriesWritten: number; calendarEventsWritten: number }> {
  const { projects, tasks, timeEntries = [], calendarEvents = [] } = data;
  const totalItems = projects.length + tasks.length + timeEntries.length + calendarEvents.length;
  let itemsWritten = 0;

  const BATCH_SIZE = 400;

  // Helper to commit chunks
  async function writeListInChunks(items: any[], colName: string) {
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const chunk = items.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);
      for (const item of chunk) {
        const ref = doc(db, colName, item.id);
        batch.set(ref, cleanPayload(item));
      }
      await batch.commit();
      itemsWritten += chunk.length;
      const pct = Math.min(99, Math.round((itemsWritten / totalItems) * 100));
      onProgress?.(`Importing ${colName} (${itemsWritten}/${totalItems})...`, pct);
    }
  }

  // 1. Projects first (so parent references exist)
  if (projects.length > 0) {
    onProgress?.(`Writing ${projects.length} projects & subprojects...`, 5);
    await writeListInChunks(projects, 'projects');
  }

  // 2. Tasks
  if (tasks.length > 0) {
    onProgress?.(`Writing ${tasks.length} tasks...`, 40);
    await writeListInChunks(tasks, 'tasks');
  }

  // 3. Time Entries (if any)
  if (timeEntries.length > 0) {
    onProgress?.(`Writing ${timeEntries.length} time entries...`, 85);
    await writeListInChunks(timeEntries, 'timeEntries');
  }

  // 4. Calendar Events (if any)
  if (calendarEvents.length > 0) {
    onProgress?.(`Writing ${calendarEvents.length} calendar events...`, 95);
    await writeListInChunks(calendarEvents, 'calendarEvents');
  }

  onProgress?.('Import complete!', 100);

  return {
    projectsWritten: projects.length,
    tasksWritten: tasks.length,
    timeEntriesWritten: timeEntries.length,
    calendarEventsWritten: calendarEvents.length,
  };
}

/**
 * Calls server-side Gemini endpoint /api/gemini/review-import
 */
export async function requestGeminiImportReview(summary: {
  projectsCount: number;
  rootProjects: string[];
  tasksCount: number;
  sampleProjects: any[];
  userNotes?: string;
}): Promise<GeminiReviewResponse> {
  try {
    const res = await fetch('/api/gemini/review-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(summary),
    });

    const data = await res.json();
    return data;
  } catch (err: any) {
    console.error('Failed to contact Gemini proxy:', err);
    return {
      success: false,
      error: err.message || 'Network error reaching Gemini review server',
      fallbackAvailable: true,
    };
  }
}

/**
 * Triggers browser download of user data as formatted JSON
 */
export async function downloadUserDataExport(userId: string): Promise<void> {
  const data = await fetchAllUserData(userId);
  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `chronos_user_backup_${userId.slice(0, 8)}_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
