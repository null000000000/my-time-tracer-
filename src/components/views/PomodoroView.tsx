import React, { useState, useEffect, useRef } from 'react';
import {
  Hourglass,
  Play,
  Pause,
  RotateCcw,
  CheckCircle,
  Coffee,
  Brain,
  Sparkles,
  Settings,
  Bell,
  Folder,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTimeTracker } from '../../context/TimeTrackerContext';
import { PomodoroType, PomodoroSession } from '../../types';
import {
  createPomodoroSession,
  createTimeEntry,
  subscribePomodoroSessions,
} from '../../services/db';
import { formatSecondsToHMS, formatDate, formatTime, playAlertChime } from '../../utils/formatters';
import { Modal } from '../common/Modal';
import { useToast } from '../common/Toast';

export const PomodoroView: React.FC = () => {
  const { user, settings, updateSettings } = useAuth();
  const { projects, tasks } = useTimeTracker();
  const { success, info } = useToast();

  const [mode, setMode] = useState<PomodoroType>('work');
  const [isRunning, setIsRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(() => (settings.pomodoroWorkMinutes || 25) * 60);
  const [sessionCount, setSessionCount] = useState<number>(0);

  // Link to Project / Task & Log as Time Entry option
  const [logAsTimeEntry, setLogAsTimeEntry] = useState<boolean>(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [sessionNotes, setSessionNotes] = useState<string>('');

  // Sessions history from Firestore
  const [sessionsHistory, setSessionsHistory] = useState<PomodoroSession[]>([]);

  // Settings modal
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [workMin, setWorkMin] = useState(settings.pomodoroWorkMinutes || 25);
  const [shortBreakMin, setShortBreakMin] = useState(settings.pomodoroShortBreakMinutes || 5);
  const [longBreakMin, setLongBreakMin] = useState(settings.pomodoroLongBreakMinutes || 15);
  const [sessionsBeforeLong, setSessionsBeforeLong] = useState(settings.pomodoroSessionsBeforeLong || 4);

  // Subscribe to pomodoro sessions
  useEffect(() => {
    if (!user) return;
    const unsub = subscribePomodoroSessions(user.uid, (sessions) => {
      setSessionsHistory(sessions);
    });
    return () => unsub();
  }, [user]);

  // Request browser notification permission
  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission !== 'granted') {
      const res = await Notification.requestPermission();
      if (res === 'granted') {
        success('Browser notifications enabled');
      }
    }
  };

  // Get total duration in seconds for current mode
  const getModeDuration = (m: PomodoroType): number => {
    if (m === 'work') return (settings.pomodoroWorkMinutes || 25) * 60;
    if (m === 'short_break') return (settings.pomodoroShortBreakMinutes || 5) * 60;
    return (settings.pomodoroLongBreakMinutes || 15) * 60;
  };

  // Switch modes
  const handleSwitchMode = (newMode: PomodoroType) => {
    setIsRunning(false);
    setMode(newMode);
    setTimeLeft(getModeDuration(newMode));
  };

  // Timer Tick
  useEffect(() => {
    let interval: any = null;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (isRunning && timeLeft === 0) {
      handleCompleteSession();
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft]);

  // When timer completes
  const handleCompleteSession = async () => {
    setIsRunning(false);

    // Chime
    if (settings.soundEnabled) {
      playAlertChime('pomodoro_complete');
    }

    // Browser Notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(
        mode === 'work' ? 'Pomodoro Work Finished!' : 'Break Completed!',
        {
          body:
            mode === 'work'
              ? 'Great focus! Time to take a restorative break.'
              : 'Break time is over. Ready to begin your next focus session?',
        }
      );
    }

    if (!user) return;

    const completedAt = Date.now();
    const durationMinutes = Math.round(getModeDuration(mode) / 60);

    // If work session and user selected to log as time entry
    let didLog = false;
    if (mode === 'work' && logAsTimeEntry) {
      const startTime = completedAt - durationMinutes * 60 * 1000;
      await createTimeEntry({
        userId: user.uid,
        projectId: selectedProjectId || undefined,
        taskId: selectedTaskId || undefined,
        description: sessionNotes.trim() || 'Pomodoro Focus Session',
        tags: ['pomodoro'],
        startTime,
        endTime: completedAt,
        duration: durationMinutes * 60,
        isManual: false,
      });
      didLog = true;
    }

    // Save Pomodoro Session log in DB
    await createPomodoroSession({
      userId: user.uid,
      projectId: selectedProjectId || undefined,
      taskId: selectedTaskId || undefined,
      type: mode,
      durationMinutes,
      completedAt,
      loggedAsTimeEntry: didLog,
    });

    // Advance session count
    if (mode === 'work') {
      const nextCount = sessionCount + 1;
      setSessionCount(nextCount);
      if (nextCount % (settings.pomodoroSessionsBeforeLong || 4) === 0) {
        handleSwitchMode('long_break');
        info('Completed 4 focus intervals! Take a Long Break.');
      } else {
        handleSwitchMode('short_break');
        success('Work interval complete! Starting Short Break.');
      }
    } else {
      handleSwitchMode('work');
      info('Break finished. Ready for your next focus session.');
    }
  };

  // Start / Pause
  const handleTogglePlay = () => {
    setIsRunning(!isRunning);
  };

  // Reset
  const handleReset = () => {
    setIsRunning(false);
    setTimeLeft(getModeDuration(mode));
  };

  // Save Settings
  const handleSaveSettings = async () => {
    await updateSettings({
      pomodoroWorkMinutes: workMin,
      pomodoroShortBreakMinutes: shortBreakMin,
      pomodoroLongBreakMinutes: longBreakMin,
      pomodoroSessionsBeforeLong: sessionsBeforeLong,
    });
    setTimeLeft(workMin * 60);
    setIsSettingsOpen(false);
    success('Pomodoro intervals updated');
  };

  // Visual Progress calculation
  const totalDuration = getModeDuration(mode);
  const progressPercent = ((totalDuration - timeLeft) / totalDuration) * 100;

  const projectMap = new Map(projects.map((p) => [p.id, p]));

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#21262d]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
            <Hourglass className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white tracking-wide">Pomodoro Focus Timer</h2>
            <p className="text-xs text-slate-400">Deep focus cycles with automatic break alternation</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {'Notification' in window && Notification.permission !== 'granted' && (
            <button
              onClick={requestNotificationPermission}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#161b22] hover:bg-[#202632] border border-[#262c36] text-xs text-slate-300 transition-colors cursor-pointer"
            >
              <Bell className="w-3.5 h-3.5 text-blue-400" />
              <span>Enable Alerts</span>
            </button>
          )}

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#161b22] hover:bg-[#202632] border border-[#262c36] text-xs text-slate-300 transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5 text-slate-400" />
            <span>Durations</span>
          </button>
        </div>
      </div>

      {/* Main Timer Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Timer Display */}
        <div className="lg:col-span-2 p-8 rounded-3xl bg-[#0d1117] border border-[#21262d] flex flex-col items-center justify-center text-center shadow-xl">
          {/* Mode Pill Toggle */}
          <div className="flex items-center gap-2 p-1 rounded-xl bg-[#161b22] border border-[#262c36] mb-8">
            <button
              onClick={() => handleSwitchMode('work')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                mode === 'work' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Brain className="w-3.5 h-3.5" />
              <span>Focus ({settings.pomodoroWorkMinutes || 25}m)</span>
            </button>
            <button
              onClick={() => handleSwitchMode('short_break')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                mode === 'short_break' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Coffee className="w-3.5 h-3.5" />
              <span>Short Break ({settings.pomodoroShortBreakMinutes || 5}m)</span>
            </button>
            <button
              onClick={() => handleSwitchMode('long_break')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                mode === 'long_break' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Long Break ({settings.pomodoroLongBreakMinutes || 15}m)</span>
            </button>
          </div>

          {/* Big Circular Countdown Display */}
          <div className="relative w-64 h-64 flex items-center justify-center my-2">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="44"
                className="stroke-[#161b22]"
                strokeWidth="5"
                fill="transparent"
              />
              <circle
                cx="50"
                cy="50"
                r="44"
                className={`transition-all duration-500 ${
                  mode === 'work' ? 'stroke-blue-500' : mode === 'short_break' ? 'stroke-emerald-500' : 'stroke-purple-500'
                }`}
                strokeWidth="5"
                strokeDasharray="276.46"
                strokeDashoffset={276.46 - (276.46 * progressPercent) / 100}
                strokeLinecap="round"
                fill="transparent"
              />
            </svg>

            <div className="absolute flex flex-col items-center">
              <span className="font-mono text-5xl font-extrabold text-white tracking-tight">
                {formatSecondsToHMS(timeLeft).substring(3)}
              </span>
              <span className="text-xs uppercase tracking-widest text-slate-400 font-medium mt-1">
                {mode.replace('_', ' ')}
              </span>
              <span className="text-[11px] text-slate-500 mt-0.5">
                Cycle #{sessionCount + 1}
              </span>
            </div>
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-4 mt-8">
            <button
              onClick={handleTogglePlay}
              className={`flex items-center gap-2 px-8 py-3 rounded-2xl text-sm font-bold shadow-lg transition-all cursor-pointer ${
                isRunning
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/25'
              }`}
            >
              {isRunning ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
              <span>{isRunning ? 'Pause' : 'Start Focus'}</span>
            </button>
            <button
              onClick={handleReset}
              title="Reset current interval"
              className="p-3 rounded-2xl bg-[#161b22] hover:bg-[#202632] border border-[#262c36] text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Right 1 Col: Project Linking & Options */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-[#0d1117] border border-[#21262d] space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Work Session Linking
            </h3>

            <div>
              <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={logAsTimeEntry}
                  onChange={(e) => setLogAsTimeEntry(e.target.checked)}
                  className="rounded bg-[#161b22] border-[#262c36] text-blue-600 focus:ring-0"
                />
                <span>Record work intervals as Time Entries</span>
              </label>
              <p className="text-[11px] text-slate-500 ml-5 mt-0.5">
                Break time is never recorded as productive work.
              </p>
            </div>

            {logAsTimeEntry && (
              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Assign to Project
                  </label>
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
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Assign to Task (Optional)
                  </label>
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

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Session Goal / Note
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Reverse engineering binary challenge"
                    value={sessionNotes}
                    onChange={(e) => setSessionNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Recent Pomodoros History */}
          <div className="p-6 rounded-2xl bg-[#0d1117] border border-[#21262d]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Session History ({sessionsHistory.length})
            </h3>
            {sessionsHistory.length > 0 ? (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {sessionsHistory.slice(0, 8).map((s) => (
                  <div
                    key={s.id}
                    className="p-2.5 rounded-xl bg-[#161b22] border border-[#262c36] flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          s.type === 'work' ? 'bg-blue-400' : 'bg-emerald-400'
                        }`}
                      />
                      <span className="capitalize text-slate-200 font-medium">{s.type.replace('_', ' ')}</span>
                      {s.loggedAsTimeEntry && (
                        <span className="text-[10px] text-blue-400 bg-blue-950/40 px-1.5 py-0.2 rounded border border-blue-900/40">
                          logged
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-slate-400">{s.durationMinutes}m</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No Pomodoro intervals completed yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* MODAL: Durations Settings */}
      <Modal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        title="Configure Pomodoro Durations"
        subtitle="Customize work intervals, short breaks, and long breaks"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Work Duration (minutes)
            </label>
            <input
              type="number"
              min="1"
              max="120"
              value={workMin}
              onChange={(e) => setWorkMin(parseInt(e.target.value) || 25)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Short Break (minutes)
            </label>
            <input
              type="number"
              min="1"
              max="30"
              value={shortBreakMin}
              onChange={(e) => setShortBreakMin(parseInt(e.target.value) || 5)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Long Break (minutes)
            </label>
            <input
              type="number"
              min="1"
              max="60"
              value={longBreakMin}
              onChange={(e) => setLongBreakMin(parseInt(e.target.value) || 15)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Work Sessions Before Long Break
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={sessionsBeforeLong}
              onChange={(e) => setSessionsBeforeLong(parseInt(e.target.value) || 4)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#21262d]">
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:text-white bg-[#161b22] border border-[#2b3341]"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveSettings}
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/20"
            >
              Save Durations
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
