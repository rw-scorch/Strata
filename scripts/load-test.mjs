const base = process.argv[2] ?? 'http://127.0.0.1:8787';
const N = Number(process.argv[3] ?? 24);
const SECS = Number(process.argv[4] ?? 45);
const RD = Number(process.argv[5] ?? 8);
const STAGGER = Number(process.argv[6] ?? 120);
const wsBase = base.replace(/^http/, 'ws');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = Date.now().toString(36);
const room = await (await fetch(base + '/api/rooms', { method: 'POST', body: JSON.stringify({ name: 'Load', seed: 4242, mode: 'creative', difficulty: 'normal', ownerId: `load-own-${tag}`, ownerSecret: 'load-owner-secret-0000', ownerName: 'Host' }) })).json();
const rtts = [], joins = [], errs = [];
let closed = 0, chunksIn = 0, msgsIn = 0;
const t0 = Date.now();

function bot(i) {
  return new Promise((resolve) => {
    const id = i === 0 ? `load-own-${tag}` : `load-bot-${tag}-${i}`;
    const secret = i === 0 ? 'load-owner-secret-0000' : `load-secret-${tag}-${i}-pad`;
    const ws = new WebSocket(`${wsBase}/ws/${room.code}`);
    const st = { x: 0, y: 90, z: 0, ready: false, start: Date.now() };
    const send = (m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
    ws.onopen = () => send({ t: 'hello', v: 35, id, secret, name: `Bot${i}`, appearance: { skin: 1, hair: 1, shirt: 1, pants: 1 } });
    ws.onmessage = (e) => {
      msgsIn++;
      const m = JSON.parse(e.data);
      if (m.t === 'welcome') {
        joins.push(Date.now() - st.start);
        const a = (i / N) * Math.PI * 2, r = 1500 + (i % 4) * 900;
        st.x = Math.round(Math.cos(a) * r); st.z = Math.round(Math.sin(a) * r);
        send({ t: 'chat', text: `/tp ${st.x} 100 ${st.z}` });
        setTimeout(() => {
          const pcx = Math.floor(st.x / 16), pcz = Math.floor(st.z / 16), want = [];
          for (let d = 0; d <= RD; d++) for (let dz = -d; dz <= d; dz++) for (let dx = -d; dx <= d; dx++) if (Math.max(Math.abs(dx), Math.abs(dz)) === d) want.push([pcx + dx, pcz + dz]);
          for (let k = 0; k < want.length; k += 64) send({ t: 'chunks', want: want.slice(k, k + 64) });
          st.ready = true;
        }, 600);
      } else if (m.t === 'tp') { st.x = m.x; st.y = m.y; st.z = m.z; }
      else if (m.t === 'chunk') chunksIn++;
      else if (m.t === 'pong') rtts.push([Date.now() - t0, Date.now() - m.c]);
      else if (m.t === 'err') errs.push(m.msg);
      else if (m.t === 'chat' && i === 3 && /Teleport|permission|allowed|cannot/i.test(m.text)) console.error('bot3', m.text);
    };
    ws.onclose = () => { closed++; resolve(); };
    let ph = Math.random() * 6;
    const mv = setInterval(() => { if (!st.ready) return; ph += 0.08; st.x += Math.cos(ph) * 0.35; st.z += Math.sin(ph) * 0.35; send({ t: 'mv', p: [st.x, st.y, st.z, ph, 0, 9] }); }, 80);
    const pg = setInterval(() => send({ t: 'ping', c: Date.now() }), 500);
    setTimeout(() => { clearInterval(mv); clearInterval(pg); ws.close(); }, SECS * 1000);
  });
}

const all = [];
for (let i = 0; i < N; i++) { all.push(bot(i)); await sleep(i === 0 ? 800 : STAGGER); }
await Promise.all(all);
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : NaN; };
const v = rtts.map((r) => r[1]);
console.log(JSON.stringify({ bots: N, joined: joins.length, joinP50: pct(joins, 0.5), joinMax: Math.max(...joins), rttP50: pct(v, 0.5), rttP95: pct(v, 0.95), rttMax: Math.max(...v), pongs: v.length, chunksIn, msgsIn, errs: [...new Set(errs)] }));
const buckets = new Map();
for (const [t, r] of rtts) { const b = Math.floor(t / 5000) * 5; const a = buckets.get(b) ?? []; a.push(r); buckets.set(b, a); }
console.log([...buckets].map(([b, a]) => `${b}s p95=${pct(a, 0.95)}`).join(' | '));
process.exit(0);
