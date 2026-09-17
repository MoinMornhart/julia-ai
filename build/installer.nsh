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
; **hart** beenden – mit /F (erzwingen), aber OHNE /T (Issue #77):
;
;  WICHTIG: Beim Auto-Update wird DIESER Installer von Julia als Kindprozess
;  gestartet. Ein `taskkill /T` (Prozess-BAUM) würde – solange Julia beim
;  Ausführen noch lebt (Race) – auch den Installer selbst mitkillen, und das
;  Update bräche mittendrin ab („Prozesse noch aktiv"). Die GPU-/Renderer-
;  Prozesse heißen ohnehin ebenfalls "Julia AI.exe" und werden schon per /IM
;  (Image-Name) erfasst – /T ist dafür gar nicht nötig. Zusätzlich beenden wir
;  die mitgelieferte whisper-cli.exe, die sonst eine Datei im Programmordner
;  sperren könnte. Zwei Durchläufe mit kurzer Pause. taskkill ist überall da.
;  Gilt für Installation und Uninstall (der läuft bei jedem Update mit).

!macro juliaHartBeenden
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "${PRODUCT_FILENAME}.exe"'
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "whisper-cli.exe"'
  Sleep 700
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "${PRODUCT_FILENAME}.exe"'
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
