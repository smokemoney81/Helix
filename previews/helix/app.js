(() => {
  'use strict';
  const status = document.querySelector('#status');
  let statusTimer;
  function notify(message, persistent = false) {
    clearTimeout(statusTimer);
    status.textContent = message;
    status.hidden = false;
    if (!persistent) statusTimer = setTimeout(() => { status.hidden = true; }, 6000);
  }

  const input = document.querySelector('#commandInput');
  const hint = document.querySelector('#commandHint');
  document.querySelector('#commandForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!input.value.trim()) { hint.textContent = 'Bitte einen Befehl oder eine Idee eingeben.'; input.focus(); return; }
    notify('Die Oberfläche ist bereit. Zur Ausführung muss HELIX noch mit einem Modelldienst verbunden werden.');
  });
  document.querySelectorAll('.filter').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.filter').forEach(item => {
        item.classList.toggle('active', item === button);
        item.setAttribute('aria-pressed', String(item === button));
      });
    });
  });
  document.querySelector('#videoButton').addEventListener('click', () => document.querySelector('[data-filter="Video"]').click());
  document.querySelector('#modelsButton').addEventListener('click', () => notify('Für die Live-Modellsuche ist noch kein Modelldienst verbunden.'));

  const dialog = document.querySelector('#settingsDialog');
  const motion = document.querySelector('#motionToggle');
  document.querySelector('#settingsButton').addEventListener('click', () => {
    motion.checked = window.helixMotion?.enabled ?? true;
    dialog.showModal();
  });
  motion.addEventListener('change', () => window.helixMotion?.set(motion.checked));
  document.querySelector('#closeSettings').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

  const mic = document.querySelector('#micButton');
  let recognition;
  function startVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { notify('Spracheingabe wird von diesem Browser nicht unterstützt.'); return; }
    if (recognition) { recognition.stop(); return; }
    recognition = new SpeechRecognition();
    recognition.lang = 'de-DE';
    recognition.interimResults = false;
    recognition.onstart = () => { mic.classList.add('is-listening'); hint.textContent = 'Ich höre zu …'; };
    recognition.onresult = event => { input.value = event.results[0][0].transcript; };
    recognition.onerror = () => notify('Spracheingabe nicht verfügbar. Bitte Mikrofonfreigabe prüfen.');
    recognition.onend = () => { recognition = null; mic.classList.remove('is-listening'); hint.textContent = 'Bitte einen Befehl oder eine Idee eingeben.'; };
    try { recognition.start(); } catch { recognition = null; notify('Spracheingabe konnte nicht gestartet werden.'); }
  }
  mic.addEventListener('click', startVoice);
  document.querySelector('#voiceButton').addEventListener('click', startVoice);

  const updateButton = document.querySelector('#updateButton');
  const registrationPromise = 'serviceWorker' in navigator && window.isSecureContext
    ? navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => null)
    : Promise.resolve(null);
  let applyingUpdate = false;
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (applyingUpdate) location.reload();
  });

  function waitForInstall(worker) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('Zeitüberschreitung')), 20000);
      function finish(error) {
        clearTimeout(timer);
        worker.removeEventListener('statechange', change);
        if (error) reject(error); else resolve();
      }
      function change() {
        if (worker.state === 'installed' || worker.state === 'activated') finish();
        else if (worker.state === 'redundant') finish(new Error('Installation fehlgeschlagen'));
      }
      worker.addEventListener('statechange', change);
      change();
    });
  }

  updateButton.addEventListener('click', async () => {
    updateButton.disabled = true;
    updateButton.setAttribute('aria-busy', 'true');
    notify('Suche nach einem Softwareupdate …', true);
    try {
      const registration = await registrationPromise;
      if (!registration) {
        notify('Softwareupdates sind verfügbar, sobald HELIX über HTTPS oder localhost geöffnet wird.');
        return;
      }
      // update() downloads the release worker; install precaches the entire new app.
      if (!registration.waiting) await registration.update();
      if (registration.installing) {
        notify('Neue App-Version wird heruntergeladen …', true);
        await waitForInstall(registration.installing);
      }
      if (registration.waiting) {
        applyingUpdate = true;
        notify('Update wird übernommen …', true);
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        setTimeout(() => {
          if (applyingUpdate) {
            applyingUpdate = false;
            notify('Update konnte noch nicht aktiviert werden. Bitte erneut versuchen.');
            updateButton.disabled = false;
            updateButton.removeAttribute('aria-busy');
          }
        }, 10000);
      } else {
        notify('HELIX ist auf dem neuesten Stand (Version 1.2.0).');
      }
    } catch {
      notify('Update konnte nicht geladen werden. Bitte die Internetverbindung prüfen.');
    } finally {
      if (!applyingUpdate) {
        updateButton.disabled = false;
        updateButton.removeAttribute('aria-busy');
      }
    }
  });
})();
