import { serverLogout } from "./api";

const DEVICE_ID_KEY = "kps_device_id";

export function getToken() {
  return localStorage.getItem("kps_token") || "";
}

export function setSession(data) {
  localStorage.setItem("kps_token", data.access_token);
  localStorage.setItem("kps_role", data.role);
  localStorage.setItem("kps_username", data.username);
  if (data.permissions_json) localStorage.setItem("kps_permissions", data.permissions_json);
  else localStorage.removeItem("kps_permissions");
}

export async function clearSession() {
  // Revoke the session server-side before clearing local storage
  await serverLogout();
  localStorage.removeItem("kps_token");
  localStorage.removeItem("kps_role");
  localStorage.removeItem("kps_username");
  localStorage.removeItem("kps_permissions");
}

export function clearSessionSync() {
  // Fast local-only clear — used on 401 (token already invalid server-side)
  localStorage.removeItem("kps_token");
  localStorage.removeItem("kps_role");
  localStorage.removeItem("kps_username");
  localStorage.removeItem("kps_permissions");
}

export function getRole() {
  return localStorage.getItem("kps_role") || "";
}

export function getUsername() {
  return localStorage.getItem("kps_username") || "";
}

export function getPermissions() {
  try { return JSON.parse(localStorage.getItem("kps_permissions") || "{}"); } catch { return {}; }
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
