#!/usr/bin/env node
// Run on a trusted PC only. No HTTP server, no service-account file in this project.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { credentials } from '../src/identity.js';
const [action, ...args] = process.argv.slice(2);
if (!['add','list','delete','init-admin','repair'].includes(action)) {
 console.log('Usage: npm run admin -- add | list | delete <uid> | init-admin <uid> | repair <uid>\nSet GOOGLE_APPLICATION_CREDENTIALS, GCLOUD_PROJECT, FIREBASE_DATABASE_URL. add prompts for code (never put codes in shell arguments).');
 process.exit(action ? 1 : 0);
}
if (!process.env.FIREBASE_DATABASE_URL || !process.env.GCLOUD_PROJECT) throw new Error('GCLOUD_PROJECT と FIREBASE_DATABASE_URL が必要です。');
const cli = process.env.QUIZ_USE_FIREBASE_LOGIN === 'true' ? await (await import('./admin-cli-auth.mjs')).firebaseCliCredential(process.env.GCLOUD_PROJECT,process.env.FIREBASE_DATABASE_URL) : null;
initializeApp({ credential: cli?.credential || applicationDefault(), projectId: process.env.GCLOUD_PROJECT, databaseURL: process.env.FIREBASE_DATABASE_URL });
const auth = getAuth(), fs = cli?.firestore || getFirestore(), db = cli?.database || getDatabase();
const approved = uid => fs.doc(`members/${uid}`);
async function approve(user, name, admin = false) {
 await approved(user.uid).set({ name, admin, provisioned: true });
 await fs.doc(`users/${user.uid}`).set({ name }, { merge: true });
 await db.ref(`allowed/${user.uid}`).set(true);
 await auth.updateUser(user.uid, { disabled: false });
}
async function hiddenCode() {
 if (!stdin.isTTY) throw new Error('個人コード入力には対話可能なターミナルを使用してください。');
 stdout.write('個人コード（表示しません）: ');stdin.setRawMode(true);stdin.resume();
 return new Promise((resolve,reject)=>{let value='';const read=chunk=>{
   for(const char of chunk.toString()){
    if(char==='\u0003'){finish();reject(new Error('中止しました。'));return;}
    if(char==='\r'||char==='\n'){finish();resolve(value);return;}
    if(char==='\u007f'||char==='\b')value=value.slice(0,-1);else if(/[a-zA-Z0-9]/.test(char))value+=char;else{finish();reject(new Error('半角英数字のみ入力してください。'));return;}
   }
  };function finish(){stdin.off('data',read);stdin.setRawMode(false);stdin.pause();stdout.write('\n');}stdin.on('data',read);});
}
try {
 if(action==='add'){
   const initialAdmin=process.env.QUIZ_INITIAL_ADMIN === 'true';
   if(initialAdmin){let cursor;do{const page=await auth.listUsers(1000,cursor);for(const user of page.users)if((await approved(user.uid).get()).exists)throw new Error('初回管理者はすでに存在します。通常のadd操作を使用してください。');cursor=page.pageToken;}while(cursor);}
   const code=await hiddenCode(),c=await credentials(code);
   const rl=createInterface({input:stdin,output:stdout});const name=(await rl.question('表示名: ')).trim();rl.close();
   if(!name || name.length>30)throw new Error('表示名は1〜30文字です。');
   // createUser rejects existing email. Never update an existing identity by code.
   const user=await auth.createUser({email:c.email,password:c.password,displayName:name,disabled:true});
   try{await approve(user,name,initialAdmin);console.log(`追加しました UID=${user.uid}`);}catch{console.error(`会員同期に失敗。ユーザーは無効です。repair ${user.uid} で再実行してください。`);process.exitCode=1;}
 }else if(action==='list'){
   let token;do{const page=await auth.listUsers(1000,token);for(const u of page.users){const m=await approved(u.uid).get(),r=await db.ref(`allowed/${u.uid}`).get();console.log(JSON.stringify({uid:u.uid,name:u.displayName,disabled:u.disabled,member:m.exists,rtdb:r.val()===true,admin:m.data()?.admin===true}));}token=page.pageToken;}while(token);
 }else{
   const uid=args[0];if(!uid)throw new Error('UIDが必要です。');
   if(action==='delete'){
     try{await auth.updateUser(uid,{disabled:true});await auth.revokeRefreshTokens(uid);}catch(e){if(e.code!=='auth/user-not-found')throw e;}
     await db.ref(`allowed/${uid}`).remove();await approved(uid).delete();await db.ref(`active/${uid}`).remove();
     try{await auth.deleteUser(uid);}catch(e){if(e.code!=='auth/user-not-found')throw e;}
     console.log('削除しました。問題原本は自動削除していません（本人以外には公開されません）。');
   }else if(action==='init-admin'){
     const m=await approved(uid).get(),a=await db.ref(`allowed/${uid}`).get();if(!m.exists || a.val()!==true)throw new Error('追加済み会員のみ管理者に設定できます。');
     await approved(uid).update({admin:true});console.log('ジャンル管理者に設定しました。');
   }else if(action==='repair'){
     const user=await auth.getUser(uid),m=await approved(uid).get();
     // Only identities created by this script's internal address format are eligible for provisioning repair.
     if(!/^[a-f0-9]{64}@quiz\.invalid$/.test(user.email||'') || (!m.exists && !user.disabled))throw new Error('修復対象の管理発行ユーザーを確認できません。');
     await auth.updateUser(uid,{disabled:true});await approve(user,m.data()?.name || user.displayName || '名前未設定',m.data()?.admin || false);console.log('Auth・Firestore・RTDBの会員情報を同期しました。');
   }
 }
} catch(e){console.error(e.message);process.exitCode=1;}
finally{process.exit(process.exitCode || 0);}
