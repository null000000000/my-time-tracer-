import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  Trash2,
  Edit2,
  Tag,
  Filter,
} from 'lucide-react';
import { useTimeTracker } from '../../context/TimeTrackerContext';
import { TimeEntry } from '../../types';
import {
  formatDurationHuman,
  formatTime,
  formatDate,
  toISODateString,
} from '../../utils/formatters';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { updateTimeEntry, deleteTimeEntry } from '../../services/db';
import { useToast } from '../common/Toast';

type CalendarViewMode = 'month' | 'week' | 'day';

export const CalendarView: React.FC = () => {
  const { timeEntries, projects, tasks } = useTimeTracker();
  const { success, error } = useToast();

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');

  // Entry Inspection modal
  const [inspectedEntry, setInspectedEntry] = useState<TimeEntry | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Edit entry in modal
  const [isEditing, setIsEditing] = useState(false);
  const [editDesc, setEditDesc] = useState('');
  const [editProjId, setEditProjId] = useState('');

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // Navigate dates
  const handlePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === 'month') d.setMonth(d.getMonth() - 1);
    else if (viewMode === 'week') d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (viewMode === 'month') d.setMonth(d.getMonth() + 1);
    else if (viewMode === 'week') d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Filter entries
  const filteredEntries = useMemo(() => {
    return timeEntries.filter((e) => {
      if (selectedProjectId === 'all') return true;
      if (selectedProjectId === 'none') return !e.projectId;
      return e.projectId === selectedProjectId;
    });
  }, [timeEntries, selectedProjectId]);

  // Month grid dates
  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const days: { date: Date; isCurrentMonth: boolean; dateStr: string }[] = [];

    // Pad beginning (Monday = 1 ... Sunday = 0)
    let startDayOfWeek = firstDay.getDay(); // 0 is Sunday
    const padCount = (startDayOfWeek + 6) % 7; // Monday as start: Monday has pad 0

    for (let i = padCount; i > 0; i--) {
      const d = new Date(year, month, 1 - i);
      days.push({ date: d, isCurrentMonth: false, dateStr: toISODateString(d) });
    }

    // Days of current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const d = new Date(year, month, i);
      days.push({ date: d, isCurrentMonth: true, dateStr: toISODateString(d) });
    }

    // Pad end to make 35 or 42 grid cells
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({ date: d, isCurrentMonth: false, dateStr: toISODateString(d) });
    }

    return days;
  }, [currentDate]);

  // Map entries by date string
  const entriesByDate = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    filteredEntries.forEach((entry) => {
      const dateStr = toISODateString(new Date(entry.startTime));
      const list = map.get(dateStr) || [];
      list.push(entry);
      map.set(dateStr, list);
    });
    return map;
  }, [filteredEntries]);

  // Week View Days
  const weekDays = useMemo(() => {
    const d = new Date(currentDate);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Start Monday
    const startOfWeek = new Date(d.setDate(diff));

    const days: { date: Date; dateStr: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(startOfWeek);
      dayDate.setDate(dayDate.getDate() + i);
      days.push({ date: dayDate, dateStr: toISODateString(dayDate) });
    }
    return days;
  }, [currentDate]);

  // Handle Edit Save
  const handleSaveEdit = async () => {
    if (!inspectedEntry) return;
    try {
      await updateTimeEntry(inspectedEntry.id, {
        description: editDesc.trim() || 'Tracked Session',
        projectId: editProjId || undefined,
      });
      success('Entry updated');
      setIsEditing(false);
      setInspectedEntry({
        ...inspectedEntry,
        description: editDesc.trim() || 'Tracked Session',
        projectId: editProjId || undefined,
      });
    } catch (e) {
      console.error(e);
      error('Failed to update entry');
    }
  };

  // Handle Delete
  const handleConfirmDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteTimeEntry(deletingId);
      success('Entry deleted');
      setInspectedEntry(null);
    } catch (e) {
      console.error(e);
      error('Failed to delete entry');
    } finally {
      setDeletingId(null);
    }
  };

  const todayStr = toISODateString(new Date());

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Controls & Nav Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#21262d]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-[#0d1117] border border-[#21262d] rounded-xl p-1">
            <button
              onClick={handlePrev}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#161b22] cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleToday}
              className="px-3 py-1 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-[#161b22] cursor-pointer"
            >
              Today
            </button>
            <button
              onClick={handleNext}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#161b22] cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <h2 className="text-sm font-semibold text-white tracking-wide">
            {currentDate.toLocaleDateString(undefined, {
              month: 'long',
              year: 'numeric',
              ...(viewMode === 'day' ? { day: 'numeric', weekday: 'short' } : {}),
            })}
          </h2>
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

          {/* View mode toggle */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0d1117] border border-[#21262d]">
            {(['month', 'week', 'day'] as CalendarViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors cursor-pointer ${
                  viewMode === mode
                    ? 'bg-[#1c222c] text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ================= 1. MONTH VIEW ================= */}
      {viewMode === 'month' && (
        <div className="rounded-2xl bg-[#0d1117] border border-[#21262d] overflow-hidden shadow-lg">
          {/* Days of week header */}
          <div className="grid grid-cols-7 border-b border-[#21262d] bg-[#121620] text-center text-[11px] font-semibold text-slate-400 py-2.5">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <div key={day}>{day}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-[#21262d]">
            {monthDays.map(({ date, isCurrentMonth, dateStr }, index) => {
              const dayEntries = entriesByDate.get(dateStr) || [];
              const dayTotalSec = dayEntries.reduce((sum, e) => sum + e.duration, 0);
              const isToday = dateStr === todayStr;

              return (
                <div
                  key={index}
                  className={`min-h-[105px] p-2 flex flex-col justify-between transition-colors ${
                    isCurrentMonth ? 'bg-[#0d1117]' : 'bg-[#090c10]/60 opacity-60'
                  } ${isToday ? 'ring-1 ring-inset ring-blue-500/50 bg-blue-950/10' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-mono font-medium rounded-full w-6 h-6 flex items-center justify-center ${
                        isToday ? 'bg-blue-600 text-white font-bold' : 'text-slate-400'
                      }`}
                    >
                      {date.getDate()}
                    </span>
                    {dayTotalSec > 0 && (
                      <span className="text-[10px] font-mono text-slate-400 font-medium">
                        {formatDurationHuman(dayTotalSec)}
                      </span>
                    )}
                  </div>

                  {/* Day Entry Chips */}
                  <div className="space-y-1 mt-1.5 overflow-hidden">
                    {dayEntries.slice(0, 3).map((entry) => {
                      const proj = entry.projectId ? projectMap.get(entry.projectId) : null;
                      return (
                        <button
                          key={entry.id}
                          onClick={() => {
                            setInspectedEntry(entry);
                            setIsEditing(false);
                            setEditDesc(entry.description || '');
                            setEditProjId(entry.projectId || '');
                          }}
                          className="w-full text-left px-1.5 py-0.5 rounded text-[10px] truncate flex items-center gap-1.5 bg-[#161b22] hover:bg-[#202632] border border-[#21262d] text-slate-300 transition-colors cursor-pointer"
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: proj?.color || '#388bfd' }}
                          />
                          <span className="truncate">{entry.description || 'Session'}</span>
                        </button>
                      );
                    })}
                    {dayEntries.length > 3 && (
                      <span className="text-[9px] text-slate-500 px-1 font-medium block">
                        +{dayEntries.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= 2. WEEK VIEW ================= */}
      {viewMode === 'week' && (
        <div className="rounded-2xl bg-[#0d1117] border border-[#21262d] overflow-hidden shadow-lg">
          <div className="grid grid-cols-7 divide-x divide-[#21262d]">
            {weekDays.map(({ date, dateStr }) => {
              const dayEntries = entriesByDate.get(dateStr) || [];
              const dayTotalSec = dayEntries.reduce((sum, e) => sum + e.duration, 0);
              const isToday = dateStr === todayStr;

              return (
                <div key={dateStr} className={`min-h-[350px] p-3 flex flex-col ${isToday ? 'bg-blue-950/10' : ''}`}>
                  <div className="pb-3 border-b border-[#21262d] text-center">
                    <p className="text-[11px] uppercase font-semibold text-slate-400">
                      {date.toLocaleDateString(undefined, { weekday: 'short' })}
                    </p>
                    <p className={`text-base font-bold font-mono mt-0.5 ${isToday ? 'text-blue-400' : 'text-white'}`}>
                      {date.getDate()}
                    </p>
                    <p className="text-[10px] font-mono text-slate-500 mt-1">
                      {formatDurationHuman(dayTotalSec)}
                    </p>
                  </div>

                  <div className="space-y-2 mt-3 flex-1 overflow-y-auto">
                    {dayEntries.map((entry) => {
                      const proj = entry.projectId ? projectMap.get(entry.projectId) : null;
                      return (
                        <div
                          key={entry.id}
                          onClick={() => {
                            setInspectedEntry(entry);
                            setIsEditing(false);
                            setEditDesc(entry.description || '');
                            setEditProjId(entry.projectId || '');
                          }}
                          className="p-2 rounded-xl bg-[#161b22] border border-[#262c36] hover:border-slate-500 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: proj?.color || '#388bfd' }}
                            />
                            <span className="text-[10px] text-slate-400 font-medium truncate">
                              {proj?.name || 'No Project'}
                            </span>
                          </div>
                          <p className="text-xs font-medium text-white truncate">{entry.description || 'Session'}</p>
                          <p className="text-[10px] font-mono text-slate-400 mt-1">
                            {formatTime(entry.startTime)} - {formatTime(entry.endTime)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= 3. DAY VIEW ================= */}
      {viewMode === 'day' && (
        <div className="rounded-2xl bg-[#0d1117] border border-[#21262d] p-6 space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-[#21262d]">
            <div>
              <h3 className="text-sm font-semibold text-white">
                {formatDate(currentDate)}
              </h3>
              <p className="text-xs text-slate-400">
                Total:{' '}
                {formatDurationHuman(
                  (entriesByDate.get(toISODateString(currentDate)) || []).reduce((a, b) => a + b.duration, 0)
                )}
              </p>
            </div>
          </div>

          <div className="divide-y divide-[#21262d]">
            {(entriesByDate.get(toISODateString(currentDate)) || []).length > 0 ? (
              (entriesByDate.get(toISODateString(currentDate)) || []).map((entry) => {
                const proj = entry.projectId ? projectMap.get(entry.projectId) : null;
                return (
                  <div
                    key={entry.id}
                    onClick={() => {
                      setInspectedEntry(entry);
                      setIsEditing(false);
                      setEditDesc(entry.description || '');
                      setEditProjId(entry.projectId || '');
                    }}
                    className="py-3.5 flex items-center justify-between gap-4 hover:bg-[#121620] px-3 rounded-xl transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: proj?.color || '#475569' }} />
                      <div>
                        <p className="text-xs font-semibold text-white">{entry.description || 'Session'}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {proj?.name || 'No Project'} • {formatTime(entry.startTime)} - {formatTime(entry.endTime)}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono text-xs font-semibold text-white bg-[#161b22] px-3 py-1 rounded-lg border border-[#262c36]">
                      {formatDurationHuman(entry.duration)}
                    </span>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-slate-500 text-center py-8">No recorded sessions for this date</p>
            )}
          </div>
        </div>
      )}

      {/* INSPECT / EDIT ENTRY MODAL */}
      <Modal
        isOpen={Boolean(inspectedEntry)}
        onClose={() => setInspectedEntry(null)}
        title={isEditing ? 'Edit Session' : 'Session Details'}
        subtitle={inspectedEntry ? formatDate(inspectedEntry.startTime) : ''}
      >
        {inspectedEntry && (
          <div className="space-y-4 text-xs">
            {isEditing ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-slate-400 mb-1">Description</label>
                  <input
                    type="text"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-white text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Project</label>
                  <select
                    value={editProjId}
                    onChange={(e) => setEditProjId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-slate-200 text-xs focus:outline-none cursor-pointer"
                  >
                    <option value="">No Project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-3">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 rounded-lg bg-[#161b22] text-slate-300 border border-[#262c36]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="px-4 py-1.5 rounded-lg bg-blue-600 text-white font-medium"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-[#161b22] border border-[#262c36] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Duration</span>
                    <span className="font-mono font-bold text-white text-sm">
                      {formatDurationHuman(inspectedEntry.duration)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Time Interval</span>
                    <span className="font-mono text-slate-300">
                      {formatTime(inspectedEntry.startTime)} - {formatTime(inspectedEntry.endTime)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Project</span>
                    <span className="text-white font-medium">
                      {inspectedEntry.projectId
                        ? projectMap.get(inspectedEntry.projectId)?.name || 'Unassigned'
                        : 'No Project'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Logging Mode</span>
                    <span className="text-slate-300">{inspectedEntry.isManual ? 'Manual Entry' : 'Timer Log'}</span>
                  </div>
                </div>

                {inspectedEntry.tags && inspectedEntry.tags.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Tag className="w-3.5 h-3.5 text-slate-500" />
                    {inspectedEntry.tags.map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 rounded bg-[#161b22] border border-[#262c36] text-[10px] text-slate-400"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t border-[#21262d]">
                  <button
                    onClick={() => setDeletingId(inspectedEntry.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/40 text-rose-300 border border-rose-800/40 hover:bg-rose-900/60 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#161b22] text-slate-200 border border-[#2b3341] hover:bg-[#202632] transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Edit Details
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deletingId)}
        onClose={() => setDeletingId(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Session"
        message="Are you sure you want to remove this session from your calendar history?"
      />
    </div>
  );
};
