; Individuelle NSIS-Ergänzungen für den Julia-Installer (Issue #9).
;
; Problem: Der Assistent-Installer (oneClick:false) beendet eine noch laufende
; Julia nicht von selbst. Läuft die App während Installation oder Update, sind
; ihre Dateien gesperrt → der Installer bricht mit einem Fehler ab ("Datei in
; Benutzung"), und automatische Updates scheitern aus demselben Grund.
;
; Lösung: Vor dem Kopieren der Dateien eine laufende Instanz beenden – erst
; sanft (Fenster schließen lassen), dann, falls nötig, hart. Beim Uninstall
; (auch der läuft vor jedem Update) genauso. taskkill ist auf jedem Windows
; vorhanden, daher ohne Zusatz-Plugin robust.

!macro schliesseJulia
  ; sanft: der App die Chance geben, sauber zu beenden
  nsExec::Exec 'cmd.exe /c taskkill /IM "${PRODUCT_FILENAME}.exe"'
  Sleep 1500
  ; hart: falls sie noch offen ist, damit die Dateien frei sind
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "${PRODUCT_FILENAME}.exe"'
  Sleep 500
!macroend

!macro customInit
  !insertmacro schliesseJulia
!macroend

!macro customUnInit
  !insertmacro schliesseJulia
!macroend
