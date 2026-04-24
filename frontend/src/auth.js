import { serverLogout } from "./api";

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
