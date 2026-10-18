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
console.log('Helix script/layout/voice checks passed; voice commands:', cases.length);
