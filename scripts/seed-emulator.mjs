// Explicit local test fixture. Refuses real projects and non-loopback endpoints.
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';
import { credentials, nameKey } from '../src/identity.js';
if(process.env.GCLOUD_PROJECT!=='demo-uchi-quiz' || !['FIREBASE_AUTH_EMULATOR_HOST','FIRESTORE_EMULATOR_HOST','FIREBASE_DATABASE_EMULATOR_HOST'].every(k=>/^127\.0\.0\.1:\d+$/.test(process.env[k]||'')))throw new Error('ローカルのdemo-uchi-quiz Emulatorだけで実行できます。');
initializeApp({projectId:'demo-uchi-quiz',databaseURL:'https://demo-uchi-quiz-default-rtdb.firebaseio.com'});
const auth=getAuth(),fs=getFirestore(),db=getDatabase();
for(let i=0;i<=7;i++){
 const uid=i===0?'test-host':`test-player-${i}`,code=i===0?'host123':`player${i}`,name=i===0?'司会テスト':`回答者${i}`;
 const c=await credentials(code);
 try{await auth.createUser({uid,email:c.email,password:c.password,displayName:name});}catch(e){if(!['auth/uid-already-exists','auth/email-already-exists'].includes(e.code))throw e;}
 await fs.doc(`members/${uid}`).set({name,admin:i===0,provisioned:true});await fs.doc(`users/${uid}`).set({name});await db.ref(`allowed/${uid}`).set(true);
}
const gnames=['ことば','科学','スポーツ','地理','歴史'];
for(let i=0;i<5;i++){const name=gnames[i],id=`genre-${i}`;await fs.doc(`genres/${id}`).set({name,nameKey:nameKey(name),owner:'test-host',refs:i===0?9:3});await fs.doc(`genreNames/${nameKey(name)}`).set({id});}
const questions=[];
for(let i=0;i<6;i++){questions.push({id:`tf-${i}`,type:'tf',text:`日本の首都は東京である。（${i+1}）`,answer:'true',genreId:'',difficulty:0});questions.push({id:`choice-${i}`,type:'choice',text:`太陽系の惑星はどれ？（${i+1}）`,options:['地球','シリウス','月','太陽'],genreId:'genre-0',difficulty:0});}
for(let i=0;i<8;i++)questions.push({id:`buzz-${i}`,type:'buzz',text:`日本で一番高い山は？（${i+1}）`,answer:'富士山',genreId:'',difficulty:0});
for(let i=0;i<5;i++)for(const difficulty of [10,20,30])questions.push({id:`panel-${i}-${difficulty}`,type:'panel',text:`${gnames[i]}のテスト問題（${difficulty}）`,answer:'テスト正解',genreId:`genre-${i}`,difficulty});
for(const {id,...q} of questions)await fs.doc(`users/test-host/questions/${id}`).set({...q,searchText:q.text.slice(0,256).toLowerCase(),random:Math.random(),updatedAt:Date.now()});
console.log('ローカルEmulatorにテスト会員8人と問題35件を用意しました。host123 / player1〜player7（本番では使用しないでください）。');
process.exit(0);
