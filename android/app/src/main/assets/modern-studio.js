/* Local creative utilities. User text never becomes markup or executable commands. */
(function () {
  'use strict';
  const shell = document.getElementById('helix-shell');
  if (!shell) return;
  const dock = document.createElement('nav');
  dock.className = 'hx-dock'; dock.setAttribute('aria-label', 'Hauptnavigation');
  const destinations = [['home','⌂','Start'],['voice','◖','Studio'],['models','◇','Modelle'],['tools','✂','Tools'],['gallery','▧','Galerie']];
  destinations.forEach(([page, icon, label]) => {
    const button = document.createElement('button'); button.type='button'; button.dataset.page=page;
    const symbol=document.createElement('span'); symbol.textContent=icon; symbol.setAttribute('aria-hidden','true');
    button.append(symbol,document.createTextNode(label)); button.addEventListener('click',()=>hxNavigate(page)); dock.append(button);
  });
  shell.append(dock);
  const originalNavigate=window.hxNavigate;
  window.hxNavigate=function(page){
    originalNavigate(page);
    dock.querySelectorAll('button').forEach(button=>{
      const active=button.dataset.page===page || (page==='project' && button.dataset.page==='voice');
      if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    });
    try{sessionStorage.setItem('helix_last_page',page);}catch(_){}
  };
  const studio=document.createElement('div'); studio.className='hx-row';
  [['voice','Stimme & Aufnahme'],['project','Video & Projekt']].forEach(([page,label])=>{const b=document.createElement('button');b.className='hx-back';b.textContent=label;b.type='button';b.addEventListener('click',()=>hxNavigate(page));studio.append(b);});
  document.getElementById('hx-voice').insertBefore(studio,document.getElementById('hx-voice-slot'));
  const utility=document.createElement('section');utility.className='hx-utility';utility.setAttribute('aria-label','Kreativ-Werkzeuge');
  utility.innerHTML=`<h2>Skript & Untertitel</h2><p>Jeder Absatz wird zu einer Szene. Alles bleibt auf diesem Gerät. SRT-Zeiten sind ein Entwurf und können im Schnittprogramm angepasst werden.</p>
    <label for="hx-script">Dein Skript<textarea id="hx-script" placeholder="Szene 1: Deine Idee …\n\nSzene 2: Der nächste Moment …"></textarea></label>
    <div class="hx-row"><label for="hx-speed">Sprechtempo (Wörter/Min.)<input id="hx-speed" type="number" min="60" max="300" value="140"></label><label for="hx-scene-duration">Sekunden je Szene<input id="hx-scene-duration" type="number" min="1" max="600" value="5"></label></div>
    <output id="hx-script-stats" aria-live="polite"></output><div class="hx-row"><button id="hx-script-voice" type="button">An Voice senden</button><button id="hx-script-project" type="button">An Video senden</button></div>
    <button id="hx-srt-export" type="button">SRT-Untertitel exportieren</button><button id="hx-script-export" type="button">Skript als TXT exportieren</button><output id="hx-export-status" role="status"></output>
    <details><summary>FFmpeg-Werkzeuge für Termux</summary><p>Benötigt FFmpeg in Termux. Lege die Dateien unter den hier angegebenen Namen im aktuellen Ordner ab. Diese Befehle werden erst nach dem Einfügen in Termux ausgeführt.</p><label for="hx-command-type">Werkzeug<select id="hx-command-type"><option value="audio">Ton aus Video extrahieren</option><option value="mute">Video ohne Ton</option><option value="compress">Video auf 720p verkleinern</option><option value="trim">Erste 10 Sekunden schneiden</option><option value="poster">Vorschaubild erzeugen</option><option value="normalize">Lautstärke angleichen</option></select></label><pre id="hx-command-text"></pre><button id="hx-command-copy" type="button">Befehl kopieren</button><output id="hx-copy-status" role="status"></output></details>`;
  document.getElementById('hx-tool-station').after(utility);
  const script=document.getElementById('hx-script'),speed=document.getElementById('hx-speed'),duration=document.getElementById('hx-scene-duration');
  try{script.value=localStorage.getItem('helix_script_draft')||'';}catch(_){}
  function scenes(){return script.value.trim().split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean);}
  function update(){const words=script.value.trim().split(/\s+/).filter(Boolean).length;const rate=Math.min(300,Math.max(60,Number(speed.value)||140));document.getElementById('hx-script-stats').textContent=words+' Wörter · ca. '+Math.ceil(words/rate*60)+' Sekunden Sprache · '+scenes().length+' Szenen';try{localStorage.setItem('helix_script_draft',script.value);}catch(_){} }
  [script,speed,duration].forEach(e=>e.addEventListener('input',update));update();
  document.getElementById('hx-script-voice').onclick=()=>{document.getElementById('local-audio-text').value=script.value;hxNavigate('voice');};
  document.getElementById('hx-script-project').onclick=()=>{document.getElementById('prompt').value=script.value;hxNavigate('project');};
  function timestamp(seconds){return new Date(seconds*1000).toISOString().slice(11,23).replace('.',',');}
  function exportText(text,name,type){const status=document.getElementById('hx-export-status');if(!text.trim()){status.textContent='Bitte zuerst ein Skript eingeben.';return;}if(text.length>100000){status.textContent='Maximal 100.000 Zeichen pro Export.';return;}if(location.protocol==='file:' && /Android/i.test(navigator.userAgent)){location.href='helix://export-text?kind='+(name.endsWith('.srt')?'srt':'txt')+'&text='+encodeURIComponent(text);status.textContent='Speicherort im Android-Dialog auswählen.';return;}const url=URL.createObjectURL(new Blob([text],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);status.textContent='Export angefordert. Falls dein Android-WebView keinen Download anbietet, den Text im Editor markieren und kopieren.';}
  document.getElementById('hx-srt-export').onclick=()=>{const seconds=Math.min(600,Math.max(1,Number(duration.value)||5));exportText(scenes().map((text,i)=>(i+1)+'\n'+timestamp(i*seconds)+' --> '+timestamp((i+1)*seconds)+'\n'+text).join('\n\n'),'helix-untertitel.srt','text/plain;charset=utf-8');};
  document.getElementById('hx-script-export').onclick=()=>exportText(script.value,'helix-skript.txt','text/plain;charset=utf-8');
  const commands={audio:'ffmpeg -n -i video.mp4 -vn -c:a pcm_s16le helix-ton.wav',mute:'ffmpeg -n -i video.mp4 -c:v copy -an helix-stumm.mp4',compress:'ffmpeg -n -i video.mp4 -vf "scale=-2:720" -c:v libx264 -crf 26 -c:a aac helix-720p.mp4',trim:'ffmpeg -n -i video.mp4 -t 10 -c:v libx264 -c:a aac helix-clip.mp4',poster:'ffmpeg -n -ss 1 -i video.mp4 -frames:v 1 helix-vorschau.jpg',normalize:'ffmpeg -n -i voice.wav -af loudnorm=I=-16:TP=-1.5:LRA=11 helix-normalisiert.wav'};
  const type=document.getElementById('hx-command-type'),command=document.getElementById('hx-command-text');type.onchange=()=>{command.textContent=commands[type.value];};type.onchange();
  document.getElementById('hx-command-copy').onclick=async()=>{const status=document.getElementById('hx-copy-status');try{await navigator.clipboard.writeText(command.textContent);status.textContent='Befehl kopiert.';}catch(_){const range=document.createRange();range.selectNodeContents(command);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);status.textContent='Befehl markiert. Über das Auswahlmenü kopieren.';}};
  let initial='home';try{const saved=sessionStorage.getItem('helix_last_page');if(destinations.some(d=>d[0]===saved)||saved==='project')initial=saved;}catch(_){} hxNavigate(initial);
}());
