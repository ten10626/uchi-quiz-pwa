export function normalizeCode(value) {
  const code = String(value).toLowerCase();
  if (!/^[a-z0-9]{6,4096}$/.test(code)) throw new Error('個人コードは半角英数字6〜4096文字です。');
  return code;
}
export async function credentials(value) {
  const password = normalizeCode(value);
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  const hash = [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
  return { email: `${hash}@quiz.invalid`, password };
}
export const nameKey = name => [...new TextEncoder().encode(name)].map(n => n.toString(16).padStart(2, '0')).join('');
