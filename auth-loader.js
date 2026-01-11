// auth-loader.js
(async () => {
  const currentScript = document.currentScript;
  const mainScript = currentScript?.dataset?.main;

  let authMod = null;

  // 1) auth.js als ES-Modul laden (falls vorhanden)
  try {
    authMod = await import("./auth.js");
  } catch (e) {
    console.warn("[auth-loader] auth.js nicht gefunden oder nicht importierbar – Auth wird übersprungen");
  }

  // 2) Auth ausführen
  try {
    if (authMod && typeof authMod.requireAuth === "function") {
      await authMod.requireAuth();
    } else if (typeof window.requireAuth === "function") {
      // Fallback, falls auth.js global geladen wurde
      await window.requireAuth();
    }
  } catch (e) {
    console.error("[auth-loader] Auth fehlgeschlagen:", e);
    return; // Seite nicht weiter laden
  }

  // 3) Hauptskript laden (klassisch)
  if (!mainScript) {
    console.error("[auth-loader] data-main fehlt (z.B. index.js)");
    return;
  }

  // Hauptskript als normales Script laden (kein Modul), damit bestehender Code unverändert bleibt
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = mainScript;
    s.defer = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Hauptskript konnte nicht geladen werden: " + mainScript));
    document.head.appendChild(s);
  }).catch((e) => console.error("[auth-loader] ", e));
})();
