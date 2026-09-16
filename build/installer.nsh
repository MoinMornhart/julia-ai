; Individuelle NSIS-Ergänzungen für den Julia-Installer (Issues #9, #32).
;
; Problem: Der Assistent-Installer (oneClick:false) beendet eine laufende Julia
; nicht zuverlässig. electron-builder zeigt beim Installieren/Updaten sonst den
; Dialog „App kann nicht geschlossen werden – bitte manuell schließen und Retry",
; der auch nach einem sanften taskkill hängen bleiben kann. Dann lässt sich eine
; neue Version nicht über eine laufende drüber installieren und das Auto-Update
; scheitert.
;
; Lösung: Den elektron-builder-Prüf-Hook `customCheckAppRunning` überschreiben
; (statt des blockierenden „bitte schließen"-Dialogs) und die laufende Instanz
; **hart** beenden – mit /F (erzwingen) und /T (auch Kindprozesse: GPU-/Renderer-
; Prozesse heißen ebenfalls "Julia AI.exe"). Zwei Durchläufe mit kurzer Pause,
; damit die Dateien danach sicher frei sind. taskkill ist auf jedem Windows da,
; also kein Zusatz-Plugin nötig. Gilt für Installation und Uninstall (der läuft
; bei jedem Update mit).

!macro juliaHartBeenden
  nsExec::Exec 'cmd.exe /c taskkill /F /T /IM "${PRODUCT_FILENAME}.exe"'
  Sleep 700
  nsExec::Exec 'cmd.exe /c taskkill /F /T /IM "${PRODUCT_FILENAME}.exe"'
  Sleep 500
!macroend

; Ersetzt die Standard-Prüfung „läuft die App?" – kein Retry-Dialog mehr,
; sondern direkt hart beenden.
!macro customCheckAppRunning
  !insertmacro juliaHartBeenden
!macroend

!macro customInit
  !insertmacro juliaHartBeenden
!macroend

!macro customUnInit
  !insertmacro juliaHartBeenden
!macroend
