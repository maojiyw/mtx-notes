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
  const CACHE_KEY = 'mtx-sheet-v2', CACHE_MS = 10*60*1000;

  // 欄名（去掉空白後比對：先完全相同，再比對結尾）
  const MAIN = {
    settle:'結算日', idx:'加權指數', chg:'加權指數漲跌', pct:'加權指數漲跌幅(%)', vol:'加權指數成交量(億)',
    fiSpot:'外資現貨買賣超', fiOI:'外資(大小台)期貨未平倉', fiRel:'外資期貨未平倉與結算比', fiDelta:'外資期貨未平倉與前日增減',
    rtLong:'散戶看多', rtShort:'散戶看空', rtLongPct:'多單持倉占比百分位', rtShortPct:'空單持倉占比百分位',
    mxLong:'微台看多', mxShort:'微台看空',
    sigSPQty:'外資SP口數', sigSPAmt:'金額', sigMicro:'微台', sigBoth:'小+微', sigAmp:'幅度', sigStrong:'強烈落底', sig3:'連續三天期貨逆增'
  };
  const OPT = { bc:'外資BC金額', sc:'外資SC金額', bp:'外資BP金額', sp:'外資SP金額', bcsc:'外資BC/SC增幅比例', bpsp:'外資BP/SP增幅比例' };
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

  function build(mainCSV, optCSV){
    const A=parseCSV(mainCSV), B=parseCSV(optCSV);
    const ca=colMap(A[0],MAIN), cb=colMap(B[0],OPT);
    const opt=new Map();
    for(const r of B.slice(1)){ const d=date(r[0]); if(!d) continue; const o={}; for(const k in cb) o[k]=cb[k]<0?null:num(r[cb[k]]); opt.set(d,o); }
    const rows=[];
    for(const r of A.slice(1)){ const d=date(r[0]); if(!d) continue;
      const o={date:d};
      for(const k in ca){ const i=ca[k]; o[k]= i<0?null : FLAGS.includes(k)?flag(r[i]) : num(r[i]); }
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

  let pending=null;
  function load(){
    if(pending) return pending;
    try{ const c=JSON.parse(sessionStorage.getItem(CACHE_KEY)||'null'); if(c&&Date.now()-c.fetchedAt<CACHE_MS) return pending=Promise.resolve(c); }catch(e){}
    pending = Promise.all([fetch(url('工作表1')), fetch(url('Sheet1'))])
      .then(rs=>{ rs.forEach(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); }); return Promise.all(rs.map(r=>r.text())); })
      .then(([a,b])=>{ if(/^\s*</.test(a)) throw new Error('試算表無法公開讀取'); const d=build(a,b); if(!d.rows.length) throw new Error('沒有讀到資料');
        try{ sessionStorage.setItem(CACHE_KEY, JSON.stringify(d)); }catch(e){}
        return d; })
      .catch(e=>{ pending=null; throw e; });
    return pending;
  }

  /* 給籌碼小圖用：轉成和 data.js 的 chips 相同的格式 */
  function asChips(d){
    const R=d.rows;
    return { dates:R.map(r=>r.date), fiOI:R.map(r=>r.fiRel), fiBP:R.map(r=>r.bp??null), rtLong:R.map(r=>r.rtLong), rtPct:R.map(r=>r.rtLongPct) };
  }
  return { load, asChips, sheetUrl:`https://docs.google.com/spreadsheets/d/${ID}/edit` };
})();
