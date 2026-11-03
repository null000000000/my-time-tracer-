# Chronos Guest Mode & Temporary Workspace Implementation Plan

**Author:** Senior Full-Stack Engineer & Software Architect  
**System:** Chronos Time Tracker & Productivity Workspace  
**Status:** Approved for Implementation  
**Version:** 1.0.0-guest-release  

---

## 1. Executive Summary & Core Objective

The primary objective is to implement a robust, secure, and isolated **Guest Mode** and **Temporary Workspace** for Chronos. This feature empowers visitors to explore, configure, and operate the complete productivity system—including Projects, Subprojects, Tasks, Calendar Scheduling, Time Tracking, Pomodoro, and Reports—without providing credentials, email addresses, or authenticating via Google.

All guest data is confined strictly to the user's active browser tab via `sessionStorage` (`chronos_guest_session_v1`). Zero unauthenticated records are written to Cloud Firestore, zero anonymous users are created in Firebase Authentication, and zero data is leaked to `localStorage`. Refreshing the active tab preserves the workspace; closing the tab cleanly purges the session. When the user chooses to create an account or sign in, an atomic, safe migration workflow allows them to review, import, or discard their temporary work without data loss.

---

## 2. Storage Strategy & Architecture (`sessionStorage`)

### 2.1 Storage Key & Namespace
- **Primary Key:** `chronos_guest_session_v1`
- **Engine:** `window.sessionStorage`
- **Tab Isolation:** Because `sessionStorage` is strictly scoped to the top-level browsing context (tab), distinct browser tabs or windows maintain independent temporary sessions with zero cross-contamination.

### 2.2 Session Data Schema
```typescript
export interface GuestSessionData {
  version: 1;
  sessionId: string;            // e.g., 'guest_sess_<uuid/timestamp>'
  createdAt: string;            // ISO 8601 timestamp
  updatedAt: string;            // ISO 8601 timestamp
  projects: Project[];          // Root domains, projects, subprojects
  tasks: Task[];                // Associated tasks
  calendarEvents: CalendarEvent[]; // Calendar schedule & milestones
  timeEntries: TimeEntry[];     // Historical tracked sessions
  pomodoroSessions: PomodoroSession[]; // Completed Pomodoro intervals
  reminders: Reminder[];        // Scheduled reminders
  autoActivities: AutoActivity[]; // Detected application activities
  activeTimer: ActiveTimer | null; // Currently running or paused timer
  preferences: UserSettings;    // User preferences (format, sound, etc.)
}
```

### 2.3 Quota & Storage Safety
- Typical workspace size for hundreds of projects and tasks is under 300 KB, well within browser `sessionStorage` limits (typically 5–10 MB).
- A safe-write wrapper catches `QuotaExceededError` or `SecurityError` (e.g. strict incognito block) and displays a graceful toast rather than crashing the application.

---

## 3. Storage Adapter & Data Layer Interception

### 3.1 Transparent Service Facade
`src/services/db.ts` serves as the single source of truth for database operations across all UI views (`CalendarView`, `ProjectsTasksView`, `TimeTrackerView`, `DashboardView`, etc.).
- When `isGuest` is true (or when `userId.startsWith('guest_')`):
  - CRUD operations route directly to `src/services/guestStorage.ts`.
  - Firestore SDK calls (`setDoc`, `updateDoc`, `deleteDoc`, `getDocs`, `onSnapshot`) are **never** executed.
- When `isGuest` is false:
  - Standard Firestore operations proceed normally with full security rules enforcement.

### 3.2 Real-Time Event Bus for Subscriptions
To maintain identical behavior with Firestore's `onSnapshot`:
- `guestStorage.ts` maintains an in-memory Pub/Sub event bus (`GuestEventBus`).
- Whenever a guest project, task, entry, or timer is created, updated, or deleted, an event is emitted.
- All active view subscriptions (`subscribeProjects`, `subscribeTasks`, `subscribeCalendarEvents`, `subscribeActiveTimer`) receive immediate updates synchronously without polling.

---

## 4. Session Lifecycle Management

1. **Initialization:**
   - On clicking "Continue as Guest" on `LoginView`, `startGuestSession()` generates a unique `sessionId` (`guest_sess_${timestamp}_${rand}`), initializes an empty workspace with default `UserSettings`, saves to `sessionStorage`, and transitions the auth state.
2. **Reload / Refresh:**
   - On app mount (`AuthProvider`), if `auth.currentUser` is null, the app inspects `sessionStorage.getItem('chronos_guest_session_v1')`.
   - If present and valid, the guest session is restored automatically.
3. **Exit / Logout:**
   - Guest can select "Exit Guest Mode" from the user menu.
   - Prompts confirmation: "Exiting will clear this temporary session. Make sure to export your JSON or create an account if you wish to keep your data."
   - On confirmation, `chronos_guest_session_v1` is removed and the user returns to `LoginView`.
4. **Natural Termination:**
   - Closing the browser tab discards `sessionStorage` naturally with zero residual footprint.

---

## 5. Authentication Screen & Entry Experience (`LoginView.tsx`)

- **Primary Options:**
  1. `Continue with Google` (Authenticated cloud account)
  2. `Continue as Guest` (Instant temporary workspace)
- **Visual Presentation:**
  - Styled with high-contrast, modern engineering aesthetic (`#161b22`, subtle borders, blue accenting).
  - Clear indicator: *"No account required. Your workspace stays in this browser tab until closed."*
  - Zero friction, single-click entry.

---

## 6. Workspace Indicator & Top Banner (`GuestModeBanner.tsx`)

- A sleek, non-intrusive status banner positioned at the top of the main layout:
  - Pill badge: `GUEST SESSION` (Amber/Orange accent)
  - Text: `Temporary Workspace — Your data is stored in this browser tab.`
  - CTA Button: `Create Account to Save Work` (Opens sign-in modal without clearing active data)
  - Secondary Action: `Export JSON` (Quick local backup before closing)
- Header integration: Profile avatar replaced with a `Guest` badge with quick-access menu (Export Workspace, Save to Account, Exit).

---

## 7. Account Conversion & Migration Workflow

### 7.1 Conversion Trigger
When in Guest Mode, clicking `Create Account to Save Work` or signing in via Google triggers an account link flow:
1. Guest signs in with Google via `signInWithPopup`.
2. Upon successful authentication, `AuthContext` detects that an active guest session exists containing user-created data (`hasGuestData(guestSession)`).
3. Rather than silently overwriting the user's cloud account or silently wiping guest data, the application displays the **Guest Data Transfer Review Modal**.

### 7.2 Transfer Review Modal (`GuestMigrationModal.tsx`)
- Displays an itemized count of all temporary work created during the session:
  - Projects count
  - Subprojects count
  - Tasks count
  - Calendar Events count
  - Tracked Time Entries count
  - Pomodoro Sessions count
  - Reminders count
- Three distinct user choices:
  1. **Import Guest Data:**
     - Atomically sends data to the migration pipeline.
     - Resolves ID mappings (linking tasks to their new permanent subprojects/projects).
     - Inserts records into Firestore under the user's permanent `uid`.
     - Purges `chronos_guest_session_v1`.
     - Displays success toast and updates the active workspace.
  2. **Discard Guest Data:**
     - Clears `chronos_guest_session_v1`.
     - Closes modal and opens the user's existing cloud workspace cleanly.
  3. **Cancel:**
     - Reverts authentication state (signs out of Firebase).
     - Returns user to their guest session without losing anything.

---

## 8. Server-Side Migration Endpoint (`server.ts`)

### 8.1 Route Definition
- `POST /api/guest/migrate`
- **Headers:** `Authorization: Bearer <firebase_id_token>`
- **Payload:** `GuestSessionData` (Projects, Tasks, TimeEntries, CalendarEvents, PomodoroSessions, Reminders)

### 8.2 Execution & Safety Guarantees
1. **Token Verification:** Validates user identity and extracts authenticated `uid`.
2. **ID Mapping & Collision Prevention:**
   - Generates clean permanent document IDs (`proj_<timestamp>_<hash>`).
   - Maintains an ID translation map (`idMap: Record<oldId, newId>`) so `task.projectId` and `project.parentId` relationships remain 100% intact.
3. **Batch Writing:**
   - Uses Firestore batch writes or parallel batched operations (max 500 operations per batch).
   - All written documents have `userId: authenticatedUid`.
4. **Idempotency & Rollback:**
   - If any step fails, the server returns an error.
   - Client does NOT delete the guest session from `sessionStorage` unless the server returns HTTP 200 with `{ success: true }`.

---

## 9. Security, Isolation & Multi-Tenant Integrity

- **Database Protection:** Cloud Firestore rules reject any request with an unauthenticated `auth == null`. Because guests never call Firestore, no permission errors occur.
- **Zero Cross-Talk:** Guest sessions do not share identifiers with real users. The `targetUser` (`rAzbSJxTAPRP3ctC94XPpO83BT63`) and other permanent user data are completely unaffected.
- **XSS & Injection Protection:** All input fields continue to be sanitized, and payloads pass through `cleanPayload` before any storage or API transmission.

---

## 10. AI (Gemini) Integration & Rate Limiting in Guest Mode

- If a guest attempts to use AI features (e.g., AI Import Review):
  - Client checks rate-limiting counter in `sessionStorage` (max 5 requests per guest session).
  - Explicit notification informs the user: *"You are using the Gemini AI Review service in Guest Mode."*
  - The fallback heuristic engine remains available if the API key is not present or rate limits are reached.

---

## 11. Edge Cases & Handling

| Scenario | Behavior | Mitigation |
| :--- | :--- | :--- |
| User refreshes browser | Session retained | `sessionStorage` reloaded on mount |
| User closes browser tab | Session cleared | Expected behavior; prominent export option provided |
| User opens second tab | Independent new session | Native browser `sessionStorage` isolation |
| User signs in with existing account | Modal prompts to Import or Discard | User retains full control over merging vs keeping existing account |
| Server migration fails | Zero data loss | `sessionStorage` remains untouched; user can retry or export JSON |
| Private Browsing mode blocks storage | Graceful fallback | In-memory fallback if `sessionStorage` is inaccessible |

---

## 12. Verification & Testing Strategy

- **Automated Compilation:** Linting (`npm run lint`) and TypeScript compilation (`npm run build`).
- **Functional Testing Matrix:**
  1. Login screen "Continue as Guest" flow.
  2. Full CRUD testing in Guest Mode (Projects, Subprojects, Tasks, Calendar Events, Timers).
  3. Page refresh persistence test.
  4. Tab isolation test.
  5. Account conversion & migration test with ID relationship verification.
  6. Failure rollback test.
