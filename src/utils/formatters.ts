/**
 * Format duration in seconds to standard HH:MM:SS
 */
export function formatSecondsToHMS(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Format duration in seconds to human readable (e.g., "2h 45m" or "12m 30s")
 */
export function formatDurationHuman(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  if (sec === 0) return '0m';

  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (hours === 0 && seconds > 0) parts.push(`${seconds}s`);

  return parts.join(' ') || '0m';
}

/**
 * Format timestamp into time string (e.g. 14:30 or 2:30 PM)
 */
export function formatTime(timestamp: number, is24h = true): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: !is24h,
  });
}

/**
 * Format timestamp to Date string (e.g. "Mon, Oct 24, 2026")
 */
export function formatDate(timestamp: number | Date): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format to ISO Date string YYYY-MM-DD
 */
export function toISODateString(timestamp: number | Date): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Start and End of Date calculations
 */
export function getStartOfDay(d = new Date()): number {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

export function getEndOfDay(d = new Date()): number {
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

export function getStartOfWeek(d = new Date(), startOnMonday = true): number {
  const date = new Date(d);
  const day = date.getDay(); // 0 is Sunday
  const diff = date.getDate() - day + (startOnMonday ? (day === 0 ? -6 : 1) : 0);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function getEndOfWeek(d = new Date(), startOnMonday = true): number {
  const start = getStartOfWeek(d, startOnMonday);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

export function getStartOfMonth(d = new Date()): number {
  const date = new Date(d.getFullYear(), d.getMonth(), 1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function getEndOfMonth(d = new Date()): number {
  const date = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

/**
 * Web Audio API synthesizer for clean sound alerts
 */
export function playAlertChime(type: 'success' | 'timer_stop' | 'pomodoro_complete' | 'alert' = 'success'): void {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    if (type === 'pomodoro_complete') {
      // 3-tone uplifting chime (C5 -> E5 -> G5)
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.15);
        osc.stop(ctx.currentTime + i * 0.15 + 0.45);
      });
    } else if (type === 'timer_stop') {
      // Gentle double tap
      [600, 800].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
        gain.gain.setValueAtTime(0.18, ctx.currentTime + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.3);
      });
    } else {
      // Clean single confirmation ping
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch (e) {
    console.warn('Audio chime was blocked or not supported:', e);
  }
}

/**
 * Export data array to CSV file
 */
export function exportToCSV(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escapeCSV = (val: string | number) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const csvContent = [
    headers.map(escapeCSV).join(','),
    ...rows.map(row => row.map(escapeCSV).join(',')),
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export arbitrary JSON data backup
 */
export function exportToJSON(filename: string, data: unknown): void {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

import type { Project } from '../types';

/**
 * Returns full hierarchical path for a project, e.g. "Cybersecurity > TryHackMe"
 */
export function getProjectBreadcrumb(projectId: string | undefined | null, projects: Project[]): string {
  if (!projectId) return '';
  const map = new Map(projects.map(p => [p.id, p]));
  const path: string[] = [];
  let curr = map.get(projectId);
  const visited = new Set<string>();

  while (curr && !visited.has(curr.id)) {
    visited.add(curr.id);
    path.unshift(curr.name);
    curr = curr.parentId ? map.get(curr.parentId) : undefined;
  }

  return path.join(' › ');
}

/**
 * Returns all child/sub-project IDs recursively
 */
export function getSubprojectIds(projectId: string, projects: Project[]): string[] {
  const result: string[] = [];
  const queue = [projectId];

  while (queue.length > 0) {
    const parent = queue.shift()!;
    projects.forEach(p => {
      if (p.parentId === parent && !result.includes(p.id)) {
        result.push(p.id);
        queue.push(p.id);
      }
    });
  }

  return result;
}

/**
 * Format projects for <select> options with indentation
 */
export function getProjectIndentedOptions(
  projects: Project[],
  excludeId?: string
): { id: string; name: string; label: string; color: string; level: number }[] {
  const map = new Map(projects.map(p => [p.id, p]));
  const childrenMap = new Map<string, Project[]>();

  projects.forEach(p => {
    const parentKey = p.parentId || 'ROOT';
    const list = childrenMap.get(parentKey) || [];
    list.push(p);
    childrenMap.set(parentKey, list);
  });

  const result: { id: string; name: string; label: string; color: string; level: number }[] = [];

  function traverse(parentKey: string, level: number) {
    const children = childrenMap.get(parentKey) || [];
    children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      if (excludeId && child.id === excludeId) continue;
      const prefix = level > 0 ? `${'  '.repeat(level)}└─ ` : '';
      result.push({
        id: child.id,
        name: child.name,
        label: `${prefix}${child.name}`,
        color: child.color,
        level,
      });
      traverse(child.id, level + 1);
    }
  }

  traverse('ROOT', 0);

  // If there are orphaned subprojects whose parent doesn't exist, list them too
  projects.forEach(p => {
    if (p.parentId && !map.has(p.parentId) && !result.some(r => r.id === p.id)) {
      result.push({
        id: p.id,
        name: p.name,
        label: p.name,
        color: p.color,
        level: 0,
      });
    }
  });

  return result;
}
