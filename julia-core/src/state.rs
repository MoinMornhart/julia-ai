//! Linearer Zustandsraum (SSM-Stil, diagonale Rekurrenz) mit O(1)-Speicher.
//!
//! Kernidee gegenüber dem Transformer: Klassische Attention braucht einen
//! KV-Cache, der mit der Sequenzlänge **wächst** (quadratische Kosten). Eine
//! lineare Zustandsraum-Rekurrenz hält stattdessen einen **festen** Zustand `h`
//! der Größe `dim` und aktualisiert ihn je Token in konstanter Zeit und
//! konstantem Speicher – egal wie lang die Sequenz ist.
//!
//! Update (diagonal, elementweise):  `h_t = a ⊙ h_{t-1} + b ⊙ x_t`
//! Ausgabe (Skalar):                 `y_t = Σ_i c_i · h_{t,i}`

/// Ein diagonaler linearer Zustandsraum mit festem Zustand.
pub struct LinearState {
    a: Vec<f32>, // Zerfall je Kanal (0..1 sinnvoll)
    b: Vec<f32>, // Eingangsgewicht je Kanal
    c: Vec<f32>, // Ausgangsgewicht je Kanal
    h: Vec<f32>, // fester Zustand (Länge = dim)
}

impl LinearState {
    /// Erzeugt einen Zustand aus den Kanal-Parametern `a`, `b`, `c` (gleiche Länge).
    pub fn new(a: Vec<f32>, b: Vec<f32>, c: Vec<f32>) -> Self {
        let dim = a.len();
        assert!(dim > 0, "dim muss > 0 sein");
        assert_eq!(b.len(), dim, "b muss so lang wie a sein");
        assert_eq!(c.len(), dim, "c muss so lang wie a sein");
        LinearState { a, b, c, h: vec![0.0; dim] }
    }

    /// Anzahl der Kanäle (Zustandsdimension).
    pub fn dim(&self) -> usize {
        self.h.len()
    }

    /// Setzt den Zustand auf Null zurück.
    pub fn reset(&mut self) {
        for v in self.h.iter_mut() {
            *v = 0.0;
        }
    }

    /// Verarbeitet einen Token `x` (Länge `dim`) und gibt den Skalar-Ausgang zurück.
    pub fn step(&mut self, x: &[f32]) -> f32 {
        assert_eq!(x.len(), self.dim(), "x muss dim lang sein");
        let mut y = 0.0f32;
        for ((((h, &a), &b), &c), &xi) in self
            .h
            .iter_mut()
            .zip(self.a.iter())
            .zip(self.b.iter())
            .zip(self.c.iter())
            .zip(x.iter())
        {
            *h = a * *h + b * xi;
            y += c * *h;
        }
        y
    }

    /// Die Zustandslänge bleibt über die gesamte Sequenz konstant (der O(1)-Beweis).
    pub fn state_len(&self) -> usize {
        self.h.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zustand_bleibt_konstant_gross_ueber_die_sequenz() {
        let mut s = LinearState::new(vec![0.9; 4], vec![1.0; 4], vec![1.0; 4]);
        for _ in 0..1000 {
            s.step(&[0.1, 0.2, 0.3, 0.4]);
            assert_eq!(s.state_len(), 4); // egal wie lang die Sequenz: O(1)
        }
    }

    #[test]
    fn bekannter_schritt_rechnet_richtig() {
        // a=0, also h_t = b ⊙ x_t; y = Σ c·h.
        let mut s = LinearState::new(vec![0.0, 0.0], vec![2.0, 3.0], vec![1.0, 1.0]);
        let y = s.step(&[1.0, 1.0]); // h = [2,3], y = 5
        assert!((y - 5.0).abs() < 1e-6);
    }

    #[test]
    fn reset_leert_den_zustand() {
        let mut s = LinearState::new(vec![1.0], vec![1.0], vec![1.0]);
        s.step(&[7.0]);
        s.reset();
        let y = s.step(&[0.0]); // nach reset ist h=0, x=0 → y=0
        assert!(y.abs() < 1e-6);
    }
}
