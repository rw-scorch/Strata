export function cleanKey(raw: string | undefined | null): string {
  let k = (raw ?? '').replace(/[\r\n\t]+/g, ' ').trim();
  k = k.replace(/^ADMIN_KEY\s*[=:]\s*/i, '').trim();
  k = k.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '').trim();
  return k;
}

export function keyHint(typed: string, secret: string): string {
  if (typed && typed.toLowerCase() === secret.toLowerCase()) return 'Almost: only the capital letters are different. Keys are case-sensitive.';
  if (typed.replace(/\s+/g, '') === secret.replace(/\s+/g, '')) return 'Almost: the spaces are different.';
  return 'That admin key is not correct. Type it exactly as you saved it in Cloudflare.';
}
