---
title: Helix Studio
emoji: ✳️
colorFrom: green
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# Helix Studio

Ein eigenständiges, deutschsprachiges Kreativstudio mit einem von Hugging Face inspirierten Modellkatalog. Die App heißt Helix. Video und Voice werden tatsächlich über öffentliche Hugging-Face-Spaces generiert. Kein Nachbau der gesamten Hugging-Face-Plattform, keine simulierten Ergebnisse.

**Android-APK herunterladen:** [Helix.apk](https://raw.githubusercontent.com/smokemoney81/Helix/main/Helix.apk). Die Datei wurde durch den [GitHub-Actions-Build](https://github.com/smokemoney81/Helix/actions/workflows/android-apk.yml) erstellt und als Android-Debug-Version signiert. Auf einem echten Smartphone benötigt sie beim ersten Start die HTTPS-Adresse eines laufenden Helix-Servers.

## Starten

Python 3.12 oder neuer:

```bash
git clone https://github.com/smokemoney81/Helix.git
cd Helix
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app:app --host 0.0.0.0 --port 3000
```

Öffne `http://localhost:3000`. In der bereitgestellten Arbeitsumgebung sind die Python-Abhängigkeiten bereits vorhanden.

## Android-APK über GitHub

Der Workflow `.github/workflows/android-apk.yml` baut bei Änderungen am Android-Projekt auf `main` eine installierbare APK. Unter **Actions → Build Helix APK** findest du das Artefakt **helix-debug-apk**; dort kann der Build auch manuell gestartet werden. Der Download enthält `app-debug.apk` und ist eine von Androids Debug-Schlüssel signierte Testversion.

Beim ersten Start auf einem echten Smartphone fragt Helix nach der HTTPS-Adresse dieses laufenden Servers. Die APK enthält den Python-Server nicht selbst. Im Emulator wird `http://10.0.2.2:3000` automatisch verwendet. Weitere Details stehen in [android/README.md](android/README.md).

## Funktionen

- Responsiver Modellkatalog mit Suche und Video-/Voice-Filtern.
- Text zu Video mit LTX-Video und CogVideoX-2B.
- Text zu Sprache mit Qwen3-TTS, einschließlich Deutsch und auswählbarer Stimmen/Tonfall.
- KittenTTS für englische Voiceovers mit acht Stimmen auf einem CPU-Space, ohne GPU-Kontingent. Warteschlangen und Verfügbarkeit gelten weiterhin.
- Echte Hintergrundaufträge mit Warteschlange, Erfolg und Fehlerzuständen.
- Video-/Audio-Vorschau, lokale Downloads, Wiederverwenden und Löschen.
- SQLite-Bibliothek pro Browser-Sitzung, über Seitenneuladen hinweg gespeichert.
- Keine JavaScript-Framework-Abhängigkeiten; Bilder und Schriften werden lokal ausgeliefert.

## Modelle und Schnittstellen

| Modell | Space | Öffentliche Gradio-Schnittstelle |
| --- | --- | --- |
| LTX-Video | [Lightricks/ltx-video-distilled](https://huggingface.co/spaces/Lightricks/ltx-video-distilled) | `/text_to_video` |
| CogVideoX-2B | [zai-org/CogVideoX-2B-Space](https://huggingface.co/spaces/zai-org/CogVideoX-2B-Space) | `/generate` |
| Qwen3-TTS | [Qwen/Qwen3-TTS](https://huggingface.co/spaces/Qwen/Qwen3-TTS) | `/generate_custom_voice` |
| KittenTTS | [KittenML/KittenTTS-Demo](https://huggingface.co/spaces/KittenML/KittenTTS-Demo) | `/synthesize` |

Die Adapter nutzen den Gradio-HTTP-Aufruf und lesen dessen SSE-Ergebnis. Schnittstellen wurden beim Erstellen am 16.10.2026 anhand der tatsächlichen `/gradio_api/info`-Antworten geprüft. Betreiber können Spaces, Modelle oder Schnittstellen jederzeit ändern; die zentralen Adapter stehen in `app.py`.

LTX verwendet auf 32 Pixel abgerundete Abmessungen: 768 × 416, 416 × 768 oder 512 × 512. Die Breit-/Hochformate sind daher annähernd 16:9 bzw. 9:16. CogVideoX bestimmt Dauer und Auflösung selbst; nicht unterstützte Optionen werden deaktiviert.

## Kostenlos nutzen

Helix verlangt keine Gebühren und ruft keine kostenpflichtigen Inference Providers auf. Öffentliche Spaces können anonyme kostenlose Nutzung erlauben, haben aber eigene GPU-Kontingente, Warteschlangen, Anmeldepflichten und Verfügbarkeit. Freie Modellgewichte garantieren keine unbegrenzte kostenlose Rechenleistung. Direkte Links zum jeweiligen Space sind immer verfügbar. Es gibt keinen automatischen Wechsel zu kostenpflichtigen Diensten.

Optional kann ein Hugging-Face-Token als **Server-Umgebungsvariable** `HF_TOKEN` bereitgestellt werden. Der Token bleibt serverseitig. Er wird nur an die fest hinterlegten Space-Hosts gesendet. Ein Token garantiert keine Verfügbarkeit oder Gratis-GPU-Zeit. Zugangsdaten nicht in Quellcode oder Browser-Storage hinterlegen.

## Daten und Betrieb

- `MAGNETIC_DATA_DIR` legt das Datenverzeichnis fest, Standard: `./data`.
- SQLite und generierte Mediendateien liegen dort. Prompts werden an den gewählten Space übermittelt.
- Ein zufälliges HttpOnly-/SameSite-Cookie ordnet die Bibliothek dem Browser zu. Das ist eine lokale Sitzung, kein Nutzerkonto oder geräteübergreifender Login. Nach dem Löschen der Cookies besteht kein Zugriff auf die bisherige Bibliothek.
- Bis zu zwei parallele Aufträge pro Sitzung, acht insgesamt; 30 Aufträge pro Sitzung/Stunde. Pro Datei maximal 100 MB; zehn Minuten Zeitlimit je Generierung.
- **Nur einen Uvicorn-Worker verwenden.** Beim Neustart werden unterbrochene Aufträge als fehlgeschlagen markiert. Automatische Wiederholungen können doppelte Generierungen auslösen und werden deshalb nicht ausgeführt.
- Für einen öffentlich betriebenen Mehrbenutzerdienst sind ein echter Login, betreiberweite Verbrauchsgrenzen, eine Aufbewahrungsregel und dauerhaftes Storage ergänzend erforderlich.

## Optional auf Hugging Face Spaces hosten

Das Repository enthält ein Dockerfile und passende Space-Metadaten. So bekommt die Android-App eine erreichbare HTTPS-Adresse:

1. Erstelle unter [Hugging Face Spaces](https://huggingface.co/new-space) einen **öffentlichen Docker-Space** namens `Helix` im Konto `smokemoney81`, mit kostenloser CPU Basic Hardware.
2. Erstelle unter [Access Tokens](https://huggingface.co/settings/tokens) einen Token mit Schreibzugriff auf diesen Space. Speichere ihn unter [GitHub Actions Secrets](https://github.com/smokemoney81/Helix/settings/secrets/actions) als `HF_DEPLOY_TOKEN`. Den Token nie in Quellcode oder Chat-Nachrichten einfügen.
3. Starte unter [Actions → Deploy Helix Server](https://github.com/smokemoney81/Helix/actions/workflows/deploy-hf-space.yml) den Workflow **Run workflow**. Er überträgt nur `README.md`, `Dockerfile`, `requirements.txt`, `app.py` und `static/` in den Space.
4. Sobald der Space läuft, prüfe seine URL mit `/api/health` und trage diese HTTPS-Adresse in der Android-App unter **Server** ein.

Das Studio selbst benötigt keine GPU; die ausgewählten öffentlichen Spaces führen die Generierung aus. Ein separater `HF_TOKEN` als **Space-Secret** ist für diese öffentlichen Modelle optional und wird nicht mit dem Deploy-Token verwechselt. Kostenlose Spaces können schlafen; ohne dauerhaftes Volume können bei Neustarts gespeicherte Ergebnisse verloren gehen. Der Space wurde noch nicht angelegt oder deployed.

## Prüfen

```bash
python -m unittest discover -s tests -v
node --check static/app.js
```

Die sieben automatisierten Tests prüfen Sitzungsisolation, Zugriffsrechte auf Medien, Downloads/Löschen, Eingabevalidierung, CSRF, Adapterparameter, erlaubte Medien-Hosts, SSE-Antworten, Job-Limits und Wiederanlauf. Providerantworten werden in diesen Tests simuliert; die echten Browserprüfungen sind separat dokumentiert.

Optionaler Browser-Smoke-Test (erzeugt einen echten Voice-Auftrag und nutzt daher ein Space-Kontingent):

```bash
pip install playwright
python -m playwright install chromium
python tests/browser_check.py
```

Ergebnisse der realen Prüfung: siehe [VERIFICATION.md](VERIFICATION.md).

## Gestaltung und Quellen

- Eigenständige Marke „Helix“, keine offizielle Hugging-Face-App.
- Landschaftsbilder von Unsplash: [Berglandschaft](https://images.unsplash.com/photo-1464822759023-fed622ff2c3b) und [Ozean](https://images.unsplash.com/photo-1518837695005-2083093ee35b). Die Bilder sind Inspiration und werden nicht als KI-Ergebnisse ausgegeben.
- Schrift: Inter von Rasmus Andersson, SIL Open Font License, siehe `static/OFL.txt`.
- SVG-Symbole und Wellenformen sind direkt im Projekt implementiert.
- Modelllizenzen und Nutzungsbedingungen auf der jeweiligen Modell-/Space-Seite prüfen.
