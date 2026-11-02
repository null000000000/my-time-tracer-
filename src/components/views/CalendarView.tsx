import React, { useState, useMemo, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  Trash2,
  Edit2,
  Tag,
  Plus,
  CheckCircle2,
  Flag,
  Target,
  Sparkles,
  Layers,
  Eye,
  EyeOff,
  AlertCircle,
  Play,
  CheckSquare,
  ListTodo,
  X,
  CalendarCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTimeTracker } from '../../context/TimeTrackerContext';
import { TimeEntry, Project, CalendarEvent, CalendarEventType, Task, TaskStatus } from '../../types';
import {
  formatDurationHuman,
  formatTime,
  formatDate,
  toISODateString,
  getProjectBreadcrumb,
  getProjectIndentedOptions,
} from '../../utils/formatters';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import {
  updateTimeEntry,
  deleteTimeEntry,
  createTimeEntry,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  subscribeCalendarEvents,
  updateProject,
  createTask,
  updateTask,
  deleteTask,
} from '../../services/db';
import { useToast } from '../common/Toast';

type CalendarViewMode = 'month' | 'week' | 'day';

interface ProjectMilestone {
  id: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  type: 'start' | 'deadline';
  dateStr: string;
  description?: string;
}

export const CalendarView: React.FC = () => {
  const { user } = useAuth();
  const { timeEntries, projects, tasks, startTimer } = useTimeTracker();
  const { success, error } = useToast();

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [showProjectMilestones, setShowProjectMilestones] = useState<boolean>(true);
  const [showCompletedTasksOnCalendar, setShowCompletedTasksOnCalendar] = useState<boolean>(false);

  // Custom Calendar Events from Firestore
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);

  // Add Item to Date Modal (triggered by clicking any day!)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [targetDateStr, setTargetDateStr] = useState<string>(toISODateString(new Date()));
  const [addMode, setAddMode] = useState<'schedule_task' | 'custom_event' | 'time_entry'>('schedule_task');

  // Form fields for Scheduling Task on Date
  const [taskScheduleSubMode, setTaskScheduleSubMode] = useState<'existing' | 'new'>('existing');
  const [selectedExistingTaskId, setSelectedExistingTaskId] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskSubprojectId, setNewTaskSubprojectId] = useState('');

  // Form fields for Custom Calendar Event
  const [eventTitle, setEventTitle] = useState('');
  const [eventDesc, setEventDesc] = useState('');
  const [eventStartTime, setEventStartTime] = useState('10:00');
  const [eventEndTime, setEventEndTime] = useState('11:30');
  const [eventType, setEventType] = useState<CalendarEventType>('study');
  const [eventProjectId, setEventProjectId] = useState('');

  // Form fields for Manual Time Entry on Date
  const [entryDesc, setEntryDesc] = useState('');
  const [entryProjectId, setEntryProjectId] = useState('');
  const [entryTaskId, setEntryTaskId] = useState('');
  const [entryStartTime, setEntryStartTime] = useState('09:00');
  const [entryEndTime, setEntryEndTime] = useState('10:30');

  // Inspection Modals
  const [inspectedTask, setInspectedTask] = useState<Task | null>(null);
  const [inspectedTimeEntry, setInspectedTimeEntry] = useState<TimeEntry | null>(null);
  const [inspectedEvent, setInspectedEvent] = useState<CalendarEvent | null>(null);
  const [inspectedMilestone, setInspectedMilestone] = useState<ProjectMilestone | null>(null);

  const [isEditingEvent, setIsEditingEvent] = useState(false);
  const [editEventTitle, setEditEventTitle] = useState('');
  const [editEventDesc, setEditEventDesc] = useState('');
  const [editEventStartTime, setEditEventStartTime] = useState('');
  const [editEventEndTime, setEditEventEndTime] = useState('');
  const [editEventProjectId, setEditEventProjectId] = useState('');
  const [editEventType, setEditEventType] = useState<CalendarEventType>('event');

  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [deletingTimeEntryId, setDeletingTimeEntryId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  // Subscribe to calendar events
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeCalendarEvents(user.uid, (evts) => {
      setCalendarEvents(evts);
    });
    return () => unsub();
  }, [user]);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const projectOptions = useMemo(() => getProjectIndentedOptions(projects), [projects]);

  // Navigate dates
  const handlePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === 'month') d.setMonth(d.getMonth() - 1);
    else if (viewMode === 'week') d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (viewMode === 'month') d.setMonth(d.getMonth() + 1);
    else if (viewMode === 'week') d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Open Add modal on clicking a specific day
  const handleDayClick = (dateStr: string) => {
    setTargetDateStr(dateStr);
    setAddMode('schedule_task');
    setTaskScheduleSubMode('existing');
    setSelectedExistingTaskId('');
    setNewTaskTitle('');
    setNewTaskSubprojectId(selectedProjectId !== 'all' && selectedProjectId !== 'none' ? selectedProjectId : (projects[0]?.id || ''));
    setEventTitle('');
    setEventDesc('');
    setEventProjectId(selectedProjectId !== 'all' && selectedProjectId !== 'none' ? selectedProjectId : '');
    setEntryDesc('');
    setEntryProjectId(selectedProjectId !== 'all' && selectedProjectId !== 'none' ? selectedProjectId : '');
    setEntryTaskId('');
    setIsAddModalOpen(true);
  };

  // Save new item to the calendar
  const handleSaveNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      if (addMode === 'schedule_task') {
        if (taskScheduleSubMode === 'existing') {
          if (!selectedExistingTaskId) {
            error('Please select a task to schedule');
            return;
          }
          await updateTask(selectedExistingTaskId, {
            scheduledDate: targetDateStr,
            deadline: targetDateStr,
          });
          success(`Task scheduled on ${targetDateStr}`);
        } else {
          if (!newTaskTitle.trim() || !newTaskSubprojectId) {
            error('Task name and subproject are required');
            return;
          }
          await createTask({
            userId: user.uid,
            name: newTaskTitle.trim(),
            projectId: newTaskSubprojectId,
            status: 'pending',
            scheduledDate: targetDateStr,
            deadline: targetDateStr,
          });
          success(`New task created and scheduled on ${targetDateStr}`);
        }
      } else if (addMode === 'custom_event') {
        if (!eventTitle.trim()) return;
        const proj = eventProjectId ? projectMap.get(eventProjectId) : null;
        const calData: any = {
          userId: user.uid,
          title: eventTitle.trim(),
          date: targetDateStr,
          color: proj ? proj.color : '#388bfd',
          type: eventType,
          isCompleted: false,
        };
        if (eventDesc.trim()) calData.description = eventDesc.trim();
        if (eventStartTime.trim()) calData.startTime = eventStartTime.trim();
        if (eventEndTime.trim()) calData.endTime = eventEndTime.trim();
        if (eventProjectId.trim()) calData.projectId = eventProjectId.trim();

        await createCalendarEvent(calData);
        success('Event added to calendar');
      } else {
        // Log manual time entry
        if (!entryDesc.trim()) return;
        const startMs = new Date(`${targetDateStr}T${entryStartTime}:00`).getTime();
        const endMs = new Date(`${targetDateStr}T${entryEndTime}:00`).getTime();

        if (endMs <= startMs) {
          error('End time must be after start time');
          return;
        }

        const entryData: any = {
          userId: user.uid,
          description: entryDesc.trim(),
          tags: ['calendar_entry'],
          startTime: startMs,
          endTime: endMs,
          duration: Math.round((endMs - startMs) / 1000),
          isManual: true,
        };
        if (entryProjectId.trim()) entryData.projectId = entryProjectId.trim();
        if (entryTaskId.trim()) entryData.taskId = entryTaskId.trim();

        await createTimeEntry(entryData);
        success('Time entry logged on calendar');
      }

      setIsAddModalOpen(false);
    } catch (err) {
      console.error(err);
      error('Failed to add item to calendar');
    }
  };

  // Hide project milestone from calendar
  const handleHideProjectFromCalendar = async (projectId: string) => {
    try {
      await updateProject(projectId, { showOnCalendar: false });
      success('Project hidden from calendar. You can restore it anytime in Projects & Tasks.');
      setInspectedMilestone(null);
    } catch (err) {
      console.error(err);
      error('Failed to update project');
    }
  };

  // Open Edit Custom Event
  const handleOpenEditEvent = (evt: CalendarEvent) => {
    setInspectedEvent(evt);
    setIsEditingEvent(true);
    setEditEventTitle(evt.title);
    setEditEventDesc(evt.description || '');
    setEditEventStartTime(evt.startTime || '10:00');
    setEditEventEndTime(evt.endTime || '11:00');
    setEditEventProjectId(evt.projectId || '');
    setEditEventType(evt.type || 'event');
  };

  // Save Edit Event
  const handleSaveEditEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectedEvent) return;

    try {
      const proj = editEventProjectId ? projectMap.get(editEventProjectId) : null;
      await updateCalendarEvent(inspectedEvent.id, {
        title: editEventTitle.trim(),
        description: editEventDesc.trim() || undefined,
        startTime: editEventStartTime,
        endTime: editEventEndTime,
        projectId: editEventProjectId || undefined,
        color: proj ? proj.color : '#388bfd',
        type: editEventType,
      });
      success('Event updated');
      setIsEditingEvent(false);
      setInspectedEvent(null);
    } catch (err) {
      console.error(err);
      error('Failed to update event');
    }
  };

  // Toggle event completion
  const handleToggleEventCompleted = async (evt: CalendarEvent) => {
    try {
      await updateCalendarEvent(evt.id, { isCompleted: !evt.isCompleted });
    } catch (err) {
      console.error(err);
    }
  };

  // Delete event
  const handleConfirmDeleteEvent = async () => {
    if (!deletingEventId) return;
    try {
      await deleteCalendarEvent(deletingEventId);
      success('Event removed from calendar');
      setInspectedEvent(null);
    } catch (err) {
      console.error(err);
      error('Failed to delete event');
    } finally {
      setDeletingEventId(null);
    }
  };

  // Delete time entry
  const handleConfirmDeleteTimeEntry = async () => {
    if (!deletingTimeEntryId) return;
    try {
      await deleteTimeEntry(deletingTimeEntryId);
      success('Time entry removed');
      setInspectedTimeEntry(null);
    } catch (err) {
      console.error(err);
      error('Failed to delete time entry');
    } finally {
      setDeletingTimeEntryId(null);
    }
  };

  /* ---------------- TASK INSPECTION ACTIONS ---------------- */

  // Mark task completed (disappears from active calendar!)
  const handleCompleteTaskFromCalendar = async (task: Task) => {
    try {
      await updateTask(task.id, { status: 'completed' });
      success(`Task "${task.name}" completed! Saved in project and removed from active calendar.`);
      setInspectedTask(null);
    } catch (err) {
      console.error(err);
      error('Failed to update task');
    }
  };

  // Change scheduled date of task
  const handleRescheduleTask = async (task: Task, newDate: string) => {
    try {
      const cleanDate = newDate.trim() || undefined;
      await updateTask(task.id, {
        scheduledDate: cleanDate,
        deadline: cleanDate,
      });
      if (cleanDate) {
        success(`Task rescheduled to ${cleanDate}`);
      } else {
        success(`Task removed from calendar`);
      }
      setInspectedTask(null);
    } catch (err) {
      console.error(err);
      error('Failed to reschedule task');
    }
  };

  // Confirm delete task
  const handleConfirmDeleteTask = async () => {
    if (!deletingTaskId) return;
    try {
      await deleteTask(deletingTaskId);
      success('Task removed');
      setInspectedTask(null);
    } catch (err) {
      console.error(err);
      error('Failed to delete task');
    } finally {
      setDeletingTaskId(null);
    }
  };

  // Start timer on task
  const handleStartTimerForTask = async (task: Task) => {
    try {
      await startTimer({
        projectId: task.projectId,
        taskId: task.id,
        description: task.name,
      });
      success(`Timer started for "${task.name}"`);
      setInspectedTask(null);
    } catch (err) {
      console.error(err);
      error('Failed to start timer');
    }
  };

  /* ---------------- DATA MAPPINGS FOR CALENDAR ---------------- */

  // 1. Filtered Tasks for Calendar
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const date = t.scheduledDate || t.deadline;
      if (!date) return false;

      // Project filter
      if (selectedProjectId !== 'all') {
        const taskProj = projectMap.get(t.projectId);
        if (t.projectId !== selectedProjectId && taskProj?.parentId !== selectedProjectId) {
          return false;
        }
      }

      // Hide completed tasks from active calendar unless user toggles "Show Completed"
      if (!showCompletedTasksOnCalendar && t.status === 'completed') {
        return false;
      }

      return true;
    });
  }, [tasks, selectedProjectId, showCompletedTasksOnCalendar, projectMap]);

  // Total completed tasks with a scheduled date (for header indicator)
  const completedScheduledTasksCount = useMemo(() => {
    return tasks.filter((t) => (t.scheduledDate || t.deadline) && t.status === 'completed').length;
  }, [tasks]);

  // Tasks mapped by date YYYY-MM-DD
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    filteredTasks.forEach((t) => {
      const dateStr = t.scheduledDate || t.deadline!;
      const arr = map.get(dateStr) || [];
      arr.push(t);
      map.set(dateStr, arr);
    });
    return map;
  }, [filteredTasks]);

  // 2. Filtered Time Entries
  const filteredTimeEntries = useMemo(() => {
    return timeEntries.filter((e) => {
      if (selectedProjectId === 'all') return true;
      if (selectedProjectId === 'none') return !e.projectId;
      return e.projectId === selectedProjectId;
    });
  }, [timeEntries, selectedProjectId]);

  // 3. Filtered Calendar Events
  const filteredCalendarEvents = useMemo(() => {
    return calendarEvents.filter((ev) => {
      if (selectedProjectId === 'all') return true;
      if (selectedProjectId === 'none') return !ev.projectId;
      return ev.projectId === selectedProjectId;
    });
  }, [calendarEvents, selectedProjectId]);

  // 4. Project Milestones
  const projectMilestones = useMemo<ProjectMilestone[]>(() => {
    if (!showProjectMilestones) return [];

    const list: ProjectMilestone[] = [];
    projects.forEach((p) => {
      if (p.showOnCalendar === false) return;
      if (selectedProjectId !== 'all' && selectedProjectId !== p.id) return;

      if (p.startDate) {
        list.push({
          id: `start_${p.id}`,
          projectId: p.id,
          projectName: p.name,
          projectColor: p.color,
          type: 'start',
          dateStr: p.startDate,
          description: p.description,
        });
      }

      if (p.deadline) {
        list.push({
          id: `deadline_${p.id}`,
          projectId: p.id,
          projectName: p.name,
          projectColor: p.color,
          type: 'deadline',
          dateStr: p.deadline,
          description: p.description,
        });
      }
    });

    return list;
  }, [projects, showProjectMilestones, selectedProjectId]);

  // Time entries mapped by date
  const timeEntriesByDate = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    filteredTimeEntries.forEach((entry) => {
      const dateStr = toISODateString(new Date(entry.startTime));
      const arr = map.get(dateStr) || [];
      arr.push(entry);
      map.set(dateStr, arr);
    });
    return map;
  }, [filteredTimeEntries]);

  // Events mapped by date
  const calendarEventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    filteredCalendarEvents.forEach((ev) => {
      const arr = map.get(ev.date) || [];
      arr.push(ev);
      map.set(ev.date, arr);
    });
    return map;
  }, [filteredCalendarEvents]);

  // Milestones mapped by date
  const milestonesByDate = useMemo(() => {
    const map = new Map<string, ProjectMilestone[]>();
    projectMilestones.forEach((m) => {
      const arr = map.get(m.dateStr) || [];
      arr.push(m);
      map.set(m.dateStr, arr);
    });
    return map;
  }, [projectMilestones]);

  // Month grid dates
  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const days: { date: Date; isCurrentMonth: boolean; dateStr: string }[] = [];

    // Pad beginning (Monday = 1 ... Sunday = 0)
    const startDayOfWeek = firstDay.getDay();
    const padCount = (startDayOfWeek + 6) % 7;

    for (let i = padCount; i > 0; i--) {
      const d = new Date(year, month, 1 - i);
      days.push({ date: d, isCurrentMonth: false, dateStr: toISODateString(d) });
    }

    for (let i = 1; i <= lastDay.getDate(); i++) {
      const d = new Date(year, month, i);
      days.push({ date: d, isCurrentMonth: true, dateStr: toISODateString(d) });
    }

    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({ date: d, isCurrentMonth: false, dateStr: toISODateString(d) });
    }

    return days;
  }, [currentDate]);

  // Week View Days
  const weekDays = useMemo(() => {
    const d = new Date(currentDate);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const startOfWeek = new Date(d.setDate(diff));

    const days: { date: Date; dateStr: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(startOfWeek);
      dayDate.setDate(dayDate.getDate() + i);
      days.push({ date: dayDate, dateStr: toISODateString(dayDate) });
    }
    return days;
  }, [currentDate]);

  const todayStr = toISODateString(new Date());

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Controls & Navigation Bar */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-[#21262d]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-[#0d1117] border border-[#21262d] rounded-xl p-1">
            <button
              onClick={handlePrev}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#161b22] cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleToday}
              className="px-3 py-1 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-[#161b22] cursor-pointer"
            >
              Today
            </button>
            <button
              onClick={handleNext}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#161b22] cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <h2 className="text-sm font-semibold text-white tracking-wide">
            {currentDate.toLocaleDateString(undefined, {
              month: 'long',
              year: 'numeric',
              ...(viewMode === 'day' ? { day: 'numeric', weekday: 'short' } : {}),
            })}
          </h2>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Toggle Show Completed Tasks */}
          <button
            onClick={() => setShowCompletedTasksOnCalendar(!showCompletedTasksOnCalendar)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
              showCompletedTasksOnCalendar
                ? 'bg-emerald-950/40 border-emerald-800/40 text-emerald-300'
                : 'bg-[#161b22] border-[#262c36] text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle showing completed tasks on the calendar (hidden by default)"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Show Completed ({completedScheduledTasksCount})</span>
          </button>

          {/* Toggle Auto Project Milestones */}
          <button
            onClick={() => setShowProjectMilestones(!showProjectMilestones)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
              showProjectMilestones
                ? 'bg-blue-950/40 border-blue-800/40 text-blue-300'
                : 'bg-[#161b22] border-[#262c36] text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle display of project start dates and deadlines"
          >
            {showProjectMilestones ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>Milestones {showProjectMilestones ? 'ON' : 'OFF'}</span>
          </button>

          {/* Project Filter */}
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-[#0d1117] border border-[#21262d] text-xs text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer max-w-[200px]"
          >
            <option value="all">All Projects & Tasks</option>
            {projectOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0d1117] border border-[#21262d]">
            {(['month', 'week', 'day'] as CalendarViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors cursor-pointer ${
                  viewMode === mode
                    ? 'bg-[#1c222c] text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Quick Add Button */}
          <button
            onClick={() => handleDayClick(toISODateString(new Date()))}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add / Schedule Task</span>
          </button>
        </div>
      </div>

      {/* Legend & Guide */}
      <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 flex-wrap gap-2">
        <span className="flex items-center gap-1">
          <Plus className="w-3 h-3 text-blue-400" /> Click on any date cell to schedule tasks, custom events, or log time.
        </span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400" /> Pending Task
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-400" /> In Progress Task
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-500" /> Custom Event
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-slate-400" /> Logged Time
          </span>
        </div>
      </div>

      {/* ================= 1. MONTH VIEW ================= */}
      {viewMode === 'month' && (
        <div className="rounded-2xl bg-[#0d1117] border border-[#21262d] overflow-hidden shadow-lg">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-[#21262d] bg-[#121620] text-center text-[11px] font-semibold text-slate-400 py-2.5">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <div key={day}>{day}</div>
            ))}
          </div>

          {/* Month grid cells */}
          <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-[#21262d]">
            {monthDays.map(({ date, isCurrentMonth, dateStr }, index) => {
              const dayTasks = tasksByDate.get(dateStr) || [];
              const dayEntries = timeEntriesByDate.get(dateStr) || [];
              const dayEvents = calendarEventsByDate.get(dateStr) || [];
              const dayMilestones = milestonesByDate.get(dateStr) || [];
              const dayTotalSec = dayEntries.reduce((sum, e) => sum + e.duration, 0);
              const isToday = dateStr === todayStr;

              return (
                <div
                  key={index}
                  onClick={() => handleDayClick(dateStr)}
                  className={`min-h-[135px] p-2 flex flex-col justify-between transition-colors cursor-pointer group hover:bg-[#121622] ${
                    isCurrentMonth ? 'bg-[#0d1117]' : 'bg-[#090c10]/60 opacity-60'
                  } ${isToday ? 'ring-1 ring-inset ring-blue-500/50 bg-blue-950/10' : ''}`}
                >
                  {/* Top day header */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-mono font-medium rounded-full w-6 h-6 flex items-center justify-center ${
                        isToday ? 'bg-blue-600 text-white font-bold' : 'text-slate-400'
                      }`}
                    >
                      {date.getDate()}
                    </span>

                    <div className="flex items-center gap-1">
                      {dayTotalSec > 0 && (
                        <span className="text-[10px] font-mono text-slate-400 font-medium">
                          {formatDurationHuman(dayTotalSec)}
                        </span>
                      )}
                      <span className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-blue-400 hover:text-white transition-opacity">
                        <Plus className="w-3 h-3" />
                      </span>
                    </div>
                  </div>

                  {/* Day Content Badges */}
                  <div className="space-y-1 mt-1.5 overflow-hidden flex-1">
                    {/* 1. Scheduled Tasks for this date (Primary Focus!) */}
                    {dayTasks.map((task) => {
                      const proj = projectMap.get(task.projectId);
                      const isCompleted = task.status === 'completed';
                      const isInProgress = task.status === 'in_progress';

                      return (
                        <div
                          key={task.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectedTask(task);
                          }}
                          className={`px-1.5 py-0.5 rounded text-[10px] truncate flex items-center gap-1 border font-medium cursor-pointer transition-all ${
                            isCompleted
                              ? 'bg-emerald-950/30 border-emerald-800/30 text-emerald-300 line-through opacity-70'
                              : isInProgress
                              ? 'bg-blue-950/40 border-blue-700/40 text-blue-200 hover:border-blue-500'
                              : 'bg-amber-950/30 border-amber-700/30 text-amber-200 hover:border-amber-500'
                          }`}
                          title={`Task: ${task.name} (${task.status}) - ${proj?.name || 'Project'}`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              isCompleted
                                ? 'bg-emerald-400'
                                : isInProgress
                                ? 'bg-blue-400'
                                : 'bg-amber-400'
                            }`}
                          />
                          <span className="truncate font-semibold">{task.name}</span>
                        </div>
                      );
                    })}

                    {/* 2. Project Milestones */}
                    {dayMilestones.map((m) => (
                      <div
                        key={m.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectedMilestone(m);
                        }}
                        className={`px-1.5 py-0.5 rounded text-[10px] truncate flex items-center gap-1 border font-medium cursor-pointer ${
                          m.type === 'start'
                            ? 'bg-blue-950/50 border-blue-800/40 text-blue-200'
                            : 'bg-amber-950/50 border-amber-800/40 text-amber-200'
                        }`}
                        title={`${m.projectName} (${m.type === 'start' ? 'Start' : 'Deadline'})`}
                      >
                        {m.type === 'start' ? (
                          <Flag className="w-2.5 h-2.5 text-blue-400 shrink-0" />
                        ) : (
                          <Target className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                        )}
                        <span className="truncate">{m.projectName}</span>
                      </div>
                    ))}

                    {/* 3. Custom Calendar Events */}
                    {dayEvents.map((ev) => (
                      <div
                        key={ev.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectedEvent(ev);
                          setIsEditingEvent(false);
                        }}
                        className={`px-1.5 py-0.5 rounded text-[10px] truncate flex items-center gap-1 bg-[#1a1c29] border border-purple-500/30 text-purple-200 hover:border-purple-400 transition-colors cursor-pointer ${
                          ev.isCompleted ? 'line-through opacity-50' : ''
                        }`}
                        title={`Custom Event: ${ev.title}`}
                      >
                        <Sparkles className="w-2.5 h-2.5 text-purple-400 shrink-0" />
                        <span className="truncate font-medium">{ev.title}</span>
                      </div>
                    ))}

                    {/* 4. Tracked Time Entries */}
                    {dayEntries.slice(0, 1).map((entry) => {
                      const proj = entry.projectId ? projectMap.get(entry.projectId) : null;
                      return (
                        <div
                          key={entry.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectedTimeEntry(entry);
                          }}
                          className="px-1.5 py-0.5 rounded text-[10px] truncate flex items-center gap-1.5 bg-[#161b22] hover:bg-[#202632] border border-[#21262d] text-slate-400 transition-colors cursor-pointer"
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: proj?.color || '#388bfd' }}
                          />
                          <span className="truncate">{entry.description || 'Session'}</span>
                        </div>
                      );
                    })}

                    {dayEntries.length > 1 && (
                      <span className="text-[9px] text-slate-500 px-1 font-medium block">
                        +{dayEntries.length - 1} more sessions
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= 2. WEEK VIEW ================= */}
      {viewMode === 'week' && (
        <div className="rounded-2xl bg-[#0d1117] border border-[#21262d] overflow-hidden shadow-lg">
          <div className="grid grid-cols-7 divide-x divide-[#21262d]">
            {weekDays.map(({ date, dateStr }) => {
              const dayTasks = tasksByDate.get(dateStr) || [];
              const dayEntries = timeEntriesByDate.get(dateStr) || [];
              const dayEvents = calendarEventsByDate.get(dateStr) || [];
              const dayMilestones = milestonesByDate.get(dateStr) || [];
              const dayTotalSec = dayEntries.reduce((sum, e) => sum + e.duration, 0);
              const isToday = dateStr === todayStr;

              return (
                <div
                  key={dateStr}
                  onClick={() => handleDayClick(dateStr)}
                  className={`min-h-[440px] p-3 flex flex-col cursor-pointer hover:bg-[#121622] transition-colors ${
                    isToday ? 'bg-blue-950/10' : ''
                  }`}
                >
                  <div className="pb-3 border-b border-[#21262d] text-center">
                    <p className="text-[11px] uppercase font-semibold text-slate-400">
                      {date.toLocaleDateString(undefined, { weekday: 'short' })}
                    </p>
                    <p className={`text-base font-bold font-mono mt-0.5 ${isToday ? 'text-blue-400' : 'text-white'}`}>
                      {date.getDate()}
                    </p>
                    <p className="text-[10px] font-mono text-slate-500 mt-1">
                      {formatDurationHuman(dayTotalSec)}
                    </p>
                  </div>

                  <div className="space-y-2 mt-3 flex-1 overflow-y-auto">
                    {/* Tasks */}
                    {dayTasks.map((task) => {
                      const proj = projectMap.get(task.projectId);
                      const isCompleted = task.status === 'completed';
                      const isInProgress = task.status === 'in_progress';

                      return (
                        <div
                          key={task.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectedTask(task);
                          }}
                          className={`p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                            isCompleted
                              ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-200 line-through opacity-70'
                              : isInProgress
                              ? 'bg-blue-950/40 border-blue-700/40 text-blue-200 hover:border-blue-500'
                              : 'bg-amber-950/30 border-amber-700/40 text-amber-200 hover:border-amber-500'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-semibold uppercase tracking-wider">
                              {task.status}
                            </span>
                            <span className="text-slate-400 truncate max-w-[80px]">
                              {proj?.name}
                            </span>
                          </div>
                          <p className="font-bold text-white mt-1 truncate">{task.name}</p>
                        </div>
                      );
                    })}

                    {/* Milestones */}
                    {dayMilestones.map((m) => (
                      <div
                        key={m.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectedMilestone(m);
                        }}
                        className={`p-2 rounded-xl border text-xs cursor-pointer ${
                          m.type === 'start'
                            ? 'bg-blue-950/40 border-blue-800/40 text-blue-200'
                            : 'bg-amber-950/40 border-amber-800/40 text-amber-200'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                          {m.type === 'start' ? <Flag className="w-3 h-3" /> : <Target className="w-3 h-3" />}
                          <span>{m.type === 'start' ? 'Project Starts' : 'Project Deadline'}</span>
                        </div>
                        <p className="font-bold text-white mt-0.5 truncate">{m.projectName}</p>
                      </div>
                    ))}

                    {/* Custom Events */}
                    {dayEvents.map((ev) => (
                      <div
                        key={ev.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectedEvent(ev);
                          setIsEditingEvent(false);
                        }}
                        className="p-2 rounded-xl bg-[#1a1c29] border border-purple-500/30 hover:border-purple-400 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between text-[10px] text-purple-300">
                          <span className="font-medium capitalize">{ev.type}</span>
                          {ev.startTime && <span>{ev.startTime}</span>}
                        </div>
                        <p className="text-xs font-bold text-white mt-0.5 truncate">{ev.title}</p>
                      </div>
                    ))}

                    {/* Tracked Sessions */}
                    {dayEntries.map((entry) => {
                      const proj = entry.projectId ? projectMap.get(entry.projectId) : null;
                      return (
                        <div
                          key={entry.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectedTimeEntry(entry);
                          }}
                          className="p-2 rounded-xl bg-[#161b22] border border-[#262c36] hover:border-slate-500 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: proj?.color || '#388bfd' }}
                            />
                            <span className="text-[10px] text-slate-400 font-medium truncate">
                              {proj?.name || 'No Project'}
                            </span>
                          </div>
                          <p className="text-xs font-medium text-white truncate">{entry.description || 'Session'}</p>
                          <p className="text-[10px] font-mono text-slate-400 mt-1">
                            {formatTime(entry.startTime)} - {formatTime(entry.endTime)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= 3. DAY VIEW ================= */}
      {viewMode === 'day' && (
        <div className="rounded-2xl bg-[#0d1117] border border-[#21262d] p-6 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-[#21262d]">
            <div>
              <h3 className="text-sm font-semibold text-white">{formatDate(currentDate)}</h3>
              <p className="text-xs text-slate-400">
                Tracked Focus Time:{' '}
                {formatDurationHuman(
                  (timeEntriesByDate.get(toISODateString(currentDate)) || []).reduce((a, b) => a + b.duration, 0)
                )}
              </p>
            </div>
            <button
              onClick={() => handleDayClick(toISODateString(currentDate))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Schedule on This Day</span>
            </button>
          </div>

          <div className="space-y-4">
            {/* Tasks for this day */}
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Scheduled Tasks</h4>
            {(tasksByDate.get(toISODateString(currentDate)) || []).length === 0 ? (
              <p className="text-xs text-slate-500 italic">No tasks scheduled for this day.</p>
            ) : (
              <div className="space-y-2">
                {(tasksByDate.get(toISODateString(currentDate)) || []).map((task) => {
                  const proj = projectMap.get(task.projectId);
                  return (
                    <div
                      key={task.id}
                      onClick={() => setInspectedTask(task)}
                      className="p-4 rounded-xl bg-[#161b22] border border-[#262c36] hover:border-blue-500/40 flex items-center justify-between cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-3 h-3 rounded-full ${
                            task.status === 'completed'
                              ? 'bg-emerald-400'
                              : task.status === 'in_progress'
                              ? 'bg-blue-400'
                              : 'bg-amber-400'
                          }`}
                        />
                        <div>
                          <p className={`text-sm font-bold ${task.status === 'completed' ? 'line-through text-slate-400' : 'text-white'}`}>
                            {task.name}
                          </p>
                          <span className="text-xs text-slate-400">
                            {proj?.name} • Status: <strong className="text-white capitalize">{task.status}</strong>
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-blue-400">Click to view/reschedule</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Custom Events for this day */}
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 pt-4">Custom Events</h4>
            {(calendarEventsByDate.get(toISODateString(currentDate)) || []).map((ev) => (
              <div
                key={ev.id}
                onClick={() => {
                  setInspectedEvent(ev);
                  setIsEditingEvent(false);
                }}
                className="p-4 rounded-xl bg-[#1a1c29] border border-purple-500/30 flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-purple-400" />
                  <div>
                    <span className="text-xs font-semibold text-purple-300 capitalize">{ev.type}</span>
                    <p className="text-sm font-bold text-white mt-0.5">{ev.title}</p>
                    {ev.description && <p className="text-xs text-slate-400 mt-1">{ev.description}</p>}
                  </div>
                </div>
                {ev.startTime && (
                  <span className="text-xs font-mono text-purple-300">
                    {ev.startTime} - {ev.endTime}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: INSPECT TASK (CLICKED FROM CALENDAR)                               */}
      {/* ========================================================================= */}
      <Modal
        isOpen={Boolean(inspectedTask)}
        onClose={() => setInspectedTask(null)}
        title="Scheduled Task"
        subtitle={inspectedTask?.name || ''}
      >
        {inspectedTask && (
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-[#161b22] border border-[#262c36] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Project / Subproject</span>
                <span className="font-semibold text-white">
                  {getProjectBreadcrumb(inspectedTask.projectId, projects)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Status</span>
                <span
                  className={`px-2 py-0.5 rounded-full font-semibold uppercase text-[10px] ${
                    inspectedTask.status === 'completed'
                      ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40'
                      : inspectedTask.status === 'in_progress'
                      ? 'bg-blue-950/40 text-blue-400 border border-blue-800/40'
                      : 'bg-amber-950/40 text-amber-400 border border-amber-800/40'
                  }`}
                >
                  {inspectedTask.status}
                </span>
              </div>

              {/* Reschedule Date on Calendar */}
              <div className="flex items-center justify-between pt-2 border-t border-[#262c36]">
                <span className="text-slate-400">Scheduled Day</span>
                <input
                  type="date"
                  value={inspectedTask.scheduledDate || inspectedTask.deadline || ''}
                  onChange={(e) => handleRescheduleTask(inspectedTask, e.target.value)}
                  className="bg-[#0d1117] border border-[#2b3341] rounded-lg px-2.5 py-1 text-xs text-white font-mono focus:outline-none"
                />
              </div>

              {inspectedTask.description && (
                <div className="pt-2 border-t border-[#262c36]">
                  <span className="text-slate-400 block mb-1">Description</span>
                  <p className="text-white text-xs">{inspectedTask.description}</p>
                </div>
              )}
            </div>

            {/* Quick Action Buttons */}
            <div className="space-y-2">
              {/* Mark as Completed */}
              {inspectedTask.status !== 'completed' ? (
                <button
                  type="button"
                  onClick={() => handleCompleteTaskFromCalendar(inspectedTask)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-md transition-all cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Mark as Completed (Hides from active calendar)</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleCompleteTaskFromCalendar({ ...inspectedTask, status: 'pending' })}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#161b22] hover:bg-[#21262d] text-slate-300 font-semibold border border-[#2b3341] transition-all cursor-pointer"
                >
                  <span>Re-open Task (Set to Pending)</span>
                </button>
              )}

              <div className="grid grid-cols-2 gap-2">
                {/* Start Timer */}
                <button
                  type="button"
                  onClick={() => handleStartTimerForTask(inspectedTask)}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 font-medium cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Start Timer</span>
                </button>

                {/* Remove from Calendar */}
                <button
                  type="button"
                  onClick={() => handleRescheduleTask(inspectedTask, '')}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#161b22] hover:bg-[#21262d] text-slate-300 border border-[#2b3341] font-medium cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Remove Date</span>
                </button>
              </div>

              {/* Delete Task */}
              <button
                type="button"
                onClick={() => setDeletingTaskId(inspectedTask.id)}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-rose-950/20 hover:bg-rose-950/40 text-rose-400 border border-rose-800/30 font-medium cursor-pointer mt-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Task Completely</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: ADD / SCHEDULE ON CLICKED DATE                                     */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={`Add to ${targetDateStr}`}
        subtitle="Schedule a task, add a custom study session, or log time for this day"
      >
        <div className="space-y-4">
          {/* Mode Selector Tabs */}
          <div className="grid grid-cols-3 gap-1 bg-[#161b22] p-1 rounded-xl border border-[#262c36]">
            <button
              type="button"
              onClick={() => setAddMode('schedule_task')}
              className={`py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                addMode === 'schedule_task' ? 'bg-[#21262d] text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Schedule Task
            </button>
            <button
              type="button"
              onClick={() => setAddMode('custom_event')}
              className={`py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                addMode === 'custom_event' ? 'bg-[#21262d] text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Custom Event
            </button>
            <button
              type="button"
              onClick={() => setAddMode('time_entry')}
              className={`py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                addMode === 'time_entry' ? 'bg-[#21262d] text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Log Time
            </button>
          </div>

          <form onSubmit={handleSaveNewItem} className="space-y-4">
            {/* 1. SCHEDULE TASK TAB */}
            {addMode === 'schedule_task' && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-2 bg-[#161b22] rounded-xl border border-[#262c36] text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                    <input
                      type="radio"
                      name="scheduleSubMode"
                      checked={taskScheduleSubMode === 'existing'}
                      onChange={() => setTaskScheduleSubMode('existing')}
                      className="accent-blue-500"
                    />
                    <span>Schedule Existing Task</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                    <input
                      type="radio"
                      name="scheduleSubMode"
                      checked={taskScheduleSubMode === 'new'}
                      onChange={() => setTaskScheduleSubMode('new')}
                      className="accent-blue-500"
                    />
                    <span>Quick Create New Task</span>
                  </label>
                </div>

                {taskScheduleSubMode === 'existing' ? (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Select Task to schedule for {targetDateStr}
                    </label>
                    <select
                      value={selectedExistingTaskId}
                      onChange={(e) => setSelectedExistingTaskId(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none cursor-pointer"
                    >
                      <option value="">Choose an unscheduled or pending task...</option>
                      {tasks
                        .filter((t) => t.status !== 'completed')
                        .map((t) => {
                          const proj = projectMap.get(t.projectId);
                          return (
                            <option key={t.id} value={t.id}>
                              {t.name} ({proj?.name || 'Project'})
                            </option>
                          );
                        })}
                    </select>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">Task Name</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Task 1, Complete Lab 3"
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">Project / Subproject</label>
                      <select
                        required
                        value={newTaskSubprojectId}
                        onChange={(e) => setNewTaskSubprojectId(e.target.value)}
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
                  </>
                )}
              </div>
            )}

            {/* 2. CUSTOM EVENT TAB */}
            {addMode === 'custom_event' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Event Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Cybersecurity Lab Exam, CTF Competition"
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Start Time</label>
                    <input
                      type="time"
                      value={eventStartTime}
                      onChange={(e) => setEventStartTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">End Time</label>
                    <input
                      type="time"
                      value={eventEndTime}
                      onChange={(e) => setEventEndTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Type</label>
                    <select
                      value={eventType}
                      onChange={(e) => setEventType(e.target.value as CalendarEventType)}
                      className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none cursor-pointer"
                    >
                      <option value="study">Study Session</option>
                      <option value="event">Event / Lab</option>
                      <option value="deadline">Target Milestone</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Project</label>
                    <select
                      value={eventProjectId}
                      onChange={(e) => setEventProjectId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-slate-200 focus:outline-none cursor-pointer"
                    >
                      <option value="">No Project</option>
                      {projectOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Description (Optional)</label>
                  <textarea
                    rows={2}
                    placeholder="Notes or deliverables for this event"
                    value={eventDesc}
                    onChange={(e) => setEventDesc(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none resize-none"
                  />
                </div>
              </>
            )}

            {/* 3. TIME ENTRY TAB */}
            {addMode === 'time_entry' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Session Description</label>
                  <input
                    type="text"
                    required
                    placeholder="What did you work on?"
                    value={entryDesc}
                    onChange={(e) => setEntryDesc(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Project</label>
                  <select
                    value={entryProjectId}
                    onChange={(e) => {
                      setEntryProjectId(e.target.value);
                      setEntryTaskId('');
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-slate-200 focus:outline-none cursor-pointer"
                  >
                    <option value="">No Project</option>
                    {projectOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Start Time</label>
                    <input
                      type="time"
                      required
                      value={entryStartTime}
                      onChange={(e) => setEntryStartTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">End Time</label>
                    <input
                      type="time"
                      required
                      value={entryEndTime}
                      onChange={(e) => setEntryEndTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#161b22] border border-[#262c36] text-xs text-white focus:outline-none"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-[#21262d]">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:text-white bg-[#161b22] border border-[#2b3341]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-md cursor-pointer"
              >
                Save to Calendar
              </button>
            </div>
          </form>
        </div>
      </Modal>

      {/* ================= MODAL: INSPECT PROJECT MILESTONE ================= */}
      <Modal
        isOpen={Boolean(inspectedMilestone)}
        onClose={() => setInspectedMilestone(null)}
        title="Project Calendar Milestone"
        subtitle={inspectedMilestone ? inspectedMilestone.projectName : ''}
      >
        {inspectedMilestone && (
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-[#161b22] border border-[#262c36] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Milestone Type</span>
                <span className="font-semibold text-white uppercase">
                  {inspectedMilestone.type === 'start' ? 'Project Start Date' : 'Project Deadline'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Date</span>
                <span className="font-mono text-white">{inspectedMilestone.dateStr}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Project Path</span>
                <span className="font-mono text-slate-300">
                  {getProjectBreadcrumb(inspectedMilestone.projectId, projects)}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-[#21262d]">
              <button
                type="button"
                onClick={() => handleHideProjectFromCalendar(inspectedMilestone.projectId)}
                className="px-4 py-2 rounded-xl bg-amber-950/20 text-amber-300 border border-amber-800/40 hover:bg-amber-950/40 transition-colors"
              >
                Hide This Project From Calendar
              </button>
              <button
                type="button"
                onClick={() => setInspectedMilestone(null)}
                className="px-4 py-2 rounded-xl bg-[#161b22] text-slate-300 hover:text-white border border-[#2b3341]"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ================= CONFIRM DELETE DIALOGS ================= */}
      <ConfirmDialog
        isOpen={Boolean(deletingTaskId)}
        title="Delete Task?"
        message="Are you sure you want to delete this task? It will also be removed from the calendar."
        confirmLabel="Delete"
        isDestructive
        onConfirm={handleConfirmDeleteTask}
        onCancel={() => setDeletingTaskId(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(deletingEventId)}
        title="Delete Calendar Event?"
        message="Are you sure you want to remove this event from the calendar?"
        confirmLabel="Delete"
        isDestructive
        onConfirm={handleConfirmDeleteEvent}
        onCancel={() => setDeletingEventId(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(deletingTimeEntryId)}
        title="Delete Time Entry?"
        message="Are you sure you want to remove this logged session?"
        confirmLabel="Delete"
        isDestructive
        onConfirm={handleConfirmDeleteTimeEntry}
        onCancel={() => setDeletingTimeEntryId(null)}
      />
    </div>
  );
};
