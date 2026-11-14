import './style.css';
import * as api from './backend.js';
import { TYPES, ranking, ownResults, checkPool } from './domain.js';
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const state = { user: null, screen: 'home', genres: [], page: null, editing: null, code: '', meta: null, pub: null, host: null, members: {}, presence: null, connected: false, offset: 0, answers: {}, status: {}, buzz: null, own: null, result: null, busy: false, notice: '', error: '', selected: '', poolInfo: '', availableMax:null, order: [] };
const drafts = new Map(); let roomUnsubs = [], currentUnsubs = [], globalUnsubs = [], presenceStop, currentKey = '', autoBusy = false, soundWinner = '';
const name = uid => state.members[uid]?.name || uid.slice(0, 6);
const isHost = () => state.meta?.host === state.user?.uid;
const now = () => Date.now() + state.offset;
const blocked = () => !state.connected || !state.presence?.online || state.pub?.paused;
const btn = (label, act, options = '') => `<button data-act="${act}" ${options}>${label}</button>`;
const field = (label, id, value = '', extra = '') => `<label>${label}<input id="${id}" value="${esc(value)}" ${extra}></label>`;
const select = (label, id, options, selected = '') => `<label>${label}<select id="${id}">${options.map(([value, text]) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
function genreSelect(id, selected = '') { return `<label>ジャンル<input type="search" id="${id}-search" placeholder="名前で絞り込み" data-genre-search="${id}"><select id="${id}"><option value="">選択してください</option>${state.genres.map(g => `<option value="${esc(g.id)}" ${g.id === selected ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>`; }
function render() {
  const focus = document.activeElement?.id, start = document.activeElement?.selectionStart, end = document.activeElement?.selectionEnd;
  const host = isHost();
  $('app').innerHTML = `<header><a class="brand" href="#" data-act="home"><span class="logo">Q</span>うちクイズ</a>${state.user ? `<span class="user-name">${esc(state.user.name)}</span>` : ''}</header><main>${state.error ? `<div class="alert error" role="alert">${esc(state.error)}</div>` : ''}${state.notice ? `<div class="alert" role="status">${esc(state.notice)}</div>` : ''}${!api.configured ? setupScreen() : !state.user ? loginScreen() : state.code ? roomScreen(host) : state.screen === 'questions' ? questionsScreen() : state.screen === 'editor' ? editorScreen() : state.screen === 'genres' ? genresScreen() : homeScreen()}</main>`;
  for (const [id, value] of drafts) {
    const el = $(id); if (!el) continue;
    if (el.type === 'checkbox') el.checked = value; else el.value = value;
  }
  document.querySelectorAll('[data-genre-search]').forEach(applyGenreFilter);
  if (focus && $(focus)) { $(focus).focus({ preventScroll: true }); if (typeof start === 'number') try { $(focus).setSelectionRange(start, end); } catch {} }
  document.body.classList.toggle('busy', state.busy);
  updateCountdown();
}
function setupScreen() { return `<section class="hero"><div class="card"><span class="tag">セットアップ待ち</span><h2>Firebaseを接続してください</h2><p>ソースの <code>.env.example</code> を <code>.env.local</code> にコピーし、Firebaseの公開設定を入力するとログインできます。</p><p>管理者によるアカウント発行・ルール設定の手順は同梱のREADMEをご覧ください。</p></div></section>`; }
function loginScreen() { return `<section class="hero"><h1>ログイン</h1><form data-form="login" class="card login">${field('個人コード', 'login-code', '', 'type="password" autocomplete="current-password" autocapitalize="none" spellcheck="false" required minlength="6"')}<button class="primary" type="submit">ログイン</button></form></section>`; }
function homeScreen() { return `<section><h1 class="sr-only">ホーム</h1><div class="home-grid"><button class="feature dark" data-act="create"><strong>司会をする</strong></button><div class="feature light"><strong>クイズに参加</strong><form data-form="join"><input id="join-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="6桁の部屋コード" aria-label="部屋コード" required><button class="primary" type="submit">参加する →</button></form></div></div><div class="tools">${btn('＋ 問題をつくる', 'new-question')}${btn('自分の問題', 'questions')}${btn('共有ジャンル', 'genres')}</div><div class="card"><form data-form="name" class="inline">${field('表示名', 'profile-name', state.user.name, 'maxlength="30" required')}<button type="submit">保存</button></form>${btn('ログアウト', 'logout', 'class="text-button"')}</div></section>`; }
function questionsScreen() {
  const items = state.page?.items || [];
  return `<section>${btn('← ホーム', 'home', 'class="text-button"')}<div class="heading"><h1>自分の問題</h1>${btn('＋ 作問', 'new-question', 'class="primary"')}</div><form data-form="question-filter" class="card filters">${field('問題文の先頭から検索', 'question-search', '', 'type="search"')}${select('形式', 'question-type', [['','すべて'], ...Object.entries(TYPES)])}${select('ジャンル', 'question-genre', [['','すべて'], ...state.genres.map(g => [g.id,g.name])])}${select('難度', 'question-difficulty', [['','すべて'],['10','10'],['20','20'],['30','30']])}<button type="submit">検索・絞り込み</button></form><div class="question-list">${items.map(q => `<button class="question-row" data-act="edit-question" data-id="${esc(q.id)}"><span class="tag">${TYPES[q.type]}</span><strong>${esc(q.text)}</strong><span>編集 →</span></button>`).join('') || '<div class="empty">このページに該当する問題はありません。</div>'}</div><div class="inline">${btn('最初のページ', 'questions')}${state.page?.more ? btn('次の25件 →', 'next-page') : ''}</div></section>`;
}
function editorScreen() {
  const q = state.editing || { type: 'tf', text: '', answer: 'true', genreId: '', difficulty: 10, options: ['', '', '', ''] };
  const type = drafts.get('q-type') || q.type;
  return `<section>${btn('← 問題一覧', 'questions', 'class="text-button"')}<h1>${q.id ? '問題を編集' : '新しい問題'}</h1><form data-form="question" class="card stack">${select('形式', 'q-type', Object.entries(TYPES), type).replace('<select ', `<select ${q.id ? 'disabled' : ''} `)}<label>問題文<textarea id="q-text" required maxlength="4000" rows="4">${esc(q.text)}</textarea></label>${type === 'tf' ? select('正解', 'q-answer', [['true','○'],['false','×']], q.answer) : type === 'choice' ? `<p class="hint">先頭が正解です。出題時に順番をシャッフルします。</p>${[0,1,2,3].map(i => field(i === 0 ? '正解の選択肢' : `誤答 ${i}`, `q-option-${i}`, q.options?.[i] || '', 'required maxlength="1000"')).join('')}` : field('公式の正解', 'q-answer', q.type === type ? q.answer : '', 'required maxlength="4000"')}${['choice','panel'].includes(type) ? genreSelect('q-genre', q.genreId) : ''}${type === 'panel' ? select('難度', 'q-difficulty', [['10','10'],['20','20'],['30','30']], String(q.difficulty)) : ''}<div class="inline"><button class="primary" type="submit">保存</button><button type="submit" name="continue" value="yes">保存して続けて追加</button></div>${q.id ? btn('この問題を削除', 'delete-question', 'class="danger"') : ''}</form></section>`;
}
function genresScreen() { return `<section>${btn('← ホーム', 'home', 'class="text-button"')}<h1>共有ジャンル</h1><form data-form="genre" class="card inline">${field('新しいジャンル', 'genre-name', '', 'required maxlength="80"')}<button type="submit" class="primary">追加</button></form>${field('ジャンルを検索', 'genre-search', '', 'type="search"')}<div class="question-list">${state.genres.filter(g => !drafts.get('genre-search') || g.name.includes(drafts.get('genre-search'))).map(g => `<div class="genre-row"><div><strong>${esc(g.name)}</strong><small>参照中 ${g.refs}問</small></div>${g.owner === state.user.uid || state.user.admin ? `<div>${btn('改名','rename-genre',`data-id="${esc(g.id)}"`)}${btn('削除','delete-genre',`data-id="${esc(g.id)}" ${g.refs ? 'disabled' : ''}`)}</div>` : ''}</div>`).join('')}</div></section>`; }
function scorePanel() { return `<aside class="scores"><div class="heading"><strong>得点</strong><span>司会者にだけ表示</span></div>${ranking(state.host?.scores || {}).map(r => `<div class="score-row"><span>${state.pub?.phase === 'finished' ? `${r.rank}位 ` : ''}${esc(name(r.uid))}</span>${btn('−10','score-delta',`data-id="${r.uid}" data-delta="-10"`)}<input id="score-${r.uid}" type="number" step="1" value="${r.score}" data-score="${r.uid}" aria-label="${esc(name(r.uid))}の得点">${btn('＋10','score-delta',`data-id="${r.uid}" data-delta="10"`)}</div>`).join('')}</aside>`; }
function roomScreen(host) {
  const p = state.pub;
  if (!state.meta || !p) return '<div class="empty">ルームを読み込んでいます…</div>';
  if (!host && !state.members[state.user.uid]) return `<div class="card"><h1>この部屋の参加者ではありません</h1>${btn('ホームへ','exit-view')}</div>`;
  return `<section class="room"><div class="room-bar"><span class="tag">${host ? '司会者' : '回答者'}</span><span>ROOM <strong>${esc(state.code)}</strong></span><span class="connection ${state.connected ? '' : 'offline'}">${state.connected ? '接続中' : '通信断'}</span></div>${host && p.phase !== 'waiting' && state.host ? scorePanel() : ''}${host && state.host && p.phase!=='waiting' && state.host.revision!==p.revision ? btn('進行データの同期を再試行','sync','class="primary"') : ''}${!state.connected ? '<div class="alert error">通信が切れています。接続を待っています。確定済みの回答は維持されます。</div>' : ''}${p.phase !== 'waiting' && (!state.presence?.online || p.paused) ? `<div class="alert">司会者の接続が中断されたため停止中です。${host && state.presence?.online ? btn('ゲームを再開','resume','class="primary"') : '司会者の手動再開をお待ちください。'}</div>` : ''}${p.phase === 'waiting' ? lobbyScreen(host) : p.phase === 'finished' ? resultScreen(host) : playScreen(host)}${host ? `<div class="room-actions">${p.phase !== 'waiting' && p.phase !== 'finished' ? btn('ゲームを途中終了','abort','class="text-button danger"') : ''}${btn('ルームを閉鎖','close-room','class="text-button danger"')}</div>` : p.phase === 'waiting' ? btn('部屋から退出','leave','class="text-button"') : ''}</section>`;
}
function lobbyScreen(host) {
  const ids = Object.keys(state.members), config = state.host?.config || {};
  const preferred=state.order.length?state.order:(state.host?.players || []);
  const order = [...preferred.filter(uid => ids.includes(uid)), ...ids.filter(uid => !preferred.includes(uid))];
  const mode = drafts.get('game-mode') || config.mode || 'single', type = drafts.get('game-type') || config.type || 'tf';
  return `<h1>待機室</h1><div class="card"><div class="heading"><h2>回答プレイヤー</h2><span>${ids.length} / 7人</span></div>${order.map((uid,i) => `<div class="member-row"><span><b class="avatar">${i+1}</b>${esc(name(uid))}</span>${host ? `<div>${btn('↑','order-up',`data-id="${uid}" ${i === 0 ? 'disabled' : ''}`)}${btn('外す','kick',`data-id="${uid}"`)}</div>` : ''}</div>`).join('') || '<p>まだ参加者がいません。</p>'}${host ? `<small>↑でパネルの選択順を変更できます。</small>${btn('招待URLをコピー','invite')}` : '<p>司会者の開始操作を待っています。</p>'}</div>${host ? `<form data-form="start" class="card stack"><h2>ゲーム設定</h2>${select('モード','game-mode',[['single','単独モード'],['round','ラウンド制']],mode)}${mode === 'single' ? `${select('形式','game-type',Object.entries(TYPES),type)}${type === 'panel' ? field(`選択周回数（最大${Math.floor(15 / Math.max(2, ids.length))}）`,'game-cycles',config.cycles || 1,`type="number" min="1" max="${Math.floor(15 / Math.max(2, ids.length))}" required`) : field('問題数','game-count',config.count || 6,`type="number" min="1" ${state.availableMax?.type===type?`max="${state.availableMax.count}"`:''} required`)}` : '<p class="hint">○×6問 → 4択6問 → 早押し8問 → パネル各2回</p>'}${mode === 'round' || type === 'panel' ? `<h3>パネルの5ジャンル</h3>${[0,1,2,3,4].map(i=>genreSelect(`game-genre-${i}`,config.genres?.[i])).join('')}` : ''}${select('○×・4択の制限時間','game-timer',[['off','制限なし'],['on','制限あり']],config.timer ? 'on':'off')}${field('制限秒数','game-seconds',config.seconds || 30,'type="number" min="1" max="3600"')}${select('早押しの回答方式','game-buzz',[['oral','口頭'],['text','文字入力']],config.buzzInput || 'oral')}${state.poolInfo ? `<div class="alert error">${esc(state.poolInfo)}</div>` : ''}<button type="submit" class="primary" ${ids.length < 2 || ids.length > 7 || state.availableMax?.count===0 ? 'disabled' : ''}>この設定で開始 →</button>${btn('出題履歴をリセット','reset-history','class="text-button danger"')}</form>` : ''}`;
}
function playScreen(host) {
  const p = state.pub, c = p.current, h = state.host?.current;
  const disabled = blocked() ? 'disabled' : '';
  if (p.phase === 'board') return `<div class="heading"><h1>パネルを選択</h1><span>${esc(name(p.nextSelector))}さんの手番</span></div><p>希望のマスを口頭で伝え、司会者が選択します。</p>${host ? select('次の選択者','next-selector',Object.keys(state.members).filter(uid => (p.turns?.[uid] || 0) < (state.host?.rounds[state.host.round].cycles || 0)).map(uid=>[uid,name(uid)]),p.nextSelector) : ''}<div class="board">${(p.board || []).map((cell,i) => `<button data-act="panel" data-cell="${i}" ${!host || cell.selected || blocked() ? 'disabled' : ''}><small>${esc(state.genres.find(g=>g.id===cell.genreId)?.name || cell.genreId)}</small><strong>${cell.selected ? '—' : cell.difficulty}</strong></button>`).join('')}</div>`;
  if (!c) return '<div class="empty">進行状態を同期しています…</div>';
  const revealed = p.phase === 'revealed';
  return `<div class="question-top"><span class="question-mode">${p.mode === 'round' ? `第${p.round + 1}ラウンド / ` : ''}${TYPES[c.type]}</span><span>${p.index + 1} / ${p.roundCount}問</span></div><div class="question-card"><span class="tag">${({prepared:'出題中',accepting:'回答受付中',winner:'回答権確定',closed:'受付終了',revealed:'結果発表'})[p.phase]}</span><h1>${esc(host ? h?.text : c.text) || (c.type === 'buzz' ? '司会者の読み上げを聞いてください' : '問題を準備しています')}</h1>${host && h ? `<div class="host-answer">正解：${esc(formatAnswer(h.answer, h))}</div>` : ''}${p.deadline ? '<div id="countdown" class="countdown"></div>' : ''}</div>${host ? hostControls(p,c,h,disabled) : playerControls(p,c,disabled)}${revealed && !host ? `<div class="card result-card"><h2>${state.result?.token!==c.token?'結果を同期中…':state.result?.correctThis ? '正解！' : '不正解'}</h2>${c.type==='buzz' ? '' : `<p>あなたの回答：${esc(formatAnswer(state.own?.value, c)) || '未回答'}</p>`}<p>公式の正解：<strong>${esc(formatAnswer(c.answer,c))}</strong></p></div>` : ''}`;
}
function formatAnswer(value,c) { if (value === undefined || value === null) return ''; if (c?.type === 'tf') return value === 'true' ? '○' : '×'; if (c?.type === 'choice') return c.choices?.find(x=>x.id === value)?.text || ''; return value; }
function hostControls(p,c,h,disabled) {
  if (!h) return '';
  if (c.type === 'buzz') return `<div class="card stack">${p.phase === 'prepared' ? btn('早押し受付開始','open',`class="primary" ${disabled}`) : ''}${p.phase === 'accepting' ? '<p class="lead">早押しを待っています…</p>' : ''}${p.phase === 'winner' ? `<h2>${esc(name(c.winner))}さんの回答</h2>${p.buzzInput === 'text' ? `<p class="submitted-answer">${esc(state.answers[c.winner]?.value || '入力・送信を待っています')}</p>` : '<p>口頭の回答を判定してください。</p>'}<div class="inline">${btn('正解','buzz-correct',`class="primary" ${disabled}`)}${btn('不正解','buzz-wrong',disabled)}</div>` : ''}${['accepting','winner'].includes(p.phase) ? `${select('回答権の修正','buzz-override',[['','選んでください'],...Object.keys(state.members).filter(uid=>!c.banned?.[uid]).map(uid=>[uid,name(uid)])])}${btn('この人に回答権を変更','override',disabled)}` : ''}${p.phase === 'closed' ? btn('早押し受付を再開','buzz-reopen',`class="primary" ${disabled}`) : ''}${!['revealed'].includes(p.phase) ? btn('この問題を終了','buzz-end',disabled) : btn('次へ →','next',`class="primary" ${disabled}`)}</div>`;
  const count = Object.keys(state.answers).length;
  return `<div class="card stack">${p.phase === 'prepared' ? btn('回答受付を開始','open',`class="primary" ${disabled}`) : ''}${p.phase === 'accepting' ? `<p class="count"><strong>${count}</strong> / ${Object.keys(state.members).length}人回答済み</p>${btn('回答を締め切る','close',`class="primary" ${disabled}`)}` : ''}${p.phase === 'closed' ? c.type === 'panel' ? `<h2>正解者をチェック</h2>${Object.keys(state.members).map(uid=>`<label class="judge"><input type="checkbox" id="correct-${uid}" ${state.answers[uid] ? '' : 'disabled'}><span><strong>${esc(name(uid))}</strong><br>${esc(state.answers[uid]?.value || '未回答')}</span></label>`).join('')}${btn('判定完了・結果発表','reveal',`class="primary" ${disabled}`)}` : btn('正解を発表','reveal',`class="primary" ${disabled}`) : ''}${p.phase === 'revealed' ? btn('次へ →','next',`class="primary" ${disabled}`) : ''}</div>`;
}
function playerControls(p,c,disabled) {
  if (c.type === 'buzz') {
    if (p.phase === 'revealed') return '';
    const liveWinner = c.winner || (state.buzz?.epoch===(c.epoch||0)?state.buzz?.uid:'');
    const winner = c.winner === state.user.uid;
    return `<div class="card stack">${liveWinner ? `<h2>${esc(name(liveWinner))}さんが回答中</h2>` : ''}${winner && p.buzzInput === 'text' ? `<form data-form="answer">${field('回答','answer-text','','maxlength="4000" required')}<button type="submit" class="primary" ${state.own || blocked() ? 'disabled' : ''}>${state.own ? '送信済み' : '送信'}</button></form>` : `<button class="buzzer" data-act="buzz" ${p.phase !== 'accepting' || liveWinner || c.banned?.[state.user.uid] || blocked() ? 'disabled' : ''}>${c.banned?.[state.user.uid] ? 'この問題は再押下できません' : '早押し！'}</button>`}</div>`;
  }
  if (p.phase !== 'accepting') return p.phase === 'revealed' ? '' : `<div class="card empty">${p.phase === 'prepared' ? '受付開始をお待ちください。' : '回答を締め切りました。発表をお待ちください。'}</div>`;
  return `<div class="card stack"><form data-form="answer">${c.type === 'panel' ? `<label>あなたの回答<textarea id="answer-text" rows="3" maxlength="4000" required ${state.own ? 'disabled' : ''}></textarea></label>` : `<div class="choices ${c.type === 'tf' ? 'binary' : ''}">${(c.type === 'tf' ? [{id:'true',text:'○'},{id:'false',text:'×'}] : c.choices).map(choice=>`<button type="button" data-act="choose" data-id="${choice.id}" class="${state.selected === choice.id ? 'selected' : ''}" ${state.own || blocked() ? 'disabled' : ''}>${esc(choice.text)}</button>`).join('')}</div>`}<button type="submit" class="primary wide" ${state.own || blocked() || (c.type !== 'panel' && !state.selected) ? 'disabled' : ''}>${state.own ? '回答確定済み' : '回答確定'}</button></form>${c.type !== 'panel' ? `<div class="answer-status">${Object.keys(state.members).map(uid=>`<span>${esc(name(uid))} <b>${state.status[uid] ? '回答済み' : '未回答'}</b></span>`).join('')}</div>` : ''}</div>`;
}
function resultScreen(host) { return `<h1>結果</h1>${host ? Object.keys(state.members).map(uid => statsCard(uid, ownResults(state.host, uid))).join('') : statsCard(state.user.uid,state.result)}${host ? btn('待機画面に戻って再戦','lobby','class="primary wide"') : '<div class="card">司会者が待機画面に戻すと、同じ部屋で再戦できます。</div>'}`; }
function statsCard(uid, result) { const r=result || { correct:0,incorrect:0,breakdown:{} }; return `<div class="card"><h2>${esc(name(uid))}</h2><div class="stat-pair"><span>正解 <strong>${r.correct}</strong></span><span>不正解 <strong>${r.incorrect}</strong></span></div>${Object.entries(r.breakdown || {}).map(([type,v])=>`<div class="stat-row"><span>${TYPES[type]}</span><span>正解 ${v.correct} / 不正解 ${v.incorrect}</span></div>`).join('')}</div>`; }
async function perform(fn) { if(state.busy) return; state.busy=true;state.error='';render();try{await fn();}catch(e){console.error(e);state.error=friendly(e);}finally{state.busy=false;render();} }
function friendly(e) { if(e.code === 'auth/invalid-credential') return '個人コードを確認してください。'; if(/permission|PERMISSION/i.test(e.code || e.message)) return '操作が許可されませんでした。受付状態・参加資格・Firebaseルールを確認してください。'; return e.message || String(e); }
function clearDrafts(prefix) { for(const key of drafts.keys()) if(key.startsWith(prefix)) drafts.delete(key); }

async function doCommand(type, extra={}) { return api.command(state.code,{type,expectedRevision:state.host?.revision,...extra},now()); }
function clearRoom() { roomUnsubs.forEach(fn=>fn()); currentUnsubs.forEach(fn=>fn()); presenceStop?.(); presenceStop=null;roomUnsubs=[];currentUnsubs=[];currentKey='';Object.assign(state,{code:'',meta:null,pub:null,host:null,members:{},answers:{},own:null,result:null,presence:null,order:[]});clearDrafts('answer'); }
async function enterRoom(code) {
  clearRoom(); state.genres=await api.genres(); state.code=code; state.meta=await api.readRoom(code,'meta');
  if(!state.meta){clearRoom();await api.rememberRoom(state.user.uid,null);throw new Error('部屋は閉鎖されています。');}
  const error=e=>{state.error=friendly(e);render();};
  roomUnsubs.push(api.watch(code,'meta',value=>{if(!value){clearRoom();state.notice='ルームが閉鎖されました。';api.rememberRoom(state.user.uid,null).catch(()=>{});}else state.meta=value;render();},error));
  roomUnsubs.push(api.watch(code,'members',v=>{state.members=v || {};render();},async e=>{if(!isHost() && /permission/i.test(e.code || e.message)){const meta=await api.readRoom(code,'meta').catch(()=>undefined);if(state.code!==code)return;const uid=state.user.uid;clearRoom();await api.rememberRoom(uid,null).catch(()=>{});state.notice=meta?'司会者が参加席を削除しました。':'ルームが閉鎖されました。';render();}else error(e);}));
  roomUnsubs.push(api.watch(code,'public',v=>{state.pub=v;refreshCurrent();render();autoAdvance();},error));
  roomUnsubs.push(api.watch(code,'presence',v=>{state.presence=v;render();autoAdvance();},error));
  if(isHost()) {
    roomUnsubs.push(api.watch(code,'host',v=>{state.host=v;render();autoAdvance();},error));
    presenceStop=await api.hostPresence(code,()=>render(),error);
  } else roomUnsubs.push(api.watch(code,`results/${state.user.uid}`,v=>{state.result=v;render();},error));
  render();
}
function refreshCurrent() {
  const p=state.pub,c=p?.current;
  const key=c ? api.answerToken(p) : '';
  if(key===currentKey)return;
  currentUnsubs.forEach(fn=>fn());currentUnsubs=[];currentKey=key;
  state.answers={};state.status={};state.buzz=null;state.own=null;state.selected='';clearDrafts('answer');clearDrafts('correct-');
  if(!c)return;
  const err=e=>{state.error=friendly(e);render();};
  if(isHost()) {
    currentUnsubs.push(api.watch(state.code,`answers/${key}`,v=>{state.answers=v || {};render();autoAdvance();},err));
    if(c.type==='buzz')currentUnsubs.push(api.watch(state.code,`buzz/${c.token}`,v=>{
      state.buzz=v;const key=v?.uid?`${c.token}:${v.epoch}:${v.uid}`:'';
      if(key && key!==soundWinner){soundWinner=key;beep();}
      autoAdvance();
    },err));
  }else{
    currentUnsubs.push(api.watch(state.code,`answers/${key}/${state.user.uid}`,v=>{state.own=v;if(v?.value)state.selected=v.value;render();},err));
    if(c.type==='buzz')currentUnsubs.push(api.watch(state.code,`buzz/${c.token}`,v=>{state.buzz=v;render();},err));
    if(['tf','choice'].includes(c.type))currentUnsubs.push(api.watch(state.code,`status/${key}`,v=>{state.status=v || {};render();},err));
  }
}
async function runAuto(fn){if(autoBusy || blocked())return;autoBusy=true;try{await fn();}catch(e){state.error=friendly(e);render();}finally{autoBusy=false;}}
function autoAdvance(){
 const p=state.pub,h=state.host;
 if(!isHost() || !h || !p || blocked() || p.phase!=='accepting' || h.phase!==p.phase || h.revision!==p.revision)return;
 if(p.current?.type==='buzz'){if(state.buzz?.uid && state.buzz.epoch===(p.current.epoch||0))runAuto(()=>doCommand('buzzWinner',{uid:state.buzz.uid}));return;}
 const all=h.players.every(uid=>!!state.answers[uid]);
 if(all || (p.deadline && now()>=p.deadline))runAuto(()=>doCommand('close'));
}
function updateCountdown(){const el=$('countdown');if(el)el.textContent=`残り ${Math.max(0,Math.ceil((state.pub.deadline-now())/1000))} 秒`;}
function beep(){try{const C=window.AudioContext || window.webkitAudioContext;const ctx=new C();const osc=ctx.createOscillator(),gain=ctx.createGain();osc.connect(gain);gain.connect(ctx.destination);osc.frequency.value=880;gain.gain.value=.08;osc.start();osc.stop(ctx.currentTime+.14);osc.onended=()=>ctx.close();}catch{}}
setInterval(()=>{updateCountdown();autoAdvance();},500);
function applyGenreFilter(input){
 const target=$(input.dataset.genreSearch);if(!target)return;
 const current=target.value;
 target.innerHTML='<option value="">選択してください</option>'+state.genres.filter(g=>g.name.includes(input.value)||g.id===current).map(g=>`<option value="${esc(g.id)}" ${g.id===current?'selected':''}>${esc(g.name)}</option>`).join('');
}
document.addEventListener('input',e=>{const t=e.target;if(t.id)drafts.set(t.id,t.type==='checkbox'?t.checked:t.value);if(t.dataset.genreSearch)applyGenreFilter(t);if(t.id==='genre-search')render();});
document.addEventListener('change',e=>{const t=e.target;if(t.id)drafts.set(t.id,t.type==='checkbox'?t.checked:t.value);if(t.dataset.score){const value=Number(t.value);drafts.delete(t.id);perform(()=>doCommand('score',{uid:t.dataset.score,value}));}else if(t.id==='next-selector')perform(()=>doCommand('selector',{uid:t.value}));else if(['q-type','game-mode','game-type','question-type','question-genre','question-difficulty'].includes(t.id)){if(t.id==='q-type'){drafts.delete('q-answer');clearDrafts('q-option-');drafts.delete('q-difficulty');}if(t.id==='game-type'||t.id==='game-mode'){state.availableMax=null;state.poolInfo='';}render();}});
document.addEventListener('submit',e=>{e.preventDefault();const form=e.target.dataset.form;if(!form)return;const values=Object.fromEntries([...e.target.querySelectorAll('input,select,textarea')].map(x=>[x.id,x.value]));const continued=e.submitter?.name==='continue';perform(async()=>{
 switch(form){
  case 'login': await api.login(values['login-code']);drafts.delete('login-code');break;
  case 'join':await api.joinRoom(state.user.uid,state.user.name,values['join-code']);await enterRoom(values['join-code']);break;
  case 'name':await api.saveName(state.user.uid,values['profile-name']);state.user.name=values['profile-name'].trim();state.notice='表示名を保存しました。';break;
  case 'genre':await api.createGenre(state.user.uid,values['genre-name']);drafts.delete('genre-name');state.genres=await api.genres();break;
  case 'question-filter':state.page=await api.questionPage(state.user.uid,null,questionFilters());break;
  case 'question':{
   const type=values['q-type'] || state.editing.type;
   const q={...(state.editing?.id?{id:state.editing.id}:{}),type,text:values['q-text'].trim(),genreId:values['q-genre'] || '',difficulty:type==='panel'?Number(values['q-difficulty']):0};
   if(type==='choice')q.options=[0,1,2,3].map(i=>values[`q-option-${i}`].trim());else q.answer=values['q-answer'];
   await api.saveQuestion(state.user.uid,q);clearDrafts('q-');
   if(continued){state.editing={type,genreId:q.genreId,text:'',answer:type==='tf'?'true':'',difficulty:10,options:['','','','']};}
   else{state.page=await api.questionPage(state.user.uid);state.screen='questions';}state.notice='問題を保存しました。';break;
  }
  case 'start':{
   const config=configFromValues(values);if(config.timer && (!Number.isInteger(config.seconds)||config.seconds<1||config.seconds>3600))throw new Error('制限時間は1〜3600秒です。');
   const ids=Object.keys(state.members);const preferred=state.order.length?state.order:(state.host?.players || []);const players=[...preferred.filter(uid=>ids.includes(uid)),...ids.filter(uid=>!preferred.includes(uid))];
   const pool=await api.drawPool(state.user.uid,config,players.length,state.host?.used || {});
   const missing=checkPool(config,players,pool,state.host?.used || {});
   if(missing.length){state.poolInfo=missing.map(message=>state.genres.reduce((text,g)=>text.replaceAll(g.id,g.name),message)).join('\n');if(config.mode==='single' && config.type!=='panel'){const count=pool.filter(q=>q.type===config.type).length;state.availableMax={type:config.type,count};drafts.set('game-count',String(count));}return;}
   state.availableMax=null;
   await api.begin(state.code,config,players,pool);state.poolInfo='';break;
  }
  case 'answer':{const p=state.pub;if(blocked())throw new Error('接続・再開をお待ちください。');const value=['tf','choice'].includes(p.current.type)?state.selected:values['answer-text'];if(!value?.trim())throw new Error('回答を入力または選択してください。');await api.submit(state.code,p,state.user.uid,value);break;}
 }
 });});
function questionFilters(){return {search:drafts.get('question-search'),type:drafts.get('question-type'),genreId:drafts.get('question-genre'),difficulty:drafts.get('question-difficulty')};}
function configFromValues(v){return{mode:v['game-mode'],type:v['game-type']||'tf',count:Number(v['game-count']||6),cycles:Number(v['game-cycles']||1),genres:[0,1,2,3,4].map(i=>v[`game-genre-${i}`]).filter(Boolean),timer:v['game-timer']==='on',seconds:Number(v['game-seconds']),buzzInput:v['game-buzz']};}
document.addEventListener('click',e=>{const target=e.target.closest('[data-act]');if(!target)return;e.preventDefault();if(target.disabled)return;const a=target.dataset.act,id=target.dataset.id;
 if(a==='choose'){state.selected=id;render();return;}
 perform(async()=>{
  state.notice='';
  switch(a){
   case 'home':if(state.code)return;state.screen='home';break;
   case 'logout':await api.logout();break;
   case 'create':await enterRoom(await api.createRoom(state.user.uid));break;
   case 'questions':state.page=await api.questionPage(state.user.uid,null,questionFilters());state.screen='questions';break;
   case 'next-page':state.page=await api.questionPage(state.user.uid,state.page.cursor,questionFilters());break;
   case 'new-question':state.genres=await api.genres();clearDrafts('q-');state.editing=null;state.screen='editor';break;
   case 'edit-question':clearDrafts('q-');state.editing=state.page.items.find(q=>q.id===id);state.screen='editor';break;
   case 'delete-question':if(confirm('この問題を削除しますか？')){await api.saveQuestion(state.user.uid,state.editing,true);state.page=await api.questionPage(state.user.uid);state.screen='questions';}break;
   case 'genres':state.genres=await api.genres();state.screen='genres';break;
   case 'rename-genre':{const g=state.genres.find(x=>x.id===id);const value=prompt('新しいジャンル名',g.name);if(value!==null){await api.changeGenre(id,value);state.genres=await api.genres();}break;}
   case 'delete-genre':if(confirm('未参照のジャンルを削除しますか？')){await api.changeGenre(id,null);state.genres=await api.genres();}break;
   case 'invite':{const url=new URL(location.href);url.searchParams.set('room',state.code);await navigator.clipboard.writeText(url.toString());state.notice='招待URLをコピーしました。';break;}
   case 'order-up':{const ids=Object.keys(state.members);state.order=[...state.order.filter(x=>ids.includes(x)),...ids.filter(x=>!state.order.includes(x))];const i=state.order.indexOf(id);if(i>0)[state.order[i],state.order[i-1]]=[state.order[i-1],state.order[i]];break;}
   case 'kick':await api.removePlayer(state.code,id);break;
   case 'leave':await api.leaveRoom(state.user.uid,state.code);clearRoom();break;
   case 'exit-view':await api.rememberRoom(state.user.uid,null);clearRoom();break;
   case 'close-room':if(confirm('ルームを閉鎖しますか？得点・進行・出題履歴をすべて削除します。'))await api.closeRoom(state.code);break;
   case 'reset-history':if(confirm('このルームの出題履歴をリセットしますか？')){await api.resetHistory(state.code);state.notice='出題履歴をリセットしました。';state.availableMax=null;state.poolInfo='';}break;
   case 'open':case 'close':case 'next':case 'resume':await doCommand(a);break;
   case 'abort':if(confirm('途中終了しますか？完了した問題だけを統計に残します。'))await doCommand('abort');break;
   case 'sync':await api.publish(state.code,state.host);break;
   case 'lobby':await api.backToLobby(state.code);break;
   case 'reveal':await doCommand('reveal',{answers:state.answers,correct:Object.keys(state.members).filter(uid=>$(`correct-${uid}`)?.checked)});break;
   case 'panel':await doCommand('selectPanel',{cell:Number(target.dataset.cell)});break;
   case 'score-delta':{const input=$(`score-${id}`);drafts.delete(input.id);await doCommand('score',{uid:id,value:state.host.scores[id]+Number(target.dataset.delta)});break;}
   case 'buzz':if(!await api.buzz(state.code,state.pub,state.user.uid))state.notice='別のプレイヤーが回答権を獲得しました。';break;
   case 'buzz-correct':await doCommand('buzzJudge',{correct:true});break;
   case 'buzz-wrong':await doCommand('buzzJudge',{correct:false});break;
   case 'buzz-reopen':await api.resetBuzz(state.code,state.pub.current.token);await doCommand('buzzReopen');soundWinner='';break;
   case 'buzz-end':await doCommand('buzzEnd');break;
   case 'override':{const uid=$('buzz-override').value;if(!uid)throw new Error('回答者を選んでください。');const next=await doCommand('buzzWinner',{uid});await api.overrideBuzz(state.code,{current:next.current},uid);break;}
  }
 });});
api.session(async user=>{
 try{
  if(!user){clearRoom();globalUnsubs.forEach(f=>f());globalUnsubs=[];state.user=null;state.screen='home';state.page=null;state.editing=null;state.error='';state.notice='';drafts.clear();render();return;}
  state.user=await api.profile(user.uid);state.genres=await api.genres();
  globalUnsubs.push(api.watchConnection(v=>{state.connected=v;render();}),api.watchClock(v=>state.offset=v));
  const invitation=new URL(location.href).searchParams.get('room'),active=await api.activeRoom(user.uid);
  if(active){if(invitation && invitation!==active)state.notice='参加中のルームを復元しました。別の部屋へ参加する場合は、先に退出または閉鎖してください。';await enterRoom(active);}
  else if(invitation){await api.joinRoom(user.uid,state.user.name,invitation);history.replaceState({},'',location.pathname);await enterRoom(invitation);}
 }catch(e){state.error=friendly(e);}render();
});
if('serviceWorker' in navigator && import.meta.env.PROD)window.addEventListener('load',()=>navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(console.error));
render();
