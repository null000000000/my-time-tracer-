import React, { useState } from 'react';
import {
  Play,
  Pause,
  Square,
  Plus,
  Trash2,
  Edit2,
  Tag,
  Folder,
  CheckSquare,
  Search,
  Filter,
  Calendar,
  X,
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
  formatSecondsToHMS,
  formatTime,
  formatDate,
  toISODateString,
} from '../../utils/formatters';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { EmptyState } from '../common/EmptyState';
import { useToast } from '../common/Toast';

export const TimeTrackerView: React.FC = () => {
  const { user, settings } = useAuth();
  const {
    activeTimer,
    elapsedSeconds,
    isRunning,
    isPaused,
    projects,
    tasks,
    timeEntries,
    startTimer,
    pauseTimer,
    resumeTimer,
    stopTimer,
    discardTimer,
    updateActiveTimerDraft,
  } = useTimeTracker();

  const { success, error } = useToast();

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('all');

  // Input states for running/starting timer
  const [timerDesc, setTimerDesc] = useState('');
  const [timerProjectId, setTimerProjectId] = useState('');
  const [timerTaskId, setTimerTaskId] = useState('');
  const [timerTagInput, setTimerTagInput] = useState('');
  const [timerTags, setTimerTags] = useState<string[]>([]);

  // Manual entry modal
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualDate, setManualDate] = useState(toISODateString(new Date()));
  const [manualStartTime, setManualStartTime] = useState('09:00');
  const [manualEndTime, setManualEndTime] = useState('10:00');
  const [manualDesc, setManualDesc] = useState('');
  const [manualProjectId, setManualProjectId] = useState('');
  const [manualTaskId, setManualTaskId] = useState('');
  const [manualTags, setManualTags] = useState<string[]>([]);
  const [manualTagInput, setManualTagInput] = useState('');

  // Edit entry modal
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editProjectId, setEditProjectId] = useState('');
  const [editTaskId, setEditTaskId] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState('');

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Sync draft inputs if activeTimer exists
  React.useEffect(() => {
    if (activeTimer) {
      setTimerDesc(activeTimer.description || '');
      setTimerProjectId(activeTimer.projectId || '');
      setTimerTaskId(activeTimer.taskId || '');
      setTimerTags(activeTimer.tags || []);
    }
  }, [activeTimer]);

  // Project map for quick lookup
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  // Tasks filtered by current project selection for active timer
  const availableTasks = tasks.filter((t) => t.projectId === (activeTimer ? activeTimer.projectId : timerProjectId));

  // Handle start timer
  const handleStart = async () => {
    try {
      await startTimer({
        description: timerDesc.trim(),
        projectId: timerProjectId || undefined,
        taskId: timerTaskId || undefined,
        tags: timerTags,
      });
      success('Timer started');
    } catch (e) {
      console.error(e);
      error('Failed to start timer');
    }
  };

  // Handle stop timer
  const handleStop = async () => {
    try {
      const entryId = await stopTimer();
      if (entryId) {
        success('Session saved to database');
      } else {
        success('Timer stopped (less than 1s, not logged)');
      }
      setTimerDesc('');
      setTimerProjectId('');
      setTimerTaskId('');
      setTimerTags([]);
    } catch (e) {
      console.error(e);
      error('Failed to stop timer');
    }
  };

  // Add tag to active timer
  const handleAddTimerTag = () => {
    const trimmed = timerTagInput.trim().replace(/^#/, '');
    if (trimmed && !timerTags.includes(trimmed)) {
      const nextTags = [...timerTags, trimmed];
      setTimerTags(nextTags);
      if (activeTimer) {
        updateActiveTimerDraft({ tags: nextTags });
      }
    }
    setTimerTagInput('');
  };

  const handleRemoveTimerTag = (tag: string) => {
    const nextTags = timerTags.filter((t) => t !== tag);
    setTimerTags(nextTags);
    if (activeTimer) {
      updateActiveTimerDraft({ tags: nextTags });
    }
  };

  // Manual Entry Save
  const handleSaveManualEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const startDateTime = new Date(`${manualDate}T${manualStartTime}:00`).getTime();
      const endDateTime = new Date(`${manualDate}T${manualEndTime}:00`).getTime();

      if (endDateTime <= startDateTime) {
        error('End time must be after start time');
        return;
      }

      const durationSec = Math.round((endDateTime - startDateTime) / 1000);

      await createTimeEntry({
        userId: user.uid,
        projectId: manualProjectId || undefined,
        taskId: manualTaskId || undefined,
        description: manualDesc.trim() || 'Manual Session',
        tags: manualTags,
        startTime: startDateTime,
        endTime: endDateTime,
        duration: durationSec,
        isManual: true,
      });

      success('Manual entry added');
      setIsManualModalOpen(false);
      setManualDesc('');
      setManualProjectId('');
      setManualTaskId('');
      setManualTags([]);
    } catch (err) {
      console.error(err);
      error('Failed to save entry');
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (entry: TimeEntry) => {
    setEditingEntry(entry);
    setEditDesc(entry.description || '');
    setEditProjectId(entry.projectId || '');
    setEditTaskId(entry.taskId || '');
    setEditTags(entry.tags || []);

    const startDateObj = new Date(entry.startTime);
    const endDateObj = new Date(entry.endTime);
    setEditDate(toISODateString(startDateObj));

    const pad = (n: number) => n.toString().padStart(2, '0');
    setEditStartTime(`${pad(startDateObj.getHours())}:${pad(startDateObj.getMinutes())}`);
    setEditEndTime(`${pad(endDateObj.getHours())}:${pad(endDateObj.getMinutes())}`);
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

      const durationSec = Math.round((endDateTime - startDateTime) / 1000);

      await updateTimeEntry(editingEntry.id, {
        description: editDesc.trim() || 'Tracked Session',
        projectId: editProjectId || undefined,
        taskId: editTaskId || undefined,
        startTime: startDateTime,
        endTime: endDateTime,
        duration: durationSec,
        tags: editTags,
      });

      success('Entry updated');
      setEditingEntry(null);
    } catch (err) {
      console.error(err);
      error('Failed to update entry');
    }
  };

  // Delete entry
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

  // Filtered entries
  const filteredEntries = timeEntries.filter((entry) => {
    const matchesSearch =
      searchTerm === '' ||
      entry.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.tags.some((t) => t.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesProject =
      selectedProjectFilter === 'all' ||
      (selectedProjectFilter === 'none' && !entry.projectId) ||
      entry.projectId === selectedProjectFilter;

    return matchesSearch && matchesProject;
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* SECTION TOP: Live Timer Tracking Bar */}
      <div className="p-5 md:p-6 rounded-2xl bg-[#0d1117] border border-[#21262d] shadow-lg">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Left: Description & Tags */}
          <div className="flex-1 flex flex-col md:flex-row items-stretch md:items-center gap-3">
            <input
              type="text"
              placeholder="What are you working on? (e.g. TryHackMe Lab, Pen testing research, Study...)"
              value={timerDesc}
              onChange={(e) => {
                setTimerDesc(e.target.value);
                if (activeTimer) updateActiveTimerDraft({ description: e.target.value });
              }}
              className="flex-1 px-4 py-2.5 rounded-xl bg-[#161b22] border border-[#262c36] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />

            {/* Project Picker */}
            <div className="flex items-center gap-2">
              <select
                value={timerProjectId}
                onChange={(e) => {
                  const val = e.target.value;
                  setTimerProjectId(val);
                  setTimerTaskId('');
                  if (activeTimer) updateActiveTimerDraft({ projectId: val, taskId: '' });
                }}
                className="px-3 py-2.5 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="">No Project</option>
                {projects
                  .filter((p) => p.status === 'active')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>

              {/* Task Picker */}
              {availableTasks.length > 0 && (
                <select
                  value={timerTaskId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTimerTaskId(val);
                    if (activeTimer) updateActiveTimerDraft({ taskId: val });
                  }}
                  className="px-3 py-2.5 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer max-w-[140px]"
                >
                  <option value="">Task (Optional)</option>
                  {availableTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Right: Timer Clock & Buttons */}
          <div className="flex items-center justify-between lg:justify-end gap-4 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-[#21262d]">
            {/* Live Timer Display */}
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  activeTimer ? (isPaused ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse') : 'bg-slate-600'
                }`}
              />
              <span className="font-mono text-2xl md:text-3xl font-bold tracking-tight text-white min-w-[130px]">
                {formatSecondsToHMS(elapsedSeconds)}
              </span>
            </div>

            {/* Timer Actions */}
            <div className="flex items-center gap-2">
              {activeTimer ? (
                <>
                  {isPaused ? (
                    <button
                      onClick={resumeTimer}
                      title="Resume timer"
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-colors cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Resume</span>
                    </button>
                  ) : (
                    <button
                      onClick={pauseTimer}
                      title="Pause timer"
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-md transition-colors cursor-pointer"
                    >
                      <Pause className="w-4 h-4 fill-current" />
                      <span>Pause</span>
                    </button>
                  )}
                  <button
                    onClick={handleStop}
                    title="Stop and save session"
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md transition-colors cursor-pointer"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    <span>Stop</span>
                  </button>
                  <button
                    onClick={discardTimer}
                    title="Discard session without saving"
                    className="p-2.5 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-[#1c222c] transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <button
                  onClick={handleStart}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 transition-all cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start</span>
                </button>
              )}

              {/* Manual Entry Button */}
              <button
                onClick={() => setIsManualModalOpen(true)}
                title="Add manual time entry"
                className="p-2.5 rounded-xl bg-[#161b22] hover:bg-[#202632] border border-[#262c36] text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Tags line for running timer */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#1c222c] flex-wrap text-xs">
          <Tag className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-slate-500 text-[11px]">Tags:</span>
          {timerTags.map((t) => (
            <span
              key={t}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#161b22] border border-[#262c36] text-[11px] text-slate-300"
            >
              #{t}
              <button
                type="button"
                onClick={() => handleRemoveTimerTag(t)}
                className="hover:text-rose-400 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <div className="flex items-center gap-1">
            <input
              type="text"
              placeholder="Add tag + Enter"
              value={timerTagInput}
              onChange={(e) => setTimerTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTimerTag();
                }
              }}
              className="px-2 py-0.5 rounded-md bg-[#161b22] border border-[#262c36] text-[11px] text-slate-300 focus:outline-none focus:border-blue-500 w-28"
            />
          </div>
        </div>
      </div>

      {/* SECTION BOTTOM: Time Entries History List */}
      <div className="space-y-4">
        {/* Controls Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Search */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search descriptions, tags..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#0d1117] border border-[#21262d] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Filter by Project */}
            <select
              value={selectedProjectFilter}
              onChange={(e) => setSelectedProjectFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[#0d1117] border border-[#21262d] text-xs text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="all">All Projects</option>
              <option value="none">No Project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <span className="text-xs text-slate-400 font-medium">
            {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'} found
          </span>
        </div>

        {/* Entries Table */}
        {filteredEntries.length > 0 ? (
          <div className="rounded-2xl bg-[#0d1117] border border-[#21262d] divide-y divide-[#21262d] overflow-hidden">
            {filteredEntries.map((entry) => {
              const proj = entry.projectId ? projectMap.get(entry.projectId) : null;
              const tsk = entry.taskId ? taskMap.get(entry.taskId) : null;

              return (
                <div
                  key={entry.id}
                  className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-[#121620] transition-colors group"
                >
                  {/* Left: Info */}
                  <div className="flex items-start md:items-center gap-3 flex-1 min-w-0">
                    <div
                      className="w-3 h-3 rounded-full shrink-0 mt-1 md:mt-0"
                      style={{ backgroundColor: proj?.color || '#475569' }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-white">
                          {entry.description || 'Tracked Session'}
                        </span>
                        {entry.isManual && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                            manual
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1 flex-wrap">
                        <span className="text-slate-300 font-medium">
                          {proj ? proj.name : 'No Project'}
                        </span>
                        {tsk && (
                          <>
                            <span>•</span>
                            <span className="text-slate-400">{tsk.name}</span>
                          </>
                        )}
                        <span>•</span>
                        <span>{formatDate(entry.startTime)}</span>
                        <span>•</span>
                        <span className="font-mono text-slate-400">
                          {formatTime(entry.startTime, settings.timeFormat === '24h')} -{' '}
                          {formatTime(entry.endTime, settings.timeFormat === '24h')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Tags & Duration & Action buttons */}
                  <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-[#1c222c]">
                    {entry.tags && entry.tags.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {entry.tags.map((t) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded bg-[#161b22] text-[10px] text-slate-400 border border-[#21262d]"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}

                    <span className="font-mono text-xs font-semibold text-white bg-[#161b22] px-3 py-1 rounded-lg border border-[#262c36]">
                      {formatDurationHuman(entry.duration)}
                    </span>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
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
        ) : (
          <EmptyState
            icon={Calendar}
            title={timeEntries.length === 0 ? 'No time entries recorded' : 'No matching entries'}
            description={
              timeEntries.length === 0
                ? 'Use the tracker above to log your first work session'
                : 'Try adjusting your search keywords or project filters'
            }
          />
        )}
      </div>

      {/* MODAL: Manual Time Entry */}
      <Modal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        title="Add Manual Time Entry"
        subtitle="Log past work completed without a live timer"
      >
        <form onSubmit={handleSaveManualEntry} className="space-y-4">
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
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
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
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Task (Optional)</label>
              <select
                value={manualTaskId}
                onChange={(e) => setManualTaskId(e.target.value)}
                disabled={!manualProjectId}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-50 cursor-pointer"
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
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none focus:border-blue-500"
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
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">End Time</label>
              <input
                type="time"
                required
                value={manualEndTime}
                onChange={(e) => setManualEndTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Tags</label>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {manualTags.map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 rounded bg-[#161b22] border border-[#262c36] text-[11px] text-slate-300 flex items-center gap-1"
                >
                  #{t}
                  <button
                    type="button"
                    onClick={() => setManualTags(manualTags.filter((x) => x !== t))}
                    className="hover:text-rose-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Add tag and click Add"
                value={manualTagInput}
                onChange={(e) => setManualTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const trimmed = manualTagInput.trim().replace(/^#/, '');
                    if (trimmed && !manualTags.includes(trimmed)) {
                      setManualTags([...manualTags, trimmed]);
                      setManualTagInput('');
                    }
                  }
                }}
                className="flex-1 px-3 py-1.5 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => {
                  const trimmed = manualTagInput.trim().replace(/^#/, '');
                  if (trimmed && !manualTags.includes(trimmed)) {
                    setManualTags([...manualTags, trimmed]);
                    setManualTagInput('');
                  }
                }}
                className="px-3 py-1.5 rounded-xl bg-[#21262d] text-xs text-slate-200 hover:text-white"
              >
                Add
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#21262d]">
            <button
              type="button"
              onClick={() => setIsManualModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-[#161b22] border border-[#2b3341]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/20"
            >
              Save Entry
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Edit Entry */}
      <Modal
        isOpen={Boolean(editingEntry)}
        onClose={() => setEditingEntry(null)}
        title="Edit Time Entry"
        subtitle="Modify duration, timestamps or project association"
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Description</label>
            <input
              type="text"
              required
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Project</label>
              <select
                value={editProjectId}
                onChange={(e) => {
                  setEditProjectId(e.target.value);
                  setEditTaskId('');
                }}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
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
                value={editTaskId}
                onChange={(e) => setEditTaskId(e.target.value)}
                disabled={!editProjectId}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-50 cursor-pointer"
              >
                <option value="">No Task</option>
                {tasks
                  .filter((t) => t.projectId === editProjectId)
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
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none focus:border-blue-500"
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
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">End Time</label>
              <input
                type="time"
                required
                value={editEndTime}
                onChange={(e) => setEditEndTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Tags</label>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {editTags.map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 rounded bg-[#161b22] border border-[#262c36] text-[11px] text-slate-300 flex items-center gap-1"
                >
                  #{t}
                  <button
                    type="button"
                    onClick={() => setEditTags(editTags.filter((x) => x !== t))}
                    className="hover:text-rose-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Add tag and click Add"
                value={editTagInput}
                onChange={(e) => setEditTagInput(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => {
                  const trimmed = editTagInput.trim().replace(/^#/, '');
                  if (trimmed && !editTags.includes(trimmed)) {
                    setEditTags([...editTags, trimmed]);
                    setEditTagInput('');
                  }
                }}
                className="px-3 py-1.5 rounded-xl bg-[#21262d] text-xs text-slate-200 hover:text-white"
              >
                Add
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#21262d]">
            <button
              type="button"
              onClick={() => setEditingEntry(null)}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-[#161b22] border border-[#2b3341]"
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

      {/* Confirm Delete */}
      <ConfirmDialog
        isOpen={Boolean(deletingId)}
        onClose={() => setDeletingId(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Time Entry"
        message="Are you sure you want to delete this recorded session? This action cannot be undone."
      />
    </div>
  );
};
