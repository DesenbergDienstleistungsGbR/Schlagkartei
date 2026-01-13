SCHRITT 1 – anbau_plan.json lesen

Änderungen:
- anbau_plan.json + schlaege_master.json liegen im Root.
- index.js lädt anbau_plan.json und nutzt dessen 'years' & 'crops' für Dropdowns.
- Geplante Frucht je Schlag wird aus anbau_plan.json (plan[year]) gelesen (label-basiert).
- planung.html/planung.js sind in Schritt 1 read-only (Bearbeiten folgt später).

Hinweis:
- Wenn anbau_plan.json nicht geladen werden kann, fällt die Seite auf data.json (Excel-Export) zurück.
