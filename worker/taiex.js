/* =====================================================================
   Cloudflare Worker：轉發證交所即時大盤指數（加權指數 t00）
   證交所即時報價不開放跨網域讀取，網頁無法直接抓，所以用這支 Worker 轉一手。
   部署方式見 README「即時大盤指數」。
   ===================================================================== */
const ALLOW = [
  /^https:\/\/maojiyw\.github\.io$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];
const SRC = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_t00.tw&json=1&delay=0';

export default {
  async fetch(req) {
    const origin = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOW.some(r => r.test(origin)) ? origin : 'https://maojiyw.github.io',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    const json = (body, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=5' },
    });

    try {
      const r = await fetch(`${SRC}&_=${Date.now()}`, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://mis.twse.com.tw/stock/index.jsp' },
      });
      const j = await r.json();
      const m = j && j.msgArray && j.msgArray[0];
      if (!m) return json({ error: 'no data' }, 502);
      const num = v => { const n = parseFloat(v); return isFinite(n) ? n : null; };
      return json({
        name: m.n, date: m.d, time: m.t || m['%'],
        price: num(m.z), prev: num(m.y), open: num(m.o), high: num(m.h), low: num(m.l),
      });
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 502);
    }
  },
};
