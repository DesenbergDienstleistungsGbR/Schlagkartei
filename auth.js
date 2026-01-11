// auth.js
const AUTH_KEY = "schlagkartei_auth_ok";
const PASSWORD = "DEIN_PASSWORT_HIER"; // <-- BITTE ÄNDERN

async function requireAuth() {
  if (sessionStorage.getItem(AUTH_KEY) === "1") return;

  const input = prompt("Bitte Passwort eingeben:");
  if (input === null) throw new Error("Abgebrochen");

  if (input !== PASSWORD) {
    alert("Falsches Passwort");
    throw new Error("Falsches Passwort");
  }

  sessionStorage.setItem(AUTH_KEY, "1");
}
