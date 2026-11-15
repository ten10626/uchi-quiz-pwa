import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<div id="app"></div>', { url:'https://example.test/', pretendToBeVisual:true });
globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.Node=dom.window.Node;
const {patchView,restoreDrafts,installTextInputHandlers,questionSetting,panelColumnName}=await import('../src/ui.js');
const doc=dom.window.document,root=()=>doc.getElementById('app');
beforeEach(()=>{doc.body.innerHTML='<div id="app"></div>';});
test('genre search keeps the same focused input, Japanese text, caret and focus events during updates',()=>{
 patchView(root(),'<input id="genre-search" value=""><div id="results">全件</div>');
 const input=doc.getElementById('genre-search');let focusEvents=0;input.addEventListener('focus',()=>focusEvents++);input.focus();input.value='にほん';input.setSelectionRange(3,3);
 patchView(root(),'<input id="genre-search" value=""><div id="results">検索中</div>');restoreDrafts(root(),new Map([['genre-search','古い値']]));
 assert.equal(doc.getElementById('genre-search'),input);assert.equal(doc.activeElement,input);assert.equal(input.value,'にほん');assert.equal(input.selectionStart,3);assert.equal(focusEvents,1);assert.equal(doc.getElementById('results').textContent,'検索中');
});
test('IME filters are applied after composition ends, not after each composing character',()=>{
 patchView(root(),'<input id="genre-search">');const input=doc.getElementById('genre-search'),values=[];
 const cleanup=installTextInputHandlers(doc,el=>values.push(el.value));
 input.dispatchEvent(new dom.window.CompositionEvent('compositionstart',{bubbles:true}));input.value='に';input.dispatchEvent(new dom.window.InputEvent('input',{bubbles:true,isComposing:true}));input.value='にほん';input.dispatchEvent(new dom.window.InputEvent('input',{bubbles:true,isComposing:true}));assert.deepEqual(values,[]);
 input.value='日本';input.dispatchEvent(new dom.window.CompositionEvent('compositionend',{bubbles:true}));assert.deepEqual(values,['日本']);cleanup();
});
test('native select is retained without refocusing or resetting a just-selected value',()=>{
 const markup='<label>形式<select id="q-type"><option value="tf">○×</option><option value="panel">パネル</option></select></label><div id="extra"></div>';
 patchView(root(),markup);const select=doc.getElementById('q-type');let focusEvents=0;select.addEventListener('focus',()=>focusEvents++);select.focus();select.value='panel';
 patchView(root(),markup.replace('<div id="extra"></div>','<div id="extra">点数設定</div>'));restoreDrafts(root(),new Map([['q-type','tf']]));
 assert.equal(doc.getElementById('q-type'),select);assert.equal(doc.activeElement,select);assert.equal(select.value,'panel');assert.equal(focusEvents,1);
});
test('submitted text input can become disabled even when it was focused',()=>{
 patchView(root(),'<textarea id="answer-text"></textarea>');const input=doc.getElementById('answer-text');input.focus();input.value='確定した回答';
 patchView(root(),'<textarea id="answer-text" disabled></textarea>');assert.equal(input.disabled,true);assert.equal(input.value,'確定した回答');
});
test('new inactive controls receive their saved draft values',()=>{
 patchView(root(),'<input id="q-text"><select id="q-type"><option value="tf">○×</option><option value="panel">パネル</option></select>');
 restoreDrafts(root(),new Map([['q-text','保存前の問題'],['q-type','panel']]));assert.equal(doc.getElementById('q-text').value,'保存前の問題');assert.equal(doc.getElementById('q-type').value,'panel');
});
test('question list settings and repeated panel column labels are explicit',()=>{
 assert.equal(questionSetting({type:'tf',answer:'true'}),'正解：○');assert.equal(questionSetting({type:'tf',answer:'false'}),'正解：×');assert.equal(questionSetting({type:'panel',difficulty:20}),'20点');assert.equal(questionSetting({type:'buzz'}),'');
 assert.equal(panelColumnName('科学',{instances:2,occurrence:1}),'科学①');assert.equal(panelColumnName('科学',{instances:2,occurrence:2}),'科学②');assert.equal(panelColumnName('歴史',{instances:1,occurrence:1}),'歴史');
});
test('explicit save-and-continue reset clears the old question after editing ends',()=>{
 patchView(root(),'<form data-form="question"><textarea id="q-text">前の問題</textarea></form>');const input=doc.getElementById('q-text');input.focus();input.blur();patchView(root(),'<form data-form="question"><textarea id="q-text"></textarea></form>');assert.equal(doc.getElementById('q-text').value,'');
});
