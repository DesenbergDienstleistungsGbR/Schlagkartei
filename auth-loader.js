// auth-loader.js
(async () => {
  const currentScript = document.currentScript;
  const mainScript = currentScript?.dataset?.main;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Script konnte nicht geladen werden: " + src));
      document.head.appendChild(s);
    });
  }

  // 1) auth.js laden (falls vorhanden)
  try {
    await loadScript("auth.js");
  } catch (e) {
    console.warn("[auth-loader] auth.js nicht gefunden – Auth wird übersprungen");
  }

  // 2) Auth ausführen
  try {
    if (typeof window.requireAuth === "function") {
      await window.requireAuth();
    }
  } catch (e) {
    console.error("[auth-loader] Auth fehlgeschlagen:", e);
    return; // Seite nicht weiter laden
  }

  // 3) Hauptskript laden
  if (!mainScript) {
    console.error("[auth-loader] data-main fehlt (z.B. index.js)");
    return;
  }

  try {
    await loadScript(mainScript);
  } catch (e) {
    console.error("[auth-loader] Hauptskript konnte nicht geladen werden:", e);
  }
})();
