import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesQuestionText, containsResultPage, questionSearchKey } from '../src/search.js';
test('contains searches middle, end, beyond 256 characters and case-insensitively',()=>{
 for(const text of ['前に検索語がある','末尾が検索語','長'.repeat(300)+'検索語'])assert.ok(matchesQuestionText({text},'検索語'));
 assert.ok(matchesQuestionText({text:'before AbC after'},'abc'));assert.equal(matchesQuestionText({text:'対象外'},'検索語'),false);
});
test('contains pagination keeps full counts and binds the cursor to owner and filters',()=>{
 const matches=Array.from({length:31},(_,i)=>({id:String(i),type:'tf',answer:i<19?'true':'false'}));
 const filter={search:'途中',type:'tf'},first=containsResultPage('owner',filter,matches),next=containsResultPage('owner',filter,first.cursor.matches,first.cursor.offset);
 assert.equal(first.items.length,25);assert.equal(next.items.length,6);assert.equal(next.more,false);assert.deepEqual(first.tfCounts,{true:19,false:12});assert.deepEqual(next.tfCounts,first.tfCounts);
 assert.notEqual(questionSearchKey('other',filter),first.cursor.key);assert.notEqual(questionSearchKey('owner',{...filter,search:'変更'}),first.cursor.key);
});
