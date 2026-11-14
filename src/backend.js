import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, signInWithEmailAndPassword, signOut, onAuthStateChanged, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, doc, collection, getDoc, getDocs, query, orderBy, limit, startAfter, startAt, endAt, where, runTransaction as fsTransaction, connectFirestoreEmulator } from 'firebase/firestore';
import { getDatabase, ref, get, set, update, remove, onValue, onDisconnect, serverTimestamp, runTransaction, connectDatabaseEmulator } from 'firebase/database';
import { credentials, nameKey } from './identity.js';
import { validateQuestion, reduceGame, startGame, publicView, ownResults } from './domain.js';
const env = import.meta.env;
export const configured = ['VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_DATABASE_URL','VITE_FIREBASE_APP_ID'].every(key=>!!env[key]);
let auth, fs, db;
if (configured) {
  const app = initializeApp({ apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, databaseURL: env.VITE_FIREBASE_DATABASE_URL, appId: env.VITE_FIREBASE_APP_ID });
  auth = getAuth(app); fs = getFirestore(app); db = getDatabase(app);
  if (env.VITE_USE_EMULATORS === 'true') { connectAuthEmulator(auth, 'http://127.0.0.1:9099'); connectFirestoreEmulator(fs, '127.0.0.1', 8080); connectDatabaseEmulator(db, '127.0.0.1', 9000); }
}
export const session = callback => configured ? onAuthStateChanged(auth, callback) : (callback(null), () => {});
export async function login(code) { const c = await credentials(code); await setPersistence(auth, browserLocalPersistence); return signInWithEmailAndPassword(auth, c.email, c.password); }
export const logout = () => signOut(auth);
export async function profile(uid) {
  let membership;
  try {membership=await getDoc(doc(fs,'members',uid));}
  catch(e){if(e.code==='permission-denied'){await logout();throw new Error('管理者が登録した会員ではありません。');}throw e;}
  if (!membership.exists()) { await logout(); throw new Error('管理者が登録した会員ではありません。'); }
  const p = await getDoc(doc(fs, 'users', uid));
  return { uid, ...membership.data(), name: p.data()?.name || membership.data().name || '名前未設定' };
}
export async function saveName(uid, name) {
  name = name.trim(); if (!name || name.length > 30) throw new Error('表示名は1〜30文字です。');
  await fsTransaction(fs, async tx => { const d = doc(fs, 'users', uid); await tx.get(d); tx.set(d, { name }); });
}
export async function genres() { return (await getDocs(query(collection(fs, 'genres'), orderBy('name')))).docs.map(d => ({ id: d.id, ...d.data() })); }
export async function createGenre(uid, name) {
  name = name.trim(); if (!name || name.length > 80) throw new Error('ジャンルは1〜80文字です。');
  const id = crypto.randomUUID(), key = nameKey(name);
  await fsTransaction(fs, async tx => {
    const index = doc(fs, 'genreNames', key), g = doc(fs, 'genres', id);
    if ((await tx.get(index)).exists()) throw new Error('同名のジャンルがあります。');
    tx.set(index, { id }); tx.set(g, { name, nameKey: key, owner: uid, refs: 0 });
  });
}
export async function changeGenre(id, newName) {
  await fsTransaction(fs, async tx => {
    const g = doc(fs, 'genres', id), snapshot = await tx.get(g); if (!snapshot.exists()) throw new Error('ジャンルがありません。');
    const old = snapshot.data();
    if (newName === null) {
      if (old.refs !== 0) throw new Error('参照中の問題があるため削除できません。');
      tx.delete(g); tx.delete(doc(fs, 'genreNames', old.nameKey));
    } else {
      const name = newName.trim(), key = nameKey(name);
      if (!name || name.length > 80) throw new Error('ジャンルは1〜80文字です。');
      if (key === old.nameKey) return;
      const n = doc(fs, 'genreNames', key); if ((await tx.get(n)).exists()) throw new Error('同名のジャンルがあります。');
      tx.delete(doc(fs, 'genreNames', old.nameKey)); tx.set(n, { id }); tx.update(g, { name, nameKey: key });
    }
  });
}
export async function questionPage(uid, cursor, filters = {}) {
  const clauses = [];
  for (const key of ['type','genreId','difficulty']) if (filters[key]) clauses.push(where(key,'==',key==='difficulty'?Number(filters[key]):filters[key]));
  clauses.push(orderBy('searchText'),orderBy('__name__'));
  const prefix = (filters.search || '').toLowerCase();
  if (cursor) clauses.push(startAfter(cursor)); else if (prefix) clauses.push(startAt(prefix));
  if (prefix) clauses.push(endAt(prefix+'\uf8ff'));
  clauses.push(limit(25));
  const page = await getDocs(query(collection(fs, 'users', uid, 'questions'), ...clauses));
  return { items: page.docs.map(d => ({ id: d.id, ...d.data() })), cursor: page.docs.at(-1), more: page.size === 25 };
}
export async function saveQuestion(uid, question, deleting = false) {
  if (!deleting) validateQuestion(question);
  const id = question.id || crypto.randomUUID(), qref = doc(fs, 'users', uid, 'questions', id);
  await fsTransaction(fs, async tx => {
    const old = (await tx.get(qref)).data();
    if (old && old.type !== question.type) throw new Error('問題形式は変更できません。');
    const before = old?.genreId || '', after = deleting ? '' : question.genreId || '';
    const changes = [...new Set([before, after].filter(Boolean))];
    const gs = await Promise.all(changes.map(gid => tx.get(doc(fs, 'genres', gid))));
    changes.forEach((gid, i) => {
      if (!gs[i].exists()) throw new Error('ジャンルがありません。');
      const delta = Number(after === gid) - Number(before === gid);
      if (delta) tx.update(gs[i].ref, { refs: gs[i].data().refs + delta, mutation: { uid, qid: id } });
    });
    if (deleting) tx.delete(qref);
    else {
      const { id: ignored, ...data } = question;
      tx.set(qref, { ...data, searchText: question.text.slice(0,256).toLowerCase(), genreId: after, difficulty: question.type === 'panel' ? question.difficulty : 0, random: old?.random ?? Math.random(), updatedAt: Date.now() });
    }
  });
}
export async function drawPool(uid, config, playerCount, used) {
  const requests = config.mode === 'round' ? [['tf', 6], ['choice', 6], ['buzz', 8]] : config.type === 'panel' ? [] : [[config.type, config.count]];
  if (config.mode === 'round' || config.type === 'panel') for (const gid of config.genres) for (const difficulty of [10, 20, 30]) requests.push(['panel', 1, gid, difficulty]);
  const pools = await Promise.all(requests.map(async ([type, count, gid, difficulty]) => {
    const filters = [where('type', '==', type)];
    if (gid) filters.push(where('genreId', '==', gid), where('difficulty', '==', difficulty));
    const result = [], seen = new Set(), pivot = Math.random();
    // Two bounded ordered scans wrap around the random pivot. Stop as soon as enough unused questions are found.
    for (const start of [pivot, null]) {
      let cursor = start;
      while (result.length < count) {
        const extra = cursor === null ? [] : [startAfter(cursor)];
        const page = await getDocs(query(collection(fs, 'users', uid, 'questions'), ...filters, orderBy('random'), ...extra, ...(start === null ? [endAt(pivot)] : []), limit(25)));
        for (const d of page.docs) if (!used[d.id] && !seen.has(d.id)) { seen.add(d.id); result.push({ id: d.id, ...d.data() }); }
        if (page.size < 25 || result.length >= count) break;
        cursor = page.docs.at(-1);
      }
      if (result.length >= count) break;
    }
    return result.slice(0, count);
  }));
  return pools.flat();
}
const path = (code, child = '') => `rooms/${code}${child ? '/' + child : ''}`;
export const readRoom = async (code, child) => (await get(ref(db, path(code, child)))).val();
export const watch = (code, child, callback, error) => onValue(ref(db, path(code, child)), s => callback(s.val()), error);
export const watchConnection = cb => onValue(ref(db, '.info/connected'), s => cb(!!s.val()));
export const watchClock = cb => onValue(ref(db, '.info/serverTimeOffset'), s => cb(s.val() || 0));
export async function activeRoom(uid) { return (await get(ref(db, `active/${uid}`))).val(); }
export const rememberRoom = (uid, code) => set(ref(db, `active/${uid}`), code);
export async function createRoom(uid) {
  for (let i = 0; i < 30; i++) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0];
    const code = String(100000 + random % 900000);
    let tx;
    try { tx = await runTransaction(ref(db, path(code, 'meta')), old => old ? undefined : { host: uid, locked: false }, { applyLocally: false }); }
    catch(e) { if ((await get(ref(db,path(code,'meta')))).exists()) continue; throw e; }
    if (tx.committed) {
      await update(ref(db, path(code)), { public: { phase: 'waiting', revision: 0 }, presence: { online: false, at: serverTimestamp(), session:crypto.randomUUID() } });
      await rememberRoom(uid, code); return code;
    }
  }
  throw new Error('部屋コードを確保できませんでした。再試行してください。');
}
export async function joinRoom(uid, name, code) {
  if (!/^\d{6}$/.test(code)) throw new Error('部屋コードは6桁です。');
  const meta = await readRoom(code, 'meta');
  if (!meta) throw new Error('部屋がありません。');
  if (meta.host !== uid) {
    const slots = await readRoom(code,'slots') || {};
    let slot = Object.keys(slots).find(key=>slots[key]===uid);
    if (!slot) {
      for(let i=1;i<=7;i++) {
        const key=`s${i}`; if(slots[key]) continue;
        try {const claim=await runTransaction(ref(db,path(code,`slots/${key}`)),old=>old?undefined:uid,{applyLocally:false});if(claim.committed){slot=key;break;}}
        catch(e) { if(!(await readRoom(code,`slots/${key}`))) throw e; }
      }
    }
    if(!slot) throw new Error('満席です（回答者は最大7人）。');
    const existing = await readRoom(code,`members/${uid}`).catch(()=>null);
    if (!existing) await set(ref(db,path(code,`members/${uid}`)),{name,slot});
  }
  await rememberRoom(uid, code);
}
export async function removePlayer(code,uid) { const member = await readRoom(code,`members/${uid}`); if(!member)return; await update(ref(db,path(code)),{[`members/${uid}`]:null,[`slots/${member.slot}`]:null}); }
export const leaveRoom = async (uid, code) => { await removePlayer(code,uid); await rememberRoom(uid,null); };
export const closeRoom = (code) => remove(ref(db, path(code)));
export async function publish(code, s) {
  const changes = { public: publicView(s) };
  for (const uid of s.players) changes[`results/${uid}`] = ownResults(s, uid);
  await update(ref(db, path(code)), changes);
}
export async function begin(code, config, players, pool) {
  await update(ref(db,path(code,'meta')), { locked:true });
  try {
    const members = await readRoom(code,'members') || {};
    const ids = Object.keys(members);
    const ordered = [...players.filter(uid=>ids.includes(uid)),...ids.filter(uid=>!players.includes(uid))];
    const old = await readRoom(code, 'host');
    const next = startGame(old, config, ordered, pool, crypto.randomUUID());
    const changes = { host:next, public:publicView(next) };
    for(const uid of ordered) changes[`results/${uid}`] = ownResults(next,uid);
    await update(ref(db,path(code)),changes);
  } catch(e) { await update(ref(db,path(code,'meta')), { locked:false }); throw e; }
}
export async function command(code, action, now = Date.now()) {
  const initial = (await get(ref(db, path(code, 'host')))).val();
  if(!initial)throw new Error('ゲームがありません。');
  const result = await runTransaction(ref(db, path(code, 'host')), state => reduceGame(state || initial, action, now), { applyLocally: false });
  if (!result.committed) throw new Error('進行を更新できませんでした。');
  const next = result.snapshot.val(); await publish(code, next); return next;
}
export async function resetHistory(code) {
  const p = await readRoom(code, 'public'); if (p.phase !== 'waiting') throw new Error('待機中に操作してください。');
  const h = await readRoom(code, 'host'); if (h) await update(ref(db, path(code, 'host')), { used: null });
}
export async function backToLobby(code) {
  await update(ref(db, path(code)), { 'meta/locked':false, public: { phase: 'waiting', revision: 0 }, answers: null, status: null, buzz: null, results: null });
  const slots=await readRoom(code,'slots') || {}, members=await readRoom(code,'members') || {};
  for(const [slot,uid] of Object.entries(slots))if(members[uid]?.slot!==slot)await remove(ref(db,path(code,`slots/${slot}`)));
}
export function answerToken(pub) { return pub.current.type === 'buzz' ? `${pub.current.token}-b${pub.current.epoch || 0}` : pub.current.token; }
export async function submit(code, pub, uid, value) {
  const token = answerToken(pub);
  await update(ref(db, path(code)), { [`answers/${token}/${uid}`]: { value, at: serverTimestamp() }, [`status/${token}/${uid}`]: true });
}
export async function buzz(code, pub, uid) {
  const target = ref(db,path(code,`buzz/${pub.current.token}`));
  try {const tx=await runTransaction(target,old=>old?.uid?undefined:{uid,epoch:pub.current.epoch || 0},{applyLocally:false});return tx.committed;}
  catch(e) {if((await get(target)).val()?.uid)return false;throw e;}
}
export const resetBuzz = (code, token) => remove(ref(db, path(code, `buzz/${token}`)));
export const overrideBuzz = (code, pub, uid) => set(ref(db, path(code, `buzz/${pub.current.token}`)), { uid, epoch: pub.current.epoch || 0 });
export async function hostPresence(code, onReady, onError) {
  let running = false, stopped = false, currentSession = '';
  const presenceRef = ref(db,path(code,'presence'));
  const unsub = onValue(ref(db, '.info/connected'), async snap => {
    if (!snap.val() || running || stopped) return;
    running = true;
    try {
      const previous = (await get(presenceRef)).val();
      const h = await readRoom(code, 'host'), p = await readRoom(code, 'public');
      if (h && p?.phase !== 'waiting' && h.phase !== 'finished') {
        const paused = h.paused ? h : await command(code, { type: 'pause' }, previous?.online === false ? previous.at : Date.now());
        await publish(code, paused);
      } else if (h && p?.phase !== 'waiting') await publish(code, h);
      if(p?.phase === 'waiting') await update(ref(db,path(code,'meta')), { locked:false });
      if(stopped)return;
      currentSession = crypto.randomUUID();
      await set(presenceRef, { online:true, at:serverTimestamp(), session:currentSession });
      await onDisconnect(presenceRef).set({ online:false, at:serverTimestamp(), session:currentSession });
      onReady?.();
    } catch (e) {
      if(currentSession)await set(presenceRef,{online:false,at:serverTimestamp(),session:currentSession}).catch(()=>{});
      onError?.(e);
    } finally { running = false; }
  });
  return () => { stopped=true;unsub();onDisconnect(presenceRef).cancel();if(currentSession)set(presenceRef,{online:false,at:serverTimestamp(),session:currentSession}).catch(()=>{}); };
}
