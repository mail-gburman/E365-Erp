import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import AdditionsPage from "./pages/AdditionsPage";
import MasterRegistryPage from "./pages/MasterRegistryPage";
import BookingsPage from "./pages/BookingsPage";
import ServicesPage from "./pages/ServicesPage";
import OperationsPage from "./pages/OperationsPage";
import VendorsPage from "./pages/VendorsPage";
import AccountsPage from "./pages/AccountsPage";
import AdminPage from "./pages/AdminPage";
import SystemPage from "./pages/SystemPage";
import AuditPage from "./pages/AuditPage";
import CalendarPage from "./pages/CalendarPage";
import { getToken } from "./auth";

function Protected({ children }) {
  return getToken() ? <Layout>{children}</Layout> : <Navigate to="/auth/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/auth/login" element={<LoginPage />} />
      <Route path="/" element={<Protected><DashboardPage /></Protected>} />
      <Route path="/additions" element={<Protected><AdditionsPage /></Protected>} />
      <Route path="/registry" element={<Protected><MasterRegistryPage /></Protected>} />
      <Route path="/bookings" element={<Protected><BookingsPage /></Protected>} />
      <Route path="/services" element={<Protected><ServicesPage /></Protected>} />
      <Route path="/operations" element={<Protected><OperationsPage /></Protected>} />
      <Route path="/vendors" element={<Protected><VendorsPage /></Protected>} />
      <Route path="/accounts" element={<Protected><AccountsPage /></Protected>} />
      <Route path="/admin" element={<Protected><AdminPage /></Protected>} />
      <Route path="/system" element={<Protected><SystemPage /></Protected>} />
      <Route path="/calendar" element={<Protected><CalendarPage /></Protected>} />
      <Route path="/audit" element={<Protected><AuditPage /></Protected>} />
    </Routes>
  );
}
