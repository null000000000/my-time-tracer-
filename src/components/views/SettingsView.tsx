import React, { useState } from 'react';
import {
  Settings,
  User,
  Clock,
  Calendar,
  Volume2,
  Bell,
  Download,
  LogOut,
  Shield,
  Database,
  FileCode,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { fetchAllUserData } from '../../services/db';
import { exportToJSON, playAlertChime } from '../../utils/formatters';
import { useToast } from '../common/Toast';

export const SettingsView: React.FC = () => {
  const { user, settings, updateSettings, logout } = useAuth();
  const { success, error } = useToast();

  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Form local state
  const [timeFormat, setTimeFormat] = useState<'12h' | '24h'>(settings.timeFormat || '24h');
  const [weekStart, setWeekStart] = useState<'monday' | 'sunday'>(settings.weekStart || 'monday');
  const [soundEnabled, setSoundEnabled] = useState(settings.soundEnabled ?? true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(settings.notificationsEnabled ?? true);

  const [pomodoroWork, setPomodoroWork] = useState(settings.pomodoroWorkMinutes || 25);
  const [pomodoroShort, setPomodoroShort] = useState(settings.pomodoroShortBreakMinutes || 5);
  const [pomodoroLong, setPomodoroLong] = useState(settings.pomodoroLongBreakMinutes || 15);
  const [pomodoroCycles, setPomodoroCycles] = useState(settings.pomodoroSessionsBeforeLong || 4);

  // Save Settings
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await updateSettings({
        timeFormat,
        weekStart,
        soundEnabled,
        notificationsEnabled,
        pomodoroWorkMinutes: Number(pomodoroWork),
        pomodoroShortBreakMinutes: Number(pomodoroShort),
        pomodoroLongBreakMinutes: Number(pomodoroLong),
        pomodoroSessionsBeforeLong: Number(pomodoroCycles),
      });

      if (soundEnabled) {
        playAlertChime('success');
      }
      success('Settings saved successfully');
    } catch (err) {
      console.error(err);
      error('Failed to update preferences');
    } finally {
      setSaving(false);
    }
  };

  // Test sound
  const handleTestChime = () => {
    playAlertChime('pomodoro_complete');
    success('Audio chime played');
  };

  // Export full JSON backup
  const handleExportFullBackup = async () => {
    if (!user) return;
    try {
      setExporting(true);
      const data = await fetchAllUserData(user.uid);
      const filename = `chronos_full_backup_${new Date().toISOString().split('T')[0]}`;
      exportToJSON(filename, data);
      success('Full database backup exported to JSON');
    } catch (err) {
      console.error(err);
      error('Failed to export backup');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="pb-4 border-b border-[#21262d]">
        <h2 className="text-sm font-semibold text-white tracking-wide">Workspace & System Settings</h2>
        <p className="text-xs text-slate-400">Configure time display, audio alerts, and data preservation</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Account Profile Card */}
        <div className="p-6 rounded-2xl bg-[#0d1117] border border-[#21262d] space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Authenticated Account
              </h3>
              <p className="text-xs text-slate-400">Personal identity and Cloud Firestore security anchor</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="p-3 rounded-xl bg-[#161b22] border border-[#262c36]">
              <span className="text-[11px] text-slate-500">Display Name / Identity</span>
              <p className="text-xs font-medium text-white mt-0.5">
                {user?.displayName || 'Personal User'}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-[#161b22] border border-[#262c36]">
              <span className="text-[11px] text-slate-500">Google Email</span>
              <p className="text-xs font-medium text-white mt-0.5">{user?.email}</p>
            </div>
          </div>
        </div>

        {/* Time & Regional Display */}
        <div className="p-6 rounded-2xl bg-[#0d1117] border border-[#21262d] space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Time & Calendar Formatting
              </h3>
              <p className="text-xs text-slate-400">Display conventions across timesheets and trackers</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Time Format</label>
              <select
                value={timeFormat}
                onChange={(e) => setTimeFormat(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none cursor-pointer"
              >
                <option value="24h">24-Hour Format (14:30)</option>
                <option value="12h">12-Hour Format (2:30 PM)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Week Starts On</label>
              <select
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none cursor-pointer"
              >
                <option value="monday">Monday (ISO Standard)</option>
                <option value="sunday">Sunday</option>
              </select>
            </div>
          </div>
        </div>

        {/* Pomodoro Defaults */}
        <div className="p-6 rounded-2xl bg-[#0d1117] border border-[#21262d] space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Default Pomodoro Parameters
              </h3>
              <p className="text-xs text-slate-400">Target intervals for focused sprint cycles</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Focus (min)</label>
              <input
                type="number"
                min="1"
                max="180"
                value={pomodoroWork}
                onChange={(e) => setPomodoroWork(parseInt(e.target.value) || 25)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Short Break (min)</label>
              <input
                type="number"
                min="1"
                max="60"
                value={pomodoroShort}
                onChange={(e) => setPomodoroShort(parseInt(e.target.value) || 5)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Long Break (min)</label>
              <input
                type="number"
                min="1"
                max="90"
                value={pomodoroLong}
                onChange={(e) => setPomodoroLong(parseInt(e.target.value) || 15)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Intervals/Long</label>
              <input
                type="number"
                min="1"
                max="12"
                value={pomodoroCycles}
                onChange={(e) => setPomodoroCycles(parseInt(e.target.value) || 4)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white"
              />
            </div>
          </div>
        </div>

        {/* Audio & Alerts */}
        <div className="p-6 rounded-2xl bg-[#0d1117] border border-[#21262d] space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Volume2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Auditory & Browser Notifications
              </h3>
              <p className="text-xs text-slate-400">Subtle chimes synthesized via native Web Audio API</p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-white">Enable Audio Chimes</p>
                <p className="text-[11px] text-slate-500">Plays acoustic chimes upon timer completion or stop</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleTestChime}
                  className="px-2.5 py-1 rounded-lg bg-[#161b22] hover:bg-[#202632] border border-[#262c36] text-[11px] text-slate-300 transition-colors cursor-pointer"
                >
                  Test Sound
                </button>
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(e) => setSoundEnabled(e.target.checked)}
                  className="w-4 h-4 rounded bg-[#161b22] border-[#262c36] text-blue-600 focus:ring-0 cursor-pointer"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#1c222c]">
              <div>
                <p className="text-xs font-medium text-white">Browser Notifications</p>
                <p className="text-[11px] text-slate-500">Desktop notifications when tab is backgrounded</p>
              </div>
              <input
                type="checkbox"
                checked={notificationsEnabled}
                onChange={(e) => setNotificationsEnabled(e.target.checked)}
                className="w-4 h-4 rounded bg-[#161b22] border-[#262c36] text-blue-600 focus:ring-0 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Save Preferences Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>

      {/* Data Export & Account Actions */}
      <div className="p-6 rounded-2xl bg-[#0d1117] border border-[#21262d] space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Data Preservation & Sign Out
        </h3>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#161b22] border border-[#262c36]">
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-blue-400 shrink-0" />
            <div>
              <p className="text-xs font-medium text-white">Export Complete Database Backup</p>
              <p className="text-[11px] text-slate-400">
                Download all projects, tasks, time entries, pomodoro records, and reminders as JSON
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleExportFullBackup}
            disabled={exporting}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#21262d] hover:bg-[#2c333e] text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-blue-400" />
            <span>{exporting ? 'Exporting...' : 'Export JSON Backup'}</span>
          </button>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-slate-500">
            Terminating your session clears local tokens. All data remains safe in Firestore.
          </div>
          <button
            type="button"
            onClick={() => logout()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 text-xs font-medium transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
