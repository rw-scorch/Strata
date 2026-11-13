const base = process.argv[2] ?? 'http://127.0.0.1:8787';
const wsBase = base.replace(/^http/, 'ws');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (label, cond, extra = '') => { console.log(cond ? 'PASS' : 'FAIL', label, extra); if (!cond) process.exitCode = 1; };
const tag = Date.now().toString(36);
const ORES = new Set([22, 23, 24, 25, 175]);
async function room(mode) {
  const r = await (await fetch(base + '/api/rooms', { method: 'POST', body: JSON.stringify({ name: 'V13 Smoke', seed: 4242, mode, difficulty: 'normal', ownerId: `owner-v13-${tag}`, ownerSecret: 'owner-secret-v13-0000', ownerName: 'Alpha' }) })).json();
  return r.code;
}
function client(code, id, secret, name) {
  const ws = new WebSocket(`${wsBase}/ws/${code}`);
  const c = { ws, msgs: [], welcome: null, closed: false };
  ws.onmessage = (e) => { const m = JSON.parse(e.data); c.msgs.push(m); if (m.t === 'welcome') c.welcome = m; };
  ws.onclose = () => { c.closed = true; };
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', v: 9, id, secret, name, appearance: { skin: 1, hair: 2, shirt: 3, pants: 4 } }));
  c.send = (m) => ws.send(JSON.stringify(m));
  c.chats = () => c.msgs.filter((m) => m.t === 'chat').map((m) => m.text);
  c.inv = () => c.msgs.filter((m) => m.t === 'inv').at(-1)?.inv;
  return c;
}
const owner = () => [`owner-v13-${tag}`, 'owner-secret-v13-0000', 'Alpha'];

{
  const code = await room('survival');
  const a = client(code, ...owner());
  await sleep(1500);
  ok('joined', !!a.welcome);
  const sp = a.welcome.you;
  const pcx = Math.floor(sp.x / 16), pcz = Math.floor(sp.z / 16);
  const want = [];
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) want.push([pcx + dx, pcz + dz]);
  a.send({ t: 'chunks', want: [...want, [pcx + 12, pcz]] });
  await sleep(2500);
  const chunks = a.msgs.filter((m) => m.t === 'chunk');
  const near = chunks.filter((m) => Math.abs(m.cx - pcx) <= 2 && Math.abs(m.cz - pcz) <= 2);
  const far = chunks.find((m) => m.cx === pcx + 12);
  const listed = near.reduce((n, m) => n + (m.o ? m.o.length / 2 : 0), 0);
  const allOres = near.every((m) => !m.o || m.o.every((v, i) => i % 2 === 0 || ORES.has(v & 255)));
  ok('near chunks list only exposed ores', near.length === 25 && allOres, `${listed} exposed ores in 25 chunks`);
  ok('far chunk has no ore list', far && !far.o && far.d === null);
  const b = client(code, `guest-v13-${tag}`, 'guest-secret-v13-0000', 'Bravo');
  await sleep(1500);
  b.send({ t: 'mv', p: [sp.x + 1, sp.y, sp.z, 0, 0, 1] });
  a.send({ t: 'mv', p: [sp.x, sp.y, sp.z, 0, 0, 1] });
  await sleep(400);
  a.send({ t: 'pvp', pid: `guest-v13-${tag}` });
  await sleep(600);
  const hurt = b.msgs.find((m) => m.t === 'hurt') || b.msgs.filter((m) => m.t === 'vit').some((m) => m.h < 20);
  ok('pvp damages players in survival', !!hurt);
  a.send({ t: 'chat', text: '/tp Bravo' });
  await sleep(400);
  ok('owner can /tp to a player by name', a.chats().some((t) => /Teleported to Bravo/.test(t)));
  b.send({ t: 'chat', text: '/tpa Alpha' });
  await sleep(400);
  ok('tpa request shows accept text', a.chats().some((t) => /Type \/tpaccept or \/tpdeny/.test(t)));
  b.send({ t: 'chat', text: '/seed' });
  await sleep(300);
  ok('guests cannot see the seed', b.chats().some((t) => /Only operators/.test(t)));
  a.send({ t: 'chat', text: '/gamerule dayLength 5' });
  await sleep(300);
  ok('dayLength rule broadcast', b.msgs.some((m) => m.t === 'rules' && m.r.dayLength === 5));
  await sleep(1200);
  const before = a.msgs.length;
  let probes = 0;
  for (let x = -40; x < 40; x += 8) for (let z = -40; z < 40; z += 8) for (const y of [12, 30]) {
    a.send({ t: 'use', x: Math.floor(sp.x) + x + 60, y, z: Math.floor(sp.z) + z, nx: 0, ny: 1, nz: 0 });
    probes++;
  }
  await sleep(2500);
  const replies = a.msgs.slice(before).filter((m) => m.t === 'blk').flatMap((m) => m.u);
  const oreReplies = replies.filter((u) => ORES.has(u[3] & 255)).length;
  ok('far use probes never reveal buried ores', replies.length > probes * 0.3 && oreReplies === 0, `${replies.length} replies, ${oreReplies} ores`);
  a.ws.close(); b.ws.close();
  await sleep(300);
}

{
  const code = await room('creative');
  const a = client(code, ...owner());
  await sleep(1500);
  a.send({ t: 'inv', op: { t: 'creative', id: 4, count: 64, s: { c: 'inv', i: 0 } }, s: 1 });
  await sleep(200);
  a.send({ t: 'inv', op: { t: 'swapHand' }, s: 2 });
  await sleep(200);
  a.send({ t: 'resync' });
  await sleep(300);
  ok('swap hands moves the item to the offhand', a.inv()?.off?.[0]?.id === 4 && !a.inv()?.slots[0]);
  a.send({ t: 'inv', op: { t: 'swapHand' }, s: 3 });
  a.send({ t: 'chat', text: '/gamemode survival' });
  await sleep(300);
  a.send({ t: 'inv', op: { t: 'drop', s: { c: 'inv', i: 0 }, all: true }, s: 4 });
  await sleep(300);
  const a2 = client(code, ...owner());
  await sleep(1800);
  const inv2 = a2.welcome?.you?.inv;
  ok('second tab kicks the first', a.msgs.some((m) => m.t === 'err' && m.code === 'duplicate'));
  ok('second tab does not restore dropped items', inv2 && !inv2.slots.some((s) => s && s.id === 4), JSON.stringify(inv2?.slots.filter(Boolean)));
  a2.ws.close();
}
await sleep(300);
process.exit();
