import React from 'react';
import {
  LayoutDashboard,
  Timer,
  FolderKanban,
  Clock,
  Calendar,
  BarChart3,
  Hourglass,
  Activity,
  Target,
  BellRing,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Square,
  Play,
  Pause,
} from 'lucide-react';
import { NavigationTab } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useTimeTracker } from '../../context/TimeTrackerContext';
import { formatSecondsToHMS } from '../../utils/formatters';

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
}) => {
  const { user, logout, isGuest } = useAuth();
  const { activeTimer, elapsedSeconds, isRunning, isPaused, pauseTimer, resumeTimer, stopTimer, projects } = useTimeTracker();

  const navItems: { tab: NavigationTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { tab: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { tab: 'tracker', label: 'Time Tracker', icon: Timer },
    { tab: 'projects', label: 'Projects & Tasks', icon: FolderKanban },
    { tab: 'timesheet', label: 'Timesheet', icon: Clock },
    { tab: 'calendar', label: 'Calendar', icon: Calendar },
    { tab: 'reports', label: 'Reports', icon: BarChart3 },
    { tab: 'pomodoro', label: 'Pomodoro', icon: Hourglass },
    { tab: 'estimates', label: 'Time Estimates', icon: Target },
    { tab: 'autotracker', label: 'Auto Tracker', icon: Activity },
    { tab: 'reminders_audit', label: 'Reminders & Audit', icon: BellRing },
    { tab: 'settings', label: 'Settings', icon: Settings },
  ];

  const activeProject = activeTimer ? projects.find((p) => p.id === activeTimer.projectId) : null;

  return (
    <aside
      className={`relative flex flex-col h-screen bg-[#0d1117] border-r border-[#21262d] transition-all duration-300 z-20 shrink-0 ${
        collapsed ? 'w-18' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-[#21262d]">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20 text-white font-bold tracking-wider">
            C
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-white tracking-wider uppercase font-mono">
                Chronos
              </span>
              <span className="text-[10px] text-slate-400 font-medium tracking-tight">
                Personal Productivity
              </span>
            </div>
          )}
        </div>
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-[#161b22] transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Active Timer Quick Status Badge (when timer is running/paused) */}
      {activeTimer && (
        <div className="p-3 mx-2 my-2 rounded-xl bg-[#161b22] border border-[#262c36] shadow-sm">
          {!collapsed ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isPaused ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'
                    }`}
                  />
                  {isPaused ? 'Timer Paused' : 'Tracking Now'}
                </span>
                <span className="font-mono text-xs font-semibold text-white tracking-wide">
                  {formatSecondsToHMS(elapsedSeconds)}
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium truncate">
                {activeTimer.description || 'Session in progress'}
              </p>
              {activeProject && (
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 truncate">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: activeProject.color || '#388bfd' }}
                  />
                  <span className="truncate">{activeProject.name}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 pt-1 border-t border-[#21262d]">
                {isPaused ? (
                  <button
                    onClick={resumeTimer}
                    className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-[#21262d] hover:bg-[#2d333b] text-slate-200 text-[11px] font-medium transition-colors cursor-pointer"
                  >
                    <Play className="w-3 h-3 text-emerald-400 fill-emerald-400" /> Resume
                  </button>
                ) : (
                  <button
                    onClick={pauseTimer}
                    className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-[#21262d] hover:bg-[#2d333b] text-slate-200 text-[11px] font-medium transition-colors cursor-pointer"
                  >
                    <Pause className="w-3 h-3 text-amber-400 fill-amber-400" /> Pause
                  </button>
                )}
                <button
                  onClick={() => stopTimer()}
                  className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 text-[11px] font-medium transition-colors cursor-pointer"
                >
                  <Square className="w-3 h-3 fill-rose-400 text-rose-400" /> Stop
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isPaused ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'
                }`}
                title={formatSecondsToHMS(elapsedSeconds)}
              />
              <button
                onClick={() => stopTimer()}
                title="Stop timer"
                className="p-1 rounded bg-rose-950/50 text-rose-400 hover:text-rose-200"
              >
                <Square className="w-3 h-3 fill-rose-400" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Navigation List */}
      <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.tab;
          return (
            <button
              key={item.tab}
              onClick={() => onSelectTab(item.tab)}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 cursor-pointer ${
                isActive
                  ? 'bg-blue-600/15 text-blue-400 border border-blue-500/25 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#161b22] border border-transparent'
              } ${collapsed ? 'justify-center px-0' : ''}`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="p-3 border-t border-[#21262d] bg-[#090d13]">
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
          {isGuest ? (
            <div
              className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-xs font-bold text-amber-300 shrink-0"
              title="Guest Session"
            >
              G
            </div>
          ) : user?.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName || 'User'}
              className="w-8 h-8 rounded-full border border-[#2b3341] shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#1c222c] border border-[#2b3341] flex items-center justify-center text-xs font-semibold text-slate-300 shrink-0">
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
          )}
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">
                {isGuest ? 'Guest Engineer' : user?.displayName || user?.email?.split('@')[0] || 'Personal Space'}
              </p>
              <p className="text-[10px] text-slate-500 truncate">
                {isGuest ? (
                  <span className="text-amber-400 font-mono text-[9px] uppercase tracking-wider">Temporary Tab</span>
                ) : (
                  user?.email
                )}
              </p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={() => logout()}
              title={isGuest ? 'Exit Guest Mode' : 'Sign out'}
              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-[#161b22] transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
