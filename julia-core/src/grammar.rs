//! Grammatik-/FSM-Masking auf **Logit-Ebene** (constrained decoding).
//!
//! Statt zu hoffen, dass ein Modell gültige Struktur erzeugt, **erzwingen** wir sie:
//! In jedem Schritt sind nur bestimmte Tokens erlaubt; alle anderen Logits werden
//! auf `-∞` gesetzt und können damit nicht gewählt werden. Das ist ein echtes,
//! bewährtes Mittel gegen strukturelle „Halluzinationen" (ungültige Ausgaben) –
//! z. B. um garantiert gültiges JSON oder gültige Befehle zu erzeugen.

/// Setzt alle nicht erlaubten Logits auf `-∞` (in-place).
pub fn mask_logits(allowed: &[usize], logits: &mut [f32]) {
    let mut erlaubt = vec![false; logits.len()];
    for &i in allowed {
        if i < erlaubt.len() {
            erlaubt[i] = true;
        }
    }
    for (i, l) in logits.iter_mut().enumerate() {
        if !erlaubt[i] {
            *l = f32::NEG_INFINITY;
        }
    }
}

/// Index des größten Logits (Greedy-Auswahl); `None` bei leerer Eingabe.
pub fn argmax(logits: &[f32]) -> Option<usize> {
    let mut best: Option<(usize, f32)> = None;
    for (i, &v) in logits.iter().enumerate() {
        match best {
            Some((_, bv)) if v <= bv => {}
            _ => best = Some((i, v)),
        }
    }
    best.map(|(i, _)| i)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maske_verhindert_verbotene_tokens() {
        // Token 2 hat das größte Logit, ist aber nicht erlaubt.
        let mut logits = vec![0.1, 0.2, 9.0, 0.3];
        mask_logits(&[0, 1, 3], &mut logits);
        let pick = argmax(&logits).unwrap();
        assert!(pick != 2, "verbotenes Token darf nicht gewählt werden");
        assert_eq!(pick, 3, "unter den Erlaubten gewinnt das größte Logit");
    }

    #[test]
    fn argmax_auf_leer_ist_none() {
        let leer: Vec<f32> = Vec::new();
        assert_eq!(argmax(&leer), None);
    }

    #[test]
    fn maske_ignoriert_indizes_ausserhalb() {
        let mut logits = vec![1.0, 2.0];
        mask_logits(&[0, 99], &mut logits); // 99 existiert nicht → ignoriert
        assert_eq!(argmax(&logits), Some(0));
        assert_eq!(logits[1], f32::NEG_INFINITY);
    }
}
