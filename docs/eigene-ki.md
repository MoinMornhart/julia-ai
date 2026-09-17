# Julias eigenes Lernen – ehrliches Konzept & Organigramm (Issue #65)

Dieses Dokument beantwortet den Wunsch aus Issue #65: „eine eigene Julia trainieren
… besser als der Transformer … in Rust … lernt laufend dazu, ohne viel RAM/GB …
keine Halluzinationen … denkt selbst, ohne Systemprompt … in BETA herunterladbar“.

Es ist **ehrlich** geschrieben: was geht, was nicht, und was wir sinnvoll bauen.
Lieber ein kleines, echtes, verlässliches Stück als ein großes Versprechen, das
nicht hält.

## Kurz & ehrlich zuerst

- **„Besser als der Transformer, ohne Ressourcen, ohne Halluzination“ gibt es
  heute nicht.** Das ist offene Forschung. Wer das als fertiges Produkt verspricht,
  flunkert. Ein von Grund auf selbst trainiertes Sprachmodell, das an GPT/Claude
  heranreicht, kostet Millionen an Rechenzeit und viele GB – das Gegenteil von
  „fast keine Ressourcen“.
- **Halluzinationen kann man nicht per Architektur „ausschalten“**, aber man kann
  sie **stark eindämmen**, indem die KI Dinge **nachschlägt und nachrechnet**
  statt sie aus dem Gedächtnis zu raten (Werkzeuge, Suche, Prüf-Schritte – das
  hat Julia über die Ampel und die Werkzeuge bereits).
- **Was wirklich geht und zu Julia passt:** ein **kleiner, lokaler Erfahrungs-/
  Skill-Lerner**, der Julia bei **engen, überprüfbaren** Aufgaben (Minecraft-Züge,
  Rechnen, wiederkehrende PC-Abläufe) mit der Zeit besser macht – **ohne** großes
  Modell, **ohne** GB, **ressourcenschonend**, und **laufend** dazulernend. Das ist
  eine **Ergänzung** zur Sprach-KI, kein Ersatz.

## Warum kein „neuer Transformer“?

Ein Sprachmodell muss Sprache, Welt- und Faktenwissen in seinen Gewichten tragen –
das ist es, was die vielen GB ausmacht. Ein winziges Modell „ohne RAM“ kann dieses
Wissen schlicht nicht speichern; es würde mehr halluzinieren, nicht weniger. Der
professionelle Weg ist deshalb **nicht** „eigenes Riesenmodell bauen“, sondern:

1. ein **starkes, austauschbares Sprachmodell** als Denk-/Sprach-Motor nutzen
   (lokal oder als Anbieter – das kann Julia schon),
2. **Halluzinationen über Werkzeuge/Prüfen senken** (nachschlagen, nachrechnen,
   Prüfer-Rolle – Baustein aus #58),
3. **eigenes, laufendes Lernen** dort, wo es billig und verlässlich ist: **enge,
   messbare Fertigkeiten**, die man aus Erfahrung verbessern kann, ohne ein
   Sprachmodell neu zu trainieren.

Punkt 3 ist das, was wir als „Julias eigenes Lernen“ neu und ressourcenschonend
bauen können.

## Organigramm: So greift das ineinander

```
                        ┌──────────────────────────────┐
                        │            Nutzer            │
                        └───────────────┬──────────────┘
                                        │ Auftrag / Sprache
                                        ▼
                        ┌──────────────────────────────┐
                        │   Sprach-/Denk-Motor (LLM)   │  austauschbar,
                        │   – versteht & plant –       │  lokal oder Anbieter
                        └───────┬───────────────┬──────┘
              fragt nach Erfahrung │             │ ruft Werkzeuge (über Ampel)
                                   ▼             ▼
        ┌───────────────────────────────┐   ┌───────────────────────────────┐
        │  Erfahrungs-/Skill-Lerner     │   │   Werkzeuge & Prüfen          │
        │  (klein, lokal, laufend)      │   │   – gegen Halluzination –     │
        │                               │   │   Screenshot, Shell, Suche,   │
        │  • merkt sich, was in einer   │   │   Rechnen, Prüfer-Rolle (#58) │
        │    Lage funktioniert hat      │   └───────────────────────────────┘
        │  • bewertet Aktionen nach     │
        │    Erfolg/Misserfolg          │            jede steuernde
        │  • schlägt bewährte Züge vor  │            Aktion:  ▼
        │  • wächst in KB, nicht in GB  │      ┌───────────────────────────┐
        └───────────────┬───────────────┘      │   Ampel (grün/gelb/rot)  │
                        │ Rückmeldung (hat es    └───────────────────────────┘
                        │ geklappt?)                        │
                        ▼                                   ▼
        ┌───────────────────────────────┐      ┌───────────────────────────┐
        │  lokale Erfahrungs-Datei      │      │   PC / Minecraft / Handy  │
        │  (JSON/kompakt, keine GB)     │      └───────────────────────────┘
        └───────────────────────────────┘
```

**Kernidee:** Der Sprach-Motor bleibt der „kluge Kopf“. Der **Erfahrungs-Lerner**
ist ein kleines lokales Gedächtnis, das aus Rückmeldungen lernt („in dieser Lage hat
Zug X funktioniert“) und beim nächsten Mal den bewährten Weg vorschlägt. Er wächst in
**Kilobyte**, nicht in Gigabyte, und lernt **bei jeder Rückmeldung** weiter.

## Was wir konkret bauen (Vorschlag, BETA, opt-in)

Ein **Erfahrungs-Lerner** als eigenes, klar abgegrenztes Modul:

- **Zustand → Aktion → Belohnung:** Für enge, messbare Aufgaben (z. B. Minecraft:
  „vor mir Wasser, Ziel Ufer“ → „schwimmen + springen“) merkt er sich, welche
  Aktion in welcher Lage wie gut geklappt hat (einfache, erklärbare Statistik –
  kein neuronales Netz nötig).
- **Ressourcenschonend:** reine Tabellen/Zähler in einer kompakten Datei; Lernen ist
  ein billiges Update, kein Training auf einer GPU. Kein Dauer-RAM-Fresser.
- **Erklärbar & sicher:** man kann jederzeit sehen, *warum* ein Zug vorgeschlagen
  wird; jede steuernde Aktion läuft weiter durch die **Ampel**. Standard **aus**,
  nur als **BETA** zuschaltbar; die KI kann es nicht selbst aktivieren.
- **Rust als Option, nicht als Muss:** Für die enge, rechen-lastige Lernschleife
  kann später ein kleiner Rust-Kern (als Sidecar-Binary oder N-API-Modul) folgen,
  wenn Tempo gebraucht wird. Der erste, ehrliche Schritt ist aber in der bestehenden
  App-Sprache am schnellsten verlässlich zu bekommen und zu **testen** – erst
  Nutzen zeigen, dann optimieren.

Das ist kein „selbst denkendes“ Lebewesen und kein Ersatz für die Sprach-KI – aber
es ist ein **echtes, überprüfbares** Stück „Julia lernt dazu“, das man Schritt für
Schritt ausbauen kann (erst Minecraft/Rechnen, dann weitere enge Fertigkeiten).

## Was eine Kosten-/Forschungs-Entscheidung ist (für MoinMornhart)

Der Teil „ein **eigenes großes Modell trainieren**“ (statt nur den kleinen
Erfahrungs-Lerner) ist ein großes Forschungs- und **Kostenthema** (Rechenzeit,
Datensätze, Speicher). Das entscheidet bewusst MoinMornhart – siehe den Kommentar
an Issue #65. Von hier aus wird nichts Kostenpflichtiges gestartet.
