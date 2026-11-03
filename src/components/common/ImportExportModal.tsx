import React, { useState, useRef } from 'react';
import {
  Upload,
  Download,
  FileJson,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Trash2,
  RefreshCw,
  FolderTree,
  Calendar,
  Layers,
  FileCode,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTimeTracker } from '../../context/TimeTrackerContext';
import { useToast } from './Toast';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import {
  validateImportJson,
  sanitizeDatasetForImport,
  executeTargetUserReset,
  executeBatchImport,
  requestGeminiImportReview,
  downloadUserDataExport,
  ImportValidationResult,
  GeminiReviewResponse,
} from '../../services/importExportService';

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'import' | 'export';
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'import',
}) => {
  const { user } = useAuth();
  const { projects, tasks, timeEntries } = useTimeTracker();
  const { success, error, info } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'import' | 'export'>(initialTab);

  // Import State
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [rawJsonText, setRawJsonText] = useState<string>('');
  const [parsedData, setParsedData] = useState<any>(null);
  const [validation, setValidation] = useState<ImportValidationResult | null>(null);
  const [stripDates, setStripDates] = useState<boolean>(true);
  const [resetBeforeImport, setResetBeforeImport] = useState<boolean>(false);

  // Gemini Review State
  const [isReviewingWithGemini, setIsReviewingWithGemini] = useState<boolean>(false);
  const [geminiReview, setGeminiReview] = useState<GeminiReviewResponse['analysis'] | null>(null);
  const [geminiError, setGeminiError] = useState<string | null>(null);

  // Execution State
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [isConfirmOpen, setIsConfirmOpen] = useState<boolean>(false);
  const [importSummaryResult, setImportSummaryResult] = useState<{
    projectsWritten: number;
    tasksWritten: number;
    timeEntriesWritten: number;
    calendarEventsWritten: number;
    importId?: string;
  } | null>(null);

  // Handle file select
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        setRawJsonText(text);
        const json = JSON.parse(text);
        setParsedData(json);
        const val = validateImportJson(json);
        setValidation(val);
        setGeminiReview(null);
        setGeminiError(null);
        setImportSummaryResult(null);
        if (!val.isValid) {
          error(val.error || 'Invalid JSON format');
        } else {
          info(`Detected ${val.counts.projects} projects, ${val.counts.tasks} tasks in ${file.name}.`);
        }
      } catch (err: any) {
        error(`Failed to parse JSON file: ${err.message}`);
        setValidation(null);
        setParsedData(null);
      }
    };
    reader.readAsText(file);
  };

  // Run Gemini Analysis (on explicitly loaded file only)
  const handleRunGeminiReview = async () => {
    if (!parsedData || !validation?.isValid) {
      error('Please load a valid JSON dataset first.');
      return;
    }

    try {
      setIsReviewingWithGemini(true);
      setGeminiError(null);
      info('Sending workspace structure to Gemini for architectural analysis...');

      const sampleProjects = (parsedData.projects || []).slice(0, 15).map((p: any) => ({
        name: p.name,
        subproject: Boolean(p.parentId),
      }));

      const isGuest = user?.uid?.startsWith('guest_');

      const res = await requestGeminiImportReview({
        projectsCount: validation.counts.projects,
        rootProjects: validation.sampleRoots,
        tasksCount: validation.counts.tasks,
        sampleProjects,
        isGuest,
        guestSessionId: isGuest ? user?.uid : undefined,
      });

      if (res.success && res.analysis) {
        setGeminiReview(res.analysis);
        success('Gemini architectural analysis ready.');
      } else {
        setGeminiError(res.error || 'Gemini analysis unavailable.');
      }
    } catch (err: any) {
      console.error(err);
      setGeminiError(err.message || 'Error executing Gemini review');
    } finally {
      setIsReviewingWithGemini(false);
    }
  };

  // Final Import Confirmation Trigger
  const handleInitiateImport = () => {
    if (!parsedData || !validation?.isValid) {
      error('No valid dataset loaded');
      return;
    }
    setIsConfirmOpen(true);
  };

  // Execute Import into Current User's Workspace
  const handleConfirmExecuteImport = async () => {
    setIsConfirmOpen(false);
    if (!user || !parsedData) return;

    try {
      setIsExecuting(true);
      setProgressPercent(0);

      // Step 1: Optional clean reset of current user's workspace only
      if (resetBeforeImport) {
        setProgressMsg('Safely resetting your existing workspace records...');
        await executeTargetUserReset(user.uid, (msg, pct) => {
          setProgressMsg(msg);
          setProgressPercent(Math.round(pct * 0.3));
        });
      }

      // Step 2: Sanitize, strip old embedded ownership, map IDs and generate unique importId
      setProgressMsg('Sanitizing projects and mapping relationship IDs...');
      const sanitized = sanitizeDatasetForImport(
        parsedData,
        user.uid,
        stripDates,
        selectedFileName || 'workspace_import.json'
      );

      // Step 3: Batch commit under current user's verified ownership
      setProgressMsg('Writing isolated workspace records...');
      const writeResult = await executeBatchImport(
        {
          projects: sanitized.projects,
          tasks: sanitized.tasks,
          timeEntries: resetBeforeImport ? [] : sanitized.timeEntries,
          calendarEvents: [], // Empty calendar for clean scheduling
          importRecord: sanitized.importRecord,
        },
        (msg, pct) => {
          setProgressMsg(msg);
          const scaledPct = resetBeforeImport ? 30 + Math.round(pct * 0.7) : pct;
          setProgressPercent(scaledPct);
        }
      );

      setImportSummaryResult(writeResult);
      success(
        `Import complete: ${writeResult.projectsWritten} projects, ${writeResult.tasksWritten} tasks saved to your workspace!`
      );
    } catch (err: any) {
      console.error('Import failed:', err);
      error(`Import failed: ${err.message || 'Unknown database error'}`);
    } finally {
      setIsExecuting(false);
    }
  };

  // Export Current User's Workspace Data
  const handleExportData = async () => {
    if (!user) return;
    try {
      setIsExecuting(true);
      setProgressMsg('Generating complete JSON export snapshot...');
      await downloadUserDataExport(user.uid);
      success('Workspace data downloaded successfully.');
    } catch (err: any) {
      console.error(err);
      error('Failed to export workspace data.');
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Workspace Import & Export Center"
        maxWidth="max-w-3xl"
      >
        <div className="space-y-6">
          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 p-1 rounded-xl bg-[#0d1117] border border-[#21262d]">
            <button
              onClick={() => setActiveTab('import')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'import'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Import JSON to My Workspace</span>
            </button>
            <button
              onClick={() => setActiveTab('export')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'export'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Download className="w-4 h-4" />
              <span>Export My Data</span>
            </button>
          </div>

          {/* ================= TAB 1: IMPORT JSON ================= */}
          {activeTab === 'import' && (
            <div className="space-y-5">
              {/* File Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#30363d] hover:border-blue-500 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-[#0d1117] group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto mb-3 group-hover:scale-105 transition-transform">
                  <FileJson className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-white">
                  {selectedFileName ? selectedFileName : 'Click to select a JSON backup file'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Supports Chronos, Clockify, or custom workspace JSON structures
                </p>
              </div>

              {/* Dataset Validation Preview */}
              {validation && validation.isValid && (
                <div className="p-4 rounded-xl bg-[#161b22] border border-[#21262d] space-y-4">
                  <div className="flex items-center justify-between border-b border-[#21262d] pb-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      <span className="text-sm font-bold text-white">Valid Dataset Detected</span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {validation.counts.projects} Total Projects
                    </span>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-3 rounded-xl bg-[#0d1117] border border-[#21262d] text-center">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Root Projects</span>
                      <span className="text-lg font-bold text-blue-400">{validation.counts.rootProjects}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-[#0d1117] border border-[#21262d] text-center">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Subprojects</span>
                      <span className="text-lg font-bold text-purple-400">{validation.counts.subprojects}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-[#0d1117] border border-[#21262d] text-center">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Tasks</span>
                      <span className="text-lg font-bold text-emerald-400">{validation.counts.tasks}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-[#0d1117] border border-[#21262d] text-center">
                      <span className="text-[10px] uppercase font-bold text-amber-400 block">Dates in File</span>
                      <span className="text-lg font-bold text-amber-300">{validation.counts.tasksWithDates}</span>
                    </div>
                  </div>

                  {/* Sample Root Projects */}
                  {validation.sampleRoots.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-slate-400 mb-2">Sample Projects in File:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {validation.sampleRoots.map((name, i) => (
                          <span
                            key={i}
                            className="px-2.5 py-1 rounded-lg text-xs bg-[#0d1117] border border-[#21262d] text-slate-300"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Import Configuration Options */}
                  <div className="space-y-3 pt-3 border-t border-[#21262d]">
                    {/* Strip Dates Checkbox */}
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={stripDates}
                        onChange={(e) => setStripDates(e.target.checked)}
                        className="mt-1 rounded bg-[#0d1117] border-[#30363d] text-blue-600 focus:ring-0"
                      />
                      <div>
                        <span className="text-xs font-semibold text-white group-hover:text-blue-400 transition-colors flex items-center gap-1.5">
                          <span>Strip all task dates & start calendar empty</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                            Recommended
                          </span>
                        </span>
                        <p className="text-[11px] text-slate-400">
                          Deletes deadline, scheduledDate, and dueDate from all tasks. You can schedule them manually on the calendar later.
                        </p>
                      </div>
                    </label>

                    {/* Clean Reset Checkbox */}
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={resetBeforeImport}
                        onChange={(e) => setResetBeforeImport(e.target.checked)}
                        className="mt-1 rounded bg-[#0d1117] border-rose-500/50 text-rose-600 focus:ring-0"
                      />
                      <div>
                        <span className="text-xs font-semibold text-rose-300 group-hover:text-rose-200 transition-colors flex items-center gap-1.5">
                          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                          <span>Wipe my existing projects & tasks before importing</span>
                        </span>
                        <p className="text-[11px] text-slate-400">
                          Ensures a clean slate without duplicate projects. Applies strictly to your account only.
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* Gemini Review Action */}
                  <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-800/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        <span className="text-xs font-bold text-white">Gemini Workspace Architectural Review</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleRunGeminiReview}
                        disabled={isReviewingWithGemini}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold shadow transition-all cursor-pointer"
                      >
                        {isReviewingWithGemini ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Analyzing...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Review with Gemini</span>
                          </>
                        )}
                      </button>
                    </div>

                    {geminiError && (
                      <p className="text-xs text-rose-400 bg-rose-950/30 p-2 rounded-lg border border-rose-900/40">
                        {geminiError}
                      </p>
                    )}

                    {geminiReview && (
                      <div className="space-y-2.5 pt-2 border-t border-purple-900/40 text-xs text-slate-300">
                        <p className="leading-relaxed text-slate-200 font-medium">
                          {geminiReview.summary}
                        </p>
                        {geminiReview.recommendedFocus && (
                          <div className="flex flex-wrap gap-1.5">
                            {geminiReview.recommendedFocus.map((f, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded bg-purple-900/40 text-purple-300 border border-purple-800/50 text-[11px]"
                              >
                                {f}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Progress Bar during execution */}
              {isExecuting && (
                <div className="space-y-2 p-4 rounded-xl bg-[#161b22] border border-[#21262d]">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                      <span>{progressMsg}</span>
                    </span>
                    <span className="font-mono text-blue-400">{progressPercent}%</span>
                  </div>
                  <div className="w-full bg-[#0d1117] rounded-full h-2 overflow-hidden border border-[#21262d]">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full transition-all duration-200"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Import Completion Summary */}
              {importSummaryResult && (
                <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/40 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Workspace Ingestion Complete</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Imported <strong>{importSummaryResult.projectsWritten}</strong> projects & subprojects and{' '}
                    <strong>{importSummaryResult.tasksWritten}</strong> tasks. Calendar starts clean with 0 default dates.
                  </p>
                  {importSummaryResult.importId && (
                    <p className="text-[11px] font-mono text-slate-400">
                      Provenance ID: <code className="text-emerald-300">{importSummaryResult.importId}</code>
                    </p>
                  )}
                </div>
              )}

              {/* Import Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-[#21262d]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-[#161b22] hover:bg-[#21262d] text-slate-300 text-xs font-medium border border-[#30363d] transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={!validation?.isValid || isExecuting}
                  onClick={handleInitiateImport}
                  className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>Execute Import</span>
                </button>
              </div>
            </div>
          )}

          {/* ================= TAB 2: EXPORT MY DATA ================= */}
          {activeTab === 'export' && (
            <div className="space-y-5">
              <div className="p-5 rounded-2xl bg-[#0d1117] border border-[#21262d] space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                    <Download className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Full Workspace Data Snapshot</h3>
                    <p className="text-xs text-slate-400">
                      Download all your projects, subprojects, tasks, and time tracking history in standard JSON format.
                    </p>
                  </div>
                </div>

                {/* Current Stats */}
                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-[#161b22] border border-[#21262d] text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Projects</span>
                    <span className="text-base font-bold text-white">{projects.length}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#161b22] border border-[#21262d] text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Tasks</span>
                    <span className="text-base font-bold text-white">{tasks.length}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#161b22] border border-[#21262d] text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Time Entries</span>
                    <span className="text-base font-bold text-white">{timeEntries.length}</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-blue-950/20 border border-blue-900/30 text-xs text-blue-300">
                  Exports are scoped strictly to your account and compatible with Chronos import restore points.
                </div>

                <button
                  type="button"
                  onClick={handleExportData}
                  disabled={isExecuting}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download My Backup File (.json)</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isConfirmOpen}
        title="Confirm Workspace Import"
        message={
          resetBeforeImport
            ? `Are you sure you want to completely reset your existing workspace and import ${validation?.counts.projects} projects and ${validation?.counts.tasks} tasks? All previous records will be wiped.`
            : `Are you sure you want to import ${validation?.counts.projects} projects and ${validation?.counts.tasks} tasks into your workspace?`
        }
        confirmLabel="Yes, Execute Import"
        cancelLabel="Cancel"
        isDestructive={resetBeforeImport}
        onConfirm={handleConfirmExecuteImport}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </>
  );
};
