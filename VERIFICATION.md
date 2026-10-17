# Prüfung am 16.10.2026

Geprüfter Ablauf: Modell im Browser auswählen → Generierungsauftrag an FastAPI → öffentlicher Hugging-Face-Space → SSE-Ergebnis → Mediendatei und SQLite-Bibliothek → Vorschau und Download.

| Bereich | Ergebnis | Nachweis |
| --- | --- | --- |
| Desktop und Mobilgerät | Bestanden | Chromium bei 1440 × 1100 und 390 × 844; kein horizontaler Überlauf |
| Modellkatalog | Bestanden | Vier Modelle; Voice-Filter liefert zwei Modelle; Suche nach Qwen liefert eines |
| Modellabhängige Optionen | Bestanden | Kitten: Englisch, acht Stimmen und Geschwindigkeit; Qwen: Deutsch und Tonfall |
| Navigation und Dialog | Bestanden | Entdecken, Studio, Bibliothek; Verbindungsdialog mit Escape schließbar |
| Echte Videogenerierung | Bestanden | LTX-Video-Auftrag über die App abgeschlossen; MP4 lokal gespeichert |
| Video abspielen und herunterladen | Bestanden | Chromium erkennt 1,9 Sekunden, Wiedergabezeit steigt; Download umfasst 174.956 Bytes |
| Echte Voice-Generierung | Bestanden | KittenTTS im Browser gestartet und als WAV zurückgegeben |
| Audio, Download und Persistenz | Bestanden | Audio mit 5,758 Sekunden, Download und Vorschau nach Neuladen; Bibliothek enthält das Ergebnis |
| Browser-JavaScript | Bestanden | Keine Page-/Console-Fehler im erfolgreichen vollständigen Smoke-Test |
| API und Adapter | Bestanden | Sieben unittest-Tests, einschließlich Sitzungsisolation, Eingabeprüfung, CSRF, SSE, Medien-Host-Prüfung und Job-Limits |
| JavaScript-Syntax | Bestanden | `node --check static/app.js` |

## Providerabhängige Einschränkungen

- Qwen3-TTS hat bei direkten API-Tests tatsächlich deutsche WAV-Dateien erzeugt. Spätere Aufträge lieferten jedoch `event: error` mit `data: null`. Der Space nennt dabei keinen Grund. Es wird deshalb weder eine bestimmte Fehlerursache noch eine zuverlässig verfügbare deutsche Sprachgenerierung behauptet. Die App zeigt einen verständlichen Fehler und einen Direktlink zum Space.
- Der ebenfalls geprüfte MeloTTS-Space lieferte Fehler und wurde im fertigen Katalog durch den erfolgreich geprüften CPU-Space KittenTTS ersetzt.
- Die CogVideoX-Schnittstelle wurde live geprüft; eine erfolgreiche vollständige CogVideoX-Generierung wurde nicht getestet.
- Die Daten aus Unit-Tests sind simuliert. Die oben beschriebenen LTX- und Kitten-Ergebnisse stammen dagegen von echten Space-Aufträgen.
- Es wurde kein öffentliches Deployment angelegt. Das Dockerfile ist vorbereitet, aber nicht gebaut oder auf Hugging Face getestet.

Screenshots und die real heruntergeladenen Testmedien liegen lokal unter `test-results/`. Sitzungsdateien in diesem Verzeichnis gehören nicht in ein öffentliches Repository.
