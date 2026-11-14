// PC-only alternative to a service-account key. Reuses firebase login in memory.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export async function firebaseCliCredential(projectId, databaseURL) {
 const auth=require('firebase-tools/lib/auth.js'),account=auth.getGlobalDefaultAccount();
 if(!account)throw new Error('先に npx firebase login を実行してください。');
 const scopes=['email','openid','https://www.googleapis.com/auth/cloudplatformprojects.readonly','https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase'];
 const token=()=>auth.getAccessToken(account.tokens.refresh_token,scopes);
 const credential={getAccessToken:async()=>{const t=await token();return{access_token:t.access_token,expires_in:Math.max(1,Math.floor(((t.expires_at||Date.now()+3600000)-Date.now())/1000))};}};
 const base=`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/`;
 const encode=v=>Object.fromEntries(Object.entries(v).map(([k,x])=>[k,typeof x==='boolean'?{booleanValue:x}:typeof x==='number'?{integerValue:String(x)}:{stringValue:String(x)}]));
 const decode=fields=>Object.fromEntries(Object.entries(fields||{}).map(([k,v])=>[k,v.stringValue??v.booleanValue??Number(v.integerValue)]));
 async function request(path,method='GET',data,merge=false){
  if(!/^(members|users)\/[^/]+$/.test(path))throw new Error('会員管理以外のFirestoreパスは扱えません。');
  const t=await token(),url=new URL(base+path.split('/').map(encodeURIComponent).join('/'));
  if(merge)for(const key of Object.keys(data))url.searchParams.append('updateMask.fieldPaths',key);
  const r=await fetch(url,{method,headers:{Authorization:`Bearer ${t.access_token}`,'Content-Type':'application/json'},...(data?{body:JSON.stringify({fields:encode(data)})}:{})});
  if(r.status===404 && ['GET','DELETE'].includes(method))return null;
  const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`Firestore会員同期: ${body.error?.message||r.status}`);return body;
 }
 const firestore={doc:path=>({get:async()=>{const body=await request(path);return{exists:!!body,data:()=>body?decode(body.fields):undefined};},set:(data,options)=>request(path,'PATCH',data,!!options?.merge),update:data=>request(path,'PATCH',data,true),delete:()=>request(path,'DELETE')})};
 async function dbRequest(path,method='GET',value){
  if(!/^(allowed|active)\/[^/]+$/.test(path))throw new Error('会員管理以外のRTDBパスは扱えません。');
  if(!/^https:\/\/[^/]+\.(firebaseio\.com|firebasedatabase\.app)$/.test(databaseURL||''))throw new Error('有効なFirebase Database URLが必要です。');
  const t=await token(),url=databaseURL+'/'+path.split('/').map(encodeURIComponent).join('/')+'.json';
  const response=await fetch(url,{method,headers:{Authorization:`Bearer ${t.access_token}`,'Content-Type':'application/json'},...(method==='PUT'?{body:JSON.stringify(value)}:{})});
  const body=await response.json();if(!response.ok)throw new Error(`RTDB会員同期: ${body.error || response.status}`);return body;
 }
 const database={ref:path=>({set:value=>dbRequest(path,'PUT',value),get:async()=>{const value=await dbRequest(path);return{val:()=>value};},remove:()=>dbRequest(path,'DELETE')})};
 return{credential,firestore,database};
}
