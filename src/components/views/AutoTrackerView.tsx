import React, { useState, useEffect } from 'react';
import {
  Activity,
  ShieldAlert,
  Laptop,
  CheckCircle2,
  Clock,
  ArrowRight,
  Plus,
  Trash2,
  Terminal,
  ExternalLink,
  Info,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTimeTracker } from '../../context/TimeTrackerContext';
import { AutoActivity } from '../../types';
import {
  subscribeAutoActivities,
  createAutoActivity,
  updateAutoActivity,
  deleteAutoActivity,
  createTimeEntry,
} from '../../services/db';
import { formatDurationHuman, formatDate, formatTime } from '../../utils/formatters';
import { Modal } from '../common/Modal';
import { EmptyState } from '../common/EmptyState';
import { useToast } from '../common/Toast';

export const AutoTrackerView: React.FC = () => {
  const { user } = useAuth();
  const { projects, tasks } = useTimeTracker();
  const { success, error } = useToast();

  const [activities, setActivities] = useState<AutoActivity[]>([]);

  // Convert staging modal
  const [convertingActivity, setConvertingActivity] = useState<AutoActivity | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [entryDesc, setEntryDesc] = useState<string>('');

  // Manual activity stager modal (for logging desktop apps manually into review queue)
  const [isManualStageOpen, setIsManualStageOpen] = useState(false);
  const [stageAppName, setStageAppName] = useState('');
  const [stageWindowTitle, setStageWindowTitle] = useState('');
  const [stageMinutes, setStageMinutes] = useState(30);
  const [stageCategory, setStageCategory] = useState('Cybersecurity / Labs');

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeAutoActivities(user.uid, (list) => {
      setActivities(list);
    });
    return () => unsub();
  }, [user]);

  // Open conversion modal
  const handleOpenConvert = (act: AutoActivity) => {
    setConvertingActivity(act);
    setEntryDesc(`${act.appName} - ${act.windowTitle}`);
    setSelectedProjectId(projects.length > 0 ? projects[0].id : '');
    setSelectedTaskId('');
  };

  // Convert to real TimeEntry
  const handleConfirmConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !convertingActivity) return;

    try {
      const endTime = Date.now();
      const startTime = endTime - convertingActivity.durationSeconds * 1000;

      await createTimeEntry({
        userId: user.uid,
        projectId: selectedProjectId || undefined,
        taskId: selectedTaskId || undefined,
        description: entryDesc.trim() || `${convertingActivity.appName} work`,
        tags: ['auto_imported', convertingActivity.category || 'desktop'].filter(Boolean),
        startTime,
        endTime,
        duration: convertingActivity.durationSeconds,
        isManual: true,
      });

      // Mark activity as converted
      await updateAutoActivity(convertingActivity.id, { status: 'converted' });

      success('Activity converted to official time entry');
      setConvertingActivity(null);
    } catch (err) {
      console.error(err);
      error('Failed to convert activity');
    }
  };

  // Dismiss activity
  const handleDismissActivity = async (id: string) => {
    try {
      await updateAutoActivity(id, { status: 'dismissed' });
      success('Activity dismissed');
    } catch (err) {
      console.error(err);
      error('Failed to dismiss activity');
    }
  };

  // Delete activity permanently
  const handleDeleteActivity = async (id: string) => {
    try {
      await deleteAutoActivity(id);
      success('Activity record removed');
    } catch (err) {
      console.error(err);
      error('Failed to delete activity');
    }
  };

  // Stage manual review item
  const handleSaveManualStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !stageAppName.trim()) return;

    try {
      await createAutoActivity({
        userId: user.uid,
        appName: stageAppName.trim(),
        windowTitle: stageWindowTitle.trim() || 'Work session',
        durationSeconds: stageMinutes * 60,
        category: stageCategory,
        detectedAt: Date.now(),
        status: 'pending',
      });

      success('Activity added to review queue');
      setIsManualStageOpen(false);
      setStageAppName('');
      setStageWindowTitle('');
    } catch (err) {
      console.error(err);
      error('Failed to add activity');
    }
  };

  const pendingActivities = activities.filter((a) => a.status === 'pending');
  const pastActivities = activities.filter((a) => a.status !== 'pending');

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-6xl mx-auto">
      {/* SECTION TOP: Explanation of Browser Sandboxing & Future Companion */}
      <div className="p-6 rounded-2xl bg-[#0d1117] border border-[#21262d] space-y-4 shadow-lg">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-[#21262d]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Laptop className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-white tracking-wide">
                  Desktop Auto-Tracker & Companion Portal
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  SANDBOX PROTOCOL
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Architectural bridge for background desktop application tracking
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsManualStageOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log Desktop Activity</span>
            </button>
          </div>
        </div>

        {/* Security & Sandboxing Disclaimer */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-[#161b22] border border-[#262c36] text-xs leading-relaxed text-slate-300">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-white">
              Browser Security Architecture & Zero-Pretense Policy
            </p>
            <p className="text-slate-400 text-[11px]">
              Modern web browsers operate inside strict security sandboxes. Standard web applications
              cannot monitor background desktop programs (e.g., Wireshark, Burp Suite, VS Code, Kali Linux terminals)
              without native OS privileges. This section provides an activity review interface designed to stage
              logs from an upcoming lightweight desktop daemon (or manual staging) so you can review and convert
              them into official tracked project entries.
            </p>
          </div>
        </div>
      </div>

      {/* Review Queue: Pending Activities */}
      <div className="p-6 rounded-2xl bg-[#0d1117] border border-[#21262d] space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Discovered Activity Review Queue</h3>
            <p className="text-xs text-slate-400">
              Review and convert staged activities into official database time entries
            </p>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-[#161b22] border border-[#262c36] text-slate-300">
            {pendingActivities.length} Pending
          </span>
        </div>

        {pendingActivities.length > 0 ? (
          <div className="divide-y divide-[#21262d]">
            {pendingActivities.map((act) => (
              <div
                key={act.id}
                className="py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-[#161b22] border border-[#262c36] flex items-center justify-center text-slate-400 shrink-0">
                    <Terminal className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-white">{act.appName}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                        {act.category || 'General'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5 truncate">{act.windowTitle}</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Detected {formatDate(act.detectedAt)} at {formatTime(act.detectedAt)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#1c222c]">
                  <span className="font-mono text-xs font-semibold text-white bg-[#161b22] px-3 py-1 rounded-lg border border-[#262c36]">
                    {formatDurationHuman(act.durationSeconds)}
                  </span>

                  <button
                    onClick={() => handleOpenConvert(act)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium shadow-sm transition-colors cursor-pointer"
                  >
                    <span>Convert to Entry</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDismissActivity(act.id)}
                    title="Dismiss"
                    className="p-1.5 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-[#161b22] transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Activity}
            title="Review queue is clear"
            description="No pending desktop activities to review. You can log staging activities manually or keep working with the Time Tracker."
            actionLabel="Stage an Activity"
            onAction={() => setIsManualStageOpen(true)}
          />
        )}
      </div>

      {/* MODAL: CONVERT TO REAL ENTRY */}
      <Modal
        isOpen={Boolean(convertingActivity)}
        onClose={() => setConvertingActivity(null)}
        title="Convert Activity to Time Entry"
        subtitle="Assign this desktop activity to a project and task in your database"
      >
        {convertingActivity && (
          <form onSubmit={handleConfirmConvert} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Time Entry Description
              </label>
              <input
                type="text"
                required
                value={entryDesc}
                onChange={(e) => setEntryDesc(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Project</label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => {
                    setSelectedProjectId(e.target.value);
                    setSelectedTaskId('');
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
                  value={selectedTaskId}
                  onChange={(e) => setSelectedTaskId(e.target.value)}
                  disabled={!selectedProjectId}
                  className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-slate-200 focus:outline-none disabled:opacity-50 cursor-pointer"
                >
                  <option value="">No Task</option>
                  {tasks
                    .filter((t) => t.projectId === selectedProjectId)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#161b22] border border-[#262c36] text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Duration:</span>
                <span className="font-mono text-white font-semibold">
                  {formatDurationHuman(convertingActivity.durationSeconds)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Application:</span>
                <span className="text-slate-200">{convertingActivity.appName}</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-[#21262d]">
              <button
                type="button"
                onClick={() => setConvertingActivity(null)}
                className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:text-white bg-[#161b22] border border-[#2b3341]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/20"
              >
                Confirm & Log
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL: MANUAL STAGING ENTRY */}
      <Modal
        isOpen={isManualStageOpen}
        onClose={() => setIsManualStageOpen(false)}
        title="Stage Desktop Activity"
        subtitle="Manually register an external tool or lab session for review"
      >
        <form onSubmit={handleSaveManualStage} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Application Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Wireshark, VS Code, Burp Suite, Ghidra"
              value={stageAppName}
              onChange={(e) => setStageAppName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Window Title / Context</label>
            <input
              type="text"
              placeholder="e.g. Analyzing Packet Capture 04 - CTF Challenge"
              value={stageWindowTitle}
              onChange={(e) => setStageWindowTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Estimated Duration (Mins)</label>
              <input
                type="number"
                min="1"
                required
                value={stageMinutes}
                onChange={(e) => setStageMinutes(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Category</label>
              <select
                value={stageCategory}
                onChange={(e) => setStageCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-slate-200 focus:outline-none"
              >
                <option value="Cybersecurity / Labs">Cybersecurity / Labs</option>
                <option value="Coding / Dev">Coding / Dev</option>
                <option value="Research / Reading">Research / Reading</option>
                <option value="CTF Competition">CTF Competition</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#21262d]">
            <button
              type="button"
              onClick={() => setIsManualStageOpen(false)}
              className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:text-white bg-[#161b22] border border-[#2b3341]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/20"
            >
              Add to Queue
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
