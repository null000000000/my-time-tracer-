# Chronos Release Notes: Guest Mode & Temporary Workspace (v1.0.0)

**Release Date:** November 3, 2026  
**Build Status:** Production-Ready  
**Framework:** React 19 + TypeScript + Express + Cloud Firestore  

---

## 1. Overview

Chronos now features a complete, zero-friction **Guest Mode** and **Temporary Workspace**. Users can explore, organize, and use the full personal productivity and time tracking system without creating an account or providing an email address.

All activities during a guest session remain strictly temporary, stored exclusively in the active browser tab via `sessionStorage`. When the user is ready to make their work permanent, a safe account conversion and migration workflow seamlessly transfers all projects, tasks, calendar schedules, and time entries into their Google-authenticated cloud workspace.

---

## 2. Key Features Added

### 2.1 "Continue as Guest" Authentication Option
- Added a prominent, styled **Continue as Guest** button on the Chronos authentication entry screen.
- Visitors can launch into the workspace immediately with one click.
- Clear explanatory messaging informs users that their temporary session belongs to the current browser tab.

### 2.2 Isolated Tab-Scoped Storage Architecture
- Powered by `window.sessionStorage` under the versioned key `chronos_guest_session_v1`.
- **Zero Database Writes:** No records or anonymous user profiles are written to Cloud Firestore during guest sessions.
- **Zero LocalStorage Leakage:** Does not touch `localStorage`, guaranteeing no stale data is left in the browser.
- **Refresh Resilience:** Reloading the current browser tab preserves the entire workspace, active timers, and configuration.
- **Natural Termination:** Closing the browser tab terminates the guest session naturally.

### 2.3 Transparent Storage Adapter (`db.ts`)
- All database CRUD calls (`createProject`, `createTask`, `createCalendarEvent`, `createTimeEntry`, `saveActiveTimer`, etc.) automatically route to `guestStorage` when a guest session is active.
- Features a synchronized in-memory Pub/Sub event bus that mirrors Firestore's `onSnapshot` real-time listeners.
- All views (`Dashboard`, `Projects & Tasks`, `Calendar`, `Timesheet`, `Pomodoro`, `Time Estimates`) function identically with zero code modifications needed inside the views.

### 2.4 Guest Mode Top Status Banner (`GuestModeBanner.tsx`)
- Sleek, non-intrusive banner at the top of the workspace.
- Displays live item count breakdown: Projects, Tasks, and Calendar Events.
- **Export JSON Action:** One-click download of the complete guest session data for immediate local backup.
- **Save Work (Sign In) Action:** Direct entry into Google authentication to convert the temporary session into a permanent cloud account.
- **Exit Action:** Safe exit dialog with confirmation to prevent accidental loss.

### 2.5 Account Conversion & Data Transfer Review Modal (`GuestMigrationModal.tsx`)
- Triggered automatically when an active guest signs in to a Google account.
- Halts automatic overwrites and presents a comprehensive review of all work created during the session:
  - Total Projects (Root and Subprojects)
  - Tasks
  - Calendar Events & Deadlines
  - Time Tracker Entries
  - Pomodoro Sessions
  - Reminders
- Offers 3 distinct user choices:
  1. **Import Guest Data:** Atomically translates IDs, preserves parent-child project relationships, and saves all items to the user's permanent Firestore account.
  2. **Discard Guest Data:** Purges the temporary session and loads the user's existing cloud data cleanly.
  3. **Cancel:** Aborts sign-in and returns the user safely to their guest workspace without losing anything.

### 2.6 Server-Side Migration Endpoint (`server.ts`)
- `POST /api/guest/migrate`
- Validates Bearer token authentication from Firebase Auth.
- Validates schema, counts, and parent-child integrity prior to ingestion.

### 2.7 AI (Gemini) Rate-Limiting & Protection
- Guest access to Gemini AI features is rate-limited (up to 5 requests per 10 minutes).
- Seamless fallback to the high-fidelity heuristic engine if API limits are reached or models are busy.

---

## 3. Privacy, Isolation & Security Guarantees

| Security Pillar | Implementation Guarantee |
| :--- | :--- |
| **User Data Isolation** | Existing user accounts (including target user `rAzbSJxTAPRP3ctC94XPpO83BT63`) are completely isolated. |
| **Firestore Security Rules** | Rules require valid `request.auth.uid`. Since guests never write to Firestore, zero permission denials occur. |
| **Tab Isolation** | Browser `sessionStorage` enforces complete sandbox isolation across tabs and windows. |
| **Rollback Safety** | If account migration encounters an error, guest data remains 100% intact in `sessionStorage` for retry or JSON export. |

---

## 4. Verification & Build Confirmation

- **TypeScript Compilation:** `tsc --noEmit` verified with 0 errors.
- **Vite Production Build:** `npm run build` compiled successfully.
- **Server Health Check:** `GET /api/health` reports status `ok` with `guestModeSupported: true`.
- **Migration API:** `POST /api/guest/migrate` verified with 401 unauthenticated and 200 authorized test requests.
