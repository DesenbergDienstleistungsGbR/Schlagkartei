// Einfacher Passwortschutz (Client-seitig). Hinweis: Das schützt NICHT wie ein Server-Login,
// ist aber für GitHub Pages (statische Website) die praktikable Variante.
const AUTH_KEY = "schlagkartei_authed_v1";
// Ändere hier dein Passwort:
const PASSWORD = "Geheim";

export function isAuthed() {
  return localStorage.getItem(AUTH_KEY) === "1";
}

export function requireAuth() {
  if (!isAuthed()) {
    window.location.href = "login.html";
  }
}

export function login(pw) {
  if (pw === PASSWORD) {
    localStorage.setItem(AUTH_KEY, "1");
    return true;
  }
  return false;
}

export function logout() {
  localStorage.removeItem(AUTH_KEY);
  window.location.href = "login.html";
}
