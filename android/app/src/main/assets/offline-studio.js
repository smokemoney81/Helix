/* Helix offline tools and transparent model selection. */
(function () {
  'use strict';

  const toolsPage = document.getElementById('hx-tools');
  if (!toolsPage) return;

  // Fixed-page tool stations: no sideways scrolling and no fictitious rendering promises.
  const station = document.getElementById('hx-tool-station');
  station.innerHTML = `
    <div class="hx-tool-tabs" role="group" aria-label="Offline-Werkzeug wählen">
      <button type="button" data-tool="merge" aria-pressed="true">Video + Voice</button>
      <button type="button" data-tool="record" aria-pressed="false">Aufnahme</button>
      <button type="button" data-tool="convert" aria-pressed="false">Weitere Tools</button>
    </div>
    <div class="hx-tool-panel" id="hx-tool-merge">
      <strong>Video und Ton zusammenführen</strong>
      <p>MP4 + AAC/M4A auf diesem Gerät zu einem neuen MP4. Die ursprüngliche Tonspur wird ersetzt.</p>
      <button type="button" id="hx-tool-pick-video">1 · Video auswählen</button>
      <button type="button" id="hx-tool-pick-audio">2 · Voice / M4A auswählen</button>
      <button type="button" id="hx-tool-merge-btn" class="hx-primary-tool">3 · Video mit Voice exportieren</button>
    </div>
    <div class="hx-tool-panel" id="hx-tool-record" hidden>
      <strong>Eigene Stimme lokal aufnehmen</strong>
      <p>Aufnahme als AAC/M4A, maximal 60 Sekunden. Danach direkt als Voice für das Video auswählbar.</p>
      <button type="button" id="hx-tool-record-toggle" class="hx-primary-tool">Aufnahme starten</button>
      <button type="button" data-hx="voice">Zur deutschen Offline-Sprachausgabe</button>
    </div>
    <div class="hx-tool-panel" id="hx-tool-convert" hidden>
      <strong>Weitere lokale Werkzeuge</strong>
      <p>Sprachprobe anhören, Galerie prüfen oder Termux öffnen. Video-Generierung benötigt ein geeignetes separates Modell.</p>
      <button type="button" data-hx="voice">Deutsche Offline-Stimmen</button>
      <button type="button" data-hx="gallery">Galerie und Dateien</button>
      <button type="button" id="hx-tool-termux">Termux starten</button><div id="hx-local-model-tools"></div>
    </div>
    <div id="hx-media-status" role="status" aria-live="polite">Noch kein Video und keine Voice ausgewählt.</div>
  `;
  station.querySelectorAll('[data-hx]').forEach(button => button.addEventListener('click', () => hxNavigate(button.dataset.hx)));
  document.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click', function () {
    document.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    for (const name of ['merge','record','convert']) document.getElementById('hx-tool-' + name).hidden = button.dataset.tool !== name;
  }));
  document.getElementById('hx-tool-pick-video').addEventListener('click', () => { location.href = 'helix://tools-video'; });
  document.getElementById('hx-tool-pick-audio').addEventListener('click', () => { location.href = 'helix://tools-audio'; });
  document.getElementById('hx-tool-merge-btn').addEventListener('click', () => { location.href = 'helix://tools-merge'; });
  document.getElementById('hx-tool-termux').addEventListener('click', () => { location.href = 'helix://open-termux'; });
  const recording = document.getElementById('hx-tool-record-toggle');
  let recordingNow = false;
  recording.addEventListener('click', () => { location.href = 'helix://tools-record'; });
  window.helixMediaResult = function (message, path, ok) {
    const status = document.getElementById('hx-media-status');
    status.textContent = String(message || '') + (path ? ' · Speicherort: ' + path : '');
    status.dataset.success = String(!!ok);
    if (/Aufnahme läuft/.test(message || '')) recordingNow = true;
    if (/Aufnahme (fehlgeschlagen|konnte nicht starten)|Voice gespeichert/.test(message || '')) recordingNow = false;
    recording.textContent = recordingNow ? 'Aufnahme beenden' : 'Aufnahme starten';
  };

  // A model can be chosen for the online project, but that is NOT an offline installation.
  const detail = document.getElementById('hx-model-detail');
  const safeUrl = model => {
    const url = String(model?.url || '');
    const space = /^https:\/\/huggingface\.co\/spaces\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)$/.exec(url);
    if (space) return url + '/tree/main';
    const repo = /^https:\/\/huggingface\.co\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)$/.exec(url);
    return repo ? url + '/tree/main' : '';
  };
  window.helixModelSelected = function (model) {
    if (!model) return;
    detail.replaceChildren();
    const name = document.createElement('strong');
    name.textContent = 'Ausgewählt: ' + model.name;
    detail.appendChild(name);
    const note = document.createElement('p');
    note.textContent = model.kind === 'local'
      ? 'Textmodell: nur geeignete GGUF-Dateien können mit llama.cpp laufen. Download und Modellwechsel sind getrennte Schritte.'
      : 'Dateien dieses Modells ansehen. Bei Spaces sind dies oft Demo-Dateien statt Modellgewichte; Offline-Betrieb hängt von Format und Hardware ab.';
    detail.appendChild(note);
    const files = safeUrl(model);
    if (files) {
      const a = document.createElement('a');
      a.href = files;
      a.textContent = 'Dateien / Download bei Hugging Face ↗';
      a.className = 'hx-model-download';
      detail.appendChild(a);
    } else {
      const fallback = document.createElement('span');
      fallback.textContent = 'Für dieses Modell ist kein sicherer Download-Link bekannt.';
      detail.appendChild(fallback);
    }
    const go = document.createElement('button');
    go.type = 'button';
    go.textContent = 'Dieses Modell fürs Projekt wählen';
    go.addEventListener('click', function () {
      hxNavigate('project');
      const title = document.getElementById('detail-name');
      if (title) title.textContent = model.name;
    });
    detail.appendChild(go);
  };
  if (typeof models !== 'undefined' && typeof selected !== 'undefined') window.helixModelSelected(models.find(m => m.id === selected));

  const local = document.getElementById('hx-local-model-tools');
  if (local) {
    local.innerHTML = `
      <strong>Lokales Textmodell im Termux-Server</strong>
      <p>Der tatsächlich geladene Modellname kommt aus llama.cpp. Zum Wechsel muss der Server ein anderes GGUF laden.</p>
      <div id="hx-active-local-model" aria-live="polite">Noch nicht geprüft</div>
      <button id="hx-check-local-model" type="button">Aktives Modell prüfen</button>
      <button id="hx-model-commands" type="button">Termux-Befehl zum Modellwechsel anzeigen</button>
      <pre id="hx-model-help" hidden>1. GGUF über „Dateien / Download“ von Hugging Face laden.
2. In Termux: termux-setup-storage
3. In Termux: mkdir -p ~/models
4. Die heruntergeladene GGUF aus ~/storage/downloads nach ~/models kopieren.
5. Alten llama-server beenden und mit neuem Modell starten:
~/llama.cpp/build/bin/llama-server -m ~/models/DEINE-DATEI.gguf --host 127.0.0.1 --port 8080</pre>
    `;
    let request = 0;
    window.helixLocalModelInfo = function (name, error) {
      document.getElementById('hx-active-local-model').textContent = error
        ? 'Kein laufender Termux-Server: ' + error
        : 'Lokal aktiv: ' + (name || 'Modellname unbekannt');
    };
    document.getElementById('hx-check-local-model').addEventListener('click', () => {
      document.getElementById('hx-active-local-model').textContent = 'Prüfe 127.0.0.1:8080 …';
      location.href = 'helix://model-info';
    });
    document.getElementById('hx-model-commands').addEventListener('click', () => {
      const help = document.getElementById('hx-model-help');
      help.hidden = !help.hidden;
    });
  }
}());
