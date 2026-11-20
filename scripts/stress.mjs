const base = process.argv[2] ?? 'http://127.0.0.1:8787';
const scen = process.argv[3] ?? 'tnt';
const wsBase = base.replace(/^http/, 'ws');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = Date.now().toString(36);
const room = await (await fetch(base + '/api/rooms', { method: 'POST', body: JSON.stringify({ name: 'Stress', seed: 777, mode: 'creative', difficulty: 'normal', ownerId: `st-own-${tag}`, ownerSecret: 'st-owner-secret-0000', ownerName: 'Host' }) })).json();
const rtt = [];
const t0 = Date.now();
const open = (id, secret, name) => new Promise((res) => {
  const ws = new WebSocket(`${wsBase}/ws/${room.code}`);
  const c = { ws, msgs: [], send: (m) => ws.readyState === 1 && ws.send(JSON.stringify(m)) };
  ws.onopen = () => c.send({ t: 'hello', v: 35, id, secret, name, appearance: { skin: 1, hair: 1, shirt: 1, pants: 1 } });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'welcome') { c.you = m.you; res(c); } else if (m.t === 'pong') rtt.push([Date.now() - t0, Date.now() - m.c]); else if (m.t === 'chat') c.msgs.push(m.text); };
});
const o = await open(`st-own-${tag}`, 'st-owner-secret-0000', 'Host');
const watchers = [];
for (let i = 0; i < 6; i++) watchers.push(await open(`st-w-${tag}-${i}`, `st-w-secret-${tag}-${i}-pad`, `W${i}`));
const pinger = setInterval(() => { for (const w of [o, ...watchers]) w.send({ t: 'ping', c: Date.now() }); }, 250);
const say = async (t, ms = 0) => { o.send({ t: "chat", text: t }); await sleep(Math.max(ms, 950)); };
const x = Math.floor(o.you.x), z = Math.floor(o.you.z);
await sleep(3000);
const tStart = Date.now() - t0;
if (scen === 'tnt') {
  await say(`/tp ${x} 120 ${z + 40}`);
  for (let k = 0; k < 4; k++) { await say(`/pos1 ${x - 15} ${70 + k * 8} ${z - 15}`); await say(`/pos2 ${x + 15} ${77 + k * 8} ${z + 15}`); await say('/fill tnt', 1500); }
  await say(`/pos1 ${x} 102 ${z}`); await say(`/pos2 ${x} 102 ${z}`); await say('/fill fire', 500);
  await say(`/pos1 ${x} 101 ${z}`); await say(`/pos2 ${x} 101 ${z}`); await say('/fill redstone_block', 500);
} else if (scen === 'mobs') {
  for (let k = 0; k < 25; k++) await say(`/summon zombie 10`);
  for (let k = 0; k < 10; k++) await say(`/summon sheep 10`);
} else if (scen === 'fire') {
  await say(`/tp ${x} 120 ${z}`);
  for (let k = 0; k < 6; k++) { await say(`/pos1 ${x - 30 + k * 10} 65 ${z - 30}`); await say(`/pos2 ${x - 21 + k * 10} 70 ${z + 30}`); await say('/fill oak_planks', 1200); }
  for (let k = 0; k < 6; k++) { await say(`/pos1 ${x - 28 + k * 10} 71 ${z}`); await say(`/pos2 ${x - 28 + k * 10} 71 ${z}`); await say('/fill fire', 200); }
} else if (scen === 'fill') {
  for (let k = 0; k < 8; k++) { await say(`/pos1 ${x - 15} ${60 + k * 4} ${z - 15}`); await say(`/pos2 ${x + 16} ${63 + k * 4} ${z + 16}`); await say(k % 2 ? '/fill air' : '/fill glass', 300); }
}
await sleep(Number(process.argv[4] ?? 25) * 1000);
clearInterval(pinger);
const after = rtt.filter((r) => r[0] >= tStart).map((r) => r[1]).sort((a, b) => a - b);
const pct = (p) => after[Math.min(after.length - 1, Math.floor(after.length * p))];
const buckets = new Map();
for (const [t, r] of rtt) { const b = Math.floor(t / 3000) * 3; buckets.set(b, Math.max(buckets.get(b) ?? 0, r)); }
console.log(scen, JSON.stringify({ p50: pct(0.5), p95: pct(0.95), max: after.at(-1), n: after.length, last: o.msgs.slice(-3) }));
console.log([...buckets].map(([b, m]) => `${b}s:${m}`).join(' '));
process.exit(0);
