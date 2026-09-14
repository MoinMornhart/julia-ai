# Whisper für Julia

Julia schreibt mit [whisper.cpp](https://github.com/ggml-org/whisper.cpp) auf, was du sagst – lokal, der Ton verlässt den PC nicht.

## Programm

- Quelle: `https://github.com/ggml-org/whisper.cpp/releases/download/b5130/whisper-bin-x64.zip` (Build zu v1.9.4, nur CPU)
- SHA-256 der ZIP-Datei: `f9ec6c52a2e949b62ab51fa21d0d497958f9e41c3010c157c4e42932d5316f3c`
- Übernommen: `whisper-cli.exe`, `whisper.dll`, `ggml.dll`, `ggml-base.dll` und alle `ggml-cpu-*.dll` (whisper.cpp wählt beim Start die schnellste für den Prozessor)
- Lizenz: MIT, siehe `LICENSE-whisper.cpp.txt`

## Visual-C++-Laufzeit

`vcruntime140.dll`, `vcruntime140_1.dll` und `msvcp140.dll` (14.51, von Microsoft signiert) liegen daneben, damit Whisper auch auf PCs ohne installierte Laufzeit startet. Microsoft erlaubt, diese Dateien zusammen mit einem Programm weiterzugeben.

## Neu holen

`node scripts/whisper-holen.js` lädt die ZIP-Datei, prüft die Summe und legt die Dateien hier ab.

## Modelle

Die Sprachmodelle liegen nicht hier, sondern werden in Julia einmal geladen (`src/main/whisper.js`, mit fester SHA-256-Summe):

| Stufe | Datei | Größe | SHA-256 |
|---|---|---|---|
| Schnell | `ggml-base-q5_1.bin` | 59 707 625 Bytes | `422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898` |
| Genau | `ggml-small-q5_1.bin` | 190 085 487 Bytes | `ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb` |
