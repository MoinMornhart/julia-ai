//! Sidecar-Binary für julia-core (Issue #65). Die App startet dieses Programm als
//! Kindprozess und spricht über stdin/stdout mit dem Kern (siehe `julia_core::cli`):
//! eine Befehlszeile rein, eine Antwortzeile raus. Beenden per EOF (stdin schließen).

use julia_core::cli::Sitzung;
use std::io::{self, BufRead, Write};

fn main() {
    let eingabe = io::stdin();
    let mut ausgabe = io::stdout();
    let mut sitzung = Sitzung::neu();

    for zeile in eingabe.lock().lines() {
        let z = match zeile {
            Ok(z) => z,
            Err(_) => break,
        };
        let antwort = sitzung.verarbeite(&z);
        if writeln!(ausgabe, "{antwort}").is_err() {
            break;
        }
        let _ = ausgabe.flush();
    }
}
