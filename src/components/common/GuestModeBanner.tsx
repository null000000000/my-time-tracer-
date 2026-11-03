import React, { useState } from 'react';
import { AlertTriangle, Download, LogIn, LogOut, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { fetchAllGuestData, getGuestDataCounts } from '../../services/guestStorage';
import { useToast } from './Toast';
import { ConfirmDialog } from './ConfirmDialog';

interface GuestModeBannerProps {
  onOpenAuthModal?: () => void;
}

export const GuestModeBanner: React.FC<GuestModeBannerProps> = ({ onOpenAuthModal }) => {
  const { isGuest, exitGuestMode, signInWithGoogle } = useAuth();
  const { success, error } = useToast();
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  if (!isGuest) return null;

  const counts = getGuestDataCounts();

  const handleExportJSON = () => {
    try {
      const data = fetchAllGuestData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chronos_guest_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      success('Guest workspace exported successfully.');
    } catch (err) {
      console.error(err);
      error('Failed exporting guest workspace data.');
    }
  };

  const handleSignInToSave = async () => {
    try {
      setSigningIn(true);
      if (onOpenAuthModal) {
        onOpenAuthModal();
      } else {
        await signInWithGoogle();
      }
    } catch (err) {
      console.error(err);
      error('Sign-in cancelled or failed.');
    } finally {
      setSigningIn(false);
    }
  };

  const totalItems = counts.totalProjects + counts.tasks + counts.calendarEvents + counts.timeEntries;

  return (
    <>
      <div className="bg-gradient-to-r from-amber-950/40 via-[#161b22] to-blue-950/30 border-b border-amber-500/20 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs z-30 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-[11px] font-medium shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            GUEST MODE
          </div>
          <p className="text-slate-300 truncate text-[11px]">
            <span className="text-slate-400">Temporary Session:</span> Data is stored in this browser tab only.
            {totalItems > 0 && (
              <span className="ml-1.5 text-amber-200/90 font-mono">
                ({counts.totalProjects} projects, {counts.tasks} tasks, {counts.calendarEvents} events)
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportJSON}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-slate-300 hover:text-white border border-[#30363d] text-[11px] font-medium transition-colors cursor-pointer"
            title="Download JSON copy of current guest workspace"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Export JSON</span>
          </button>

          <button
            type="button"
            onClick={handleSignInToSave}
            disabled={signingIn}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-[11px] shadow-sm transition-all cursor-pointer hover:shadow-blue-500/20 disabled:opacity-50"
            title="Save temporary workspace to a permanent Google account"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>{signingIn ? 'Connecting...' : 'Save Work (Sign In)'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowExitConfirm(true)}
            className="p-1 rounded-lg hover:bg-rose-950/40 hover:text-rose-400 text-slate-500 transition-colors cursor-pointer"
            title="Exit Guest Mode"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showExitConfirm}
        title="Exit Guest Mode?"
        message="Exiting will clear this tab's temporary workspace. If you want to keep your work, download an Export JSON or Sign In first."
        confirmLabel="Exit & Clear Workspace"
        cancelLabel="Keep Working"
        isDestructive={true}
        onConfirm={() => {
          setShowExitConfirm(false);
          exitGuestMode();
        }}
        onCancel={() => setShowExitConfirm(false)}
      />
    </>
  );
};
