import React, { useState } from 'react';
import {
  FolderKanban,
  CheckSquare,
  Calendar,
  Clock,
  Flame,
  Bell,
  ArrowRight,
  Trash2,
  X,
  UploadCloud,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getGuestDataCounts } from '../../services/guestStorage';
import { useToast } from './Toast';
import { Modal } from './Modal';
import { Project, Task, CalendarEvent, TimeEntry, PomodoroSession, Reminder } from '../../types';
import {
  createProject,
  createTask,
  createCalendarEvent,
  createTimeEntry,
  createPomodoroSession,
  createReminder,
} from '../../services/db';

export const GuestMigrationModal: React.FC = () => {
  const {
    user,
    showMigrationModal,
    pendingGuestData,
    cancelMigration,
    discardGuestDataAndProceed,
    completeMigration,
  } = useAuth();
  const { success: toastSuccess } = useToast();
  const [migrating, setMigrating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!showMigrationModal || !pendingGuestData || !user) return null;

  const counts = getGuestDataCounts(pendingGuestData);

  const handleImport = async () => {
    try {
      setMigrating(true);
      setError(null);

      // Attempt server-side migration endpoint first
      let serverMigrated = false;
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/guest/migrate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            userId: user.uid,
            guestData: pendingGuestData,
          }),
        });

        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            serverMigrated = true;
          }
        }
      } catch (srvErr) {
        console.warn('Server migration endpoint unavailable, proceeding with resilient client pipeline:', srvErr);
      }

      // If server migration was skipped or network was local, execute robust client pipeline
      if (!serverMigrated) {
        // Map old guest project IDs to new unique IDs to preserve hierarchy
        const idMap = new Map<string, string>();

        // 1. Root projects first
        const rootProjects = pendingGuestData.projects.filter((p) => !p.parentId);
        for (const proj of rootProjects) {
          const newId = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          idMap.set(proj.id, newId);
          await createProject(
            {
              userId: user.uid,
              name: proj.name,
              description: proj.description || '',
              color: proj.color,
              status: proj.status,
              startDate: proj.startDate,
              deadline: proj.deadline,
              budgetHours: proj.budgetHours,
              parentId: null,
              showOnCalendar: proj.showOnCalendar ?? false,
            },
            newId
          );
        }

        // 2. Subprojects next (using mapped parentId)
        const subprojects = pendingGuestData.projects.filter((p) => Boolean(p.parentId));
        for (const sp of subprojects) {
          const newId = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          idMap.set(sp.id, newId);
          const mappedParentId = sp.parentId ? (idMap.get(sp.parentId) || sp.parentId) : null;
          await createProject(
            {
              userId: user.uid,
              name: sp.name,
              description: sp.description || '',
              color: sp.color,
              status: sp.status,
              startDate: sp.startDate,
              deadline: sp.deadline,
              budgetHours: sp.budgetHours,
              parentId: mappedParentId,
              showOnCalendar: sp.showOnCalendar ?? false,
            },
            newId
          );
        }

        // 3. Tasks (mapped to new project/subproject IDs)
        for (const task of pendingGuestData.tasks) {
          const mappedProjId = idMap.get(task.projectId) || task.projectId;
          await createTask({
            userId: user.uid,
            projectId: mappedProjId,
            name: task.name,
            description: task.description || '',
            status: task.status,
            estimatedHours: task.estimatedHours,
            deadline: task.deadline,
            scheduledDate: task.scheduledDate,
          });
        }

        // 4. Calendar Events (mapped to new project IDs)
        for (const evt of pendingGuestData.calendarEvents) {
          const mappedProjId = evt.projectId ? (idMap.get(evt.projectId) || evt.projectId) : undefined;
          await createCalendarEvent({
            userId: user.uid,
            title: evt.title,
            description: evt.description || '',
            date: evt.date,
            startTime: evt.startTime,
            endTime: evt.endTime,
            projectId: mappedProjId,
            color: evt.color,
            type: evt.type,
            isCompleted: evt.isCompleted ?? false,
          });
        }

        // 5. Time Entries (mapped to new project IDs)
        for (const entry of pendingGuestData.timeEntries) {
          const mappedProjId = entry.projectId ? (idMap.get(entry.projectId) || entry.projectId) : undefined;
          await createTimeEntry({
            userId: user.uid,
            projectId: mappedProjId,
            description: entry.description || 'Tracked Session',
            tags: entry.tags || [],
            startTime: entry.startTime,
            endTime: entry.endTime,
            duration: entry.duration,
            isManual: entry.isManual ?? false,
          });
        }

        // 6. Pomodoro Sessions
        for (const pomo of pendingGuestData.pomodoroSessions) {
          const mappedProjId = pomo.projectId ? (idMap.get(pomo.projectId) || pomo.projectId) : undefined;
          await createPomodoroSession({
            userId: user.uid,
            projectId: mappedProjId,
            type: pomo.type,
            durationMinutes: pomo.durationMinutes,
            completedAt: pomo.completedAt,
            loggedAsTimeEntry: pomo.loggedAsTimeEntry,
          });
        }

        // 7. Reminders
        for (const rem of pendingGuestData.reminders) {
          await createReminder({
            userId: user.uid,
            title: rem.title,
            description: rem.description || '',
            scheduledTime: rem.scheduledTime,
            isRecurring: rem.isRecurring,
            recurrenceRule: rem.recurrenceRule,
            isCompleted: rem.isCompleted,
            isEnabled: rem.isEnabled,
          });
        }
      }

      toastSuccess(
        `Transferred ${counts.totalProjects} projects, ${counts.tasks} tasks, and ${counts.calendarEvents} events to your account!`
      );
      completeMigration();
    } catch (err: any) {
      console.error('Migration failed:', err);
      setError(err?.message || 'Failed to complete data transfer. Your temporary data is still intact.');
    } finally {
      setMigrating(false);
    }
  };

  return (
    <Modal
      isOpen={showMigrationModal}
      onClose={cancelMigration}
      title="Transfer Guest Data to Your Account"
      maxWidth="max-w-xl"
    >
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-blue-400 font-mono mb-1">
            <UploadCloud className="w-4 h-4" />
            <span>SESSION MIGRATION PIPELINE</span>
          </div>
          <p className="text-sm text-slate-300">
            You are signed in as <span className="font-semibold text-white">{user.email || user.displayName || 'your account'}</span>.
            We found work created during your guest session. Choose how you would like to proceed:
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/40 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Itemized Inventory */}
        <div className="p-4 rounded-xl bg-[#161b22] border border-[#21262d] space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
            Guest Workspace Inventory
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div className="p-3 rounded-lg bg-[#0d1117] border border-[#30363d] flex items-center gap-2.5">
              <FolderKanban className="w-4 h-4 text-blue-400 shrink-0" />
              <div>
                <span className="block text-base font-bold text-white font-mono">{counts.totalProjects}</span>
                <span className="block text-[11px] text-slate-400">
                  {counts.rootProjects} root, {counts.subprojects} sub
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#0d1117] border border-[#30363d] flex items-center gap-2.5">
              <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <span className="block text-base font-bold text-white font-mono">{counts.tasks}</span>
                <span className="block text-[11px] text-slate-400">Tasks</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#0d1117] border border-[#30363d] flex items-center gap-2.5">
              <Calendar className="w-4 h-4 text-indigo-400 shrink-0" />
              <div>
                <span className="block text-base font-bold text-white font-mono">{counts.calendarEvents}</span>
                <span className="block text-[11px] text-slate-400">Calendar Events</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#0d1117] border border-[#30363d] flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <span className="block text-base font-bold text-white font-mono">{counts.timeEntries}</span>
                <span className="block text-[11px] text-slate-400">Time Entries</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#0d1117] border border-[#30363d] flex items-center gap-2.5">
              <Flame className="w-4 h-4 text-rose-400 shrink-0" />
              <div>
                <span className="block text-base font-bold text-white font-mono">{counts.pomodoroSessions}</span>
                <span className="block text-[11px] text-slate-400">Pomodoros</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#0d1117] border border-[#30363d] flex items-center gap-2.5">
              <Bell className="w-4 h-4 text-purple-400 shrink-0" />
              <div>
                <span className="block text-base font-bold text-white font-mono">{counts.reminders}</span>
                <span className="block text-[11px] text-slate-400">Reminders</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="space-y-3 pt-2">
          {/* Action 1: Import */}
          <button
            type="button"
            onClick={handleImport}
            disabled={migrating}
            className="w-full flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium text-sm transition-all shadow-md hover:shadow-blue-500/20 cursor-pointer disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <UploadCloud className="w-5 h-5 shrink-0" />
              <div className="text-left">
                <span className="block font-semibold">Import Guest Data into Account</span>
                <span className="block text-xs text-blue-100">
                  Transfers all projects, tasks, and history safely into your permanent cloud workspace
                </span>
              </div>
            </div>
            {migrating ? (
              <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin shrink-0" />
            ) : (
              <ArrowRight className="w-5 h-5 shrink-0" />
            )}
          </button>

          {/* Action 2: Discard */}
          <button
            type="button"
            onClick={discardGuestDataAndProceed}
            disabled={migrating}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-[#161b22] hover:bg-rose-950/30 border border-[#30363d] hover:border-rose-700/50 text-slate-300 hover:text-rose-200 text-xs font-medium transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Trash2 className="w-4 h-4 text-slate-400 group-hover:text-rose-400 shrink-0" />
              <div className="text-left">
                <span className="block font-medium">Discard Guest Data</span>
                <span className="block text-[11px] text-slate-500">
                  Clear temporary data and load your account's existing cloud data cleanly
                </span>
              </div>
            </div>
            <span className="text-[11px] font-mono text-slate-500">Clear</span>
          </button>

          {/* Action 3: Cancel / Return to Guest */}
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={cancelMigration}
              disabled={migrating}
              className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer py-1 px-3"
            >
              Cancel and Return to Guest Session
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
