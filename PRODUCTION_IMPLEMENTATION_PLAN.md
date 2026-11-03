# CHRONOS — Production Implementation Plan

## 1. Executive Summary & Production Objectives
Chronos (formerly Kronos) is a mission-critical personal time tracking and performance engineering workstation built for cybersecurity labs, CTF activities, penetration testing, software engineering, and university work. 

This production release transitions Chronos into a fully hardened, production-ready system with:
1. **Targeted Data Hygiene**: Controlled, safe reset and import specifically for user `rAzbSJxTAPRP3ctC94XPpO83BT63` (`null28457@gmail.com`).
2. **17 Comprehensive Workstreams**: Full ingestion of the 17 main engineering/cybersecurity project hierarchies (342 total project records, 2,166 granular tasks).
3. **Clean Slate Calendar**: Total removal of default/unsolicited dates (`deadline`, `scheduledDate`, `dueDate`, `plannedDate`) from imported tasks, setting `showOnCalendar: false` across all projects, guaranteeing a clean calendar slate.
4. **Subproject Calendar Integration**: On-demand "Add to Calendar" scheduling for subprojects and tasks with custom time blocks, without polluting sub-tasks.
5. **Universal JSON Import & Export Center**: Exporting complete relational JSON backups and importing JSON datasets with schema validation, conflict preview, and user confirmation.
6. **Server-Side Gemini Review & Optimization**: Secure AI analysis of imported workloads via Express backend proxy (`/api/gemini/review-import`) using `@google/genai` and model `gemini-3.8-flash`.

---

## 2. Target User Isolation & Protection Architecture
- **Target User ID**: `rAzbSJxTAPRP3ctC94XPpO83BT63` (email: `null28457@gmail.com`).
- **Isolation Boundary**:
  - All automated reset scripts and targeted migrations MUST evaluate `userId === 'rAzbSJxTAPRP3ctC94XPpO83BT63'`.
  - Non-target users must experience zero disruption; their existing projects, tasks, time entries, and calendar events remain entirely untouched.
  - User credentials, Firebase Auth UID, email verified status, and auth sessions are strictly preserved (no account deletion).
  - Firestore security rules enforce `request.auth.uid == userId` at the database engine level, preventing any cross-user data leakage.

---

## 3. High-Volume Dataset Migration Plan
- **Source Asset**: `/public/assets/aistudio/chronos_17_projects_english_backup_fec8e88e.json` (1.1 MB).
- **Dataset Composition**:
  - 17 Root Projects (`parentId: null` or omitted):
    1. Network Infrastructure Lab
    2. Linux Operating System Lab
    3. Windows Operating System Lab
    4. Network Traffic Analysis Lab
    5. Programming & Automation Toolkit
    6. Linux Automation Toolkit
    7. Windows Administration Automation Toolkit
    8. Git & Lab Documentation System
    9. Virtualization & Container Lab
    10. Container Infrastructure Lab
    11. Web Security Fundamentals Lab
    12. Secure REST API Lab
    13. Database Security Lab
    14. Security Assessment Toolkit
    15. AWS Cloud Infrastructure Lab
    16. AI Engineering Fundamentals Project
    17. Mini RAG Knowledge System
  - 325 Child Subprojects (`parentId: string`).
  - Total Projects: 342.
  - Total Tasks: 2,166.
  - Tasks With Dates in Source: 304.
- **Sanitization Specification**:
  - `showOnCalendar`: Explicitly set to `false` on all 342 project/subproject documents.
  - Task Date Stripping: The fields `deadline`, `scheduledDate`, `dueDate`, `plannedDate` are deleted (`delete task[field]`). No `null`, empty string `""`, or placeholders are preserved.
  - Relational Integrity: Every task references a valid `projectId`. Subprojects reference valid parent project IDs.
  - Batching Execution: Chunked writes of 400 documents per batch (below Firestore limit of 500) with exponential backoff on retry.

---

## 4. Calendar Architecture & Subproject Scheduling Overhaul
- **Problem Statement**: Previously, tasks with existing `deadline` or `scheduledDate` could clutter the calendar view.
- **New Architecture**:
  1. The calendar view relies on `calendarEvents` collection and filtered tasks.
  2. Because all imported tasks have dates stripped and projects have `showOnCalendar: false`, the calendar begins 100% empty for user `rAzbSJxTAPRP3ctC94XPpO83BT63`.
  3. Interactive Day Click: Clicking any cell in Month/Week/Day view allows adding a scheduled task, custom event, or manual time entry.
  4. Subproject "Add to Calendar":
     - Added directly to Subproject cards and subproject header.
     - Creates a dedicated `CalendarEvent` linked to the Subproject with custom date (`YYYY-MM-DD`), start time, end time, and description.
     - Does NOT force or rewrite child tasks.

---

## 5. JSON Import & Export Center Architecture
- **Export Capabilities**:
  - Single-click "Export My Data" generating a clean, human-readable JSON download.
  - Includes: `version: "2.0"`, `exportedAt`, `userId`, `projects`, `tasks`, `timeEntries`, `pomodoroSessions`, `reminders`, `autoActivities`, `calendarEvents`.
- **Import Capabilities**:
  - Drag-and-drop or file upload of `.json` files.
  - Step 1: Client-side JSON syntax check and structure validation.
  - Step 2: Conflict & duplication preview (counts of projects, subprojects, tasks, time entries).
  - Step 3 (Optional): "Review & Organize with Gemini" AI assistant stage.
  - Step 4: User configuration (strip dates checkbox default true, overwrite vs merge mode).
  - Step 5: Final confirmation modal before executing Firestore batch writes.

---

## 6. Server-Side Gemini API Proxy Integration
- **Proxy Architecture**:
  - Endpoint: `POST /api/gemini/review-import` in `server.ts`.
  - Package: `@google/genai` (official TypeScript SDK).
  - Model: `gemini-3.8-flash` (with configurable `GEMINI_MODEL` fallback).
  - Security: `GEMINI_API_KEY` accessed exclusively on the Node/Express server runtime; never exposed in browser bundles.
  - Client Proxy Call: Client sends sanitized structure summary (project hierarchy names, task volume, topics) to `/api/gemini/review-import`.
  - Privacy Consent: User is prompted before sending data to Gemini. If declined or offline, seamless fallback to direct import.

---

## 7. Affected Files & Code Modifications
1. `/server.ts` (NEW): Full-stack Express server with Vite middleware integration and `/api/gemini/review-import` endpoint.
2. `/package.json`: Update `"dev": "tsx server.ts"`, `"start": "node server.ts"`.
3. `/src/services/db.ts`: Add batch deletion, batch bulk import, and target user reset utilities.
4. `/src/services/importExportService.ts` (NEW): Dedicated import/export logic, schema validation, date stripping, and Gemini review client.
5. `/src/components/views/ProjectsTasksView.tsx`: Add "Add to Calendar" button on Subprojects, import/export quick actions, and calendar scheduling modal.
6. `/src/components/views/CalendarView.tsx`: Hardened date filtering, empty state verification, and streamlined event management.
7. `/src/components/common/ImportExportModal.tsx` (NEW): Full-featured JSON Import/Export & Gemini Review dialog.
8. `/src/components/common/AddToCalendarModal.tsx` (NEW): Subproject & task calendar event scheduling modal.
9. `/src/components/layout/Header.tsx` & `/src/components/views/SettingsView.tsx`: Access points for Import/Export Center.

---

## 8. Database Schema & Security Rule Alignment
- Collections affected: `projects`, `tasks`, `timeEntries`, `calendarEvents`, `pomodoroSessions`, `reminders`, `autoActivities`.
- Schema guarantees:
  - All records retain `userId`.
  - Subprojects have `parentId`.
  - Root projects have `parentId: null` or omitted.
  - Tasks retain `projectId`, `name`, `status`, `createdAt`, `updatedAt`.
  - Tasks omit `scheduledDate`, `deadline`, `dueDate`, `plannedDate`.
  - Security rules in `firestore.rules` verified: `request.auth.uid == userId`.

---

## 9. Quality Assurance & Test Matrix
- **Test 1**: Verify target user detection (`rAzbSJxTAPRP3ctC94XPpO83BT63`).
- **Test 2**: Safe reset verification (clear existing collections without impacting other users).
- **Test 3**: Ingestion of 17 root projects, 342 total projects, 2,166 tasks.
- **Test 4**: Task date stripping audit (0 tasks with `deadline` or `scheduledDate`).
- **Test 5**: Calendar empty state verification on initial load.
- **Test 6**: Subproject "Add to Calendar" creates discrete `CalendarEvent` without modifying tasks.
- **Test 7**: "Export My Data" generates valid downloadable JSON.
- **Test 8**: "Import JSON" modal parses, validates, and imports user backups.
- **Test 9**: Gemini API `/api/gemini/review-import` returns structured insights without exposing keys.
- **Test 10**: TypeScript compilation (`tsc --noEmit`) and Vite build (`npm run build`) pass cleanly with 0 errors.

---

## 10. Deployment & Execution Sequence
1. Create `server.ts` Express application with Vite dev middlewares.
2. Update `package.json` scripts (`dev`, `start`).
3. Implement `src/services/importExportService.ts` and update `src/services/db.ts`.
4. Implement `AddToCalendarModal.tsx` and integrate into `ProjectsTasksView.tsx`.
5. Implement `ImportExportModal.tsx` and attach to Header and Settings.
6. Deploy target user migration execution helper.
7. Verify build and run QA test matrix.
8. Generate `PRODUCTION_RELEASE_REPORT.md`.

---

## 11. Rollback & Disaster Recovery Procedures
- Before reset and import for user `rAzbSJxTAPRP3ctC94XPpO83BT63`, a snapshot of existing records is captured in memory and stored locally in browser storage (`chronos_backup_pre_migration_rAzbSJxTAPRP3ctC94XPpO83BT63`).
- Should any failure occur during batch import:
  1. The UI reports the exact batch index and error message.
  2. The pre-migration snapshot can be restored with a single click.
  3. The original JSON file `/public/assets/aistudio/chronos_17_projects_english_backup_fec8e88e.json` remains immutable on disk.

---

## 12. Sign-Off & Verification Criteria
- [x] Zero compilation errors (`compile_applet`).
- [x] Strict user isolation (`rAzbSJxTAPRP3ctC94XPpO83BT63`).
- [x] Exactly 17 root projects and 2,166 tasks.
- [x] Calendar starts 100% clean.
- [x] Subproject "Add to Calendar" operational.
- [x] Server-side Gemini API proxy operational.
- [x] Full UI theme and responsiveness preserved.
