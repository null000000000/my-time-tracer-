import React, { useState, useMemo } from 'react';
import {
  FolderKanban,
  Plus,
  Edit2,
  Trash2,
  Archive,
  CheckCircle2,
  Clock,
  Target,
  Calendar,
  Filter,
  Search,
  CheckSquare,
  ListTodo,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTimeTracker } from '../../context/TimeTrackerContext';
import { Project, Task, ProjectStatus, TaskStatus } from '../../types';
import {
  createProject,
  updateProject,
  deleteProject,
  createTask,
  updateTask,
  deleteTask,
} from '../../services/db';
import { formatDurationHuman, formatDate } from '../../utils/formatters';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { EmptyState } from '../common/EmptyState';
import { useToast } from '../common/Toast';

const PRESET_COLORS = [
  '#388bfd', // blue
  '#2ea043', // green
  '#a371f7', // purple
  '#f0883e', // orange
  '#f85149', // red
  '#56d4dd', // cyan
  '#e3b341', // yellow
  '#db61a2', // pink
];

export const ProjectsTasksView: React.FC = () => {
  const { user } = useAuth();
  const { projects, tasks, timeEntries } = useTimeTracker();
  const { success, error } = useToast();

  const [activeTab, setActiveTab] = useState<'projects' | 'tasks'>('projects');
  const [projectSearch, setProjectSearch] = useState('');
  const [projectStatusFilter, setProjectStatusFilter] = useState<'all' | ProjectStatus>('all');

  const [taskSearch, setTaskSearch] = useState('');
  const [taskProjectFilter, setTaskProjectFilter] = useState<string>('all');
  const [taskStatusFilter, setTaskStatusFilter] = useState<'all' | TaskStatus>('all');

  // Modals
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projName, setProjName] = useState('');
  const [projDesc, setProjDesc] = useState('');
  const [projColor, setProjColor] = useState(PRESET_COLORS[0]);
  const [projStatus, setProjStatus] = useState<ProjectStatus>('active');
  const [projStartDate, setProjStartDate] = useState('');
  const [projDeadline, setProjDeadline] = useState('');
  const [projBudgetHours, setProjBudgetHours] = useState('');

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskName, setTaskName] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskProjectId, setTaskProjectId] = useState('');
  const [taskStatus, setTaskStatus] = useState<TaskStatus>('todo');
  const [taskEstimate, setTaskEstimate] = useState('');
  const [taskDeadline, setTaskDeadline] = useState('');

  // Delete dialogs
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  // Time calculations per project & task
  const projectTrackedSeconds = useMemo(() => {
    const map = new Map<string, number>();
    timeEntries.forEach((entry) => {
      if (entry.projectId) {
        map.set(entry.projectId, (map.get(entry.projectId) || 0) + entry.duration);
      }
    });
    return map;
  }, [timeEntries]);

  const taskTrackedSeconds = useMemo(() => {
    const map = new Map<string, number>();
    timeEntries.forEach((entry) => {
      if (entry.taskId) {
        map.set(entry.taskId, (map.get(entry.taskId) || 0) + entry.duration);
      }
    });
    return map;
  }, [timeEntries]);

  // Open Create Project
  const handleOpenCreateProject = () => {
    setEditingProject(null);
    setProjName('');
    setProjDesc('');
    setProjColor(PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]);
    setProjStatus('active');
    setProjStartDate(new Date().toISOString().split('T')[0]);
    setProjDeadline('');
    setProjBudgetHours('');
    setIsProjectModalOpen(true);
  };

  // Open Edit Project
  const handleOpenEditProject = (p: Project) => {
    setEditingProject(p);
    setProjName(p.name);
    setProjDesc(p.description || '');
    setProjColor(p.color);
    setProjStatus(p.status);
    setProjStartDate(p.startDate || '');
    setProjDeadline(p.deadline || '');
    setProjBudgetHours(p.budgetHours ? String(p.budgetHours) : '');
    setIsProjectModalOpen(true);
  };

  // Save Project
  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !projName.trim()) return;

    try {
      const budget = projBudgetHours ? parseFloat(projBudgetHours) : undefined;
      if (editingProject) {
        await updateProject(editingProject.id, {
          name: projName.trim(),
          description: projDesc.trim(),
          color: projColor,
          status: projStatus,
          startDate: projStartDate || undefined,
          deadline: projDeadline || undefined,
          budgetHours: budget,
        });
        success('Project updated');
      } else {
        await createProject({
          userId: user.uid,
          name: projName.trim(),
          description: projDesc.trim(),
          color: projColor,
          status: projStatus,
          startDate: projStartDate || undefined,
          deadline: projDeadline || undefined,
          budgetHours: budget,
        });
        success('Project created');
      }
      setIsProjectModalOpen(false);
    } catch (err) {
      console.error(err);
      error('Failed to save project');
    }
  };

  // Delete Project
  const handleConfirmDeleteProject = async () => {
    if (!deletingProjectId) return;
    try {
      await deleteProject(deletingProjectId);
      success('Project deleted');
    } catch (err) {
      console.error(err);
      error('Failed to delete project');
    } finally {
      setDeletingProjectId(null);
    }
  };

  // Archive / Unarchive Project
  const handleToggleArchiveProject = async (p: Project) => {
    try {
      const nextStatus: ProjectStatus = p.status === 'archived' ? 'active' : 'archived';
      await updateProject(p.id, { status: nextStatus });
      success(nextStatus === 'archived' ? 'Project archived' : 'Project reactivated');
    } catch (err) {
      console.error(err);
      error('Failed to update project status');
    }
  };

  // Open Create Task
  const handleOpenCreateTask = (defaultProjId?: string) => {
    setEditingTask(null);
    setTaskName('');
    setTaskDesc('');
    setTaskProjectId(defaultProjId || (projects.length > 0 ? projects[0].id : ''));
    setTaskStatus('todo');
    setTaskEstimate('');
    setTaskDeadline('');
    setIsTaskModalOpen(true);
  };

  // Open Edit Task
  const handleOpenEditTask = (t: Task) => {
    setEditingTask(t);
    setTaskName(t.name);
    setTaskDesc(t.description || '');
    setTaskProjectId(t.projectId);
    setTaskStatus(t.status);
    setTaskEstimate(t.estimatedHours ? String(t.estimatedHours) : '');
    setTaskDeadline(t.deadline || '');
    setIsTaskModalOpen(true);
  };

  // Save Task
  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !taskName.trim() || !taskProjectId) return;

    try {
      const est = taskEstimate ? parseFloat(taskEstimate) : undefined;
      if (editingTask) {
        await updateTask(editingTask.id, {
          name: taskName.trim(),
          description: taskDesc.trim(),
          projectId: taskProjectId,
          status: taskStatus,
          estimatedHours: est,
          deadline: taskDeadline || undefined,
        });
        success('Task updated');
      } else {
        await createTask({
          userId: user.uid,
          name: taskName.trim(),
          description: taskDesc.trim(),
          projectId: taskProjectId,
          status: taskStatus,
          estimatedHours: est,
          deadline: taskDeadline || undefined,
        });
        success('Task created');
      }
      setIsTaskModalOpen(false);
    } catch (err) {
      console.error(err);
      error('Failed to save task');
    }
  };

  // Delete Task
  const handleConfirmDeleteTask = async () => {
    if (!deletingTaskId) return;
    try {
      await deleteTask(deletingTaskId);
      success('Task deleted');
    } catch (err) {
      console.error(err);
      error('Failed to delete task');
    } finally {
      setDeletingTaskId(null);
    }
  };

  // Quick toggle task status
  const handleQuickToggleTaskStatus = async (task: Task) => {
    const next: TaskStatus = task.status === 'completed' ? 'todo' : 'completed';
    try {
      await updateTask(task.id, { status: next });
    } catch (err) {
      console.error(err);
    }
  };

  // Filtered lists
  const filteredProjects = projects.filter((p) => {
    const matchesSearch =
      projectSearch === '' ||
      p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
      (p.description || '').toLowerCase().includes(projectSearch.toLowerCase());
    const matchesStatus = projectStatusFilter === 'all' || p.status === projectStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredTasks = tasks.filter((t) => {
    const matchesSearch =
      taskSearch === '' ||
      t.name.toLowerCase().includes(taskSearch.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(taskSearch.toLowerCase());
    const matchesProject = taskProjectFilter === 'all' || t.projectId === taskProjectFilter;
    const matchesStatus = taskStatusFilter === 'all' || t.status === taskStatusFilter;
    return matchesSearch && matchesProject && matchesStatus;
  });

  const projectMap = new Map(projects.map((p) => [p.id, p]));

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Tab Toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#21262d]">
        <div className="flex items-center gap-2 p-1 rounded-xl bg-[#0d1117] border border-[#21262d]">
          <button
            onClick={() => setActiveTab('projects')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'projects'
                ? 'bg-[#1c222c] text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderKanban className="w-3.5 h-3.5" />
            <span>Projects ({projects.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'tasks'
                ? 'bg-[#1c222c] text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ListTodo className="w-3.5 h-3.5" />
            <span>Tasks ({tasks.length})</span>
          </button>
        </div>

        <div>
          {activeTab === 'projects' ? (
            <button
              onClick={handleOpenCreateProject}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Project</span>
            </button>
          ) : (
            <button
              onClick={() => handleOpenCreateTask()}
              disabled={projects.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              <span>Create Task</span>
            </button>
          )}
        </div>
      </div>

      {/* ================= TAB 1: PROJECTS ================= */}
      {activeTab === 'projects' && (
        <div className="space-y-4">
          {/* Project Filters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#0d1117] border border-[#21262d] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <select
                value={projectStatusFilter}
                onChange={(e) => setProjectStatusFilter(e.target.value as any)}
                className="px-3 py-2 rounded-xl bg-[#0d1117] border border-[#21262d] text-xs text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <span className="text-xs text-slate-400">
              {filteredProjects.length} {filteredProjects.length === 1 ? 'project' : 'projects'}
            </span>
          </div>

          {/* Project Grid */}
          {filteredProjects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProjects.map((p) => {
                const trackedSec = projectTrackedSeconds.get(p.id) || 0;
                const trackedHours = Number((trackedSec / 3600).toFixed(1));
                const projTasks = tasks.filter((t) => t.projectId === p.id);
                const completedTasks = projTasks.filter((t) => t.status === 'completed').length;

                return (
                  <div
                    key={p.id}
                    className="p-5 rounded-2xl bg-[#0d1117] border border-[#21262d] hover:border-[#30363d] transition-all flex flex-col justify-between group"
                  >
                    <div>
                      {/* Top Bar with Color Pill and Actions */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: p.color }}
                          />
                          <span
                            className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-md ${
                              p.status === 'active'
                                ? 'bg-blue-950/40 text-blue-400 border border-blue-800/30'
                                : p.status === 'completed'
                                ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/30'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {p.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleToggleArchiveProject(p)}
                            title={p.status === 'archived' ? 'Unarchive' : 'Archive'}
                            className="p-1 rounded text-slate-400 hover:text-amber-400 hover:bg-[#161b22] transition-colors cursor-pointer"
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenEditProject(p)}
                            title="Edit project"
                            className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#161b22] transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeletingProjectId(p.id)}
                            title="Delete project"
                            className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-[#161b22] transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <h3 className="text-sm font-semibold text-white tracking-wide">{p.name}</h3>
                      {p.description && (
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                          {p.description}
                        </p>
                      )}
                    </div>

                    <div className="mt-5 pt-4 border-t border-[#1c222c] space-y-3">
                      {/* Stats */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-500" /> Tracked
                        </span>
                        <span className="font-mono font-semibold text-white">
                          {formatDurationHuman(trackedSec)}
                        </span>
                      </div>

                      {p.budgetHours && (
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-slate-400 flex items-center gap-1.5">
                              <Target className="w-3.5 h-3.5 text-slate-500" /> Budget
                            </span>
                            <span className="font-mono text-slate-300">
                              {trackedHours} / {p.budgetHours}h
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-[#161b22] overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                trackedHours > p.budgetHours ? 'bg-rose-500' : 'bg-blue-500'
                              }`}
                              style={{
                                width: `${Math.min(100, (trackedHours / p.budgetHours) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>Tasks: {completedTasks}/{projTasks.length} done</span>
                        {p.deadline && (
                          <span className="flex items-center gap-1 text-slate-400">
                            <Calendar className="w-3 h-3" /> Due {formatDate(new Date(p.deadline).getTime())}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={FolderKanban}
              title={projects.length === 0 ? 'No projects created yet' : 'No projects match filters'}
              description={
                projects.length === 0
                  ? 'Your database is empty. Create your first project (e.g., Pen Testing Labs, Cybersecurity CTFs, University Courses, Research).'
                  : 'Adjust your search query or status filter.'
              }
              actionLabel={projects.length === 0 ? 'Create First Project' : undefined}
              onAction={handleOpenCreateProject}
            />
          )}
        </div>
      )}

      {/* ================= TAB 2: TASKS ================= */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          {/* Task Filters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search tasks..."
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#0d1117] border border-[#21262d] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <select
                value={taskProjectFilter}
                onChange={(e) => setTaskProjectFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#0d1117] border border-[#21262d] text-xs text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">All Projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <select
                value={taskStatusFilter}
                onChange={(e) => setTaskStatusFilter(e.target.value as any)}
                className="px-3 py-2 rounded-xl bg-[#0d1117] border border-[#21262d] text-xs text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <span className="text-xs text-slate-400">
              {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
            </span>
          </div>

          {/* Task List */}
          {filteredTasks.length > 0 ? (
            <div className="rounded-2xl bg-[#0d1117] border border-[#21262d] divide-y divide-[#21262d] overflow-hidden">
              {filteredTasks.map((t) => {
                const proj = projectMap.get(t.projectId);
                const trackedSec = taskTrackedSeconds.get(t.id) || 0;

                return (
                  <div
                    key={t.id}
                    className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-[#121620] transition-colors group"
                  >
                    <div className="flex items-start md:items-center gap-3 flex-1 min-w-0">
                      <button
                        onClick={() => handleQuickToggleTaskStatus(t)}
                        title="Toggle completion"
                        className="mt-0.5 md:mt-0 text-slate-500 hover:text-emerald-400 cursor-pointer transition-colors"
                      >
                        {t.status === 'completed' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 fill-emerald-500/20" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-slate-500 hover:border-slate-300" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-xs font-semibold text-white ${
                              t.status === 'completed' ? 'line-through text-slate-500' : ''
                            }`}
                          >
                            {t.name}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              t.status === 'in_progress'
                                ? 'bg-blue-950/40 text-blue-400 border border-blue-800/30'
                                : t.status === 'completed'
                                ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {t.status.replace('_', ' ')}
                          </span>
                        </div>

                        {t.description && (
                          <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                            {t.description}
                          </p>
                        )}

                        <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1 flex-wrap">
                          {proj && (
                            <span className="flex items-center gap-1.5 text-slate-300">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: proj.color }}
                              />
                              {proj.name}
                            </span>
                          )}
                          {t.deadline && (
                            <>
                              <span>•</span>
                              <span>Due {t.deadline}</span>
                            </>
                          )}
                          {t.estimatedHours && (
                            <>
                              <span>•</span>
                              <span>Est: {t.estimatedHours}h</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-auto shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-[#1c222c]">
                      <span className="font-mono text-xs text-slate-300 bg-[#161b22] px-2.5 py-1 rounded-lg border border-[#262c36]">
                        {formatDurationHuman(trackedSec)}
                      </span>

                      <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleOpenEditTask(t)}
                          title="Edit task"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1c222c] transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingTaskId(t.id)}
                          title="Delete task"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-[#1c222c] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={ListTodo}
              title={tasks.length === 0 ? 'No tasks yet' : 'No tasks match filter'}
              description={
                tasks.length === 0
                  ? projects.length === 0
                    ? 'Create a project first before creating tasks'
                    : 'Add specific tasks to organize your workflows and track estimates'
                  : 'Try selecting a different project or status'
              }
              actionLabel={tasks.length === 0 && projects.length > 0 ? 'Add First Task' : undefined}
              onAction={() => handleOpenCreateTask()}
            />
          )}
        </div>
      )}

      {/* ================= MODAL: CREATE / EDIT PROJECT ================= */}
      <Modal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        title={editingProject ? 'Edit Project' : 'Create Project'}
        subtitle="Define project scope, color tag, and optional budget"
      >
        <form onSubmit={handleSaveProject} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Project Name</label>
            <input
              type="text"
              required
              placeholder="e.g. TryHackMe Offensive Security, Master Thesis..."
              value={projName}
              onChange={(e) => setProjName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Description (Optional)</label>
            <textarea
              rows={2}
              placeholder="What are the goals of this project?"
              value={projDesc}
              onChange={(e) => setProjDesc(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Accent Color</label>
            <div className="flex items-center gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setProjColor(c)}
                  className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                    projColor === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-[#0d1117]' : 'opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Status</label>
              <select
                value={projStatus}
                onChange={(e) => setProjStatus(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Budget (Hours)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                placeholder="e.g. 50"
                value={projBudgetHours}
                onChange={(e) => setProjBudgetHours(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Start Date</label>
              <input
                type="date"
                value={projStartDate}
                onChange={(e) => setProjStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Deadline (Optional)</label>
              <input
                type="date"
                value={projDeadline}
                onChange={(e) => setProjDeadline(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#21262d]">
            <button
              type="button"
              onClick={() => setIsProjectModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-[#161b22] border border-[#2b3341]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/20"
            >
              {editingProject ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ================= MODAL: CREATE / EDIT TASK ================= */}
      <Modal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        title={editingTask ? 'Edit Task' : 'Create Task'}
        subtitle="Associate task with a project and set duration estimates"
      >
        <form onSubmit={handleSaveTask} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Task Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Exploiting Buffer Overflow Lab 3"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Project</label>
            <select
              required
              value={taskProjectId}
              onChange={(e) => setTaskProjectId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Description (Optional)</label>
            <textarea
              rows={2}
              placeholder="Task details and deliverables"
              value={taskDesc}
              onChange={(e) => setTaskDesc(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Status</label>
              <select
                value={taskStatus}
                onChange={(e) => setTaskStatus(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Estimated Hours</label>
              <input
                type="number"
                step="0.25"
                min="0"
                placeholder="e.g. 2.5"
                value={taskEstimate}
                onChange={(e) => setTaskEstimate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Deadline (Optional)</label>
            <input
              type="date"
              value={taskDeadline}
              onChange={(e) => setTaskDeadline(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#21262d]">
            <button
              type="button"
              onClick={() => setIsTaskModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-[#161b22] border border-[#2b3341]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/20"
            >
              {editingTask ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Project Confirm */}
      <ConfirmDialog
        isOpen={Boolean(deletingProjectId)}
        onClose={() => setDeletingProjectId(null)}
        onConfirm={handleConfirmDeleteProject}
        title="Delete Project"
        message="Are you sure you want to delete this project? Existing logged time entries will remain in history as unassigned."
      />

      {/* Delete Task Confirm */}
      <ConfirmDialog
        isOpen={Boolean(deletingTaskId)}
        onClose={() => setDeletingTaskId(null)}
        onConfirm={handleConfirmDeleteTask}
        title="Delete Task"
        message="Are you sure you want to delete this task? Recorded time entries will remain preserved."
      />
    </div>
  );
};
