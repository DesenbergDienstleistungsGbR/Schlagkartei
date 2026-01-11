SCHLAGKARTEI – KOMPLETT-PAKET (GitHub Pages)

Enthalten: komplette Website + Auth-Loader (fix für 'requireAuth is not defined').

WICHTIG:
1) In auth.js das Passwort setzen:
   const PASSWORD = "DEIN_PASSWORT_HIER";

2) HTML-Dateien sind bereits so angepasst, dass sie nur noch den Loader nutzen:
   <script src="auth-loader.js" data-main="index.js"></script>
   usw.

Optional: Favicon-Warnung vermeiden:
Im <head> jeder Seite ist bereits ein leeres Favicon gesetzt: <link rel="icon" href="data:,">


UPDATE (ESM AUTH): auth.js exportiert jetzt isAuthed/requireAuth/logout.
Wenn du login.html nutzt (type=module), funktioniert der Import jetzt.
