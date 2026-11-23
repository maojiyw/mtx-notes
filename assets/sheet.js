/* =====================================================================
   每日籌碼資料：直接讀取 Google 試算表（需「知道連結的人可檢視」）
   - 工作表1：大盤、外資期貨、散戶、落底訊號
   - Sheet1 ：外資選擇權 BC / SC / BP / SP 金額
   欄位以「欄名」對應，新增欄位不影響；改名或刪除欄位會讀不到該項。
   ===================================================================== */
window.MTXSheet = (function(){
  'use strict';
  const ID = '1J-vhV9ahpiZejIJ0pz565KBiptDfxJX3';
  const url = sheet => `https://docs.google.com/spreadsheets/d/${ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;
  const CACHE_KEY = 'mtx-sheet-v5', CACHE_MS = 10*60*1000;

  // 欄名（去掉空白後比對：先完全相同，再比對結尾）
  const MAIN = {
    settle:'結算日', idx:'加權指數', chg:'加權指數漲跌', pct:'加權指數漲跌幅(%)', vol:'加權指數成交量(億)',
    fiSpot:'外資現貨買賣超', fiOI:'外資(大小台)期貨未平倉', fiRel:'外資期貨未平倉與結算比', fiDelta:'外資期貨未平倉與前日增減',
    rtLong:'散戶看多', rtShort:'散戶看空', rtLongPct:'多單持倉占比百分位', rtShortPct:'空單持倉占比百分位',
    mxLong:'微台看多', mxShort:'微台看空',
    sigSPQty:'外資SP口數', sigSPAmt:'金額', sigMicro:'微台', sigBoth:'小+微', sigAmp:'幅度', sigStrong:'強烈落底', sig3:'連續三天期貨逆增',
    note:'每日短評'
  };
  const TEXT = ['note'];   // 文字欄，不轉數字
  // 單位備註：選擇權金額欄為千元（換億 ÷1e5）；「融資金額(仟元)」欄名有誤，數值其實是億
  const OPT = { bc:'外資BC金額', sc:'外資SC金額', bp:'外資BP金額', sp:'外資SP金額', bcsc:'外資BC/SC增幅比例', bpsp:'外資BP/SP增幅比例',
    bpQty:'外資BP口數', spQty:'外資SP口數' };
  const FLAGS = ['sigSPQty','sigSPAmt','sigMicro','sigBoth','sigAmp','sigStrong','sig3'];

  function parseCSV(t){
    const rows=[]; let row=[], f='', q=false;
    for(let i=0;i<t.length;i++){ const c=t[i];
      if(q){ if(c==='"'){ if(t[i+1]==='"'){ f+='"'; i++; } else q=false; } else f+=c; }
      else if(c==='"') q=true;
      else if(c===','){ row.push(f); f=''; }
      else if(c==='\n'){ row.push(f.replace(/\r$/,'')); rows.push(row); row=[]; f=''; }
      else f+=c;
    }
    if(f||row.length){ row.push(f); rows.push(row); }
    return rows;
  }
  const norm = s => String(s||'').replace(/\s+/g,'');
  function colMap(header, spec){
    const H=header.map(norm), out={};
    for(const [k,name] of Object.entries(spec)){
      const n=norm(name); let i=H.indexOf(n);
      if(i<0) i=H.findIndex(h=>h.endsWith(n));
      out[k]=i;
    }
    return out;
  }
  const num = v => { if(v==null) return null; const s=String(v).replace(/[\s,]/g,''); if(s===''||s==='-') return null;
    const p=s.endsWith('%'); const n=parseFloat(p?s.slice(0,-1):s); return isFinite(n)?n:null; };
  const date = v => { const m=String(v||'').trim().match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/); return m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:null; };
  const flag = v => { const s=String(v||'').trim(); return s==='' ? null : s; };

  /* 落底訊號（網站自行計算）：只在當日收跌時判斷，與前一個交易日比較
     共同兩項：1. 外資期貨未平倉較前日增加 → 期貨逆增
               2. SP 增幅（今日－前日）大於 BP 增幅，且 BP 也增加：口數、金額分別比較 → SP（口數／金額）、SP（口數）或 SP（金額）
     第一組（微台，AO／AP 欄）：微台多單減少、微台加空
     第二組（小+微，AS／AT 欄「散戶看多／看空」）：小+微多單減少、小+微加空
     每組回傳 {n: 滿足項數, items: [顯示文字]}；四項全滿足＝強烈落底 */
  function dropSignals(r,p){
    if(!p||r.chg==null||r.chg>=0) return null;
    const up=(a,b)=>a!=null&&b!=null&&a>b, inc=k=>r[k]!=null&&p[k]!=null?r[k]-p[k]:null;
    const common=[];
    if(up(r.fiOI,p.fiOI)) common.push('期貨逆增');
    // 「增幅」＝兩者都較前日增加：SP 增幅 > BP 增幅 > 0（與試算表 AZ／BA 欄 2019 年以來逐日一致）
    const spUp=(s,b)=>{ const ds=inc(s), db=inc(b); return ds!=null&&db!=null&&db>0&&ds>db; };
    const q=spUp('spQty','bpQty'), a=spUp('sp','bp');
    if(q||a) common.push(q&&a?'SP（口數／金額）':q?'SP（口數）':'SP（金額）');
    const grp=(lk,sk,name)=>{ const items=common.slice();
      if(up(p[lk],r[lk])) items.push(name+'多單減少');
      if(up(r[sk],p[sk])) items.push(name+'加空');
      return {n:items.length, items}; };
    return [grp('mxLong','mxShort','微台'), grp('rtLong','rtShort','小+微')];
  }

  function build(mainCSV, optCSV){
    const A=parseCSV(mainCSV), B=parseCSV(optCSV);
    const ca=colMap(A[0],MAIN), cb=colMap(B[0],OPT);
    const opt=new Map();
    for(const r of B.slice(1)){ const d=date(r[0]); if(!d) continue; const o={}; for(const k in cb) o[k]=cb[k]<0?null:num(r[cb[k]]); opt.set(d,o); }
    const rows=[];
    for(const r of A.slice(1)){ const d=date(r[0]); if(!d) continue;
      const o={date:d};
      for(const k in ca){ const i=ca[k]; o[k]= i<0?null : FLAGS.includes(k)||TEXT.includes(k)?flag(r[i]) : num(r[i]); }
      if(o.idx==null) continue;
      Object.assign(o, opt.get(d)||{});
      rows.push(o);
    }
    // 資料檢查：日期重複、沒有排序、2019 年後的週末日期（2012～2018 的週六是補班日，不算錯）
    const warnings=[];
    for(let i=1;i<rows.length;i++){
      if(rows[i].date===rows[i-1].date) warnings.push(`日期重複：${rows[i].date}`);
      else if(rows[i].date<rows[i-1].date) warnings.push(`日期沒有排序：${rows[i-1].date} 之後是 ${rows[i].date}`);
    }
    rows.sort((a,b)=>a.date<b.date?-1:1);
    rows.forEach(r=>{ const wd=new Date(r.date+'T00:00:00Z').getUTCDay(); if(r.date>='2019-01-01'&&(wd===0||wd===6)) warnings.push(`週末日期（可能打錯）：${r.date}`); });
    // Sheet1 的外資 BP 金額序列（BP 紅燈逐日排名用，只取有數值的日子）
    const bpSeries=[...opt.entries()].filter(([,o])=>o.bp!=null).map(([date,o])=>({date,bp:o.bp})).sort((a,b)=>a.date<b.date?-1:1);
    const missing=[...Object.entries(ca),...Object.entries(cb)].filter(([,i])=>i<0).map(([k])=>MAIN[k]||OPT[k]);
    return {rows, bpSeries, warnings, missing, fetchedAt:Date.now()};
  }

  // 落底訊號在讀取後才計算（不存進快取），改規則不會被舊快取卡住
  const withSignals = d => { d.rows.forEach((r,i)=>{ const g=dropSignals(r,d.rows[i-1]); r.g1=g&&g[0]; r.g2=g&&g[1]; }); return d; };
  let pending=null;
  function load(){
    if(pending) return pending;
    try{ const c=JSON.parse(sessionStorage.getItem(CACHE_KEY)||'null'); if(c&&Date.now()-c.fetchedAt<CACHE_MS) return pending=Promise.resolve(withSignals(c)); }catch(e){}
    pending = Promise.all([fetch(url('工作表1')), fetch(url('Sheet1'))])
      .then(rs=>{ rs.forEach(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); }); return Promise.all(rs.map(r=>r.text())); })
      .then(([a,b])=>{ if(/^\s*</.test(a)) throw new Error('試算表無法公開讀取'); const d=build(a,b); if(!d.rows.length) throw new Error('沒有讀到資料');
        try{ sessionStorage.setItem(CACHE_KEY, JSON.stringify(d)); }catch(e){}
        return withSignals(d); })
      .catch(e=>{ pending=null; throw e; });
    return pending;
  }

  /* 給籌碼小圖用：轉成和 data.js 的 chips 相同的格式 */
  function asChips(d){
    const R=d.rows, T=bpRedLine(d.bpSeries||[]); let j=-1;
    // 每列日期對應當天以前最近一筆的紅燈門檻
    const thr=R.map(r=>{ while(j+1<T.length&&T[j+1].date<=r.date) j++; return j<0?null:T[j].thr; });
    // 散戶多單＝微台（AO 欄）；持倉百分位（試算表「多單／空單持倉占比百分位」）也是微台
    return { dates:R.map(r=>r.date), fiOI:R.map(r=>r.fiRel), fiBP:R.map(r=>r.bp??null), fiBPThr:thr, rtLong:R.map(r=>r.mxLong), rtPct:R.map(r=>r.rtLongPct), micro:true };
  }
  /* BP紅燈（歷史前 2%）逐日門檻：當天以前（含當天）所有 BP 由大到小第 k 大，k＝max(1, floor(筆數×2%))；與 backtest.js 相同
     回傳 [{date, bp, thr}]，依日期排序 */
  function bpRedLine(S){
    const sorted=[];
    return S.map((s,t)=>{
      const v=s.bp; let a=0,b=sorted.length; while(a<b){ const m=(a+b)>>1; if(sorted[m]>v) a=m+1; else b=m; } sorted.splice(a,0,v);
      return {date:s.date, bp:v, thr:sorted[Math.max(1,Math.floor((t+1)*0.02))-1]};
    });
  }
  /* BP紅燈亮燈首日：BP ≥ 當天門檻（2012 起），距離上一個亮燈日滿 10 個交易日才算新的一次；與 backtest.js 相同 */
  function bpRedDays(S){
    const out=[]; let last=-1e9;
    bpRedLine(S).forEach((x,t)=>{ if(x.date<'2012-01-01'||x.bp<x.thr) return; if(t-last>=10) out.push(x.date); last=t; });
    return out;
  }
  return { load, asChips, bpRedLine, bpRedDays, sheetUrl:`https://docs.google.com/spreadsheets/d/${ID}/edit` };
})();
