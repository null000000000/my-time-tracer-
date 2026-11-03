import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/common/Toast';
import { TimeTrackerProvider, useTimeTracker } from './context/TimeTrackerContext';
import { NavigationTab } from './types';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { LoginView } from './components/auth/LoginView';
import { GuestModeBanner } from './components/common/GuestModeBanner';
import { GuestMigrationModal } from './components/common/GuestMigrationModal';

// Views
import { DashboardView } from './components/views/DashboardView';
import { TimeTrackerView } from './components/views/TimeTrackerView';
import { ProjectsTasksView } from './components/views/ProjectsTasksView';
import { TimesheetView } from './components/views/TimesheetView';
import { CalendarView } from './components/views/CalendarView';
import { ReportsView } from './components/views/ReportsView';
import { PomodoroView } from './components/views/PomodoroView';
import { TimeEstimatesView } from './components/views/TimeEstimatesView';
import { AutoTrackerView } from './components/views/AutoTrackerView';
import { RemindersAuditView } from './components/views/RemindersAuditView';
import { SettingsView } from './components/views/SettingsView';

const MainApp: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState<NavigationTab>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-[#090a0f] text-slate-300 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        <p className="text-xs font-mono tracking-wider text-slate-400">INITIALIZING CHRONOS...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  return (
    <div className="min-h-screen bg-[#090a0f] text-slate-100 flex overflow-hidden font-sans">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block shrink-0">
        <Sidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-64 max-w-[80vw] h-full z-10">
            <Sidebar
              currentTab={currentTab}
              onSelectTab={(tab) => {
                setCurrentTab(tab);
                setMobileMenuOpen(false);
              }}
              collapsed={false}
              onToggleCollapse={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <GuestModeBanner />
        <Header
          currentTab={currentTab}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onQuickTrack={() => setCurrentTab('tracker')}
        />

        <main className="flex-1 overflow-y-auto">
          {currentTab === 'dashboard' && <DashboardView onNavigate={setCurrentTab} />}
          {currentTab === 'tracker' && <TimeTrackerView />}
          {currentTab === 'projects' && <ProjectsTasksView />}
          {currentTab === 'timesheet' && <TimesheetView />}
          {currentTab === 'calendar' && <CalendarView />}
          {currentTab === 'reports' && <ReportsView />}
          {currentTab === 'pomodoro' && <PomodoroView />}
          {currentTab === 'estimates' && <TimeEstimatesView />}
          {currentTab === 'autotracker' && <AutoTrackerView />}
          {currentTab === 'reminders_audit' && <RemindersAuditView />}
          {currentTab === 'settings' && <SettingsView />}
        </main>

        <GuestMigrationModal />
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <TimeTrackerProvider>
          <MainApp />
        </TimeTrackerProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
