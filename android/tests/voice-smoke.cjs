'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const assets = path.join(__dirname, '..', 'app', 'src', 'main', 'assets');
const home = fs.readFileSync(path.join(assets, 'home.html'), 'utf8');
const voice = fs.readFileSync(path.join(assets, 'voice-control.js'), 'utf8');

assert.match(home, /id="hx-left"/);
assert.match(home, /id="hx-right"/);
assert.match(home, /class="hx-guide"/);
assert.match(home, /id="hx-chat-slot"/);
assert.match(home, /height:100dvh/);
assert.match(home, /helix-background.webp/);
assert.doesNotMatch(home, /Deine Idee\.<br>/);
assert.doesNotMatch(home, /id:'qwen'/);
assert.doesNotMatch(home, /id:'kitten'/);
assert.match(home, /voice-control\.js/);
assert.match(home, /voice-control\.css/);
assert.match(home, /helix:\/\/catalog/);
assert.match(voice, /helix:\/\/voice-listen/);
assert.match(voice, /helix:\/\/voice-select/);
assert.match(voice, /helix:\/\/voice-preview/);

const inline = [...home.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
assert.ok(inline.length > 0, 'Inline script must exist');
for (const item of inline) new Function(item[1]);
new Function(voice);

const begin = voice.indexOf('  function normalize(text) {');
const end = voice.indexOf('  function execute(rawText) {');
assert.ok(begin !== -1 && end > begin, 'Voice interpretation functions must exist');
const interpret = new Function('models', voice.slice(begin, end) + '\nreturn interpret;')([
  { id: 'ltx', name: 'LTX-Video', kind: 'video' },
]);
const cases = [
  ['Öffne Video', 'page', 'project'],
  ['Öffne Voice', 'page', 'voice'],
  ['Zeig meine Galerie', 'page', 'gallery'],
  ['Startseite', 'page', 'home'],
  ['Öffne Einstellungen', 'settings'],
  ['Öffne Termux', 'termux'],
  ['Neue Modelle suchen', 'discover'],
  ['Suche Videomodelle', 'models', 'video'],
  ['LTX-Video', 'model', 'ltx'],
  ['Erstelle ein Video von einer Katze', 'prompt'],
  ['Schreibe eine Landschaft mit Bergen', 'prompt'],
  ['Lies bitte vor Guten Morgen', 'tts'],
  ['Erzähl mir etwas über Planeten', 'idea'],
];
for (const [phrase, expectedType, expectedValue] of cases) {
  const result = interpret(phrase);
  assert.equal(result.type, expectedType, phrase + ': wrong action type');
  if (expectedValue) assert.ok(
    [result.page, result.filter, result.id].includes(expectedValue),
    phrase + ': wrong action target',
  );
}
// File pickers must not inject provider-controlled file names into JavaScript or HTML.
const vm = require('node:vm');
const nativeActivity = fs.readFileSync(path.join(__dirname, '..', 'app', 'src', 'main', 'java', 'com', 'helix', 'studio', 'MainActivity.java'), 'utf8');
assert.match(nativeActivity, /JSONObject\.quote\(name\)/);
assert.match(nativeActivity, /JSONObject\.quote\(uri\.toString\(\)\)/);
assert.match(nativeActivity, /takePersistableUriPermission/);

const galleryStart = home.indexOf('    function galleryItems()');
const galleryEnd = home.indexOf("    document.getElementById('upload-gallery')", galleryStart);
assert.ok(galleryStart >= 0 && galleryEnd > galleryStart, 'Gallery functions exist');
const gallerySource = home.slice(galleryStart, galleryEnd);
assert.doesNotMatch(gallerySource, /\.innerHTML\s*=/, 'Never interpolate filenames into HTML');
function element(tagName) {
  return {
    tagName, childNodes: [],
    appendChild(node) { this.childNodes.push(node); },
    replaceChildren(...children) { this.childNodes = children; }
  };
}
const galleryGrid = element('div');
const pickedMedia = element('div');
const stored = new Map();
const galleryWindow = {};
vm.runInNewContext(gallerySource, {
  window: galleryWindow,
  document: {
    createElement: element,
    getElementById(id) {
      return id === 'gallery-grid' ? galleryGrid : id === 'picked-media' ? pickedMedia : null;
    }
  },
  localStorage: {
    getItem(key) { return stored.get(key) || null; },
    setItem(key, value) { stored.set(key, value); }
  }
});
const fileName = '<img src=x onerror=alert(1)>';
galleryWindow.showPickedMedia('content://com.example.media/test/1', fileName, 'image/png');
assert.equal(galleryGrid.childNodes.length, 1);
assert.equal(galleryGrid.childNodes[0].childNodes[1].textContent, fileName);
assert.equal(galleryGrid.childNodes[0].childNodes[0].tagName, 'img');
assert.equal(JSON.parse(stored.get('helix_gallery'))[0].name, fileName);
galleryWindow.showPickedMedia('javascript:alert(1)', 'bad', 'image/png');
assert.equal(galleryGrid.childNodes.length, 1, 'Unsupported URI must be rejected');

console.log('Helix layout, voice and safe gallery checks passed; voice commands:', cases.length);
