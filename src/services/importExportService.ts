import {
  writeBatch,
  doc,
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { cleanPayload, fetchAllUserData, createImportRecord } from './db';
import {
  isGuestSessionActive,
  guestExecuteBatchImport,
  clearGuestSession,
} from './guestStorage';
import { Project, Task, TimeEntry, CalendarEvent, WorkspaceImportRecord } from '../types';

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
 * Validates the raw JSON object structure before import.
 * Works with any standard Chronos, Clockify, or custom workspace JSON backup.
 */
export function validateImportJson(raw: any): ImportValidationResult {
  if (!raw || typeof raw !== 'object') {
    return {
      isValid: false,
      error: 'The uploaded file is not a valid JSON object.',
      counts: {
        projects: 0,
        rootProjects: 0,
        subprojects: 0,
        tasks: 0,
        timeEntries: 0,
        calendarEvents: 0,
        tasksWithDates: 0,
      },
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
      counts: {
        projects: 0,
        rootProjects: 0,
        subprojects: 0,
        tasks: 0,
        timeEntries: 0,
        calendarEvents: 0,
        tasksWithDates: 0,
      },
      sampleRoots: [],
    };
  }

  const rootProjects = projects.filter((p: any) => !p.parentId);
  const subprojects = projects.filter((p: any) => Boolean(p.parentId));
  const tasksWithDates = tasks.filter(
    (t: any) => Boolean(t.scheduledDate || t.deadline || t.dueDate || t.plannedDate)
  ).length;

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
 * Sanitizes and prepares dataset for isolated import into the current user's workspace:
 * 1. Strips and completely ignores all incoming 'userId', 'uid', 'ownerUid' metadata.
 * 2. Assigns every record exclusively to targetUserId (verified Firebase UID or Guest Session ID).
 * 3. Generates a unique Import ID (importId) for data provenance and multi-import safety.
 * 4. Implements safe ID mapping (idMap) to eliminate ID collisions across multiple files.
 * 5. Rebuilds all parent-child project hierarchies and task-to-project references.
 * 6. Forces showOnCalendar: false by default to prevent calendar clutter.
 * 7. Optionally strips pre-existing dates from tasks for a clean start.
 */
export function sanitizeDatasetForImport(
  raw: any,
  targetUserId: string,
  stripTaskDates: boolean = true,
  sourceFileName?: string
): {
  projects: Project[];
  tasks: Task[];
  timeEntries: TimeEntry[];
  calendarEvents: CalendarEvent[];
  importRecord: WorkspaceImportRecord;
} {
  const rawProjects = Array.isArray(raw.projects) ? raw.projects : [];
  const rawTasks = Array.isArray(raw.tasks) ? raw.tasks : [];
  const rawEntries = Array.isArray(raw.timeEntries) ? raw.timeEntries : [];
  const rawCal = Array.isArray(raw.calendarEvents) ? raw.calendarEvents : [];

  const now = new Date().toISOString();
  const importId = `imp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Safe ID mapping dictionary: Map<oldId, newId>
  const idMap = new Map<string, string>();

  // Pre-generate guaranteed unique IDs for all projects
  rawProjects.forEach((p: any, idx: number) => {
    const rawId = p.id || `orig_proj_${idx}`;
    const newId = `proj_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
    idMap.set(rawId, newId);
  });

  // 1. Projects sanitization with parentId remapping
  const projects: Project[] = rawProjects.map((p: any, idx: number) => {
    const rawId = p.id || `orig_proj_${idx}`;
    const newId = idMap.get(rawId)!;
    const mappedParentId = p.parentId ? idMap.get(p.parentId) || null : null;

    return {
      id: newId,
      userId: targetUserId, // Strict ownership assignment
      name: (p.name || 'Untitled Project').trim(),
      description: p.description?.trim() || undefined,
      color: p.color || '#388bfd',
      status: p.status || 'active',
      parentId: mappedParentId,
      showOnCalendar: false,
      importId,
      createdAt: p.createdAt || now,
      updatedAt: p.updatedAt || now,
    };
  });

  // 2. Tasks sanitization with projectId remapping
  const tasks: Task[] = rawTasks.map((t: any, idx: number) => {
    const newTaskId = `task_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
    const mappedProjId = idMap.get(t.projectId) || projects[0]?.id || 'project_general';

    const sanitizedTask: Task = {
      id: newTaskId,
      userId: targetUserId, // Strict ownership assignment
      projectId: mappedProjId,
      name: (t.name || 'Untitled Task').trim(),
      description: t.description?.trim() || undefined,
      status: t.status || 'pending',
      estimatedHours: typeof t.estimatedHours === 'number' ? t.estimatedHours : undefined,
      deadline: !stripTaskDates && t.deadline ? t.deadline : undefined,
      scheduledDate: !stripTaskDates && t.scheduledDate ? t.scheduledDate : undefined,
      importId,
      createdAt: t.createdAt || now,
      updatedAt: t.updatedAt || now,
    };

    return sanitizedTask;
  });

  // 3. Time entries sanitization
  const timeEntries: TimeEntry[] = rawEntries.map((e: any, idx: number) => {
    const newEntryId = `entry_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
    const mappedProjId = e.projectId ? idMap.get(e.projectId) || undefined : undefined;

    return {
      id: newEntryId,
      userId: targetUserId, // Strict ownership assignment
      projectId: mappedProjId,
      taskId: e.taskId || undefined,
      description: (e.description || 'Imported session').trim(),
      tags: Array.isArray(e.tags) ? e.tags : ['imported'],
      startTime: Number(e.startTime) || Date.now(),
      endTime: Number(e.endTime) || Date.now() + 1800000,
      duration: Number(e.duration) || 1800,
      isManual: Boolean(e.isManual),
      importId,
      createdAt: e.createdAt || now,
      updatedAt: e.updatedAt || now,
    };
  });

  // 4. Calendar events sanitization
  const calendarEvents: CalendarEvent[] = rawCal.map((c: any, idx: number) => {
    const newCalId = `cal_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
    const mappedProjId = c.projectId ? idMap.get(c.projectId) || undefined : undefined;

    return {
      id: newCalId,
      userId: targetUserId, // Strict ownership assignment
      title: (c.title || 'Event').trim(),
      description: c.description?.trim() || undefined,
      date: c.date || toISODate(new Date()),
      startTime: c.startTime || undefined,
      endTime: c.endTime || undefined,
      projectId: mappedProjId,
      color: c.color || '#388bfd',
      type: c.type || 'event',
      isCompleted: Boolean(c.isCompleted),
      importId,
      createdAt: c.createdAt || now,
      updatedAt: c.updatedAt || now,
    };
  });

  // 5. Build Workspace Import Record for provenance tracking
  const importRecord: WorkspaceImportRecord = {
    id: importId,
    userId: targetUserId,
    sourceFileName: sourceFileName || 'workspace_import.json',
    createdAt: now,
    counts: {
      projects: projects.length,
      tasks: tasks.length,
      timeEntries: timeEntries.length,
      calendarEvents: calendarEvents.length,
    },
    schemaVersion: 1,
  };

  return { projects, tasks, timeEntries, calendarEvents, importRecord };
}

function toISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Reset all work records strictly for the current authenticated user's workspace.
 * Queries ONLY where('userId', '==', userId). Never affects any other user.
 */
export async function executeTargetUserReset(
  userId: string,
  onProgress?: (message: string, percent: number) => void
): Promise<{ deletedCounts: Record<string, number> }> {
  if (!userId) {
    throw new Error('User ID is required for reset operation.');
  }

  // Handle Guest Mode reset
  if (userId.startsWith('guest_') || isGuestSessionActive()) {
    clearGuestSession();
    onProgress?.('Guest workspace reset complete.', 100);
    return { deletedCounts: { guestSession: 1 } };
  }

  const collectionsToClear = [
    'projects',
    'tasks',
    'timeEntries',
    'calendarEvents',
    'pomodoroSessions',
    'reminders',
    'autoActivities',
    'imports',
  ];

  const deletedCounts: Record<string, number> = {};
  const totalCollections = collectionsToClear.length;

  for (let cIdx = 0; cIdx < totalCollections; cIdx++) {
    const colName = collectionsToClear[cIdx];
    onProgress?.(`Inspecting ${colName}...`, Math.round((cIdx / totalCollections) * 100));

    // Strictly scoped query by userId
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
          `Clearing ${colName} (${Math.min(i + CHUNK_SIZE, docs.length)}/${docs.length})...`,
          Math.round(((cIdx + i / docs.length) / totalCollections) * 100)
        );
      }
    }
  }

  onProgress?.('Reset completed successfully.', 100);
  return { deletedCounts };
}

/**
 * Bulk writes sanitized projects, tasks, entries, and provenance in safe Firestore batches (max 400 docs/batch).
 * Transparently delegates to guestStorage if in Guest Mode.
 */
export async function executeBatchImport(
  data: {
    projects: Project[];
    tasks: Task[];
    timeEntries?: TimeEntry[];
    calendarEvents?: CalendarEvent[];
    importRecord?: WorkspaceImportRecord;
  },
  onProgress?: (message: string, percent: number) => void
): Promise<{
  projectsWritten: number;
  tasksWritten: number;
  timeEntriesWritten: number;
  calendarEventsWritten: number;
  importId?: string;
}> {
  const { projects, tasks, timeEntries = [], calendarEvents = [], importRecord } = data;
  const isGuest =
    projects[0]?.userId?.startsWith('guest_') ||
    tasks[0]?.userId?.startsWith('guest_') ||
    isGuestSessionActive();

  // If in Guest Mode, commit directly to sessionStorage
  if (isGuest) {
    onProgress?.('Saving to guest workspace session...', 50);
    const result = guestExecuteBatchImport({
      projects,
      tasks,
      timeEntries,
      calendarEvents,
      importRecord,
    });
    onProgress?.('Guest import complete!', 100);
    return {
      ...result,
      importId: importRecord?.id,
    };
  }

  // Authenticated Firestore batch commit
  const totalItems =
    projects.length +
    tasks.length +
    timeEntries.length +
    calendarEvents.length +
    (importRecord ? 1 : 0);
  let itemsWritten = 0;

  const BATCH_SIZE = 400;

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

  // 1. Write Projects first (so parent references exist)
  if (projects.length > 0) {
    onProgress?.(`Writing ${projects.length} projects & subprojects...`, 5);
    await writeListInChunks(projects, 'projects');
  }

  // 2. Write Tasks
  if (tasks.length > 0) {
    onProgress?.(`Writing ${tasks.length} tasks...`, 40);
    await writeListInChunks(tasks, 'tasks');
  }

  // 3. Write Time Entries (if any)
  if (timeEntries.length > 0) {
    onProgress?.(`Writing ${timeEntries.length} time entries...`, 75);
    await writeListInChunks(timeEntries, 'timeEntries');
  }

  // 4. Write Calendar Events (if any)
  if (calendarEvents.length > 0) {
    onProgress?.(`Writing ${calendarEvents.length} calendar events...`, 90);
    await writeListInChunks(calendarEvents, 'calendarEvents');
  }

  // 5. Write Import Provenance record
  if (importRecord) {
    await createImportRecord(importRecord);
  }

  onProgress?.('Import complete!', 100);

  return {
    projectsWritten: projects.length,
    tasksWritten: tasks.length,
    timeEntriesWritten: timeEntries.length,
    calendarEventsWritten: calendarEvents.length,
    importId: importRecord?.id,
  };
}

/**
 * Calls server-side Gemini endpoint /api/gemini/review-import for the user-selected file only.
 */
export async function requestGeminiImportReview(summary: {
  projectsCount: number;
  rootProjects: string[];
  tasksCount: number;
  sampleProjects: any[];
  userNotes?: string;
  isGuest?: boolean;
  guestSessionId?: string;
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
 * Triggers browser download of user data as formatted JSON.
 * Downloads ONLY data belonging to the authenticated user ID.
 */
export async function downloadUserDataExport(userId: string): Promise<void> {
  const data = await fetchAllUserData(userId);
  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `chronos_workspace_export_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
