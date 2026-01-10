const PASSWORD_SHA256 = "addb0f5e7826c857d7376d1bd9bc33c0c544790a2eac96144a8af22b1298c940";
const AUTH_KEY = "mitteleinsatz_auth_ok_v1";

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function isAuthed() {
  return localStorage.getItem(AUTH_KEY) === "1";
}

export function logout() {
  localStorage.removeItem(AUTH_KEY);
  window.location.href = "login.html";
}

export async function loginWithPassword(pw) {
  const h = await sha256Hex(pw);
  if (h === PASSWORD_SHA256) {
    localStorage.setItem(AUTH_KEY, "1");
    return true;
  }
  return false;
}

export function requireAuth() {
  if (!isAuthed()) {
    const here = window.location.pathname.split("/").pop() || "index.html";
    const qs = window.location.search || "";
    window.location.href = `login.html?next=${encodeURIComponent(here + qs)}`;
  }
}
