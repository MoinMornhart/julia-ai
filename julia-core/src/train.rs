//! Lokales Online-Training (Issue #65) – der **getestete Trainings-Loop**.
//!
//! Läuft zu 100 % lokal auf dem PC, ohne Cloud/Rechenzentrum. Trainiert wird in
//! f32 mit der **Delta-Regel** `w += lr · (ziel − vorhersage) · x` – das ist ein
//! fehler­getriebenes, „Hebb'sches" Online-Update: nur die Kanäle, die zum Fehler
//! beitragen, werden angepasst. Für die ressourcensparende Inferenz können die
//! gelernten Gewichte anschließend nach ternär `{-1,0,+1}` **quantisiert** werden
//! (siehe [`crate::ternary`]).
//!
//! Ehrliche Einordnung: Das ist ein echter, ressourcenschonender Lern-Loop und der
//! richtige Baustein für lokales Lernen. Er macht ein Modell aber nicht allein
//! „klug" – dafür braucht es echte Daten und genügend Rechenzeit. Der Loop hier
//! bläht nichts auf: die Gewichte bleiben so groß wie das Modell, egal wie lange
//! trainiert wird (kein Wachstum mit der Datenmenge).

/// Laufende Trainingsstatistik – genau die Werte, die ein lokales Dashboard zeigt.
#[derive(Debug, Clone, PartialEq)]
pub struct TrainStats {
    pub epoche: u32,
    pub schritte: u64,
    pub letzter_loss: f32,
    pub tokens_pro_sekunde: f32,
}

impl TrainStats {
    pub fn neu() -> Self {
        TrainStats { epoche: 0, schritte: 0, letzter_loss: 0.0, tokens_pro_sekunde: 0.0 }
    }
}

/// Ein winziger Online-Lerner für ein lineares Modell `y = w · x`.
pub struct Trainer {
    w: Vec<f32>,
    lr: f32,
    stats: TrainStats,
}

impl Trainer {
    /// Neuer Trainer mit `dim` Gewichten (Start bei 0) und Lernrate `lr`.
    pub fn new(dim: usize, lr: f32) -> Self {
        assert!(dim > 0, "dim muss > 0 sein");
        Trainer { w: vec![0.0; dim], lr, stats: TrainStats::neu() }
    }

    pub fn gewichte(&self) -> &[f32] {
        &self.w
    }

    pub fn lernrate(&self) -> f32 {
        self.lr
    }

    pub fn lernrate_setzen(&mut self, lr: f32) {
        self.lr = lr;
    }

    pub fn stats(&self) -> &TrainStats {
        &self.stats
    }

    /// Vorhersage `y = w · x`.
    pub fn vorhersage(&self, x: &[f32]) -> f32 {
        assert_eq!(x.len(), self.w.len(), "x muss dim lang sein");
        self.w.iter().zip(x.iter()).map(|(&w, &xi)| w * xi).sum()
    }

    /// Ein Online-Schritt (Delta-Regel). Gibt den quadratischen Fehler VOR dem
    /// Schritt zurück (damit sich eine sinkende Loss-Kurve beobachten lässt).
    pub fn schritt(&mut self, x: &[f32], ziel: f32) -> f32 {
        let pred = self.vorhersage(x);
        let fehler = ziel - pred;
        let lr = self.lr;
        for (w, &xi) in self.w.iter_mut().zip(x.iter()) {
            *w += lr * fehler * xi;
        }
        self.stats.schritte += 1;
        self.stats.letzter_loss = fehler * fehler;
        self.stats.letzter_loss
    }

    /// Eine Epoche über die Daten; gibt den mittleren Loss zurück und aktualisiert
    /// die Statistik (Epoche, Tokens/Sekunde).
    pub fn epoche(&mut self, daten: &[(Vec<f32>, f32)]) -> f32 {
        if daten.is_empty() {
            return 0.0;
        }
        let start = std::time::Instant::now();
        let mut summe = 0.0f32;
        for (x, ziel) in daten {
            summe += self.schritt(x, *ziel);
        }
        self.stats.epoche += 1;
        let sek = start.elapsed().as_secs_f32();
        self.stats.tokens_pro_sekunde = if sek > 0.0 { daten.len() as f32 / sek } else { 0.0 };
        summe / daten.len() as f32
    }

    /// Die gelernten f32-Gewichte nach ternär `{-1,0,+1}` quantisieren
    /// (Schwelle auf `|w|`). So wird aus dem Training die sparsame Inferenz.
    pub fn quantisieren(&self, schwelle: f32) -> Vec<i8> {
        self.w
            .iter()
            .map(|&v| {
                if v > schwelle {
                    1
                } else if v < -schwelle {
                    -1
                } else {
                    0
                }
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lernt_ein_lineares_ziel() {
        // Wahres Modell: y = 2*x0 - 1*x1.
        let daten = vec![
            (vec![1.0, 0.0], 2.0),
            (vec![0.0, 1.0], -1.0),
            (vec![1.0, 1.0], 1.0),
            (vec![2.0, 1.0], 3.0),
        ];
        let mut t = Trainer::new(2, 0.05);
        let mut loss = f32::INFINITY;
        for _ in 0..3000 {
            loss = t.epoche(&daten);
        }
        assert!(loss < 0.01, "Loss sollte klein werden, war {loss}");
        assert!((t.gewichte()[0] - 2.0).abs() < 0.1);
        assert!((t.gewichte()[1] + 1.0).abs() < 0.1);
        assert_eq!(t.stats().epoche, 3000);
    }

    #[test]
    fn lernrate_null_aendert_nichts() {
        let mut t = Trainer::new(3, 0.0);
        t.schritt(&[1.0, 2.0, 3.0], 5.0);
        assert_eq!(t.gewichte(), &[0.0, 0.0, 0.0]);
    }

    #[test]
    fn quantisieren_setzt_schwelle_richtig() {
        let mut t = Trainer::new(3, 0.5);
        // Ein Schritt, der die Gewichte in bekannte Richtungen schiebt.
        t.schritt(&[1.0, -1.0, 0.0], 1.0); // w += 0.5*1*x = [0.5, -0.5, 0]
        let q = t.quantisieren(0.4);
        assert_eq!(q, vec![1, -1, 0]);
    }

    #[test]
    fn leere_epoche_ist_harmlos() {
        let mut t = Trainer::new(2, 0.1);
        assert_eq!(t.epoche(&[]), 0.0);
        assert_eq!(t.stats().epoche, 0);
    }
}
