/* MTX 復盤筆記 — 頁面渲染（主頁與每週復盤共用） */
(function(){
'use strict';
const D = window.MTX;
const UP='#EF4444', DN='#10B981';
const $ = s => document.querySelector(s);
const fmt = (n,d=2) => Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const cls = v => v>0?'up':v<0?'down':'flat';
const sign = v => v>0?'+':'';
const md = s => s.slice(5).replace('-','/');
const WD = ['日','一','二','三','四','五','六'];
const weekday = s => '週'+WD[new Date(s+'T00:00:00Z').getUTCDay()];
const dayNumOf = s => Date.UTC(+s.slice(0,4),+s.slice(5,7)-1,+s.slice(8,10))/864e5;   // 日期 → 日曆天序號（天數一律用日曆天相減）

const page = document.body.dataset.page;
const base = page==='review' ? '../' : '';
const reviewUrl = r => `${base}reviews/${r.id}.html`;
const pdfUrl = r => base + 'notes-pdf/' + encodeURIComponent(r.pdf);

// daily with change
const DAILY = D.daily.map(([t,c],i,a)=>{ const p=i?a[i-1][1]:null; return {time:t,value:c,chg:p==null?null:c-p,pct:p==null?null:(c-p)/p*100}; });
const dayOf = t => DAILY.find(d=>d.time===t);

/* ---------- nav ---------- */
function nav(activeId){
  const onChips = activeId==='chips', onTopics = activeId==='topics', onSignals = activeId==='signals';
  $('#nav').innerHTML = `<div class="nav-in"><a class="brand" href="${base}index.html"><div class="brand-logo">MTX</div><span>復盤筆記</span></a>
    <nav class="nav-tabs">
      <a href="${base}index.html#list" class="tab-review${onChips||onTopics||onSignals?'':' on'}"><i class="ico">▤</i>每週復盤<span class="cnt">${D.reviews.length}</span></a>
      <a href="${base}chips.html" class="tab-chips${onChips?' on':''}"><i class="live"></i>每日籌碼</a>
      <a href="${base}signals.html" class="tab-signals${onSignals?' on':''}" aria-label="訊號回測"><i class="ico">◎</i><span class="lbl">訊號回測</span></a>
      <a href="${base}topics.html" class="tab-search${onTopics?' on':''}" aria-label="搜尋與主題"><i class="ico">⌕</i><span class="lbl">搜尋</span></a>
    </nav></div>`;
  liveTicker();
}

/* ---------- 即時大盤指數（導覽列）----------
   LIVE_URL：Cloudflare Worker 網址（worker/taiex.js），盤中約 5 秒級報價。
   留空或讀取失敗時，改用證交所盤後「價格指數」的最新收盤。 */
const LIVE_URL = 'https://mtx-notes-taiex.maoji-yw.workers.dev/';
const TWSE_CLOSE = 'https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?response=json&type=IND';
function tpeNow(){ const d=new Date(Date.now()+8*3600e3); return {day:d.getUTCDay(), hm:d.getUTCHours()*100+d.getUTCMinutes(), ymd:d.toISOString().slice(0,10).replace(/-/g,'')}; }
const inSession = () => { const t=tpeNow(); return t.day>=1&&t.day<=5&&t.hm>=845&&t.hm<=1335; };
async function quoteLive(){
  const r=await fetch(LIVE_URL,{cache:'no-store'}); if(!r.ok) throw new Error(r.status);
  const j=await r.json(); if(j.price==null&&j.prev==null) throw new Error('empty');
  const px=j.price!=null?j.price:j.prev, closed=j.date!==tpeNow().ymd||j.time>='13:30';
  return {px, chg:px-j.prev, pct:(px-j.prev)/j.prev*100, date:j.date, time:j.time, live:!closed};
}
async function quoteClose(){
  const K='mtx-taiex-close';
  try{ const c=JSON.parse(sessionStorage.getItem(K)); if(c&&Date.now()-c.at<10*60e3) return c.q; }catch(e){}
  const j=await (await fetch(TWSE_CLOSE)).json();
  let row; (j.tables||[]).some(t=>(row=(t.data||[]).find(r=>r[0]==='發行量加權股價指數')));
  if(!row) throw new Error('no row');
  const num=s=>parseFloat(String(s).replace(/,/g,'')), down=/-/.test(row[2].replace(/<[^>]*>/g,''));
  const q={px:num(row[1]), chg:(down?-1:1)*num(row[3]), pct:num(row[4]), date:j.date, time:'13:30', live:false};
  try{ sessionStorage.setItem(K,JSON.stringify({at:Date.now(),q})); }catch(e){}
  return q;
}
let tickTimer=null;
function liveTicker(){
  const inner=$('#nav .nav-in'); if(!inner) return;
  let el=$('#tick'); if(!el){ el=document.createElement('div'); el.id='tick'; el.className='tick'; inner.insertBefore(el,inner.querySelector('.nav-tabs')); }
  const draw=q=>{
    const c=cls(q.chg), dt=`${q.date.slice(4,6)}/${q.date.slice(6,8)}`;
    el.innerHTML=`<span class="tk-l">加權</span><b class="num ${c}">${fmt(q.px,2)}</b><span class="num ${c}">${sign(q.chg)}${fmt(q.chg,2)}（${sign(q.pct)}${q.pct.toFixed(2)}%）</span>`+
      `<em class="${q.live?'on':''}">${q.live?`<i class="live"></i>盤中 ${q.time.slice(0,5)}`:`收盤 ${dt}`}</em>`;
    el.title=q.live?'證交所即時報價（約 5 秒延遲），盤中每 15 秒更新':`證交所 ${dt} 收盤`;
  };
  const tick=async()=>{
    clearTimeout(tickTimer);
    let q=null;
    if(LIVE_URL){ try{ q=await quoteLive(); }catch(e){} }
    if(!q){ try{ q=await quoteClose(); }catch(e){} }
    if(q) draw(q); else if(!el.innerHTML) el.remove();
    tickTimer=setTimeout(tick, LIVE_URL&&inSession()?15e3:5*60e3);
  };
  if(!liveTicker.bound){ liveTicker.bound=true; document.addEventListener('visibilitychange',()=>{ if(document.hidden) clearTimeout(tickTimer); else tick(); }); }
  tick();
}

/* ---------- charts ---------- */
function baseChart(el,extra){
  return LightweightCharts.createChart(el,Object.assign({
    autoSize:true,
    layout:{background:{type:'solid',color:'#151A23'},textColor:'#8A94A7',fontSize:11,fontFamily:"'JetBrains Mono',monospace"},
    grid:{vertLines:{visible:false},horzLines:{color:'rgba(35,43,58,.6)'}},
    rightPriceScale:{borderColor:'#232B3A'},
    timeScale:{borderColor:'#232B3A',fixLeftEdge:true,fixRightEdge:true,minBarSpacing:0.05},
    crosshair:{mode:LightweightCharts.CrosshairMode.Magnet,vertLine:{color:'#5D677B',labelBackgroundColor:'#2E3850'},horzLine:{color:'#5D677B',labelBackgroundColor:'#2E3850'}},
    // 全站圖表：滑鼠滾輪放大縮小、按住拖曳左右移動；手機兩指縮放、左右滑動（上下滑仍捲動頁面）
    handleScroll:{mouseWheel:false,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
    handleScale:{mouseWheel:true,pinch:true,axisPressedMouseMove:{time:true,price:false},axisDoubleClickReset:false},
    localization:{locale:'zh-TW'}
  },extra||{}));
}
/* 多張圖共用時間軸：任一張被縮放或拖曳，其他張跟著同步；onChange 收到目前顯示的起訖日期 */
const timeStr = t => typeof t==='string'?t:(t&&t.year?`${t.year}-${String(t.month).padStart(2,'0')}-${String(t.day).padStart(2,'0')}`:null);
function syncCharts(charts,onChange){
  let lastKey='', lastAt=0, active=null, t=0;
  const apply=(from,to,except)=>{ lastKey=from+'|'+to; lastAt=Date.now(); charts.forEach(c=>{ if(c!==except) try{ c.timeScale().setVisibleRange({from,to}); }catch(e){} }); };
  // 記住使用者正在操作哪一張圖，其他張被同步時發出的變動不再往回傳（避免來回震盪）
  charts.forEach(c=>{ const el=c.chartElement&&c.chartElement(); if(el) ['pointerdown','wheel','touchstart'].forEach(ev=>el.addEventListener(ev,()=>{ active=c; },{passive:true})); });
  charts.forEach(src=>src.timeScale().subscribeVisibleTimeRangeChange(r=>{
    if(!r) return; const from=timeStr(r.from), to=timeStr(r.to), key=from+'|'+to;
    if(key===lastKey) return;
    // 只有使用者正在操作的那張圖會帶動其他圖；程式設定或資料較短的圖回報的範圍不往回傳
    if(src!==active) return;
    apply(from,to,src);
    if(onChange){ clearTimeout(t); t=setTimeout(()=>onChange(from,to),250); }
  }));
  return { set:(from,to)=>{ active=null; apply(from,to,null); } };   // 按鈕或日期欄位設定的區間：不算使用者在圖上操作
}
function indexChart(el,legendEl,{markers=[],highlight=null,clickable=false}={}){
  if(!window.LightweightCharts){ el.innerHTML='<p style="padding:20px;color:#8A94A7">圖表載入失敗（需要網路連線）</p>'; return; }
  const ch=baseChart(el);
  const s=ch.addAreaSeries({lineColor:'#60A5FA',topColor:'rgba(96,165,250,.25)',bottomColor:'rgba(96,165,250,.02)',lineWidth:2,priceFormat:{type:'price',precision:0,minMove:1}});
  s.setData(DAILY.map(d=>({time:d.time,value:d.value})));
  if(highlight){
    const hs=ch.addLineSeries({color:'#F59E0B',lineWidth:3,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
    const i0=DAILY.findIndex(d=>d.time>=highlight[0]); const i1=DAILY.map(d=>d.time<=highlight[1]).lastIndexOf(true);
    hs.setData(DAILY.slice(Math.max(0,i0-1),i1+1).map(d=>({time:d.time,value:d.value})));
  }
  s.setMarkers(markers.slice().sort((a,b)=>a.time<b.time?-1:1));
  s.createPriceLine({price:D.campaign.high.value,color:'#5D677B',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:'前高'});
  ch.timeScale().fitContent();
  const show = d => { if(!d){ d=DAILY[DAILY.length-1]; }
    legendEl.innerHTML = `<b>${d.time.replace(/-/g,'/')}</b> 加權指數 <b class="num">${fmt(d.value)}</b>` + (d.chg==null?'':` <span class="num ${cls(d.chg)}">${sign(d.chg)}${fmt(d.chg)} (${sign(d.pct)}${d.pct.toFixed(2)}%)</span>`); };
  show(); ch.subscribeCrosshairMove(p=>show(p&&p.time?dayOf(p.time):null));
  if(clickable) ch.subscribeClick(p=>{ if(!p||!p.time) return; const r=D.reviews.find(r=>r.date===p.time); if(r) location.href=reviewUrl(r); });
  return ch;
}
function chipCharts(ids,C,{end=null,days=90}={}){
  if(!window.LightweightCharts) return;
  let idx=C.dates.map((d,i)=>i).filter(i=>!end||C.dates[i]<=end);
  if(idx.length){ const t1=dayNumOf(C.dates[idx[idx.length-1]]); idx=idx.filter(i=>dayNumOf(C.dates[i])>t1-days); }   // 近 N 個日曆天
  const pick=(arr)=>idx.map(i=>({time:C.dates[i],v:arr[i]})).filter(x=>x.v!=null);
  const empty=(id,arr)=>{ if(pick(arr).length) return false; $(id).innerHTML='<p class="mini-empty">此期間沒有這項籌碼資料</p>'; return true; };
  ids.forEach(id=>$(id).innerHTML='');
  if(!empty(ids[0],C.fiOI)){
    const c1=baseChart($(ids[0])); const h1=c1.addHistogramSeries({priceFormat:{type:'volume'}});
    h1.setData(pick(C.fiOI).map(x=>({time:x.time,value:x.v,color:x.v>=0?UP:(x.v<=-10000?DN:'rgba(16,185,129,.5)')})));
    h1.createPriceLine({price:-20000,color:'#F59E0B',lineStyle:2,lineWidth:1,title:'−2萬'}); c1.timeScale().fitContent();
  }
  if(!empty(ids[1],C.fiBP)){
    const c2=baseChart($(ids[1])); const h2=c2.addHistogramSeries({priceFormat:{type:'volume'}});
    h2.setData(pick(C.fiBP).map(x=>({time:x.time,value:x.v,color:x.v>=2500000?'#A855F7':x.v>=2000000?'rgba(168,85,247,.6)':'rgba(96,165,250,.5)'})));
    // BP紅燈門檻：試算表資料用逐日滾動門檻（歷史前 2%）；退回筆記數字時用筆記的 3.64 億
    if(C.fiBPThr){ const l2=c2.addLineSeries({color:UP,lineStyle:2,lineWidth:1,title:'BP紅燈',priceLineVisible:false,crosshairMarkerVisible:false,priceFormat:{type:'volume'}});
      l2.setData(pick(C.fiBPThr).map(x=>({time:x.time,value:x.v}))); }
    else h2.createPriceLine({price:3640000,color:UP,lineStyle:2,lineWidth:1,title:'BP紅燈'});
    c2.timeScale().fitContent();
  }
  if(!empty(ids[2],C.rtLong)){
    const c3=baseChart($(ids[2]),{leftPriceScale:{visible:true,borderColor:'#232B3A'}});
    const h3=c3.addHistogramSeries({priceScaleId:'left',priceFormat:{type:'volume'},color:'rgba(239,68,68,.35)'});
    h3.setData(pick(C.rtLong).map(x=>({time:x.time,value:x.v})));
    const l3=c3.addLineSeries({color:'#F59E0B',lineWidth:2,priceFormat:{type:'custom',formatter:v=>v.toFixed(0)+'%'}});
    l3.setData(pick(C.rtPct).map(x=>({time:x.time,value:x.v}))); c3.timeScale().fitContent();
  }
}
/* 籌碼小圖：優先讀 Google 試算表，失敗時退回 data.js 裡筆記截圖判讀的數字 */
function withChips(ids,opts,noteEl){
  ids.forEach(id=>$(id).innerHTML='<p class="mini-empty">讀取試算表中…</p>');
  const S=window.MTXSheet;
  const go=(C,live)=>{ chipCharts(ids,C,opts); if(noteEl) noteEl.textContent = live?'資料來源：每日籌碼試算表（即時讀取）':'試算表讀取失敗，改用筆記截圖判讀的數字'; };
  if(!S) return go(D.chips,false);
  S.load().then(d=>go(S.asChips(d),true)).catch(()=>go(D.chips,false));
}
const chipCardsHTML = (p) => `
  <div class="grid3">
    <div class="card"><div class="card-h"><span>外資期貨未平倉</span> <span class="sub">口・相對結算日</span></div><div class="mini" id="${p}1"></div></div>
    <div class="card"><div class="card-h"><span>外資 BP 金額</span> <span class="sub">千元・紫＝過熱</span></div><div class="mini" id="${p}2"></div></div>
    <div class="card"><div class="card-h"><span>散戶多單</span> <span class="sub">柱＝口數・線＝持倉比</span></div><div class="mini" id="${p}3"></div></div>
  </div>`;

/* ---------- tables ---------- */
function tableHTML(key){
  const t=D.tables[key]; if(!t) return '';
  const al=i=>t.align&&t.align[i]==='r'?' class="r"':'';
  return `<div class="tbl"><div class="tbl-h">${t.title}</div><div class="tscroll"><table class="t"><thead><tr>${t.cols.map((c,i)=>`<th${al(i)}>${c}</th>`).join('')}</tr></thead>
    <tbody>${t.rows.map((r,ri)=>`<tr${t.hl===ri?' class="hl"':''}>${r.map((c,i)=>`<td${al(i)}${i?' class="num"':''}>${c}</td>`).join('').replace(/class="r" class="num"/g,'class="r num"')}</tr>`).join('')}</tbody></table></div>${t.note?`<div class="tbl-n">${t.note}</div>`:''}</div>`;
}
const pointsHTML = items => `<ul class="points">${items.map(x=>typeof x==='string'?`<li>${x}</li>`:`<li class="key">${x.t}</li>`).join('')}</ul>`;

/* =====================================================================
   主頁
   ===================================================================== */
function dailyCard(el){
  const S=window.MTXSheet; if(!S) return;
  const head=el.querySelector('.feat-tag').outerHTML;
  S.load().then(d=>{
    const R=d.rows, L=R[R.length-1], sigs=sigList(L);
    const lastStrong=[...R].reverse().find(r=>sigOn(r.sigStrong));
    const cell=(k,v,sub,c='')=>`<div><span>${k}</span><b class="num ${c}">${v}</b>${sub?`<em>${sub}</em>`:''}</div>`;
    el.innerHTML = head + `
      <div class="eyebrow">資料更新至 ${L.date.replace(/-/g,'/')}（${weekday(L.date)}）</div>
      <div class="hero-price"><span class="px num ${cls(L.chg)}">${n2(L.idx)}</span><span class="ch num ${cls(L.chg)}">${sign(L.chg)}${n2(L.chg)}（${sign(L.pct)}${L.pct==null?'—':L.pct.toFixed(2)}%）</span><span class="badge">加權指數收盤</span></div>
      <div class="dgrid">
        ${cell('外資期貨（相對結算）',n0(L.fiRel)+' 口','前日 '+(L.fiDelta==null?'—':sign(L.fiDelta)+fmt(L.fiDelta,0)),cls(L.fiRel))}
        ${cell('外資現貨',sign(L.fiSpot)+n2(L.fiSpot)+' 億','',cls(L.fiSpot))}
        ${cell('外資 BP 金額',n0(L.bp),'BC '+n0(L.bc)+'・SC '+n0(L.sc))}
        ${cell('散戶多單／空單',n0(L.rtLong)+'／'+n0(L.rtShort),'多單百分位 '+pctTxt(L.rtLongPct))}
      </div>
      <div class="sigs"><span class="sigs-h">今日訊號</span>${sigs.length?sigs.map(t=>`<span class="pill r">${t}</span>`).join(''):'<span class="pill">無落底訊號</span>'}${lastStrong?`<span class="sigs-last">最近強烈落底 <b class="num">${lastStrong.date.replace(/-/g,'/')}</b></span>`:''}</div>
      <div class="ctas"><a class="cta amber" href="chips.html">看每日籌碼 →</a></div>`;
  }).catch(()=>{
    el.innerHTML = head + `<p style="color:var(--muted);margin-top:10px">暫時讀不到籌碼試算表，請稍後再試。</p><div class="ctas"><a class="cta amber" href="chips.html">前往每日籌碼 →</a></div>`;
  });
}
/* 主頁波段 KPI：最新收盤與外資 BP 峰值改用每日籌碼試算表（讀不到時保留 data.js 的數字）
   BP 峰值＝前高日以後的最大 BP；紅燈門檻＝BP紅燈（歷史前 2%）定義，與 backtest.js 相同 */
function campaignLive(lo,peakIntra){
  const S=window.MTXSheet; if(!S) return;
  S.load().then(d=>{
    const L=d.rows[d.rows.length-1], kl=$('#kpiLast');
    if(kl&&L&&L.idx!=null){
      const rec=(L.idx-lo)/(peakIntra-lo)*100;
      const sub=L.idx<lo?`已跌破波段低點 ${((L.idx/lo-1)*100).toFixed(2)}%`:`已收復約 ${rec.toFixed(0)}% 跌幅`;
      kl.innerHTML=`<span>最新收盤（${md(L.date)}）</span><b class="num ${cls(L.chg)}">${fmt(L.idx)}</b><em>${sub}</em>`;
    }
    const B=d.bpSeries||[], kb=$('#kpiBP'); if(!kb||!B.length) return;
    const from=D.campaign.high.date, T=S.bpRedLine(B), thr=T[T.length-1].thr; let peak=null, lit=null;
    T.forEach(s=>{
      if(s.date<from) return;
      if(!peak||s.bp>peak.bp) peak=s;
      if(!lit&&s.bp>=s.thr) lit=s;
    });
    if(!peak) return;
    const yi=v=>(v/1e6).toFixed(2)+' 億';
    kb.innerHTML=`<span>外資 BP 峰值（${md(peak.date)}）</span><b class="num" style="color:#C084FC">${yi(peak.bp)}</b><em>紅燈約 ${yi(thr)}，${lit?md(lit.date)+' 觸發':'未觸發'}</em>`;
  }).catch(()=>{});
}
function renderHome(){
  nav(null);
  const latest=D.reviews[0], last=DAILY[DAILY.length-1];
  const hi=D.campaign.high.value, lo=D.campaign.low.value, peakIntra=lo/(1+D.campaign.drawdown/100);
  const rec=(last.value-lo)/(peakIntra-lo)*100;

  $('#hero').innerHTML = `
    <div class="card hero-main feat feat-review">
      <div class="feat-tag"><i class="ico">▤</i>每週復盤筆記<span>共 ${D.reviews.length} 篇</span></div>
      <div class="eyebrow">最新復盤・${latest.date.replace(/-/g,'/')}</div>
      <h1>${latest.title}</h1>
      <p>${latest.summary}</p>
      <div class="dgrid keys">
        <div><span>復盤週次</span><b class="num">${md(latest.week[0])} – ${md(latest.week[1])}</b></div>
        <div><span>部位</span><b>${latest.position||'—'}</b></div>
      </div>
      <div class="pills hk-pills"><span class="sigs-h">本週重點</span>${latest.pills.map(([c,t])=>`<span class="pill ${c}">${t}</span>`).join('')}</div>
      <div class="ctas"><a class="cta" href="${reviewUrl(latest)}">閱讀本週復盤 →</a><a class="cta ghost" href="#list">所有復盤</a></div>
    </div>
    <div class="card hero-main feat feat-chips" id="daily"><div class="feat-tag"><i class="live"></i>每日籌碼<span>每日更新</span></div><p class="loading">讀取試算表中…</p></div>`;
  dailyCard($('#daily'));
  setTimeout(()=>campaignLive(lo,peakIntra));
  $('#campaign').innerHTML = `<div class="card"><div class="kpis k6">
      <div class="kpi"><span>前高（${md(D.campaign.high.date)} 收盤）</span><b class="num">${fmt(hi)}</b><em>10 月初高檔，散戶 FOMO</em></div>
      <div class="kpi"><span>波段低點（${md(D.campaign.low.date)} 盤中）</span><b class="num down">${fmt(lo)}</b><em>自最高點 ${D.campaign.drawdown}%</em></div>
      <div class="kpi" id="kpiLast"><span>最新收盤（${md(last.time)}）</span><b class="num ${cls(last.chg)}">${fmt(last.value)}</b><em>已收復約 ${rec.toFixed(0)}% 跌幅</em></div>
      <div class="kpi"><span>目前部位</span><b class="num">${latest.position}</b>${latest.positionNote?`<em>${latest.positionNote}</em>`:''}</div>
      <div class="kpi" id="kpiBP"><span>外資 BP 峰值（11/6）</span><b class="num" style="color:#C084FC">3.25 億</b><em>紅燈約 3.64 億，未觸發</em></div>
      <div class="kpi"><span>復盤篇數</span><b class="num">${D.reviews.length} 篇</b><em>${md(D.reviews[D.reviews.length-1].date)} – ${md(latest.date)}</em></div>
    </div></div>`;

  $('#list').innerHTML = D.reviews.map((r,i)=>`
    <a class="card ritem${i===0?' latest':''}" href="${reviewUrl(r)}">
      <div class="d"><b>${r.date.replace(/-/g,'/')}</b><span class="${cls(r.chg)}">${fmt(r.close)}　${sign(r.pct)}${r.pct}%</span></div>
      <div><h3>${r.title}${i===0?'<span class="new">最新</span>':''}</h3><p>${r.summary}</p>
        <div class="pills">${r.pills.map(([c,t])=>`<span class="pill ${c}">${t}</span>`).join('')}</div></div>
      <div class="go">閱讀 →</div>
    </a>`).join('');
  $('#listCount').textContent = `共 ${D.reviews.length} 篇，最新在最上面`;

  const marks = D.campaign.events.concat(D.reviews.map(r=>({time:r.date,position:'aboveBar',color:'#60A5FA',shape:'square',text:md(r.date)+' 復盤'})));
  indexChart($('#chart'),$('#legend'),{markers:marks,clickable:true});

  $('#timeline').innerHTML = D.campaign.timeline.map(x=>`<div class="tl" style="--c:${x.c}"><b>${x.d}</b><em>${x.v}</em><span>${x.t}</span></div>`).join('');
  $('#chips').innerHTML = chipCardsHTML('hc');
  withChips(['#hc1','#hc2','#hc3'],{days:90},$('#chipsNote'));
}

/* =====================================================================
   信用交易（data/margin.json，GitHub Actions 每晚 21:30 更新）
   - 大盤融資維持率（上市扣除 ETF）：玩股網
   - 每日信用交易統計：證交所、櫃買中心；指定 ETF 的融資融券張數
   ===================================================================== */
const sgnN = (v,d=0) => v==null?'—':`${v>0?'+':''}${fmt(v,d)}`;
const chgWord = (v,unit,d=0,kind='資') => v==null?'—':`<span class="${cls(v)}">${kind}${v>0?'增':v<0?'減':'平'} <b class="num">${fmt(Math.abs(v),d)}</b> ${unit}</span>`;
// 連續增減：回傳每一天的連續天數（正＝連增、負＝連減、0＝持平）
function streaks(vals){
  const out=[]; vals.forEach((v,i)=>{ const s=v>0?1:v<0?-1:0, p=i?out[i-1]:0;
    out.push(s===0?0:(Math.sign(p)===s?p+s:s)); }); return out;
}
const streakTxt = s => !s?'':`<span class="streak ${s>0?'up':'down'}">連${Math.abs(s)}${s>0?'增':'減'}</span>`;
// 歷史統計：最長連增、最長連減（含起訖日期）
function streakStats(dates,vals){
  const st=streaks(vals); let up={n:0}, dn={n:0};
  st.forEach((s,i)=>{ if(s>up.n) up={n:s,end:dates[i],start:dates[i-s+1]}; if(-s>dn.n) dn={n:-s,end:dates[i],start:dates[i+s+1]}; });
  return {cur:st[st.length-1]||0, up, dn};
}

const loadMargin = () => fetch(base+'data/margin.json',{cache:'no-cache'}).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); });
// 顯示在每日籌碼頁；回傳 setRange(from,to)，讓每日明細跟著頁面的日期區間
function renderCredit(M,body,noteEl){
  {
    const R=M.ratio||[], C=M.credit||[], E=M.etfs||{};
    const codes=Object.keys(E);
    if(noteEl) noteEl.textContent=`資料更新：${M.updated||'—'}・每個交易日晚上 21:30 自動更新`;

    /* ---- 維持率 ---- */
    const r1=R[R.length-1], r0=R[R.length-2];
    const ratioCard = r1 ? `
      <div class="card"><div class="card-h"><span>大盤融資維持率（上市扣除 ETF）</span><span class="sub">${r1[0].replace(/-/g,'/')}</span></div>
        <div class="dgrid keys cr-k">
          <div><span>融資維持率</span><b class="num ${r1[1]<140?'pend':''}">${r1[1].toFixed(2)}%</b><em>${r0?`前一日 ${r0[1].toFixed(2)}%（${sgnN(+(r1[1]-r0[1]).toFixed(2),2)}）`:''}${r1[1]<130?'・<span class="pend">低於 130% 追繳線</span>':''}</em></div>
          <div><span>融資餘額（扣除 ETF）</span><b class="num">${fmt(r1[2])} 億</b><em>${r0?`較前日 <span class="${cls(r1[2]-r0[2])}">${sgnN(+(r1[2]-r0[2]).toFixed(2),2)} 億</span>`:''}</em></div>
        </div>
        <div class="tabs cr-rng" id="crRange">${[['3M',91],['6M',182],['1Y',365],['全部',0]].map(([t,n])=>`<button data-n="${n}"${n===365?' class="on"':''}>${t}</button>`).join('')}</div>
        <div class="chart cr-chart"><div class="chart-legend num" id="crLg"></div><div id="crChart" style="position:absolute;inset:0"></div></div>
        <div class="chart-note">虛線＝130%（一般追繳線）。資料來源：<a href="https://www.wantgoo.com/stock/margin-trading/exclude-etf/taiex" target="_blank" rel="noopener">玩股網・扣除 ETF 資券進出</a>，維持率由玩股網計算。</div>
      </div>` : `<div class="card"><p class="empty">暫時沒有維持率資料。</p></div>`;

    /* ---- 每日信用交易統計 ---- */
    const c1=C[C.length-1];
    const col=k=>C.map(c=>k(c));
    const etfSeries=code=>col(c=>c.etf&&c.etf[code]?c.etf[code].loanChg:null);
    const etfSt={}; codes.forEach(code=>{ etfSt[code]=streaks(etfSeries(code).map(v=>v||0)); });
    const twSt=streaks(col(c=>c.twse?c.twse.loanChg:0)), tpSt=streaks(col(c=>c.tpex?c.tpex.loanChg:0));
    const L=C.length-1;
    const block=(title,o,st,unitLoan,d)=>o?`<div class="cr-row"><b>${title}</b><span>${chgWord(o.loanChg,unitLoan,d)} ${streakTxt(st)}</span><span>${chgWord(o.shortChg,'張',0,'券')}</span></div>`:'';
    const dayCard = c1 ? `
      <div class="card"><div class="card-h"><span>每日信用交易統計</span><span class="sub">${c1.d.replace(/-/g,'/')}（${weekday(c1.d)}）</span></div>
        <div class="cr-day">
          ${block('上市',c1.twse,twSt[L],'億',2)}
          ${block('上櫃',c1.tpex,tpSt[L],'億',2)}
          ${codes.map(code=>block(`${code} <small>${E[code]}</small>`,c1.etf&&c1.etf[code],etfSt[code][L],'張',0)).join('')}
        </div>
        <div class="chart-note">上市＝證交所全部（含 ETF）融資金額、融券張數；上櫃＝櫃買中心。資增減＝今日餘額－前日餘額。</div>
      </div>` : `<div class="card"><p class="empty">暫時沒有信用交易資料。</p></div>`;

    /* ---- 歷史統計 ---- */
    const dates=col(c=>c.d);
    const statRows=[['上市融資（億）',col(c=>c.twse?c.twse.loanChg:null),2],['上櫃融資（億）',col(c=>c.tpex?c.tpex.loanChg:null),2],
      ...codes.map(code=>[`${code} 融資（張）`,etfSeries(code),0])];
    const sumN=(v,n)=>v.slice(-n).reduce((s,x)=>s+(x||0),0);
    const rng=s=>s.n?`<b class="num">${s.n}</b> 天<em>${s.start.replace(/-/g,"/")}–${s.start.slice(0,4)===s.end.slice(0,4)?md(s.end):s.end.replace(/-/g,"/")}</em>`:'—';
    const statTable = `
      <div class="tbl"><div class="tbl-h">歷史統計（${dates[0].replace(/-/g,'/')} 起，共 ${C.length} 個交易日）</div><div class="tscroll noterm"><table class="t cr-t">
        <thead><tr><th>項目</th><th class="r">目前</th><th class="r">近 5 日合計</th><th class="r">近 20 日合計</th><th class="r">最長連增</th><th class="r">最長連減</th></tr></thead>
        <tbody>${statRows.map(([t,v,d])=>{ const s=streakStats(dates,v.map(x=>x||0)); const a=sumN(v,5), b=sumN(v,20);
          return `<tr><td>${t}</td><td class="r">${streakTxt(s.cur)||'—'}</td><td class="r num ${cls(a)}">${sgnN(+a.toFixed(d),d)}</td><td class="r num ${cls(b)}">${sgnN(+b.toFixed(d),d)}</td><td class="r cr-rng2">${rng(s.up)}</td><td class="r cr-rng2">${rng(s.dn)}</td></tr>`; }).join('')}</tbody>
      </table></div><div class="tbl-n">最長連增／連減只計算網站已收錄的期間。</div></div>`;

    /* ---- 每日明細：跟著頁面的日期區間 ---- */
    const cell=(v,d)=>`<td class="r num ${cls(v)}">${sgnN(v==null?null:+v.toFixed(d),d)}</td>`;
    const detail = `
      <details class="tbl cr-detail" id="crDetail"><summary class="tbl-h" id="crDetailH">每日明細</summary><div class="tscroll tall noterm"><table class="t cr-t">
        <thead><tr><th>日期</th><th class="r">上市資(億)</th><th class="r">上市券(張)</th><th class="r">上櫃資(億)</th><th class="r">上櫃券(張)</th>${codes.map(code=>`<th class="r">${code} 資(張)</th><th class="r">連續</th><th class="r">${code} 券(張)</th>`).join('')}</tr></thead>
        <tbody id="crRows"></tbody>
      </table></div></details>`;
    const MAXROWS=400;
    const setRange=(from,to)=>{
      const rows=C.map((c,i)=>({c,i})).filter(({c})=>c.d>=from&&c.d<=to).reverse();
      const yr=from.slice(0,4)!==to.slice(0,4), dd=d=>yr?d.replace(/-/g,'/'):md(d);
      const tb=$('#crRows'), hd=$('#crDetailH'); if(!tb) return;
      tb.innerHTML=rows.slice(0,MAXROWS).map(({c,i})=>`<tr><td class="num">${dd(c.d)}</td>${cell(c.twse&&c.twse.loanChg,2)}${cell(c.twse&&c.twse.shortChg,0)}${cell(c.tpex&&c.tpex.loanChg,2)}${cell(c.tpex&&c.tpex.shortChg,0)}${codes.map(code=>{ const e=c.etf&&c.etf[code]; return `${cell(e&&e.loanChg,0)}<td class="r">${streakTxt(etfSt[code][i])}</td>${cell(e&&e.shortChg,0)}`; }).join('')}</tr>`).join('');
      hd.textContent=`每日明細（${from.replace(/-/g,'/')} – ${to.replace(/-/g,'/')}・${rows.length} 個交易日${rows.length>MAXROWS?`，顯示最近 ${MAXROWS} 天`:''}）`;
    };

    body.innerHTML=`<div class="grid2 cr-grid">${ratioCard}${dayCard}</div>${C.length?statTable+detail:''}`;

    /* ---- 維持率走勢圖 ---- */
    if(r1&&window.LightweightCharts){
      const ch=baseChart($('#crChart'));
      const s=ch.addLineSeries({color:'#60A5FA',lineWidth:2,priceFormat:{type:'custom',formatter:v=>v.toFixed(0)+'%'}});
      s.setData(R.map(x=>({time:x[0],value:x[1]})));
      s.createPriceLine({price:130,color:UP,lineStyle:2,lineWidth:1,axisLabelVisible:true,title:'130%'});
      const byD=new Map(R.map(x=>[x[0],x]));
      const lg=$('#crLg'), show=t=>{ const x=byD.get(t)||r1; lg.innerHTML=`<b>${x[0].replace(/-/g,'/')}</b> 維持率 <b>${x[1].toFixed(2)}%</b>・融資 ${fmt(x[2])} 億`; };
      show(); ch.subscribeCrosshairMove(p=>show(p&&p.time));
      const last=R[R.length-1][0];
      const setN=n=>{ const from=n?new Date((dayNumOf(last)-n)*864e5).toISOString().slice(0,10):R[0][0];
        ch.timeScale().setVisibleRange({from:from<R[0][0]?R[0][0]:from,to:last});
        $('#crRange').querySelectorAll('button').forEach(b=>b.classList.toggle('on',+b.dataset.n===n)); };
      let cur=365; $('#crRange').addEventListener('click',e=>{ const b=e.target.closest('button'); if(b){ cur=+b.dataset.n; setN(cur); } });
      // 圖表量到寬度後才能正確套用區間
      let sized=false;
      if(window.ResizeObserver) new ResizeObserver(()=>{ if(!sized&&$('#crChart').clientWidth){ sized=true; setTimeout(()=>setN(cur),0); } }).observe($('#crChart'));
      setTimeout(()=>setN(cur),50);
      $('#crChart').addEventListener('wheel',()=>$('#crRange').querySelectorAll('button').forEach(b=>b.classList.remove('on')),{passive:true});
      $('#crChart').addEventListener('pointerdown',()=>$('#crRange').querySelectorAll('button').forEach(b=>b.classList.remove('on')));
    }
    return { setRange };
  }
}

/* =====================================================================
   每週復盤頁
   ===================================================================== */
function renderReview(id){
  const i=D.reviews.findIndex(r=>r.id===id); const r=D.reviews[i];
  if(!r){ $('#main').innerHTML='<p>找不到這篇復盤。</p>'; return; }
  nav(id);
  const newer=D.reviews[i-1], older=D.reviews[i+1];
  const parts=r.parts.map((p,k)=>({...p,anchor:'p'+(k+1)}));
  const CN=['一','二','三','四','五','六','七'];

  const head = `
    <div class="crumb"><a href="../index.html">主頁</a><span>/</span><span>${r.date.replace(/-/g,'/')} 復盤</span></div>
    <div class="card r-head">
      <div class="eyebrow">每週復盤・${r.date.replace(/-/g,'/')}（${weekday(r.date)}）</div>
      <h1>${r.title}</h1>
      <div class="pills">${r.pills.map(([c,t])=>`<span class="pill ${c}">${t}</span>`).join('')}</div>
      <div class="r-ohlc num">
        <div><span>收盤</span><b class="${cls(r.chg)}">${fmt(r.close)}</b></div>
        <div><span>漲跌</span><b class="${cls(r.chg)}">${sign(r.chg)}${fmt(r.chg)}（${sign(r.pct)}${r.pct}%）</b></div>
        <div><span>開盤</span><b>${fmt(r.o)}</b></div><div><span>最高</span><b>${fmt(r.h)}</b></div><div><span>最低</span><b>${fmt(r.l)}</b></div><div><span>成交值</span><b>${r.vol}</b></div>
      </div>
      <div class="r-actions"><a class="btn" href="${pdfUrl(r)}" target="_blank" rel="noopener">📄 原始筆記 PDF</a><a class="btn" href="#market">📰 當週市場資訊</a><span class="badge" style="align-self:center">部位：${r.position}</span></div>
    </div>
    <div class="card tldr sec" style="margin-top:12px"><h2>本週重點</h2><ol>${r.tldr.map(x=>`<li>${x}</li>`).join('')}</ol></div>
    <div class="toc">${parts.map((p,k)=>`<a href="#${p.anchor}">${CN[k]}、${p.h}</a>`).join('')}<a href="#chips">籌碼圖</a><a href="#market">當週市場資訊</a></div>`;

  const body = parts.map((p,k)=>`
    <section class="card part sec" id="${p.anchor}">
      <h2><span class="no">${CN[k]}</span>${p.h}</h2>
      ${p.items?pointsHTML(p.items):''}
      ${(p.sub||[]).map(s=>`<h3>${s.h}</h3>${pointsHTML(s.items)}${(s.tables||[]).map(tableHTML).join('')}`).join('')}
      ${(p.tables||[]).map(tableHTML).join('')}
      ${p.quote?`<div class="quote">「${p.quote}」</div>`:''}
    </section>`).join('');

  // weekly market info
  const wd = DAILY.filter(d=>d.time>=r.week[0]&&d.time<=r.week[1]);
  const prevWeekClose = DAILY.filter(d=>d.time<r.week[0]).pop();
  const wkChg = wd.length&&prevWeekClose ? wd[wd.length-1].value-prevWeekClose.value : null;
  const days = wd.map(d=>{ const m=(r.market||{})[d.time]||{facts:[],notes:[]};
    return `<div class="card day"><div class="dt"><b>${md(d.time)}</b><span>${weekday(d.time)}</span></div>
      <div class="px num"><b class="${cls(d.chg)}">${fmt(d.value)}</b><span class="${cls(d.chg)}">${sign(d.chg)}${fmt(d.chg)}（${sign(d.pct)}${d.pct.toFixed(2)}%）</span></div>
      <div class="body">${m.facts.length?`<div class="facts">${m.facts.map(([k,v])=>`<span class="fact"><i>${k}</i>${v}</span>`).join('')}</div>`:''}<ul>${m.notes.map(n=>`<li>${n}</li>`).join('')}</ul></div></div>`; }).join('');

  const market = `
    <section class="sec" id="chips">
      <div class="sec-h"><h2>籌碼圖</h2><p>本週為止的近 3 個月（90 天）・<span id="chipsNote">讀取中</span>・<a href="../chips.html">看每日籌碼 →</a></p></div>
      ${chipCardsHTML('rc')}
    </section>
    <section class="sec" id="market">
      <div class="sec-h"><h2>當週市場資訊（參考）</h2><p>${md(r.week[0])} – ${md(r.week[1])}・週漲跌 <span class="num ${cls(wkChg)}">${wkChg==null?'—':sign(wkChg)+fmt(wkChg)+'（'+sign(wkChg)+(wkChg/prevWeekClose.value*100).toFixed(2)+'%）'}</span></p></div>
      <div class="card"><div class="chart"><div class="chart-legend num" id="legend"></div><div id="chart" style="position:absolute;inset:0"></div></div>
        <div class="chart-note">黃線＝本週走勢；加權指數收盤取自筆記籌碼表，有報導的交易日使用報導的精確收盤</div></div>
      <div class="days sec" style="margin-top:12px">${days}</div>
      <div class="card" style="margin-top:12px"><div class="card-h">新聞來源 <span class="sub">筆記內提及的事件以新聞報導補充</span></div>
        <div class="src" style="padding:12px 16px">${r.sources.map(([t,u])=>`<a href="${u}" target="_blank" rel="noopener">${t}</a>`).join('<br>')}</div></div>
    </section>
    <nav class="pager">
      ${older?`<a class="card" href="${older.id}.html"><span>← 上一週</span><b>${older.date.replace(/-/g,'/')} ${older.title}</b></a>`:'<span></span>'}
      ${newer?`<a class="card next" href="${newer.id}.html"><span>下一週 →</span><b>${newer.date.replace(/-/g,'/')} ${newer.title}</b></a>`:`<a class="card next" href="../index.html"><span>回主頁 →</span><b>所有復盤列表</b></a>`}
    </nav>`;

  $('#main').innerHTML = head + body + market;
  const marks = D.campaign.events.filter(e=>e.time<=r.week[1]);
  indexChart($('#chart'),$('#legend'),{markers:marks,highlight:r.week});
  withChips(['#rc1','#rc2','#rc3'],{end:r.week[1],days:90},$('#chipsNote'));
}

/* =====================================================================
   每日籌碼頁（讀 Google 試算表）
   ===================================================================== */
const SIG = [['sigSPQty','外資 SP 口數'],['sigSPAmt','外資 SP 金額'],['sigMicro','落底・微台'],['sigBoth','落底・小+微'],['sigAmp','落底・幅度'],['sigStrong','強烈落底'],['sig3','連續三天期貨逆增']];
const sigOn = v => v!=null && v!=='' && v!=='0';
const sigList = r => SIG.filter(([k])=>sigOn(r[k])).map(([k,t])=>(/^\d+$/.test(r[k])?`${t} ${r[k]}`:t));
const n0 = v => v==null?'—':fmt(v,0);
const n2 = v => v==null?'—':fmt(v,2);
const sgn0 = v => v==null?'—':`<span class="${cls(v)}">${sign(v)}${fmt(v,0)}</span>`;
const pctTxt = v => v==null?'—':v+'%';

/* 明細表可選欄位：[key, 欄名, 格式, 群組, 預設顯示] */
const COLS = [
  ['idx','加權','n2','大盤',1],['chg','漲跌','c2','大盤',0],['pct','漲跌%','pct','大盤',1],['vol','成交量(億)','n0','大盤',0],
  ['fiSpot','外資現貨(億)','c2','外資期貨',1],['fiOI','外資期貨<br>總未平倉','c0','外資期貨',0],['fiRel','外資期貨<br>相對結算','c0','外資期貨',1],['fiDelta','前日增減','c0','外資期貨',1],
  ['bp','BP 金額','n0','外資選擇權',1],['sp','SP 金額','n0','外資選擇權',0],['bc','BC 金額','n0','外資選擇權',0],['sc','SC 金額','n0','外資選擇權',0],['bpsp','BP/SP<br>增幅比','r1','外資選擇權',0],['bcsc','BC/SC<br>增幅比','r1','外資選擇權',0],
  ['rtLong','散戶多','n0','散戶',1],['rtShort','散戶空','n0','散戶',1],['rtLongPct','多單百分位','pp','散戶',1],['rtShortPct','空單百分位','pp','散戶',0],['mxLong','微台多','n0','散戶',0],['mxShort','微台空','n0','散戶',0],
  ['sig','訊號','sig','訊號',1]
];
const COLS_KEY='mtx-cols-v1';
const colsDefault = () => COLS.filter(c=>c[4]).map(c=>c[0]);
function colsLoad(){ try{ const v=JSON.parse(localStorage.getItem(COLS_KEY)); if(Array.isArray(v)&&v.length) return v.filter(k=>COLS.some(c=>c[0]===k)); }catch(e){} return colsDefault(); }
function colsSave(v){ try{ localStorage.setItem(COLS_KEY,JSON.stringify(v)); }catch(e){} }
function cellHTML(r,[k,,f]){
  const v=r[k];
  switch(f){
    case 'sig': return `<td class="sigcell">${sigList(r).join('、')}</td>`;
    case 'pct': return `<td class="r num ${cls(v)}">${v==null?'—':sign(v)+v.toFixed(2)}</td>`;
    case 'c0': return `<td class="r num ${cls(v)}">${n0(v)}</td>`;
    case 'c2': return `<td class="r num ${cls(v)}">${n2(v)}</td>`;
    case 'n2': return `<td class="r num">${n2(v)}</td>`;
    case 'pp': return `<td class="r num">${pctTxt(v)}</td>`;
    case 'r1': return `<td class="r num">${v==null?'—':v.toFixed(1)+'%'}</td>`;
    default:   return `<td class="r num">${n0(v)}</td>`;
  }
}

function renderChips(){
  nav('chips');
  const main=$('#main');
  Promise.all([window.MTXSheet.load(), loadMargin().catch(()=>null)]).then(([data,M])=>{
    const R=data.rows, L=R[R.length-1], P=R[R.length-2]||{};
    const MC=(M&&M.credit)||[], MR=(M&&M.ratio)||[], ME=(M&&M.etfs)||{};
    const lastStrong=[...R].reverse().find(r=>sigOn(r.sigStrong));
    const sigs=sigList(L);
    const delta=k=>L[k]!=null&&P[k]!=null?L[k]-P[k]:null;
    const kpi=(label,val,sub)=>`<div class="kpi"><span>${label}</span><b class="num">${val}</b><em>${sub}</em></div>`;
    const ranges=[['1M',30],['3M',91],['6M',182],['1Y',365],['3Y',1095],['全部',0]];   // 日曆天
    const back=n=>new Date((dayNumOf(L.date)-n)*864e5).toISOString().slice(0,10);
    const first=R[0].date, last=L.date;
    const ecodes=Object.keys(ME);
    const panes=[['加權指數','紅箭頭＝強烈落底'],['外資期貨未平倉','口・相對結算日'],['外資選擇權金額','BP 紫・BC 紅・SC 綠'],['散戶多空','多單紅・空單綠（口）'],
      ...(MR.length?[['大盤融資維持率','上市扣除 ETF・玩股網・虛線＝130%']]:[]),
      ...(MC.length?[['融資餘額','上市紅・上櫃黃（億）'],['融券餘額','上市紅・上櫃黃（張）'],['正二 ETF 融資餘額',`${ecodes.map((c,i)=>`${c} ${['紅','黃'][i]||''}`).join('・')}（張）`]]:[])];
    main.innerHTML = `
      <div class="crumb"><a href="index.html">主頁</a><span>/</span><span>每日籌碼</span></div>
      <div class="card r-head">
        <div class="eyebrow">資料更新至 ${L.date.replace(/-/g,'/')}（${weekday(L.date)}）${L.settle===999?'・結算日':''}</div>
        <h1>每日籌碼</h1>
        <div class="r-ohlc num">
          <div><span>加權收盤</span><b class="${cls(L.chg)}">${n2(L.idx)}</b></div>
          <div><span>漲跌</span><b class="${cls(L.chg)}">${sign(L.chg)}${n2(L.chg)}（${sign(L.pct)}${L.pct==null?'—':L.pct.toFixed(2)}%）</b></div>
          <div><span>成交量</span><b>${n0(L.vol)} 億</b></div>
          <div><span>外資現貨</span><b class="${cls(L.fiSpot)}">${sign(L.fiSpot)}${n2(L.fiSpot)} 億</b></div>
        </div>
        <div class="sigs"><span class="sigs-h">今日訊號</span>${sigs.length?sigs.map(t=>`<span class="pill r">${t}</span>`).join(''):'<span class="pill">無落底訊號</span>'}
          ${lastStrong?`<span class="sigs-last">最近一次強烈落底：<b class="num">${lastStrong.date.replace(/-/g,'/')}</b>・<a href="signals.html#strong" style="color:#93C5FD">看訊號回測 →</a></span>`:''}</div>
      </div>
      <div class="card" style="margin-top:12px"><div class="kpis k4">
        ${kpi('外資期貨未平倉（相對結算日）',sgn0(L.fiRel)+' 口',`前日增減 ${sgn0(L.fiDelta)}・總未平倉 ${n0(L.fiOI)}`)}
        ${kpi('外資 BP 金額',n0(L.bp),`較前日 ${sgn0(delta('bp'))}・BP/SP 增幅比 ${L.bpsp==null?'—':L.bpsp.toFixed(1)+'%'}`)}
        ${kpi('外資 BC／SC 金額',`${n0(L.bc)}／${n0(L.sc)}`,`BC/SC 增幅比 ${L.bcsc==null?'—':L.bcsc.toFixed(1)+'%'}`)}
        ${kpi('散戶多單／空單',`${n0(L.rtLong)}／${n0(L.rtShort)}`,`多單持倉百分位 ${pctTxt(L.rtLongPct)}・較前日 ${sgn0(delta('rtLong'))}`)}
      </div></div>

      <section class="sec" id="credit">
        <div class="sec-h"><h2>信用交易</h2><p id="creditNote">每個交易日晚上 21:30 自動更新</p></div>
        <div id="creditBody">${M?'':'<div class="card"><p class="empty">讀不到信用交易資料。</p></div>'}</div>
      </section>

      <section class="sec">
        <div class="sec-h"><h2>籌碼走勢</h2><p>日期區間同時套用到走勢圖與下方明細</p></div>
        <div class="card rangebar">
          <div class="tabs" id="range">${ranges.map(([t,n])=>`<button data-n="${n}">${t}</button>`).join('')}</div>
          <div class="dates"><label><span>起</span><input type="date" id="dFrom" min="${first}" max="${last}"></label><i>–</i><label><span>迄</span><input type="date" id="dTo" min="${first}" max="${last}"></label></div>
          <span class="rb-note num">可選 ${first.replace(/-/g,'/')} – ${last.replace(/-/g,'/')}</span>
        </div>
        <div class="stack">${panes.map(([h,sub],i)=>`
          <div class="card"><div class="card-h"><span>${h}</span> <span class="sub">${sub}</span></div><div class="chart tall"><div class="chart-legend num" id="lg${i}"></div><div id="ch${i}" style="position:absolute;inset:0"></div></div></div>`).join('')}
        </div>
      </section>

      <section class="sec" id="tbl">
        <div class="sec-h"><h2>每日明細</h2>
          <details class="colpick" id="colpick"><summary>顯示欄位</summary><div class="cp-body">
            ${[...new Set(COLS.map(c=>c[3]))].map(g=>`<div class="cp-g"><b>${g}</b>${COLS.filter(c=>c[3]===g).map(c=>`<label><input type="checkbox" value="${c[0]}">${c[1].replace('<br>','')}</label>`).join('')}</div>`).join('')}
            <div class="cp-act"><button type="button" data-act="all">全選</button><button type="button" data-act="def">恢復預設</button></div>
          </div></details>
        </div>
        <p class="tbl-sub" id="tblSub"></p>
        <div class="card"><div class="tscroll tall"><table class="t daily" id="dtable"></table></div></div>
        ${data.missing.length?`<p class="chart-note">試算表中找不到這些欄位：${data.missing.join('、')}</p>`:''}
      </section>`;

    /* ---- 明細表 + 日期區間 ---- */
    let cols=colsLoad(), range=[back(182),last];
    const dFrom=$('#dFrom'), dTo=$('#dTo');
    const drawTable=()=>{
      const C=COLS.filter(c=>cols.includes(c[0])), rows=R.filter(r=>r.date>=range[0]&&r.date<=range[1]).reverse();
      const yr=range[0].slice(0,4)!==range[1].slice(0,4);
      const dt=d=>yr?d.replace(/-/g,'/'):md(d);
      $('#dtable').innerHTML=`<thead><tr><th>日期</th>${C.map(c=>`<th class="${c[2]==='sig'?'':'r'}">${c[1]}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r=>`<tr${sigList(r).length?' class="sig"':''}><td class="num">${dt(r.date)}</td>${C.map(c=>cellHTML(r,c)).join('')}</tr>`).join('')}</tbody>`;
      const ns=rows.filter(r=>sigList(r).length).length;
      $('#tblSub').innerHTML=`${range[0].replace(/-/g,'/')} – ${range[1].replace(/-/g,'/')}・<b class="num">${rows.length}</b> 個交易日・有訊號 <b class="num">${ns}</b> 天・最新在最上面・紅底＝有落底訊號`;
    };
    const syncChecks=()=>$('#colpick').querySelectorAll('input').forEach(x=>{ x.checked=cols.includes(x.value); });
    $('#colpick').addEventListener('change',e=>{ if(e.target.type!=='checkbox') return;
      cols=[...$('#colpick').querySelectorAll('input:checked')].map(x=>x.value); colsSave(cols); drawTable(); });
    $('#colpick').addEventListener('click',e=>{ const a=e.target.dataset&&e.target.dataset.act; if(!a) return;
      cols=a==='all'?COLS.map(c=>c[0]):colsDefault(); colsSave(cols); syncChecks(); drawTable(); });
    syncChecks();

    const credit = M ? renderCredit(M,$('#creditBody'),$('#creditNote')) : null;
    const charts=[], legends=[]; let sync=null;
    const clamp=d=>d<first?first:d>last?last:d;
    // 日期區間：按鈕、起訖日期，或直接在任一張圖上滾輪縮放、拖曳，都會同步到所有圖、明細表、信用交易明細
    const showRange=(from,to,preset)=>{
      range=[from,to]; dFrom.value=from; dTo.value=to;
      [...$('#range').children].forEach(b=>b.classList.toggle('on',b.dataset.n===String(preset)));
      legends.forEach(f=>f()); drawTable(); if(credit) credit.setRange(from,to);
    };
    const applyRange=(from,to,preset)=>{
      from=clamp(from||first); to=clamp(to||last); if(from>to) [from,to]=[to,from];
      if(sync) sync.set(from,to);
      showRange(from,to,preset);
    };
    const byN=n=>applyRange(n?back(n):first,last,n);
    $('#range').addEventListener('click',e=>{ const b=e.target.closest('button'); if(b) byN(+b.dataset.n); });
    [dFrom,dTo].forEach(x=>x.addEventListener('change',()=>{ if(x.value) applyRange(dFrom.value,dTo.value,null); }));

    glossary(main);
    if(!window.LightweightCharts){ byN(182); return; }
    const T=r=>r.date, byDate=new Map(R.map(r=>[r.date,r]));
    const endRow=()=>{ for(let i=R.length-1;i>=0;i--) if(R[i].date<=range[1]) return R[i]; return L; };
    const legend=(i,fn,c)=>{ const el=$('#lg'+i); const show=t=>{ const r=byDate.get(t)||endRow(); el.innerHTML=`<b>${r.date.replace(/-/g,'/')}</b> `+fn(r); }; show(); c.subscribeCrosshairMove(p=>show(p&&p.time)); legends.push(show); };
    const mk=i=>{ const c=baseChart($('#ch'+i)); charts.push(c); return c; };
    const lines=(c,defs)=>defs.forEach(([k,col])=>{ const x=c.addLineSeries({color:col,lineWidth:2,priceFormat:{type:'volume'},lastValueVisible:false,priceLineVisible:false}); x.setData(R.filter(r=>r[k]!=null).map(r=>({time:T(r),value:r[k]}))); });

    let c=mk(0);
    const s0=c.addAreaSeries({lineColor:'#60A5FA',topColor:'rgba(96,165,250,.25)',bottomColor:'rgba(96,165,250,.02)',lineWidth:2,priceFormat:{type:'price',precision:0,minMove:1}});
    s0.setData(R.map(r=>({time:T(r),value:r.idx})));
    s0.setMarkers(R.filter(r=>sigOn(r.sigStrong)).map(r=>({time:T(r),position:'belowBar',color:UP,shape:'arrowUp'})));
    legend(0,r=>`加權 <b>${n2(r.idx)}</b> <span class="${cls(r.chg)}">${sign(r.chg)}${n2(r.chg)}</span>${sigList(r).length?' ・<span class="up">'+sigList(r).join('、')+'</span>':''}`,c);

    c=mk(1);
    const s1=c.addHistogramSeries({priceFormat:{type:'volume'}});
    s1.setData(R.filter(r=>r.fiRel!=null).map(r=>({time:T(r),value:r.fiRel,color:r.fiRel>=0?UP:(r.fiRel<=-10000?DN:'rgba(16,185,129,.5)')})));
    s1.createPriceLine({price:-20000,color:'#F59E0B',lineStyle:2,lineWidth:1,title:'−2萬'});
    s1.createPriceLine({price:10000,color:'#F59E0B',lineStyle:2,lineWidth:1,title:'+1萬'});
    legend(1,r=>`相對結算 <b class="${cls(r.fiRel)}">${n0(r.fiRel)}</b> 前日 <span class="${cls(r.fiDelta)}">${n0(r.fiDelta)}</span> 總未平倉 ${n0(r.fiOI)}`,c);

    c=mk(2); lines(c,[['sc','#10B981'],['bc','#EF4444'],['bp','#A855F7']]);
    legend(2,r=>`<span style="color:#C084FC">BP ${n0(r.bp)}</span> <span class="up">BC ${n0(r.bc)}</span> <span class="down">SC ${n0(r.sc)}</span>`,c);

    c=mk(3); lines(c,[['rtShort','#10B981'],['rtLong','#EF4444']]);
    legend(3,r=>`多 <b class="up">${n0(r.rtLong)}</b> 空 <b class="down">${n0(r.rtShort)}</b> 多單百分位 ${pctTxt(r.rtLongPct)}`,c);

    /* ---- 信用交易歷史（data/margin.json）：和上面的圖共用日期區間 ---- */
    let pi=4;
    const mLegend=(i,c,rows,fn)=>{ const el=$('#lg'+i), by=new Map(rows.map(x=>[x.d,x]));
      const at=t=>{ if(t&&by.has(t)) return by.get(t); for(let k=rows.length-1;k>=0;k--) if(rows[k].d<=range[1]) return rows[k]; return rows[rows.length-1]; };
      const show=t=>{ const x=at(t); if(x) el.innerHTML=`<b>${x.d.replace(/-/g,'/')}</b> `+fn(x); }; show(); c.subscribeCrosshairMove(p=>show(p&&timeStr(p.time))); legends.push(show); };
    const mLine=(c,rows,get,color,fmtFn)=>{ const s=c.addLineSeries({color,lineWidth:2,lastValueVisible:false,priceLineVisible:false,priceFormat:fmtFn?{type:'custom',formatter:fmtFn}:{type:'volume'}});
      s.setData(rows.map(x=>({time:x.d,value:get(x)})).filter(p=>p.value!=null)); return s; };
    if(MR.length){
      const rows=MR.map(x=>({d:x[0],r:x[1],b:x[2]}));
      c=mk(pi); const s=mLine(c,rows,x=>x.r,'#60A5FA',v=>v.toFixed(0)+'%');
      s.createPriceLine({price:130,color:UP,lineStyle:2,lineWidth:1,axisLabelVisible:true,title:'130%'});
      mLegend(pi,c,rows,x=>`維持率 <b class="${x.r<130?'pend':''}">${x.r.toFixed(2)}%</b>・融資（扣除 ETF）${fmt(x.b)} 億`); pi++;
    }
    if(MC.length){
      const g=(x,a,b)=>x[a]?x[a][b]:null;
      c=mk(pi); mLine(c,MC,x=>g(x,'twse','loan'),'#EF4444'); mLine(c,MC,x=>g(x,'tpex','loan'),'#F59E0B');
      mLegend(pi,c,MC,x=>`上市 <b>${fmt(g(x,'twse','loan'))}</b> 億 <span class="${cls(g(x,'twse','loanChg'))}">${sgnN(g(x,'twse','loanChg'),2)}</span>・上櫃 <b>${fmt(g(x,'tpex','loan'))}</b> 億 <span class="${cls(g(x,'tpex','loanChg'))}">${sgnN(g(x,'tpex','loanChg'),2)}</span>`); pi++;
      c=mk(pi); mLine(c,MC,x=>g(x,'twse','short'),'#EF4444'); mLine(c,MC,x=>g(x,'tpex','short'),'#F59E0B');
      mLegend(pi,c,MC,x=>`上市 <b>${n0(g(x,'twse','short'))}</b> 張 <span class="${cls(g(x,'twse','shortChg'))}">${sgnN(g(x,'twse','shortChg'))}</span>・上櫃 <b>${n0(g(x,'tpex','short'))}</b> 張 <span class="${cls(g(x,'tpex','shortChg'))}">${sgnN(g(x,'tpex','shortChg'))}</span>`); pi++;
      c=mk(pi); ecodes.forEach((code,k)=>mLine(c,MC,x=>x.etf&&x.etf[code]?x.etf[code].loan:null,['#EF4444','#F59E0B','#A855F7'][k]||'#60A5FA'));
      mLegend(pi,c,MC,x=>ecodes.map(code=>{ const e=x.etf&&x.etf[code]; return e?`${code} <b>${n0(e.loan)}</b> 張 <span class="${cls(e.loanChg)}">${sgnN(e.loanChg)}</span>`:`${code} —`; }).join('・')); pi++;
    }

    sync=syncCharts(charts,(from,to)=>showRange(from<first?first:from,to>last?last:to,null));
    byN(182);
    // 圖表剛建立時還量不到寬度，第一次設定的區間可能失效；量到寬度後再套用一次
    const ro=window.ResizeObserver&&new ResizeObserver(()=>{ if($('#ch0').clientWidth){ ro.disconnect(); setTimeout(()=>sync.set(range[0],range[1]),0); } });
    if(ro) ro.observe($('#ch0')); setTimeout(()=>sync.set(range[0],range[1]),120);
  }).catch(err=>{
    main.innerHTML=`<div class="card r-head"><h1>每日籌碼</h1><p style="margin-top:8px;color:var(--muted)">讀不到籌碼試算表（${String(err&&err.message||err)}）。請確認試算表的共用設定仍是「知道連結的任何人都能檢視」，再重新整理頁面。</p></div>`;
  });
}

/* =====================================================================
   訊號回測頁（讀每日籌碼試算表，在瀏覽器裡計算；引擎在 backtest.js）
   ===================================================================== */
const PEND = /^(未達成|未突破|未站回|未確認|未再跌破)/;
function btFmt(v,f){
  if(v===null||v===undefined||v==='') return '—';
  if(typeof v!=='number') return String(v);
  if(f==='pct') return (v>0?'+':'')+v.toFixed(2)+'%';
  if(f==='pct0') return v.toFixed(2)+'%';
  if(f==='num') return fmt(v,2);
  return String(v);
}
const btTone = (v,color) => typeof v==='number' ? (color?cls(v):'') : (typeof v==='string'&&PEND.test(v)?'pend':'');
// 欄位：[資料欄, 表頭, 格式, 選項]；選項 c＝正負上色、t＝文字靠左
const BT_COLS = {
  excess:[['持有週期','持有週期'],['訊號樣本數','訊號樣本數'],['訊號勝率','訊號勝率','pct0'],['基準勝率','基準勝率','pct0'],['超額勝率','超額勝率','pct','c'],['訊號期望值','訊號期望值','pct'],['基準期望值','基準期望值','pct'],['超額期望值','超額期望值','pct','c']],
  events:[['首日日期','首日日期'],['首日收盤','首日收盤','num'],['30日最低跌幅','30日內最低跌幅','pct'],['30日最低日期','30日最低日期'],['30日最低收盤','30日最低收盤','num'],['到達30日最低(天)','到達最低(天)'],
    ['站回首日日期','站回首日日期'],['站回首日費時','自最低站回首日(天)'],['再跌破首日日期','再跌破首日日期'],['再跌破首日費時','站回後再跌破(天)'],
    ['波段低點跌幅','波段低點跌幅','pct'],['波段低點日期','波段低點日期'],['波段低點收盤','波段低點收盤','num'],['到達波段低點(天)','到達波段低點(天)'],['波段低點確認日','波段低點確認日'],
    ['前高日期','前高日期'],['前高收盤','前高收盤','num'],['突破日期','突破前高日期'],['突破前高費時','突破前高費時(天)'],['盤勢','盤勢','','t']],
  summary:[['評估基準','評估基準','','t'],['持有週期','持有週期'],['樣本數','樣本數'],['未完成','未完成'],['勝率','勝率','pct0'],['期望值','期望值','pct'],['平均獲利W','平均獲利W','pct'],['平均虧損L','平均虧損L','pct'],['盈虧比','盈虧比','num'],
    ['報酬標準差','報酬標準差','pct0'],['最差10%報酬','最差10%報酬','pct'],['最大單次漲幅','最大單次漲幅','pct'],['最大單次跌幅','最大單次跌幅','pct'],['平均最大漲幅','平均最大漲幅','pct'],['中位數最大漲幅','中位數最大漲幅','pct'],['平均最大跌幅','平均最大跌幅','pct'],['中位數最大跌幅','中位數最大跌幅','pct']],
  pullbacks:[['突破日期','突破日期'],['對應訊號','對應訊號','','t'],['突破收盤','突破收盤','num'],
    ...[5,10,15,20].flatMap(p=>[[`回檔>${p}%日期`,`回檔&gt;${p}%日期`],[`回檔>${p}%費時`,`${p}%費時(天)`],[`回檔>${p}%基準高點`,`${p}%基準高點`]])],
  byYear:[['年度','年度'],['年度漲跌','全年漲跌','pct','c'],['訊號數','訊號數'],['30天勝率','30天勝率','pct0'],['30天期望值','30天期望值','pct','c'],['30天基準期望值','30天基準','pct'],['30天超額','30天超額','pct','c'],
    ['60天勝率','60天勝率','pct0'],['60天期望值','60天期望值','pct','c'],['60天基準期望值','60天基準','pct'],['60天超額','60天超額','pct','c']],
  byRegime:[['組別','組別','','t'],['分類方式','分類方式','','t'],['訊號數','訊號數'],['30天勝率','30天勝率','pct0'],['30天期望值','30天期望值','pct','c'],['30天基準期望值','30天基準','pct'],['30天超額','30天超額','pct','c'],
    ['60天勝率','60天勝率','pct0'],['60天期望值','60天期望值','pct','c'],['60天基準期望值','60天基準','pct'],['60天超額','60天超額','pct','c']]
};
function btTable(key,rows,{rowId,group}={}){
  const C=BT_COLS[key]; let prev=null;
  const body=rows.map(r=>{
    const k=[];
    if(key==='summary'){ const b=r['評估基準']; if(b.startsWith('無條件')) k.push('base'); if(b.includes('參考用')) k.push('ref'); }
    if(group){ const g=r[group]; if(prev!==null&&g!==prev) k.push('grp'); prev=g; }
    const id=rowId?` id="${rowId(r)}"`:'';
    return `<tr${id}${k.length?` class="${k.join(' ')}"`:''}>${C.map(([f,,fm,o])=>{ const v=r[f], t=btTone(v,o==='c');
      return `<td class="${o==='t'?'tx':'r'}${t?' '+t:''}">${btFmt(v,fm)}</td>`; }).join('')}</tr>`;
  }).join('');
  return `<div class="bt-scroll noterm"><table class="t bt"><thead><tr>${C.map(([,h,,o])=>`<th class="${o==='t'?'tx':'r'}">${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
}
const btPick = (rows,cond) => rows.find(r=>Object.entries(cond).every(([k,v])=>r[k]===v))||{};
const bv = (v,f,color) => { const t=btTone(v,color); return `<b class="num${t?' '+t:''}">${btFmt(v,f)}</b>`; };

// 期望值長條圖（訊號 vs 無條件基準）
function evChart(el,rows,color){
  const draw=()=>{
    const W=Math.max(260,el.clientWidth), H=230, m={t:22,r:8,b:28,l:44};
    const S=[['訊號期望值','訊號',color],['基準期望值','無條件基準','#5D677B']];
    const vals=rows.flatMap(r=>S.map(s=>r[s[0]]));
    const lo=Math.min(0,...vals), hi=Math.max(0,...vals)*1.15||1;
    const y=v=>m.t+(hi-v)/(hi-lo)*(H-m.t-m.b);
    const gw=(W-m.l-m.r)/rows.length, bw=Math.min(34,gw*.32);
    const ticks=[]; const step=Math.pow(10,Math.floor(Math.log10((hi-lo)/4||1))); const st=[1,2,5,10].map(x=>x*step).find(x=>(hi-lo)/x<=5)||step*10;
    for(let v=Math.ceil(lo/st)*st;v<=hi+1e-9;v+=st) ticks.push(+v.toFixed(6));
    let svg=`<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="各持有週期訊號與無條件基準的期望值">`;
    ticks.forEach(v=>{ svg+=`<line x1="${m.l}" x2="${W-m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${v===0?'#3A4560':'rgba(35,43,58,.7)'}"/><text x="${m.l-6}" y="${y(v)+4}" text-anchor="end" class="bt-ax">${v}%</text>`; });
    rows.forEach((r,i)=>{ const cx=m.l+gw*i+gw/2;
      S.forEach(([k,lab,col],j)=>{ const v=r[k]; if(v==null) return; const x=cx+(j?2:-bw-2), y0=y(Math.max(0,v)), h=Math.max(1,Math.abs(y(v)-y(0)));
        svg+=`<rect x="${x}" y="${y0}" width="${bw}" height="${h}" rx="2" fill="${col}" data-tip="${r['持有週期']}｜${lab}期望值 ${btFmt(v,'pct')}${j?'':'（樣本 '+r['訊號樣本數']+'）'}"/>`;
        svg+=`<text x="${x+bw/2}" y="${v>=0?y0-5:y0+h+12}" text-anchor="middle" class="bt-val">${btFmt(v,'pct')}</text>`; });
      svg+=`<text x="${cx}" y="${H-8}" text-anchor="middle" class="bt-ax">${r['持有週期']}</text>`; });
    el.innerHTML=svg+'</svg><div class="bt-tip"></div>';
  };
  draw();
  const tip=()=>el.querySelector('.bt-tip');
  const show=e=>{ const t=e.target.closest('rect[data-tip]'); const tp=tip(); if(!t){ tp.classList.remove('on'); return; }
    tp.textContent=t.dataset.tip; tp.classList.add('on'); const b=el.getBoundingClientRect();
    let x=e.clientX-b.left+10; if(x+tp.offsetWidth>b.width) x=b.width-tp.offsetWidth; tp.style.left=Math.max(0,x)+'px'; tp.style.top=Math.max(0,e.clientY-b.top-36)+'px'; };
  el.addEventListener('pointermove',show); el.addEventListener('pointerdown',show); el.addEventListener('pointerleave',()=>tip().classList.remove('on'));
  if(window.ResizeObserver){ let w=el.clientWidth; new ResizeObserver(()=>{ if(el.clientWidth!==w){ w=el.clientWidth; draw(); } }).observe(el); }
}

const SIG_COLOR = {strong:'#EF4444', bp:'#A855F7'};
function renderSignals(){
  nav('signals');
  const main=$('#main'), B=window.MTXBacktest;
  const end=(new URLSearchParams(location.search).get('end')||'').match(/^\d{4}-\d{2}-\d{2}$/)?new URLSearchParams(location.search).get('end'):null;
  window.MTXSheet.load().then(data=>{
    const res=B.run(data,end), mk=res.mk, LAST=mk.n-1;
    window.__bt=res;   // 方便在主控台驗算
    const dt=s=>s.replace(/-/g,'/');
    const warn=(data.warnings||[]).slice(0,8);

    const lead=s=>{
      const ex=r=>btPick(s.excess,{'持有週期':r});
      if(s.id==='strong') return `計入 ${bv(s.count)} 筆訊號（原始 ${bv(s.raw)} 筆，冷卻期移除：${s.removed.length?s.removed.join('、'):'無'}）。
        首日收盤進場持有 30 天，勝率 ${bv(ex('30天')['訊號勝率'],'pct0')}（所有交易日基準 ${bv(ex('30天')['基準勝率'],'pct0')}），
        期望值 ${bv(ex('30天')['訊號期望值'],'pct')}（基準 ${bv(ex('30天')['基準期望值'],'pct')}），超額 ${bv(ex('30天')['超額期望值'],'pct',1)}。`;
      // BP 紅燈：亮燈前 30 天（日曆天）內自高點的跌幅
      const drops=s.idxs.map(i=>{ let hi=mk.c[i]; for(let t=i;t>=0&&mk.days(t,i)<=30;t--) hi=Math.max(hi,mk.c[t]); return (mk.c[i]/hi-1)*100; });
      const latest=s.events[0], newest=latest&&mk.days(latest._i,LAST), dn=drops.map(x=>-x);
      return `逐日動態判斷：當天的外資 BP 金額達到「當天以前所有資料」的前 2% 才算亮燈，連續亮燈只取第一天，熄燈滿 10 個交易日才算新的一次，從 2012 年起判斷。
        共 ${bv(s.count)} 次，樣本少，屬於個案觀察。每次都在急跌中亮燈：亮燈前 30 天內，從高點跌了 ${bv(Math.min(...dn),'pct0')}～${bv(Math.max(...dn),'pct0')}。
        ${latest?`最新一次是 <b class="num">${dt(latest['首日日期'])}</b>${newest<30?`，距資料最後一天只有 ${newest} 天，多數欄位還是「未達成」`:''}。`:''}
        首日收盤進場持有 30 天，勝率 ${bv(ex('30天')['訊號勝率'],'pct0')}（基準 ${bv(ex('30天')['基準勝率'],'pct0')}），期望值 ${bv(ex('30天')['訊號期望值'],'pct')}（基準 ${bv(ex('30天')['基準期望值'],'pct')}）；
        持有 60 天，勝率 ${bv(ex('60天')['訊號勝率'],'pct0')}，期望值 ${bv(ex('60天')['訊號期望值'],'pct')}（基準 ${bv(ex('60天')['基準期望值'],'pct')}）。`;
    };
    const robust=s=>{
      if(s.id!=='strong') return '';
      const g=(d,grp)=>btPick(s.byRegime,{'分類方式':d,'組別':grp});
      const bear=g('全年漲跌（事後才知道）','空頭年（全年下跌）'), bull=g('全年漲跌（事後才知道）','強多頭（20%以上）');
      const bad=s.byYear.filter(r=>r['30天超額']!=null&&r['30天超額']<=-0.5).sort((a,b)=>a['30天超額']-b['30天超額']).map(r=>r['年度']).sort();
      const dd=['距高點 5% 以內','距高點 5～15%','距高點 15% 以上'].map(x=>bv(g('距歷史新高（訊號當天可判斷）',x)['30天超額'],'pct',1)).join('／');
      return `<p class="bt-lead">空頭年（全年下跌）持有 30 天，訊號期望值 ${bv(bear['30天期望值'],'pct')}，同組基準 ${bv(bear['30天基準期望值'],'pct')}；強多頭年訊號 ${bv(bull['30天期望值'],'pct')}，基準 ${bv(bull['30天基準期望值'],'pct')}。
        ${bear['30天超額']>0?'訊號<b>不是只有多頭年有用</b>：空頭年也贏過基準，只是絕對報酬接近零；':''}${bad.length?`明顯失靈（30 天超額 −0.5% 以下）的反而是 ${bad.join('、')} 這類一路上漲、拉回很淺的年份。`:''}
        季線下、年線下的訊號 60 天勝率分別是 ${bv(g('季線（訊號當天可判斷）','季線下')['60天勝率'],'pct0')}、${bv(g('年線（訊號當天可判斷）','年線下')['60天勝率'],'pct0')}；
        距歷史新高 5% 以內／5～15%／15% 以上的 30 天超額分別是 ${dd}。各組樣本只有個位數到二十幾筆，差距要保守看待。</p>`;
    };
    const status=s=>{
      const e=s.events[0]; if(!e) return '';
      const i=mk.idxOf.get(e['首日日期']), c0=mk.c[i], now=mk.c[LAST], age=mk.days(i,LAST);
      let lo=i; for(let t=i;t<=LAST;t++) if(mk.c[t]<mk.c[lo]) lo=t;
      const chg=(now/c0-1)*100, low=(mk.c[lo]/c0-1)*100;
      const win=age<30?`還剩 ${30-age} 天`:'已滿';
      return `<div class="card bt-status noterm"><div class="dgrid keys">
        <div><span>最近一次訊號</span><b class="num">${dt(e['首日日期'])}</b><em>首日收盤 ${fmt(c0)}・距今 ${age} 天</em></div>
        <div><span>首日收盤進場至今</span><b class="num ${cls(chg)}">${sign(chg)}${chg.toFixed(2)}%</b><em>${dt(mk.d[LAST])} 收 ${fmt(now)}</em></div>
        <div><span>首日以來最低收盤</span><b class="num ${cls(low)}">${low<0?low.toFixed(2)+'%':'—'}</b><em>${lo===i?'最低就是首日':`${dt(mk.d[lo])}・${fmt(mk.c[lo])}`}</em></div>
        <div><span>30 日觀察窗口</span><b class="num">${win}</b><em>${e['突破日期']==='未突破'?`未突破前高 ${fmt(e['前高收盤'])}`:`${dt(e['突破日期'])} 已突破`}</em></div>
      </div></div>`;
    };
    const section=(s,k)=>`
      <section id="${s.id}" data-sig="${s.id}"${k?' hidden':''}>
        ${status(s)}
        <p class="bt-lead">${lead(s)}</p>
        <h2 class="bt-h2" id="${s.id}-history">訊號在歷史走勢上的位置</h2>
        <p class="bt-note">箭頭＝計入的訊號首日。滑鼠滾輪放大縮小、按住拖曳左右移動（手機：兩指縮放、左右滑動），雙擊回到全部；點一下箭頭附近可跳到表一那一列。</p>
        <div class="card"><div class="bt-chartbar">
          <div class="tabs" data-preset="${s.id}">${[['1Y',365],['3Y',1095],['5Y',1826],['10Y',3652],['全部',0]].map(([t,n])=>`<button data-n="${n}"${n?'':' class="on"'}>${t}</button>`).join('')}</div>
          <div class="bt-dates"><input type="date" data-from="${s.id}" aria-label="起始日期"><i>–</i><input type="date" data-to="${s.id}" aria-label="結束日期"></div>
          <div class="tabs" data-scale="${s.id}"><button data-m="1" class="on">對數</button><button data-m="0">線性</button></div></div>
          <p class="bt-range" id="${s.id}-rg"></p>
          <div class="chart"><div class="chart-legend num" id="${s.id}-lg"></div><div class="bt-hist" id="${s.id}-hc" style="position:absolute;inset:0"></div></div></div>
        <h2 class="bt-h2" id="${s.id}-chart">訊號 vs 無條件基準：各持有週期期望值</h2>
        <p class="bt-note">首日收盤進場；基準＝所有交易日進場、持有相同天數的平均報酬。</p>
        <div class="card bt-card"><div class="bt-legend"><span><i class="bt-sw" style="background:${SIG_COLOR[s.id]||'#3B82F6'}"></i>訊號</span><span><i class="bt-sw" style="background:#5D677B"></i>無條件基準</span></div><div class="bt-ev" id="${s.id}-ev"></div></div>
        <h2 class="bt-h2" id="${s.id}-excess">超額表現</h2>
        ${btTable('excess',s.excess)}
        <p class="bt-note bt-after">相近的訊號會共用同一段漲勢（例如 2026 年的多筆強烈落底），樣本並非完全獨立，實際的可信度比樣本數看起來低。</p>
        <h2 class="bt-h2" id="${s.id}-events">表一　訊號日期追蹤表</h2>
        <p class="bt-note">「—」＝低點就是首日，不適用；「未達成(N天)」＝截至資料最後一天已經過 N 天仍未發生。站回／再跌破費時自前一事件起算。</p>
        ${btTable('events',s.events,{rowId:r=>`ev-${s.id}-${r['首日日期']}`})}
        <h2 class="bt-h2" id="${s.id}-summary">表二　多週期表現與極值統計摘要</h2>
        <p class="bt-note">只有「首日收盤」可以實際交易；兩種低點是事後才知道的，僅供參考（斜體）。灰字為無條件基準。持有週期未滿的事件不計入，列在「未完成」。</p>
        ${btTable('summary',s.summary,{group:'評估基準'})}
        <h2 class="bt-h2" id="${s.id}-pullbacks">表三　突破前高後回檔 5%／10%／15%／20%</h2>
        <p class="bt-note">回檔＝收盤價相對「突破日起的滾動最高收盤」的跌幅，費時自突破日起算。多個訊號共用同一個突破日時合併成一列。共 ${s.pullbacks.length} 個突破日。</p>
        ${s.pullbacks.length?btTable('pullbacks',s.pullbacks):'<p class="bt-note">目前沒有已突破前高的事件。</p>'}
        <h2 class="bt-h2" id="${s.id}-robust">穩健性檢查（持有 30／60 天）</h2>
        ${robust(s)}
        <p class="bt-note">分年度：基準＝同一年所有交易日。超額為負代表那一年訊號輸給隨便買。${mk.d[0].slice(5)!=='01-01'?`${mk.year[0]} 年資料從 ${+mk.d[0].slice(5,7)} 月開始，全年漲跌只算到該年第一天以後。`:''}</p>
        ${btTable('byYear',s.byYear)}
        <p class="bt-note bt-after">分盤勢：前三種分類在訊號當天就能判斷；「全年漲跌」要到年底才知道，只能用來理解訊號，不能拿來交易。基準＝同一組別的所有交易日。每組只有個位數到二十幾筆，差距要保守看待。</p>
        ${btTable('byRegime',s.byRegime,{group:'分類方式'})}
      </section>`;

    main.innerHTML=`
      <div class="crumb"><a href="index.html">主頁</a><span>/</span><span>訊號回測</span></div>
      <div class="card r-head">
        <div class="eyebrow">資料更新至 ${dt(res.last)}（${weekday(res.last)}）・${dt(res.first)} 起共 ${res.days.toLocaleString()} 個交易日</div>
        <h1>台股籌碼訊號回測</h1>
        <p class="bt-sub">加權指數收盤價，所有天數皆為日曆天，日期由新到舊。訊號觸發後 10 個交易日內不重複計算。資料直接讀取每日籌碼試算表，試算表更新後重新整理即會重算。</p>
        ${end?`<p class="bt-warn">驗算模式：只使用 ${dt(end)} 以前的資料。<a href="signals.html">回到最新資料 →</a></p>`:''}
        ${warn.length?`<details class="bt-warn"><summary>資料檢查有 ${data.warnings.length} 項提醒</summary><ul>${warn.map(w=>`<li>${w}</li>`).join('')}</ul></details>`:''}
      </div>
      <div class="bt-tabs" role="tablist">${res.signals.map((s,k)=>`<button class="bt-tab" role="tab" data-tab="${s.id}" aria-selected="${k?'false':'true'}">${s.label}</button>`).join('')}</div>
      ${res.signals.map(section).join('')}
      <details class="card bt-details" id="definitions"><summary>定義與計算方式</summary><ul>
        <li><b>資料來源</b>：每日籌碼試算表「工作表1」的加權指數收盤與「強烈落底」欄（BE 欄，值為 O）；「Sheet1」的外資 BP 金額。網頁開啟時即時讀取並計算。</li>
        <li><b>價格</b>：加權指數收盤價；沒有盤中高低。</li>
        <li><b>天數</b>：所有「費時」「到達天數」「持有週期」都是日曆天（兩個日期相減）。</li>
        <li><b>冷卻期</b>：訊號出現後 10 個交易日內的訊號不另計，以最後一個「計入」的訊號為起點。</li>
        <li><b>持有週期</b>：7／14／30／60／90 個日曆天，出場價取到期日當天或之前最後一個交易日的收盤。資料不足一個完整週期的事件列為「未完成」，不計入統計。</li>
        <li><b>BP紅燈（歷史前 2%）</b>：外資 BP 金額 ≥ 當天以前（含當天）所有資料由大到小第 k 大的值，k＝資料天數×2% 無條件捨去、至少 1。只用當天以前的資料，所以不會因為後來的資料而改變。連續亮燈只取第一天：距離上一個亮燈日滿 10 個交易日才算新的一次。</li>
        <li><b>30日內最低點</b>：首日起 30 個日曆天內（含首日）的最低收盤價。</li>
        <li><b>波段低點</b>：從首日開始追蹤最低收盤價，直到價格自這個低點反彈 10% 以上才確認（確認日）。小於 10% 的反彈不算，跌勢延續時低點會一直往後更新，所以有時離首日很遠。</li>
        <li><b>自最低站回首日</b>：從 30 日最低點的下一天起，第一次收盤高於首日收盤；天數從最低點起算。<b>站回後再跌破</b>：從站回日的下一天起，第一次收盤低於首日收盤。</li>
        <li><b>前高</b>：首日之前（不含首日）的歷史最高收盤價。<b>突破</b>：首日之後第一次收盤高於前高。</li>
        <li><b>回檔</b>：突破日起，每天的收盤價和「突破日以來的最高收盤（滾動最高）」比較；跌幅第一次超過門檻的日期，以及當時的基準高點。</li>
        <li><b>勝率</b>：期末報酬大於 0 的比例。<b>期望值</b>＝勝率×平均獲利W＋敗率×平均虧損L（等於平均報酬）。<b>盈虧比</b>＝W÷|L|。<b>報酬標準差</b>為樣本標準差。</li>
        <li><b>最大漲幅／最大跌幅</b>：持有期間收盤價相對進場價的最高／最低點；從沒高於（低於）進場價時記為 0%。</li>
        <li><b>無條件基準</b>：每一個交易日都當成進場日、持有相同天數的結果。2011 年以來台股大致向上，訊號要贏過這條基準才算有用。</li>
        <li><b>全年漲跌</b>：該年最後收盤 ÷ 前一年最後收盤 − 1；資料第一年用該年第一天的收盤。</li>
        <li><b>顏色</b>：沿用本站紅漲綠跌，正值紅、負值綠；橘色＝尚未發生（未達成、未突破、未站回、未確認）。</li>
        <li><b>資料檢查</b>：日期重複、沒有排序，或 2019 年以後出現週末日期時，頁首會列出提醒（2012～2018 年的週六是補班日，不算錯）。</li>
      </ul></details>`;

    /* 歷史走勢圖：分頁第一次顯示時才建立（隱藏時量不到寬度） */
    const made={};
    const histChart=s=>{
      if(made[s.id]||!window.LightweightCharts) return; made[s.id]=1;
      const el=$('#'+s.id+'-hc'), lg=$('#'+s.id+'-lg');
      const ch=baseChart(el,{rightPriceScale:{borderColor:'#232B3A',mode:1},timeScale:{borderColor:'#232B3A',fixLeftEdge:true,fixRightEdge:true,minBarSpacing:0.05},
        // 滑鼠滾輪＝放大縮小（以滑鼠位置為中心）；按住拖曳＝左右移動；手機兩指縮放、左右滑動，上下滑仍捲動頁面
        handleScroll:{mouseWheel:false,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
        handleScale:{mouseWheel:true,pinch:true,axisPressedMouseMove:{time:true,price:false},axisDoubleClickReset:false}});
      (window.__btCharts||(window.__btCharts={}))[s.id]=ch;   // 方便在主控台檢查
      const ser=ch.addAreaSeries({lineColor:'#60A5FA',topColor:'rgba(96,165,250,.2)',bottomColor:'rgba(96,165,250,.02)',lineWidth:1.5,priceFormat:{type:'price',precision:0,minMove:1}});
      ser.setData(mk.d.map((d,i)=>({time:d,value:mk.c[i]})));
      ser.setMarkers(s.idxs.map(i=>({time:mk.d[i],position:'belowBar',color:UP,shape:'arrowUp'})));
      ch.timeScale().fitContent();
      const evd=s.idxs.map(i=>mk.d[i]);
      const show=t=>{ const i=t?mk.idxOf.get(t):LAST; lg.innerHTML=`<b>${dt(mk.d[i])}</b> 加權 <b>${fmt(mk.c[i])}</b>${evd.includes(mk.d[i])?` ・<span style="color:${UP}">${s.name}</span>`:''}`; };
      show(); ch.subscribeCrosshairMove(p=>show(p&&tStr(p.time)));
      /* ---- 日期區間：滑鼠滾輪放大縮小、按住拖曳左右移動；快速按鈕與起訖日期；雙擊回到全部 ---- */
      const first=mk.d[0], lastD=mk.d[LAST];
      const tStr=t=>typeof t==='string'?t:(t&&t.year?`${t.year}-${String(t.month).padStart(2,'0')}-${String(t.day).padStart(2,'0')}`:null);
      const back=n=>new Date((dayNumOf(lastD)-n)*864e5).toISOString().slice(0,10);
      const iFrom=document.querySelector(`[data-from="${s.id}"]`), iTo=document.querySelector(`[data-to="${s.id}"]`), rgEl=$('#'+s.id+'-rg');
      [iFrom,iTo].forEach(x=>{ x.min=first; x.max=lastD; });
      const presets=document.querySelector(`[data-preset="${s.id}"]`);
      const ts=ch.timeScale();
      // want：用按鈕／日期指定的區間。圖表量到寬度前設定會失效，所以量到寬度時重新套用；使用者自己滾輪或拖曳後就清掉
      let want=[first,lastD], preset=0;
      const reapply=()=>{ if(el.clientWidth&&want) ts.setVisibleRange({from:want[0],to:want[1]}); };
      if(window.ResizeObserver) new ResizeObserver(()=>setTimeout(reapply,0)).observe(el);
      setTimeout(reapply,50);
      const summary=(a,b)=>{
        let i0=mk.lastOnOrBefore(dayNumOf(a)); if(i0<0||mk.d[i0]<a) i0++; const i1=mk.lastOnOrBefore(dayNumOf(b));
        if(i0<0||i1<=i0) return;
        a=mk.d[i0]; b=mk.d[i1]; iFrom.value=a; iTo.value=b;
        presets.querySelectorAll('button').forEach(x=>x.classList.toggle('on',preset!=null&&x.dataset.n===String(preset)));
        const chg=(mk.c[i1]/mk.c[i0]-1)*100, inR=evd.filter(d=>d>=a&&d<=b);
        rgEl.innerHTML=`<b class="num">${dt(a)} – ${dt(b)}</b>・${mk.days(i0,i1).toLocaleString()} 天・加權 <span class="num">${fmt(mk.c[i0])} → ${fmt(mk.c[i1])}</span>（<span class="num ${cls(chg)}">${sign(chg)}${chg.toFixed(2)}%</span>）・期間${s.name} <b class="num">${inR.length}</b> 次${inR.length&&inR.length<=12?`：${inR.slice().reverse().map(d=>`<a href="#ev-${s.id}-${d}" data-jump="${d}">${dt(d)}</a>`).join('、')}`:inR.length?'（日期見表一）':''}`;
      };
      const setRange=(a,b,p)=>{
        a=a<first?first:a>lastD?lastD:a; b=b<first?first:b>lastD?lastD:b; if(a>b) [a,b]=[b,a];
        if(a===b) return;
        want=[a,b]; preset=p; reapply(); summary(a,b);
      };
      // 圖表顯示範圍改變（滾輪、拖曳、按鈕）時，同步起訖日期與摘要
      let pend=0;
      ts.subscribeVisibleTimeRangeChange(()=>{ cancelAnimationFrame(pend); pend=requestAnimationFrame(()=>{ if(want) return; const r=ts.getVisibleRange(); if(r) summary(tStr(r.from),tStr(r.to)); }); });
      const byUser=()=>{ want=null; preset=null; };
      el.addEventListener('wheel',byUser,{passive:true});
      el.addEventListener('pointerdown',e=>{ if(e.button===0) byUser(); });
      presets.addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; const n=+b.dataset.n; setRange(n?back(n):first,lastD,n); });
      [iFrom,iTo].forEach(x=>x.addEventListener('change',()=>{ if(iFrom.value&&iTo.value) setRange(iFrom.value,iTo.value,null); }));
      rgEl.addEventListener('click',e=>{ const a=e.target.closest('[data-jump]'); if(!a) return; e.preventDefault(); jump(a.dataset.jump); });
      el.addEventListener('dblclick',()=>setRange(first,lastD,0));
      const jump=d=>{ const row=$('#ev-'+s.id+'-'+d); if(row){ row.scrollIntoView({behavior:'smooth',block:'center'}); row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); } };
      summary(first,lastD);

      // 點一下（沒有拖曳）箭頭附近：跳到表一那一列
      let downX=null;
      el.addEventListener('pointerdown',e=>{ downX=e.clientX; });
      ch.subscribeClick(p=>{ if(!p||!p.time) return; if(downX!=null&&p.point&&Math.abs(p.point.x+el.getBoundingClientRect().left-downX)>5) return;
        const t=dayNumOf(tStr(p.time)); let best=null;
        evd.forEach(d=>{ const g=Math.abs(dayNumOf(d)-t); if(g<=45&&(!best||g<best.g)) best={d,g}; });
        if(best) jump(best.d); });
      document.querySelector(`[data-scale="${s.id}"]`).addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return;
        ch.priceScale('right').applyOptions({mode:+b.dataset.m}); b.parentNode.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b)); });
    };
    const evMade={};
    const show=id=>{
      if(!res.signals.some(s=>s.id===id)) id=res.signals[0].id;
      document.querySelectorAll('.bt-tab').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===id?'true':'false'));
      document.querySelectorAll('section[data-sig]').forEach(x=>{ x.hidden=x.id!==id; });
      const s=res.signals.find(x=>x.id===id);
      histChart(s);
      if(!evMade[id]){ evMade[id]=1; evChart($('#'+id+'-ev'),s.excess,SIG_COLOR[id]||'#3B82F6'); }
    };
    document.querySelector('.bt-tabs').addEventListener('click',e=>{ const b=e.target.closest('.bt-tab'); if(!b) return;
      show(b.dataset.tab); history.replaceState(null,'',location.pathname+location.search+'#'+b.dataset.tab); });
    const h=(location.hash||'').slice(1).split('-')[0];
    show(h||res.signals[0].id);
    window.addEventListener('hashchange',()=>{ const id=location.hash.slice(1).split('-')[0]; if(id) show(id); });
    if(location.hash.length>1){ const t=document.getElementById(location.hash.slice(1)); if(t&&t.tagName!=='SECTION') setTimeout(()=>t.scrollIntoView(),50); }
    glossary(main);
  }).catch(err=>{
    console.error(err);
    main.innerHTML=`<div class="card r-head"><h1>台股籌碼訊號回測</h1><p style="margin-top:8px;color:var(--muted)">讀不到籌碼試算表或計算失敗（${String(err&&err.message||err)}）。請確認試算表的共用設定仍是「知道連結的任何人都能檢視」，再重新整理頁面。</p></div>`;
  });
}
/* =====================================================================
   全文搜尋與主題索引
   ===================================================================== */
const strip = s => String(s==null?'':s).replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ');
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const escHTML = s => s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const squash = s => s.replace(/\s/g,'').toLowerCase();
// 忽略空白；英數開頭／結尾要是完整單字（BP 不會命中 BPS）
function termPat(n){
  const t=n.trim(); if(!t) return null;
  const core=[...t.replace(/\s/g,'')].map(escRe).join('\\s*');
  return (/^[A-Za-z0-9]/.test(t)?'(?<![A-Za-z0-9])':'')+core+(/[A-Za-z0-9]$/.test(t)?'(?![A-Za-z0-9])':'');
}
const glossOf = q => (D.glossary||[]).find(([names])=>names.split('|').some(n=>squash(n)===squash(q)));
// 查詢字串 → {re, g}；與名詞表相符時一併搜尋同義詞（紫爆／紫燈）
function queryRe(q){
  const g=glossOf(q); const names=g?g[0].split('|'):[q];
  const pats=names.map(termPat).filter(Boolean); if(!pats.length) return null;
  return {re:new RegExp(pats.join('|'),'gi'), g};
}
// 每篇復盤拆成一條條可搜尋的句子
const DOCS = new Map();
function reviewDocs(r){
  if(DOCS.has(r.id)) return DOCS.get(r.id);
  const out=[]; const add=(a,l,t)=>{ t=strip(t).trim(); if(t) out.push({a,l,t}); };
  add('','標題',r.title); add('','摘要',r.summary);
  r.tldr.forEach(t=>add('','本週重點',t));
  const tbl=(a,l,keys)=>(keys||[]).forEach(k=>{ const t=D.tables[k]; if(!t) return;
    add(a,l+'・表格',t.title); t.rows.forEach(row=>add(a,l+'・'+strip(t.title),row.join('　'))); if(t.note) add(a,l+'・'+strip(t.title),t.note); });
  const items=(a,l,xs)=>(xs||[]).forEach(x=>add(a,l,typeof x==='string'?x:x.t));
  r.parts.forEach((p,k)=>{ const a='p'+(k+1);
    items(a,p.h,p.items); tbl(a,p.h,p.tables); if(p.quote) add(a,p.h,p.quote);
    (p.sub||[]).forEach(s=>{ items(a,p.h+'・'+s.h,s.items); tbl(a,p.h+'・'+s.h,s.tables); });
  });
  Object.entries(r.market||{}).forEach(([d,m])=>{ const l='市場資訊 '+md(d);
    if(m.facts.length) add('market',l,m.facts.map(f=>f.join(' ')).join('、')); m.notes.forEach(n=>add('market',l,n)); });
  DOCS.set(r.id,out); return out;
}
// 片段：命中處前後各取一些字，命中的字加 <mark>
function snippet(t,re){
  re.lastIndex=0; const m=re.exec(t); if(!m) return escHTML(t);
  const s=Math.max(0,m.index-28), e=Math.min(t.length,m.index+m[0].length+60);
  const w=t.slice(s,e); let h='', last=0; re.lastIndex=0; let x;
  while((x=re.exec(w))){ if(!x[0]){ re.lastIndex++; continue; } h+=escHTML(w.slice(last,x.index))+'<mark>'+escHTML(x[0])+'</mark>'; last=x.index+x[0].length; }
  return (s?'…':'')+h+escHTML(w.slice(last))+(e<t.length?'…':'');
}
function searchReviews(re){
  return D.reviews.map(r=>{ const hits=reviewDocs(r).filter(d=>{ re.lastIndex=0; return re.test(d.t); });
    const n=hits.reduce((c,d)=>c+(d.t.match(re)||[]).length,0); return {r,hits,n}; }).filter(x=>x.hits.length);
}
// 復盤日收盤到 n 個日曆天後（當天或之前最後一個交易日）的指數變化
function after(date,n){
  const target=dayNumOf(date)+n; let i=-1, j=-1;
  DAILY.forEach((d,k)=>{ if(d.time<=date) i=k; if(dayNumOf(d.time)<=target) j=k; });
  if(i<0||dayNumOf(DAILY[DAILY.length-1].time)<target||j<=i) return null;
  return (DAILY[j].value-DAILY[i].value)/DAILY[i].value*100;
}
const aftTxt = v => v==null?'<span class="dim">尚無</span>':`<span class="${cls(v)}">${sign(v)}${v.toFixed(2)}%</span>`;

function renderTopics(){
  nav('topics');
  const params=new URLSearchParams(location.search); const q0=params.get('q')||'';
  const chrono=D.reviews.slice().reverse();
  const T=(D.topics||[]).map(([grp,names])=>[grp,names.map(n=>{ const qr=queryRe(n); const res=searchReviews(qr.re);
    return {n,g:qr.g,res,ids:new Set(res.map(x=>x.r.id)),total:res.reduce((c,x)=>c+x.n,0)}; })]);

  $('#main').innerHTML = `
    <div class="card r-head">
      <div class="eyebrow">全文搜尋・主題索引</div>
      <h1>搜尋筆記</h1>
      <form class="search" id="sform" role="search" action="topics.html">
        <span class="search-ico" aria-hidden="true">⌕</span>
        <input id="q" name="q" type="search" value="${escHTML(q0)}" placeholder="例如：強烈落底、國安基金、外資空單" autocomplete="off" aria-label="搜尋所有復盤">
        <button type="button" class="search-x" id="qx" aria-label="清除">✕</button>
      </form>
      <p class="hint">搜尋全部 ${D.reviews.length} 篇復盤的內文、統計表與當週市場資訊。不分大小寫、忽略空白；同義詞會一起找（例如紫爆＝紫燈）。</p>
    </div>
    <div id="res"></div>
    <section class="sec" id="topics">
      <div class="sec-h"><h2>主題索引</h2><p>點主題看每次提到的週次與之後走勢・橫條＝${md(chrono[0].date)} 到 ${md(chrono[chrono.length-1].date)} 每篇一格</p></div>
      ${T.map(([grp,ts])=>`<h3 class="tgrp">${grp}</h3><div class="tgrid">${ts.map(t=>`
        <a class="card topic${t.res.length?'':' none'}" href="?q=${encodeURIComponent(t.n)}" data-q="${escHTML(t.n)}">
          <div class="topic-h"><b>${t.n}</b><span class="num">${t.res.length} 篇</span></div>
          <p>${t.g?t.g[1]:''}</p>
          <div class="strip" aria-hidden="true">${chrono.map(r=>`<i class="${t.ids.has(r.id)?'on':''}"></i>`).join('')}</div>
        </a>`).join('')}</div>`).join('')}
    </section>`;

  const inp=$('#q'), res=$('#res');
  const run=(q,push)=>{
    q=q.trim();
    const url=q?'?q='+encodeURIComponent(q):location.pathname;
    if(push) history.pushState(null,'',url); else history.replaceState(null,'',url);
    $('#qx').hidden=!q; document.title=(q?`「${q}」搜尋｜`:'搜尋與主題｜')+'MTX 復盤筆記';
    if(!q){ res.innerHTML=''; return; }
    const qr=queryRe(q); if(!qr){ res.innerHTML=''; return; }
    const R=searchReviews(qr.re), total=R.reduce((c,x)=>c+x.n,0);
    const href=r=>`reviews/${r.id}.html?q=${encodeURIComponent(q)}`;
    res.innerHTML = `<section class="sec">
      ${qr.g?`<div class="card gdef"><b>${qr.g[0].split('|').join('／')}</b>${qr.g[1]}</div>`:''}
      <div class="sec-h"><h2>「${escHTML(q)}」</h2><p>${R.length?`${R.length} 篇・共 ${total} 處・最新在最上面`:'沒有找到符合的內容'}</p></div>
      ${R.length?`<div class="card tscroll"><table class="t ftbl"><thead><tr><th>復盤日</th><th class="r">當日收盤</th><th class="r">之後 7 天</th><th class="r">之後 30 天</th><th class="r">提到</th></tr></thead><tbody>
        ${R.map(({r,n})=>`<tr><td><a href="${href(r)}">${r.date.replace(/-/g,'/')}</a></td><td class="r num">${fmt(r.close)}</td><td class="r num">${aftTxt(after(r.date,7))}</td><td class="r num">${aftTxt(after(r.date,30))}</td><td class="r num">${n} 處</td></tr>`).join('')}
        </tbody></table><div class="tbl-n">「之後 N 天」＝復盤日收盤到 N 個日曆天後（當天或之前最後一個交易日）收盤的加權指數變化，只是當週提到此主題後的大盤走勢，不代表訊號本身的績效。</div></div>
      <div class="hits">${R.map(({r,hits,n})=>{ const show=hits.slice(0,4), more=hits.slice(4);
        const li=d=>`<li><a href="${href(r)}${d.a?'#'+d.a:''}"><span class="hl-l">${escHTML(d.l)}</span>${snippet(d.t,qr.re)}</a></li>`;
        return `<div class="card hit">
          <a class="hit-h" href="${href(r)}"><span class="num">${r.date.replace(/-/g,'/')}</span><b>${r.title}</b><em class="num">${n} 處</em></a>
          <ul>${show.map(li).join('')}</ul>
          ${more.length?`<details><summary>再顯示 ${more.length} 處</summary><ul>${more.map(li).join('')}</ul></details>`:''}
        </div>`; }).join('')}</div>`:`<div class="card empty">試試較短的關鍵字，或從下方主題索引挑一個。</div>`}
    </section>`;
  };
  let tm; inp.addEventListener('input',()=>{ clearTimeout(tm); tm=setTimeout(()=>run(inp.value,false),180); });
  $('#sform').addEventListener('submit',e=>{ e.preventDefault(); run(inp.value,false); inp.blur(); });
  $('#qx').addEventListener('click',()=>{ inp.value=''; run('',false); inp.focus(); });
  $('#topics').addEventListener('click',e=>{ const a=e.target.closest('.topic'); if(!a) return; e.preventDefault();
    inp.value=a.dataset.q; run(a.dataset.q,true); res.scrollIntoView({behavior:'smooth',block:'start'}); });
  window.addEventListener('popstate',()=>{ const q=new URLSearchParams(location.search).get('q')||''; inp.value=q; run(q,false); });
  run(q0,false);
  if(!q0) inp.focus();
}

// 從搜尋結果點進復盤頁：標出命中處，可逐一跳轉
function highlightHits(root){
  const q=(new URLSearchParams(location.search).get('q')||'').trim(); if(!q||!root) return;
  const qr=queryRe(q); if(!qr) return; const re=qr.re;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>
    n.nodeValue.trim()&&!n.parentElement.closest('script,style,.chart,.toc,.crumb,.pager')?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT});
  const nodes=[]; while(walker.nextNode()) nodes.push(walker.currentNode);
  // 跨標籤的字（例如 <b>V</b> 轉）不處理，只標單一文字節點內的命中
  nodes.forEach(node=>{ const t=node.nodeValue; re.lastIndex=0; if(!re.test(t)) return;
    const f=document.createDocumentFragment(); let last=0, m; re.lastIndex=0;
    while((m=re.exec(t))){ if(!m[0]){ re.lastIndex++; continue; } f.append(t.slice(last,m.index)); const k=document.createElement('mark'); k.className='hit-m'; k.textContent=m[0]; f.append(k); last=m.index+m[0].length; }
    f.append(t.slice(last)); node.replaceWith(f); });
  const marks=[...root.querySelectorAll('mark.hit-m')];
  const bar=document.createElement('div'); bar.className='findbar';
  bar.innerHTML=`<span>搜尋「<b>${escHTML(q)}</b>」${marks.length?`<span class="num" id="fpos"></span>`:'：本篇沒有直接命中（可能在跨格式的文字中）'}</span>
    ${marks.length?'<button type="button" id="fprev" aria-label="上一處">↑</button><button type="button" id="fnext" aria-label="下一處">↓</button>':''}
    <a href="../topics.html?q=${encodeURIComponent(q)}">回搜尋結果</a><button type="button" id="fclose" aria-label="關閉">✕</button>`;
  document.body.append(bar);
  let cur=-1;
  const go=(i,instant)=>{ if(!marks.length) return; marks.forEach(m=>m.classList.remove('cur')); cur=(i+marks.length)%marks.length;
    marks[cur].classList.add('cur'); marks[cur].scrollIntoView({behavior:instant?'auto':'smooth',block:'center'}); $('#fpos').textContent=`　${cur+1} / ${marks.length}`; };
  if(marks.length){ $('#fprev').onclick=()=>go(cur-1); $('#fnext').onclick=()=>go(cur+1);
    // 有指定段落就從該段的第一處開始
    const sec=location.hash&&document.getElementById(location.hash.slice(1));
    const first=sec?marks.findIndex(m=>sec.contains(m)):0; setTimeout(()=>go(Math.max(0,first),true),60); }
  $('#fclose').onclick=()=>{ bar.remove(); marks.forEach(m=>m.replaceWith(...m.childNodes)); root.normalize();
    history.replaceState(null,'',location.pathname+location.hash); };
}

/* =====================================================================
   專有名詞懸浮說明
   ===================================================================== */
function glossary(root){
  const G=D.glossary||[]; if(!root||!G.length) return;
  const def=new Map(); const pats=[];
  G.forEach(([names,d],gi)=>names.split('|').forEach(n=>{
    def.set(n.replace(/\s/g,''),gi);
    const esc=n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/ /g,'\\s?');
    pats.push({n,p:/^[\w]/.test(n)?`(?<![A-Za-z0-9])${esc}(?![A-Za-z0-9])`:esc});
  }));
  pats.sort((a,b)=>b.n.length-a.n.length);
  const re=new RegExp(pats.map(x=>x.p).join('|'),'g');
  const SKIP='a,script,style,.noterm,.term,.chart,.chart-legend,.toc,.nav,.num,button,.colpick,#dtable';
  const seen=new WeakMap();
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>
    n.nodeValue.trim()&&!n.parentElement.closest(SKIP)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT});
  const nodes=[]; while(walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node=>{
    const scope=node.parentElement.closest('.part,.tldr,.r-head,.day,.tbl,.card,section')||root;
    if(!seen.has(scope)) seen.set(scope,new Set());
    const used=seen.get(scope); const txt=node.nodeValue;
    let last=0, frag=null; re.lastIndex=0; let m;
    while((m=re.exec(txt))){
      const gi=def.get(m[0].replace(/\s/g,'')); if(gi==null||used.has(gi)) continue;
      used.add(gi); frag=frag||document.createDocumentFragment();
      frag.append(txt.slice(last,m.index));
      const s=document.createElement('span'); s.className='term'; s.tabIndex=0; s.dataset.g=gi; s.textContent=m[0];
      frag.append(s); last=m.index+m[0].length;
    }
    if(frag){ frag.append(txt.slice(last)); node.replaceWith(frag); }
  });

  const tip=document.createElement('div'); tip.className='tip'; tip.setAttribute('role','tooltip'); document.body.append(tip);
  let cur=null;
  const show=el=>{ cur=el; const [names,d]=G[+el.dataset.g];
    tip.innerHTML=`<b>${names.split('|')[0]}</b>${d}`; tip.classList.add('on');
    const r=el.getBoundingClientRect(), w=tip.offsetWidth, h=tip.offsetHeight, vw=document.documentElement.clientWidth;
    const left=Math.max(8,Math.min(vw-w-8,r.left+r.width/2-w/2));
    const top=r.top-h-8<64?r.bottom+8:r.top-h-8;
    tip.style.left=left+'px'; tip.style.top=top+'px'; };
  const hide=()=>{ cur=null; tip.classList.remove('on'); };
  root.addEventListener('mouseover',e=>{ const t=e.target.closest('.term'); if(t&&t!==cur) show(t); });
  root.addEventListener('mouseout',e=>{ const t=e.target.closest('.term'); if(t&&!t.contains(e.relatedTarget)) hide(); });
  root.addEventListener('focusin',e=>{ if(e.target.classList.contains('term')) show(e.target); });
  root.addEventListener('focusout',hide);
  document.addEventListener('click',e=>{ const t=e.target.closest('.term'); if(t){ t===cur&&e.pointerType!=='mouse'?hide():show(t); } else hide(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') hide(); });
  window.addEventListener('scroll',hide,{passive:true});
}

if(page==='home'){ renderHome(); glossary(document.querySelector('main')); }
if(page==='review'){ renderReview(document.body.dataset.id); highlightHits($('#main')); glossary($('#main')); }
if(page==='chips') renderChips();
if(page==='topics'){ renderTopics(); }
if(page==='signals') renderSignals();
})();
