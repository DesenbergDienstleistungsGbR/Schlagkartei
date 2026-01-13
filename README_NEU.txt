NEU in dieser Version:
1) schlaege_master.json enthält ha_ref (automatisch aus Geo-Polygonflächen ermittelt, wo Label/aliases matchen).
2) planung.html: neuer Bereich 'Plausibilität (Schlagteilung)' – warnt wenn Summe Teilflächen (Labels je field_id) > ha_ref.
3) Übersicht (index.html Karte): Polygone werden nach geplanter Frucht (anbau_plan + ausgewähltes Jahr) eingefärbt.

Hinweise:
- ha_ref wird beim Start einmalig gesetzt (kann man manuell korrigieren).
- Plausibilitätscheck greift nur, wenn ha_ref vorhanden ist.
