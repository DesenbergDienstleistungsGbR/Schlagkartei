# Mitteleinsatz – kleine Website

## Inhalt
- `index.html` – Oberfläche
- `app.js` – lädt `data.json`, erzeugt Dropdowns, filtert und zeigt Tabelle
- `data.json` – aus `Mitteleinsatz.xlsx` exportierte Daten (ca. 42k Zeilen)
- `style.css` – Layout

## Lokal starten
In diesem Ordner:

```bash
python -m http.server 8000
```

Dann im Browser öffnen:
`http://localhost:8000`

## Filterfelder
- Erntejahr: `c3`
- Eigentümer/Betrieb: `betrieb`
- Frucht: `c26`
- Schlag: `c6`
