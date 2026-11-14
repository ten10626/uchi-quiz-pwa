export const TYPES = { tf: '○×', choice: '4択', buzz: '早押し', panel: 'パネル' };
export const copy = value => JSON.parse(JSON.stringify(value));
const ensure = (ok, message) => { if (!ok) throw new Error(message); };
export function shuffle(values, random = Math.random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function validateQuestion(q) {
  ensure(Object.hasOwn(TYPES, q.type), '形式が不正です。');
  ensure(typeof q.text === 'string' && q.text.trim().length > 0 && q.text.length <= 4000, '問題文は1〜4000文字です。');
  if (q.type === 'tf') ensure(['true', 'false'].includes(q.answer), '○×の正解を選んでください。');
  else if (q.type === 'choice') ensure(q.options?.length === 4 && q.options.every(x => typeof x === 'string' && x.trim() && x.length <= 1000), '選択肢を4つ入力してください。');
  else ensure(typeof q.answer === 'string' && q.answer.trim() && q.answer.length <= 4000, '正解を入力してください。');
  if (['choice', 'panel'].includes(q.type)) ensure(q.genreId, 'ジャンルを選んでください。');
  if (q.type === 'panel') ensure([10, 20, 30].includes(q.difficulty), '難度を選んでください。');
  return q;
}
export function schedule(config, players) {
  ensure(players.length >= 2 && players.length <= 7 && new Set(players).size === players.length, '回答者は2〜7人です。');
  if (config.mode === 'round') return [{ type: 'tf', count: 6 }, { type: 'choice', count: 6 }, { type: 'buzz', count: 8 }, { type: 'panel', count: players.length * 2, cycles: 2 }];
  ensure(Object.hasOwn(TYPES, config.type), '形式を選んでください。');
  if (config.type === 'panel') {
    ensure(Number.isInteger(config.cycles) && config.cycles >= 1 && config.cycles <= Math.floor(15 / players.length), '選択周回数が範囲外です。');
    return [{ type: 'panel', count: players.length * config.cycles, cycles: config.cycles }];
  }
  ensure(Number.isInteger(config.count) && config.count >= 1, '問題数は1問以上です。');
  return [{ type: config.type, count: config.count }];
}
export function checkPool(config, players, pool, used = {}) {
  const missing = [], plan = schedule(config, players);
  const available = pool.filter(q => !used[q.id]);
  for (const round of plan) {
    if (round.type !== 'panel') {
      const count = available.filter(q => q.type === round.type).length;
      if (count < round.count) missing.push(`${TYPES[round.type]}：${round.count}問必要（未使用${count}問）`);
    } else {
      ensure(config.genres?.length === 5 && new Set(config.genres).size === 5, '異なる5ジャンルを選んでください。');
      for (const genre of config.genres) for (const difficulty of [10, 20, 30]) {
        if (!available.some(q => q.type === 'panel' && q.genreId === genre && q.difficulty === difficulty)) missing.push(`パネル：${genre} / ${difficulty} が不足`);
      }
    }
  }
  return missing;
}
export function startGame(previous, config, players, pool, gameId, random = Math.random) {
  const used = previous?.used || {};
  const missing = checkPool(config, players, pool, used);
  ensure(!missing.length, missing.join('\n'));
  const available = pool.filter(q => !used[q.id]);
  const plan = schedule(config, players);
  const rounds = plan.map(round => round.type === 'panel'
    ? { ...round, board: config.genres.flatMap(genreId => [10, 20, 30].map(difficulty => ({ genreId, difficulty, question: copy(shuffle(available.filter(q => q.type === 'panel' && q.genreId === genreId && q.difficulty === difficulty), random)[0]), selected: false }))) }
    : { ...round, questions: shuffle(available.filter(q => q.type === round.type), random).slice(0, round.count).map(copy) });
  const state = { gameId, config: copy(config), players: [...players], rounds, round: 0, index: 0, completed: {}, used: copy(used), scores: Object.fromEntries(players.map(uid => [uid, 0])), stats: Object.fromEntries(players.map(uid => [uid, {}])), turns: Object.fromEntries(players.map(uid => [uid, 0])), nextSelector: players[0], revision: (previous?.revision || 0) + 1, phase: 'prepared', paused: false, deadline: 0, remaining: 0, current: null };
  return prepare(state, random);
}
function prepare(state, random = Math.random) {
  const round = state.rounds[state.round];
  if (!round) { state.phase = 'finished'; state.current = null; return state; }
  state.deadline = 0; state.remaining = 0;
  if (round.type === 'panel') { state.phase = 'board'; state.current = null; return state; }
  state.current = snapshot(round.questions[state.index], `${state.gameId}-${state.round}-${state.index}`, random);
  state.used[state.current.id] = true;
  state.phase = 'prepared';
  return state;
}
function snapshot(q, token, random) {
  const current = { ...copy(q), token, banned: {}, verdict: {}, epoch: 0 };
  if (q.type === 'choice') {
    current.choices = shuffle(q.options.map((text, i) => ({ id: String(i), text })), random);
    current.answer = '0';
  }
  return current;
}
export function reduceGame(original, action, now = Date.now()) {
  const s = copy(original), c = s.current;
  s.used ||= {}; s.completed ||= {}; s.stats ||= {};
  for (const uid of s.players || []) s.stats[uid] ||= {};
  if (c) { c.banned ||= {}; c.verdict ||= {}; }
  ensure(s && s.phase, 'ゲームがありません。');
  if (action.expectedRevision !== undefined) ensure(action.expectedRevision === s.revision, '状態が更新されました。画面を確認してください。');
  if (s.paused && !['resume', 'score', 'abort'].includes(action.type)) throw new Error('司会者の再開操作を待っています。');
  switch (action.type) {
    case 'open':
      ensure(s.phase === 'prepared', '受付開始できません。'); s.phase = 'accepting';
      if (['tf', 'choice'].includes(c.type) && s.config.timer) { s.remaining = s.config.seconds * 1000; s.deadline = now + s.remaining; }
      break;
    case 'close': ensure(['accepting', 'winner'].includes(s.phase), '締切済みです。'); s.phase = 'closed'; s.deadline = 0; break;
    case 'reveal': {
      ensure(s.phase === 'closed' && c.type !== 'buzz', '発表できません。');
      const verdict = Object.fromEntries(s.players.map(uid => [uid, c.type === 'panel' ? !!action.correct?.includes(uid) && !!action.answers?.[uid] : action.answers?.[uid]?.value === c.answer]));
      finishQuestion(s, verdict); break;
    }
    case 'buzzWinner':
      ensure(c.type === 'buzz' && ['accepting', 'winner'].includes(s.phase) && s.players.includes(action.uid) && !c.banned[action.uid], '回答権を変更できません。');
      if (s.phase === 'winner' && c.winner !== action.uid) c.epoch++;
      c.winner = action.uid; s.phase = 'winner'; break;
    case 'buzzJudge':
      ensure(c.type === 'buzz' && s.phase === 'winner' && c.winner, '回答権がありません。');
      if (action.correct) finishQuestion(s, Object.fromEntries(s.players.map(uid => [uid, uid === c.winner])));
      else { c.banned[c.winner] = true; c.winner = null; s.phase = 'closed'; }
      break;
    case 'buzzReopen':
      ensure(c.type === 'buzz' && s.phase === 'closed', '再開できません。'); c.epoch++; c.winner = null; s.phase = 'accepting'; break;
    case 'buzzEnd':
      ensure(c.type === 'buzz' && ['prepared', 'accepting', 'winner', 'closed'].includes(s.phase), '終了済みです。');
      finishQuestion(s, Object.fromEntries(s.players.map(uid => [uid, false]))); break;
    case 'selectPanel': {
      ensure(s.phase === 'board', 'パネル選択中ではありません。');
      const round = s.rounds[s.round], cell = round.board[action.cell];
      ensure(cell && !cell.selected, '選択済みです。');
      const uid = s.nextSelector;
      ensure(s.players.includes(uid) && s.turns[uid] < round.cycles, '選択回数を超えています。');
      cell.selected = true; s.turns[uid]++;
      const next = s.players.find(x => s.turns[x] < round.cycles && s.turns[x] === Math.min(...s.players.map(x => s.turns[x])));
      s.nextSelector = next || s.players.find(x => s.turns[x] < round.cycles) || '';
      s.current = snapshot(cell.question, `${s.gameId}-${s.round}-${s.index}`, Math.random);
      s.used[s.current.id] = true; s.phase = 'accepting'; break;
    }
    case 'selector':
      ensure(s.phase === 'board' && s.players.includes(action.uid) && s.turns[action.uid] < s.rounds[s.round].cycles, '選択回数を超えています。'); s.nextSelector = action.uid; break;
    case 'next':
      ensure(s.phase === 'revealed', '先に判定を完了してください。'); s.index++;
      if (s.index >= s.rounds[s.round].count) { s.round++; s.index = 0; }
      prepare(s); break;
    case 'score': ensure(s.players.includes(action.uid) && Number.isSafeInteger(action.value), '整数の得点を入力してください。'); s.scores[action.uid] = action.value; break;
    case 'pause':
      if (s.paused) return s;
      s.paused = true; s.remaining = s.deadline ? Math.max(0, s.deadline - now) : 0; s.deadline = 0; break;
    case 'resume':
      ensure(s.paused, '停止していません。'); s.paused = false;
      if (s.phase === 'accepting' && s.config.timer && ['tf', 'choice'].includes(c?.type)) {
        if (s.remaining <= 0) s.phase = 'closed'; else s.deadline = now + s.remaining;
      }
      break;
    case 'abort': s.phase = 'finished'; s.current = null; s.deadline = 0; break;
    default: throw new Error('未知の操作です。');
  }
  s.revision++;
  return s;
}
function finishQuestion(s, verdict) {
  const c = s.current;
  ensure(!s.completed[c.token], '判定済みです。');
  s.completed[c.token] = true; c.verdict = verdict;
  for (const uid of s.players) {
    const stat = s.stats[uid][c.type] ||= { correct: 0, incorrect: 0 };
    stat[verdict[uid] ? 'correct' : 'incorrect']++;
  }
  s.phase = 'revealed'; s.deadline = 0;
}
export function publicView(s) {
  const c = s.current, revealed = s.phase === 'revealed';
  return {
    revision: s.revision, gameId: s.gameId, phase: s.phase, paused: s.paused, round: s.round, index: s.index,
    mode: s.config.mode, type: s.rounds[s.round]?.type || '', roundCount: s.rounds[s.round]?.count || 0,
    deadline: s.deadline || 0, nextSelector: s.nextSelector || '', turns: s.turns,
    buzzInput: s.config.buzzInput || 'oral',
    board: s.rounds[s.round]?.type === 'panel' ? s.rounds[s.round].board.map(({ genreId, difficulty, selected }) => ({ genreId, difficulty, selected })) : [],
    current: c ? { token: c.token, type: c.type, text: c.type === 'buzz' && !revealed ? '' : c.text, choices: c.choices || [], banned: c.banned || {}, winner: c.winner || '', epoch: c.epoch || 0, ...(revealed ? { answer: c.answer } : {}) } : null
  };
}
export function ownResults(s, uid) {
  const breakdown = copy(s.stats?.[uid] || {});
  const total = Object.values(breakdown).reduce((a, v) => ({ correct: a.correct + v.correct, incorrect: a.incorrect + v.incorrect }), { correct: 0, incorrect: 0 });
  return { ...total, breakdown, token: s.current?.token || '', correctThis: s.phase === 'revealed' ? !!s.current?.verdict[uid] : null };
}
export function ranking(scores) {
  return Object.entries(scores).sort((a, b) => b[1] - a[1]).map(([uid, score], i, all) => ({ uid, score, rank: all.findIndex(x => x[1] === score) + 1 }));
}
