import { serverLogout } from "./api";

const DEVICE_ID_KEY = "e365_device_id";

export function getToken() {
  return localStorage.getItem("e365_token") || "";
}

export function setSession(data) {
  localStorage.setItem("e365_token", data.access_token);
  localStorage.setItem("e365_role", data.role);
  localStorage.setItem("e365_username", data.username);
  if (data.company_id) localStorage.setItem("e365_company_id", String(data.company_id));
  else localStorage.removeItem("e365_company_id");
  if (data.company_name) localStorage.setItem("e365_company_name", data.company_name);
  else localStorage.removeItem("e365_company_name");
  if (data.booking_type) localStorage.setItem("e365_booking_type", data.booking_type);
  else localStorage.removeItem("e365_booking_type");
  if (data.permissions_json) localStorage.setItem("e365_permissions", data.permissions_json);
  else localStorage.removeItem("e365_permissions");
}

export async function clearSession() {
  // Revoke the session server-side before clearing local storage
  await serverLogout();
  localStorage.removeItem("e365_token");
  localStorage.removeItem("e365_role");
  localStorage.removeItem("e365_username");
  localStorage.removeItem("e365_permissions");
  localStorage.removeItem("e365_company_id");
  localStorage.removeItem("e365_company_name");
  localStorage.removeItem("e365_booking_type");
}

export function clearSessionSync() {
  // Fast local-only clear — used on 401 (token already invalid server-side)
  localStorage.removeItem("e365_token");
  localStorage.removeItem("e365_role");
  localStorage.removeItem("e365_username");
  localStorage.removeItem("e365_permissions");
  localStorage.removeItem("e365_company_id");
  localStorage.removeItem("e365_company_name");
  localStorage.removeItem("e365_booking_type");
}

export function getRole() {
  return localStorage.getItem("e365_role") || "";
}

export function getUsername() {
  return localStorage.getItem("e365_username") || "";
}

export function getCompanyId() {
  const v = localStorage.getItem("e365_company_id");
  return v ? parseInt(v, 10) : null;
}

export function getCompanyName() {
  return localStorage.getItem("e365_company_name") || "";
}

export function getBookingType() {
  return localStorage.getItem("e365_booking_type") || "equipment";
}

export function getPermissions() {
  try { return JSON.parse(localStorage.getItem("e365_permissions") || "{}"); } catch { return {}; }
}

export function getOrCreateDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY) || "";

  // Regenerate old-format IDs that embedded the UA string (e.g. "macintel-mozilla-5-0-…")
  if (deviceId && !deviceId.startsWith("dev-")) {
    localStorage.removeItem(DEVICE_ID_KEY);
    deviceId = "";
  }

  if (deviceId) return deviceId;

  // Clean format: "dev-<16 random hex chars>"
  const hex = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
    : Math.random().toString(16).slice(2, 10) + Math.random().toString(16).slice(2, 10);
  deviceId = `dev-${hex}`;
  localStorage.setItem(DEVICE_ID_KEY, deviceId);
  return deviceId;
}
