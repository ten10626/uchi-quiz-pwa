import morphdom from 'morphdom';

// Preserve active native controls: replacing or refocusing them breaks IME and
// can reopen iOS select pickers. Game state may still disable a submitted field.
export function patchView(root, html) {
  morphdom(root, `<div id="${root.id}">${html}</div>`, {
    onBeforeElUpdated(from, to) {
      if (from === root.ownerDocument.activeElement && ['INPUT','TEXTAREA','SELECT'].includes(from.tagName)) {
        from.disabled = to.disabled;
        if ('readOnly' in from) from.readOnly = to.readOnly;
        return false;
      }
      if (from.tagName === 'SELECT' && from.hasAttribute('data-genre-select')) return false;
      return !from.isEqualNode(to);
    }
  });
}

export function restoreDrafts(root, drafts) {
  for (const [id, value] of drafts) {
    const input = root.ownerDocument.getElementById(id);
    if (!input || !root.contains(input) || input === root.ownerDocument.activeElement) continue;
    if (input.type === 'checkbox') input.checked = value;
    else if (input.value !== String(value)) input.value = value;
  }
}

export function questionSetting(q) {
  if (q.type === 'tf') return `正解：${q.answer === 'true' ? '○' : '×'}`;
  if (q.type === 'panel') return `${q.difficulty}点`;
  return '';
}

export function panelColumnName(name, cell) {
  const suffix = ['①','②','③','④','⑤'][Math.max(0,(cell.occurrence || 1)-1)] || `(${cell.occurrence})`;
  return cell.instances > 1 ? name + suffix : name;
}

export function installTextInputHandlers(doc, onChange) {
  const composing = new WeakSet();
  const start = event => composing.add(event.target);
  const end = event => { composing.delete(event.target); onChange(event.target); };
  const input = event => { if (!event.isComposing && !composing.has(event.target)) onChange(event.target); };
  doc.addEventListener('compositionstart', start);
  doc.addEventListener('compositionend', end);
  doc.addEventListener('input', input);
  return () => {
    doc.removeEventListener('compositionstart', start);
    doc.removeEventListener('compositionend', end);
    doc.removeEventListener('input', input);
  };
}

export function tfBalance(counts={}) {
  const circle=counts.true || 0,cross=counts.false || 0,total=circle+cross;
  const circlePercent=total?Math.round(circle*100/total):0;
  return {circle,cross,total,circlePercent,crossPercent:total?100-circlePercent:0};
}
