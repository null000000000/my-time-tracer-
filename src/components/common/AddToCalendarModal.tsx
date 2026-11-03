import React, { useState } from 'react';
import { Calendar, Clock, Tag, FileText, CheckCircle2 } from 'lucide-react';
import { Modal } from './Modal';
import { Project, CalendarEventType } from '../../types';
import { createCalendarEvent } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from './Toast';

interface AddToCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  subproject: Project | null;
  parentProject?: Project | null;
}

export const AddToCalendarModal: React.FC<AddToCalendarModalProps> = ({
  isOpen,
  onClose,
  subproject,
  parentProject,
}) => {
  const { user } = useAuth();
  const { success, error } = useToast();

  const todayStr = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState<string>(todayStr);
  const [startTime, setStartTime] = useState<string>('09:00');
  const [endTime, setEndTime] = useState<string>('11:00');
  const [eventType, setEventType] = useState<CalendarEventType>('study');
  const [customTitle, setCustomTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Default title based on subproject
  const effectiveTitle = customTitle.trim() || (subproject ? `Lab Session: ${subproject.name}` : 'Scheduled Session');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !subproject) return;

    if (!date) {
      error('Please select a date');
      return;
    }

    try {
      setIsSubmitting(true);
      const color = subproject.color || parentProject?.color || '#388bfd';

      await createCalendarEvent({
        userId: user.uid,
        title: effectiveTitle,
        description: description.trim() || undefined,
        date,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        projectId: subproject.id,
        color,
        type: eventType,
        isCompleted: false,
      });

      success(`Scheduled "${effectiveTitle}" on ${date}`);
      onClose();
      // Reset state
      setCustomTitle('');
      setDescription('');
    } catch (err: any) {
      console.error('Failed to schedule subproject on calendar:', err);
      error('Failed to schedule on calendar');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!subproject) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Subproject to Calendar"
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Info Box */}
        <div className="p-3 rounded-xl bg-[#161b22] border border-[#21262d] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: subproject.color || parentProject?.color || '#388bfd' }}
            />
            <div>
              <p className="text-sm font-semibold text-white leading-tight">{subproject.name}</p>
              {parentProject && (
                <p className="text-xs text-slate-400 mt-0.5">Under {parentProject.name}</p>
              )}
            </div>
          </div>
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-purple-950/60 text-purple-400 border border-purple-800/40">
            Subproject
          </span>
        </div>

        {/* Title Input */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Calendar Event Title
          </label>
          <input
            type="text"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder={`Lab Session: ${subproject.name}`}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d1117] border border-[#30363d] text-white text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Leave blank to use default session name.
          </p>
        </div>

        {/* Date & Time Picker */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-400" />
              <span>Date</span>
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#0d1117] border border-[#30363d] text-white text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Start Time</span>
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#0d1117] border border-[#30363d] text-white text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>End Time</span>
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#0d1117] border border-[#30363d] text-white text-xs focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Event Type */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-purple-400" />
            <span>Session Classification</span>
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: 'study', label: 'Lab / Study' },
              { id: 'event', label: 'Event' },
              { id: 'milestone', label: 'Milestone' },
              { id: 'deadline', label: 'Target' },
            ].map((type) => (
              <button
                key={type.id}
                type="button"
                onClick={() => setEventType(type.id as CalendarEventType)}
                className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all text-center cursor-pointer ${
                  eventType === type.id
                    ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-sm'
                    : 'bg-[#161b22] border-[#21262d] text-slate-400 hover:text-white hover:border-[#30363d]'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>

        {/* Description / Notes */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            <span>Target Focus / Notes (Optional)</span>
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Configure OSPF & BGP router interfaces, run packet capture"
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d1117] border border-[#30363d] text-white text-xs focus:outline-none focus:border-blue-500 placeholder-slate-500"
          />
        </div>

        <div className="p-3 rounded-xl bg-blue-950/20 border border-blue-900/30 text-xs text-blue-300">
          Note: This schedules a calendar session for this subproject. It does not alter or reassign deadlines to individual tasks within it.
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#21262d]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#161b22] hover:bg-[#21262d] text-slate-300 text-xs font-medium border border-[#30363d] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
          >
            <Calendar className="w-4 h-4" />
            <span>{isSubmitting ? 'Scheduling...' : 'Add to Calendar'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
