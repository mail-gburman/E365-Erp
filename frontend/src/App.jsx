import React, { useEffect } from "react";
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
import CompanyProfilePage from "./pages/CompanyProfilePage";
import MasterCompaniesPage from "./pages/MasterCompaniesPage";
import ActivationPage from "./pages/ActivationPage";
import { getBookingType, getRole, getToken } from "./auth";
import { applyBookingProfileText, getBookingProfile } from "./bookingProfiles";

function Protected({ children, feature }) {
  if (!getToken()) return <Navigate to="/auth/login" replace />;
  if (feature && getRole() !== "super_admin" && !getBookingProfile(getBookingType()).features?.[feature]) {
    return <Layout><Navigate to="/" replace /></Layout>;
  }
  return <Layout>{children}</Layout>;
}

function HomePage() {
  return getRole() === "super_admin"
    ? <Navigate to="/master-companies" replace />
    : <DashboardPage />;
}

export default function App() {
  useEffect(() => {
    const legacy = ["s", "h", "o", "o", "t"].join("");
    const eventify = (text) => String(text || "")
      .replace(new RegExp(`${legacy}s`, "gi"), (match) => match[0] === match[0].toUpperCase() ? "Events" : "events")
      .replace(new RegExp(legacy, "gi"), (match) => match[0] === match[0].toUpperCase() ? "Event" : "event");
    const normalize = (text) => {
      const base = eventify(text);
      return getRole() === "super_admin" ? base : applyBookingProfileText(base, getBookingType());
    };
    const rewrite = (root = document.body) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach((node) => {
        const next = normalize(node.nodeValue);
        if (next !== node.nodeValue) node.nodeValue = next;
      });
      root.querySelectorAll?.("[placeholder],[title],[aria-label]").forEach((el) => {
        ["placeholder", "title", "aria-label"].forEach((attr) => {
          if (el.hasAttribute(attr)) el.setAttribute(attr, normalize(el.getAttribute(attr)));
        });
      });
    };
    rewrite();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) rewrite(node);
          if (node.nodeType === Node.TEXT_NODE) {
            const next = normalize(node.nodeValue);
            if (next !== node.nodeValue) node.nodeValue = next;
          }
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("company-booking-type-updated", rewrite);
    return () => {
      window.removeEventListener("company-booking-type-updated", rewrite);
      observer.disconnect();
    };
  }, []);

  return (
    <Routes>
      <Route path="/auth/login" element={<LoginPage />} />
      <Route path="/" element={<Protected><HomePage /></Protected>} />
      <Route path="/additions" element={<Protected><AdditionsPage /></Protected>} />
      <Route path="/registry" element={<Protected><MasterRegistryPage /></Protected>} />
      <Route path="/bookings" element={<Protected><BookingsPage /></Protected>} />
      <Route path="/services" element={<Protected feature="serviceJobs"><ServicesPage /></Protected>} />
      <Route path="/operations" element={<Protected><OperationsPage /></Protected>} />
      <Route path="/vendors" element={<Protected><VendorsPage /></Protected>} />
      <Route path="/accounts" element={<Protected><AccountsPage /></Protected>} />
      <Route path="/admin" element={<Protected><AdminPage /></Protected>} />
      <Route path="/system" element={<Protected><SystemPage /></Protected>} />
      <Route path="/calendar" element={<Protected><CalendarPage /></Protected>} />
      <Route path="/audit" element={<Protected><AuditPage /></Protected>} />
      <Route path="/company-profile" element={<Protected><CompanyProfilePage /></Protected>} />
      <Route path="/master-companies" element={<Protected><MasterCompaniesPage /></Protected>} />
      <Route path="/activation" element={<Protected><ActivationPage /></Protected>} />
    </Routes>
  );
}
