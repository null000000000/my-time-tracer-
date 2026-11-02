import React, { useState, useMemo } from 'react';
import {
  Clock,
  CalendarDays,
  Flame,
  CheckCircle,
  Play,
  ArrowUpRight,
  FolderPlus,
  Timer as TimerIcon,
  Filter,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useTimeTracker } from '../../context/TimeTrackerContext';
import { NavigationTab, TimeEntry } from '../../types';
import {
  formatDurationHuman,
  formatSecondsToHMS,
  formatTime,
  formatDate,
  getStartOfDay,
  getEndOfDay,
  getStartOfWeek,
  getEndOfWeek,
  getStartOfMonth,
  getEndOfMonth,
  toISODateString,
} from '../../utils/formatters';
import { EmptyState } from '../common/EmptyState';

interface DashboardViewProps {
  onNavigate: (tab: NavigationTab) => void;
}

type DateFilter = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'custom';

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { timeEntries, projects, tasks, activeTimer, elapsedSeconds, isRunning, isPaused, startTimer } = useTimeTracker();
  const [filter, setFilter] = useState<DateFilter>('this_week');
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toISODateString(d);
  });
  const [customEnd, setCustomEnd] = useState<string>(() => toISODateString(new Date()));

  // Project map for quick lookup
  const projectMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    projects.forEach((p) => map.set(p.id, { name: p.name, color: p.color || '#388bfd' }));
    return map;
  }, [projects]);

  // Overall totals across standard windows
  const now = new Date();
  const startToday = getStartOfDay(now);
  const endToday = getEndOfDay(now);

  const startThisWeek = getStartOfWeek(now, true);
  const endThisWeek = getEndOfWeek(now, true);

  const startThisMonth = getStartOfMonth(now);
  const endThisMonth = getEndOfMonth(now);

  const todayEntries = useMemo(() => {
    return timeEntries.filter((e) => e.startTime >= startToday && e.startTime <= endToday);
  }, [timeEntries, startToday, endToday]);

  const weekEntries = useMemo(() => {
    return timeEntries.filter((e) => e.startTime >= startThisWeek && e.startTime <= endThisWeek);
  }, [timeEntries, startThisWeek, endThisWeek]);

  const monthEntries = useMemo(() => {
    return timeEntries.filter((e) => e.startTime >= startThisMonth && e.startTime <= endThisMonth);
  }, [timeEntries, startThisMonth, endThisMonth]);

  const todaySec = todayEntries.reduce((acc, cur) => acc + cur.duration, 0);
  const weekSec = weekEntries.reduce((acc, cur) => acc + cur.duration, 0);
  const monthSec = monthEntries.reduce((acc, cur) => acc + cur.duration, 0);
  const totalSessions = timeEntries.length;

  // Filtered entries according to current active date filter
  const filteredEntries = useMemo(() => {
    const d = new Date();
    let start = 0;
    let end = Number.MAX_SAFE_INTEGER;

    if (filter === 'today') {
      start = getStartOfDay(d);
      end = getEndOfDay(d);
    } else if (filter === 'yesterday') {
      const y = new Date(d);
      y.setDate(y.getDate() - 1);
      start = getStartOfDay(y);
      end = getEndOfDay(y);
    } else if (filter === 'this_week') {
      start = getStartOfWeek(d, true);
      end = getEndOfWeek(d, true);
    } else if (filter === 'last_week') {
      const lw = new Date(d);
      lw.setDate(lw.getDate() - 7);
      start = getStartOfWeek(lw, true);
      end = getEndOfWeek(lw, true);
    } else if (filter === 'this_month') {
      start = getStartOfMonth(d);
      end = getEndOfMonth(d);
    } else if (filter === 'custom') {
      start = new Date(`${customStart}T00:00:00`).getTime();
      end = new Date(`${customEnd}T23:59:59.999`).getTime();
    }

    return timeEntries.filter((e) => e.startTime >= start && e.startTime <= end);
  }, [filter, customStart, customEnd, timeEntries]);

  // Project distribution for Pie Chart
  const projectDistribution = useMemo(() => {
    const map = new Map<string, number>();
    filteredEntries.forEach((entry) => {
      const key = entry.projectId || 'unassigned';
      map.set(key, (map.get(key) || 0) + entry.duration);
    });

    const data: { name: string; value: number; color: string; hours: number }[] = [];
    map.forEach((sec, projId) => {
      const proj = projectMap.get(projId);
      const name = proj ? proj.name : 'No Project';
      const color = proj ? proj.color : '#64748b';
      const hours = Number((sec / 3600).toFixed(2));
      data.push({ name, value: sec, color, hours });
    });

    return data.sort((a, b) => b.value - a.value);
  }, [filteredEntries, projectMap]);

  // Daily breakdown (last 7 days of filtered range) for Bar Chart
  const dailyChartData = useMemo(() => {
    const daysMap = new Map<string, { label: string; hours: number; rawSec: number }>();
    const past7 = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      const key = toISODateString(day);
      const label = day.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' });
      daysMap.set(key, { label, hours: 0, rawSec: 0 });
      past7.push(key);
    }

    timeEntries.forEach((entry) => {
      const key = toISODateString(new Date(entry.startTime));
      if (daysMap.has(key)) {
        const item = daysMap.get(key)!;
        item.rawSec += entry.duration;
        item.hours = Number((item.rawSec / 3600).toFixed(2));
      }
    });

    return past7.map((k) => daysMap.get(k)!);
  }, [timeEntries]);

  // Check if completely empty
  const isWorkspaceEmpty = timeEntries.length === 0 && projects.length === 0 && !activeTimer;

  if (isWorkspaceEmpty) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        <div className="border border-[#21262d] rounded-2xl bg-[#0d1117] p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto mb-4">
            <TimerIcon className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Your Tracking System is Ready</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto mt-2 leading-relaxed">
            Welcome to your personal productivity dashboard. Your database starts completely empty.
            Create your projects, define tasks, and start logging your focused sessions.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <button
              onClick={() => onNavigate('projects')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 transition-all cursor-pointer"
            >
              <FolderPlus className="w-4 h-4" /> Create First Project
            </button>
            <button
              onClick={() => onNavigate('tracker')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#161b22] hover:bg-[#202632] border border-[#2b3341] text-slate-200 text-xs font-medium transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 text-emerald-400" /> Open Time Tracker
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Filter Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-[#21262d]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5" /> Date Filter:
          </span>
          {(['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'custom'] as DateFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors cursor-pointer ${
                filter === f
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-[#161b22] text-slate-400 hover:text-white hover:bg-[#202632] border border-[#262c36]'
              }`}
            >
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>

        {filter === 'custom' && (
          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-[#161b22] border border-[#262c36] text-slate-200 text-xs focus:outline-none focus:border-blue-500"
            />
            <span className="text-slate-500">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-[#161b22] border border-[#262c36] text-slate-200 text-xs focus:outline-none focus:border-blue-500"
            />
          </div>
        )}
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today */}
        <div className="p-5 rounded-2xl bg-[#0d1117] border border-[#21262d] relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Tracked Today</span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold font-mono text-white tracking-tight">
              {formatDurationHuman(todaySec)}
            </span>
            <p className="text-[11px] text-slate-500 mt-1">
              {todayEntries.length} {todayEntries.length === 1 ? 'session' : 'sessions'}
            </p>
          </div>
        </div>

        {/* This Week */}
        <div className="p-5 rounded-2xl bg-[#0d1117] border border-[#21262d]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Tracked This Week</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <CalendarDays className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold font-mono text-white tracking-tight">
              {formatDurationHuman(weekSec)}
            </span>
            <p className="text-[11px] text-slate-500 mt-1">
              {weekEntries.length} sessions logged
            </p>
          </div>
        </div>

        {/* This Month */}
        <div className="p-5 rounded-2xl bg-[#0d1117] border border-[#21262d]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Tracked This Month</span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold font-mono text-white tracking-tight">
              {formatDurationHuman(monthSec)}
            </span>
            <p className="text-[11px] text-slate-500 mt-1">
              {monthEntries.length} sessions logged
            </p>
          </div>
        </div>

        {/* Active Timer / Total Sessions */}
        <div className={`p-5 rounded-2xl border transition-all ${
          activeTimer
            ? 'bg-blue-950/20 border-blue-500/30'
            : 'bg-[#0d1117] border-[#21262d]'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Timer Status</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              activeTimer ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[#161b22] text-slate-500'
            }`}>
              <TimerIcon className={`w-4 h-4 ${activeTimer && !isPaused ? 'animate-spin' : ''}`} />
            </div>
          </div>
          <div className="mt-3">
            {activeTimer ? (
              <div>
                <span className="text-2xl font-bold font-mono text-emerald-400">
                  {formatSecondsToHMS(elapsedSeconds)}
                </span>
                <p className="text-[11px] text-slate-300 truncate mt-1">
                  {isPaused ? 'Paused' : 'Active'}: {activeTimer.description || 'Session'}
                </p>
              </div>
            ) : (
              <div>
                <span className="text-2xl font-bold font-mono text-white">
                  {totalSessions}
                </span>
                <p className="text-[11px] text-slate-500 mt-1">
                  Total lifetime sessions
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Tracked Hours Bar Chart (2 cols) */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-[#0d1117] border border-[#21262d] flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Daily Productivity (Last 7 Days)</h3>
              <p className="text-xs text-slate-400">Tracked focus hours per day</p>
            </div>
            <span className="text-xs font-mono font-medium text-blue-400">
              Total: {(dailyChartData.reduce((a, b) => a + b.hours, 0)).toFixed(1)}h
            </span>
          </div>

          <div className="h-64 w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  stroke="#475569"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#21262d' }}
                />
                <YAxis
                  stroke="#475569"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#21262d' }}
                  tickFormatter={(v) => `${v}h`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#161b22',
                    border: '1px solid #262c36',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                  formatter={(value: any) => [`${value} hours`, 'Tracked']}
                />
                <Bar dataKey="hours" fill="#388bfd" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Project Distribution Pie Chart (1 col) */}
        <div className="p-6 rounded-2xl bg-[#0d1117] border border-[#21262d] flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Project Distribution</h3>
              <p className="text-xs text-slate-400">Time allocation in current filter</p>
            </div>
          </div>

          {projectDistribution.length > 0 ? (
            <div className="flex-1 flex flex-col justify-between">
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={projectDistribution}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={3}
                    >
                      {projectDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#161b22',
                        border: '1px solid #262c36',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      formatter={(val: any) => [formatDurationHuman(Number(val)), 'Time']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend List */}
              <div className="space-y-2 mt-2 max-h-32 overflow-y-auto pr-1">
                {projectDistribution.slice(0, 4).map((p) => (
                  <div key={p.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="text-slate-300 truncate">{p.name}</span>
                    </div>
                    <span className="font-mono text-slate-400 shrink-0 font-medium">{p.hours}h</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-center p-6 text-slate-500 text-xs">
              No entries logged for this period
            </div>
          )}
        </div>
      </div>

      {/* Recent Time Entries Table / List */}
      <div className="p-6 rounded-2xl bg-[#0d1117] border border-[#21262d]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Recent Time Entries</h3>
            <p className="text-xs text-slate-400">Latest recorded work sessions</p>
          </div>
          <button
            onClick={() => onNavigate('tracker')}
            className="flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
          >
            <span>View All</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {timeEntries.length > 0 ? (
          <div className="divide-y divide-[#21262d]">
            {timeEntries.slice(0, 6).map((entry) => {
              const proj = entry.projectId ? projectMap.get(entry.projectId) : null;
              return (
                <div key={entry.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: proj?.color || '#475569' }}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white truncate">
                        {entry.description || 'Tracked Session'}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                        <span className="text-slate-300">{proj?.name || 'No Project'}</span>
                        <span>•</span>
                        <span>{formatDate(entry.startTime)}</span>
                        <span>•</span>
                        <span>{formatTime(entry.startTime)} - {formatTime(entry.endTime)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {entry.tags && entry.tags.length > 0 && (
                      <div className="hidden sm:flex items-center gap-1">
                        {entry.tags.slice(0, 2).map((t) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded-md bg-[#161b22] border border-[#21262d] text-[10px] text-slate-400"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                    <span className="font-mono text-xs font-semibold text-white bg-[#161b22] px-2.5 py-1 rounded-lg border border-[#262c36]">
                      {formatDurationHuman(entry.duration)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={TimerIcon}
            title="No records yet"
            description="Start the timer to log your first session"
            actionLabel="Start Timer"
            onAction={() => startTimer()}
          />
        )}
      </div>
    </div>
  );
};
