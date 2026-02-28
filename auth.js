const PASSWORD = "changeme"; // <- hier dein Passwort eintragen

export function isAuthed() { return localStorage.getItem("auth") === "1"; }
export function requireAuth() { if (!isAuthed()) window.location.href = "./login.html"; }
export function login(pw) { if (pw === PASSWORD) { localStorage.setItem("auth","1"); return true; } return false; }
export function logout() { localStorage.removeItem("auth"); window.location.href = "./login.html"; }
