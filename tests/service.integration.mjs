import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { initializeApp as adminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getDatabase as adminDatabase } from 'firebase-admin/database';
import { getApp, getApps, deleteApp } from 'firebase/app';
import { getDatabase, ref, set, serverTimestamp, goOffline } from 'firebase/database';
import { credentials } from '../src/identity.js';
test('Firebase adapter: provisioned code login → authoring → room → answers → result → rematch/history reset/close',async()=>{
 if(!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw new Error('Run via npm run test:rules (Emulators required).');
 Object.assign(process.env,{VITE_FIREBASE_API_KEY:'demo-key',VITE_FIREBASE_AUTH_DOMAIN:'demo-uchi-quiz.firebaseapp.com',VITE_FIREBASE_PROJECT_ID:'demo-uchi-quiz',VITE_FIREBASE_DATABASE_URL:'https://demo-uchi-quiz-default-rtdb.firebaseio.com',VITE_FIREBASE_APP_ID:'demo-app',VITE_USE_EMULATORS:'true'});
 const admin=adminApp({projectId:'demo-uchi-quiz',databaseURL:process.env.VITE_FIREBASE_DATABASE_URL},'service-test');
 const users=[['service-host','hosttest','司会'],['service-p1','servicep1','回答一'],['service-p2','servicep2','回答二']];
 for(const [uid,code,name] of users){const c=await credentials(code);try{await adminAuth(admin).createUser({uid,email:c.email,password:c.password,displayName:name});}catch(e){if(e.code!=='auth/email-already-exists'&&e.code!=='auth/uid-already-exists')throw e;}await adminFirestore(admin).doc(`members/${uid}`).set({name,admin:uid==='service-host'});await adminDatabase(admin).ref(`allowed/${uid}`).set(true);}
 await adminFirestore(admin).recursiveDelete(adminFirestore(admin).collection('users/service-host/questions'));
 const genreName=`統合テスト-${crypto.randomUUID()}`;
 const vite=await createServer({server:{middlewareMode:true},appType:'custom',mode:'test'});
 try{
  const api=await vite.ssrLoadModule('/src/backend.js');assert.equal(api.configured,true);
  await api.login('HOSTTEST');const host=await api.profile('service-host');assert.equal(host.name,'司会');
  await api.createGenre(host.uid,genreName);const genre=(await api.genres()).find(g=>g.name===genreName);assert.ok(genre);
  await api.saveQuestion(host.uid,{type:'tf',text:'テストの正解は○',answer:'true',genreId:'',difficulty:0});
  await api.saveQuestion(host.uid,{type:'panel',text:'パネルテスト',answer:'正解',genreId:genre.id,difficulty:10});
  assert.equal((await api.genres()).find(g=>g.id===genre.id).refs,1);
  const listed=await api.questionPage(host.uid,null,{type:'tf',search:'テスト'});assert.equal(listed.items.length,1);
  const code=await api.createRoom(host.uid);assert.match(code,/^\d{6}$/);
  await api.login('servicep1');await api.joinRoom('service-p1','回答一',code);
  await api.login('servicep2');await api.joinRoom('service-p2','回答二',code);
  await api.login('hosttest');
  const config={mode:'single',type:'tf',count:1,timer:false,seconds:30,buzzInput:'oral',cycles:1,genres:[]};
  const pool=await api.drawPool(host.uid,config,2,{});assert.equal(pool.length,1);
  await api.begin(code,config,['service-p1','service-p2'],pool);
  await set(ref(getDatabase(getApp()),`rooms/${code}/presence`),{online:true,at:serverTimestamp(),session:'service-session'});
  await api.command(code,{type:'open'});const pub=await api.readRoom(code,'public');assert.ok(!('answer'in pub.current));
  await api.login('servicep1');await api.submit(code,pub,'service-p1','true');
  await assert.rejects(api.submit(code,pub,'service-p1','false'));await assert.rejects(api.readRoom(code,'host'));
  await api.login('hosttest');await api.command(code,{type:'close'});const answers=await api.readRoom(code,`answers/${pub.current.token}`);
  await api.command(code,{type:'reveal',answers});await api.command(code,{type:'score',uid:'service-p1',value:20});await api.command(code,{type:'next'});
  const final=await api.readRoom(code,'host');assert.equal(final.scores['service-p1'],20);assert.equal(final.stats['service-p1'].tf.correct,1);assert.equal(final.stats['service-p2'].tf.incorrect,1);
  await api.login('servicep1');const result=await api.readRoom(code,'results/service-p1');assert.equal(result.correct,1);assert.ok(!('score'in result));
  await api.login('hosttest');await api.backToLobby(code);assert.equal((await api.readRoom(code,'public')).phase,'waiting');assert.equal((await api.readRoom(code,'host')).used[pool[0].id],true);await api.resetHistory(code);assert.equal((await api.readRoom(code,'host')).used,undefined);
  await api.closeRoom(code);assert.equal(await api.readRoom(code,'meta'),null);
 }catch(e){console.error('SERVICE TEST FAILURE',e);throw e;}finally{try{goOffline(getDatabase(getApp()));await deleteApp(getApp());}catch{}await vite.close();await deleteAdminApp(admin);}
});
