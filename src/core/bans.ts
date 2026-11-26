export function parseBanSpan(t: string): number | null | undefined {
  const v = t.trim().toLowerCase();
  if (/^(perm|permanent|forever|p|never)$/.test(v)) return null;
  const m = /^(\d+(?:\.\d+)?)(s|sec|m|min|h|hr|d|day|days|w|wk|mo|month|months|y|yr)$/.exec(v);
  if (!m) return undefined;
  const unit: Record<string, number> = { s: 1e3, sec: 1e3, m: 6e4, min: 6e4, h: 36e5, hr: 36e5, d: 864e5, day: 864e5, days: 864e5, w: 6048e5, wk: 6048e5, mo: 2592e6, month: 2592e6, months: 2592e6, y: 31536e6, yr: 31536e6 };
  const ms = Number(m[1]) * unit[m[2]];
  return ms > 0 ? Math.min(ms, 10 * 31536e6) : undefined;
}
