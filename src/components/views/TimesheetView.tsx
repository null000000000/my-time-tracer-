import React, { useState, useMemo } from 'react';
import {
  Clock,
  Plus,
  Trash2,
  Edit2,
  Filter,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useTimeTracker } from '../../context/TimeTrackerContext';
import { useAuth } from '../../context/AuthContext';
import { TimeEntry } from '../../types';
import {
  createTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
} from '../../services/db';
import {
  formatDurationHuman,
  formatTime,
  formatDate,
  toISODateString,
  getStartOfWeek,
  getEndOfWeek,
} from '../../utils/formatters';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { EmptyState } from '../common/EmptyState';
import { useToast } from '../common/Toast';

export const TimesheetView: React.FC = () => {
  const { user, settings } = useAuth();
  const { timeEntries, projects, tasks } = useTimeTracker();
  const { success, error } = useToast();

  const [currentWeekDate, setCurrentWeekDate] = useState<Date>(new Date());
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');

  // Manual entry modal
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualDate, setManualDate] = useState(toISODateString(new Date()));
  const [manualStartTime, setManualStartTime] = useState('09:00');
  const [manualEndTime, setManualEndTime] = useState('10:30');
  const [manualDesc, setManualDesc] = useState('');
  const [manualProjectId, setManualProjectId] = useState('');
  const [manualTaskId, setManualTaskId] = useState('');

  // Edit modal
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editProjectId, setEditProjectId] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // Week boundaries
  const weekStartMs = useMemo(() => getStartOfWeek(currentWeekDate), [currentWeekDate]);
  const weekEndMs = useMemo(() => getEndOfWeek(currentWeekDate), [currentWeekDate]);

  const handlePrevWeek = () => {
    const d = new Date(currentWeekDate);
    d.setDate(d.getDate() - 7);
    setCurrentWeekDate(d);
  };

  const handleNextWeek = () => {
    const d = new Date(currentWeekDate);
    d.setDate(d.getDate() + 7);
    setCurrentWeekDate(d);
  };

  const handleCurrentWeek = () => {
    setCurrentWeekDate(new Date());
  };

  // Filter entries in selected week
  const weekEntries = useMemo(() => {
    return timeEntries.filter((e) => {
      const inWeek = e.startTime >= weekStartMs && e.startTime <= weekEndMs;
      const matchesProject =
        selectedProjectId === 'all' ||
        (selectedProjectId === 'none' && !e.projectId) ||
        e.projectId === selectedProjectId;
      return inWeek && matchesProject;
    });
  }, [timeEntries, weekStartMs, weekEndMs, selectedProjectId]);

  // Group entries by date
  const groupedByDate = useMemo(() => {
    const map = new Map<string, { dateStr: string; entries: TimeEntry[]; totalSec: number }>();
    weekEntries.forEach((entry) => {
      const dateStr = toISODateString(new Date(entry.startTime));
      const group = map.get(dateStr) || { dateStr, entries: [], totalSec: 0 };
      group.entries.push(entry);
      group.totalSec += entry.duration;
      map.set(dateStr, group);
    });

    const groups = Array.from(map.values());
    groups.sort((a, b) => b.dateStr.localeCompare(a.dateStr));
    return groups;
  }, [weekEntries]);

  // Week total seconds
  const weekTotalSec = useMemo(() => {
    return weekEntries.reduce((sum, e) => sum + e.duration, 0);
  }, [weekEntries]);

  // Add Manual Entry
  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const startDateTime = new Date(`${manualDate}T${manualStartTime}:00`).getTime();
      const endDateTime = new Date(`${manualDate}T${manualEndTime}:00`).getTime();

      if (endDateTime <= startDateTime) {
        error('End time must be after start time');
        return;
      }

      await createTimeEntry({
        userId: user.uid,
        projectId: manualProjectId || undefined,
        taskId: manualTaskId || undefined,
        description: manualDesc.trim() || 'Timesheet Entry',
        tags: [],
        startTime: startDateTime,
        endTime: endDateTime,
        duration: Math.round((endDateTime - startDateTime) / 1000),
        isManual: true,
      });

      success('Timesheet entry added');
      setIsManualModalOpen(false);
      setManualDesc('');
      setManualProjectId('');
      setManualTaskId('');
    } catch (err) {
      console.error(err);
      error('Failed to add entry');
    }
  };

  // Open Edit
  const handleOpenEdit = (entry: TimeEntry) => {
    setEditingEntry(entry);
    setEditDesc(entry.description || '');
    setEditProjectId(entry.projectId || '');
    const s = new Date(entry.startTime);
    const e = new Date(entry.endTime);
    setEditDate(toISODateString(s));
    const pad = (n: number) => n.toString().padStart(2, '0');
    setEditStartTime(`${pad(s.getHours())}:${pad(s.getMinutes())}`);
    setEditEndTime(`${pad(e.getHours())}:${pad(e.getMinutes())}`);
  };

  // Save Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;

    try {
      const startDateTime = new Date(`${editDate}T${editStartTime}:00`).getTime();
      const endDateTime = new Date(`${editDate}T${editEndTime}:00`).getTime();

      if (endDateTime <= startDateTime) {
        error('End time must be after start time');
        return;
      }

      await updateTimeEntry(editingEntry.id, {
        description: editDesc.trim() || 'Tracked Session',
        projectId: editProjectId || undefined,
        startTime: startDateTime,
        endTime: endDateTime,
        duration: Math.round((endDateTime - startDateTime) / 1000),
      });

      success('Timesheet entry updated');
      setEditingEntry(null);
    } catch (err) {
      console.error(err);
      error('Failed to update entry');
    }
  };

  // Delete
  const handleConfirmDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteTimeEntry(deletingId);
      success('Entry deleted');
    } catch (err) {
      console.error(err);
      error('Failed to delete entry');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Bar with Week Navigator */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#21262d]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-[#0d1117] border border-[#21262d] rounded-xl p-1">
            <button
              onClick={handlePrevWeek}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#161b22] cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleCurrentWeek}
              className="px-3 py-1 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-[#161b22] cursor-pointer"
            >
              This Week
            </button>
            <button
              onClick={handleNextWeek}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#161b22] cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="text-xs">
            <span className="text-slate-400 font-medium">
              {formatDate(weekStartMs)} – {formatDate(weekEndMs)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Project Filter */}
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-[#0d1117] border border-[#21262d] text-xs text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">All Projects</option>
            <option value="none">No Project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Add Entry Button */}
          <button
            onClick={() => setIsManualModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Entry</span>
          </button>
        </div>
      </div>

      {/* Week Summary KPI Banner */}
      <div className="p-4 rounded-2xl bg-[#0d1117] border border-[#21262d] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-400">Total Tracked This Week</span>
            <p className="text-xl font-bold font-mono text-white mt-0.5">
              {formatDurationHuman(weekTotalSec)}
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-xs font-mono text-slate-400">
            {weekEntries.length} {weekEntries.length === 1 ? 'entry' : 'entries'} logged
          </span>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Avg: {formatDurationHuman(groupedByDate.length > 0 ? weekTotalSec / groupedByDate.length : 0)} / active day
          </p>
        </div>
      </div>

      {/* Grouped Timesheet Table */}
      {groupedByDate.length > 0 ? (
        <div className="space-y-4">
          {groupedByDate.map((group) => {
            const groupDateObj = new Date(`${group.dateStr}T00:00:00`);
            return (
              <div
                key={group.dateStr}
                className="rounded-2xl bg-[#0d1117] border border-[#21262d] overflow-hidden shadow-sm"
              >
                {/* Group Header */}
                <div className="px-5 py-3 bg-[#121620] border-b border-[#21262d] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-semibold text-white tracking-wide">
                      {formatDate(groupDateObj)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-400">Daily Total:</span>
                    <span className="font-mono text-xs font-bold text-blue-400 bg-[#161b22] px-2.5 py-0.5 rounded-md border border-[#262c36]">
                      {formatDurationHuman(group.totalSec)}
                    </span>
                  </div>
                </div>

                {/* Group Entries */}
                <div className="divide-y divide-[#21262d]">
                  {group.entries.map((entry) => {
                    const proj = entry.projectId ? projectMap.get(entry.projectId) : null;
                    return (
                      <div
                        key={entry.id}
                        className="px-5 py-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 hover:bg-[#121620] transition-colors group"
                      >
                        {/* Info */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: proj?.color || '#475569' }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-white truncate">
                              {entry.description || 'Tracked Session'}
                            </p>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {proj?.name || 'No Project'}
                            </p>
                          </div>
                        </div>

                        {/* Timing and actions */}
                        <div className="flex items-center justify-between md:justify-end gap-5 w-full md:w-auto shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-[#1c222c]">
                          <span className="font-mono text-xs text-slate-400">
                            {formatTime(entry.startTime)} – {formatTime(entry.endTime)}
                          </span>

                          <span className="font-mono text-xs font-semibold text-white bg-[#161b22] px-3 py-1 rounded-lg border border-[#262c36]">
                            {formatDurationHuman(entry.duration)}
                          </span>

                          <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleOpenEdit(entry)}
                              title="Edit entry"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1c222c] transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeletingId(entry.id)}
                              title="Delete entry"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-[#1c222c] transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Calendar}
          title="No timesheet entries for this week"
          description="Log hours using the timer or click 'Add Entry' to record work manually."
          actionLabel="Add Manual Entry"
          onAction={() => setIsManualModalOpen(true)}
        />
      )}

      {/* MODAL: ADD MANUAL ENTRY */}
      <Modal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        title="Add Timesheet Entry"
        subtitle="Log past work onto this timesheet"
      >
        <form onSubmit={handleSaveManual} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Description</label>
            <input
              type="text"
              required
              placeholder="What did you work on?"
              value={manualDesc}
              onChange={(e) => setManualDesc(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Project</label>
              <select
                value={manualProjectId}
                onChange={(e) => {
                  setManualProjectId(e.target.value);
                  setManualTaskId('');
                }}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="">No Project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Task</label>
              <select
                value={manualTaskId}
                onChange={(e) => setManualTaskId(e.target.value)}
                disabled={!manualProjectId}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-slate-200 focus:outline-none disabled:opacity-50 cursor-pointer"
              >
                <option value="">No Task</option>
                {tasks
                  .filter((t) => t.projectId === manualProjectId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Date</label>
            <input
              type="date"
              required
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Start Time</label>
              <input
                type="time"
                required
                value={manualStartTime}
                onChange={(e) => setManualStartTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">End Time</label>
              <input
                type="time"
                required
                value={manualEndTime}
                onChange={(e) => setManualEndTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#21262d]">
            <button
              type="button"
              onClick={() => setIsManualModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:text-white bg-[#161b22] border border-[#2b3341]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/20"
            >
              Add Entry
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: EDIT ENTRY */}
      <Modal
        isOpen={Boolean(editingEntry)}
        onClose={() => setEditingEntry(null)}
        title="Edit Timesheet Entry"
        subtitle="Modify duration, project, or description"
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Description</label>
            <input
              type="text"
              required
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Project</label>
            <select
              value={editProjectId}
              onChange={(e) => setEditProjectId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="">No Project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Date</label>
            <input
              type="date"
              required
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Start Time</label>
              <input
                type="time"
                required
                value={editStartTime}
                onChange={(e) => setEditStartTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">End Time</label>
              <input
                type="time"
                required
                value={editEndTime}
                onChange={(e) => setEditEndTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#21262d]">
            <button
              type="button"
              onClick={() => setEditingEntry(null)}
              className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:text-white bg-[#161b22] border border-[#2b3341]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/20"
            >
              Save Changes
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={Boolean(deletingId)}
        onClose={() => setDeletingId(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Timesheet Entry"
        message="Are you sure you want to delete this recorded timesheet entry?"
      />
    </div>
  );
};
