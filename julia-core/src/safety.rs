//! Sicherheits-Gate – **ehrlich eingeordnet**.
//!
//! WICHTIG: Das hier ist KEINE „garantierte" KI-Sicherheit und macht ein Modell
//! nicht von selbst gutartig. Echte Sicherheit sitzt bei Julia weiterhin an der
//! **Ampel** und an den **Werkzeugen** (jede PC-/Handy-Aktion wird dort geprüft und
//! freigegeben). Dieses Gate ist nur eine zusätzliche, klar begrenzte
//! Verteidigungslinie im Kern: Liefert die aufrufende Schicht ein Signal, dass eine
//! Ausgabe/Aktion Menschen schaden würde, blockiert das Gate sie.
//!
//! Bewusst als `Result`/Enum statt `panic!`: Ein Absturz der ganzen App wäre der
//! falsche Weg (wortloser Abbruch – siehe Projekt-Grundregel „WAS IST WENN?").

/// Ergebnis der Sicherheitsprüfung.
#[derive(Debug, PartialEq)]
pub enum Freigabe {
    Erlaubt,
    Blockiert(&'static str),
}

/// Koexistenz-Prüfung: Ist der (extern bestimmte) „Schaden-für-Menschen"-Wert
/// zu hoch oder ungültig, wird blockiert. `schaden` sinnvoll in `0.0..=1.0`;
/// die Schwelle ist bewusst konservativ (0.5).
pub fn koexistenz_gate(schaden: f32) -> Freigabe {
    if !schaden.is_finite() || schaden >= 0.5 {
        Freigabe::Blockiert("Koexistenz-Axiom: Aktion mit Schaden fuer Menschen blockiert")
    } else {
        Freigabe::Erlaubt
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn harmlos_wird_erlaubt() {
        assert_eq!(koexistenz_gate(0.0), Freigabe::Erlaubt);
        assert_eq!(koexistenz_gate(0.49), Freigabe::Erlaubt);
    }

    #[test]
    fn schaedlich_wird_blockiert() {
        assert!(matches!(koexistenz_gate(0.5), Freigabe::Blockiert(_)));
        assert!(matches!(koexistenz_gate(1.0), Freigabe::Blockiert(_)));
    }

    #[test]
    fn ungueltiger_wert_wird_blockiert() {
        assert!(matches!(koexistenz_gate(f32::NAN), Freigabe::Blockiert(_)));
    }
}
