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
  // 研發處：BP過熱紫燈連續 5 天；中間沒亮 3 個交易日以內仍算同一段（2026-11-27 決定），另外比較中斷容許 0／3／5 個交易日
  const STREAK_K = 5, STREAK_GAP = 3, STREAK_GAPS = [0, 3, 5];
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
  // 無條件基準：用到哪個持有天數才算（BP紅燈會多算第一次穩定 100% 那天與 120 天）
  function baseline(mk){
    const b = {}; return N => b[N] || (b[N] = mk.c.map((_, i) => holdOutcome(mk, i, N)));
  }

  /* ---------- 一個訊號的所有表格 ---------- */
  function analyze(mk, idxs, base, holds, regimeHolds){
    holds = holds || HOLD_DAYS; regimeHolds = regimeHolds || REGIME_HOLDS;
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
    bases.forEach(([name, f]) => holds.forEach(N => {
      const starts = events.map(f).filter(s => s != null);
      const outs = starts.map(s => holdOutcome(mk, s, N));
      summary.push({ '評估基準': name, '持有週期': N + '天', ...summarize(outs), '未完成': outs.filter(o => !o).length });
    }));
    holds.forEach(N => summary.push({ '評估基準': '無條件基準（所有交易日）', '持有週期': N + '天', ...summarize(base(N)), '未完成': base(N).filter(o => !o).length }));

    const excess = [];
    holds.forEach(N => {
      const s = summary.find(x => x['評估基準'].startsWith('首日') && x['持有週期'] === N + '天');
      const b = summary.find(x => x['評估基準'].startsWith('無條件') && x['持有週期'] === N + '天');
      if(s['樣本數']) excess.push({ '持有週期': N + '天', '訊號樣本數': s['樣本數'], '訊號勝率': s['勝率'], '基準勝率': b['勝率'],
        '超額勝率': r2(s['勝率'] - b['勝率']), '訊號期望值': s['期望值'], '基準期望值': b['期望值'], '超額期望值': r2(s['期望值'] - b['期望值']) });
    });

    const groupRow = (ii, inGroup) => {
      const row = {};
      regimeHolds.forEach(H => {
        const s = summarize(ii.map(i => holdOutcome(mk, i, H)));
        const bs = summarize(base(H).filter((_, t) => inGroup(t)));
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

  /* 逐日「當天以前（含當天）前 p」：值 ≥ 當天以前所有資料由大到小第 k 大，k＝max(1, floor(筆數×p))，2012 年起判斷（同 BP紅燈）
     val(r)：取值的函式（null 不列入）。回傳每個亮燈日（lit）與冷卻 10 個交易日後的首日（kept） */
  function pctDetect(mk, val, p){
    const sorted = [], lit = []; let lastVal = null, lastThr = null;
    mk.rows.forEach((r, i) => {
      const v = val(r); if(v == null || !isFinite(v)) return;
      let lo = 0, hi = sorted.length; while(lo < hi){ const md = (lo+hi) >> 1; if(sorted[md] > v) lo = md+1; else hi = md; } sorted.splice(lo, 0, v);
      if(mk.d[i] < BP_START) return;
      const thr = sorted[Math.max(1, Math.floor(sorted.length * p)) - 1]; lastVal = v; lastThr = thr;
      if(v >= thr) lit.push(i);
    });
    const kept = []; let last = -1e9;
    lit.forEach(i => { if(i - last >= BP_COOLDOWN) kept.push(i); last = i; });
    return { raw: kept.length, kept, removed: [], lit, lastVal, lastThr };   // lastVal／lastThr：最後一天的值與門檻
  }
  /* ---------- 訊號定義（可擴充） ---------- */
  const flagO = v => v != null && String(v).trim().toUpperCase() === 'O';
  const SIGNALS = [
    { id: 'strong', name: '強烈落底', label: '強烈落底（BE欄）', desc: '每日籌碼試算表「強烈落底」欄（BE 欄）標記 O 的交易日', kind: 'low',
      detect(ctx){ const raw = []; ctx.mk.rows.forEach((r, i) => { if(flagO(r.sigStrong)) raw.push(i); });
        const kept = dedupe(raw, COOLDOWN);
        return { raw: raw.length, kept, removed: raw.filter(i => !kept.includes(i)).map(i => ctx.mk.d[i]).sort().reverse() }; } },
    // turn: true＝另算「第一次穩定 100%」、走勢、出場方式比較（BP紅燈，以及照它的模式算的研發處訊號）
    { id: 'bp', name: 'BP極端過熱紅燈', label: 'BP極端過熱紅燈（前 2%）', desc: '外資 BP 金額達到當天以前所有資料的前 2%，逐日判斷', kind: 'low', col: '外資 BP 金額（Sheet1）', pct: 0.02, turn: true,
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
    // 以下 2026-11-24 新增：BP 系列（大跌時的極端行情）與 BC 系列（高檔或暴漲時）；判斷方式同 BP紅燈（逐日、2012 起、冷卻 10 個交易日）
    { id: 'bpv', name: 'BP過熱紫燈', label: 'BP過熱紫燈（前 10%）', desc: '外資 BP 金額達到當天以前所有資料的前 10%，逐日判斷', kind: 'low', col: '外資 BP 金額（Sheet1）', pct: 0.10,
      detect(ctx){ return pctDetect(ctx.mk, r => r.bp, 0.10); } },
    { id: 'bpx', name: 'BP紫爆', label: 'BP紫爆（W 欄前 1%）', desc: '外資(BP)OP未平倉金額與結算比（W 欄）達到當天以前所有資料的前 1%', kind: 'low', col: '外資(BP)OP未平倉金額與結算比（工作表1 W 欄）', pct: 0.01,
      detect(ctx){ return pctDetect(ctx.mk, r => r.bpRel, 0.01); } },
    { id: 'bcy', name: 'BC過熱黃燈', label: 'BC過熱黃燈（前 10%）', desc: '外資 BC 金額達到當天以前所有資料的前 10%，逐日判斷', kind: 'high', col: '外資 BC 金額（Sheet1 H 欄）', pct: 0.10,
      detect(ctx){ return pctDetect(ctx.mk, r => r.bc, 0.10); } },
    { id: 'bcg', name: 'BC極端過熱綠燈', label: 'BC極端過熱綠燈（前 1%）', desc: '外資 BC 金額達到當天以前所有資料的前 1%，逐日判斷', kind: 'high', col: '外資 BC 金額（Sheet1 H 欄）', pct: 0.01,
      detect(ctx){ return pctDetect(ctx.mk, r => r.bc, 0.01); } },
    { id: 'bcx', name: 'BC紫爆', label: 'BC紫爆（T 欄前 1%）', desc: '外資(BC)OP未平倉金額與結算比（T 欄）達到當天以前所有資料的前 1%', kind: 'high', col: '外資(BC)OP未平倉金額與結算比（工作表1 T 欄）', pct: 0.01,
      detect(ctx){ return pctDetect(ctx.mk, r => r.bcRel, 0.01); } },
    // 以下 2026-11-27 新增「研發處」（lab: true）：研究中、結論還沒定案的題目，定案後再移到正式分類
    // BP過熱紫燈連續 5 天：連續亮燈（中間沒亮 3 個交易日以內仍算同一段）到第 5 個亮燈日那天＝訊號日。當天就知道已經亮滿 5 天，可以照做；一段只算一次
    { id: 'bpv5', name: 'BP過熱紫燈連續 5 天', label: 'BP過熱紫燈連續 5 天（第 5 個亮燈日）', desc: 'BP過熱紫燈連續亮到第 5 個亮燈日的那一天（中間沒亮 3 個交易日以內仍算連續，一段只算一次）', kind: 'low', col: '外資 BP 金額', pct: 0.10, lab: true, turn: true,
      streak: { K: STREAK_K, gap: STREAK_GAP, gaps: STREAK_GAPS },
      detect(ctx){ const d = pctDetect(ctx.mk, r => r.bp, 0.10); const kept = streaks(d.lit, STREAK_GAP).filter(w => w.n >= STREAK_K).map(w => w.days[STREAK_K - 1]);
        return { raw: kept.length, kept, removed: [], lit: d.lit }; } },
    // BP紅燈之後的起跌點：研究頁（kind 'study'），訊號日同 BP紅燈，不跑一般的表格；內容由 run() 用 BP紅燈的結果另外算（topStudy）
    { id: 'bpout', name: 'BP紅燈之後的起跌點', label: 'BP紅燈之後的起跌點（勝率穩定 100% 以後第一次跌 5%／10%）', desc: 'BP極端過熱紅燈勝率穩定 100% 那天以後，第一次從高點跌 5%／10% 在什麼時候；起跌點前 10 天的籌碼', kind: 'study', lab: true,
      detect(ctx){ return SIGNALS.find(s => s.id === 'bp').detect(ctx); } },
  ];

  /* ---------- 最早第幾天起勝率穩定 100%（BP紅燈用） ----------
     第 N 天報酬＝首日後第 N 個日曆天（含）以前最後一個交易日收盤 ÷ 首日收盤 − 1；那天以前還沒有交易日時算 0（不算贏）
     穩定翻正日＝從這天起一路到第 H 天報酬都 > 0 的最早一天 */
  function turnPositive(mk, idxs, H){
    H = H || 60;
    const retAt = (i, N) => { const j = mk.lastOnOrBefore(mk.t[i] + N); return j <= i ? 0 : mk.c[j] / mk.c[i] - 1; };
    const rows = idxs.map(i => {
      const avail = Math.min(H, mk.end - mk.t[i]), done = avail >= H;
      const r = []; for(let N = 1; N <= avail; N++) r.push(retAt(i, N));
      let first = null; for(let N = 1; N <= avail; N++) if(r[N-1] > 0){ first = N; break; }
      let stable = null; for(let N = avail; N >= 1 && r[N-1] > 0; N--) stable = N;
      // 翻正前（穩定翻正日之前）的最低收盤；還沒穩定翻正就看到目前為止
      const lim = mk.t[i] + (stable != null ? stable : avail + 1);
      let lo = i; for(let t = i + 1; t < mk.n && mk.t[t] < lim; t++) if(mk.c[t] < mk.c[lo]) lo = t;
      // 路徑：H 天內最高報酬與第幾天；穩定翻正後，從「翻正後的最高點」最大拉回多少（報酬換算回價格比較）
      let peak = null, peakDay = null; r.forEach((v, k) => { if(peak === null || v > peak){ peak = v; peakDay = k + 1; } });
      let pull = null, pullDay = null, pullFrom = null;
      if(stable != null){ let hi = -Infinity, hiDay = null; pull = 0;
        for(let N = stable; N <= avail; N++){ const v = r[N-1]; if(v > hi){ hi = v; hiDay = N; }
          const d = (1 + v) / (1 + hi) - 1; if(d < pull){ pull = d; pullDay = N; pullFrom = hiDay; } } }
      return { i, date: mk.d[i], close: mk.c[i], done, avail, first, stable, ret: r,
        retH: done ? r[H-1] : null, lowI: lo, low: mk.c[lo] / mk.c[i] - 1, lowDays: mk.days(i, lo),
        peak, peakDay, pull, pullDay, pullFrom };
    });
    const D = rows.filter(r => r.done), win = [];
    const ev = [];   // 第 N 天的期望值（平均報酬）
    for(let N = 1; N <= H; N++){ win.push(D.length ? D.filter(r => r.ret[N-1] > 0).length / D.length : null); ev.push(D.length ? D.reduce((s, r) => s + r.ret[N-1], 0) / D.length : null); }
    let stable = null; for(let N = H; N >= 1 && win[N-1] === 1; N--) stable = N;
    const firstAll = win.indexOf(1) + 1 || null;
    return { H, rows, done: D.length, win, ev, stable, firstAll };
  }

  /* ---------- 出場方式比較（BP紅燈用；「從最高點跌 X% 就賣」「獲利剩 Y% 就賣」回測過、沒有比較好，2026-11-24 決定不放）：首日收盤進場，最多觀察 CAP 個日曆天，沒觸發就在第 CAP 天出場 ----------
     回傳每種出場方式在每次訊號的 [出場第幾天, 報酬]；只算已滿 CAP 天的訊號 */
  function exitRules(mk, idxs, stableDay, CAP){
    CAP = CAP || 120;
    const E = idxs.filter(i => mk.end - mk.t[i] >= CAP).map(i => {
      const p = []; for(let t = i + 1; t < mk.n && mk.days(i, t) <= CAP; t++) p.push([mk.days(i, t), mk.c[t] / mk.c[i] - 1]);
      return { i, date: mk.d[i], p };
    });
    const last = p => p[p.length - 1];
    const hold = N => p => { let a = null; p.forEach(x => { if(x[0] <= N) a = x; }); return a; };
    // 整理出場：已經獲利、而且連續 K 個日曆天沒有創新高（收盤）就出場
    const flat = K => p => { let pk = 0, pd = 0; for(const [d, r] of p){ if(r > pk){ pk = r; pd = d; } if(pk > 0 && d - pd >= K) return [d, r]; } return last(p); };
    const best = p => p.reduce((a, b) => b[1] > a[1] ? b : a);
    const R = [
      ...[30, stableDay, 60, 90, 120, 180, 250, 365].filter((N, k, a) => N && N <= CAP && a.indexOf(N) === k).sort((a, b) => a - b)
        .map(N => ['hold', '固定天數', N === stableDay ? `持有 ${N} 天（勝率穩定 100% 那天）` : `持有 ${N} 天`, hold(N)]),
      ['flat', '整理太久就賣', '連續 30 天沒創新高就賣', flat(30)],
      ['best', '事後才知道', `${CAP} 天內最高點（參考）`, best],
    ].map(([kind, group, name, fn]) => {
      const o = E.map(e => fn(e.p)), rets = o.map(x => x[1]), days = o.map(x => x[0]);
      const avg = rets.length ? mean(rets) : null, avgDays = days.length ? mean(days) : null;
      return { kind, group, name, each: o, avg, min: rets.length ? Math.min(...rets) : null, win: rets.length ? rets.filter(x => x > 0).length / rets.length : null,
        avgDays, perDay: avg != null && avgDays ? avg / avgDays : null };
    });
    return { CAP, events: E.map(e => e.date), rules: R };
  }

  /* ---------- 「連續 K 天沒創新高就賣」在 46／60／120 天內會不會觸發（BP紅燈用） ----------
     每個觀察期 C：訊號各自是否在 C 天內觸發、報酬，對照持有 C 天；基準＝所有交易日都當成進場日、套同一個規則 */
  function flatCompare(mk, idxs, caps, K){
    K = K || 30;
    const path = (i, C) => { const p = []; for(let t = i + 1; t < mk.n && mk.days(i, t) <= C; t++) p.push([mk.days(i, t), mk.c[t] / mk.c[i] - 1]); return p; };
    const run1 = p => { let pk = 0, pd = 0; for(const [d, r] of p){ if(r > pk){ pk = r; pd = d; } if(pk > 0 && d - pd >= K) return { d, r, hit: true }; }
      const l = p[p.length - 1]; return { d: l[0], r: l[1], hit: false }; };
    return caps.map(C => {
      const ok = i => mk.end - mk.t[i] >= C;
      const ev = idxs.filter(ok).map(i => { const p = path(i, C); return { date: mk.d[i], flat: run1(p), hold: p[p.length - 1][1] }; });
      let n = 0, sf = 0, sh = 0, hits = 0;
      for(let i = 0; i < mk.n; i++){ if(!ok(i)) break; const p = path(i, C); if(!p.length) continue; const f = run1(p); n++; sf += f.r; sh += p[p.length - 1][1]; if(f.hit) hits++; }
      return { C, ev, base: n ? { n, flat: sf / n, hold: sh / n, hitRate: hits / n } : null };
    });
  }

  /* ---------- BC 系列：高檔觀測（亮燈之後大盤怎麼走） ----------
     BC 燈號是高檔／暴漲的標記，亮燈期間常常還在漲，所以除了「首日」，也比較不同的起點：
     每個亮燈日、熄燈（前一個交易日亮、當天沒亮，當天就知道）、連續亮 K 天以上後熄燈、亮燈後外資期貨淨單轉空。
     都只用當天以前就知道的資訊（「一段亮燈的最後一天」要等之後沒再亮才知道，等於偷看未來，不用）。 */
  const HW_HOLDS = [7, 14, 30, 60, 120];
  function hwStats(mk, idxs, base){
    const o = { n: idxs ? idxs.length : mk.n, h: {} };
    HW_HOLDS.forEach(N => {
      const v = (idxs ? idxs.map(i => holdOutcome(mk, i, N)) : base(N)).filter(Boolean);
      o.h[N] = { n: v.length, avg: v.length ? pct(mean(v.map(x => x[0]))) : null, down: v.length ? pct(v.filter(x => x[0] < 0).length / v.length) : null };
    });
    const v = (idxs ? idxs.map(i => holdOutcome(mk, i, 120)) : base(120)).filter(Boolean);
    o.crash = v.length ? pct(v.filter(x => x[2] <= -0.10).length / v.length) : null;   // 120 天內曾跌 10% 以上
    o.crashN = v.filter(x => x[2] <= -0.10).length; o.doneN = v.length;
    return o;
  }
  function highWatch(mk, lit, kept, base, extra){
    const on = new Set(lit), offs = [];
    for(let i = 1; i < mk.n; i++) if(on.has(i-1) && !on.has(i)){ let k = 0; for(let t = i-1; t >= 0 && on.has(t); t--) k++; offs.push([i, k]); }
    const cool = a => { const out = []; let last = -1e9; a.forEach(i => { if(i - last >= BP_COOLDOWN) out.push(i); last = i; }); return out; };
    const rows = [
      { key: 'first', name: '亮燈首日（冷卻 10 個交易日）', idxs: kept },
      { key: 'every', name: '每個亮燈日', idxs: lit },
      { key: 'off', name: '熄燈（隔天沒亮，冷卻 10 個交易日）', idxs: cool(offs.map(x => x[0])) },
      ...[3, 5, 10].map(K => ({ key: 'off' + K, name: `連續亮 ${K} 天以上後熄燈`, idxs: offs.filter(x => x[1] >= K).map(x => x[0]) })),
    ];
    // 亮燈後 20 個交易日內，外資期貨淨未平倉由多轉空（前一天 ≥ 0、當天 < 0）
    const fi = mk.rows.map(r => r.fiOI), turn = [];
    for(let i = 1; i < mk.n; i++){ if(fi[i] == null || fi[i-1] == null || !(fi[i-1] >= 0 && fi[i] < 0)) continue;
      let near = false; for(let t = i; t >= 0 && i - t <= 20; t--) if(on.has(t)){ near = true; break; }
      if(near) turn.push(i); }
    rows.push({ key: 'fiturn', name: '亮燈後 20 個交易日內，外資期貨淨單轉空', idxs: cool(turn) });
    (extra || []).forEach(x => rows.push(x));
    rows.forEach(r => Object.assign(r, hwStats(mk, r.idxs)));
    const baseRow = { key: 'base', name: '無條件基準（所有交易日）', ...hwStats(mk, null, base) };
    // 2012 年起跌 10% 以上的高點（收盤）：高點前 90 天內有沒有亮燈
    const s0 = mk.d.findIndex(d => d >= BP_START), tops = [];
    let pk = s0, dd = false, lo = null;
    for(let i = s0; i < mk.n; i++){
      if(!dd && mk.c[i] > mk.c[pk]) pk = i;
      if(!dd && mk.c[i] / mk.c[pk] - 1 <= -0.10){ dd = true; lo = i; }
      if(dd){ if(mk.c[i] < mk.c[lo]) lo = i; if(mk.c[i] >= mk.c[pk]){ tops.push({ i: pk, lo, recovered: i }); dd = false; pk = i; } }
    }
    if(dd) tops.push({ i: pk, lo, recovered: null });
    const topRows = tops.map(t => { let near = null; for(let k = t.i; k >= 0 && mk.days(k, t.i) <= 90; k--) if(on.has(k)){ near = k; break; }
      return { date: mk.d[t.i], close: mk.c[t.i], low: mk.d[t.lo], drop: pct(mk.c[t.lo] / mk.c[t.i] - 1), lit: near != null, before: near == null ? null : mk.days(near, t.i), litDate: near == null ? null : mk.d[near] }; });
    // 目前狀態：最後一天有沒有亮、連續亮幾天、最近 60 個交易日亮幾天
    let streak = 0; for(let t = mk.n - 1; t >= 0 && on.has(t); t--) streak++;
    let recent = 0; for(let t = Math.max(0, mk.n - 60); t < mk.n; t++) if(on.has(t)) recent++;
    const lastLit = lit.length ? mk.d[lit[lit.length - 1]] : null;
    return { rows, base: baseRow, tops: topRows.reverse(), now: { on: on.has(mk.n - 1), streak, recent, lastLit } };
  }

  /* ---------- 研發處：BP過熱紫燈連續亮燈 ----------
     streaks：把亮燈日分成一段一段；兩個亮燈日之間沒亮的交易日 ≤ gap 天就算同一段（gap 0＝嚴格連續）
     streakStudy：亮滿 K 天的段落，比較中斷容許 0／3／5 天的算法，以及從「第 K 個亮燈日」（當天就知道）和「首日」（要事後才知道會亮滿 K 天）進場的差別 */
  function streaks(lit, gap){
    const W = []; let cur = null;
    lit.forEach(i => { if(cur && i - cur.end - 1 <= gap){ cur.days.push(i); cur.end = i; } else { cur = { start: i, end: i, days: [i] }; W.push(cur); } });
    W.forEach(w => { w.n = w.days.length; w.span = w.end - w.start + 1; });
    return W;
  }
  const STREAK_HOLDS = [14, 30, 60, 90, 120, 250];
  function streakStudy(mk, lit, K, gap, gaps, base, S){   // gap：本頁採用的算法
    const holds = [...new Set([...STREAK_HOLDS, S].filter(Boolean))].sort((a, b) => a - b), last = mk.n - 1;
    const st = v => v.length ? { n: v.length, win: v.filter(x => x > 0).length / v.length, avg: mean(v), min: Math.min(...v) } : { n: 0 };
    const stat = idxs => Object.fromEntries(holds.map(N => [N, st(idxs.map(i => holdOutcome(mk, i, N)).filter(Boolean).map(x => x[0]))]));
    // 勝率 100%（每一次都高於進場日收盤）的天數區間；只算已滿 H 天的
    const win100 = (idxs, H) => { const T = turnPositive(mk, idxs, H), seg = []; let a = null;
      T.win.forEach((w, k) => { if(w === 1){ if(a == null) a = k + 1; } else if(a != null){ seg.push([a, k]); a = null; } });
      if(a != null) seg.push([a, H]);
      return { H, done: T.done, seg }; };
    const rows = gaps.map(g => {
      // 最後一段離資料最後一天不到 gap 個交易日：之後還可能接上，算進行中
      const W = streaks(lit, g), live = w => last - w.end <= g;
      const waves = W.filter(w => w.n >= K).map(w => ({ start: w.start, end: w.end, n: w.n, span: w.span, conf: w.days[K - 1], live: live(w) }));
      const short = W.filter(w => w.n < K && !live(w)).map(w => w.start);   // 不到 K 天就熄燈的段落
      return { gap: g, waves, conf: stat(waves.map(w => w.conf)), first: stat(waves.map(w => w.start)), short: stat(short), shortN: short.length,
        w100conf: win100(waves.map(w => w.conf), 250), w100first: win100(waves.map(w => w.start), 250) };
    });
    return { K, gap, holds, rows, base: Object.fromEntries(holds.map(N => [N, st(base(N).filter(Boolean).map(x => x[0]))])) };
  }

  /* ---------- 研發處：BP紅燈之後的起跌點 ----------
     每次 BP紅燈：從首日起追蹤最高收盤，第 S 天（勝率穩定 100% 那天）以後，第一次收盤比最高收盤低 5%／10% 的日子；那個最高收盤的日子＝起跌點。
     起跌點前 1～10 個交易日的籌碼，和「2012 年以來所有跌 10% 以上的波段高點」「一般的 20 日新高日（之後 20 個交易日內沒有跌 5%）」比較出現的比例；
     再看這些條件出現在 20 日新高日時，之後是不是真的比較容易跌，以及拿來當出場訊號（第 S 天以後第一次出現就賣）離起跌點多遠。 */
  const TOP_DROPS = [0.05, 0.10];
  // [代號, 名稱, 判斷]；判斷回傳 null＝那段期間沒有資料（例如微台 2024/07/29 才有），不列入比例
  const TOP_CONDS = [
    ['dayUpFiDown', '當天：指數漲、外資期貨淨單減少', w => w.dayUpFiDown],
    ['ma60', '當天：季線乖離 ≥ 8%', w => w.ma60 == null ? null : w.ma60 >= 0.08],
    ['spot', '外資現貨 10 日合計賣超', w => w.spot < 0],
    ['fiChg', '外資期貨淨單 10 日減少', w => w.fiChg == null ? null : w.fiChg < 0],
    ['upFiDown', '「指數漲、外資期貨淨單減少」≥ 3 天', w => w.upFiDown >= 3],
    ['bcy', 'BC過熱黃燈亮過', w => w.bcy > 0],
    ['sc10', 'SC 金額前 10%（SC過熱）亮過', w => w.sc10 > 0],
    ['bcUp', 'BC 金額 10 日增加', w => w.bcChg == null ? null : w.bcChg > 0],
    ['scUp', 'SC 金額 10 日增加', w => w.scChg == null ? null : w.scChg > 0],
    ['upBP', '「指數漲、BP 增加」≥ 2 天（BP 逆勢增加）', w => w.upBP >= 2],
    ['bpUp', 'BP 金額 10 日增加', w => w.bpChg == null ? null : w.bpChg > 0],
    ['rtUp', '散戶看多（小+微）10 日增加', w => w.rtChg == null ? null : w.rtChg > 0],
    ['mxUp', '微台看多 10 日增加', w => w.mxChg == null ? null : w.mxChg > 0],
    ['mxPct', '微台多單持倉百分位 ≥ 99', w => w.mxPct == null ? null : w.mxPct >= 99],
  ];
  // 波段高點：從高點回落 X% 才確認；之後從低點反彈 X% 才開始找下一個高點
  function zigzagTops(mk, X, from){
    const s0 = mk.d.findIndex(d => d >= from), P = []; if(s0 < 0) return P;
    let up = true, hi = s0, lo = s0;
    for(let i = s0 + 1; i < mk.n; i++){
      if(up){ if(mk.c[i] > mk.c[hi]) hi = i; else if(mk.c[i] / mk.c[hi] - 1 <= -X){ P.push(hi); up = false; lo = i; } }
      else { if(mk.c[i] < mk.c[lo]) lo = i; else if(mk.c[i] / mk.c[lo] - 1 >= X){ up = true; hi = i; } }
    }
    return P;
  }
  function topStudy(mk, idxs, S){
    const R = mk.rows, last = mk.n - 1;
    const L = { bcy: new Set(pctDetect(mk, r => r.bc, 0.10).lit), sc10: new Set(pctDetect(mk, r => r.sc, 0.10).lit) };
    const firstOn = d => { let j = mk.lastOnOrBefore(d); if(j < 0 || mk.t[j] < d) j++; return j; };   // 日曆天 d 當天或之後的第一個交易日
    // 起跌點（或任一天）P 前 1～10 個交易日（P−10～P−1）；「10 日變化」＝P−1 收盤比 P−11 收盤
    const memo = new Map();
    const pre = P => { if(memo.has(P)) return memo.get(P); let w = null;
      if(P >= 11){ const b = P - 1, p0 = P - 11, ix = []; for(let t = P - 10; t <= b; t++) ix.push(t);
        const ch = k => R[b][k] != null && R[p0][k] ? R[b][k] / R[p0][k] - 1 : null;
        const up = t => R[t].chg > 0, cnt = s => ix.filter(t => s.has(t)).length;
        const pc = ix.map(t => R[t].rtLongPct).filter(v => v != null);
        w = { idx10: mk.c[b] / mk.c[p0] - 1,
          dayUpFiDown: R[P].chg > 0 && R[P].fiDelta != null && R[P].fiDelta < 0, dayFi: R[P].fiDelta,
          upFiDown: ix.filter(t => up(t) && R[t].fiDelta != null && R[t].fiDelta < 0).length,
          fiChg: R[b].fiOI != null && R[p0].fiOI != null ? R[b].fiOI - R[p0].fiOI : null,
          spot: ix.reduce((s, t) => s + (R[t].fiSpot || 0), 0),
          bcy: cnt(L.bcy), sc10: cnt(L.sc10), bcChg: ch('bc'), scChg: ch('sc'), bpChg: ch('bp'),
          upBP: ix.filter(t => up(t) && R[t].bp != null && R[t-1].bp != null && R[t].bp > R[t-1].bp).length,
          rtChg: ch('rtLong'), mxChg: R[p0].mxLong > 0 ? ch('mxLong') : null, mxPct: pc.length ? Math.max(...pc) : null,
          ma60: isNaN(mk.ma[P]) ? null : mk.c[P] / mk.ma[P] - 1 }; }
      memo.set(P, w); return w; };
    // 每次 BP紅燈
    const sig = idxs.map(i => {
      const dS = mk.t[i] + S, done = mk.end >= dS;
      // 第 S 天以前，從訊號後最高收盤的最大回檔
      let pk = i, dd = { v: 0, peak: i, low: i };
      for(let t = i + 1; t < mk.n && mk.t[t] < dS; t++){ if(mk.c[t] > mk.c[pk]) pk = t; const x = mk.c[t] / mk.c[pk] - 1; if(x < dd.v) dd = { v: x, peak: pk, low: t }; }
      const drops = TOP_DROPS.map(X => { let p = i;
        for(let t = i + 1; t < mk.n; t++){ if(mk.c[t] > mk.c[p]) p = t; if(mk.t[t] >= dS && mk.c[t] / mk.c[p] - 1 <= -X) return { X, peak: p, hit: t }; }
        return { X, peak: null, hit: null }; });
      let hi = i; for(let t = i + 1; t < mk.n; t++) if(mk.c[t] > mk.c[hi]) hi = t;
      return { i, date: mk.d[i], close: mk.c[i], done, dS: new Date(dS * DAY).toISOString().slice(0, 10), retS: done ? mk.c[mk.lastOnOrBefore(dS)] / mk.c[i] - 1 : null, dd, drops, hi };
    });
    // 起跌點（同一個高點可能同時是 5% 和 10% 的起跌點），新到舊
    const byP = new Map();
    sig.forEach(s => s.drops.forEach(d => { if(d.peak == null) return; const o = byP.get(d.peak) || { P: d.peak, X: [], from: [] };
      if(!o.X.includes(d.X)) o.X.push(d.X); if(!o.from.includes(s.date)) o.from.push(s.date); byP.set(d.peak, o); }));
    const tops = [...byP.values()].sort((a, b) => b.P - a.P).map(o => Object.assign(o, { w: pre(o.P) }));
    // 對照組
    const s0 = Math.max(21, mk.d.findIndex(d => d >= BP_START));
    const is20hi = i => { if(i < 20) return false; for(let t = i - 20; t < i; t++) if(mk.c[t] > mk.c[i]) return false; return true; };
    const minAhead = (i, K) => { let m = 0; for(let t = i + 1; t <= i + K && t < mk.n; t++) m = Math.min(m, mk.c[t] / mk.c[i] - 1); return m; };
    const z10 = zigzagTops(mk, 0.10, BP_START);
    const hi20 = []; for(let i = s0; i <= last; i++) if(is20hi(i)) hi20.push(i);
    const ctrl = hi20.filter(i => i + 20 <= last && minAhead(i, 20) > -0.05);
    const rate = Ps => { const W = Ps.map(pre).filter(Boolean);
      return Object.fromEntries(TOP_CONDS.map(([k, , f]) => { const v = W.map(f).filter(x => x != null); return [k, { n: v.length, yes: v.filter(Boolean).length }]; })); };
    // 20 日新高日：條件出現時，之後 40 個交易日內跌 5%／10% 的比例（全部年份、不含今年）
    const thisYear = mk.d[last].slice(0, 4);
    const fwd = hi20.filter(i => i + 40 <= last), m40 = new Map(fwd.map(i => [i, minAhead(i, 40)]));
    const pcell = days => Object.fromEntries(TOP_CONDS.map(([k, , f]) => { const y = [], n = [];
      days.forEach(i => { const w = pre(i), v = w ? f(w) : null; if(v == null) return; (v ? y : n).push(m40.get(i)); });
      const p = (a, X) => a.length ? a.filter(m => m <= -X).length / a.length : null;
      return [k, { yes: y.length, no: n.length, y5: p(y, 0.05), n5: p(n, 0.05), y10: p(y, 0.10), n10: p(n, 0.10) }]; }));
    const pred = { n: fwd.length, all: pcell(fwd), old: pcell(fwd.filter(i => mk.d[i] < thisYear)) };
    // 當出場訊號：第 S 天以後，第一次在 20 日新高日出現就賣
    const rules = [['spot', '20 日新高，而且外資現貨 10 日合計賣超'], ['dayUpFiDown', '20 日新高，而且當天指數漲、外資期貨淨單減少']].map(([k, name]) => {
      const f = TOP_CONDS.find(c => c[0] === k)[2];
      return { k, name, rows: sig.filter(s => s.done).map(s => { let hit = null;
        for(let t = firstOn(mk.t[s.i] + S); t < mk.n; t++){ const w = pre(t); if(w && is20hi(t) && f(w)){ hit = t; break; } }
        const rel = p => hit == null || p == null ? null : { td: hit - p, px: mk.c[hit] / mk.c[p] - 1 };
        return { date: s.date, hit, day: hit == null ? null : mk.days(s.i, hit), ret: hit == null ? null : mk.c[hit] / s.close - 1,
          vs5: rel(s.drops[0].peak), vs10: rel(s.drops[1].peak), dd40: hit == null ? null : minAhead(hit, 40), dd40done: hit != null && hit + 40 <= last }; }) }; });
    return { S, sig, tops, conds: TOP_CONDS.map(([k, name]) => ({ k, name })), n: { post: tops.length, z10: z10.length, ctrl: ctrl.length },
      rates: { post: rate(tops.map(t => t.P)), z10: rate(z10), ctrl: rate(ctrl) }, pred, thisYear, rules };
  }

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
      // 研究頁（kind 'study'）：只留訊號日，內容在下面另外算
      if(sig.kind === 'study') return { id: sig.id, name: sig.name, label: sig.label, desc: sig.desc || '', kind: sig.kind, lab: sig.lab,
        raw: det.raw, count: det.kept.length, removed: [], idxs: det.kept, events: [], excess: [], holds: [], regimeHolds: [] };
      // BP紅燈（與照它的模式算的訊號，turn: true）：先算「第一次穩定 100%」的天數，持有週期與穩健性檢查都加入這一天和 120 天（天數會隨資料浮動）
      const turn = sig.turn ? turnPositive(mk, det.kept, 60) : null;
      const S = turn && turn.stable;
      const uniq = a => [...new Set(a.filter(Boolean))].sort((x, y) => x - y);
      const holds = turn ? uniq([...HOLD_DAYS, S, 120]) : sig.pct ? uniq([...HOLD_DAYS, 120]) : HOLD_DAYS;
      const regimeHolds = turn ? uniq([...REGIME_HOLDS, S, 120]) : sig.pct ? uniq([...REGIME_HOLDS, 120]) : REGIME_HOLDS;
      const res = analyze(mk, det.kept, base, holds, regimeHolds);
      // 走勢（中途有沒有拉回）：觀察期 60／90／120 天（頁面可切換）
      const paths = turn ? Object.fromEntries([60, 90, 120].map(H => [H, H === 60 ? turn : turnPositive(mk, det.kept, H)])) : null;
      // 出場方式比較：觀察期 120／180／250／365 天各算一次（頁面可切換）
      const exits = turn ? Object.fromEntries([120, 180, 250, 365].map(C => [C, exitRules(mk, det.kept, S, C)])) : null;
      const flatCmp = turn ? flatCompare(mk, det.kept, uniq([S, 60, 120]), 30) : null;
      // BC 系列：高檔觀測；黃燈另外附「BC÷SC 前 10%」當參考（排除大盤上漲讓 BC 金額變大的影響）
      const extra = sig.id === 'bcy' ? [{ key: 'ratio', name: '參考：BC÷SC 前 10%（首日）', idxs: pctDetect(mk, r => r.bc != null && r.sc > 0 ? r.bc / r.sc : null, 0.10).kept }] : [];
      const hw = sig.kind === 'high' ? Object.assign(highWatch(mk, det.lit, det.kept, base, extra), { lastVal: det.lastVal, lastThr: det.lastThr }) : null;
      // 研發處「BP過熱紫燈連續 5 天」：中斷容許 0／3／5 天、從首日或第 5 個亮燈日進場的比較
      const streak = sig.streak ? streakStudy(mk, det.lit, sig.streak.K, sig.streak.gap, sig.streak.gaps, base, S) : null;
      return { id: sig.id, name: sig.name, label: sig.label, desc: sig.desc || '', raw: det.raw, count: det.kept.length, removed: det.removed, idxs: det.kept,
        holds, regimeHolds, turn, paths, exits, flatCmp, hw, streak, lab: sig.lab, kind: sig.kind, col: sig.col, pct: sig.pct, ...res };
    });
    // 研發處「BP紅燈之後的起跌點」：用 BP紅燈的訊號日與「第一次穩定 100%」的天數 S（資料太少、算不出 S 時不算）
    const red = signals.find(s => s.id === 'bp');
    signals.forEach(s => { if(s.kind !== 'study') return;
      s.study = red && red.turn && red.turn.stable ? topStudy(mk, red.idxs, red.turn.stable) : null;
      if(s.study) s.label = `${s.name}（第 ${s.study.S} 天以後第一次跌 5%／10%）`; });
    return { mk, signals, first: mk.d[0], last: mk.d[mk.n-1], days: mk.n };
  }

  return { run, SIGNALS, HOLD_DAYS, COOLDOWN, holdOutcome, turnPositive, exitRules, flatCompare, highWatch, streaks, streakStudy, topStudy };
})();
