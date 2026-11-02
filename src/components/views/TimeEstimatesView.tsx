import React, { useState, useMemo } from 'react';
import {
  Target,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Clock,
  FolderKanban,
  ListTodo,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { useTimeTracker } from '../../context/TimeTrackerContext';
import { formatDurationHuman } from '../../utils/formatters';
import { EmptyState } from '../common/EmptyState';

export const TimeEstimatesView: React.FC = () => {
  const { projects, tasks, timeEntries } = useTimeTracker();
  const [filterType, setFilterType] = useState<'all' | 'projects' | 'tasks'>('all');

  // Actual tracked seconds per task
  const taskTrackedMap = useMemo(() => {
    const map = new Map<string, number>();
    timeEntries.forEach((e) => {
      if (e.taskId) {
        map.set(e.taskId, (map.get(e.taskId) || 0) + e.duration);
      }
    });
    return map;
  }, [timeEntries]);

  // Actual tracked seconds per project
  const projectTrackedMap = useMemo(() => {
    const map = new Map<string, number>();
    timeEntries.forEach((e) => {
      if (e.projectId) {
        map.set(e.projectId, (map.get(e.projectId) || 0) + e.duration);
      }
    });
    return map;
  }, [timeEntries]);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // Tasks with estimates
  const taskEstimates = useMemo(() => {
    return tasks
      .filter((t) => t.estimatedHours && t.estimatedHours > 0)
      .map((t) => {
        const trackedSec = taskTrackedMap.get(t.id) || 0;
        const trackedHours = Number((trackedSec / 3600).toFixed(2));
        const estimateHours = t.estimatedHours || 0;
        const percent = Math.round((trackedHours / estimateHours) * 100);
        const isExceeded = trackedHours > estimateHours;
        const remainingHours = Math.max(0, Number((estimateHours - trackedHours).toFixed(2)));
        const varianceHours = Number((trackedHours - estimateHours).toFixed(2));

        return {
          id: t.id,
          name: t.name,
          projectId: t.projectId,
          projectName: projectMap.get(t.projectId)?.name || 'Unassigned',
          projectColor: projectMap.get(t.projectId)?.color || '#388bfd',
          status: t.status,
          estimateHours,
          trackedHours,
          percent,
          isExceeded,
          remainingHours,
          varianceHours,
        };
      });
  }, [tasks, taskTrackedMap, projectMap]);

  // Projects with budgets
  const projectBudgets = useMemo(() => {
    return projects
      .filter((p) => p.budgetHours && p.budgetHours > 0)
      .map((p) => {
        const trackedSec = projectTrackedMap.get(p.id) || 0;
        const trackedHours = Number((trackedSec / 3600).toFixed(2));
        const budgetHours = p.budgetHours || 0;
        const percent = Math.round((trackedHours / budgetHours) * 100);
        const isExceeded = trackedHours > budgetHours;
        const remainingHours = Math.max(0, Number((budgetHours - trackedHours).toFixed(2)));
        const varianceHours = Number((trackedHours - budgetHours).toFixed(2));

        return {
          id: p.id,
          name: p.name,
          color: p.color,
          status: p.status,
          budgetHours,
          trackedHours,
          percent,
          isExceeded,
          remainingHours,
          varianceHours,
        };
      });
  }, [projects, projectTrackedMap]);

  // Estimation Accuracy Metrics
  const accuracyStats = useMemo(() => {
    const evaluated = taskEstimates.filter((t) => t.status === 'completed' || t.trackedHours > 0);
    if (evaluated.length === 0) {
      return { totalEvaluated: 0, accuracyScore: 100, exceededCount: 0, withinBudgetCount: 0 };
    }

    const exceededCount = evaluated.filter((t) => t.isExceeded).length;
    const withinBudgetCount = evaluated.length - exceededCount;

    // Calculate score based on proximity of estimated vs actual
    let accuracySum = 0;
    evaluated.forEach((t) => {
      const ratio = t.trackedHours / t.estimateHours;
      // Proximity score: 1.0 ratio = 100%, 0.5 or 1.5 = 75%, 2.0 = 50%
      const errorMargin = Math.abs(1 - ratio);
      const score = Math.max(0, Math.min(100, 100 - errorMargin * 50));
      accuracySum += score;
    });

    const accuracyScore = Math.round(accuracySum / evaluated.length);

    return {
      totalEvaluated: evaluated.length,
      accuracyScore,
      exceededCount,
      withinBudgetCount,
    };
  }, [taskEstimates]);

  const hasAnyEstimates = taskEstimates.length > 0 || projectBudgets.length > 0;

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner with KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-[#0d1117] border border-[#21262d]">
          <span className="text-xs font-medium text-slate-400">Estimation Accuracy</span>
          <p className="text-2xl font-bold font-mono text-white mt-2">
            {accuracyStats.totalEvaluated > 0 ? `${accuracyStats.accuracyScore}%` : 'N/A'}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Based on actual recorded time</p>
        </div>

        <div className="p-5 rounded-2xl bg-[#0d1117] border border-[#21262d]">
          <span className="text-xs font-medium text-slate-400">Budgeted Projects</span>
          <p className="text-2xl font-bold font-mono text-white mt-2">
            {projectBudgets.length}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {projectBudgets.filter((p) => p.isExceeded).length} over budget
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-[#0d1117] border border-[#21262d]">
          <span className="text-xs font-medium text-slate-400">Estimated Tasks</span>
          <p className="text-2xl font-bold font-mono text-white mt-2">
            {taskEstimates.length}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {taskEstimates.filter((t) => t.isExceeded).length} exceeded estimate
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-[#0d1117] border border-[#21262d]">
          <span className="text-xs font-medium text-slate-400">Within Budget</span>
          <p className="text-2xl font-bold font-mono text-emerald-400 mt-2">
            {accuracyStats.withinBudgetCount} / {accuracyStats.totalEvaluated}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">On-track deliverables</p>
        </div>
      </div>

      {hasAnyEstimates ? (
        <div className="space-y-6">
          {/* PROJECT BUDGETS TABLE */}
          {projectBudgets.length > 0 && (
            <div className="p-6 rounded-2xl bg-[#0d1117] border border-[#21262d] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Project Budget Variance</h3>
                  <p className="text-xs text-slate-400">Comparing target budgets against total actual tracked hours</p>
                </div>
              </div>

              <div className="rounded-xl border border-[#21262d] overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#21262d] bg-[#121620] text-[11px] uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-4">Project</th>
                      <th className="py-3 px-4 text-center">Budget</th>
                      <th className="py-3 px-4 text-center">Tracked</th>
                      <th className="py-3 px-4 text-center">Remaining</th>
                      <th className="py-3 px-4 text-center">Completion</th>
                      <th className="py-3 px-4 w-44">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#21262d]">
                    {projectBudgets.map((p) => (
                      <tr key={p.id} className="hover:bg-[#121620] transition-colors">
                        <td className="py-3.5 px-4 font-medium text-white flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                          <span>{p.name}</span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-slate-300">{p.budgetHours}h</td>
                        <td className="py-3.5 px-4 text-center font-mono font-semibold text-white">
                          {p.trackedHours}h
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono">
                          {p.isExceeded ? (
                            <span className="text-rose-400 font-semibold">+{p.varianceHours}h over</span>
                          ) : (
                            <span className="text-emerald-400">{p.remainingHours}h left</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-slate-300">{p.percent}%</td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-[#161b22] overflow-hidden">
                              <div
                                className={`h-full rounded-full ${p.isExceeded ? 'bg-rose-500' : 'bg-blue-500'}`}
                                style={{ width: `${Math.min(100, p.percent)}%` }}
                              />
                            </div>
                            {p.isExceeded ? (
                              <span className="flex items-center gap-1 text-[10px] font-semibold text-rose-400">
                                <AlertTriangle className="w-3 h-3" /> Exceeded
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                                <CheckCircle2 className="w-3 h-3" /> On Track
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TASK ESTIMATES TABLE */}
          {taskEstimates.length > 0 && (
            <div className="p-6 rounded-2xl bg-[#0d1117] border border-[#21262d] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Task Duration Estimates</h3>
                  <p className="text-xs text-slate-400">Granular task estimation vs actual recorded time</p>
                </div>
              </div>

              <div className="rounded-xl border border-[#21262d] overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#21262d] bg-[#121620] text-[11px] uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-4">Task</th>
                      <th className="py-3 px-4">Project</th>
                      <th className="py-3 px-4 text-center">Estimate</th>
                      <th className="py-3 px-4 text-center">Actual</th>
                      <th className="py-3 px-4 text-center">Variance</th>
                      <th className="py-3 px-4 w-40">Progress</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#21262d]">
                    {taskEstimates.map((t) => (
                      <tr key={t.id} className="hover:bg-[#121620] transition-colors">
                        <td className="py-3.5 px-4 font-medium text-white">{t.name}</td>
                        <td className="py-3.5 px-4 text-slate-400 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.projectColor }} />
                          <span>{t.projectName}</span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-slate-300">{t.estimateHours}h</td>
                        <td className="py-3.5 px-4 text-center font-mono font-semibold text-white">
                          {t.trackedHours}h
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono">
                          {t.isExceeded ? (
                            <span className="text-rose-400 font-semibold">+{t.varianceHours}h</span>
                          ) : (
                            <span className="text-slate-400">{t.remainingHours}h left</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="w-full h-1.5 rounded-full bg-[#161b22] overflow-hidden">
                            <div
                              className={`h-full rounded-full ${t.isExceeded ? 'bg-rose-500' : 'bg-blue-500'}`}
                              style={{ width: `${Math.min(100, t.percent)}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          icon={Target}
          title="No estimates configured"
          description="Go to Projects & Tasks to set estimated hours for your tasks or define project budgets."
        />
      )}
    </div>
  );
};
