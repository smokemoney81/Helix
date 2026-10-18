/* Helix: manual, German-first voice navigation. No automatic microphone activation. */
(function () {
  'use strict';

  const shell = document.getElementById('helix-shell');
  if (!shell || !document.querySelector('.hx-head')) return;

  const commandBar = document.createElement('div');
  commandBar.className = 'hx-commandbar';
  commandBar.innerHTML =
    '<button type="button" id="hx-microphone" aria-label="Deutsche Offline-Spracherkennung starten" title="Mikrofon starten">🎙</button>' +
    '<input id="hx-voice-command" type="text" autocomplete="off" spellcheck="false" lang="de" aria-label="Befehl oder Projektidee eingeben" placeholder="Sag oder schreib, was Helix tun soll">' +
    '<button type="button" id="hx-execute-command">OK</button>' +
    '<div id="hx-voice-status" role="status" aria-live="polite">Deutsch · Sprachsteuerung per Tipp starten</div>';
  shell.insertBefore(commandBar, document.querySelector('.hx-layout'));

  const input = document.getElementById('hx-voice-command');
  const message = document.getElementById('hx-voice-status');
  const microphone = document.getElementById('hx-microphone');

  // Shared offline German voice choice, available on Home and in Voice Studio.
  const selectorPanel = document.createElement('div');
  selectorPanel.className = 'hx-voice-prefs';
  selectorPanel.innerHTML = '<label for="hx-home-voices">Lokale deutsche Stimme</label>' +
    '<select id="hx-home-voices" aria-label="Deutsche Stimme auf der Startseite" disabled><option>Sprachdaten prüfen …</option></select>';
  const homeGuide = document.querySelector('#hx-home .hx-guide');
  if (homeGuide) homeGuide.insertAdjacentElement('afterend', selectorPanel);
  const studioPanel = document.createElement('div');
  studioPanel.className = 'hx-studio-voices';
  studioPanel.innerHTML = '<label for="hx-studio-voices">Deutsche Offline-Stimme auswählen</label>' +
    '<select id="hx-studio-voices" disabled><option>Sprachdaten prüfen …</option></select>' +
    '<button type="button" id="hx-voice-preview" disabled>Stimme anhören</button>' +
    '<button type="button" id="hx-voice-refresh">Lokale Stimmen aktualisieren</button>';
  const studio = document.getElementById('hx-voice-slot');
  if (studio) studio.insertBefore(studioPanel, studio.firstChild);
  const homeSelect = document.getElementById('hx-home-voices');
  const studioSelect = document.getElementById('hx-studio-voices');
  const previewButton = document.getElementById('hx-voice-preview');
  let currentVoice = '';

  function requestOfflineVoices() {
    window.location.href = 'helix://voice-list';
  }

  window.helixVoiceChoices = function (choices, selected) {
    const voices = Array.isArray(choices) ? choices.filter(v => v && typeof v.name === 'string') : [];
    currentVoice = voices.some(v => v.name === selected) ? selected : (voices[0] ? voices[0].name : '');
    for (const select of [homeSelect, studioSelect]) {
      select.replaceChildren();
      if (!voices.length) {
        const option = document.createElement('option');
        option.textContent = 'Keine lokale deutsche Stimme installiert';
        select.appendChild(option);
      } else {
        voices.forEach((voice, i) => {
          const option = document.createElement('option');
          option.value = voice.name;
          option.textContent = 'Deutsch (' + (voice.language || 'de') + ') · ' + (i + 1);
          select.appendChild(option);
        });
        select.value = currentVoice;
      }
      select.disabled = voices.length === 0;
    }
    previewButton.disabled = voices.length === 0;
  };

  function chooseOfflineVoice(event) {
    if (!event.target.value) return;
    currentVoice = event.target.value;
    for (const select of [homeSelect,studioSelect]) select.value = currentVoice;
    window.location.href = 'helix://voice-select?name=' + encodeURIComponent(currentVoice);
  }

  homeSelect.addEventListener('change', chooseOfflineVoice);
  studioSelect.addEventListener('change', chooseOfflineVoice);
  previewButton.addEventListener('click', function () {
    if (currentVoice) window.location.href = 'helix://voice-preview?name=' + encodeURIComponent(currentVoice);
  });
  document.getElementById('hx-voice-refresh').addEventListener('click', requestOfflineVoices);
  document.querySelectorAll('[data-hx="voice"]').forEach(button => button.addEventListener('click', requestOfflineVoices));
  requestOfflineVoices();


  function updateStatus(value) {
    message.textContent = String(value || '');
  }

  function normalize(text) {
    return text.toLocaleLowerCase('de-DE').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-_]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  /* Pure routing: never execute downloads, paid actions, or media generation. */
  function interpret(rawText) {
    const text = String(rawText || '').trim().slice(0, 1200);
    const cmd = normalize(text);
    if (!cmd) return { type: 'empty' };

    if (/\b(einstellungen|server adresse|servereinstellungen|konfiguration)\b/.test(cmd))
      return { type: 'settings' };
    if (/\b(termux)\b/.test(cmd) && /\b(offne|start|starte|zeigen|aufmachen)\b/.test(cmd))
      return { type: 'termux' };
    if (/\b(galerie|meine medien|meine bilder|meine dateien)\b/.test(cmd))
      return { type: 'page', page: 'gallery' };
    if (/\b(startseite|wegweiser|hauptmenu|hauptseite)\b/.test(cmd))
      return { type: 'page', page: 'home' };

    const writing = text.match(/^(?:schreib(?:e)?|notier(?:e)?|prompt\s*[:]?|diktier(?:e)?|text\s*[:]?|meine idee\s*[:]?)[\s:]+(.+)$/i);
    if (writing && writing[1].trim()) return { type: 'prompt', text: writing[1].trim(), page: 'project' };
    const read = text.match(/^(?:lies\s+(?:bitte\s+)?vor|sprich|sag\s+laut)[\s:]+(.+)$/i);
    if (read && read[1].trim()) return { type: 'tts', text: read[1].trim() };

    const createVideo = text.match(/^(?:erstelle|mach|generiere)\s+(?:mir\s+)?(?:ein\s+)?video\s+(?:von|mit|uber|ueber)\s+(.+)$/i);
    if (createVideo && createVideo[1].trim()) return { type: 'prompt', text: createVideo[1].trim(), page: 'project' };

    // "Neue Modelle suchen" explicitly requests an online catalog query.
    if (/(?:neue|aktuelle|weitere)\s+modelle\s+(?:suchen|finden|entdecken|laden)/.test(cmd) ||
        /\b(suche|finde)\s+(?:nach\s+)?(?:neuen\s+)?modellen\b/.test(cmd)) {
      return { type: 'discover' };
    }

    const mentionsModels = /\b(modell|modelle|modellen|modellubersicht|modellsuche)\b/.test(cmd);
    if (mentionsModels) {
      if (/\b(video|videos|film|filme)\b/.test(cmd)) return { type: 'models', filter: 'video' };
      if (/\b(stimme|stimmen|voice)\b/.test(cmd)) return { type: 'page', page: 'voice' };
      return { type: 'page', page: 'models' };
    }
    if (/\b(voice|stimme|stimmen|sprecher|sprachausgabe|sprachstudio|vorlesen)\b/.test(cmd))
      return { type: 'page', page: 'voice' };
    if (/\b(video|videos|videostudio|film|filme|animation)\b/.test(cmd))
      return { type: 'page', page: 'project' };

    // Match names of catalog models if the catalog has initialized.
    if (typeof models !== 'undefined' && Array.isArray(models)) {
      const named = models.find(m => m && m.name && cmd.includes(normalize(m.name)) && normalize(m.name).length >= 4);
      if (named) return { type: 'model', id: named.id, name: named.name };
    }

    return { type: 'idea', text };
  }

  function execute(rawText) {
    const action = interpret(rawText);
    if (action.type === 'empty') {
      updateStatus('Bitte einen Befehl oder eine Idee eingeben.');
      return;
    }
    if (action.type === 'settings') {
      updateStatus('Öffne Einstellungen …');
      window.location.href = 'helix://settings';
      return;
    }
    if (action.type === 'termux') {
      updateStatus('Öffne Termux …');
      window.location.href = 'helix://open-termux';
      return;
    }
    if (action.type === 'page') {
      hxNavigate(action.page);
      if (action.page === 'voice') requestOfflineVoices();
      updateStatus('Geöffnet: ' + document.getElementById('hx-title').textContent);
      return;
    }
    if (action.type === 'models') {
      const filter = document.querySelector('.filter[data-filter="' + action.filter + '"]');
      if (filter) filter.click();
      hxNavigate('models');
      updateStatus('Passende Videomodelle angezeigt.');
      return;
    }
    if (action.type === 'discover') {
      hxNavigate('models');
      const button = document.getElementById('load-more');
      if (button && !button.disabled) button.click();
      updateStatus('Suche nach neuen Hugging-Face-Modellen gestartet. Internet erforderlich.');
      return;
    }
    if (action.type === 'model') {
      if (typeof models !== 'undefined' && models.some(m => m.id === action.id)) {
        selected = action.id;
        render();
        hxNavigate('project');
        updateStatus('Modell gewählt: ' + action.name + '. Noch kein Projekt gestartet.');
      }
      return;
    }
    if (action.type === 'tts') {
      hxNavigate('voice');
      const field = document.getElementById('local-audio-text');
      field.value = action.text;
      updateStatus('Text vorbereitet. Tippe auf „Lokales Audio abspielen“ für die Sprachprobe.');
      return;
    }
    if (action.type === 'prompt') {
      hxNavigate(action.page);
      document.getElementById('prompt').value = action.text;
      updateStatus('Prompt übernommen. Projektstart erfolgt erst nach Bestätigung.');
      return;
    }

    // Other free-form requests are visible as text, not silently sent to a server.
    hxNavigate('home');
    document.getElementById('chat-input').value = action.text;
    updateStatus('Als Projektidee eingetragen. Mit „Senden“ übernimmst du den Text.');
  }

  window.helixVoiceStatus = function (text) {
    const status = String(text || '');
    microphone.disabled = /ich hore zu|spracherkennung startet|sprache wird erkannt|mikrofonfreigabe/i.test(normalize(status));
    updateStatus(status);
  };
  window.helixVoiceResult = function (recognizedText) {
    microphone.disabled = false;
    input.value = String(recognizedText || '');
    execute(input.value);
  };
  window.helixVoiceInterpret = interpret;

  microphone.addEventListener('click', function () {
    microphone.disabled = true;
    updateStatus('Lokale Spracherkennung startet …');
    window.location.href = 'helix://voice-listen';
  });
  document.getElementById('hx-execute-command').addEventListener('click', () => execute(input.value));
  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') { event.preventDefault(); execute(input.value); }
  });
}());
