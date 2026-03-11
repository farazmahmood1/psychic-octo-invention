import { Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout } from './layouts/DashboardLayout';
import { ProtectedRoute } from './lib/protected-route';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ChatsPage } from './pages/ChatsPage';
import { ConversationDetailPage } from './pages/ConversationDetailPage';
import { UsagePage } from './pages/UsagePage';
import { SkillsPage } from './pages/SkillsPage';
import { AuditPage } from './pages/AuditPage';
import { SettingsPage } from './pages/SettingsPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { JobsPage } from './pages/JobsPage';
import { BookkeepingPage } from './pages/BookkeepingPage';
import { SecurityPage } from './pages/SecurityPage';
import { MemoryPage } from './pages/MemoryPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="chats" element={<ChatsPage />} />
        <Route path="chats/:id" element={<ConversationDetailPage />} />
        <Route path="usage" element={<UsagePage />} />
        <Route path="skills" element={<SkillsPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="integrations" element={<IntegrationsPage />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route path="bookkeeping" element={<BookkeepingPage />} />
        <Route path="memory" element={<MemoryPage />} />
        <Route path="security" element={<SecurityPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
