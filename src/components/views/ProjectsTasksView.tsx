import React, { useState, useMemo } from 'react';
import {
  FolderKanban,
  Plus,
  Edit2,
  Trash2,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Play,
  Search,
  Filter,
  AlertCircle,
  ChevronRight,
  CheckSquare,
  ListTodo,
  Layers,
  Folder,
  X,
  ExternalLink,
  CalendarCheck,
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
import {
  formatDurationHuman,
  formatDate,
  toISODateString,
  getProjectBreadcrumb,
} from '../../utils/formatters';
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
  const { projects, tasks, timeEntries, startTimer } = useTimeTracker();
  const { success, error } = useToast();

  // Navigation state: Level 1 (Projects), Level 2 (Subprojects), Level 3 (Tasks)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedSubprojectId, setSelectedSubprojectId] = useState<string | null>(null);

  // View mode switcher: Hierarchical 3-level flow vs Flat All Tasks view
  const [viewMode, setViewMode] = useState<'hierarchy' | 'all_tasks'>('hierarchy');

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('all');

  // Project Modal (Root project or Subproject)
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'project' | 'subproject'>('project');
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projName, setProjName] = useState('');
  const [projDesc, setProjDesc] = useState('');
  const [projColor, setProjColor] = useState(PRESET_COLORS[0]);
  const [projStatus, setProjStatus] = useState<ProjectStatus>('active');
  const [projParentId, setProjParentId] = useState<string>('');

  // Task Modal
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskName, setTaskName] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskSubprojectId, setTaskSubprojectId] = useState('');
  const [taskStatus, setTaskStatus] = useState<TaskStatus>('pending');
  const [taskScheduledDate, setTaskScheduledDate] = useState('');
  const [taskEstimate, setTaskEstimate] = useState('');

  // Delete dialogs
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  // Lookups & Mappings
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // Root Projects (parentId is null or empty)
  const rootProjects = useMemo(() => {
    return projects.filter((p) => !p.parentId);
  }, [projects]);

  // Subprojects grouped by Parent Project ID
  const subprojectsByParent = useMemo(() => {
    const map = new Map<string, Project[]>();
    projects.forEach((p) => {
      if (p.parentId) {
        const list = map.get(p.parentId) || [];
        list.push(p);
        map.set(p.parentId, list);
      }
    });
    return map;
  }, [projects]);

  // Tasks grouped by Project/Subproject ID
  const tasksByProject = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach((t) => {
      const list = map.get(t.projectId) || [];
      list.push(t);
      map.set(t.projectId, list);
    });
    return map;
  }, [tasks]);

  // Tracked duration per project / subproject
  const trackedSecondsByProject = useMemo(() => {
    const map = new Map<string, number>();
    timeEntries.forEach((entry) => {
      if (entry.projectId) {
        map.set(entry.projectId, (map.get(entry.projectId) || 0) + entry.duration);
      }
    });
    return map;
  }, [timeEntries]);

  // Currently selected parent project
  const currentParentProject = useMemo(() => {
    if (!selectedProjectId) return null;
    return projectMap.get(selectedProjectId) || null;
  }, [selectedProjectId, projectMap]);

  // Currently selected subproject
  const currentSubproject = useMemo(() => {
    if (!selectedSubprojectId) return null;
    return projectMap.get(selectedSubprojectId) || null;
  }, [selectedSubprojectId, projectMap]);

  // Subprojects belonging to currently selected project
  const currentSubprojects = useMemo(() => {
    if (!selectedProjectId) return [];
    return subprojectsByParent.get(selectedProjectId) || [];
  }, [selectedProjectId, subprojectsByParent]);

  // Tasks belonging to currently selected subproject
  const currentTasks = useMemo(() => {
    if (!selectedSubprojectId) return [];
    return tasksByProject.get(selectedSubprojectId) || [];
  }, [selectedSubprojectId, tasksByProject]);

  // Calculate task counts for a root project (including all its subprojects)
  const getRootProjectStats = (rootId: string) => {
    const subs = subprojectsByParent.get(rootId) || [];
    let totalTasks = 0;
    let completedTasks = 0;
    let totalTrackedSec = trackedSecondsByProject.get(rootId) || 0;

    // Direct tasks on root
    const rootDirectTasks = tasksByProject.get(rootId) || [];
    totalTasks += rootDirectTasks.length;
    completedTasks += rootDirectTasks.filter((t) => t.status === 'completed').length;

    // Subproject tasks
    subs.forEach((sub) => {
      const subTasks = tasksByProject.get(sub.id) || [];
      totalTasks += subTasks.length;
      completedTasks += subTasks.filter((t) => t.status === 'completed').length;
      totalTrackedSec += trackedSecondsByProject.get(sub.id) || 0;
    });

    return {
      subprojectsCount: subs.length,
      totalTasks,
      completedTasks,
      totalTrackedSec,
      progressPercent: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    };
  };

  // Calculate task counts for a subproject
  const getSubprojectStats = (subId: string) => {
    const subTasks = tasksByProject.get(subId) || [];
    const completedTasks = subTasks.filter((t) => t.status === 'completed').length;
    const pendingTasks = subTasks.filter((t) => t.status === 'pending' || t.status === 'todo').length;
    const inProgressTasks = subTasks.filter((t) => t.status === 'in_progress').length;
    const totalTrackedSec = trackedSecondsByProject.get(subId) || 0;

    return {
      totalTasks: subTasks.length,
      completedTasks,
      pendingTasks,
      inProgressTasks,
      totalTrackedSec,
      progressPercent: subTasks.length > 0 ? Math.round((completedTasks / subTasks.length) * 100) : 0,
    };
  };

  /* ------------------- HANDLERS: PROJECTS & SUBPROJECTS ------------------- */

  // Open Create Project (Level 1)
  const handleOpenCreateProject = () => {
    setModalType('project');
    setEditingProject(null);
    setProjName('');
    setProjDesc('');
    setProjColor(PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]);
    setProjStatus('active');
    setProjParentId('');
    setIsProjectModalOpen(true);
  };

  // Open Create Subproject (Level 2)
  const handleOpenCreateSubproject = (parentId: string) => {
    setModalType('subproject');
    setEditingProject(null);
    setProjName('');
    setProjDesc('');
    const parent = projectMap.get(parentId);
    setProjColor(parent ? parent.color : PRESET_COLORS[0]);
    setProjStatus('active');
    setProjParentId(parentId);
    setIsProjectModalOpen(true);
  };

  // Open Edit Project or Subproject
  const handleOpenEditProject = (p: Project) => {
    setModalType(p.parentId ? 'subproject' : 'project');
    setEditingProject(p);
    setProjName(p.name);
    setProjDesc(p.description || '');
    setProjColor(p.color);
    setProjStatus(p.status);
    setProjParentId(p.parentId || '');
    setIsProjectModalOpen(true);
  };

  // Save Project or Subproject
  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !projName.trim()) return;

    try {
      const cleanParentId = projParentId.trim() || null;
      const cleanDesc = projDesc.trim();

      if (editingProject) {
        if (cleanParentId === editingProject.id) {
          error('A project cannot be its own parent');
          return;
        }

        const updates: Partial<Project> = {
          name: projName.trim(),
          description: cleanDesc,
          color: projColor,
          status: projStatus,
        };
        if (cleanParentId) updates.parentId = cleanParentId;

        await updateProject(editingProject.id, updates);
        success(editingProject.parentId ? 'Subproject updated' : 'Project updated');
      } else {
        const newProjData: any = {
          userId: user.uid,
          name: projName.trim(),
          description: cleanDesc,
          color: projColor,
          status: projStatus,
          showOnCalendar: true,
        };
        if (cleanParentId) newProjData.parentId = cleanParentId;

        await createProject(newProjData);
        success(cleanParentId ? 'Subproject created' : 'Project created');
      }
      setIsProjectModalOpen(false);
    } catch (err) {
      console.error(err);
      error('Failed to save project');
    }
  };

  // Delete Project / Subproject
  const handleConfirmDeleteProject = async () => {
    if (!deletingProjectId) return;
    try {
      await deleteProject(deletingProjectId);
      success('Project removed');
      // If we were inside this project or subproject, navigate back
      if (selectedSubprojectId === deletingProjectId) {
        setSelectedSubprojectId(null);
      }
      if (selectedProjectId === deletingProjectId) {
        setSelectedProjectId(null);
        setSelectedSubprojectId(null);
      }
    } catch (err) {
      console.error(err);
      error('Failed to delete project');
    } finally {
      setDeletingProjectId(null);
    }
  };

  /* ------------------- HANDLERS: TASKS ------------------- */

  // Open Create Task
  const handleOpenCreateTask = (defaultSubprojId?: string) => {
    setEditingTask(null);
    setTaskName('');
    setTaskDesc('');
    setTaskSubprojectId(defaultSubprojId || selectedSubprojectId || (projects[0]?.id || ''));
    setTaskStatus('pending');
    setTaskScheduledDate(toISODateString(new Date()));
    setTaskEstimate('');
    setIsTaskModalOpen(true);
  };

  // Open Edit Task
  const handleOpenEditTask = (t: Task) => {
    setEditingTask(t);
    setTaskName(t.name);
    setTaskDesc(t.description || '');
    setTaskSubprojectId(t.projectId);
    setTaskStatus(t.status || 'pending');
    setTaskScheduledDate(t.scheduledDate || t.deadline || '');
    setTaskEstimate(t.estimatedHours ? String(t.estimatedHours) : '');
    setIsTaskModalOpen(true);
  };

  // Save Task
  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !taskName.trim() || !taskSubprojectId) return;

    try {
      const est = taskEstimate.trim() ? parseFloat(taskEstimate) : null;
      const cleanDate = taskScheduledDate.trim() || null;
      const cleanDesc = taskDesc.trim();

      if (editingTask) {
        const updates: Partial<Task> = {
          name: taskName.trim(),
          description: cleanDesc,
          projectId: taskSubprojectId,
          status: taskStatus,
        };
        if (cleanDate) {
          updates.scheduledDate = cleanDate;
          updates.deadline = cleanDate;
        } else {
          updates.scheduledDate = undefined;
          updates.deadline = undefined;
        }
        if (est !== null && !isNaN(est)) updates.estimatedHours = est;

        await updateTask(editingTask.id, updates);
        success('Task updated');
      } else {
        const newTaskData: any = {
          userId: user.uid,
          name: taskName.trim(),
          description: cleanDesc,
          projectId: taskSubprojectId,
          status: taskStatus,
        };
        if (cleanDate) {
          newTaskData.scheduledDate = cleanDate;
          newTaskData.deadline = cleanDate;
        }
        if (est !== null && !isNaN(est)) newTaskData.estimatedHours = est;

        await createTask(newTaskData);
        success('Task created and assigned');
      }
      setIsTaskModalOpen(false);
    } catch (err) {
      console.error(err);
      error('Failed to save task');
    }
  };

  // Quick Inline Status Change (Pending, In Progress, Completed)
  const handleTaskStatusChange = async (t: Task, newStatus: TaskStatus) => {
    try {
      await updateTask(t.id, { status: newStatus });
      if (newStatus === 'completed') {
        success(`Task marked as Completed (hidden from active calendar)`);
      } else {
        success(`Task status changed to ${newStatus === 'in_progress' ? 'In Progress' : 'Pending'}`);
      }
    } catch (err) {
      console.error(err);
      error('Failed to update task status');
    }
  };

  // Quick Inline Date Change for Calendar
  const handleTaskDateChange = async (t: Task, newDateStr: string) => {
    try {
      const cleanDate = newDateStr.trim() || undefined;
      await updateTask(t.id, {
        scheduledDate: cleanDate,
        deadline: cleanDate,
      });
      if (cleanDate) {
        success(`Task scheduled on ${cleanDate}`);
      } else {
        success(`Task removed from calendar`);
      }
    } catch (err) {
      console.error(err);
      error('Failed to update task date');
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

  // Start Time Tracker on this Task
  const handleStartTimerForTask = async (t: Task) => {
    try {
      await startTimer({
        projectId: t.projectId,
        taskId: t.id,
        description: t.name,
      });
      success(`Started timer for "${t.name}"`);
    } catch (err) {
      console.error(err);
      error('Failed to start timer');
    }
  };

  /* ------------------- FILTERED TASKS ------------------- */
  const filteredCurrentTasks = useMemo(() => {
    return currentTasks.filter((t) => {
      if (searchQuery.trim() && !t.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (statusFilter !== 'all') {
        if (statusFilter === 'pending' && t.status !== 'pending' && t.status !== 'todo') return false;
        if (statusFilter === 'in_progress' && t.status !== 'in_progress') return false;
        if (statusFilter === 'completed' && t.status !== 'completed') return false;
      }
      return true;
    });
  }, [currentTasks, searchQuery, statusFilter]);

  // All Tasks across all projects (for flat view)
  const allTasksFiltered = useMemo(() => {
    return tasks.filter((t) => {
      if (searchQuery.trim() && !t.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (statusFilter !== 'all') {
        if (statusFilter === 'pending' && t.status !== 'pending' && t.status !== 'todo') return false;
        if (statusFilter === 'in_progress' && t.status !== 'in_progress') return false;
        if (statusFilter === 'completed' && t.status !== 'completed') return false;
      }
      return true;
    });
  }, [tasks, searchQuery, statusFilter]);

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* ================= TOP NAVIGATION / BREADCRUMB BAR ================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#21262d]">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Back button when drilled down */}
          {selectedSubprojectId ? (
            <button
              onClick={() => setSelectedSubprojectId(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#161b22] hover:bg-[#21262d] text-slate-300 hover:text-white text-xs font-medium border border-[#2b3341] transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-blue-400" />
              <span>Back to Subprojects</span>
            </button>
          ) : selectedProjectId ? (
            <button
              onClick={() => setSelectedProjectId(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#161b22] hover:bg-[#21262d] text-slate-300 hover:text-white text-xs font-medium border border-[#2b3341] transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-blue-400" />
              <span>Back to Projects</span>
            </button>
          ) : null}

          {/* Breadcrumb Path */}
          <nav className="flex items-center gap-2 text-xs text-slate-400 font-medium">
            <button
              onClick={() => {
                setSelectedProjectId(null);
                setSelectedSubprojectId(null);
              }}
              className={`hover:text-blue-400 flex items-center gap-1 transition-colors ${
                !selectedProjectId ? 'text-white font-bold' : 'text-slate-400'
              }`}
            >
              <FolderKanban className="w-4 h-4 text-blue-400" />
              <span>Projects</span>
            </button>

            {currentParentProject && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                <button
                  onClick={() => setSelectedSubprojectId(null)}
                  className={`flex items-center gap-1.5 hover:text-blue-400 transition-colors ${
                    !selectedSubprojectId ? 'text-white font-bold' : 'text-slate-400'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: currentParentProject.color }}
                  />
                  <span>{currentParentProject.name}</span>
                </button>
              </>
            )}

            {currentSubproject && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                <span className="flex items-center gap-1.5 text-white font-bold">
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                  <span>{currentSubproject.name}</span>
                </span>
              </>
            )}
          </nav>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#0d1117] border border-[#21262d] p-1 rounded-xl">
            <button
              onClick={() => setViewMode('hierarchy')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'hierarchy'
                  ? 'bg-[#1c222c] text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Hierarchy Explorer
            </button>
            <button
              onClick={() => setViewMode('all_tasks')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'all_tasks'
                  ? 'bg-[#1c222c] text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Tasks Overview ({tasks.length})
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. HIERARCHY EXPLORER MODE                                               */}
      {/* ========================================================================= */}
      {viewMode === 'hierarchy' && (
        <>
          {/* ---------------- LEVEL 1: ROOT PROJECTS CARDS ---------------- */}
          {!selectedProjectId && (
            <div className="space-y-6">
              {/* Header & Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Projects</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Manage high-level project workspaces. Click on any project to view and organize its subprojects.
                  </p>
                </div>
                <button
                  onClick={handleOpenCreateProject}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer self-start sm:self-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Project</span>
                </button>
              </div>

              {/* Projects Grid */}
              {rootProjects.length === 0 ? (
                <EmptyState
                  title="No projects yet"
                  description="Create your first project (e.g. Test 1, Cybersecurity Labs, CTF Challenges) to start organizing your subprojects and tasks."
                  actionLabel="Create Project"
                  onAction={handleOpenCreateProject}
                  icon={FolderKanban}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {rootProjects.map((project) => {
                    const stats = getRootProjectStats(project.id);
                    return (
                      <div
                        key={project.id}
                        onClick={() => setSelectedProjectId(project.id)}
                        className="group relative bg-[#0d1117] hover:bg-[#121620] border border-[#21262d] hover:border-[#30363d] rounded-2xl p-5 transition-all duration-200 cursor-pointer flex flex-col justify-between shadow-sm hover:shadow-lg"
                      >
                        {/* Top Accent Stripe */}
                        <div
                          className="absolute top-0 left-5 right-5 h-1 rounded-b-md"
                          style={{ backgroundColor: project.color }}
                        />

                        <div>
                          {/* Card Header */}
                          <div className="flex items-start justify-between gap-3 pt-2">
                            <div className="flex items-center gap-2.5">
                              <span
                                className="w-3.5 h-3.5 rounded-lg shrink-0 shadow-sm"
                                style={{ backgroundColor: project.color }}
                              />
                              <h3 className="text-base font-bold text-white group-hover:text-blue-400 transition-colors">
                                {project.name}
                              </h3>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenEditProject(project);
                                }}
                                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#1f242c]"
                                title="Edit Project"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingProjectId(project.id);
                                }}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-[#1f242c]"
                                title="Delete Project"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {project.description && (
                            <p className="text-xs text-slate-400 mt-2 line-clamp-2">
                              {project.description}
                            </p>
                          )}

                          {/* Stats Badges */}
                          <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-[#1e232d]">
                            <div className="p-2 rounded-xl bg-[#161b22] border border-[#21262d]">
                              <span className="text-[10px] text-slate-400 font-medium block">Subprojects</span>
                              <span className="text-sm font-bold text-white">{stats.subprojectsCount}</span>
                            </div>
                            <div className="p-2 rounded-xl bg-[#161b22] border border-[#21262d]">
                              <span className="text-[10px] text-slate-400 font-medium block">Total Tasks</span>
                              <span className="text-sm font-bold text-white">{stats.totalTasks}</span>
                            </div>
                          </div>

                          {/* Progress Bar */}
                          {stats.totalTasks > 0 && (
                            <div className="mt-3">
                              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                                <span>Completed Tasks</span>
                                <span className="font-mono text-slate-300">
                                  {stats.completedTasks}/{stats.totalTasks} ({stats.progressPercent}%)
                                </span>
                              </div>
                              <div className="w-full h-1.5 bg-[#161b22] rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-300"
                                  style={{
                                    width: `${stats.progressPercent}%`,
                                    backgroundColor: project.color,
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Card Footer */}
                        <div className="flex items-center justify-between text-xs text-slate-400 mt-4 pt-3 border-t border-[#1e232d]">
                          <span className="flex items-center gap-1 font-mono text-[11px]">
                            <Clock className="w-3 h-3 text-slate-500" />
                            {formatDurationHuman(stats.totalTrackedSec)}
                          </span>
                          <span className="flex items-center gap-1 text-blue-400 font-semibold group-hover:translate-x-0.5 transition-transform text-xs">
                            <span>Open Subprojects</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ---------------- LEVEL 2: SUBPROJECTS CARDS ---------------- */}
          {selectedProjectId && !selectedSubprojectId && currentParentProject && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0d1117] border border-[#21262d] rounded-2xl p-5">
                <div className="flex items-center gap-3">
                  <span
                    className="w-4 h-4 rounded-lg shrink-0 shadow-sm"
                    style={{ backgroundColor: currentParentProject.color }}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold text-white tracking-tight">
                        {currentParentProject.name}
                      </h2>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-blue-950/40 text-blue-400 border border-blue-800/40">
                        Project
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {currentParentProject.description || 'Subprojects and work streams within this project. Click any subproject to view and manage its tasks.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenCreateSubproject(currentParentProject.id)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>New Subproject</span>
                  </button>
                </div>
              </div>

              {/* Subprojects Grid */}
              {currentSubprojects.length === 0 ? (
                <EmptyState
                  title={`No subprojects in ${currentParentProject.name}`}
                  description="Create your first subproject (e.g. Network Configuration, Linux Fundamentals, Documentation) to group tasks."
                  actionLabel="Add Subproject"
                  onAction={() => handleOpenCreateSubproject(currentParentProject.id)}
                  icon={Layers}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {currentSubprojects.map((subproject) => {
                    const stats = getSubprojectStats(subproject.id);
                    return (
                      <div
                        key={subproject.id}
                        onClick={() => setSelectedSubprojectId(subproject.id)}
                        className="group bg-[#0d1117] hover:bg-[#121620] border border-[#21262d] hover:border-[#30363d] rounded-2xl p-5 transition-all duration-200 cursor-pointer flex flex-col justify-between shadow-sm hover:shadow-lg"
                      >
                        <div>
                          {/* Card Header */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              <Layers className="w-4 h-4 text-purple-400 shrink-0" />
                              <h3 className="text-base font-bold text-white group-hover:text-purple-300 transition-colors">
                                {subproject.name}
                              </h3>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenEditProject(subproject);
                                }}
                                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#1f242c]"
                                title="Edit Subproject"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingProjectId(subproject.id);
                                }}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-[#1f242c]"
                                title="Delete Subproject"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {subproject.description && (
                            <p className="text-xs text-slate-400 mt-2 line-clamp-2">
                              {subproject.description}
                            </p>
                          )}

                          {/* Task Metrics */}
                          <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-[#1e232d] text-center">
                            <div className="p-2 rounded-xl bg-[#161b22] border border-[#21262d]">
                              <span className="text-[10px] text-amber-400 font-medium block">Pending</span>
                              <span className="text-xs font-bold text-white">{stats.pendingTasks}</span>
                            </div>
                            <div className="p-2 rounded-xl bg-[#161b22] border border-[#21262d]">
                              <span className="text-[10px] text-blue-400 font-medium block">In Progress</span>
                              <span className="text-xs font-bold text-white">{stats.inProgressTasks}</span>
                            </div>
                            <div className="p-2 rounded-xl bg-[#161b22] border border-[#21262d]">
                              <span className="text-[10px] text-emerald-400 font-medium block">Completed</span>
                              <span className="text-xs font-bold text-white">{stats.completedTasks}</span>
                            </div>
                          </div>

                          {/* Progress Bar */}
                          {stats.totalTasks > 0 && (
                            <div className="mt-3">
                              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                                <span>Completion</span>
                                <span className="font-mono text-slate-300">
                                  {stats.completedTasks}/{stats.totalTasks} ({stats.progressPercent}%)
                                </span>
                              </div>
                              <div className="w-full h-1.5 bg-[#161b22] rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-purple-500 rounded-full transition-all duration-300"
                                  style={{ width: `${stats.progressPercent}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Card Footer */}
                        <div className="flex items-center justify-between text-xs text-slate-400 mt-4 pt-3 border-t border-[#1e232d]">
                          <span className="text-xs text-slate-400">
                            {stats.totalTasks} {stats.totalTasks === 1 ? 'Task' : 'Tasks'}
                          </span>
                          <span className="flex items-center gap-1 text-purple-400 font-semibold group-hover:translate-x-0.5 transition-transform text-xs">
                            <span>View Tasks</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ---------------- LEVEL 3: TASKS IN SUBPROJECT ---------------- */}
          {selectedProjectId && selectedSubprojectId && currentParentProject && currentSubproject && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0d1117] border border-[#21262d] rounded-2xl p-5">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-white tracking-tight">
                      {currentSubproject.name}
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-purple-950/40 text-purple-400 border border-purple-800/40">
                      Subproject
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Part of <strong className="text-white">{currentParentProject.name}</strong>. Assign specific dates to tasks to display them automatically on Kronos Calendar.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenCreateTask(currentSubproject.id)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>New Task</span>
                  </button>
                </div>
              </div>

              {/* Status Filters & Search Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Status Filter Tabs */}
                <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0d1117] border border-[#21262d]">
                  {[
                    { id: 'all', label: `All (${currentTasks.length})` },
                    {
                      id: 'pending',
                      label: `Pending (${currentTasks.filter((t) => t.status === 'pending' || t.status === 'todo').length})`,
                    },
                    {
                      id: 'in_progress',
                      label: `In Progress (${currentTasks.filter((t) => t.status === 'in_progress').length})`,
                    },
                    {
                      id: 'completed',
                      label: `Completed (${currentTasks.filter((t) => t.status === 'completed').length})`,
                    },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setStatusFilter(tab.id as any)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        statusFilter === tab.id
                          ? 'bg-[#1c222c] text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search tasks..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 rounded-xl bg-[#0d1117] border border-[#21262d] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-full sm:w-56"
                  />
                </div>
              </div>

              {/* Tasks List */}
              {filteredCurrentTasks.length === 0 ? (
                <EmptyState
                  title="No tasks match filter"
                  description="Create a task (e.g. Task 1, Task 2) and pick a day (e.g. November 3) to view it directly in the Kronos Calendar."
                  actionLabel="Add Task"
                  onAction={() => handleOpenCreateTask(currentSubproject.id)}
                  icon={ListTodo}
                />
              ) : (
                <div className="space-y-3">
                  {filteredCurrentTasks.map((task) => {
                    const isCompleted = task.status === 'completed';
                    const isInProgress = task.status === 'in_progress';
                    const isPending = task.status === 'pending' || task.status === 'todo';
                    const activeDate = task.scheduledDate || task.deadline || '';

                    return (
                      <div
                        key={task.id}
                        className={`bg-[#0d1117] border rounded-2xl p-4 transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                          isCompleted
                            ? 'border-[#21262d] bg-[#090c10]/70 opacity-75'
                            : isInProgress
                            ? 'border-blue-500/40 shadow-sm shadow-blue-500/5'
                            : 'border-[#21262d] hover:border-[#30363d]'
                        }`}
                      >
                        {/* Task Status & Title */}
                        <div className="flex items-start gap-3.5 flex-1">
                          {/* Quick Status Button */}
                          <button
                            onClick={() => {
                              // Toggle to next status or completed
                              const nextStatus: TaskStatus = isCompleted
                                ? 'pending'
                                : isInProgress
                                ? 'completed'
                                : 'in_progress';
                              handleTaskStatusChange(task, nextStatus);
                            }}
                            className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition-all cursor-pointer ${
                              isCompleted
                                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                                : isInProgress
                                ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                                : 'bg-[#161b22] border-[#2b3341] text-amber-400 hover:border-amber-400/50'
                            }`}
                            title={`Status: ${task.status}. Click to cycle.`}
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="w-4 h-4" />
                            ) : isInProgress ? (
                              <Clock className="w-3.5 h-3.5 animate-pulse" />
                            ) : (
                              <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                            )}
                          </button>

                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4
                                className={`text-sm font-semibold transition-colors ${
                                  isCompleted ? 'text-slate-400 line-through' : 'text-white'
                                }`}
                              >
                                {task.name}
                              </h4>

                              {/* Status Badge */}
                              <select
                                value={task.status}
                                onChange={(e) => handleTaskStatusChange(task, e.target.value as TaskStatus)}
                                className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border cursor-pointer focus:outline-none ${
                                  isCompleted
                                    ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40'
                                    : isInProgress
                                    ? 'bg-blue-950/40 text-blue-400 border-blue-800/40'
                                    : 'bg-amber-950/40 text-amber-400 border-amber-800/40'
                                }`}
                              >
                                <option value="pending" className="bg-[#161b22] text-white">Pending</option>
                                <option value="in_progress" className="bg-[#161b22] text-white">In Progress</option>
                                <option value="completed" className="bg-[#161b22] text-white">Completed</option>
                              </select>

                              {isCompleted && (
                                <span className="text-[10px] text-slate-500 italic">
                                  (Saved in project • Hidden from active calendar)
                                </span>
                              )}
                            </div>

                            {task.description && (
                              <p className="text-xs text-slate-400 mt-1 line-clamp-1">
                                {task.description}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Calendar Day Assignment & Actions */}
                        <div className="flex items-center gap-3 flex-wrap justify-between md:justify-end">
                          {/* Calendar Assignment Control */}
                          <div className="flex items-center gap-2 bg-[#161b22] border border-[#2b3341] rounded-xl px-2.5 py-1.5">
                            <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <div className="flex flex-col">
                              <span className="text-[9px] uppercase font-semibold text-slate-400 tracking-wider">
                                Calendar Day
                              </span>
                              <input
                                type="date"
                                value={activeDate}
                                onChange={(e) => handleTaskDateChange(task, e.target.value)}
                                className="bg-transparent text-xs text-white font-mono focus:outline-none cursor-pointer"
                                title="Pick which day this task appears on the Kronos Calendar"
                              />
                            </div>
                            {activeDate && (
                              <button
                                onClick={() => handleTaskDateChange(task, '')}
                                className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#21262d] ml-1"
                                title="Clear from calendar"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-1">
                            {/* Start Timer */}
                            <button
                              onClick={() => handleStartTimerForTask(task)}
                              className="p-2 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 hover:border-blue-500/40 transition-colors cursor-pointer"
                              title="Start tracking time on this task"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                            </button>

                            {/* Edit */}
                            <button
                              onClick={() => handleOpenEditTask(task)}
                              className="p-2 rounded-xl bg-[#161b22] hover:bg-[#21262d] text-slate-400 hover:text-white border border-[#21262d] transition-colors cursor-pointer"
                              title="Edit Task"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete */}
                            <button
                              onClick={() => setDeletingTaskId(task.id)}
                              className="p-2 rounded-xl bg-[#161b22] hover:bg-[#21262d] text-slate-400 hover:text-rose-400 border border-[#21262d] transition-colors cursor-pointer"
                              title="Delete Task"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* 2. FLAT ALL TASKS OVERVIEW                                                */}
      {/* ========================================================================= */}
      {viewMode === 'all_tasks' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">All Tasks Overview</h2>
              <p className="text-xs text-slate-400 mt-1">
                Unified view of all tasks across all projects and subprojects. Assign calendar days easily.
              </p>
            </div>
            <button
              onClick={() => handleOpenCreateTask()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>New Task</span>
            </button>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0d1117] border border-[#21262d]">
              {[
                { id: 'all', label: `All (${tasks.length})` },
                {
                  id: 'pending',
                  label: `Pending (${tasks.filter((t) => t.status === 'pending' || t.status === 'todo').length})`,
                },
                {
                  id: 'in_progress',
                  label: `In Progress (${tasks.filter((t) => t.status === 'in_progress').length})`,
                },
                {
                  id: 'completed',
                  label: `Completed (${tasks.filter((t) => t.status === 'completed').length})`,
                },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id as any)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-[#1c222c] text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search all tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl bg-[#0d1117] border border-[#21262d] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-full sm:w-56"
              />
            </div>
          </div>

          {allTasksFiltered.length === 0 ? (
            <EmptyState
              title="No tasks found"
              description="Create a task under any subproject to view it here."
              actionLabel="Add Task"
              onAction={() => handleOpenCreateTask()}
              icon={ListTodo}
            />
          ) : (
            <div className="space-y-3">
              {allTasksFiltered.map((task) => {
                const isCompleted = task.status === 'completed';
                const isInProgress = task.status === 'in_progress';
                const activeDate = task.scheduledDate || task.deadline || '';
                const proj = projectMap.get(task.projectId);
                const parentProj = proj?.parentId ? projectMap.get(proj.parentId) : null;

                return (
                  <div
                    key={task.id}
                    className={`bg-[#0d1117] border rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                      isCompleted ? 'border-[#21262d] opacity-75' : 'border-[#21262d]'
                    }`}
                  >
                    <div className="flex items-start gap-3.5 flex-1">
                      <button
                        onClick={() => {
                          const nextStatus: TaskStatus = isCompleted
                            ? 'pending'
                            : isInProgress
                            ? 'completed'
                            : 'in_progress';
                          handleTaskStatusChange(task, nextStatus);
                        }}
                        className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border cursor-pointer ${
                          isCompleted
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                            : isInProgress
                            ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                            : 'bg-[#161b22] border-[#2b3341] text-amber-400'
                        }`}
                      >
                        {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />}
                      </button>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className={`text-sm font-semibold ${isCompleted ? 'line-through text-slate-400' : 'text-white'}`}>
                            {task.name}
                          </h4>
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-md font-medium border"
                            style={{
                              backgroundColor: `${proj?.color || '#388bfd'}15`,
                              borderColor: `${proj?.color || '#388bfd'}40`,
                              color: proj?.color || '#388bfd',
                            }}
                          >
                            {parentProj ? `${parentProj.name} > ${proj?.name}` : proj?.name || 'Project'}
                          </span>
                        </div>
                        {task.description && (
                          <p className="text-xs text-slate-400 mt-1 line-clamp-1">{task.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap justify-between md:justify-end">
                      <div className="flex items-center gap-2 bg-[#161b22] border border-[#2b3341] rounded-xl px-2.5 py-1.5">
                        <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <div className="flex flex-col">
                          <span className="text-[9px] uppercase font-semibold text-slate-400 tracking-wider">
                            Calendar Day
                          </span>
                          <input
                            type="date"
                            value={activeDate}
                            onChange={(e) => handleTaskDateChange(task, e.target.value)}
                            className="bg-transparent text-xs text-white font-mono focus:outline-none cursor-pointer"
                          />
                        </div>
                        {activeDate && (
                          <button
                            onClick={() => handleTaskDateChange(task, '')}
                            className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#21262d] ml-1"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleStartTimerForTask(task)}
                          className="p-2 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20"
                          title="Start timer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>
                        <button
                          onClick={() => handleOpenEditTask(task)}
                          className="p-2 rounded-xl bg-[#161b22] hover:bg-[#21262d] text-slate-400 hover:text-white border border-[#21262d]"
                          title="Edit Task"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingTaskId(task.id)}
                          className="p-2 rounded-xl bg-[#161b22] hover:bg-[#21262d] text-slate-400 hover:text-rose-400 border border-[#21262d]"
                          title="Delete Task"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE / EDIT PROJECT OR SUBPROJECT                                */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        title={
          editingProject
            ? editingProject.parentId
              ? 'Edit Subproject'
              : 'Edit Project'
            : modalType === 'subproject'
            ? 'New Subproject'
            : 'New Project'
        }
        subtitle={
          modalType === 'subproject' && projParentId
            ? `Belongs to: ${projectMap.get(projParentId)?.name || 'Project'}`
            : 'Organize your work into structured categories'
        }
      >
        <form onSubmit={handleSaveProject} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {modalType === 'subproject' ? 'Subproject Name' : 'Project Name'}
            </label>
            <input
              type="text"
              required
              placeholder={
                modalType === 'subproject'
                  ? 'e.g. Network Configuration, Linux Fundamentals'
                  : 'e.g. Test 1, Cybersecurity Labs'
              }
              value={projName}
              onChange={(e) => setProjName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Description (Optional)</label>
            <textarea
              rows={2}
              placeholder="Brief description or goals"
              value={projDesc}
              onChange={(e) => setProjDesc(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {/* Color Picker */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Accent Color</label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setProjColor(c)}
                  className={`w-7 h-7 rounded-xl transition-all cursor-pointer ${
                    projColor === c ? 'ring-2 ring-white scale-110 shadow-md' : 'opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#21262d]">
            <button
              type="button"
              onClick={() => setIsProjectModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:text-white bg-[#161b22] border border-[#2b3341]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/20 cursor-pointer"
            >
              {editingProject ? 'Save Changes' : modalType === 'subproject' ? 'Create Subproject' : 'Create Project'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: CREATE / EDIT TASK                                                 */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        title={editingTask ? 'Edit Task' : 'New Task'}
        subtitle="Tasks can be assigned to a specific day to appear directly on Kronos Calendar"
      >
        <form onSubmit={handleSaveTask} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Task Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Configure Firewall Rules, Task 1"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Subproject / Project</label>
            <select
              required
              value={taskSubprojectId}
              onChange={(e) => setTaskSubprojectId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none cursor-pointer"
            >
              <option value="">Select Subproject...</option>
              {projects.map((p) => {
                const parent = p.parentId ? projectMap.get(p.parentId) : null;
                return (
                  <option key={p.id} value={p.id}>
                    {parent ? `${parent.name} > ${p.name}` : p.name}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Status</label>
              <select
                value={taskStatus}
                onChange={(e) => setTaskStatus(e.target.value as TaskStatus)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none cursor-pointer"
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Assign to Calendar Day
              </label>
              <input
                type="date"
                value={taskScheduledDate}
                onChange={(e) => setTaskScheduledDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Description (Optional)</label>
            <textarea
              rows={2}
              placeholder="Notes, steps, or acceptance criteria"
              value={taskDesc}
              onChange={(e) => setTaskDesc(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#21262d]">
            <button
              type="button"
              onClick={() => setIsTaskModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:text-white bg-[#161b22] border border-[#2b3341]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/20 cursor-pointer"
            >
              {editingTask ? 'Save Task' : 'Create Task'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* CONFIRM DELETE DIALOGS                                                    */}
      {/* ========================================================================= */}
      <ConfirmDialog
        isOpen={Boolean(deletingProjectId)}
        title="Delete Project or Subproject?"
        message="Are you sure you want to delete this project? Any tasks associated with it will remain accessible in reports or can be reassigned."
        confirmLabel="Delete"
        isDestructive
        onConfirm={handleConfirmDeleteProject}
        onCancel={() => setDeletingProjectId(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(deletingTaskId)}
        title="Delete Task?"
        message="Are you sure you want to delete this task? It will also be removed from any assigned day in Kronos Calendar."
        confirmLabel="Delete"
        isDestructive
        onConfirm={handleConfirmDeleteTask}
        onCancel={() => setDeletingTaskId(null)}
      />
    </div>
  );
};
