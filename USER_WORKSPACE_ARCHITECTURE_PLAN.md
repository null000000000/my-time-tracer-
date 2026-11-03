# Chronos User-Owned Workspaces, Isolated JSON Imports & Default Dataset Removal Architecture Plan

**Author:** Senior Software Architect, Firebase Security Engineer & Full-Stack Developer  
**System:** Chronos Personal Time Tracking & Productivity Architecture  
**Status:** Approved for Architectural Implementation  
**Version:** 2.0.0-multi-tenant-isolation  

---

## 1. Current Default Dataset Source

An exhaustive investigation of the Chronos codebase identified the following locations where a specific personal JSON dataset was exposed or staged:
1. **Server Endpoint (`/server.ts`):**
   - Route `GET /api/backup-asset` explicitly read `public/assets/aistudio/chronos_17_projects_english_backup_fec8e88e.json` and served it globally.
2. **Frontend Ingestion Modal (`src/components/common/ImportExportModal.tsx`):**
   - Included Tab 3 (`activeTab === 'seed'`), labeled *"Chronos Production 17-Project Architecture"*.
   - Included button *"Load Official 17 Projects Dataset into Importer"*, calling `handleLoadOfficial17Projects()` which fetched `/api/backup-asset`.
   - Referenced hardcoded constant `TARGET_USER_ID = 'rAzbSJxTAPRP3ctC94XPpO83BT63'`.
3. **Service Logic (`src/services/importExportService.ts`):**
   - Exported `TARGET_USER_ID = 'rAzbSJxTAPRP3ctC94XPpO83BT63'`.
   - When sanitizing datasets, preserved original IDs or fallback identifiers without generating an `importId` or remapping IDs to prevent collisions across multiple imports.

---

## 2. Root Cause Analysis

The root cause of this architectural misconfiguration stemmed from prior deployment tasks where the application was asked to ingest a specific user's curriculum dataset. In doing so, the dataset was placed into `public/assets/` and wired into an API endpoint (`/api/backup-asset`) and modal tab (`seed`) as a convenience mechanism.

This created an anti-pattern:
- The system inadvertently privileged one specific JSON dataset as an "official" starter kit.
- New users or guests could click "Load Official 17 Projects" or have that dataset treated as a default fallback.
- The original user IDs (`rAzbSJxTAPRP3ctC94XPpO83BT63`) embedded within the JSON risked conflating user ownership with data content.

**Resolution:**
The application must be completely agnostic to any user's data. Chronos is an empty, multi-user productivity platform. Any JSON file uploaded by any user is simply that user's private data, owned exclusively by their verified Firebase UID (or Guest Session ID).

---

## 3. Existing Database Structure

Chronos uses Cloud Firestore with top-level collections partitioned by `userId`:
- `users/{userId}`: User settings, time format, pomodoro preferences.
- `projects/{projectId}`: Projects & subprojects, containing `userId`, `name`, `color`, `parentId`, `status`.
- `tasks/{taskId}`: Tasks, containing `userId`, `projectId`, `name`, `status`, `estimatedHours`, etc.
- `calendarEvents/{eventId}`: Events, containing `userId`, `projectId`, `date`, `type`.
- `timeEntries/{entryId}`: Historical logs, containing `userId`, `projectId`, `startTime`, `duration`.
- `activeTimers/{userId}`: Single active timer per user.
- `pomodoroSessions/{sessionId}`: Pomodoro records with `userId`.
- `reminders/{reminderId}`: Reminders with `userId`.
- `autoActivities/{activityId}`: Detected activity staging with `userId`.

**Extension:**
We introduce an `imports/{importId}` collection:
- `imports/{importId}`: Tracks metadata for each import performed by a user (`userId`, `importId`, `sourceFileName`, `createdAt`, `counts`, `schemaVersion`).

---

## 4. New Ownership Model

We establish three strictly isolated data contexts:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        CHRONOS DATA CONTEXTS                           │
├──────────────────────────┬──────────────────────────┬──────────────────┤
│ 1. Authenticated User    │ 2. Guest Temporary       │ 3. Public App    │
│    Workspace (Cloud)     │    Workspace (Tab)       │    Configuration │
├──────────────────────────┼──────────────────────────┼──────────────────┤
│ • Owner: Firebase UID    │ • Owner: GuestSessionId  │ • Zero personal  │
│ • Source: Verified Token │ • Scope: sessionStorage  │   records        │
│ • Storage: Firestore     │ • Key: chronos_guest_... │ • Static app     │
│ • Strict ABAC Security   │ • Zero Firestore writes  │   metadata only  │
└──────────────────────────┴──────────────────────────┴──────────────────┘
```

1. **Authenticated User Workspace:**
   - Ownership is strictly bound to `request.auth.uid`.
   - Never trust frontend-supplied `userId` or JSON metadata.
   - All Firestore documents must have `userId: request.auth.uid`.
2. **Guest Temporary Workspace:**
   - Backed exclusively by browser tab `sessionStorage` (`chronos_guest_session_v1`).
   - Ownership bound to `guest_sess_<uuid>`.
   - Zero Firestore writes.
3. **Public App Configuration:**
   - System version, theme assets, and empty state templates only.
   - Absolutely zero user projects, tasks, or sample datasets.

---

## 5. JSON Import Architecture

Every JSON import uploaded by a user is processed through a strict pipeline:

```text
User uploads JSON file
        ↓
Client parses & validates JSON syntax
        ↓
Client or Backend ignores all incoming 'userId' / 'uid' metadata
        ↓
Generate unique 'importId' (e.g., imp_1730648400000_a1b2c3)
        ↓
Build ID Translation Map (oldId -> newId)
        ↓
Remap Parent References (parentId = idMap.get(parentId))
        ↓
Remap Task References (projectId = idMap.get(projectId))
        ↓
Assign verified owner:
  - If Authenticated: verified Firebase UID
  - If Guest: active Guest Session ID
        ↓
Batch Write / Commit into user's private workspace
        ↓
Write Provenance Record to `imports/{importId}`
```

### Critical Rule: Stripping Embedded Ownership Metadata
Incoming JSON files often have obsolete `userId`, `uid`, `ownerUid`, or email fields from past exports. **All such fields are completely stripped and replaced with the verified owner identifier of the current session.** No user can ever claim ownership of records on behalf of someone else.

---

## 6. Import ID and ID Mapping Strategy

To prevent ID collisions across multiple imports and maintain relational integrity:
1. **Import ID Generation:**
   ```typescript
   const importId = `imp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
   ```
2. **ID Mapping Algorithm:**
   ```typescript
   const idMap = new Map<string, string>();

   // 1. Map all projects to guaranteed unique IDs
   for (const p of rawProjects) {
     const newId = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
     idMap.set(p.id, newId);
   }

   // 2. Resolve parentId using idMap
   const sanitizedProjects = rawProjects.map(p => ({
     ...p,
     id: idMap.get(p.id)!,
     userId: verifiedOwnerId,
     parentId: p.parentId ? (idMap.get(p.parentId) || null) : null,
     importId,
   }));

   // 3. Resolve taskId and projectId
   const sanitizedTasks = rawTasks.map(t => ({
     ...t,
     id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
     userId: verifiedOwnerId,
     projectId: idMap.get(t.projectId) || t.projectId,
     importId,
   }));
   ```
3. **Multi-Import Safety:**
   - A user can import `projects_1.json`, then import `projects_2.json`. Both will be preserved cleanly without ID collision or overwriting.

---

## 7. Empty Workspace Initialization

- **Zero Automatic Seeding:**
  - `onAuthStateChanged` registers a new user profile doc `users/{uid}` with default time preferences (24h format, pomodoro intervals).
  - No default projects or tasks are created.
  - An empty workspace is a completely valid state.
- **Empty State UX:**
  - `DashboardView`, `ProjectsTasksView`, `CalendarView`, and `TimesheetView` render clean, welcoming empty states.
  - Clear calls to action: *"Create your first project manually"* or *"Import your own JSON backup"*.

---

## 8. Guest Integration

- Guests use the exact same Import UI and validation engine.
- Instead of Firestore, guest imports write to `chronos_guest_session_v1` in `sessionStorage`.
- Supports multiple consecutive imports within the guest session.
- When converting from Guest to Authenticated:
  - If guest has imported or created data, `GuestMigrationModal` prompts to Import, Discard, or Cancel.
  - On import, the server/client pipeline re-maps all IDs and sets `userId = user.uid`.

---

## 9. Firestore Security Rules

Hardened rules enforce the Zero-Trust, Default-Deny principle:
1. **Catch-All Default Deny:**
   ```javascript
   match /{document=**} { allow read, write: if false; }
   ```
2. **Immutable Ownership on Update:**
   ```javascript
   allow update: if isSignedIn()
     && resource.data.userId == request.auth.uid
     && request.resource.data.userId == resource.data.userId; // Cannot transfer ownership
   ```
3. **Creation Gate:**
   ```javascript
   allow create: if isSignedIn()
     && request.resource.data.userId == request.auth.uid
     && isValidId(docId);
   ```
4. **List Query Enforcer:**
   ```javascript
   allow list: if isSignedIn() && resource.data.userId == request.auth.uid;
   ```
5. **Imports Collection Protection:**
   ```javascript
   match /imports/{importId} {
     allow get, list, delete: if isSignedIn() && resource.data.userId == request.auth.uid;
     allow create: if isSignedIn() && request.resource.data.userId == request.auth.uid;
   }
   ```

---

## 10. Backend Authorization (`server.ts`)

- **Removal of Default Dataset:**
  - Delete `app.get('/api/backup-asset')`.
  - Remove all references to `chronos_17_projects_english_backup_fec8e88e.json`.
- **Import Validation Endpoint (`/api/workspace/import`):**
  - Verifies `Authorization: Bearer <token>`.
  - Validates schema, counts, and ownership.
- **Rate-Limiting & AI Safety:**
  - Gemini review proxy accepts only the user-provided payload.
  - Never sends another user's workspace.
  - Rate-limited per user/guest session.

---

## 11. Frontend Cache & Listener Isolation

When switching accounts or logging out:
1. `TimeTrackerContext` unsubscribes from all Firestore listeners (`unsubProj`, `unsubTasks`, `unsubEntries`, `unsubActive`).
2. Clears in-memory arrays: `projects = []`, `tasks = []`, `timeEntries = []`.
3. When new user authenticates, attaches fresh listeners querying `where('userId', '==', newUid)`.
4. Zero cross-tenant data caching in memory or storage.

---

## 12. Existing Data Cleanup Strategy

1. **Removal of Code Dependencies:**
   - Remove `/api/backup-asset` in `server.ts`.
   - Remove "Seed 17 Projects" tab from `ImportExportModal.tsx`.
   - Remove hardcoded `TARGET_USER_ID` constants.
2. **Database Hygiene:**
   - Any document in Firestore must have an explicit, valid `userId`.
   - No documents with ambiguous or global ownership will be queried or exposed.

---

## 13. Security & Testing Plan

1. **Test 1 — Empty Workspace:** Fresh account verification (0 projects, 0 tasks, 0 calendar events).
2. **Test 2 — Independent User Imports:** User A, User B, User C import separate files; verify strict non-overlapping views.
3. **Test 3 — Cross-User Access Attempts:** Attempt to query or write records belonging to another UID; verify rejection.
4. **Test 4 — Multi-Import Collision Safety:** User imports 2 files consecutively; verify both coexist with independent `importId`s.
5. **Test 5 — Account Switching:** Switch auth state; verify zero memory leak.
6. **Test 6 — Guest Mode Isolation:** Guest import stays in `sessionStorage`; zero Firestore writes.
7. **Test 7 — Relational Integrity:** Parent-child links and project-task associations verified 100% intact.

---

## 14. Performance Plan

- Queries are scoped strictly via `where('userId', '==', uid)`.
- Client-side sorting on indexed fields (`createdAt`, `startTime`).
- Batch writes limited to chunks of 400 operations.
- Avoid unnecessary full dataset re-downloads.

---

## 15. Rollback Strategy

- Complete backup of code state maintained.
- If migration issues arise, previous build artifact can be redeployed immediately.
- User data integrity is mathematically protected by Firestore rules forbidding unauthorized deletions or transfers.
