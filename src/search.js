export function matchesQuestionText(question, search) {
  return String(question.text || '').toLowerCase().includes(String(search || '').toLowerCase());
}
export function questionResultCounts(items) {
  const panelCounts={10:0,20:0,30:0},tfCounts={true:0,false:0};
  for(const q of items){
    if(q.type==='panel' && Object.hasOwn(panelCounts,q.difficulty))panelCounts[q.difficulty]++;
    if(q.type==='tf' && Object.hasOwn(tfCounts,q.answer))tfCounts[q.answer]++;
  }
  return {panelCounts,tfCounts};
}
export function questionSearchKey(uid,filters) {
  return JSON.stringify([uid,filters.search || '',filters.type || '',filters.genreId || '',String(filters.difficulty || ''),filters.answer || '']);
}
export function containsResultPage(uid,filters,matches,offset=0) {
  const end=offset+25;
  return {items:matches.slice(offset,end),more:end<matches.length,
    cursor:{kind:'contains',key:questionSearchKey(uid,filters),matches,offset:end},
    filters:{...filters},...questionResultCounts(matches)};
}
