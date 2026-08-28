---
id: google-search
name: google-search
description: Google-Suche über Chrome-DevTools-Protokoll (CDP) statt nativer web_search; liefert echte Ergebnis-Snippets inklusive Google-KI-Übersicht.
roles: [research]
status: own
---

# Google-Suche über CDP

Führt eine echte Google-Suche über eine per Chrome-DevTools-Protokoll (CDP)
gesteuerte Chrome-Instanz aus und wertet die Ergebnisse inklusive
Google-KI-Ergebnisse (AI Overview / KI-Übersicht) direkt aus dem Browser aus.

## Wann nutzen

- Die Anfrage verlangt ausdrücklich „Google-Suche" oder die Ergebnisse der
  nativen `web_search` sollen gegen eine zweite Quelle geprüft werden.
- Aktuelle Suchergebnisse mit Snippets und Seitenbeschreibungen sind nötig.

## Ablauf

1. Prüfe, ob eine lokale Chrome-Instanz verfügbar ist (`chrome.exe` im
   Standard-Pfad oder `--remote-debugging-port`).
2. Starte Chrome mit `--remote-debugging-port=9222` und einem eigenem
   Nutzerdaten-Profil unter `workspace/<slug>/tmp/chrome-profile`.
3. Rufe `http://127.0.0.1:9222/json` ab, nimm die erste `page`-Target-URL und
   steuere die Seite über die DevTools-WS-Schnittstelle (CDP).
4. Navigiere zu `https://www.google.com/search?q=<urlencoded>` und warte auf
   das Rendering der Ergebnisliste (`#search`).
5. Extrahiere aus dem DOM: Titel, URL und Text-Snippet je Ergebnis sowie den
   Text der KI-Übersicht, falls vorhanden.

## Ergebnis

- Rückgabe als strukturierte Liste: Rang, Titel, URL, Snippet.
- Dazu ein Abschnitt „KI-Übersicht" mit dem extrahierten Text (falls vorhanden)
  und ein Vermerk, welche Ergebnisse ohne JavaScript nicht sichtbar wären.
- Gib Unsicherheit an: Wenn Chrome/CDP nicht startet, falle auf die native
  `web_search` zurück und kennzeichne das im Bericht.
