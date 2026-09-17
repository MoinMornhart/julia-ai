//! Gewichte **von der Platte streamen** statt komplett in den RAM zu laden.
//!
//! Für ein großes Modell bräuchte „alles in den RAM" viele GB. Hier lesen wir die
//! Gewichtsmatrix **zeilenweise** aus einer Datei und verrechnen jede Zeile sofort
//! mit dem Eingang. So liegt immer nur **eine** Zeile im Speicher – der RAM-Bedarf
//! ist O(cols), unabhängig von der Zeilenzahl (also von der Modellgröße).
//!
//! Dateiformat (einfach, little-endian): `rows * cols` `f32`-Werte hintereinander,
//! row-major. `rows`/`cols` gibt der Aufrufer an.

use std::fs::File;
use std::io::{self, BufReader, Read};

/// Streamt eine `f32`-Gewichtsmatrix zeilenweise aus einer Datei.
pub struct WeightStream {
    reader: BufReader<File>,
    rows: usize,
    cols: usize,
}

impl WeightStream {
    /// Öffnet die Datei; liest noch nichts (das passiert erst beim `matvec`).
    pub fn open(path: &str, rows: usize, cols: usize) -> io::Result<Self> {
        let f = File::open(path)?;
        Ok(WeightStream { reader: BufReader::new(f), rows, cols })
    }

    /// `y = W · x`, wobei `W` zeilenweise gelesen wird. Es liegt immer nur eine
    /// Zeile (`cols` `f32`) gleichzeitig im RAM – der O(1)-RAM-Kern der Idee.
    pub fn matvec(&mut self, x: &[f32]) -> io::Result<Vec<f32>> {
        assert_eq!(x.len(), self.cols, "x muss cols lang sein");
        let mut y = vec![0.0f32; self.rows];
        let mut buf = vec![0u8; self.cols * 4];
        for yr in y.iter_mut() {
            self.reader.read_exact(&mut buf)?;
            let mut acc = 0.0f32;
            for (c, &xc) in x.iter().enumerate() {
                let o = c * 4;
                let b = [buf[o], buf[o + 1], buf[o + 2], buf[o + 3]];
                acc += f32::from_le_bytes(b) * xc;
            }
            *yr = acc;
        }
        Ok(y)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn gestreamt_ergibt_dasselbe_wie_im_speicher() {
        // 2x3-Matrix.
        let matrix: [[f32; 3]; 2] = [[1.0, 2.0, 3.0], [-1.0, 0.5, 4.0]];
        // In eine Temp-Datei als LE-f32 schreiben.
        let mut bytes = Vec::new();
        for row in &matrix {
            for &v in row {
                bytes.extend_from_slice(&v.to_le_bytes());
            }
        }
        let pfad = std::env::temp_dir().join(format!("julia_core_stream_{}.bin", std::process::id()));
        let pfad_str = pfad.to_str().unwrap().to_string();
        fs::write(&pfad, &bytes).unwrap();

        let x = [2.0f32, 1.0, 0.5];
        let mut stream = WeightStream::open(&pfad_str, 2, 3).unwrap();
        let y = stream.matvec(&x).unwrap();

        // Referenz im Speicher.
        for (r, row) in matrix.iter().enumerate() {
            let acc: f32 = row.iter().zip(x.iter()).map(|(&w, &xi)| w * xi).sum();
            assert!((y[r] - acc).abs() < 1e-6, "Zeile {r} weicht ab");
        }

        let _ = fs::remove_file(&pfad);
    }
}
