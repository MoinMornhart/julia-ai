//! Ternäre Gewichte `{-1, 0, +1}` (BitNet-b1.58-Idee).
//!
//! Weil jedes Gewicht nur `-1`, `0` oder `+1` ist, wird aus der Matrix-Vektor-
//! Multiplikation reine **Addition/Subtraktion** – keine Fließkomma-Multiplikation.
//! Das spart Rechenzeit und Speicher (ein Gewicht braucht rund 1,58 Bit statt 32).

/// Eine ternäre Gewichtsmatrix (row-major) mit Werten in `{-1, 0, +1}`.
#[derive(Clone)]
pub struct Ternary {
    rows: usize,
    cols: usize,
    w: Vec<i8>,
}

impl Ternary {
    /// Baut die Matrix aus `rows*cols` Werten; jeder Wert muss in `{-1,0,1}` liegen.
    pub fn from_values(rows: usize, cols: usize, w: Vec<i8>) -> Self {
        assert_eq!(w.len(), rows * cols, "w muss rows*cols lang sein");
        for &v in &w {
            assert!((-1..=1).contains(&v), "nur -1, 0, +1 erlaubt");
        }
        Ternary { rows, cols, w }
    }

    pub fn rows(&self) -> usize {
        self.rows
    }

    pub fn cols(&self) -> usize {
        self.cols
    }

    /// `y = W · x` – umgesetzt nur mit Additionen/Subtraktionen (dank `{-1,0,1}`).
    pub fn matvec(&self, x: &[f32]) -> Vec<f32> {
        assert_eq!(x.len(), self.cols, "x muss cols lang sein");
        let mut y = vec![0.0f32; self.rows];
        for r in 0..self.rows {
            let base = r * self.cols;
            let mut acc = 0.0f32;
            for c in 0..self.cols {
                match self.w[base + c] {
                    1 => acc += x[c],
                    -1 => acc -= x[c],
                    _ => {}
                }
            }
            y[r] = acc;
        }
        y
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matvec_ist_addition_und_subtraktion() {
        // Zeile 0: +x0 -x2 ; Zeile 1: +x1
        let m = Ternary::from_values(2, 3, vec![1, 0, -1, 0, 1, 0]);
        let y = m.matvec(&[5.0, 7.0, 2.0]);
        assert!((y[0] - 3.0).abs() < 1e-6); // 5 - 2
        assert!((y[1] - 7.0).abs() < 1e-6); // 7
    }

    #[test]
    fn stimmt_mit_naiver_f32_referenz_ueberein() {
        let vals: Vec<i8> = vec![1, -1, 0, 0, 1, -1];
        let m = Ternary::from_values(2, 3, vals.clone());
        let x = [0.3, -1.2, 4.0];
        let y = m.matvec(&x);
        // Referenz mit echten Multiplikationen.
        for r in 0..2 {
            let mut ref_acc = 0.0f32;
            for c in 0..3 {
                ref_acc += (vals[r * 3 + c] as f32) * x[c];
            }
            assert!((y[r] - ref_acc).abs() < 1e-6);
        }
    }

    #[test]
    #[should_panic]
    fn lehnt_ungueltige_werte_ab() {
        Ternary::from_values(1, 2, vec![2, 0]);
    }
}
