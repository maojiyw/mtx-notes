/* =====================================================================
   台股籌碼訊號回測：計算引擎（沿用 backtest.py 的邏輯，改在瀏覽器裡算）
   - 資料：每日籌碼試算表（MTXSheet.load()），價格一律用加權指數收盤
   - 天數一律是日曆天；冷卻期是 10 個交易日
   - 新增訊號：在 SIGNALS 加一筆 {id, name, label, detect(ctx)}，detect 回傳訊號日在 mk 裡的索引
   ===================================================================== */
window.MTXBacktest = (function(){
  'use strict';
  const HOLD_DAYS = [7, 14, 30, 60, 90];   // 持有週期（日曆天）
  const COOLDOWN = 10;                      // 冷卻期（交易日）
  const LOW_WINDOW = 30;                    // 30日內最低點（日曆天）
  const SWING_REBOUND = 0.10;               // 波段低點：自低點反彈 10% 才確認
  const PULLBACKS = [0.05, 0.10, 0.15, 0.20];
  const REGIME_HOLDS = [30, 60];
  const BP_PCT = 0.02, BP_START = '2012-01-01', BP_COOLDOWN = 10;
  const DAY = 864e5;

  const dayNum = s => Date.UTC(+s.slice(0,4), +s.slice(5,7)-1, +s.slice(8,10)) / DAY;
  const r2 = x => Math.round(x * 100) / 100;
  const pct = x => r2(x * 100);

  /* ---------- 市場資料 ---------- */
  function Market(rows){
    const R = rows.filter(r => r.idx != null && isFinite(r.idx));
    const mk = { rows: R, d: R.map(r => r.date), t: R.map(r => dayNum(r.date)), c: R.map(r => r.idx) };
    mk.n = mk.c.length; mk.end = mk.t[mk.n-1];
    const roll = w => { const out = new Array(mk.n).fill(NaN); let s = 0;
      for(let i=0;i<mk.n;i++){ s += mk.c[i]; if(i>=w) s -= mk.c[i-w]; if(i>=w-1) out[i] = s / w; } return out; };
    mk.ma = roll(60); mk.ma240 = roll(240);
    mk.ath = []; let m = -Infinity; mk.c.forEach(v => { m = Math.max(m, v); mk.ath.push(m); });
    mk.year = mk.d.map(s => +s.slice(0,4));
    mk.yret = {}; mk.firstYear = mk.year[0];
    const lastOf = {}, firstOf = {};
    mk.year.forEach((y,i) => { lastOf[y] = mk.c[i]; if(!(y in firstOf)) firstOf[y] = mk.c[i]; });
    Object.keys(lastOf).forEach(y => { y = +y; const prev = (y-1) in lastOf ? lastOf[y-1] : firstOf[y]; mk.yret[y] = lastOf[y] / prev - 1; });
    mk.lastOnOrBefore = t => { let lo = 0, hi = mk.n; while(lo < hi){ const md = (lo+hi) >> 1; if(mk.t[md] <= t) lo = md+1; else hi = md; } return lo - 1; };
    mk.days = (i,j) => mk.t[j] - mk.t[i];
    mk.idxOf = new Map(mk.d.map((s,i) => [s,i]));
    return mk;
  }

  function dedupe(idxs, gap){
    const kept = []; let last = -1e9;
    idxs.slice().sort((a,b)=>a-b).forEach(i => { if(i - last >= gap){ kept.push(i); last = i; } });
    return kept;
  }

  /* ---------- 單一事件 ---------- */
  function low30(mk, i){
    const j = mk.lastOnOrBefore(mk.t[i] + LOW_WINDOW);
    let k = i; for(let t=i+1;t<=j;t++) if(mk.c[t] < mk.c[k]) k = t;
    return k;
  }
  function swingLow(mk, i){
    let m = mk.c[i], k = i;
    for(let t=i+1;t<mk.n;t++){
      if(mk.c[t] < m){ m = mk.c[t]; k = t; }
      else if(mk.c[t] / m - 1 >= SWING_REBOUND) return [k, t];
    }
    return [k, null];
  }
  const pend = (mk, from) => `未達成(${mk.days(from, mk.n-1)}天)`;

  function eventRow(mk, i){
    const c0 = mk.c[i], last = mk.n - 1;
    const r = { '首日日期': mk.d[i], '首日收盤': r2(c0) };
    const k = low30(mk, i);
    Object.assign(r, { '30日最低跌幅': pct(mk.c[k]/c0-1), '30日最低日期': mk.d[k], '30日最低收盤': r2(mk.c[k]), '到達30日最低(天)': mk.days(i,k) });
    if(k === i){
      r['站回首日日期'] = r['站回首日費時'] = r['再跌破首日日期'] = r['再跌破首日費時'] = '—';
    } else {
      let up = null; for(let t=k+1;t<mk.n;t++) if(mk.c[t] > c0){ up = t; break; }
      if(up === null){
        r['站回首日日期'] = '未站回'; r['站回首日費時'] = pend(mk, k);
        r['再跌破首日日期'] = r['再跌破首日費時'] = '—';
      } else {
        r['站回首日日期'] = mk.d[up]; r['站回首日費時'] = mk.days(k, up);
        let dn = null; for(let t=up+1;t<mk.n;t++) if(mk.c[t] < c0){ dn = t; break; }
        if(dn === null){ r['再跌破首日日期'] = '未再跌破'; r['再跌破首日費時'] = pend(mk, up); }
        else { r['再跌破首日日期'] = mk.d[dn]; r['再跌破首日費時'] = mk.days(up, dn); }
      }
    }
    const [sk, conf] = swingLow(mk, i);
    Object.assign(r, { '波段低點跌幅': pct(mk.c[sk]/c0-1), '波段低點日期': mk.d[sk], '波段低點收盤': r2(mk.c[sk]),
      '到達波段低點(天)': mk.days(i, sk), '波段低點確認日': conf === null ? '未確認' : mk.d[conf] });
    let athI = i, ath = c0;
    if(i > 0){ athI = 0; for(let t=1;t<i;t++) if(mk.c[t] > mk.c[athI]) athI = t; ath = mk.c[athI]; }
    r['前高日期'] = mk.d[athI]; r['前高收盤'] = r2(ath);
    let br = null; for(let t=i+1;t<mk.n;t++) if(mk.c[t] > ath){ br = t; break; }
    if(br === null){ r['突破日期'] = '未突破'; r['突破前高費時'] = pend(mk, i); }
    else { r['突破日期'] = mk.d[br]; r['突破前高費時'] = mk.days(i, br); }
    r['盤勢'] = isNaN(mk.ma[i]) ? '—' : (c0 >= mk.ma[i] ? '季線上' : '季線下');
    r._i = i; r._br = br; r._low30 = k; r._swing = conf === null ? null : sk; r._last = last;
    return r;
  }

  function pullbackRow(mk, br){
    const row = { '突破日期': mk.d[br], '突破收盤': r2(mk.c[br]) };
    let peak = mk.c[br], peakI = br; const hit = {};
    for(let t=br+1;t<mk.n;t++){
      if(mk.c[t] > peak){ peak = mk.c[t]; peakI = t; }
      const dd = mk.c[t] / peak - 1;
      PULLBACKS.forEach(p => { if(!hit[p] && dd <= -p) hit[p] = [t, peakI, peak]; });
      if(PULLBACKS.every(p => hit[p])) break;
    }
    PULLBACKS.forEach(p => {
      const lab = Math.round(p*100) + '%';
      if(!hit[p]){ row[`回檔>${lab}日期`] = '未達成'; row[`回檔>${lab}費時`] = pend(mk, br); row[`回檔>${lab}基準高點`] = '—'; }
      else { const [t, pi, pk] = hit[p]; row[`回檔>${lab}日期`] = mk.d[t]; row[`回檔>${lab}費時`] = mk.days(br, t);
        row[`回檔>${lab}基準高點`] = `${mk.d[pi]} (${pk.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})})`; }
    });
    return row;
  }

  /* ---------- 持有 N 天與統計 ---------- */
  function holdOutcome(mk, i, N){
    const target = mk.t[i] + N;
    if(mk.end < target) return null;
    const j = mk.lastOnOrBefore(target);
    if(j <= i) return null;
    let mx = -Infinity, mn = Infinity;
    for(let t=i+1;t<=j;t++){ const v = mk.c[t]/mk.c[i]-1; if(v > mx) mx = v; if(v < mn) mn = v; }
    return [mk.c[j]/mk.c[i]-1, Math.max(0, mx), Math.min(0, mn)];
  }
  const mean = a => a.reduce((s,x)=>s+x,0) / a.length;
  const quant = (a, q) => { const s = a.slice().sort((x,y)=>x-y), p = (s.length-1)*q, lo = Math.floor(p), hi = Math.ceil(p); return s[lo] + (s[hi]-s[lo])*(p-lo); };
  function summarize(outs){
    const o = outs.filter(x => x);
    const n = o.length; if(!n) return { '樣本數': 0 };
    const ret = o.map(x=>x[0]), mfe = o.map(x=>x[1]), mae = o.map(x=>x[2]);
    const wins = ret.filter(x => x > 0), loss = ret.filter(x => x <= 0);
    const p = wins.length / n, W = wins.length ? mean(wins) : 0, L = loss.length ? mean(loss) : 0;
    const m = mean(ret), sd = n > 1 ? Math.sqrt(ret.reduce((s,x)=>s+(x-m)**2,0)/(n-1)) : null;
    return {
      '樣本數': n, '勝率': pct(p), '期望值': pct(p*W + (1-p)*L), '平均獲利W': pct(W), '平均虧損L': pct(L),
      '盈虧比': L !== 0 ? r2(Math.abs(W/L)) : null, '報酬標準差': sd == null ? null : pct(sd),
      '最差10%報酬': pct(quant(ret, .1)), '最大單次漲幅': pct(Math.max(...mfe)), '最大單次跌幅': pct(Math.min(...mae)),
      '平均最大漲幅': pct(mean(mfe)), '中位數最大漲幅': pct(quant(mfe, .5)), '平均最大跌幅': pct(mean(mae)), '中位數最大跌幅': pct(quant(mae, .5)),
    };
  }
  function baseline(mk){
    const b = {}; HOLD_DAYS.forEach(N => { b[N] = mk.c.map((_, i) => holdOutcome(mk, i, N)); }); return b;
  }

  /* ---------- 一個訊號的所有表格 ---------- */
  function analyze(mk, idxs, base){
    const events = idxs.map(i => eventRow(mk, i));
    const pulls = [], seen = new Map();
    events.forEach(e => {
      if(e._br === null) return;
      if(seen.has(e._br)){ seen.get(e._br)._sig.push(e['首日日期']); return; }
      const row = pullbackRow(mk, e._br); row._sig = [e['首日日期']];
      seen.set(e._br, row); pulls.push(row);
    });
    pulls.forEach(p => { const sig = p._sig.sort().reverse().join('、'); delete p._sig;
      const { '突破日期': d, ...rest } = p; Object.keys(p).forEach(k => delete p[k]); Object.assign(p, { '突破日期': d, '對應訊號': sig }, rest); });

    const bases = [['首日收盤（可交易）', e => e._i], ['30日內最低點（參考用）', e => e._low30], ['波段低點（參考用）', e => e._swing]];
    const summary = [];
    bases.forEach(([name, f]) => HOLD_DAYS.forEach(N => {
      const starts = events.map(f).filter(s => s != null);
      const outs = starts.map(s => holdOutcome(mk, s, N));
      summary.push({ '評估基準': name, '持有週期': N + '天', ...summarize(outs), '未完成': outs.filter(o => !o).length });
    }));
    HOLD_DAYS.forEach(N => summary.push({ '評估基準': '無條件基準（所有交易日）', '持有週期': N + '天', ...summarize(base[N]), '未完成': base[N].filter(o => !o).length }));

    const excess = [];
    HOLD_DAYS.forEach(N => {
      const s = summary.find(x => x['評估基準'].startsWith('首日') && x['持有週期'] === N + '天');
      const b = summary.find(x => x['評估基準'].startsWith('無條件') && x['持有週期'] === N + '天');
      if(s['樣本數']) excess.push({ '持有週期': N + '天', '訊號樣本數': s['樣本數'], '訊號勝率': s['勝率'], '基準勝率': b['勝率'],
        '超額勝率': r2(s['勝率'] - b['勝率']), '訊號期望值': s['期望值'], '基準期望值': b['期望值'], '超額期望值': r2(s['期望值'] - b['期望值']) });
    });

    const groupRow = (ii, inGroup) => {
      const row = {};
      REGIME_HOLDS.forEach(H => {
        const s = summarize(ii.map(i => holdOutcome(mk, i, H)));
        const bs = summarize(base[H].filter((_, t) => inGroup(t)));
        Object.assign(row, { [`${H}天完成數`]: s['樣本數'], [`${H}天勝率`]: s['勝率'] ?? null, [`${H}天期望值`]: s['期望值'] ?? null,
          [`${H}天基準期望值`]: bs['期望值'] ?? null, [`${H}天超額`]: s['樣本數'] ? r2(s['期望值'] - bs['期望值']) : null });
      });
      return row;
    };
    const years = [...new Set(idxs.map(i => mk.year[i]))].sort((a,b) => b-a);
    const byYear = years.map(y => {
      const ii = idxs.filter(i => mk.year[i] === y);
      return { '年度': y === mk.firstYear && mk.d[0].slice(5) !== '01-01' ? `${y}（${+mk.d[0].slice(5,7)} 月起）` : String(y),
        '年度漲跌': pct(mk.yret[y]), '訊號數': ii.length, ...groupRow(ii, t => mk.year[t] === y) };
    });
    const ybucket = t => { const r = mk.yret[mk.year[t]]; return r < 0 ? '空頭年（全年下跌）' : (r < .2 ? '溫和多頭（0～20%）' : '強多頭（20%以上）'); };
    const ddbucket = t => { const dd = mk.c[t] / mk.ath[t] - 1; return dd > -.05 ? '距高點 5% 以內' : (dd > -.15 ? '距高點 5～15%' : '距高點 15% 以上'); };
    const dims = [
      ['季線（訊號當天可判斷）', t => isNaN(mk.ma[t]) ? null : (mk.c[t] >= mk.ma[t] ? '季線上' : '季線下'), ['季線上','季線下']],
      ['年線（訊號當天可判斷）', t => isNaN(mk.ma240[t]) ? null : (mk.c[t] >= mk.ma240[t] ? '年線上' : '年線下'), ['年線上','年線下']],
      ['距歷史新高（訊號當天可判斷）', ddbucket, ['距高點 5% 以內','距高點 5～15%','距高點 15% 以上']],
      ['全年漲跌（事後才知道）', ybucket, ['空頭年（全年下跌）','溫和多頭（0～20%）','強多頭（20%以上）']],
    ];
    const byRegime = [];
    dims.forEach(([dname, f, groups]) => {
      const lab = mk.c.map((_, t) => f(t));
      groups.forEach(g => { const ii = idxs.filter(i => lab[i] === g);
        byRegime.push({ '分類方式': dname, '組別': g, '訊號數': ii.length, ...groupRow(ii, t => lab[t] === g) }); });
    });
    const desc = (a, k) => a.slice().sort((x,y) => x[k] < y[k] ? 1 : x[k] > y[k] ? -1 : 0);
    return { events: desc(events, '首日日期'), pullbacks: desc(pulls, '突破日期'), summary, excess, byYear, byRegime };
  }

  /* ---------- 訊號定義（可擴充） ---------- */
  const flagO = v => v != null && String(v).trim().toUpperCase() === 'O';
  const SIGNALS = [
    { id: 'strong', name: '強烈落底', label: '強烈落底（BE欄）',
      detect(ctx){ const raw = []; ctx.mk.rows.forEach((r, i) => { if(flagO(r.sigStrong)) raw.push(i); });
        const kept = dedupe(raw, COOLDOWN);
        return { raw: raw.length, kept, removed: raw.filter(i => !kept.includes(i)).map(i => ctx.mk.d[i]).sort().reverse() }; } },
    { id: 'bp', name: 'BP紅燈', label: 'BP紅燈（歷史前 2%）',
      detect(ctx){
        // 逐日動態判斷：當天外資BP金額 ≥ 當天以前（含當天）所有資料由大到小第 k 大，k = max(1, floor(筆數 × 2%))
        const S = ctx.bpSeries, lit = [], sorted = [];
        S.forEach((s, t) => {
          const v = s.bp; let lo = 0, hi = sorted.length; while(lo < hi){ const md = (lo+hi) >> 1; if(sorted[md] > v) lo = md+1; else hi = md; } sorted.splice(lo, 0, v);
          if(s.date < BP_START) return;
          const k = Math.max(1, Math.floor((t + 1) * BP_PCT));
          if(v >= sorted[k-1]) lit.push(t);
        });
        const first = []; let last = -1e9;
        lit.forEach(t => { if(t - last >= BP_COOLDOWN) first.push(t); last = t; });
        const kept = first.map(t => ctx.mk.idxOf.get(S[t].date)).filter(i => i != null);
        return { raw: kept.length, kept, removed: [] };
      } },
  ];

  /* ---------- 入口 ---------- */
  // data：MTXSheet.load() 的結果；end：只用這天以前的資料（驗算用，YYYY-MM-DD）
  function run(data, end){
    const rows = end ? data.rows.filter(r => r.date <= end) : data.rows;
    const bpSeries = (data.bpSeries || []).filter(s => !end || s.date <= end);
    const mk = Market(rows);
    const base = baseline(mk);
    const ctx = { mk, bpSeries };
    const signals = SIGNALS.map(sig => {
      const det = sig.detect(ctx);
      const res = analyze(mk, det.kept, base);
      return { id: sig.id, name: sig.name, label: sig.label, raw: det.raw, count: det.kept.length, removed: det.removed, idxs: det.kept, ...res };
    });
    return { mk, signals, first: mk.d[0], last: mk.d[mk.n-1], days: mk.n };
  }

  return { run, SIGNALS, HOLD_DAYS, COOLDOWN, holdOutcome };
})();
