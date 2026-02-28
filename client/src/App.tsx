import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import Dashboard from './pages/Dashboard';
import TestCases from './pages/TestCases';
import TestRun from './pages/TestRun';
import Reports from './pages/Reports';
import Devices from './pages/Devices';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="test-cases" element={<TestCases />} />
        <Route path="test-run" element={<TestRun />} />
        <Route path="reports" element={<Reports />} />
        <Route path="devices" element={<Devices />} />
      </Route>
    </Routes>
  );
}
