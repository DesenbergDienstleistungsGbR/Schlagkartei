// auth.js (ES Module + optional global fallback)
// Passwortschutz ist clientseitig (kein echter Schutz gegen Quellcode-Einsicht)

export const AUTH_KEY = "schlagkartei_auth_ok";
export const PASSWORD = "Geheim!?"; // <-- BITTE ÄNDERN



// login() für login.html (ESM): gibt true/false zurück
export function login(pw) {
  if (pw === PASSWORD) {
    sessionStorage.setItem(AUTH_KEY, "1");
    return true;
  }
  return false;
}

export function isAuthed() {
  return sessionStorage.getItem(AUTH_KEY) === "1";
}

export function logout() {
  sessionStorage.removeItem(AUTH_KEY);
}

export async function requireAuth() {
  if (isAuthed()) return;

  const input = prompt("Bitte Passwort eingeben:");
  if (input === null) throw new Error("Abgebrochen");

  if (input !== PASSWORD) {
    alert("Falsches Passwort");
    throw new Error("Falsches Passwort");
  }

  sessionStorage.setItem(AUTH_KEY, "1");
}

// Optional: global verfügbar machen (für ältere Skripte / Debug)
try {
  window.requireAuth = requireAuth;
  window.isAuthed = isAuthed;
  window.logout = logout;
  window.login = login;
} catch (_) {}
