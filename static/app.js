'use strict';
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const paths = {
 compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/>',
 sparkles:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/><path d="m20 2 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z"/>',
 folder:'<path d="M3 7V5h6l2 2h10v13H3Z"/><path d="M3 10h18"/>',
 globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01"/>',
 settings:'<path d="m9 3-1 3-3 1-2 4 2 2v4l4 3 3-1 3 1 4-3v-4l2-2-2-4-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 link:'<path d="m10 13 4-4m-6 6-2 2a3 3 0 0 1-4-4l5-5a3 3 0 0 1 4 0m2 3a3 3 0 0 0 4 0l5-5a3 3 0 0 0-4-4l-2 2"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 video:'<rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10 6-3v10l-6-3"/>',
 mic:'<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 10v2a6 6 0 0 0 12 0v-2m-6 8v3m-3 0h6"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
 play:'<path d="m8 5 11 7-11 7Z"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/>',
 check:'<path d="m5 12 4 4L19 6"/>'
};
const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.sparkles}</svg>`;
const esc = (text) => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function hydrateIcons(root = document){root.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));}
hydrateIcons();
const state = { models:[], jobs:[], filter:'all', mode:'video', selected:'ltx', currentJob:null, view:'discover', signature:'', previewSignature:'', inspiration:0, busy:false };
const languageNames = {German:'Deutsch', English:'Englisch', French:'Französisch', Spanish:'Spanisch', Portuguese:'Portugiesisch', Chinese:'Chinesisch', Japanese:'Japanisch', Korean:'Koreanisch', Russian:'Russisch', Auto:'Automatisch'};
const statusNames = {queued:'In der Warteschlange',running:'Wird generiert',completed:'Fertig',failed:'Nicht abgeschlossen'};
async function api(path, options = {}) {
 const response = await fetch('/api'+path, {credentials:'same-origin',...options});
 if (!response.ok) {
  let message = 'Die Verbindung zum Studio ist fehlgeschlagen.';
  try { const error = await response.json(); message = typeof error.detail === 'string' ? error.detail : 'Bitte prüfe deine Eingaben.'; } catch {}
  throw new Error(message);
 }
 return response.status === 204 ? null : response.json();
}
let toastTimer;
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,5000);}
function openInfo(){$('#info-dialog').showModal();}
['how-button','settings-button','connection-button','learn-more'].forEach(id=>$('#'+id).addEventListener('click',openInfo));
$('#close-dialog').addEventListener('click',()=>$('#info-dialog').close());
$('#info-dialog').addEventListener('click',event=>{if(event.target===$('#info-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
function route(){
 const view=location.hash.slice(1);state.view=['discover','studio','library'].includes(view)?view:'discover';
 $$('.view').forEach(el=>el.hidden=el.id!==state.view+'-view');
 $$('[data-nav]').forEach(el=>{el.classList.toggle('active',el.dataset.nav===state.view);if(el.dataset.nav===state.view)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
 $('#breadcrumb-current').textContent={discover:'Entdecken',studio:'Creation Studio',library:'Meine Bibliothek'}[state.view];
 if(state.view==='library')refreshJobs();
 if(state.view==='studio')renderPreview();
 window.scrollTo({top:0,behavior:'instant'});
}
window.addEventListener('hashchange',route);
$('#hero-create').addEventListener('click',()=>{location.hash='studio';});
$('#models-button').addEventListener('click',()=>{state.filter='all';$('#search-input').value='';location.hash='discover';renderModels();});
$('#search-input').addEventListener('input',()=>{if(state.view!=='discover')location.hash='discover';renderModels();});
document.addEventListener('keydown',event=>{if(event.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){event.preventDefault();$('#search-input').focus();}});
$$('[data-filter]').forEach(button=>button.addEventListener('click',()=>{state.filter=button.dataset.filter;renderModels();}));
function waveform(){return `<svg class="sound-wave" viewBox="0 0 220 90" aria-hidden="true">${Array.from({length:49},(_,i)=>{const height=8+Math.abs(Math.sin(i*.72)*Math.cos(i*.17))*66;return `<line x1="${i*4.4+4}" x2="${i*4.4+4}" y1="${45-height/2}" y2="${45+height/2}" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>`;}).join('')}</svg>`;}
function renderModels(){
 const query=$('#search-input').value.trim().toLowerCase();
 const models=state.models.filter(m=>(state.filter==='all'||state.filter===m.kind)&&`${m.name} ${m.owner} ${m.description} ${m.kind} ${m.tag}`.toLowerCase().includes(query));
 $$('[data-filter]').forEach(el=>{el.classList.toggle('active',el.dataset.filter===state.filter);el.setAttribute('aria-pressed',String(el.dataset.filter===state.filter));});
 $('#model-grid').innerHTML=models.map(m=>`<article class="model-card"><button class="model-art ${m.kind==='voice'?(m.id==='qwen'?'voice-art':'wave-art'):''}" data-select="${esc(m.id)}" aria-label="${esc(m.name)} im Studio öffnen">${m.kind==='video'?`<img src="/${esc(m.image)}" alt="Landschaft als kreative Inspiration, kein generiertes Ergebnis" loading="lazy">`:waveform()}<span class="art-badge">${icon(m.kind==='video'?'video':'mic')}${m.kind==='video'?'TEXT TO VIDEO':'TEXT TO SPEECH'}</span>${m.kind==='voice'?'<span class="sound-label">A VOICE FOR EVERY IDEA</span>':''}<span class="art-corner">${icon(m.kind==='video'?'play':'mic')}</span></button><div class="model-body"><div class="model-owner"><span class="owner-icon">${m.id==='qwen'?'✦':m.id==='ltx'?'◈':m.id==='cog'?'◩':'◌'}</span>${esc(m.owner)}<span> / </span></div><h3>${esc(m.name)}</h3><p>${esc(m.description)}</p><div class="model-tags"><span class="green">Öffentlicher Space</span><span>${esc(m.tag)}</span></div><div class="model-footer"><a href="https://huggingface.co/spaces/${esc(m.space)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(m.name)} auf Hugging Face">🤗 Hugging Face</a><button data-select="${esc(m.id)}">Ausprobieren ${icon('arrow')}</button></div></div></article>`).join('');
 $('#no-models').hidden=models.length>0;
 $('#model-grid').querySelectorAll('[data-select]').forEach(el=>el.addEventListener('click',()=>{selectModel(el.dataset.select);location.hash='studio';}));
}
function selectModel(id){
 const model=state.models.find(m=>m.id===id);if(!model)return;
 state.selected=id;state.mode=model.kind;
 $$('[data-mode]').forEach(el=>{el.classList.toggle('active',el.dataset.mode===state.mode);el.setAttribute('aria-pressed',String(el.dataset.mode===state.mode));});
 $('#model-select').innerHTML=state.models.filter(m=>m.kind===state.mode).map(m=>`<option value="${esc(m.id)}">${esc(m.name)} · ${esc(m.owner)}</option>`).join('');
 $('#model-select').value=id;$('#model-info').textContent='Öffentlicher Hugging-Face-Space';$('#space-link').href='https://huggingface.co/spaces/'+model.space;
 $('#video-options').hidden=state.mode!=='video';$('#voice-options').hidden=state.mode!=='voice';
 $('#prompt-label').textContent=state.mode==='video'?'Beschreibe deine Szene':'Was soll deine Stimme sagen?';
 $('#prompt').placeholder=state.mode==='video'?'A secluded cabin in the Dolomites, morning fog rolling through the valley. Slow cinematic camera movement, soft golden light …':'Manchmal beginnt etwas Großes mit einer kleinen Idee. Gib deiner Geschichte eine Stimme …';
 $('#generate-label').textContent=state.mode==='video'?'Video generieren':'Voice generieren';
 ['aspect','duration','seed'].forEach(name=>$('#'+name).disabled=id==='cog');$('#cog-note').hidden=id!=='cog';
 const currentLanguage=$('#language').value;
 const languages=id==='kitten'?['English']:['German','English','French','Spanish','Portuguese','Chinese','Japanese','Korean','Russian','Auto'];
 $('#language').innerHTML=languages.map(l=>`<option value="${l}">${languageNames[l]}</option>`).join('');
 if(languages.includes(currentLanguage))$('#language').value=currentLanguage;
 const speakers=id==='kitten'?['Jasper','Bella','Luna','Bruno','Rosie','Hugo','Kiki','Leo']:['Ryan','Serena','Aiden','Vivian','Dylan','Eric','Ono_anna','Sohee','Uncle_fu'];
 $('#speaker').innerHTML=speakers.map(s=>`<option>${s}</option>`).join('');
 $('#speaker-field').hidden=false;$('#tone-field').hidden=id==='kitten';$('#speed-field').hidden=id!=='kitten';
 $('#form-error').hidden=true;
}
$$('[data-mode]').forEach(button=>button.addEventListener('click',()=>selectModel(button.dataset.mode==='video'?'ltx':'qwen')));
$('#model-select').addEventListener('change',event=>selectModel(event.target.value));
$('#prompt').addEventListener('input',()=>$('#character-count').textContent=`${$('#prompt').value.length} / 2000`);
const inspiration={video:['A secluded cabin in the Dolomites. Morning fog rolls through the pine forest. The camera slowly glides above the treetops, cinematic golden light, realistic, peaceful.','A tiny astronaut walks across a moss-covered planet, glowing wildflowers swaying in the wind. Slow tracking shot, dreamy film photography, soft pastel colors.','Ocean waves gently wash over black volcanic sand at sunset. The camera moves slowly along the coast, reflections of warm sunlight, cinematic and atmospheric.'],voice:['Manchmal beginnt etwas Großes mit einer kleinen Idee. Ein Gedanke, eine Stimme, ein Moment. Willkommen in deinem kreativen Studio.','Eine neue Perspektive verändert alles. Lass uns gemeinsam Geschichten erzählen, die in Erinnerung bleiben.']};
$('#inspire-button').addEventListener('click',()=>{const ideas=inspiration[state.mode];let text=ideas[state.inspiration++%ideas.length];if(state.selected==='kitten')text='Every great story begins with a small idea. A thought, a voice, a moment. Welcome to your creative studio.';$('#prompt').value=text;$('#prompt').dispatchEvent(new Event('input'));$('#prompt').focus();});
$('#generation-form').addEventListener('submit',async event=>{
 event.preventDefault();if(state.busy)return;if(!state.models.length){toast('Die Modelle konnten noch nicht geladen werden. Bitte neu laden.');return;}
 const prompt=$('#prompt').value.trim();if(prompt.length<3){$('#form-error').textContent='Bitte gib mindestens drei Zeichen ein.';$('#form-error').hidden=false;return;}
 state.busy=true;$('#generate-button').disabled=true;$('#form-error').hidden=true;
 try{
  const body={model:state.selected,prompt,aspect:$('#aspect').value,duration:Number($('#duration').value),seed:Number($('#seed').value),language:$('#language').value,speaker:$('#speaker').value,tone:$('#tone').value,speed:Number($('#speed').value)};
  const job=await api('/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  state.currentJob=job.id;state.previewSignature='';state.jobs.unshift({id:job.id,model:state.selected,prompt,status:'queued',created:Date.now()/1000,options:body,error:null,media_url:null});renderPreview();await refreshJobs();toast('Dein Auftrag wurde an den Space übergeben.');
 }catch(error){$('#form-error').textContent=error.message;$('#form-error').hidden=false;}
 finally{state.busy=false;$('#generate-button').disabled=false;}
});
function renderPreview(){
 if(!state.models.length && state.currentJob)return;
 const job=state.jobs.find(j=>j.id===state.currentJob);
 const signature=job?`${job.id}:${job.status}`:'empty';if(state.previewSignature===signature)return;state.previewSignature=signature;
 const content=$('#preview-content');
 $('#preview-status').textContent=job?statusNames[job.status].toUpperCase():'BEREIT FÜR IDEEN';
 if(!job){content.innerHTML=`<div class="empty-orbit">${icon('sparkles')}</div><h3>Hier wird aus „Was wäre, wenn?“<br>etwas Wirkliches.</h3><p>Beschreibe deine Idee. Wähle deinen Look oder deine Stimme. Den Rest übernimmt das Modell.</p><p class="preview-step">01 IDEE &nbsp; / &nbsp; 02 MODELL &nbsp; / &nbsp; 03 MAGIE</p>`;return;}
 const model=state.models.find(m=>m.id===job.model);
 if(['running','queued'].includes(job.status)){content.innerHTML=`<div class="spinner" role="img" aria-label="Generierung läuft"></div><h3>Deine Idee nimmt Form an.</h3><p>${esc(model?.name)} verarbeitet deinen Auftrag. Bei öffentlichen Spaces kann die Warteschlange mehrere Minuten dauern.</p><p class="preview-step">DU KANNST HIER WEITER ENTDECKEN</p>`;return;}
 if(job.status==='failed'){content.innerHTML=`<div class="error-symbol">↻</div><h3>Der Space braucht einen Moment.</h3><p>${esc(job.error)}</p><div class="result-actions"><button class="button secondary" id="retry-preview">Erneut verwenden</button><a class="button secondary" href="https://huggingface.co/spaces/${esc(model.space)}" target="_blank" rel="noopener noreferrer">Space öffnen ↗︎</a></div>`;$('#retry-preview').addEventListener('click',()=>reuseJob(job.id));return;}
 content.innerHTML=`${model.kind==='video'?`<video controls playsinline preload="metadata" src="${esc(job.media_url)}" aria-label="Generiertes Video"></video>`:`<div class="empty-orbit">${icon('mic')}</div><h3>Deine Idee hat eine Stimme.</h3><audio controls preload="metadata" src="${esc(job.media_url)}" aria-label="Generierte Sprache"></audio>`}<p>${esc(model.name)} · In deiner Bibliothek gespeichert</p><div class="result-actions"><a class="button primary" href="${esc(job.media_url)}?download=true" download>${icon('download')}Herunterladen</a><a class="button secondary" href="#library">Zur Bibliothek</a></div>`;
}
let fetching=false;
async function refreshJobs(){
 if(fetching)return;fetching=true;
 try{
  state.jobs=await api('/jobs');
  if(!state.currentJob&&state.jobs.length)state.currentJob=state.jobs[0].id;
  $('#library-count').textContent=state.jobs.filter(j=>j.status==='completed').length;
  const signature=state.jobs.map(j=>j.id+':'+j.status).join('|');
  if(signature!==state.signature||!$('#library-grid').innerHTML){state.signature=signature;renderLibrary();}
  renderPreview();
 }catch(error){if(!state.jobs.length)toast(error.message);}
 finally{fetching=false;}
}
function reuseJob(id){
 const job=state.jobs.find(j=>j.id===id);if(!job)return;
 selectModel(job.model);$('#prompt').value=job.prompt;$('#prompt').dispatchEvent(new Event('input'));
 for(const key of ['aspect','duration','seed','language','speaker','tone','speed'])if(job.options[key]!==undefined)$('#'+key).value=job.options[key];
 location.hash='studio';$('#prompt').focus();toast('Einstellungen übernommen. Du kannst sie vor dem Start anpassen.');
}
function renderLibrary(){
 const container=$('#library-grid');
 if(!state.jobs.length){container.innerHTML=`<div class="empty-library"><div class="empty-orbit">${icon('folder')}</div><h2>Platz für deine erste große Idee.</h2><p>Hier findest du deine Videos, Voiceovers und laufenden Aufträge. Starte im Studio mit deiner ersten Kreation.</p><a href="#studio" class="button primary">Zum Creation Studio ${icon('arrow')}</a></div>`;return;}
 container.innerHTML=state.jobs.map(job=>{
  const model=state.models.find(m=>m.id===job.model);if(!model)return '';
  const date=new Date(job.created*1000).toLocaleString('de-DE',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  return `<article class="library-card"><div class="library-media">${job.media_url?(model.kind==='video'?`<video controls playsinline preload="metadata" src="${esc(job.media_url)}" aria-label="Generiertes Video"></video>`:`<audio controls preload="metadata" src="${esc(job.media_url)}" aria-label="Generierter Voiceover"></audio>`):(['running','queued'].includes(job.status)?'<div class="spinner" aria-label="Generierung läuft"></div>':icon(model.kind==='video'?'video':'mic'))}</div><div class="library-body"><div class="library-topline"><span>${esc(model.name)} · ${esc(date)}</span><span class="job-status ${esc(job.status)}">${esc(statusNames[job.status])}</span></div><h3>${esc(job.prompt)}</h3>${job.error?`<p class="library-error">${esc(job.error)}</p>`:''}<div class="library-actions">${job.media_url?`<a href="${esc(job.media_url)}?download=true" download>↓ Download</a>`:''}<button data-reuse="${esc(job.id)}">Erneut verwenden</button>${!['running','queued'].includes(job.status)?`<button class="delete-button" data-delete="${esc(job.id)}" aria-label="Generierung löschen">Löschen</button>`:''}</div></div></article>`;
 }).join('');
 container.querySelectorAll('[data-reuse]').forEach(el=>el.addEventListener('click',()=>reuseJob(el.dataset.reuse)));
 container.querySelectorAll('[data-delete]').forEach(el=>el.addEventListener('click',async()=>{el.disabled=true;try{await api('/jobs/'+el.dataset.delete,{method:'DELETE'});if(state.currentJob===el.dataset.delete)state.currentJob=null;await refreshJobs();toast('Generierung gelöscht.');}catch(error){toast(error.message);el.disabled=false;}}));
}
async function init(){
 route();renderPreview();
 try{const data=await api('/models');state.models=data.models;$('#auth-status').textContent=data.authenticated?'Server-Token konfiguriert':'Anonyme Verbindung · ohne API-Key';renderModels();selectModel('ltx');await refreshJobs();}
 catch(error){$('#model-grid').innerHTML=`<p class="form-error">${esc(error.message)} Bitte starte den Server und lade die Seite neu.</p>`;}
 setInterval(()=>{if(!document.hidden)refreshJobs();},3000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshJobs();});
}
init();
