import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  Download,
  Filter,
  Calendar,
  Clock,
  PieChart as PieIcon,
  Layers,
  TrendingUp,
  FileSpreadsheet,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { useTimeTracker } from '../../context/TimeTrackerContext';
import {
  formatDurationHuman,
  formatDate,
  formatTime,
  exportToCSV,
  getStartOfWeek,
  getEndOfWeek,
  getStartOfMonth,
  getEndOfMonth,
  toISODateString,
} from '../../utils/formatters';
import { EmptyState } from '../common/EmptyState';
import { useToast } from '../common/Toast';

type ReportTab = 'summary' | 'projects' | 'daily' | 'weekly' | 'monthly';
type DatePreset = 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'all' | 'custom';

export const ReportsView: React.FC = () => {
  const { timeEntries, projects, tasks } = useTimeTracker();
  const { success } = useToast();

  const [currentTab, setCurrentTab] = useState<ReportTab>('summary');
  const [datePreset, setDatePreset] = useState<DatePreset>('this_month');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toISODateString(d);
  });
  const [customEnd, setCustomEnd] = useState(() => toISODateString(new Date()));

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // Compute time boundaries
  const { filterStartMs, filterEndMs } = useMemo(() => {
    const now = new Date();
    if (datePreset === 'this_week') {
      return { filterStartMs: getStartOfWeek(now), filterEndMs: getEndOfWeek(now) };
    }
    if (datePreset === 'last_week') {
      const prev = new Date(now);
      prev.setDate(prev.getDate() - 7);
      return { filterStartMs: getStartOfWeek(prev), filterEndMs: getEndOfWeek(prev) };
    }
    if (datePreset === 'this_month') {
      return { filterStartMs: getStartOfMonth(now), filterEndMs: getEndOfMonth(now) };
    }
    if (datePreset === 'last_month') {
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { filterStartMs: getStartOfMonth(prevMonth), filterEndMs: getEndOfMonth(prevMonth) };
    }
    if (datePreset === 'custom') {
      return {
        filterStartMs: new Date(`${customStart}T00:00:00`).getTime(),
        filterEndMs: new Date(`${customEnd}T23:59:59.999`).getTime(),
      };
    }
    // all time
    return { filterStartMs: 0, filterEndMs: Number.MAX_SAFE_INTEGER };
  }, [datePreset, customStart, customEnd]);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return timeEntries.filter((e) => {
      const matchesDate = e.startTime >= filterStartMs && e.startTime <= filterEndMs;
      const matchesProject =
        selectedProjectId === 'all' ||
        (selectedProjectId === 'none' && !e.projectId) ||
        e.projectId === selectedProjectId;
      return matchesDate && matchesProject;
    });
  }, [timeEntries, filterStartMs, filterEndMs, selectedProjectId]);

  // SUMMARY CALCULATIONS
  const totalTrackedSec = useMemo(() => {
    return filteredEntries.reduce((sum, e) => sum + e.duration, 0);
  }, [filteredEntries]);

  const uniqueDaysCount = useMemo(() => {
    const days = new Set(filteredEntries.map((e) => toISODateString(new Date(e.startTime))));
    return Math.max(1, days.size);
  }, [filteredEntries]);

  const avgDailySec = filteredEntries.length > 0 ? totalTrackedSec / uniqueDaysCount : 0;
  const avgSessionSec = filteredEntries.length > 0 ? totalTrackedSec / filteredEntries.length : 0;

  // PROJECT BREAKDOWN
  const projectStats = useMemo(() => {
    const map = new Map<string, { sec: number; count: number }>();
    filteredEntries.forEach((e) => {
      const key = e.projectId || 'unassigned';
      const existing = map.get(key) || { sec: 0, count: 0 };
      existing.sec += e.duration;
      existing.count += 1;
      map.set(key, existing);
    });

    const result: { id: string; name: string; color: string; sec: number; hours: number; percentage: number; count: number }[] = [];
    map.forEach((data, id) => {
      const proj = projectMap.get(id);
      const name = proj ? proj.name : 'Unassigned';
      const color = proj ? proj.color : '#64748b';
      const hours = Number((data.sec / 3600).toFixed(2));
      const percentage = totalTrackedSec > 0 ? Number(((data.sec / totalTrackedSec) * 100).toFixed(1)) : 0;
      result.push({ id, name, color, sec: data.sec, hours, percentage, count: data.count });
    });

    return result.sort((a, b) => b.sec - a.sec);
  }, [filteredEntries, projectMap, totalTrackedSec]);

  // DAILY BREAKDOWN
  const dailyStats = useMemo(() => {
    const map = new Map<string, { date: string; sec: number; count: number }>();
    filteredEntries.forEach((e) => {
      const dateStr = toISODateString(new Date(e.startTime));
      const existing = map.get(dateStr) || { date: dateStr, sec: 0, count: 0 };
      existing.sec += e.duration;
      existing.count += 1;
      map.set(dateStr, existing);
    });

    const list = Array.from(map.values()).map((d) => ({
      ...d,
      hours: Number((d.sec / 3600).toFixed(2)),
    }));
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredEntries]);

  // WEEKLY COMPARISON (This week vs Last week)
  const weeklyComparison = useMemo(() => {
    const now = new Date();
    const thisWeekStart = getStartOfWeek(now);
    const thisWeekEnd = getEndOfWeek(now);
    const lastWeekStart = thisWeekStart - 7 * 86400000;
    const lastWeekEnd = thisWeekStart - 1;

    let thisWeekSec = 0;
    let lastWeekSec = 0;

    timeEntries.forEach((e) => {
      if (e.startTime >= thisWeekStart && e.startTime <= thisWeekEnd) {
        thisWeekSec += e.duration;
      } else if (e.startTime >= lastWeekStart && e.startTime <= lastWeekEnd) {
        lastWeekSec += e.duration;
      }
    });

    const diffHours = (thisWeekSec - lastWeekSec) / 3600;
    const percentChange = lastWeekSec > 0 ? ((thisWeekSec - lastWeekSec) / lastWeekSec) * 100 : 0;

    return {
      thisWeekHours: Number((thisWeekSec / 3600).toFixed(2)),
      lastWeekHours: Number((lastWeekSec / 3600).toFixed(2)),
      diffHours: Number(diffHours.toFixed(1)),
      percentChange: Number(percentChange.toFixed(1)),
    };
  }, [timeEntries]);

  // CSV EXPORT ACTION
  const handleExportCSV = () => {
    const headers = [
      'Entry ID',
      'Date',
      'Start Time',
      'End Time',
      'Duration (Seconds)',
      'Duration (Formatted)',
      'Project',
      'Description',
      'Tags',
      'Type',
    ];

    const rows = filteredEntries.map((e) => {
      const proj = e.projectId ? projectMap.get(e.projectId)?.name || 'Unassigned' : 'Unassigned';
      return [
        e.id,
        toISODateString(new Date(e.startTime)),
        formatTime(e.startTime, true),
        formatTime(e.endTime, true),
        e.duration,
        formatDurationHuman(e.duration),
        proj,
        e.description || 'Tracked Session',
        e.tags ? e.tags.join(';') : '',
        e.isManual ? 'Manual' : 'Timer',
      ];
    });

    const filename = `chronos_report_${datePreset}_${toISODateString(new Date())}`;
    exportToCSV(filename, headers, rows);
    success('Report exported to CSV');
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Filter and Actions Bar */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-[#21262d]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5" /> Range:
          </span>
          {(['this_week', 'last_week', 'this_month', 'last_month', 'all', 'custom'] as DatePreset[]).map((p) => (
            <button
              key={p}
              onClick={() => setDatePreset(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors cursor-pointer ${
                datePreset === p
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-[#161b22] text-slate-400 hover:text-white border border-[#262c36]'
              }`}
            >
              {p.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Project filter */}
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">All Projects</option>
            <option value="none">No Project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Export CSV button */}
          <button
            onClick={handleExportCSV}
            disabled={filteredEntries.length === 0}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#161b22] hover:bg-[#202632] border border-[#2b3341] text-xs font-medium text-slate-200 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {datePreset === 'custom' && (
        <div className="flex items-center gap-2 text-xs p-3 rounded-xl bg-[#0d1117] border border-[#21262d]">
          <span className="text-slate-400">Custom Date Range:</span>
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="px-2.5 py-1 rounded bg-[#161b22] border border-[#262c36] text-slate-200 text-xs focus:outline-none"
          />
          <span className="text-slate-500">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="px-2.5 py-1 rounded bg-[#161b22] border border-[#262c36] text-slate-200 text-xs focus:outline-none"
          />
        </div>
      )}

      {/* Report Sub-tabs */}
      <div className="flex items-center gap-2 p-1 rounded-xl bg-[#0d1117] border border-[#21262d] w-fit">
        {[
          { tab: 'summary', label: 'Summary Report' },
          { tab: 'projects', label: 'Project Report' },
          { tab: 'daily', label: 'Daily Report' },
          { tab: 'weekly', label: 'Weekly Report' },
          { tab: 'monthly', label: 'Monthly Trends' },
        ].map((t) => (
          <button
            key={t.tab}
            onClick={() => setCurrentTab(t.tab as ReportTab)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              currentTab === t.tab ? 'bg-[#1c222c] text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 1. SUMMARY REPORT */}
      {currentTab === 'summary' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-[#0d1117] border border-[#21262d]">
              <span className="text-xs font-medium text-slate-400">Total Tracked Time</span>
              <p className="text-2xl font-bold font-mono text-white mt-2">
                {formatDurationHuman(totalTrackedSec)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">{(totalTrackedSec / 3600).toFixed(1)} decimal hours</p>
            </div>

            <div className="p-5 rounded-2xl bg-[#0d1117] border border-[#21262d]">
              <span className="text-xs font-medium text-slate-400">Daily Average</span>
              <p className="text-2xl font-bold font-mono text-white mt-2">
                {formatDurationHuman(avgDailySec)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">across {uniqueDaysCount} active days</p>
            </div>

            <div className="p-5 rounded-2xl bg-[#0d1117] border border-[#21262d]">
              <span className="text-xs font-medium text-slate-400">Total Sessions</span>
              <p className="text-2xl font-bold font-mono text-white mt-2">
                {filteredEntries.length}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">recorded work logs</p>
            </div>

            <div className="p-5 rounded-2xl bg-[#0d1117] border border-[#21262d]">
              <span className="text-xs font-medium text-slate-400">Average Session</span>
              <p className="text-2xl font-bold font-mono text-white mt-2">
                {formatDurationHuman(avgSessionSec)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">duration per session</p>
            </div>
          </div>

          {/* Project Chart Comparison */}
          {projectStats.length > 0 ? (
            <div className="p-6 rounded-2xl bg-[#0d1117] border border-[#21262d]">
              <h3 className="text-sm font-semibold text-white mb-4">Time by Project Comparison</h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={projectStats} layout="vertical" margin={{ top: 10, right: 30, left: 40, bottom: 0 }}>
                    <XAxis type="number" stroke="#475569" fontSize={11} tickFormatter={(v) => `${v}h`} />
                    <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={11} width={100} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#161b22', border: '1px solid #262c36', borderRadius: '8px' }}
                      formatter={(val: any) => [`${val} hours`, 'Tracked']}
                    />
                    <Bar dataKey="hours" fill="#388bfd" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={FileSpreadsheet}
              title="No data for this time period"
              description="Adjust your date filters or log time entries to generate summaries."
            />
          )}
        </div>
      )}

      {/* 2. PROJECT REPORT */}
      {currentTab === 'projects' && (
        <div className="space-y-4">
          {projectStats.length > 0 ? (
            <div className="rounded-2xl bg-[#0d1117] border border-[#21262d] overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#21262d] bg-[#121620] text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-4">Project</th>
                    <th className="py-3 px-4 text-center">Sessions</th>
                    <th className="py-3 px-4 text-right">Time Spent</th>
                    <th className="py-3 px-4 text-right">Share of Total</th>
                    <th className="py-3 px-4 w-40">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#21262d] text-xs">
                  {projectStats.map((item) => (
                    <tr key={item.id} className="hover:bg-[#121620] transition-colors">
                      <td className="py-3.5 px-4 font-medium text-white flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span>{item.name}</span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono text-slate-400">{item.count}</td>
                      <td className="py-3.5 px-4 text-right font-mono font-semibold text-white">
                        {formatDurationHuman(item.sec)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-300">{item.percentage}%</td>
                      <td className="py-3.5 px-4">
                        <div className="w-full h-1.5 rounded-full bg-[#161b22] overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={PieIcon}
              title="No project records"
              description="No entries recorded for projects in the chosen window."
            />
          )}
        </div>
      )}

      {/* 3. DAILY REPORT */}
      {currentTab === 'daily' && (
        <div className="space-y-4">
          {dailyStats.length > 0 ? (
            <div className="rounded-2xl bg-[#0d1117] border border-[#21262d] overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#21262d] bg-[#121620] text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-center">Sessions Logged</th>
                    <th className="py-3 px-4 text-right">Tracked Time</th>
                    <th className="py-3 px-4 text-right">Decimal Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#21262d] text-xs">
                  {dailyStats.map((day) => (
                    <tr key={day.date} className="hover:bg-[#121620] transition-colors">
                      <td className="py-3.5 px-4 font-medium text-white">
                        {formatDate(new Date(`${day.date}T00:00:00`).getTime())}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono text-slate-400">{day.count}</td>
                      <td className="py-3.5 px-4 text-right font-mono font-semibold text-white">
                        {formatDurationHuman(day.sec)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-blue-400">{day.hours}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={Calendar} title="No daily records" description="No daily entries found." />
          )}
        </div>
      )}

      {/* 4. WEEKLY REPORT */}
      {currentTab === 'weekly' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-[#0d1117] border border-[#21262d]">
              <span className="text-xs font-medium text-slate-400">This Week</span>
              <p className="text-2xl font-bold font-mono text-white mt-2">
                {weeklyComparison.thisWeekHours} hrs
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Current week total</p>
            </div>

            <div className="p-5 rounded-2xl bg-[#0d1117] border border-[#21262d]">
              <span className="text-xs font-medium text-slate-400">Last Week</span>
              <p className="text-2xl font-bold font-mono text-slate-300 mt-2">
                {weeklyComparison.lastWeekHours} hrs
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Prior week comparison baseline</p>
            </div>

            <div className="p-5 rounded-2xl bg-[#0d1117] border border-[#21262d]">
              <span className="text-xs font-medium text-slate-400">Pace Difference</span>
              <p
                className={`text-2xl font-bold font-mono mt-2 ${
                  weeklyComparison.diffHours >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {weeklyComparison.diffHours >= 0 ? `+${weeklyComparison.diffHours}` : weeklyComparison.diffHours} hrs
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {weeklyComparison.percentChange >= 0 ? `+${weeklyComparison.percentChange}%` : `${weeklyComparison.percentChange}%`} vs last week
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 5. MONTHLY TRENDS */}
      {currentTab === 'monthly' && (
        <div className="space-y-4">
          <div className="p-6 rounded-2xl bg-[#0d1117] border border-[#21262d]">
            <h3 className="text-sm font-semibold text-white mb-2">Monthly Productivity Breakdown</h3>
            <p className="text-xs text-slate-400 mb-6">Aggregate focus volume per month</p>
            <div className="divide-y divide-[#21262d]">
              <div className="py-3 flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">Selected Window Tracked Total</span>
                <span className="font-mono text-white font-bold">{formatDurationHuman(totalTrackedSec)}</span>
              </div>
              <div className="py-3 flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">Distinct Projects Engaged</span>
                <span className="font-mono text-blue-400 font-semibold">{projectStats.length}</span>
              </div>
              <div className="py-3 flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">Recorded Session Count</span>
                <span className="font-mono text-white font-semibold">{filteredEntries.length}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
