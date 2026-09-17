package expo.modules.juliazugriff

// JS↔Native-Brücke (Issue #6): macht Julias AccessibilityService für die
// App/KI aufrufbar. Jede Funktion greift auf den laufenden Dienst zu und gibt
// ein einfaches Ergebnis zurück; ist der Dienst nicht eingeschaltet, liefert
// „bildschirmLesen" ein leeres Array und Aktionen liefern false (kein Absturz).
// Sicherheit: dieses Modul steuert nur; die Freigabe/Ampel entscheidet die
// JS-Seite, bevor eine steuernde Aktion aufgerufen wird.

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class JuliaZugriffModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("JuliaZugriff")

    // Ist der Bedienungshilfen-Dienst aktiv?
    Function("dienstLaeuft") {
      JuliaAccessibilityService.laeuft()
    }

    // Bildschirm als JSON-Elementliste lesen (nur Lesen, keine Steuerung).
    Function("bildschirmLesen") {
      JuliaAccessibilityService.instanz?.bildschirmLesen() ?: "[]"
    }

    // ─── Steuernde Aktionen (JS-Seite muss vorher freigeben) ─────────

    Function("klickText") { ziel: String ->
      JuliaAccessibilityService.instanz?.klickText(ziel) ?: false
    }

    Function("klickKoordinaten") { x: Double, y: Double ->
      JuliaAccessibilityService.instanz?.klickKoordinaten(x.toFloat(), y.toFloat()) ?: false
    }

    Function("textEingeben") { text: String ->
      JuliaAccessibilityService.instanz?.textEingeben(text) ?: false
    }

    Function("scrollen") { vorwaerts: Boolean ->
      JuliaAccessibilityService.instanz?.scrollen(vorwaerts) ?: false
    }

    Function("wischen") { x1: Double, y1: Double, x2: Double, y2: Double, dauer: Int ->
      JuliaAccessibilityService.instanz?.wischen(
        x1.toFloat(), y1.toFloat(), x2.toFloat(), y2.toFloat(), dauer.toLong()
      ) ?: false
    }

    Function("zurueck") { JuliaAccessibilityService.instanz?.zurueck() ?: false }
    Function("startseite") { JuliaAccessibilityService.instanz?.startseite() ?: false }
    Function("letzteApps") { JuliaAccessibilityService.instanz?.letzteApps() ?: false }
    Function("benachrichtigungen") { JuliaAccessibilityService.instanz?.benachrichtigungen() ?: false }
  }
}
