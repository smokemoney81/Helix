/* Helix chat: explicit external ChatGPT access, and local-only Termux inference.
   No OpenAI API calls, keys, automatic cloud fallback, or spoken responses. */
(function () {
  'use strict';
  const panel = document.querySelector('#hx-home .hx-assistant');
  const input = document.getElementById('chat-input');
  const log = document.getElementById('chat-log');
  const send = document.getElementById('chat-send');
  if (!panel || !input || !log || !send) return;

  const bar = document.createElement('div');
  bar.className = 'hx-chat-actions';
  bar.innerHTML =
    '<button type="button" id="hx-open-chatgpt">ChatGPT öffnen ↗</button>' +
    '<button type="button" id="hx-open-termux">Termux starten</button>' +
    '<button type="button" id="hx-chat-reset">Neuer Chat</button>';
  panel.insertBefore(bar, document.getElementById('hx-chat-slot'));
  const status = document.createElement('div');
  status.id = 'hx-local-chat-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.textContent = 'Lokale KI: llama-server auf 127.0.0.1:8080 in Termux erforderlich.';
  panel.appendChild(status);
  const pager = document.createElement('div');
  pager.className = 'hx-chat-pager';
  pager.innerHTML = '<button type="button" id="hx-chat-prev" aria-label="Vorherige Nachrichtenseite">‹</button>' +
    '<span id="hx-chat-count">1 / 1</span>' +
    '<button type="button" id="hx-chat-next" aria-label="Nächste Nachrichtenseite">›</button>';
  log.insertAdjacentElement('afterend', pager);
  send.textContent = 'Lokale KI fragen';
  input.placeholder = 'Frage an dein lokales Termux-Modell …';
  input.maxLength = 2200;
  input.setAttribute('aria-label', 'Frage an das lokale KI-Modell');
  input.autocomplete = 'off';

  let conversation = [];
  let displayedPage = 0;
  let requestCount = 0;
  let pendingId = null;
  let timeoutId = null;

  function pages() {
    const result = [];
    for (const message of conversation) {
      const text = message.content;
      const total = Math.max(1, Math.ceil(text.length / 220));
      for (let part = 0; part < total; part++) {
        result.push({
          title: (message.role === 'user' ? 'Du' : 'Helix lokal') +
            (total > 1 ? ' · ' + (part + 1) + '/' + total : ''),
          text: text.slice(part * 220, (part + 1) * 220)
        });
      }
    }
    return result.length ? result : [{
      title: 'Lokaler Chat',
      text: 'Starte llama-server in Termux und schreibe deine Frage. Für ChatGPT tippe auf „ChatGPT öffnen“.'
    }];
  }

  function render(page) {
    const all = pages();
    displayedPage = Math.max(0, Math.min(all.length - 1, page));
    const current = all[displayedPage];
    const line = document.createElement('span');
    line.className = 'hx-chat-entry';
    const title = document.createElement('strong');
    title.textContent = current.title + ': ';
    const body = document.createElement('span');
    body.textContent = current.text;
    line.append(title, body);
    log.replaceChildren(line);
    document.getElementById('hx-chat-count').textContent = (displayedPage + 1) + ' / ' + all.length;
    document.getElementById('hx-chat-prev').disabled = displayedPage === 0;
    document.getElementById('hx-chat-next').disabled = displayedPage >= all.length - 1;
  }

  function showLatestMessage() {
    const count = pages().length;
    if (!conversation.length) { render(0); return; }
    const last = conversation[conversation.length - 1];
    const segments = Math.max(1, Math.ceil(last.content.length / 220));
    render(count - segments);
  }

  function setStatus(message) {
    status.textContent = String(message || '');
  }

  function localContext() {
    const items = [];
    let total = 0;
    for (let i = conversation.length - 1; i >= 0 && items.length < 6; i--) {
      const m = conversation[i];
      if (total + m.content.length > 4500 && items.length) break;
      items.unshift({ role: m.role, content: m.content });
      total += m.content.length;
    }
    return items;
  }

  function submit() {
    if (pendingId) { setStatus('Die lokale KI beantwortet noch deine letzte Frage.'); return; }
    const text = input.value.trim();
    if (!text) { setStatus('Bitte zuerst eine Frage eingeben.'); return; }
    conversation.push({ role: 'user', content: text });
    showLatestMessage();
    input.value = '';
    const id = 'local_' + (++requestCount);
    pendingId = id;
    send.disabled = true;
    setStatus('Frage wird ausschließlich an 127.0.0.1:8080 gesendet …');
    const messageJson = JSON.stringify(localContext());
    timeoutId = setTimeout(function () {
      if (pendingId !== id) return;
      pendingId = null;
      send.disabled = false;
      setStatus('Lokales Modell antwortet nicht. Termux prüfen und erneut fragen.');
    }, 132000);
    // Only a custom in-app route; native Android restricts outgoing network traffic to loopback.
    window.location.href = 'helix://local-chat?request=' +
      encodeURIComponent(id) + '&messages=' + encodeURIComponent(messageJson);
  }

  window.helixLocalChatSubmit = submit;
  window.helixLocalChatResult = function (id, answer, error) {
    if (!pendingId || id !== pendingId) return;
    clearTimeout(timeoutId);
    timeoutId = null;
    pendingId = null;
    send.disabled = false;
    if (error) {
      setStatus(String(error));
      return;
    }
    const response = String(answer || '').trim();
    if (!response) { setStatus('Keine Antwort erhalten.'); return; }
    conversation.push({ role: 'assistant', content: response.slice(0, 8000) });
    showLatestMessage();
    setStatus('Antwort lokal erstellt. Mit ‹ und › weitere Textseiten anzeigen.');
  };

  document.getElementById('hx-chat-prev').addEventListener('click', () => render(displayedPage - 1));
  document.getElementById('hx-chat-next').addEventListener('click', () => render(displayedPage + 1));
  document.getElementById('hx-open-chatgpt').addEventListener('click', function () {
    // Opens the external service. No text, history or keys are transferred by Helix.
    window.location.href = 'helix://open-chatgpt';
  });
  document.getElementById('hx-open-termux').addEventListener('click', function () {
    window.location.href = 'helix://open-termux';
  });
  document.getElementById('hx-chat-reset').addEventListener('click', function () {
    if (pendingId) { setStatus('Warte auf die laufende Anfrage, bevor du den Chat zurücksetzt.'); return; }
    conversation = [];
    input.value = '';
    render(0);
    setStatus('Neuer lokaler Chat. Frühere Nachrichten werden nicht gespeichert.');
  });
  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });
  render(0);
}());
