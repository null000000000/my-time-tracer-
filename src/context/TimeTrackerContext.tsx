import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { ActiveTimer, Project, Task, TimeEntry } from '../types';
import {
  saveActiveTimer,
  deleteActiveTimer,
  subscribeActiveTimer,
  createTimeEntry,
  subscribeProjects,
  subscribeTasks,
  subscribeTimeEntries,
} from '../services/db';
import { formatSecondsToHMS, playAlertChime } from '../utils/formatters';

interface TimeTrackerContextType {
  activeTimer: ActiveTimer | null;
  elapsedSeconds: number;
  isRunning: boolean;
  isPaused: boolean;
  projects: Project[];
  tasks: Task[];
  timeEntries: TimeEntry[];
  loadingData: boolean;
  startTimer: (params?: { projectId?: string; taskId?: string; description?: string; tags?: string[] }) => Promise<void>;
  pauseTimer: () => Promise<void>;
  resumeTimer: () => Promise<void>;
  stopTimer: () => Promise<string | null>;
  discardTimer: () => Promise<void>;
  updateActiveTimerDraft: (updates: Partial<Pick<ActiveTimer, 'projectId' | 'taskId' | 'description' | 'tags'>>) => Promise<void>;
}

const TimeTrackerContext = createContext<TimeTrackerContextType | undefined>(undefined);

export const TimeTrackerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, settings } = useAuth();
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);

  // Compute live elapsed seconds
  const calculateElapsed = useCallback((timer: ActiveTimer | null): number => {
    if (!timer) return 0;
    if (timer.isPaused) {
      return Math.max(0, Math.floor(timer.accumulatedSeconds));
    }
    const currentMs = Date.now();
    const liveDeltaSec = Math.max(0, (currentMs - timer.startTime) / 1000);
    return Math.max(0, Math.floor(timer.accumulatedSeconds + liveDeltaSec));
  }, []);

  // Listen to Firestore active timer
  useEffect(() => {
    // Immediately isolate and flush previous session in-memory state
    setActiveTimer(null);
    setElapsedSeconds(0);
    setProjects([]);
    setTasks([]);
    setTimeEntries([]);

    if (!user) {
      setLoadingData(false);
      return;
    }

    setLoadingData(true);
    let unsubActive: (() => void) | undefined;
    let unsubProj: (() => void) | undefined;
    let unsubTasks: (() => void) | undefined;
    let unsubEntries: (() => void) | undefined;

    try {
      unsubActive = subscribeActiveTimer(user.uid, (timer) => {
        setActiveTimer(timer);
        setElapsedSeconds(calculateElapsed(timer));
      });

      unsubProj = subscribeProjects(user.uid, (projs) => {
        setProjects(projs);
      });

      unsubTasks = subscribeTasks(user.uid, (tsks) => {
        setTasks(tsks);
      });

      unsubEntries = subscribeTimeEntries(user.uid, (entries) => {
        setTimeEntries(entries);
        setLoadingData(false);
      });
    } catch (e) {
      console.error('Subscription error in TimeTrackerProvider:', e);
      setLoadingData(false);
    }

    return () => {
      unsubActive?.();
      unsubProj?.();
      unsubTasks?.();
      unsubEntries?.();
    };
  }, [user, calculateElapsed]);

  // Tick interval for live UI & document title update
  useEffect(() => {
    if (!activeTimer) {
      setElapsedSeconds(0);
      document.title = 'Chronos - Personal Time & Productivity Tracker';
      return;
    }

    // Immediate initial sync
    const initialElapsed = calculateElapsed(activeTimer);
    setElapsedSeconds(initialElapsed);

    if (activeTimer.isPaused) {
      document.title = `[PAUSED ${formatSecondsToHMS(initialElapsed)}] Chronos`;
      return;
    }

    const interval = setInterval(() => {
      const current = calculateElapsed(activeTimer);
      setElapsedSeconds(current);
      const matchedProj = projects.find((p) => p.id === activeTimer.projectId);
      const projLabel = matchedProj ? ` - ${matchedProj.name}` : '';
      document.title = `▶ ${formatSecondsToHMS(current)}${projLabel} | Chronos`;
    }, 1000);

    return () => clearInterval(interval);
  }, [activeTimer, projects, calculateElapsed]);

  // Actions
  const startTimer = async (params?: { projectId?: string; taskId?: string; description?: string; tags?: string[] }) => {
    if (!user) return;
    const now = Date.now();
    const nowIso = new Date().toISOString();

    const newTimer: ActiveTimer = {
      userId: user.uid,
      projectId: params?.projectId || '',
      taskId: params?.taskId || '',
      description: params?.description || '',
      tags: params?.tags || [],
      startTime: now,
      isPaused: false,
      accumulatedSeconds: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await saveActiveTimer(newTimer);
    if (settings.soundEnabled) {
      playAlertChime('success');
    }
  };

  const pauseTimer = async () => {
    if (!user || !activeTimer || activeTimer.isPaused) return;
    const now = Date.now();
    const additionalSec = Math.max(0, (now - activeTimer.startTime) / 1000);
    const updatedAccumulated = activeTimer.accumulatedSeconds + additionalSec;

    const updated: ActiveTimer = {
      ...activeTimer,
      isPaused: true,
      accumulatedSeconds: updatedAccumulated,
      lastPausedAt: now,
      updatedAt: new Date().toISOString(),
    };

    await saveActiveTimer(updated);
  };

  const resumeTimer = async () => {
    if (!user || !activeTimer || !activeTimer.isPaused) return;
    const now = Date.now();

    const updated: ActiveTimer = {
      ...activeTimer,
      isPaused: false,
      startTime: now,
      updatedAt: new Date().toISOString(),
    };

    await saveActiveTimer(updated);
  };

  const stopTimer = async (): Promise<string | null> => {
    if (!user || !activeTimer) return null;
    const totalSec = calculateElapsed(activeTimer);

    // If timer ran for at least 1 second, save as entry
    let createdId: string | null = null;
    if (totalSec >= 1) {
      const endTime = Date.now();
      const startTime = endTime - Math.round(totalSec * 1000);

      createdId = await createTimeEntry({
        userId: user.uid,
        projectId: activeTimer.projectId || undefined,
        taskId: activeTimer.taskId || undefined,
        description: activeTimer.description.trim() || 'Tracked Session',
        tags: activeTimer.tags || [],
        startTime,
        endTime,
        duration: Math.round(totalSec),
        isManual: false,
      });
    }

    await deleteActiveTimer(user.uid);
    if (settings.soundEnabled) {
      playAlertChime('timer_stop');
    }
    return createdId;
  };

  const discardTimer = async () => {
    if (!user || !activeTimer) return;
    await deleteActiveTimer(user.uid);
  };

  const updateActiveTimerDraft = async (updates: Partial<Pick<ActiveTimer, 'projectId' | 'taskId' | 'description' | 'tags'>>) => {
    if (!user || !activeTimer) return;
    const updated: ActiveTimer = {
      ...activeTimer,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await saveActiveTimer(updated);
  };

  return (
    <TimeTrackerContext.Provider
      value={{
        activeTimer,
        elapsedSeconds,
        isRunning: Boolean(activeTimer && !activeTimer.isPaused),
        isPaused: Boolean(activeTimer?.isPaused),
        projects,
        tasks,
        timeEntries,
        loadingData,
        startTimer,
        pauseTimer,
        resumeTimer,
        stopTimer,
        discardTimer,
        updateActiveTimerDraft,
      }}
    >
      {children}
    </TimeTrackerContext.Provider>
  );
};

export function useTimeTracker(): TimeTrackerContextType {
  const context = useContext(TimeTrackerContext);
  if (!context) {
    throw new Error('useTimeTracker must be used within a TimeTrackerProvider');
  }
  return context;
}
