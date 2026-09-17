//! Ende-zu-Ende (Issue #65): Kann der Kern wirklich etwas *lernen*? Diese Tests
//! prüfen den ganzen Weg – trainieren aus Daten (auch aus einer Datei) und über
//! das CLI-Protokoll – und belegen, dass der Loss sinkt und die Vorhersagen
//! stimmen. Damit ist die Mathematik nicht nur in Unit-Tests, sondern im
//! Zusammenspiel geprüft.

use julia_core::cli::Sitzung;
use julia_core::train::Trainer;
use std::fs;
use std::io::Write;

#[test]
fn trainer_lernt_eine_funktion_und_verbessert_sich() {
    // Zielfunktion: y = 1.5*x0 - 0.5*x1 + 2*x2
    let ziel = |x: &[f32]| 1.5 * x[0] - 0.5 * x[1] + 2.0 * x[2];
    let eingaben = [
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 0.0, 1.0],
        [1.0, 1.0, 0.0],
        [1.0, 0.0, 1.0],
        [0.5, 0.5, 0.5],
    ];
    let daten: Vec<(Vec<f32>, f32)> = eingaben
        .iter()
        .map(|x| (x.to_vec(), ziel(x)))
        .collect();

    let mut t = Trainer::new(3, 0.03);
    let erster = t.epoche(&daten);
    for _ in 0..4000 {
        t.epoche(&daten);
    }
    let letzter = t.epoche(&daten);

    assert!(letzter < erster, "Loss muss über das Training sinken");
    assert!(letzter < 0.01, "Loss sollte klein werden, war {letzter}");

    let probe = [0.2, 0.7, 0.3];
    let vorhersage = t.vorhersage(&probe);
    assert!(
        (vorhersage - ziel(&probe)).abs() < 0.1,
        "Vorhersage {vorhersage} sollte nahe an {} liegen",
        ziel(&probe)
    );
}

#[test]
fn training_aus_einer_datei() {
    // Eine „Test-Datei" mit Trainingsdaten (je Zeile: ziel x0 x1 …). y = 2*x0 + x1.
    let pfad = std::env::temp_dir().join(format!("julia_train_{}.txt", std::process::id()));
    {
        let mut f = fs::File::create(&pfad).unwrap();
        writeln!(f, "2 1 0").unwrap();
        writeln!(f, "1 0 1").unwrap();
        writeln!(f, "3 1 1").unwrap();
        writeln!(f, "4 2 0").unwrap();
    }

    let inhalt = fs::read_to_string(&pfad).unwrap();
    let daten: Vec<(Vec<f32>, f32)> = inhalt
        .lines()
        .filter_map(|z| {
            let zahlen: Vec<f32> = z.split_whitespace().filter_map(|s| s.parse().ok()).collect();
            if zahlen.len() < 2 {
                None
            } else {
                Some((zahlen[1..].to_vec(), zahlen[0]))
            }
        })
        .collect();

    let mut t = Trainer::new(2, 0.05);
    let mut loss = f32::INFINITY;
    for _ in 0..3000 {
        loss = t.epoche(&daten);
    }
    assert!(loss < 0.01, "aus der Datei gelernt, Loss {loss}");
    assert!((t.gewichte()[0] - 2.0).abs() < 0.1);
    assert!((t.gewichte()[1] - 1.0).abs() < 0.1);

    let _ = fs::remove_file(&pfad);
}

#[test]
fn cli_workflow_trainiert_und_loss_sinkt() {
    // Der komplette Weg über das Sidecar-Protokoll.
    let mut s = Sitzung::neu();
    assert!(s.verarbeite("INIT 2 0.1").starts_with("OK"));

    let batch = [(2.0, 1.0, 1.0), (1.0, 1.0, 0.0), (1.0, 0.0, 1.0), (0.0, 0.0, 0.0)];
    let mut erster: Option<f32> = None;
    let mut letzter = 0.0f32;
    for _ in 0..500 {
        for (ziel, x0, x1) in batch {
            let ant = s.verarbeite(&format!("STEP {ziel} {x0} {x1}"));
            assert!(ant.starts_with("LOSS "), "unerwartet: {ant}");
            let l: f32 = ant[5..].parse().unwrap();
            if erster.is_none() {
                erster = Some(l);
            }
            letzter = l;
        }
    }
    assert!(letzter < erster.unwrap(), "Loss über den CLI-Workflow muss sinken");
    assert!(s.verarbeite("STATS").contains("schritte="));
}
