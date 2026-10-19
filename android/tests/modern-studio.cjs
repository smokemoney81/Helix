'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require(process.env.HELIX_JSDOM || 'jsdom');
const assets=path.resolve(__dirname,'../app/src/main/assets');
const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!/navigation|CSS|Not implemented/.test(e.message))errors.push(e.message);});
const dom=new JSDOM(fs.readFileSync(path.join(assets,'home.html'),'utf8').replace(/<script src="([^"]+)"><\/script>/g,(_,file)=>'<script>'+fs.readFileSync(path.join(assets,file),'utf8')+'</script>'),{url:'https://helix.local/',runScripts:'dangerously',virtualConsole:vc});
const w=dom.window,d=w.document;
assert.deepEqual(errors,[]);
assert.equal(d.querySelectorAll('.hx-dock button').length,5);
for(const page of ['voice','project','models','tools','gallery','home']){w.hxNavigate(page);assert.equal(d.querySelectorAll('.hx-page:not([hidden])').length,1);assert.equal(d.querySelector('.hx-page:not([hidden])').id,'hx-'+page);assert.equal(d.querySelectorAll('.hx-dock [aria-current=page]').length,1);}
const script=d.getElementById('hx-script');script.value='Erste Szene.\n\nZweite Szene.';script.dispatchEvent(new w.Event('input'));
assert.equal(w.localStorage.getItem('helix_script_draft'),script.value);assert.match(d.getElementById('hx-script-stats').textContent,/4 Wörter.*2 Szenen/);
d.getElementById('hx-script-voice').click();assert.equal(d.getElementById('local-audio-text').value,script.value);assert.equal(d.getElementById('hx-voice').hidden,false);
d.getElementById('hx-script-project').click();assert.equal(d.getElementById('prompt').value,script.value);
let output;w.URL.createObjectURL=blob=>{output=blob;return 'blob:test';};w.URL.revokeObjectURL=()=>{};w.setTimeout=()=>0;
d.getElementById('hx-srt-export').click();assert.ok(output);assert.match(d.getElementById('hx-export-status').textContent,/Export angefordert/);
const command=d.getElementById('hx-command-type');for(const value of ['audio','mute','compress','trim','poster','normalize']){command.value=value;command.dispatchEvent(new w.Event('change'));assert.match(d.getElementById('hx-command-text').textContent,/^ffmpeg -n /);}
script.value='<img src=x onerror=alert(1)>';script.dispatchEvent(new w.Event('input'));assert.equal(d.querySelector('.hx-utility img'),null);
assert.deepEqual(errors,[]);dom.window.close();console.log('Modern studio navigation, draft persistence, script transfer, export and six FFmpeg tools passed.');
