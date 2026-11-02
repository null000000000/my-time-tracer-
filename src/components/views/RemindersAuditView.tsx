import React, { useState, useEffect, useMemo } from 'react';
import {
  Bell,
  ShieldAlert,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Calendar,
  AlertCircle,
  Repeat,
  Edit2,
  Check,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTimeTracker } from '../../context/TimeTrackerContext';
import { Reminder, TimeEntry, TimeAuditIssue } from '../../types';
import {
  subscribeReminders,
  createReminder,
  updateReminder,
  deleteReminder,
  updateTimeEntry,
  deleteTimeEntry,
} from '../../services/db';
import {
  formatDate,
  formatTime,
  formatDurationHuman,
  toISODateString,
} from '../../utils/formatters';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { EmptyState } from '../common/EmptyState';
import { useToast } from '../common/Toast';

export const RemindersAuditView: React.FC = () => {
  const { user } = useAuth();
  const { timeEntries, projects } = useTimeTracker();
  const { success, error } = useToast();

  const [activeTab, setActiveTab] = useState<'reminders' | 'audit'>('reminders');

  // Reminders State
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderDesc, setReminderDesc] = useState('');
  const [reminderDate, setReminderDate] = useState(toISODateString(new Date()));
  const [reminderTime, setReminderTime] = useState('14:00');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState<'daily' | 'weekdays' | 'weekly'>('daily');

  // Audit Resolution Modal
  const [fixingEntry, setFixingEntry] = useState<TimeEntry | null>(null);
  const [fixDesc, setFixDesc] = useState('');
  const [fixDate, setFixDate] = useState('');
  const [fixStartTime, setFixStartTime] = useState('');
  const [fixEndTime, setFixEndTime] = useState('');
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

  // Subscribe to Reminders
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeReminders(user.uid, (list) => {
      setReminders(list);
    });
    return () => unsub();
  }, [user]);

  // Project map for quick lookup
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // ================= TAB 1: REMINDERS ACTIONS =================
  const handleSaveReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !reminderTitle.trim()) return;

    try {
      const scheduledTime = new Date(`${reminderDate}T${reminderTime}:00`).getTime();
      await createReminder({
        userId: user.uid,
        title: reminderTitle.trim(),
        description: reminderDesc.trim() || undefined,
        scheduledTime,
        isRecurring,
        recurrenceRule: isRecurring ? recurrenceRule : undefined,
        isCompleted: false,
        isEnabled: true,
      });

      success('Reminder scheduled');
      setIsReminderModalOpen(false);
      setReminderTitle('');
      setReminderDesc('');
      setIsRecurring(false);
    } catch (err) {
      console.error(err);
      error('Failed to create reminder');
    }
  };

  const handleToggleReminderComplete = async (r: Reminder) => {
    try {
      await updateReminder(r.id, { isCompleted: !r.isCompleted });
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleReminderEnabled = async (r: Reminder) => {
    try {
      await updateReminder(r.id, { isEnabled: !r.isEnabled });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteReminder = async (id: string) => {
    try {
      await deleteReminder(id);
      success('Reminder deleted');
    } catch (err) {
      console.error(err);
      error('Failed to delete reminder');
    }
  };

  // ================= TAB 2: TIME AUDIT ENGINE =================
  const auditIssues = useMemo<TimeAuditIssue[]>(() => {
    const issues: TimeAuditIssue[] = [];

    // 1. Detect Overlapping Time Entries
    // Sort ascending by start time
    const sorted = [...timeEntries].sort((a, b) => a.startTime - b.startTime);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];

        // Since sorted by startTime, if b.startTime >= a.endTime, no more overlaps with 'a'
        if (b.startTime >= a.endTime) break;

        // Overlap detected: a.startTime < b.endTime && a.endTime > b.startTime
        if (a.startTime < b.endTime && a.endTime > b.startTime) {
          issues.push({
            id: `overlap_${a.id}_${b.id}`,
            type: 'overlap',
            severity: 'high',
            title: 'Overlapping Sessions Detected',
            description: `Session "${a.description || 'Session'}" (${formatTime(a.startTime)}–${formatTime(a.endTime)}) overlaps with "${b.description || 'Session'}" (${formatTime(b.startTime)}–${formatTime(b.endTime)}) on ${formatDate(a.startTime)}.`,
            entryIds: [a.id, b.id],
            entries: [a, b],
          });
        }
      }
    }

    // 2. Detect Unusually Long Sessions (> 8 hours = 28800s)
    timeEntries.forEach((entry) => {
      if (entry.duration > 28800) {
        issues.push({
          id: `long_${entry.id}`,
          type: 'long_session',
          severity: 'medium',
          title: 'Unusually Long Session (>8 Hours)',
          description: `Entry "${entry.description}" ran for ${formatDurationHuman(entry.duration)}. Was a timer left running overnight?`,
          entryIds: [entry.id],
          entries: [entry],
        });
      }
    });

    // 3. Detect Missing / Generic Descriptions
    timeEntries.forEach((entry) => {
      const desc = (entry.description || '').trim().toLowerCase();
      if (!desc || desc === 'tracked session' || desc === 'session' || desc === 'untitled') {
        issues.push({
          id: `desc_${entry.id}`,
          type: 'missing_description',
          severity: 'low',
          title: 'Missing or Generic Description',
          description: `Entry logged on ${formatDate(entry.startTime)} at ${formatTime(entry.startTime)} lacks a specific activity description.`,
          entryIds: [entry.id],
          entries: [entry],
        });
      }
    });

    // 4. Detect Inconsistent Timestamps
    timeEntries.forEach((entry) => {
      if (entry.endTime <= entry.startTime || entry.duration <= 0) {
        issues.push({
          id: `time_${entry.id}`,
          type: 'inconsistent_time',
          severity: 'high',
          title: 'Corrupted / Inverted Timestamp',
          description: `Entry "${entry.description}" has end time earlier than or equal to start time.`,
          entryIds: [entry.id],
          entries: [entry],
        });
      }
    });

    return issues;
  }, [timeEntries]);

  // Open Edit fix for an audited entry
  const handleOpenFix = (entry: TimeEntry) => {
    setFixingEntry(entry);
    setFixDesc(entry.description || '');
    const s = new Date(entry.startTime);
    const e = new Date(entry.endTime);
    setFixDate(toISODateString(s));
    const pad = (n: number) => n.toString().padStart(2, '0');
    setFixStartTime(`${pad(s.getHours())}:${pad(s.getMinutes())}`);
    setFixEndTime(`${pad(e.getHours())}:${pad(e.getMinutes())}`);
  };

  // Save Fix
  const handleSaveFix = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fixingEntry) return;

    try {
      const startMs = new Date(`${fixDate}T${fixStartTime}:00`).getTime();
      const endMs = new Date(`${fixDate}T${fixEndTime}:00`).getTime();

      if (endMs <= startMs) {
        error('End time must be after start time');
        return;
      }

      await updateTimeEntry(fixingEntry.id, {
        description: fixDesc.trim() || 'Tracked Session',
        startTime: startMs,
        endTime: endMs,
        duration: Math.round((endMs - startMs) / 1000),
      });

      success('Entry corrected');
      setFixingEntry(null);
    } catch (err) {
      console.error(err);
      error('Failed to correct entry');
    }
  };

  // Delete audited entry
  const handleConfirmDeleteEntry = async () => {
    if (!deletingEntryId) return;
    try {
      await deleteTimeEntry(deletingEntryId);
      success('Invalid entry removed');
    } catch (err) {
      console.error(err);
      error('Failed to delete entry');
    } finally {
      setDeletingEntryId(null);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Tabs Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#21262d]">
        <div className="flex items-center gap-2 p-1 rounded-xl bg-[#0d1117] border border-[#21262d]">
          <button
            onClick={() => setActiveTab('reminders')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'reminders'
                ? 'bg-[#1c222c] text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Reminders ({reminders.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-[#1c222c] text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>
              Time Audit{' '}
              {auditIssues.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-300 font-mono">
                  {auditIssues.length}
                </span>
              )}
            </span>
          </button>
        </div>

        {activeTab === 'reminders' && (
          <button
            onClick={() => setIsReminderModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Reminder</span>
          </button>
        )}
      </div>

      {/* ================= TAB 1: REMINDERS ================= */}
      {activeTab === 'reminders' && (
        <div className="space-y-4">
          {reminders.length > 0 ? (
            <div className="rounded-2xl bg-[#0d1117] border border-[#21262d] divide-y divide-[#21262d] overflow-hidden">
              {reminders.map((r) => {
                const isPast = r.scheduledTime < Date.now();
                return (
                  <div
                    key={r.id}
                    className={`p-4 flex items-center justify-between gap-4 transition-colors ${
                      r.isCompleted ? 'opacity-60 bg-[#0a0d12]' : 'hover:bg-[#121620]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        onClick={() => handleToggleReminderComplete(r)}
                        className="text-slate-500 hover:text-emerald-400 cursor-pointer"
                      >
                        {r.isCompleted ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400 fill-emerald-500/20" />
                        ) : (
                          <div className="w-5 h-5 rounded-full border border-slate-600 hover:border-slate-400" />
                        )}
                      </button>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-xs font-semibold text-white ${
                              r.isCompleted ? 'line-through text-slate-500' : ''
                            }`}
                          >
                            {r.title}
                          </span>
                          {r.isRecurring && (
                            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-blue-950/40 text-blue-400 border border-blue-800/30">
                              <Repeat className="w-3 h-3" /> {r.recurrenceRule}
                            </span>
                          )}
                          {!r.isEnabled && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">
                              Disabled
                            </span>
                          )}
                        </div>

                        {r.description && (
                          <p className="text-[11px] text-slate-400 mt-0.5">{r.description}</p>
                        )}

                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1">
                          <span className={isPast && !r.isCompleted ? 'text-amber-400' : ''}>
                            {formatDate(r.scheduledTime)} at {formatTime(r.scheduledTime)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleToggleReminderEnabled(r)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                          r.isEnabled
                            ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/40'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {r.isEnabled ? 'Active' : 'Off'}
                      </button>
                      <button
                        onClick={() => handleDeleteReminder(r.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={Bell}
              title="No reminders set"
              description="Schedule study sessions, lab deadlines, or recurrent CTF practice alerts."
              actionLabel="Create First Reminder"
              onAction={() => setIsReminderModalOpen(true)}
            />
          )}
        </div>
      )}

      {/* ================= TAB 2: TIME AUDIT ================= */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          {/* Audit Status Overview */}
          <div className="p-5 rounded-2xl bg-[#0d1117] border border-[#21262d] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                  auditIssues.length === 0
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}
              >
                {auditIssues.length === 0 ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Timeline Integrity Status</h3>
                <p className="text-xs text-slate-400">
                  {auditIssues.length === 0
                    ? 'All historical logs pass validation with no overlaps or anomalies.'
                    : `${auditIssues.length} integrity issues detected requiring manual review.`}
                </p>
              </div>
            </div>

            <div className="text-xs text-slate-500">
              Audits analyze actual database records without altering data automatically.
            </div>
          </div>

          {/* Issue Cards */}
          {auditIssues.length > 0 ? (
            <div className="space-y-3">
              {auditIssues.map((issue) => (
                <div
                  key={issue.id}
                  className="p-5 rounded-2xl bg-[#0d1117] border border-[#21262d] flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3 flex-1">
                    <div
                      className={`shrink-0 mt-0.5 p-1.5 rounded-lg ${
                        issue.severity === 'high'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : issue.severity === 'medium'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      }`}
                    >
                      <AlertCircle className="w-4 h-4" />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white">{issue.title}</span>
                        <span
                          className={`text-[10px] uppercase font-semibold px-1.5 py-0.2 rounded ${
                            issue.severity === 'high'
                              ? 'bg-rose-950/40 text-rose-400'
                              : 'bg-amber-950/40 text-amber-400'
                          }`}
                        >
                          {issue.severity}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{issue.description}</p>
                    </div>
                  </div>

                  {/* Actions to correct issues */}
                  <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-[#1c222c] w-full md:w-auto justify-end">
                    {issue.entries.map((entry, idx) => (
                      <button
                        key={entry.id}
                        onClick={() => handleOpenFix(entry)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#161b22] hover:bg-[#202632] border border-[#262c36] text-xs font-medium text-slate-200 transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-blue-400" />
                        <span>Fix {issue.entries.length > 1 ? `#${idx + 1}` : 'Entry'}</span>
                      </button>
                    ))}
                    {issue.entries.length === 1 && (
                      <button
                        onClick={() => setDeletingEntryId(issue.entries[0].id)}
                        className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-[#161b22] transition-colors cursor-pointer"
                        title="Delete invalid entry"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="Zero timeline anomalies detected"
              description="All logged sessions have valid timestamps, adequate durations, descriptions, and no overlapping intervals."
            />
          )}
        </div>
      )}

      {/* MODAL: CREATE REMINDER */}
      <Modal
        isOpen={isReminderModalOpen}
        onClose={() => setIsReminderModalOpen(false)}
        title="Schedule Personal Reminder"
        subtitle="Set scheduled nudges for study or security labs"
      >
        <form onSubmit={handleSaveReminder} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Reminder Title</label>
            <input
              type="text"
              required
              placeholder="e.g. Complete Kali Linux Web App Lab"
              value={reminderTitle}
              onChange={(e) => setReminderTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Details (Optional)</label>
            <textarea
              rows={2}
              placeholder="Check flags and compile notes"
              value={reminderDesc}
              onChange={(e) => setReminderDesc(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Date</label>
              <input
                type="date"
                required
                value={reminderDate}
                onChange={(e) => setReminderDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Time</label>
              <input
                type="time"
                required
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="rounded bg-[#161b22] border-[#262c36] text-blue-600 focus:ring-0"
              />
              <span>Recurring Reminder</span>
            </label>

            {isRecurring && (
              <div className="mt-2.5">
                <select
                  value={recurrenceRule}
                  onChange={(e) => setRecurrenceRule(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-slate-200 focus:outline-none"
                >
                  <option value="daily">Every Day</option>
                  <option value="weekdays">Weekdays Only (Mon-Fri)</option>
                  <option value="weekly">Once a Week</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#21262d]">
            <button
              type="button"
              onClick={() => setIsReminderModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:text-white bg-[#161b22] border border-[#2b3341]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/20"
            >
              Save Reminder
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: FIX AUDITED ENTRY */}
      <Modal
        isOpen={Boolean(fixingEntry)}
        onClose={() => setFixingEntry(null)}
        title="Correct Time Entry"
        subtitle="Adjust overlapping times, durations, or descriptions"
      >
        <form onSubmit={handleSaveFix} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Description</label>
            <input
              type="text"
              required
              value={fixDesc}
              onChange={(e) => setFixDesc(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Date</label>
            <input
              type="date"
              required
              value={fixDate}
              onChange={(e) => setFixDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Start Time</label>
              <input
                type="time"
                required
                value={fixStartTime}
                onChange={(e) => setFixStartTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">End Time</label>
              <input
                type="time"
                required
                value={fixEndTime}
                onChange={(e) => setFixEndTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#21262d]">
            <button
              type="button"
              onClick={() => setFixingEntry(null)}
              className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:text-white bg-[#161b22] border border-[#2b3341]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/20"
            >
              Apply Correction
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete entry confirm */}
      <ConfirmDialog
        isOpen={Boolean(deletingEntryId)}
        onClose={() => setDeletingEntryId(null)}
        onConfirm={handleConfirmDeleteEntry}
        title="Delete Invalid Entry"
        message="Are you sure you want to permanently remove this corrupted or duplicate entry?"
      />
    </div>
  );
};
