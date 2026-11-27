import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import data from '../src/data/slang.json' with { type: 'json' };
const { outputFiles } = await build({ entryPoints: ['src/slang-engine.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { findSlang, searchEntries, aliasesFor } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));
const terms = text => findSlang(text).map(m => m.entry.term);

test('PDF database contains all 200 numbered entries with complete fields', () => {
  assert.equal(data.length, 200);
  assert.equal(new Set(data.map(e => e.term)).size, 200);
  data.forEach((entry, i) => {
    assert.equal(entry.id, i + 1);
    for (const key of ['term','pinyin','meaning','literalTranslation','goodContext','badContext','exampleZh','exampleRu','category']) assert.equal(typeof entry[key], 'string', `${i + 1}: ${key}`);
    assert.ok(Object.values(entry).every(v => v !== '' && v !== null));
  });
});
test('every supplied dictionary headword and slash variant is recognized', () => {
  for (const entry of data) for (const alias of aliasesFor(entry)) {
    const sample = alias.includes('X') && !/^[a-z]+$/i.test(alias) ? alias.replace('X', '爱') : alias;
    assert.ok(findSlang(sample).some(m => m.entry.id === entry.id), `${entry.id}: ${sample}`);
  }
});
test('mixed Chinese and case-insensitive Latin abbreviations', () => {
  assert.deepEqual(terms('这家店 YYDS！xSwL，太内卷了，我想躺平。'), ['yyds','xswl','内卷','躺平']);
});
test('OCR spaces, shortened forms and long laughter numbers', () => {
  assert.deepEqual(terms('今天破 防！E M O 了，233333，66666。'), ['破防了','emo了','233','666']);
});
test('abbreviations do not match inside unrelated words and numbers', () => {
  assert.deepEqual(terms('xyydsabc citywalking 123333 abc6666 996123'), []);
  assert.deepEqual(terms('经典、孝顺、急促、快乐、肝脏、苟且'), []);
});
test('longest overlapping forms win and exact offsets reconstruct original text', () => {
  const text='太离了个大谱了！这下破防了，DNA 动了。';
  const found=findSlang(text);
  assert.deepEqual(found.map(m=>m.entry.term),['离谱/离了个大谱','破防了','DNA动了']);
  assert.ok(found.every(m=>text.slice(m.start,m.end)===m.text));
  assert.ok(found.every((m,i)=>i===0 || found[i-1].end<=m.start));
});
test('templates match real filled-in phrases', () => {
  assert.deepEqual(terms('我一整个爱住，一种很新的生活方式。'), ['一整个X住','一种很新的X']);
});
test('unknown, empty and HTML-like input does not invent entries', () => {
  assert.deepEqual(terms(''),[]);assert.deepEqual(terms('这是一本书。'),[]);assert.deepEqual(terms('<script>alert(1)</script>'),[]);
});
test('search accepts pinyin without tones, Russian meaning and aliases', () => {
  assert.ok(searchEntries('neijuan').some(e=>e.term==='内卷'));
  assert.ok(searchEntries('гонка').some(e=>e.term==='内卷'));
  assert.ok(searchEntries('爷青结').some(e=>e.term==='爷青回/爷青结'));
  assert.equal(searchEntries('проверка_несуществующего_слова').length,0);
});
