const base = process.argv[2] ?? 'http://127.0.0.1:8787';
const wsBase = base.replace(/^http/, 'ws');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); if (!cond) fails++; };
const tag = Date.now().toString(36);
const room = await (await fetch(base + '/api/rooms', { method: 'POST', body: JSON.stringify({ name: 'V44', seed: 44, mode: 'creative', difficulty: 'normal', ownerId: `own-v44-${tag}`, ownerSecret: 'owner-secret-v44-0000', ownerName: 'Alpha' }) })).json();
const join = (id, secret, name, v = 37) => new Promise((res) => {
  const ws = new WebSocket(`${wsBase}/ws/${room.code}`);
  const c = { ws, msgs: [], closed: null, send: (m) => ws.send(JSON.stringify(m)) };
  ws.onmessage = (e) => { const m = JSON.parse(e.data); c.msgs.push(m); if (m.t === 'welcome' || m.t === 'err') { c.you = m.you; c.welcome = m; res(c); } };
  ws.onclose = (e) => { c.closed = e.code; res(c); };
  ws.onopen = () => c.send({ t: 'hello', v, id, secret, name, appearance: { skin: 1, hair: 1, shirt: 1, pants: 1 } });
});
const chats = (c) => c.msgs.filter((m) => m.t === 'chat').map((m) => m.text);
const old = await join(`old-v44-${tag}`, `old-secret-v44-${tag}`, 'Old', 36);
ok('protocol 36 clients are turned away', old.welcome?.t !== 'welcome', JSON.stringify(old.welcome ?? old.closed));
const a = await join(`own-v44-${tag}`, 'owner-secret-v44-0000', 'Alpha');
ok('owner joins on protocol 37', a.welcome?.t === 'welcome');
await sleep(1000);
for (const k of ['oak_fence 3', 'cherry_fence_gate 1', 'cobblestone_wall 6', 'glass_pane 16', 'deepslate_tiles 4']) { a.send({ t: 'chat', text: `/give @s ${k}` }); await sleep(700); }
await sleep(1200);
const inv = JSON.stringify(a.msgs.filter((m) => m.t === 'inv').at(-1) ?? {});
ok('fences, gates, walls, panes, new blocks, slabs and stairs exist on the server', [1070, 1086, 1090, 1115, 1135].every((id) => inv.includes(`"id":${id}`)), chats(a).slice(-3).join(' | '));
a.ws.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
