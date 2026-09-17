//! Schlichtes, **abhängigkeitsfreies Zeilen-Protokoll** (Issue #65), über das die
//! App den Kern als **Sidecar-Prozess** ansteuert: eine Zeile rein, eine Zeile raus.
//!
//! Warum ein Sidecar statt eines nativen Addons? Es ist der robustere, sofort
//! CI-verifizierbare erste Schritt: die Electron-App startet das kompilierte
//! `julia-core`-Binary via `child_process` und redet über stdin/stdout mit ihm –
//! ohne die Komplexität/ABI-Fallen eines nativen Node-Addons. Eine `napi-rs`-
//! Brücke kann später folgen; das Protokoll hier bleibt gleich nutzbar.
//!
//! Befehle (Groß-/Kleinschreibung egal beim Befehlswort):
//!   INIT <dim> <lr>        → OK dim=.. lr=..     (Trainer anlegen)
//!   LR <lr>                → OK lr=..            (Lernrate setzen)
//!   PREDICT <x0..x[dim-1]> → Y <wert>
//!   STEP <ziel> <x..>      → LOSS <wert>         (ein Online-Schritt)
//!   STATS                  → STATS epoche=.. schritte=.. loss=.. tps=..
//!   QUANT <schwelle>       → Q <t0> <t1> ..      (ternär {-1,0,1})
//! Fehler werden IMMER als `ERR <grund>` zurückgegeben – nie ein Panic/Absturz.

use crate::train::Trainer;

/// Zustand einer Sidecar-Sitzung (hält den aktuellen Trainer).
pub struct Sitzung {
    trainer: Option<Trainer>,
}

impl Default for Sitzung {
    fn default() -> Self {
        Sitzung::neu()
    }
}

impl Sitzung {
    pub fn neu() -> Self {
        Sitzung { trainer: None }
    }

    /// Verarbeitet eine Protokoll-Zeile und gibt die Antwort-Zeile zurück.
    pub fn verarbeite(&mut self, zeile: &str) -> String {
        let teile: Vec<&str> = zeile.split_whitespace().collect();
        if teile.is_empty() {
            return "ERR leere Zeile".to_string();
        }
        let befehl = teile[0].to_ascii_uppercase();
        match befehl.as_str() {
            "INIT" => self.init(&teile[1..]),
            "LR" => self.lr(&teile[1..]),
            "PREDICT" => self.predict(&teile[1..]),
            "STEP" => self.step(&teile[1..]),
            "STATS" => self.stats(),
            "QUANT" => self.quant(&teile[1..]),
            _ => format!("ERR unbekannter Befehl: {}", teile[0]),
        }
    }

    fn init(&mut self, args: &[&str]) -> String {
        if args.len() != 2 {
            return "ERR INIT braucht <dim> <lr>".to_string();
        }
        let dim = match args[0].parse::<usize>() {
            Ok(d) if d > 0 => d,
            _ => return "ERR dim muss eine Zahl > 0 sein".to_string(),
        };
        let lr = match args[1].parse::<f32>() {
            Ok(v) if v.is_finite() => v,
            _ => return "ERR lr muss eine endliche Zahl sein".to_string(),
        };
        self.trainer = Some(Trainer::new(dim, lr));
        format!("OK dim={dim} lr={lr}")
    }

    fn lr(&mut self, args: &[&str]) -> String {
        let t = match self.trainer.as_mut() {
            Some(t) => t,
            None => return "ERR erst INIT".to_string(),
        };
        if args.len() != 1 {
            return "ERR LR braucht <lr>".to_string();
        }
        match args[0].parse::<f32>() {
            Ok(v) if v.is_finite() => {
                t.lernrate_setzen(v);
                format!("OK lr={v}")
            }
            _ => "ERR lr muss eine endliche Zahl sein".to_string(),
        }
    }

    fn vektor(args: &[&str]) -> Result<Vec<f32>, String> {
        let mut v = Vec::with_capacity(args.len());
        for a in args {
            match a.parse::<f32>() {
                Ok(f) if f.is_finite() => v.push(f),
                _ => return Err(format!("ERR keine Zahl: {a}")),
            }
        }
        Ok(v)
    }

    fn predict(&mut self, args: &[&str]) -> String {
        let t = match self.trainer.as_ref() {
            Some(t) => t,
            None => return "ERR erst INIT".to_string(),
        };
        let x = match Self::vektor(args) {
            Ok(x) => x,
            Err(e) => return e,
        };
        if x.len() != t.gewichte().len() {
            return format!("ERR x braucht {} Werte", t.gewichte().len());
        }
        format!("Y {}", t.vorhersage(&x))
    }

    fn step(&mut self, args: &[&str]) -> String {
        let t = match self.trainer.as_mut() {
            Some(t) => t,
            None => return "ERR erst INIT".to_string(),
        };
        if args.is_empty() {
            return "ERR STEP braucht <ziel> <x..>".to_string();
        }
        let ziel = match args[0].parse::<f32>() {
            Ok(v) if v.is_finite() => v,
            _ => return "ERR ziel muss eine endliche Zahl sein".to_string(),
        };
        let x = match Self::vektor(&args[1..]) {
            Ok(x) => x,
            Err(e) => return e,
        };
        if x.len() != t.gewichte().len() {
            return format!("ERR x braucht {} Werte", t.gewichte().len());
        }
        let loss = t.schritt(&x, ziel);
        format!("LOSS {loss}")
    }

    fn stats(&self) -> String {
        match self.trainer.as_ref() {
            Some(t) => {
                let s = t.stats();
                format!(
                    "STATS epoche={} schritte={} loss={} tps={}",
                    s.epoche, s.schritte, s.letzter_loss, s.tokens_pro_sekunde
                )
            }
            None => "ERR erst INIT".to_string(),
        }
    }

    fn quant(&self, args: &[&str]) -> String {
        let t = match self.trainer.as_ref() {
            Some(t) => t,
            None => return "ERR erst INIT".to_string(),
        };
        if args.len() != 1 {
            return "ERR QUANT braucht <schwelle>".to_string();
        }
        let schwelle = match args[0].parse::<f32>() {
            Ok(v) if v.is_finite() && v >= 0.0 => v,
            _ => return "ERR schwelle muss eine Zahl >= 0 sein".to_string(),
        };
        let q = t.quantisieren(schwelle);
        let teile: Vec<String> = q.iter().map(|v| v.to_string()).collect();
        format!("Q {}", teile.join(" "))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn init_und_predict() {
        let mut s = Sitzung::neu();
        assert!(s.verarbeite("PREDICT 1 0").starts_with("ERR")); // vor INIT
        assert_eq!(s.verarbeite("INIT 2 0.1"), "OK dim=2 lr=0.1");
        assert_eq!(s.verarbeite("PREDICT 1 0"), "Y 0"); // Gewichte starten bei 0
    }

    #[test]
    fn step_senkt_die_vorhersage_richtung_ziel() {
        let mut s = Sitzung::neu();
        s.verarbeite("INIT 2 0.1");
        let antwort = s.verarbeite("STEP 2 1 0"); // fehler=2, loss=4
        assert!(antwort.starts_with("LOSS "));
        let loss: f32 = antwort[5..].parse().unwrap();
        assert!((loss - 4.0).abs() < 1e-4);
        // Nach dem Schritt ist w0 = 0.1*2*1 = 0.2 → PREDICT 1 0 ≈ 0.2
        let y: f32 = s.verarbeite("PREDICT 1 0")[2..].parse().unwrap();
        assert!((y - 0.2).abs() < 1e-4);
    }

    #[test]
    fn stats_und_quant() {
        let mut s = Sitzung::neu();
        s.verarbeite("INIT 2 0.5");
        s.verarbeite("STEP 1 1 -1"); // w = [0.5, -0.5]
        let stats = s.verarbeite("STATS");
        assert!(stats.contains("schritte=1"));
        assert_eq!(s.verarbeite("QUANT 0.4"), "Q 1 -1");
    }

    #[test]
    fn falsche_eingaben_geben_err_statt_panic() {
        let mut s = Sitzung::neu();
        assert!(s.verarbeite("").starts_with("ERR"));
        assert!(s.verarbeite("QUATSCH").starts_with("ERR"));
        assert!(s.verarbeite("INIT 0 0.1").starts_with("ERR")); // dim 0
        assert!(s.verarbeite("INIT zwei 0.1").starts_with("ERR"));
        s.verarbeite("INIT 2 0.1");
        assert!(s.verarbeite("PREDICT 1").starts_with("ERR")); // falsche Länge
        assert!(s.verarbeite("PREDICT a b").starts_with("ERR")); // keine Zahlen
    }
}
