import React from 'react';
import { Menu, Play, Pause, Square, Plus, Timer as TimerIcon } from 'lucide-react';
import { NavigationTab } from '../../types';
import { useTimeTracker } from '../../context/TimeTrackerContext';
import { formatSecondsToHMS } from '../../utils/formatters';

interface HeaderProps {
  currentTab: NavigationTab;
  onOpenMobileMenu: () => void;
  onQuickTrack: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onOpenMobileMenu,
  onQuickTrack,
}) => {
  const { activeTimer, elapsedSeconds, isRunning, isPaused, pauseTimer, resumeTimer, stopTimer, projects } = useTimeTracker();

  const titles: Record<NavigationTab, { title: string; subtitle: string }> = {
    dashboard: { title: 'Dashboard', subtitle: 'Productivity overview, metrics & performance' },
    tracker: { title: 'Time Tracker', subtitle: 'Live timer and manual work session logging' },
    projects: { title: 'Projects & Tasks', subtitle: 'Manage initiatives, workloads and task queues' },
    timesheet: { title: 'Timesheet', subtitle: 'Grouped daily and weekly detailed logs' },
    calendar: { title: 'Calendar', subtitle: 'Visual timeline across months, weeks and days' },
    reports: { title: 'Reports & Analytics', subtitle: 'Time distribution, trends, and CSV exports' },
    pomodoro: { title: 'Pomodoro Focus Timer', subtitle: 'Structured work intervals and restorative breaks' },
    estimates: { title: 'Time Estimates & Budgets', subtitle: 'Estimate accuracy and project variance analysis' },
    autotracker: { title: 'Auto Tracker & Companion', subtitle: 'Activity staging and desktop integration portal' },
    reminders_audit: { title: 'Reminders & Time Audit', subtitle: 'Scheduled alerts and timeline integrity auditing' },
    settings: { title: 'Settings', subtitle: 'Preferences, time formats, and data backup' },
  };

  const currentMeta = titles[currentTab] || { title: 'Workspace', subtitle: '' };
  const currentProject = activeTimer ? projects.find(p => p.id === activeTimer.projectId) : null;

  return (
    <header className="h-16 px-6 bg-[#0d1117]/80 backdrop-blur-md border-b border-[#21262d] flex items-center justify-between shrink-0 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 text-slate-400 hover:text-white hover:bg-[#161b22] rounded-lg cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-sm font-semibold text-white tracking-wide">{currentMeta.title}</h1>
          <p className="text-[11px] text-slate-400 hidden sm:block">{currentMeta.subtitle}</p>
        </div>
      </div>

      {/* Top Bar Quick Controls */}
      <div className="flex items-center gap-3">
        {activeTimer ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#161b22] border border-[#262c36]">
            <span
              className={`w-2 h-2 rounded-full ${
                isPaused ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'
              }`}
            />
            {currentProject && (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: currentProject.color }}
                title={currentProject.name}
              />
            )}
            <span className="font-mono text-xs font-semibold text-white">
              {formatSecondsToHMS(elapsedSeconds)}
            </span>
            <div className="flex items-center gap-1 ml-1 border-l border-[#262c36] pl-2">
              {isPaused ? (
                <button
                  onClick={resumeTimer}
                  title="Resume"
                  className="p-1 rounded text-slate-300 hover:text-emerald-400 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                </button>
              ) : (
                <button
                  onClick={pauseTimer}
                  title="Pause"
                  className="p-1 rounded text-slate-300 hover:text-amber-400 cursor-pointer"
                >
                  <Pause className="w-3.5 h-3.5 fill-current" />
                </button>
              )}
              <button
                onClick={() => stopTimer()}
                title="Stop & Save"
                className="p-1 rounded text-rose-400 hover:text-rose-300 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={onQuickTrack}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 text-xs font-medium transition-colors cursor-pointer"
          >
            <TimerIcon className="w-3.5 h-3.5" />
            <span>Track Time</span>
          </button>
        )}
      </div>
    </header>
  );
};
