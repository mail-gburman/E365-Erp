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
  if (deviceId) return deviceId;

  const randomPart = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
  const platform = typeof navigator !== "undefined" ? (navigator.platform || "web") : "web";
  const seed = `${platform}-${ua}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "browser";
  deviceId = `${seed}-${randomPart}`.slice(0, 64);
  localStorage.setItem(DEVICE_ID_KEY, deviceId);
  return deviceId;
}
