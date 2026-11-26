/* MTX 復盤筆記 — 頁面渲染（主頁與每週復盤共用） */
(function(){
'use strict';
const D = window.MTX;
const UP='#EF4444', DN='#10B981', PURPLE='#A855F7';
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
  const ch=LightweightCharts.createChart(el,Object.assign({
    autoSize:true,
    layout:{background:{type:'solid',color:'#151A23'},textColor:'#8A94A7',fontSize:11,fontFamily:"'JetBrains Mono',monospace"},
    grid:{vertLines:{visible:false},horzLines:{color:'rgba(35,43,58,.6)'}},
    rightPriceScale:{borderColor:'#232B3A'},
    timeScale:{borderColor:'#232B3A',fixLeftEdge:true,fixRightEdge:true,minBarSpacing:0.05},
    crosshair:{mode:LightweightCharts.CrosshairMode.Magnet,vertLine:{color:'#5D677B',labelBackgroundColor:'#2E3850'},horzLine:{color:'#5D677B',labelBackgroundColor:'#2E3850'}},
    // 全站圖表：電腦點一下圖表後才用滾輪放大縮小（見 clickToZoom）、按住拖曳左右移動；手機兩指縮放、左右滑動（上下滑仍捲動頁面）
    handleScroll:{mouseWheel:false,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
    handleScale:{mouseWheel:false,pinch:true,axisPressedMouseMove:{time:true,price:false},axisDoubleClickReset:false},
    localization:{locale:'zh-TW'}
  },extra||{}));
  clickToZoom(ch,el);
  return ch;
}
/* 電腦版：滾輪平常用來捲動頁面；點一下圖表後，滾輪才變成放大縮小（圖表加外框）；滑鼠一離開圖表就恢復捲動頁面，要縮放得再點一次。
   滑鼠停在還沒啟用的圖表上時顯示一行提示，移開或點下去就消失。手機不受影響（兩指縮放）。 */
function clickToZoom(ch,el){
  if(getComputedStyle(el).position==='static') el.style.position='relative';
  let on=false;
  const tip=document.createElement('div'); tip.className='zoom-tip'; tip.textContent='點一下圖表，就能用滾輪放大縮小'; el.appendChild(tip);
  const set=v=>{ on=v; ch.applyOptions({handleScale:{mouseWheel:v}}); el.classList.toggle('zoom-on',v); tip.classList.toggle('on',false); };
  el.addEventListener('pointerenter',e=>{ if(e.pointerType==='mouse'&&!on) tip.classList.add('on'); });
  el.addEventListener('pointerdown',e=>{ if(e.pointerType==='mouse'&&!on) set(true); });
  el.addEventListener('pointerleave',e=>{ if(e.pointerType!=='mouse') return; tip.classList.remove('on'); if(on) set(false); });
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
    // BP紅燈門檻：試算表資料用逐日滾動門檻（歷史前 2%）；退回筆記數字時用 36.4 億（3,640,000 千元）
    if(C.fiBPThr){ const l2=c2.addLineSeries({color:UP,lineStyle:2,lineWidth:1,title:'BP紅燈',priceLineVisible:false,crosshairMarkerVisible:false,priceFormat:{type:'volume'}});
      l2.setData(pick(C.fiBPThr).map(x=>({time:x.time,value:x.v}))); }
    else h2.createPriceLine({price:3640000,color:UP,lineStyle:2,lineWidth:1,title:'BP紅燈'});
    c2.timeScale().fitContent();
  }
  const sub3=$(ids[2]+'s'); if(sub3) sub3.textContent=C.micro?'柱＝微台多單（口）・線＝微台持倉百分位':'柱＝口數・線＝持倉比';
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
    <div class="card"><div class="card-h"><span>散戶多單</span> <span class="sub" id="${p}3s">柱＝口數・線＝持倉比</span></div><div class="mini" id="${p}3"></div></div>
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
    const R=d.rows, L=R[R.length-1], P=R[R.length-2]||{};
    const lastStrong=[...R].reverse().find(isStrong);
    const cell=(k,v,sub,c='')=>`<div><span>${k}</span><b class="num ${c}">${v}</b>${sub?`<em>${sub}</em>`:''}</div>`;
    el.innerHTML = head + `
      <div class="eyebrow">資料更新至 ${L.date.replace(/-/g,'/')}（${weekday(L.date)}）</div>
      <div class="hero-price"><span class="px num ${cls(L.chg)}">${n2(L.idx)}</span><span class="ch num ${cls(L.chg)}">${sign(L.chg)}${n2(L.chg)}（${sign(L.pct)}${L.pct==null?'—':L.pct.toFixed(2)}%）</span><span class="badge">加權指數收盤</span></div>
      <div class="dgrid">
        ${cell('外資期貨（相對結算）',n0(L.fiRel)+' 口','較前日 '+(L.fiDelta==null?'—':sign(L.fiDelta)+fmt(L.fiDelta,0)),cls(L.fiRel))}
        ${cell('外資現貨',sign(L.fiSpot)+n2(L.fiSpot)+' 億','',cls(L.fiSpot))}
        ${cell('外資 BP 金額',n0(L.bp),'BC '+n0(L.bc)+'・SC '+n0(L.sc))}
        ${cell('微台多單／空單',n0(L.mxLong)+'／'+n0(L.mxShort),'多單較前日 '+(P.mxLong==null||L.mxLong==null?'—':sign(L.mxLong-P.mxLong)+fmt(L.mxLong-P.mxLong,0)))}
      </div>
      <div class="sigs"><span class="sigs-h">今日訊號</span>${sigPills(L)}${lastStrong?`<span class="sigs-last">最近強烈落底 <b class="num">${lastStrong.date.replace(/-/g,'/')}</b></span>`:''}</div>
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
    /* 目前部位：從最近一次進場（posBase）依加權收盤推算槓桿 L′＝L×(1+r)÷(1+L×r) */
    const P=D.reviews[0].posBase, kp=$('#kpiPos');
    if(P&&kp&&L&&L.idx!=null&&L.date>=P.date){
      const r=L.idx/P.price-1, lev=P.lev*(1+r)/(1+P.lev*r);
      if(lev>0&&isFinite(lev)){
        kp.innerHTML=`<span>目前部位（推算）</span><b class="num">${lev.toFixed(2)}x</b><em>${md(P.date)} 以 ${P.lev} 倍進場，依 ${md(L.date)} 收盤推算</em>`;
        const hp=$('#heroPos'); if(hp) hp.textContent=`${lev.toFixed(2)}x（推算）`;
      }
    }
    const B=d.bpSeries||[], kb=$('#kpiBP'); if(!kb||!B.length) return;
    const from=D.campaign.high.date, T=S.bpRedLine(B), thr=T[T.length-1].thr; let peak=null, lit=null;
    T.forEach(s=>{
      if(s.date<from) return;
      if(!peak||s.bp>peak.bp) peak=s;
      if(!lit&&s.bp>=s.thr) lit=s;
    });
    if(!peak) return;
    const yi=v=>(v/1e5).toFixed(1)+' 億';   // 試算表金額單位是千元：千元 ÷ 10 萬 ＝ 億
    kb.innerHTML=`<span>外資 BP 峰值（${md(peak.date)}）</span><b class="num" style="color:#C084FC">${yi(peak.bp)}</b><em>紅燈約 ${yi(thr)}，${lit?md(lit.date)+' 觸發':'未觸發'}</em>`;
  }).catch(()=>{});
}
/* 主頁每日短評：讀試算表工作表1「每日短評」欄。最近 5 則直接顯示，更早的照月份收合（最新的月份展開）。
   短評開頭寫「強度＋方向」（例如「強烈看多，」「中等看多，」「看空。」「中立：」）就列入主頁最下面的「判斷回測」；
   強度是方向前面最多 4 個字（強烈、中等、輕微…），方向後面要接標點或空白（避免「多單減少」被當成看多） */
const NOTE_TAG=/^\s*(?:[【\[「(（]\s*([^\s，,。：:、【】\[\]「」()（）]{0,4}?)(看多|看空|偏多|偏空|多|空|中立|中性|觀望)\s*[】\]」)）]|([^\s，,。：:、【】\[\]「」()（）]{0,4}?)(看多|看空|偏多|偏空|多|空|中立|中性|觀望)(?=[\s。：:，,、｜|．.!！]|$))[\s。：:，,、｜|．.!！]*/;
const noteTag=t=>{ const s=String(t), m=s.match(NOTE_TAG); if(!m) return {dir:null,text:s};
  const pre=m[1]??m[3]??'', w=m[2]||m[4], dir=/多/.test(w)?'多':/空/.test(w)?'空':'中立';
  return {dir, label:pre+w, strength:pre, text:s.slice(m[0].length)}; };
const escTxt=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pctJ=(v,d=2)=>v==null?'—':`${sign(v)}${v.toFixed(d)}%`;

// 判斷回測：某天收盤 → N 個日曆天後（當天或之前最後一個交易日）收盤的漲跌（%）；還沒滿 N 天回傳 null
const JUDGE_H=[7,30,90], JUDGE_T={7:1,30:2,90:3};   // 持平門檻（%）：漲跌在 ±門檻以內不算對錯
const closeOn=(rows,date)=>{ let c=null; for(const r of rows){ if(r.date>date) break; c=r; } return c; };
function fwdRet(rows,date,n){
  const a=closeOn(rows,date), t=dayNumOf(date)+n;
  if(!a||dayNumOf(rows[rows.length-1].date)<t) return null;
  let b=a; for(const r of rows){ if(dayNumOf(r.date)>t) break; b=r; }
  return b===a?null:(b.idx-a.idx)/a.idx*100;
}
// 對錯：多＝漲超過門檻、空＝跌超過門檻、中立＝漲跌都在門檻以內；多／空在門檻以內＝持平（不計）
function judge(dir,r,n){
  if(r==null) return null; const t=JUDGE_T[n];
  if(dir==='中立') return Math.abs(r)<=t?'ok':'ng';
  const s=dir==='空'?-r:r; return s>t?'ok':s<-t?'ng':'flat';
}
const JMARK={ok:'<b class="j-ok">✓</b>',ng:'<b class="j-ng">✗</b>',flat:'<span class="dim">持平</span>'};
const jCell=(dir,r,n)=>r==null?'<span class="pend">未到</span>':`<span class="${cls(r)}">${pctJ(r)}</span> ${JMARK[judge(dir,r,n)]}`;
const avgArr=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
// items：[{dir:'多'|'空'|'中立', r:{7,30,90}}]
function judgeStats(items,n){
  const done=items.filter(x=>x.r[n]!=null), cnt=(dir,v)=>done.filter(x=>judge(dir||x.dir,x.r[n],n)===v).length;
  const ok=cnt(null,'ok'), ng=cnt(null,'ng'), bok=cnt('多','ok'), bng=cnt('多','ng');
  const dirs=done.filter(x=>x.dir!=='中立');
  return {n:done.length, pending:items.length-done.length, ok, ng, flat:done.length-ok-ng,
    hit:ok+ng?ok/(ok+ng):null, bull:bok+bng?bok/(bok+bng):null,
    ev:avgArr(dirs.map(x=>x.dir==='空'?-x.r[n]:x.r[n])), evBull:avgArr(dirs.map(x=>x.r[n]))};
}
const hitTxt=v=>v==null?'—':`${(v*100).toFixed(0)}%`;
const JUDGE_MIN=30;   // 少於這個數字就標「樣本不足」
function judgeTable(items,labels){
  return `<div class="tscroll"><table class="t bt jt"><thead><tr><th>期間</th><th>已到期</th><th>對</th><th>錯</th><th>持平</th><th>命中率</th><th>永遠看多<br>命中率</th><th>照判斷<br>平均報酬</th><th>永遠看多<br>平均報酬</th></tr></thead><tbody>
    ${JUDGE_H.map(n=>{ const s=judgeStats(items,n);
      return `<tr><td>${labels[n]}<span class="dim">（${n} 天・±${JUDGE_T[n]}%）</span></td><td>${s.n}${s.pending?`<span class="dim">（未到 ${s.pending}）</span>`:''}</td><td>${s.ok}</td><td>${s.ng}</td><td>${s.flat}</td>
        <td><b>${hitTxt(s.hit)}</b>${s.n&&s.n<JUDGE_MIN?'<span class="pend">樣本不足</span>':''}</td><td>${hitTxt(s.bull)}</td>
        <td class="${s.ev==null?'':cls(s.ev)}">${pctJ(s.ev)}</td><td class="${s.evBull==null?'':cls(s.evBull)}">${pctJ(s.evBull)}</td></tr>`; }).join('')}
  </tbody></table></div>`;
}

function dailyNotes(){
  const S=window.MTXSheet, box=$('#notes'), sec=$('#notesSec'); if(!S||!box||!sec) return;
  S.load().then(d=>{
    const rows=d.rows, N=rows.filter(r=>r.note).reverse(); if(!N.length) return;
    const SHOW=5; let open=false;
    const item=(r,i)=>{ const {dir,label,text}=noteTag(r.note);
      const res=dir?`<div class="nj">${JUDGE_H.map(n=>`<span>${n} 天後 ${jCell(dir,fwdRet(rows,r.date,n),n)}</span>`).join('')}</div>`:'';
      return `<div class="card nitem${i===0?' latest':''}">
        <div class="d"><b>${r.date.replace(/-/g,'/')}</b><em>${weekday(r.date)}</em><span class="num ${cls(r.chg)}">${fmt(r.idx)}　${sign(r.pct)}${r.pct==null?'—':r.pct.toFixed(2)}%</span></div>
        <div><p>${dir?`<span class="ntag ntag-${dir==='多'?'up':dir==='空'?'down':'flat'}">${escTxt(label)}</span>`:''}${escTxt(text)}</p>${res}</div></div>`; };
    // 更早的短評：依月份分組，最新的月份展開
    const months=[]; N.slice(SHOW).forEach((r,k)=>{ const m=r.date.slice(0,7); let g=months[months.length-1]; if(!g||g.m!==m) months.push(g={m,list:[]}); g.list.push([r,k+SHOW]); });
    const older=()=>months.map((g,k)=>`<details class="nmonth"${k?'':' open'}><summary>${g.m.replace('-','/')}<span class="dim">（${g.list.length} 則）</span></summary><div class="nlist">${g.list.map(([r,i])=>item(r,i)).join('')}</div></details>`).join('');
    const draw=()=>{
      box.innerHTML=N.slice(0,SHOW).map(item).join('')+(months.length?`<button class="nmore" type="button">${open?'收起更早的短評':`看更早的短評（共 ${N.length-SHOW} 則，依月份分類）`}</button>${open?older():''}`:'');
      const b=box.querySelector('.nmore'); if(b) b.onclick=()=>{ open=!open; draw(); };
    };
    $('#notesCount').textContent=`最新在最上面・最近更新 ${N[0].date.replace(/-/g,'/')}`;
    sec.hidden=false; draw();
  }).catch(()=>{});
}

/* 主頁最下面「判斷回測」：
   1. 每日短評：開頭標「多／空／中立」的短評，看之後 7／30／90 天（日曆天）的漲跌對不對。
   2. 每週復盤：每篇復盤的部位比上一篇高＝加碼（看多）、低＝減碼（看空），看復盤日之後的漲跌；並比較「照復盤部位」和「一直抱 1 倍」 */
const levOf=s=>{ const p=String(s||'').split('→').pop(); if(/清倉/.test(p)) return 0; const m=p.match(/([\d.]+)\s*(x|%)/i); return m?(m[2]==='%'?+m[1]/100:+m[1]):null; };
const LEV_EPS=0.15;   // 部位變化小於這個倍數算「維持」
function judgeSec(){
  const S=window.MTXSheet, el=$('#judge'), sec=$('#judgeSec'); if(!S||!el||!sec) return;
  S.load().then(d=>{
    const rows=d.rows, last=rows[rows.length-1];
    // 1. 每日短評
    const notes=rows.filter(r=>r.note).map(r=>({date:r.date,...noteTag(r.note)})).filter(x=>x.dir);
    notes.forEach(x=>{ x.r={}; JUDGE_H.forEach(n=>x.r[n]=fwdRet(rows,x.date,n)); });
    const groupBy=(list,key)=>{ const m=new Map(); list.forEach(x=>{ const k=key(x); if(!m.has(k)) m.set(k,[]); m.get(k).push(x); }); return [...m]; };
    const cnt={多:0,空:0,中立:0}; notes.forEach(x=>cnt[x.dir]++);
    // 分組命中率（每個月／每種強度）：看 7、30 天，和同一批日子「永遠看多」比
    const grpTable=(head,groups)=>`<div class="tscroll"><table class="t bt jt"><thead><tr><th>${head}</th><th>則數</th>${JUDGE_H.slice(0,2).map(n=>`<th>${n} 天命中率</th><th>${n} 天永遠看多</th>`).join('')}</tr></thead><tbody>
        ${groups.map(([k,list])=>`<tr><td>${k}</td><td>${list.length}</td>${JUDGE_H.slice(0,2).map(n=>{ const s=judgeStats(list,n); return `<td><b>${s.n?hitTxt(s.hit):'<span class="pend">未到</span>'}</b></td><td>${s.n?hitTxt(s.bull):'—'}</td>`; }).join('')}</tr>`).join('')}
      </tbody></table></div>`;
    const ORDER=['多','空','中立'];
    const STR=['強烈','中等','輕微',''], rk=s=>{ const i=STR.indexOf(s); return i<0?STR.length:i; };
    const byLabel=groupBy(notes,x=>x.label).sort((a,b)=>ORDER.indexOf(a[1][0].dir)-ORDER.indexOf(b[1][0].dir)||rk(a[1][0].strength)-rk(b[1][0].strength));
    const notesHtml=notes.length?`
      <p class="bt-note">已標方向的短評 ${notes.length} 則（看多 ${cnt.多}・看空 ${cnt.空}・中立 ${cnt.中立}）。</p>
      ${judgeTable(notes,{7:'一週',30:'一個月',90:'一季'})}
      <h3 class="bt-h3">依強度（「強烈」有沒有比「中等」準？）</h3>${grpTable('判斷',byLabel)}
      <h3 class="bt-h3">每個月的命中率（看有沒有進步）</h3>${grpTable('月份',groupBy(notes,x=>x.date.slice(0,7).replace('-','/')).reverse())}`
      :'<p class="bt-note">還沒有標方向的短評。短評開頭寫「強度＋方向」（例如「強烈看多，」「中等看空，」「中立：」），就會列入這裡。</p>';

    // 2. 每週復盤的部位
    const R=D.reviews.slice().reverse().map(r=>({r,L:levOf(r.position)})).filter(x=>x.L!=null);
    R.forEach((x,i)=>{ const p=i?R[i-1].L:null, dL=p==null?null:x.L-p;
      x.act=dL==null?'起點':dL>=LEV_EPS?'加碼':dL<=-LEV_EPS?'減碼':'維持';
      x.dir=x.act==='加碼'?'多':x.act==='減碼'?'空':null;
      x.close=closeOn(rows,x.r.date); x.ret={}; JUDGE_H.forEach(n=>x.ret[n]=fwdRet(rows,x.r.date,n)); });
    const acts=R.filter(x=>x.dir).map(x=>({dir:x.dir,r:x.ret}));
    // 照部位 vs 一直抱 1 倍：兩篇復盤之間用前一篇的部位（簡化：不含週中買賣與正 2 每日重設）
    let eq=1, bh=1;
    R.forEach((x,i)=>{ const a=x.close, b=i<R.length-1?R[i+1].close:last; if(!a||!b||b.date<=a.date) return; const r=b.idx/a.idx-1; eq*=1+x.L*r; bh*=1+r; });
    const avgL=avgArr(R.slice(0,-1).map(x=>x.L));
    const revHtml=`
      <p class="bt-note">復盤 ${R.length} 篇：加碼 ${R.filter(x=>x.act==='加碼').length} 次、減碼 ${R.filter(x=>x.act==='減碼').length} 次、維持 ${R.filter(x=>x.act==='維持').length} 次。部位比上一篇高 ${LEV_EPS} 倍以上算加碼（看多）、低 ${LEV_EPS} 倍以上算減碼（看空），從復盤日收盤開始算（實際買賣可能在週中）。</p>
      ${judgeTable(acts,{7:'一週',30:'一個月',90:'一季'})}
      <div class="kpis k3 jk">
        <div class="kpi"><span>照復盤部位</span><b class="num ${cls(eq-1)}">${pctJ((eq-1)*100,1)}</b><em>${md(R[0].r.date)} 起，到 ${md(last.date)}</em></div>
        <div class="kpi"><span>一直抱 1 倍</span><b class="num ${cls(bh-1)}">${pctJ((bh-1)*100,1)}</b><em>同期間加權指數</em></div>
        <div class="kpi"><span>平均部位</span><b class="num">${avgL==null?'—':avgL.toFixed(2)+' 倍'}</b><em>各篇復盤部位的平均</em></div>
      </div>
      <div class="tscroll"><table class="t bt jt"><thead><tr><th>復盤日</th><th>部位</th><th>倍數</th><th>動作</th>${JUDGE_H.map(n=>`<th>${n} 天後</th>`).join('')}</tr></thead><tbody>
        ${R.slice().reverse().map(x=>`<tr><td><a href="${reviewUrl(x.r)}">${x.r.date.replace(/-/g,'/')}</a></td><td class="tx">${escTxt(x.r.position)}</td><td>${x.L.toFixed(2)}</td>
          <td class="${x.act==='加碼'?'up':x.act==='減碼'?'down':''}">${x.act}</td>${JUDGE_H.map(n=>`<td>${x.dir?jCell(x.dir,x.ret[n],n):x.ret[n]==null?'<span class="pend">未到</span>':`<span class="${cls(x.ret[n])}">${pctJ(x.ret[n])}</span>`}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>`;

    el.innerHTML=`
      <div class="card jcard"><h3>每日短評：看多看空準不準？</h3>${notesHtml}</div>
      <div class="card jcard"><h3>每週復盤：加減碼之後漲還是跌？</h3>${revHtml}</div>
      <p class="bt-note">怎麼算：日數一律用日曆天，第 N 天沒開盤就用之前最後一個交易日的收盤。漲跌在 ±門檻（一週 1%、一個月 2%、一季 3%）以內算「持平」，不算對錯；「中立」則是漲跌都在門檻以內才算對。
        <b>命中率要和「永遠看多」比</b>：台股長期偏多，每天都說看多也會有不低的命中率，贏過它才代表判斷有加分。平均報酬＝照判斷做多／做空的平均漲跌（中立不算）。
        樣本少於 ${JUDGE_MIN} 次時標「樣本不足」；一季的期間彼此重疊很多，實際上獨立的判斷很少，只當參考。照復盤部位＝兩篇復盤之間都用前一篇的部位倍數乘上指數漲跌（簡化，不含週中買賣與正 2 每日重設）。</p>`;
    sec.hidden=false;
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
        <div><span>部位</span><b id="heroPos">${latest.position||'—'}</b></div>
      </div>
      <div class="pills hk-pills"><span class="sigs-h">本週重點</span>${latest.pills.map(([c,t])=>`<span class="pill ${c}">${t}</span>`).join('')}</div>
      <div class="ctas"><a class="cta" href="${reviewUrl(latest)}">閱讀本週復盤 →</a><a class="cta ghost" href="#list">所有復盤</a></div>
    </div>
    <div class="card hero-main feat feat-chips" id="daily"><div class="feat-tag"><i class="live"></i>每日籌碼<span>每日更新</span></div><p class="loading">讀取試算表中…</p></div>`;
  dailyCard($('#daily'));
  setTimeout(()=>campaignLive(lo,peakIntra));
  setTimeout(dailyNotes);
  setTimeout(judgeSec);
  $('#campaign').innerHTML = `<div class="card"><div class="kpis k6">
      <div class="kpi"><span>前高（${md(D.campaign.high.date)} 收盤）</span><b class="num">${fmt(hi)}</b><em>10 月初高檔，散戶 FOMO</em></div>
      <div class="kpi"><span>波段低點（${md(D.campaign.low.date)} 盤中）</span><b class="num down">${fmt(lo)}</b><em>自最高點 ${D.campaign.drawdown}%</em></div>
      <div class="kpi" id="kpiLast"><span>最新收盤（${md(last.time)}）</span><b class="num ${cls(last.chg)}">${fmt(last.value)}</b><em>已收復約 ${rec.toFixed(0)}% 跌幅</em></div>
      <div class="kpi" id="kpiPos"><span>目前部位</span><b class="num">${latest.position}</b>${latest.positionNote?`<em>${latest.positionNote}</em>`:''}</div>
      <div class="kpi" id="kpiBP"><span>外資 BP 峰值（11/6）</span><b class="num" style="color:#C084FC">32.5 億</b><em>紅燈約 36.4 億，未觸發</em></div>
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
   信用交易（信用交易 Google 試算表，Apps Script 每個交易日晚上自動更新；sheet.js 的 MTXSheet.loadMargin）
   - 大盤融資維持率（上市扣除 ETF）：玩股網數字，人工每天填（玩股網擋國外連線）
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

const loadMargin = () => window.MTXSheet ? MTXSheet.loadMargin() : Promise.reject(new Error('sheet.js 未載入'));
// 顯示在每日籌碼頁；回傳 setRange(from,to)，讓信用交易每日明細跟著頁面的日期區間
function renderCredit(M,body,noteEl){
  {
    const R=M.ratio||[], C=M.credit||[], E=M.etfs||{};
    const codes=Object.keys(E);
    const brand=code=>({'00685L':'群益','00631L':'元大'}[code]||'')+code; // 明細表頭加發行商
    if(noteEl) noteEl.textContent=`資料至 ${M.updated||'—'}・每個交易日晚上 21:30 起自動更新（維持率人工填）`;

    /* ---- 維持率 ---- */
    const r1=R[R.length-1], r0=R[R.length-2];
    const ratioCard = r1 ? `
      <div class="card"><div class="card-h"><span>大盤融資維持率（上市扣除 ETF）</span><span class="sub">${r1[0].replace(/-/g,'/')}</span></div>
        <div class="dgrid keys cr-k">
          <div><span>融資維持率</span><b class="num ${r1[1]<140?'pend':''}">${r1[1].toFixed(2)}%</b><em>${r0?`前一日 ${r0[1].toFixed(2)}%（${sgnN(+(r1[1]-r0[1]).toFixed(2),2)}）`:''}${r1[1]<130?'・<span class="pend">低於 130% 追繳線</span>':''}</em></div>
          <div><span>融資餘額（扣除 ETF）</span><b class="num">${r1[2]==null?'—':fmt(r1[2])+' 億'}</b><em>${r0&&r1[2]!=null&&r0[2]!=null?`較前日 <span class="${cls(r1[2]-r0[2])}">${sgnN(+(r1[2]-r0[2]).toFixed(2),2)} 億</span>`:''}</em></div>
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

    /* ---- 信用交易每日明細：跟著頁面的日期區間 ---- */
    const cell=(v,d)=>`<td class="r num ${cls(v)}">${sgnN(v==null?null:+v.toFixed(d),d)}</td>`;
    const detail = `
      <details class="tbl cr-detail" id="crDetail"><summary class="tbl-h" id="crDetailH">信用交易每日明細</summary><div class="tscroll tall noterm"><table class="t cr-t">
        <thead><tr><th>日期</th><th class="r">上市資(億)</th><th class="r">上市券(張)</th><th class="r">上櫃資(億)</th><th class="r">上櫃券(張)</th>${codes.map(code=>`<th class="r">${brand(code)} 資(張)</th><th class="r">融資連續</th>`).join('')}${codes.map(code=>`<th class="r">${brand(code)} 券(張)</th>`).join('')}</tr></thead>
        <tbody id="crRows"></tbody>
      </table></div></details>`;
    const MAXROWS=400;
    const setRange=(from,to)=>{
      const rows=C.map((c,i)=>({c,i})).filter(({c})=>c.d>=from&&c.d<=to).reverse();
      const yr=from.slice(0,4)!==to.slice(0,4), dd=d=>yr?d.replace(/-/g,'/'):md(d);
      const tb=$('#crRows'), hd=$('#crDetailH'); if(!tb) return;
      tb.innerHTML=rows.slice(0,MAXROWS).map(({c,i})=>`<tr><td class="num">${dd(c.d)}</td>${cell(c.twse&&c.twse.loanChg,2)}${cell(c.twse&&c.twse.shortChg,0)}${cell(c.tpex&&c.tpex.loanChg,2)}${cell(c.tpex&&c.tpex.shortChg,0)}${codes.map(code=>{ const e=c.etf&&c.etf[code]; return `${cell(e&&e.loanChg,0)}<td class="r">${streakTxt(etfSt[code][i])}</td>`; }).join('')}${codes.map(code=>{ const e=c.etf&&c.etf[code]; return cell(e&&e.shortChg,0); }).join('')}</tr>`).join('');
      hd.textContent=`信用交易每日明細（${from.replace(/-/g,'/')} – ${to.replace(/-/g,'/')}・${rows.length} 個交易日${rows.length>MAXROWS?`，顯示最近 ${MAXROWS} 天`:''}）`;
    };

    body.innerHTML=`<div class="grid2 cr-grid">${ratioCard}${dayCard}</div>${C.length?statTable+detail:''}`;

    /* ---- 維持率走勢圖（只放在這裡；上方「籌碼走勢」不再重複放，issue #27） ---- */
    if(r1&&window.LightweightCharts){
      const ch=baseChart($('#crChart'));
      const s=ch.addLineSeries({color:'#60A5FA',lineWidth:2,priceFormat:{type:'custom',formatter:v=>v.toFixed(0)+'%'}});
      s.setData(R.map(x=>({time:x[0],value:x[1]})));
      s.createPriceLine({price:130,color:UP,lineStyle:2,lineWidth:1,axisLabelVisible:true,title:'130%'});
      const byD=new Map(R.map(x=>[x[0],x]));
      const lg=$('#crLg'), show=t=>{ const x=byD.get(t)||r1; lg.innerHTML=`<b>${x[0].replace(/-/g,'/')}</b> 維持率 <b>${x[1].toFixed(2)}%</b>${x[2]==null?'':`・融資 ${fmt(x[2])} 億`}`; };
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
        <div><span>漲跌</span><b class="brk ${cls(r.chg)}"><span class="nw">${sign(r.chg)}${fmt(r.chg)}</span><span class="nw">（${sign(r.pct)}${r.pct}%）</span></b></div>
        <div><span>開盤</span><b>${fmt(r.o)}</b></div><div><span>最高</span><b>${fmt(r.h)}</b></div><div><span>最低</span><b>${fmt(r.l)}</b></div><div><span>成交金額</span><b>${r.vol}</b></div>
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
/* 落底訊號：收跌日由 sheet.js 的 dropSignals 計算兩組（微台／小+微），每組 4 項，前面的數字＝滿足幾項；
   任一組 4 項全滿足＝強烈落底。「連續三天期貨逆增」仍讀試算表欄位。
   試算表「幅度」欄（強烈落底後離真正低點多遠，過去人工填）不再顯示：訊號回測表一的「30 日內最低跌幅」「波段低點跌幅」已自動計算 */
const SIG = [['sig3','連續三天期貨逆增']];
const sigOn = v => v!=null && v!=='' && v!=='0';
const isStrong = r => !!((r.g1&&r.g1.n===4)||(r.g2&&r.g2.n===4));
const sigGroups = r => [r.g1,r.g2].filter(g=>g&&g.n).map(g=>`${g.n}｜${g.items.join('、')}`);
const sigList = r => [...(isStrong(r)?['強烈落底']:[]), ...sigGroups(r), ...SIG.filter(([k])=>sigOn(r[k])).map(([k,t])=>(/^\d+$/.test(r[k])?`${t} ${r[k]}`:t))];
const sigPills = r => { const s=sigList(r); return s.length?s.map(t=>`<span class="pill ${t==='強烈落底'?'r':'a'}">${t}</span>`).join(''):'<span class="pill">無落底訊號</span>'; };
const n0 = v => v==null?'—':fmt(v,0);
const n2 = v => v==null?'—':fmt(v,2);
const sgn0 = v => v==null?'—':`<span class="${cls(v)}">${sign(v)}${fmt(v,0)}</span>`;
const pctTxt = v => v==null?'—':v+'%';

/* 明細表可選欄位：[key, 欄名, 格式, 群組, 預設顯示] */
const COLS = [
  ['idx','加權','n2','大盤',1],['chg','漲跌','c2','大盤',0],['pct','漲跌%','pct','大盤',1],['vol','成交金額(億)','n0','大盤',0],
  ['fiSpot','外資現貨(億)','c2','外資期貨',1],['fiOI','外資期貨<br>總未平倉','c0','外資期貨',0],['fiRel','外資期貨<br>相對結算','c0','外資期貨',1],['fiDelta','較前日','c0','外資期貨',1],
  ['bp','BP 金額','n0','外資選擇權',1],['sp','SP 金額','n0','外資選擇權',0],['bc','BC 金額','n0','外資選擇權',0],['sc','SC 金額','n0','外資選擇權',0],['bpsp','BP/SP<br>增幅比','r1','外資選擇權',0],['bcsc','BC/SC<br>增幅比','r1','外資選擇權',0],
  ['mxLong','微台多','n0','散戶',1],['mxShort','微台空','n0','散戶',1],['rtLong','小+微多','n0','散戶',0],['rtShort','小+微空','n0','散戶',0],['rtLongPct','微台多單百分位','pp','散戶',1],['rtShortPct','微台空單百分位','pp','散戶',0],
  ['sig','訊號','sig','訊號',1]
];
const COLS_KEY='mtx-cols-v2';   // v2：散戶預設改為微台多／空（舊的欄位選擇會重設為預設）
const colsDefault = () => COLS.filter(c=>c[4]).map(c=>c[0]);
function colsLoad(){ try{ const v=JSON.parse(localStorage.getItem(COLS_KEY)); if(Array.isArray(v)&&v.length) return v.filter(k=>COLS.some(c=>c[0]===k)); }catch(e){} return colsDefault(); }
function colsSave(v){ try{ localStorage.setItem(COLS_KEY,JSON.stringify(v)); }catch(e){} }
function cellHTML(r,[k,,f]){
  const v=r[k];
  switch(f){
    case 'sig': return `<td class="sigcell">${sigList(r).join('<br>')}</td>`;
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
    const MC=(M&&M.credit)||[], ME=(M&&M.etfs)||{};
    const lastStrong=[...R].reverse().find(isStrong);
    const delta=k=>L[k]!=null&&P[k]!=null?L[k]-P[k]:null;
    const kpi=(label,val,sub)=>`<div class="kpi"><span>${label}</span><b class="num">${val}</b><em>${sub}</em></div>`;
    const ranges=[['1M',30],['3M',91],['6M',182],['1Y',365],['3Y',1095],['全部',0]];   // 日曆天
    const back=n=>new Date((dayNumOf(L.date)-n)*864e5).toISOString().slice(0,10);
    const first=R[0].date, last=L.date;
    const ecodes=Object.keys(ME);
    const mLast=get=>{ for(let k=MC.length-1;k>=0;k--){ const v=get(MC[k]); if(v!=null) return v; } return null; };   // 最新一筆有數字的（櫃買可能晚一天）
    const panes=[['加權指數','紅箭頭＝強烈落底・紫箭頭＝BP紅燈'],['外資期貨未平倉','口・相對結算日'],['外資選擇權金額','BP 紫・SP 紅・BC 黃・SC 綠'],['散戶多空（微台）','多單紅・空單綠（口）'],
      // 第三項＝收起時標題列顯示的最新數字（有這項就預設收起，點標題才展開）；收起的這幾張放在「信用交易」區最下面（信用交易每日明細之後）
      ...(MC.length?[['融資餘額','上市紅・上櫃黃（億）',`上市 ${n0(mLast(x=>x.twse&&x.twse.loan))} 億・上櫃 ${n0(mLast(x=>x.tpex&&x.tpex.loan))} 億`],
        ['融券餘額','上市紅・上櫃黃（張）',`上市 ${n0(mLast(x=>x.twse&&x.twse.short))} 張・上櫃 ${n0(mLast(x=>x.tpex&&x.tpex.short))} 張`],
        ['正二 ETF 融資餘額',`${ecodes.map((c,i)=>`${c} ${['紅','黃'][i]||''}`).join('・')}（張）`,ecodes.map(c=>`${c} ${n0(mLast(x=>x.etf&&x.etf[c]&&x.etf[c].loan))} 張`).join('・')]]:[])];
    const paneHtml=([h,sub,fold],i)=>{
      const head=`<span>${h}</span> <span class="sub">${sub}</span>${fold?`<span class="fold-last num">${fold}</span>`:''}`, body=`<div class="chart tall"><div class="chart-legend num" id="lg${i}"></div><div id="ch${i}" style="position:absolute;inset:0"></div></div>`;
      return fold?`<details class="card fold"><summary class="card-h">${head}</summary>${body}</details>`:`<div class="card"><div class="card-h">${head}</div>${body}</div>`; };
    main.innerHTML = `
      <div class="crumb"><a href="index.html">主頁</a><span>/</span><span>每日籌碼</span></div>
      <div class="card r-head">
        <div class="eyebrow">資料更新至 ${L.date.replace(/-/g,'/')}（${weekday(L.date)}）${L.settle===999?'・結算日':''}</div>
        <h1>每日籌碼</h1>
        <div class="r-ohlc two num">
          <div><span>加權收盤</span><b class="${cls(L.chg)}">${n2(L.idx)}</b></div>
          <div><span>漲跌</span><b class="brk ${cls(L.chg)}"><span class="nw">${sign(L.chg)}${n2(L.chg)}</span><span class="nw">（${sign(L.pct)}${L.pct==null?'—':L.pct.toFixed(2)}%）</span></b></div>
          <div><span>成交金額</span><b>${n0(L.vol)} 億</b></div>
          <div><span>外資現貨</span><b class="${cls(L.fiSpot)}">${sign(L.fiSpot)}${n2(L.fiSpot)} 億</b></div>
        </div>
        <div class="sigs"><span class="sigs-h">今日訊號</span>${sigPills(L)}
          ${lastStrong?`<span class="sigs-last">最近一次強烈落底：<b class="num">${lastStrong.date.replace(/-/g,'/')}</b>・<a href="signals.html#strong" style="color:#93C5FD">看訊號回測 →</a></span>`:''}</div>
      </div>
      <div class="card" style="margin-top:12px"><div class="kpis k4">
        ${kpi('外資期貨未平倉（相對結算日）',sgn0(L.fiRel)+' 口',`較前日 ${sgn0(L.fiDelta)}・總未平倉 ${n0(L.fiOI)}`)}
        ${kpi('外資 BP 金額',n0(L.bp),`較前日 ${sgn0(delta('bp'))}・BP/SP 增幅比 ${L.bpsp==null?'—':L.bpsp.toFixed(1)+'%'}`)}
        ${kpi('外資 BC／SC 金額',`${n0(L.bc)}／${n0(L.sc)}`,`BC/SC 增幅比 ${L.bcsc==null?'—':L.bcsc.toFixed(1)+'%'}`)}
        ${kpi('微台多單／空單',`${n0(L.mxLong)}／${n0(L.mxShort)}`,`多單較前日 ${sgn0(delta('mxLong'))}・空單較前日 ${sgn0(delta('mxShort'))}`)}
      </div></div>

      <section class="sec">
        <div class="sec-h"><h2>籌碼走勢</h2><p>日期區間同時套用到走勢圖與下方明細</p></div>
        <div class="card rangebar">
          <div class="tabs" id="range">${ranges.map(([t,n])=>`<button data-n="${n}">${t}</button>`).join('')}</div>
          <div class="dates"><label><span>起</span><input type="date" id="dFrom" min="${first}" max="${last}"></label><i>–</i><label><span>迄</span><input type="date" id="dTo" min="${first}" max="${last}"></label></div>
          <span class="rb-note num">可選 ${first.replace(/-/g,'/')} – ${last.replace(/-/g,'/')}</span>
        </div>
        <div class="stack">${panes.map((p,i)=>p[2]?'':paneHtml(p,i)).join('')}
        </div>
      </section>

      <section class="sec" id="credit">
        <div class="sec-h"><h2>信用交易</h2><p id="creditNote">每個交易日晚上 21:30 起自動更新</p></div>
        <div id="creditBody">${M?'':'<div class="card"><p class="empty">讀不到信用交易資料。</p></div>'}</div>
        ${panes.some(p=>p[2])?`<div class="stack cr-charts">${panes.map((p,i)=>p[2]?paneHtml(p,i):'').join('')}</div>`:''}
      </section>

      <section class="sec" id="tbl">
        <div class="sec-h"><h2>籌碼每日明細</h2>
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
        <tbody>${rows.map(r=>`<tr${isStrong(r)?' class="sig"':''}><td class="num">${dt(r.date)}</td>${C.map(c=>cellHTML(r,c)).join('')}</tr>`).join('')}</tbody>`;
      const ns=rows.filter(isStrong).length;
      $('#tblSub').innerHTML=`${range[0].replace(/-/g,'/')} – ${range[1].replace(/-/g,'/')}・<b class="num">${rows.length}</b> 個交易日・強烈落底 <b class="num">${ns}</b> 天・最新在最上面・紅底＝強烈落底・訊號前的數字＝四項中滿足幾項`;
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
    // 日期區間：按鈕、起訖日期，或直接在任一張圖上（點一下後）滾輪縮放、拖曳，都會同步到所有圖、明細表、信用交易明細
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
    // 紅箭頭＝強烈落底、紫箭頭＝BP紅燈亮燈首日（與訊號回測頁相同算法）
    const bpDays=new Set(window.MTXSheet.bpRedDays(data.bpSeries||[]));
    s0.setMarkers([...R.filter(isStrong).map(r=>({time:T(r),position:'belowBar',color:UP,shape:'arrowUp'})),
      ...R.filter(r=>bpDays.has(r.date)).map(r=>({time:T(r),position:'belowBar',color:PURPLE,shape:'arrowUp'}))].sort((a,b)=>a.time<b.time?-1:1));
    legend(0,r=>`加權 <b>${n2(r.idx)}</b> <span class="${cls(r.chg)}">${sign(r.chg)}${n2(r.chg)}</span>${sigList(r).length?' ・<span class="up">'+sigList(r).join(' ／ ')+'</span>':''}${bpDays.has(r.date)?` ・<span style="color:${PURPLE}">BP紅燈</span>`:''}`,c);

    c=mk(1);
    const s1=c.addHistogramSeries({priceFormat:{type:'volume'}});
    s1.setData(R.filter(r=>r.fiRel!=null).map(r=>({time:T(r),value:r.fiRel,color:r.fiRel>=0?UP:(r.fiRel<=-10000?DN:'rgba(16,185,129,.5)')})));
    s1.createPriceLine({price:-20000,color:'#F59E0B',lineStyle:2,lineWidth:1,title:'−2萬'});
    s1.createPriceLine({price:10000,color:'#F59E0B',lineStyle:2,lineWidth:1,title:'+1萬'});
    legend(1,r=>`相對結算 <b class="${cls(r.fiRel)}">${n0(r.fiRel)}</b> 較前日 <span class="${cls(r.fiDelta)}">${n0(r.fiDelta)}</span> 總未平倉 ${n0(r.fiOI)}`,c);

    c=mk(2); lines(c,[['sc','#10B981'],['bc','#F59E0B'],['sp','#EF4444'],['bp','#A855F7']]);
    legend(2,r=>`<span style="color:#C084FC">BP ${n0(r.bp)}</span> <span class="up">SP ${n0(r.sp)}</span> <span style="color:#F59E0B">BC ${n0(r.bc)}</span> <span class="down">SC ${n0(r.sc)}</span>`,c);

    c=mk(3); lines(c,[['mxShort','#10B981'],['mxLong','#EF4444']]);
    legend(3,r=>`微台多 <b class="up">${n0(r.mxLong)}</b> 空 <b class="down">${n0(r.mxShort)}</b>`,c);

    /* ---- 信用交易歷史（信用交易試算表）：和上面的圖共用日期區間 ---- */
    let pi=4;
    const mLegend=(i,c,rows,fn)=>{ const el=$('#lg'+i), by=new Map(rows.map(x=>[x.d,x]));
      const at=t=>{ if(t&&by.has(t)) return by.get(t); for(let k=rows.length-1;k>=0;k--) if(rows[k].d<=range[1]) return rows[k]; return rows[rows.length-1]; };
      const show=t=>{ const x=at(t); if(x) el.innerHTML=`<b>${x.d.replace(/-/g,'/')}</b> `+fn(x); }; show(); c.subscribeCrosshairMove(p=>show(p&&timeStr(p.time))); legends.push(show); };
    const mLine=(c,rows,get,color,fmtFn)=>{ const s=c.addLineSeries({color,lineWidth:2,lastValueVisible:false,priceLineVisible:false,priceFormat:fmtFn?{type:'custom',formatter:fmtFn}:{type:'volume'}});
      s.setData(rows.map(x=>({time:x.d,value:get(x)})).filter(p=>p.value!=null)); return s; };
    if(MC.length){
      const g=(x,a,b)=>x[a]?x[a][b]:null;
      c=mk(pi); const yi=v=>fmt(v,0);   // 單位是億，刻度直接寫數字（不要 4K 這種寫法）
      mLine(c,MC,x=>g(x,'twse','loan'),'#EF4444',yi); mLine(c,MC,x=>g(x,'tpex','loan'),'#F59E0B',yi);
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
    // 收起的圖打開時才量得到寬度：等量到寬度，再重設上下刻度、套用目前的日期區間（收起時被同步過的範圍可能是錯的）
    main.querySelectorAll('details.fold').forEach(d=>d.addEventListener('toggle',()=>{
      if(!d.open) return;
      const el=d.querySelector('[id^="ch"]'), c=charts[+el.id.slice(2)]; let tries=0;
      const go=()=>{ if(!el.clientWidth&&++tries<60) return requestAnimationFrame(go);
        if(c) c.priceScale('right').applyOptions({autoScale:true});
        sync.set(range[0],range[1]); };
      requestAnimationFrame(go);
    }));
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
  if(typeof v!=='number') return String(v).replace(/(\d{4})-(\d{2})-(\d{2})/g,'$1/$2/$3');   // 日期一律顯示 2026/11/02
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
// 穩健性檢查的欄位依持有天數產生（BP紅燈會多「第一次穩定 100%」那天與 120 天）
const btRegCols=(head,holds)=>head.concat(holds.flatMap(H=>[[`${H}天勝率`,`${H}天勝率`,'pct0'],[`${H}天期望值`,`${H}天期望值`,'pct','c'],[`${H}天基準期望值`,`${H}天基準`,'pct'],[`${H}天超額`,`${H}天超額`,'pct','c']]));
function btTable(key,rows,{rowId,group,cols}={}){
  const C=cols||BT_COLS[key]; let prev=null;
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

const SIG_COLOR = {strong:'#EF4444', bp:'#A855F7', bpv:'#C084FC', bpx:'#E879F9', bcy:'#F59E0B', bcg:'#10B981', bcx:'#D946EF'};
function renderSignals(){
  nav('signals');
  const main=$('#main'), B=window.MTXBacktest;
  const end=(new URLSearchParams(location.search).get('end')||'').match(/^\d{4}-\d{2}-\d{2}$/)?new URLSearchParams(location.search).get('end'):null;
  window.MTXSheet.load().then(data=>{
    const res=B.run(data,end), mk=res.mk, LAST=mk.n-1;
    window.__bt=res;   // 方便在主控台驗算
    const dt=s=>s.replace(/-/g,'/');
    const warn=(data.warnings||[]).slice(0,8);
    // 分頁：第一層「強烈落底／BP過熱／BC過熱」，第二層由左至右 10%、最高一級、紫爆
    const GROUPS=[['強烈落底',['strong']],
      ['BP過熱',['bpv','bp','bpx'],'外資 BP 進入高水位，大跌時的極端行情：BP過熱紫燈（前 10%）、BP極端過熱紅燈（前 2%）、BP紫爆（與結算比前 1%）'],
      ['BC過熱',['bcy','bcg','bcx'],'外資 BC 進入高水位，大盤在高檔或暴漲時：BC過熱黃燈（前 10%）、BC極端過熱綠燈（前 1%）、BC紫爆（與結算比前 1%）']]
      .map(([n,ids,d])=>[n,ids.filter(id=>res.signals.some(s=>s.id===id)),d]).filter(g=>g[1].length);

    const lead=s=>{
      const ex=r=>btPick(s.excess,{'持有週期':r});
      if(s.id==='strong') return `計入 ${bv(s.count)} 筆訊號（原始 ${bv(s.raw)} 筆，冷卻期移除：${s.removed.length?s.removed.map(dt).join('、'):'無'}）。
        首日收盤進場持有 30 天，勝率 ${bv(ex('30天')['訊號勝率'],'pct0')}（所有交易日基準 ${bv(ex('30天')['基準勝率'],'pct0')}），
        期望值 ${bv(ex('30天')['訊號期望值'],'pct')}（基準 ${bv(ex('30天')['基準期望值'],'pct')}），超額 ${bv(ex('30天')['超額期望值'],'pct',1)}。`;
      // BP 系列：亮燈前 30 天（日曆天）內自高點的跌幅；BC 系列：自低點的漲幅
      const hiK=s.kind==='high';
      const moves=s.idxs.map(i=>{ let x=mk.c[i]; for(let t=i;t>=0&&mk.days(t,i)<=30;t--) x=hiK?Math.min(x,mk.c[t]):Math.max(x,mk.c[t]); return Math.abs(mk.c[i]/x-1)*100; });
      const latest=s.events[0], newest=latest&&mk.days(latest._i,LAST);
      const h120=s.holds.includes(120)&&ex('120天')['訊號樣本數']?`；持有 120 天，勝率 ${bv(ex('120天')['訊號勝率'],'pct0')}，期望值 ${bv(ex('120天')['訊號期望值'],'pct')}（基準 ${bv(ex('120天')['基準期望值'],'pct')}）`:'';
      return `逐日動態判斷：當天的${s.col||'外資 BP 金額'}達到「當天以前所有資料」的前 ${Math.round((s.pct||0.02)*100)}% 才算亮燈，連續亮燈只取第一天，熄燈滿 10 個交易日才算新的一次，從 2012 年起判斷。
        共 ${bv(s.count)} 次${s.count<12?'，樣本少，屬於個案觀察':''}。${s.id==='bp'?'每次都在急跌中亮燈：':''}亮燈前 30 天內，從${hiK?'低點漲了':'高點跌了'} ${bv(Math.min(...moves),'pct0')}～${bv(Math.max(...moves),'pct0')}。
        ${latest?`最新一次是 <b class="num">${dt(latest['首日日期'])}</b>${newest<30?`，距資料最後一天只有 ${newest} 天，多數欄位還是「未達成」`:''}。`:''}
        首日收盤進場持有 30 天，勝率 ${bv(ex('30天')['訊號勝率'],'pct0')}（基準 ${bv(ex('30天')['基準勝率'],'pct0')}），期望值 ${bv(ex('30天')['訊號期望值'],'pct')}（基準 ${bv(ex('30天')['基準期望值'],'pct')}）；
        持有 60 天，勝率 ${bv(ex('60天')['訊號勝率'],'pct0')}，期望值 ${bv(ex('60天')['訊號期望值'],'pct')}（基準 ${bv(ex('60天')['基準期望值'],'pct')}）${h120}。
        ${hiK?'<br>BC 燈號是<b>高檔</b>的標記：下面各表的「勝率」是之後<b>上漲</b>的比例，下跌機率＝100%−勝率；要看亮燈之後會不會跌，請看「高檔觀測」。':''}`;
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
    // BP紅燈：60 天以前，最早第幾天起勝率穩定 100%（引擎在 backtest.js 的 turnPositive）
    // 每次訊號：120 天報酬（取 120 天觀察期的資料）
    const lateCells=(s,r,L)=>{ const P=s.paths&&s.paths[120]; if(!P) return ''; const q=P.rows.find(x=>x.date===r.date), v=q&&q.retH!=null?q.retH*100:null;
      return v==null?'<td class="r"><span class="pend">未完成</span></td><td class="r">—</td>':`<td class="r ${cls(v)}">${btFmt(v,'pct')}</td><td class="r ${cls(v)}">${btFmt(v*L,'pct')}</td>`; };
    const turnRows=(s,L)=>s.turn.rows.slice().reverse().map(r=>{
      const st=r.stable!=null?(r.done?`第 ${r.stable} 天`:`第 ${r.stable} 天起（未滿 ${s.turn.H} 天）`):(r.done?`<span class="down">${s.turn.H} 天內未翻正</span>`:`<span class="pend">尚未翻正（已 ${r.avail} 天）</span>`);
      const lw=r.lowI===r.i?'—':dt(mk.d[r.lowI]), lp=r.low*100;
      return `<tr><td class="r">${dt(r.date)}</td><td class="r">${fmt(r.close)}</td><td class="r">${r.first!=null?`第 ${r.first} 天`:'<span class="pend">未翻正</span>'}</td><td class="r"><b>${st}</b></td>
        <td class="r">${lw}</td><td class="r">${r.lowI===r.i?'—':r.lowDays}</td><td class="r ${cls(lp)}">${lp<0?lp.toFixed(2)+'%':'—'}</td><td class="r ${cls(lp)}"><b>${lp<0?(lp*L).toFixed(2)+'%':'—'}</b></td>
        ${stCell(s,r,L)}
        <td class="r ${r.retH!=null?cls(r.retH):''}">${r.retH!=null?btFmt(r.retH*100,'pct'):'<span class="pend">未完成</span>'}</td><td class="r ${r.retH!=null?cls(r.retH):''}">${r.retH!=null?btFmt(r.retH*100*L,'pct'):'—'}</td>${lateCells(s,r,L)}</tr>`;
    }).join('');
    // 第一次穩定達到 100% 那天（第 S 天）的報酬；還沒走到第 S 天的顯示未完成
    const stCell=(s,r,L)=>{ const S=s.turn.stable; if(S==null) return ''; const v=r.avail>=S?r.ret[S-1]*100:null;
      return v==null?'<td class="r"><span class="pend">未完成</span></td><td class="r">—</td>':`<td class="r ${cls(v)}">${btFmt(v,'pct')}</td><td class="r ${cls(v)}"><b>${btFmt(v*L,'pct')}</b></td>`; };
    const evLev=(s,L)=>btFmt(s.turn.ev[s.turn.stable-1]*100*L,'pct');
    const PATH_COLORS=['#60A5FA','#F59E0B','#34D399','#F472B6','#A78BFA','#FB923C','#22D3EE'];
    const pathLead=(T,S0)=>{
      const S=S0??T.stable; const D=T.rows.filter(r=>r.done); if(!D.length||S==null) return '';
      const H=T.H, e=n=>T.ev[n-1]*100, pulls=D.filter(r=>r.pull!=null).map(r=>r.pull*100);
      const before=D.filter(r=>r.peakDay<H).length;
      const share=e(H)>0?e(S)/e(H):1;
      return `平均報酬：第 10 天 ${bv(e(10),'pct',1)}、第 30 天 ${bv(e(30),'pct',1)}、第 ${S} 天 ${bv(e(S),'pct',1)}${H>60?`、第 60 天 ${bv(e(60),'pct',1)}`:''}、第 ${H} 天 ${bv(e(H),'pct',1)}。
        第 ${S}～${H} 天平均${share>=0.75?'只':''}多 ${bv(e(H)-e(S),'pct',1)}，${share>=0.75?`<b>大部分漲幅在前 ${S} 天就走完了</b>`:`第 ${S} 天時只走完 ${H} 天漲幅的 ${Math.round(share*100)}%，<b>之後還有一段</b>`}。
        中途也確實都有拉回：穩定翻正以後，${D.length} 次每一次都從高點拉回過，幅度 ${bv(Math.max(...pulls),'pct')}～${bv(Math.min(...pulls),'pct')}；
        ${before} 次的最高點出現在第 ${H} 天以前，到第 ${H} 天時已經從最高點回落。`;
    };
    // 每次訊號 H 天的報酬路徑（SVG 折線）＋平均
    function pathChart(el,T,S){
      const H=T.H, rows=T.rows; S=S??T.stable;
      const draw=()=>{
        const W=Math.max(260,el.clientWidth), Hh=260, m={t:14,r:10,b:26,l:46};
        const all=rows.flatMap(r=>r.ret).concat(T.ev.filter(v=>v!=null)).map(v=>v*100);
        const lo=Math.min(0,...all), hi=Math.max(0,...all);
        const x=n=>m.l+n/H*(W-m.l-m.r), y=v=>m.t+(hi-v)/(hi-lo||1)*(Hh-m.t-m.b);
        const st=[1,2,5,10].find(s=>(hi-lo)/s<=6)||20, ticks=[]; for(let v=Math.ceil(lo/st)*st;v<=hi+1e-9;v+=st) ticks.push(v);
        let svg=`<svg viewBox="0 0 ${W} ${Hh}" width="100%" height="${Hh}" role="img" aria-label="每次訊號 ${H} 天內的報酬走勢">`;
        ticks.forEach(v=>{ svg+=`<line x1="${m.l}" x2="${W-m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${v===0?'#3A4560':'rgba(35,43,58,.7)'}"/><text x="${m.l-6}" y="${y(v)+4}" text-anchor="end" class="bt-ax">${v}%</text>`; });
        [1,...Array.from({length:Math.floor(H/(H>60?20:10))},(_,k)=>(k+1)*(H>60?20:10))].filter(n=>n<=H).forEach(n=>{ svg+=`<text x="${x(n)}" y="${Hh-8}" text-anchor="middle" class="bt-ax">${n}</text>`; });
        if(S!=null) svg+=`<line x1="${x(S)}" x2="${x(S)}" y1="${m.t}" y2="${Hh-m.b}" stroke="#A855F7" stroke-dasharray="4 4"/><text x="${x(S)-4}" y="${m.t+10}" text-anchor="end" class="bt-ax" style="fill:#C4B5FD">第 ${S} 天</text>`;
        const line=(arr,col,w,extra)=>`<polyline fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round" ${extra||''} points="${x(0)},${y(0)} ${arr.map((v,k)=>`${x(k+1).toFixed(1)},${y(v*100).toFixed(1)}`).join(' ')}"/>`;
        rows.forEach((r,k)=>{ svg+=line(r.ret,PATH_COLORS[k%PATH_COLORS.length],1.6,r.done?'':'stroke-dasharray="3 3" opacity=".75"'); });
        // 各次 H 天內的最高點（圓點；進行中的不標）
        rows.forEach((r,k)=>{ if(!r.done||r.peakDay==null) return; const cx=x(r.peakDay), cy=y(r.peak*100);
          svg+=`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.5" fill="${PATH_COLORS[k%PATH_COLORS.length]}" stroke="#0B0F17" stroke-width="1.5"/>`; });
        svg+=line(T.ev,'#E5E7EB',3);
        svg+=`<line class="pc-cur" x1="0" x2="0" y1="${m.t}" y2="${Hh-m.b}" stroke="#5D677B" visibility="hidden"/>`;
        el.innerHTML=svg+'</svg><div class="bt-tip"></div>';
        el._geo={W,m};
      };
      draw();
      const hide=()=>{ const tp=el.querySelector('.bt-tip'), c=el.querySelector('.pc-cur'); if(tp) tp.classList.remove('on'); if(c) c.setAttribute('visibility','hidden'); };
      const show=e=>{ const g=el._geo, b=el.getBoundingClientRect(), px=(e.clientX-b.left)*g.W/b.width;
        const n=Math.round((px-g.m.l)/(g.W-g.m.l-g.m.r)*H), tp=el.querySelector('.bt-tip'), cur=el.querySelector('.pc-cur');
        if(n<1||n>H) return hide();
        const cx=g.m.l+n/H*(g.W-g.m.l-g.m.r); cur.setAttribute('x1',cx); cur.setAttribute('x2',cx); cur.setAttribute('visibility','visible');
        tp.innerHTML=`<b>第 ${n} 天</b>　平均 ${btFmt(T.ev[n-1]*100,'pct')}<br>`+rows.map((r,k)=>[r,k]).reverse().map(([r,k])=>`<span style="color:${PATH_COLORS[k%PATH_COLORS.length]}">●</span> ${dt(r.date)}　${r.avail>=n?btFmt(r.ret[n-1]*100,'pct'):'—'}`).join('<br>');
        tp.classList.add('on'); let lx=e.clientX-b.left+12; if(lx+tp.offsetWidth>b.width) lx=e.clientX-b.left-tp.offsetWidth-12; tp.style.left=Math.max(0,lx)+'px'; tp.style.top='4px'; };
      el.addEventListener('pointermove',show); el.addEventListener('pointerdown',show); el.addEventListener('pointerleave',hide);
      if(window.ResizeObserver){ let w=el.clientWidth; new ResizeObserver(()=>{ if(el.clientWidth!==w){ w=el.clientWidth; draw(); } }).observe(el); }
    }
    // BP紅燈：出場方式比較（引擎在 backtest.js 的 exitRules；觀察期 120／180／250／365 天可切換）
    const exitPc=v=>v==null?'—':`<span class="${cls(v)}">${btFmt(v*100,'pct')}</span>`;
    const exitCell=x=>x?`第 ${x[0]} 天 ${exitPc(x[1])}`:'—';
    const avgOf=a=>a.reduce((x,y)=>x+y,0)/a.length;
    const exitBody=(s,C,L)=>{
      const X=s.exits[C], R=X.rules, by=n=>R.find(r=>r.name===n);
      const keep=by(`持有 ${C} 天`), h46=R.find(r=>r.kind==='hold'&&r.name.includes('穩定')), fl=R.find(r=>r.kind==='flat'), best=R.find(r=>r.kind==='best');
      const real=R.filter(r=>r.kind!=='best');
      // 每一次訊號（每一欄）實際做得到的出場方式中，報酬最高的
      const top=X.events.map((_,k)=>real.reduce((a,r)=>r.each[k][1]>a.each[k][1]?r:a));
      let prev=null;
      const rows=R.map(r=>{ const g=r.group!==prev; prev=r.group;
        return `<tr class="${g?'grp':''}${r.kind==='best'?' ref':''}"><td class="tx">${g?r.group:''}</td><td class="tx"><b>${r.name}</b></td><td class="r"><b>${exitPc(r.avg)}</b></td><td class="r"><b>${exitPc(r.avg==null?null:r.avg*L)}</b></td><td class="r">${exitPc(r.min)}</td>
          <td class="r">${r.win==null?'—':btFmt(r.win*100,'pct0')}</td><td class="r">${r.avgDays==null?'—':Math.round(r.avgDays)}</td><td class="r">${exitPc(r.perDay==null?null:r.perDay*10)}</td>
          ${r.each.map((x,k)=>`<td class="r${top[k]===r?' bt-top':''}">${exitCell(x)}</td>`).join('')}</tr>`; }).join('');
      // 兩者比較：連續 30 天沒創新高 vs 固定天數（46 天、觀察期最後一天）
      const vs=[h46,keep].filter((r,k,a)=>r&&a.indexOf(r)===k);
      const wins=r=>fl.each.filter((x,k)=>x[1]>r.each[k][1]).length;
      const cmpRow=(lab,f,fm)=>`<tr><td class="tx">${lab}</td>${[fl,...vs].map(r=>`<td class="r">${f(r)}</td>`).join('')}</tr>`;
      const cmp=`<div class="bt-scroll noterm"><table class="t bt"><thead><tr><th class="tx"></th><th class="r">連續 30 天沒創新高就賣</th>${vs.map(r=>`<th class="r">${r.name}</th>`).join('')}</tr></thead><tbody>
          ${cmpRow('平均報酬',r=>`<b>${exitPc(r.avg)}</b>`)}${cmpRow(`平均×槓桿（${L} 倍）`,r=>exitPc(r.avg*L))}${cmpRow('最差一次',r=>exitPc(r.min))}
          ${cmpRow('平均抱幾天',r=>Math.round(r.avgDays))}${cmpRow('每 10 天報酬',r=>exitPc(r.perDay*10))}
          ${cmpRow('離事後最高點（平均）',r=>exitPc(avgOf(r.each.map((x,k)=>(1+x[1])/(1+best.each[k][1])-1))))}
          <tr><td class="tx">5 次裡「30 天沒創新高」比較好</td><td class="r">—</td>${vs.map(r=>`<td class="r">${wins(r)} / ${X.events.length} 次</td>`).join('')}</tr></tbody></table></div>`;
      const pickN=n=>fl.avg>n.avg;
      const evRows=X.events.map((d,k)=>{ const b=best.each[k], t=top[k];
        return `<tr><td class="r"><b>${dt(d)}</b></td><td class="r ref">${exitCell(b)}</td><td class="tx"><b>${t.name}</b><br>${exitCell(t.each[k])}</td>
          ${[fl,...vs].map(r=>`<td class="r${r===t?' bt-top':''}">${exitCell(r.each[k])}<br><span class="bt-gap">離最高 ${btFmt(((1+r.each[k][1])/(1+b[1])-1)*100,'pct')}</span></td>`).join('')}</tr>`; }).join('');
      return `
        <p class="bt-lead">首日收盤進場，最多觀察 ${C} 天，只算已滿 ${C} 天的 ${bv(X.events.length)} 次訊號。事後看 ${C} 天內的最高點平均 ${bv(best.avg*100,'pct',1)}（平均出現在第 ${Math.round(best.avgDays)} 天）。</p>
        <h3 class="bt-h3">連續 30 天沒創新高就賣 vs 靠天數出場</h3>
        ${cmp}
        <div class="card bt-pc bt-after"><ul>
          <li><b>每一筆賺多少</b>：「連續 30 天沒創新高就賣」平均 ${bv(fl.avg*100,'pct',1)}，${vs.map(r=>`${pickN(r)?'高於':'低於'}${r.name.replace(/（.*）/,'')}（${bv(r.avg*100,'pct',1)}）`).join('，')}；最差一次 ${bv(fl.min*100,'pct',1)}。</li>
          <li><b>錢用得有沒有效率</b>：它平均抱 ${Math.round(fl.avgDays)} 天，每 10 天報酬 ${bv(fl.perDay*1000,'pct',1)}；${h46?`抱 ${h46.name.match(/\d+/)[0]} 天每 10 天 ${bv(h46.perDay*1000,'pct',1)}`:''}。</li>
          <li><b>怎麼選</b>：賣掉後錢能馬上拿去做別的，選每 10 天報酬高的；賣掉後錢只是放著等下一次 BP紅燈（好幾年才亮一次），選平均報酬高的。</li>
          <li><b>拉長觀察期</b>：「連續 30 天沒創新高」在漲勢停下來時就賣，觀察期拉長，最差一次也不會跟著變差；一直抱著則可能碰到之後的大跌（切到 250／365 天看「最差一次」會變成負的）。</li></ul></div>
        <h3 class="bt-h3">各種出場方式（平均）</h3>
        <p class="bt-note">勝率＝出場時報酬 > 0 的比例。每 10 天報酬＝平均報酬 ÷ 平均持有天數 × 10。右邊各欄是每一次的出場日與報酬，<span class="bt-top-lg">底色</span>＝那一次實際做得到的出場方式中最好的。</p>
        <div class="bt-scroll noterm"><table class="t bt"><thead><tr><th class="tx">類型</th><th class="tx">出場方式</th><th class="r">平均報酬</th><th class="r">平均×槓桿</th><th class="r">最差一次</th><th class="r">勝率</th><th class="r">平均持有(天)</th><th class="r">每 10 天報酬</th>
          ${X.events.map(d=>`<th class="r">${dt(d)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
        <h3 class="bt-h3">各次比較</h3>
        <p class="bt-note">一列一次訊號。「離最高」＝出場價比 ${C} 天內最高收盤低多少。</p>
        <div class="bt-scroll noterm"><table class="t bt"><thead><tr><th class="r">首日日期</th><th class="r">${C} 天內最高點（事後）</th><th class="tx">這次最好的出場方式</th>${[fl,...vs].map(r=>`<th class="r">${r.name}</th>`).join('')}</tr></thead><tbody>${evRows}</tbody></table></div>`;
    };
    // 出場方式比較的優缺點＋「連續 30 天沒創新高」在 46／60／120 天內會不會觸發
    const exitPros=s=>{
      const X=s.exits[120]||s.exits[Object.keys(s.exits)[0]]; if(!X||!X.events.length) return '';
      const R=X.rules, keep=R.find(r=>r.name===`持有 ${X.CAP} 天`), real=R.filter(r=>r.kind!=='best');
      const eff=real.reduce((a,r)=>r.perDay>a.perDay?r:a);
      return `
        <div class="bt-grid2">
          <div class="card bt-pc"><h3>先收獲利的優點</h3><ul>
            <li><b>資金效率</b>：換算每 10 天的平均報酬，「${eff.name}」最高（${bv(eff.perDay*1000,'pct',1)}），一直抱到第 ${X.CAP} 天只有 ${bv(keep.perDay*1000,'pct',1)}。早點出場，錢可以等下一次機會。</li>
            <li><b>保護「反彈失敗」</b>：出場規則真正的用處，是萬一 BP紅燈之後沒有漲上去、反而續跌時，不會把獲利吐光。但這 ${X.events.length} 次在第 ${X.CAP} 天全部是賺的，樣本裡看不到這個好處（只能當保險）。</li>
            <li><b>槓桿部位壓力小</b>：持有時間短，經歷的拉回次數少，槓桿放大後的心理壓力和追繳風險也小。</li></ul></div>
          <div class="card bt-pc"><h3>先收獲利的缺點</h3><ul>
            <li><b>容易賣在起漲段</b>：BP紅燈之後常常是一大段漲勢的起點。例如 2025/04/08，「漲超過 5% 以後、從最高點跌 5% 就賣」在第 14 天以 ${bv(1.81,'pct')} 出場，之後 120 天內最高到 ${bv(28.17,'pct')}（第 119 天）。</li>
            <li><b>正常震盪就會被洗掉</b>：上面的走勢表顯示，穩定翻正後每一次都有 2～6% 的拉回，「從最高點跌 3～5% 就賣」很容易被洗出場。</li>
            <li><b>出場後要不要再買回</b>：規則只管出場，沒有回補的規則就會錯過後段；加了回補又會增加來回成本。</li></ul></div>
        </div>
        <div class="card bt-pc bt-after"><h3>補充：浮動出場（跟著價格調整賣點）意義不大</h3><ul>
          <li><b>漲超過 X% 以後、從最高點跌 X% 就賣</b>：門檻 3～5% 會被正常拉回洗出場（2018/02、2025/04 賣出時只剩 0.8%、1.8%；120 天平均只有 +6～7%，比抱 46 天的 +9.7% 還低）；放寬到 8～10% 則 120 天內幾乎不觸發，等於一直抱著。</li>
          <li><b>漲超過 X% 以後、獲利剩 Y% 就賣</b>：120 天內幾乎不觸發；拉長觀察期時，漲不到門檻的那次完全沒保護（2018/02 最高只漲到 8%），碰到跳空大跌也會直接跌過頭。</li>
          <li>所以這兩類不列在下面的表裡；實際上就是在「固定天數賣」和「整理太久就賣」之間選。</li></ul></div>`;
    };
    const flatSec=s=>{
      const F=s.flatCmp; if(!F||!F.length) return '';
      const dates=F[0].ev.map(e=>e.date);
      const cell=(e,C)=>e.flat.hit?`第 ${e.flat.d} 天賣 ${exitPc(e.flat.r)}`:`<span class="pend">沒觸發</span>・第 ${C} 天 ${exitPc(e.flat.r)}`;
      const row=(lab,f,k)=>`<tr${k?` class="${k}"`:''}><td class="tx">${lab}</td>${F.map(x=>`<td class="r">${f(x)}</td>`).join('')}</tr>`;
      const af=f=>avgOf(f.ev.map(e=>e.flat.r)), ah=f=>avgOf(f.ev.map(e=>e.hold));
      const f46=F.find(f=>f.C===46), f120=F.find(f=>f.C===120), hit=f=>f.ev.filter(e=>e.flat.hit).length;
      return `
        <h3 class="bt-h3">「連續 30 天沒創新高就賣」在 46／60／120 天內會觸發嗎？</h3>
        <p class="bt-note">觀察期＝最多抱幾天；期間內觸發就賣，沒觸發就在最後一天賣（等於持有同樣天數）。基準＝2011 年以來每一個交易日都當成進場日、套同一個規則的平均，用來看 BP紅燈比隨便哪天買進好多少。</p>
        <div class="bt-scroll noterm"><table class="t bt"><thead><tr><th class="tx">觀察期</th>${F.map(f=>`<th class="r">${f.C} 天</th>`).join('')}</tr></thead><tbody>
          ${dates.map(d=>row(dt(d),f=>{ const e=f.ev.find(x=>x.date===d); return e?cell(e,f.C):'—'; })).join('')}
          ${row('<b>觸發次數</b>',f=>`<b>${hit(f)} / ${f.ev.length}</b>`,'grp')}
          ${row('<b>BP紅燈：30 天沒創新高就賣</b>',f=>`<b>${exitPc(af(f))}</b>`)}
          ${row('<b>BP紅燈：持有同樣天數</b>',f=>`<b>${exitPc(ah(f))}</b>`)}
          ${row('基準：30 天沒創新高就賣',f=>f.base?exitPc(f.base.flat):'—','grp')}
          ${row('基準：持有同樣天數',f=>f.base?exitPc(f.base.hold):'—')}
          ${row('基準：觸發比例',f=>f.base?btFmt(f.base.hitRate*100,'pct0'):'—')}
        </tbody></table></div>
        <p class="bt-note bt-after">${f46&&f120?`46 天內只有 ${hit(f46)} 次觸發，結果和「抱 46 天」幾乎一樣；到 120 天才有 ${hit(f120)} 次觸發。這條規則要等「漲過一段、又整理滿 30 天」才會賣，多半在第 45 天以後才有作用。
          和基準比：BP紅燈之後不論用哪種方式賣，報酬都是隨便哪天買進的好幾倍（46 天 ${btFmt(ah(f46)*100,'pct')} vs ${btFmt(f46.base.hold*100,'pct')}；120 天 ${btFmt(ah(f120)*100,'pct')} vs ${btFmt(f120.base.hold*100,'pct')}）。平常日子用這條規則反而比抱著差（120 天 ${btFmt(f120.base.flat*100,'pct')} vs ${btFmt(f120.base.hold*100,'pct')}），因為平常很容易整理 30 天就被賣掉。`:''}</p>`;
    };
    const exitSec=s=>{
      const E=s.exits; if(!E) return '';
      const caps=Object.keys(E).map(Number).filter(C=>E[C].events.length);
      if(!caps.length) return '';
      const bestLine=caps.map(C=>{ const b=E[C].rules.find(r=>r.kind==='best'); return `${C} 天內 ${bv(b.avg*100,'pct',1)}（平均第 ${Math.round(b.avgDays)} 天）`; }).join('、');
      return `
        <h2 class="bt-h2" id="${s.id}-exit">出場方式比較：什麼時候賣？</h2>
        <p class="bt-lead"><b>「最佳出場點」</b>＝觀察期內收盤最高的那天（事後才知道，實際上做不到）。觀察期是自己設的：拉長觀察期，最高點就跟著往後、而且更高——${bestLine}。
          這段期間台股大多在多頭，<b>沒有一個固定的「最佳天數」</b>，只能比較在同一個觀察期內，哪種出場方式離最高點比較近。</p>
        ${exitPros(s)}${flatSec(s)}
        <div class="bt-chartbar bt-lev"><span class="bt-note">觀察期</span><div class="tabs" id="${s.id}-cap">${caps.map((C,k)=>`<button data-c="${C}"${k?'':' class="on"'}>${C} 天</button>`).join('')}</div></div>
        <div id="${s.id}-exitc">${exitBody(s,caps[0],2)}</div>
        <p class="bt-note bt-after">「連續 30 天沒創新高就賣」：已經獲利，而且連續 30 個日曆天收盤沒有超過買進以來的最高收盤就賣（只看收盤）；沒觸發就在觀察期最後一天賣。槓桿用上面輸入的倍數直接相乘。</p>`;
    };
    // 走勢（中途有沒有拉回）：觀察期 60／90／120 天可切換；紫色虛線固定用 60 天算出的「第一次穩定 100%」那天
    const pathBody=(s,H)=>{
      const T=s.paths[H], S=s.turn.stable;
      return `
        <p class="bt-lead">${pathLead(T,S)}</p>
        <div class="card bt-card"><div class="bt-legend bt-legend-wrap">${T.rows.map((r,k)=>[r,k]).reverse().map(([r,k])=>`<span><i class="bt-sw" style="background:${PATH_COLORS[k%PATH_COLORS.length]}${r.done?'':';opacity:.6'}"></i>${dt(r.date)}${r.done?'':'（進行中）'}</span>`).join('')}<span><i class="bt-sw" style="background:#E5E7EB"></i>平均（期望值）</span></div><div class="bt-ev" id="${s.id}-pc"></div></div>
        <p class="bt-note bt-after">橫軸＝首日後第幾天（日曆天），縱軸＝相對首日收盤的報酬（只看收盤）。白色粗線＝已滿 ${H} 天訊號的平均；紫色虛線＝第一次穩定達到 100% 的第 ${S??'—'} 天；圓點＝各次 ${H} 天內的最高點（同表中「最高報酬」「最高在第幾天」）。滑鼠移到圖上（手機點一下）看當天數字。</p>
        <div class="bt-scroll noterm"><table class="t bt"><thead><tr><th class="r">首日日期</th><th class="r">最高報酬</th><th class="r">最高在第幾天</th><th class="r">第30天</th><th class="r">第${S??'—'}天</th>${H>60?'<th class="r">第60天</th>':''}<th class="r">第${H}天</th><th class="r">翻正後最大拉回</th><th class="r">拉回（第幾天到第幾天）</th><th class="r">第${H}天距最高</th></tr></thead>
          <tbody>${T.rows.slice().reverse().map(r=>{ const at=n=>r.avail>=n?r.ret[n-1]*100:null, c=v=>v==null?'<td class="r"><span class="pend">未完成</span></td>':`<td class="r ${cls(v)}">${btFmt(v,'pct')}</td>`;
            const gap=r.done?((1+r.ret[H-1])/(1+r.peak)-1)*100:null;
            return `<tr><td class="r">${dt(r.date)}${r.done?'':'（進行中）'}</td>${c(r.peak*100)}<td class="r">第 ${r.peakDay} 天</td>${c(at(30))}${S!=null?c(at(S)):'<td class="r">—</td>'}${H>60?c(at(60)):''}${c(r.done?r.retH*100:null)}
              <td class="r ${r.pull?cls(r.pull):''}"><b>${r.pull==null?'—':r.pull<0?btFmt(r.pull*100,'pct'):'沒有拉回'}</b></td><td class="r">${r.pull<0?`第 ${r.pullFrom} → ${r.pullDay} 天`:'—'}</td>
              <td class="r ${gap?cls(gap):''}">${gap==null?'—':gap<0?btFmt(gap,'pct'):'就是最高'}</td></tr>`; }).join('')}</tbody></table></div>
        <p class="bt-note bt-after">翻正後最大拉回＝${H} 天內從穩定翻正那天以後，收盤從「之前的最高收盤」往下跌的最大幅度（價格跌幅，不是報酬相減）。第 ${H} 天距最高＝第 ${H} 天收盤比 ${H} 天內最高收盤低多少。</p>`;
    };
    const pathSec=s=>{
      if(!s.paths) return '';
      const Hs=Object.keys(s.paths).map(Number);
      return `
        <h2 class="bt-h2" id="${s.id}-path">走勢：中途有沒有拉回？</h2>
        <div class="bt-chartbar bt-lev"><span class="bt-note">觀察期</span><div class="tabs" id="${s.id}-ph">${Hs.map((H,k)=>`<button data-h="${H}"${k?'':' class="on"'}>${H} 天</button>`).join('')}</div></div>
        <div id="${s.id}-pathc">${pathBody(s,Hs[0])}</div>`;
    };
    const turnSec=s=>{
      const T=s.turn; if(!T||!T.rows.length) return '';
      const D=T.rows.filter(r=>r.done), late=D.filter(r=>r.stable===T.stable).map(r=>dt(r.date));
      const steps=[]; T.win.forEach((w,k)=>{ if(w!==(k?T.win[k-1]:undefined)) steps.push([k+1,w]); });
      const worst=D.reduce((a,r)=>r.low<a.low?r:a,D[0]||{low:0});
      return `
        <h2 class="bt-h2" id="${s.id}-turn">${T.H} 天以前，最早從第幾天起勝率就達到 100%？</h2>
        <p class="bt-lead">已滿 ${T.H} 天的 ${bv(T.done)} 次訊號：${T.stable!=null?`<b>從第 <span class="num">${T.stable}</span> 天起</b>一路到第 ${T.H} 天，勝率都維持 100%（最晚翻正的是 ${late.join('、')}）。${T.firstAll&&T.firstAll<T.stable?`第一次碰到 100% 是第 ${T.firstAll} 天，但之後又有訊號跌回首日以下，不算穩定。`:''}${`第一次穩定達到 100% 的第 ${T.stable} 天出場，期望值（平均報酬）${bv(T.ev[T.stable-1]*100,'pct',1)}，乘上槓桿 <b class="num" id="${s.id}-evlev">${evLev(s,2)}</b>。`}`:`到第 ${T.H} 天勝率仍未達 100%。`}
          翻正前最大的浮虧是 ${worst.date?`${dt(worst.date)} 的 ${bv(worst.low*100,'pct')}`:'—'}。樣本只有 ${T.done} 次，只能當個案參考。</p>
        <p class="bt-note">第 N 天＝首日後第 N 個日曆天（含）以前最後一個交易日的收盤；那天以前還沒有交易日就算 0（不算贏）。首次翻正＝第一次收盤高於首日；穩定翻正＝從這天起到第 ${T.H} 天都高於首日。最大浮虧＝穩定翻正以前的最低收盤相對首日收盤（只看收盤、不含盤中）；還沒翻正的看到資料最後一天。</p>
        <div class="bt-scroll noterm"><table class="t bt"><thead><tr><th class="r">第 N 天起</th>${steps.map(([n])=>`<th class="r">${n}</th>`).join('')}</tr></thead>
          <tbody><tr><td class="r">勝率</td>${steps.map(([,w])=>`<td class="r${w===1?' up':''}">${w==null?'—':Math.round(w*T.done)+'/'+T.done}</td>`).join('')}</tr>
          <tr><td class="r">期望值</td>${steps.map(([n])=>{ const v=T.ev[n-1]; return `<td class="r ${v==null?'':cls(v)}">${v==null?'—':btFmt(v*100,'pct')}</td>`; }).join('')}</tr></tbody></table></div>
        <p class="bt-note bt-after">上表只列勝率有變化的天數；期望值＝那一天所有訊號報酬的平均（所有已滿 ${T.H} 天的訊號合起來）。</p>
        ${pathSec(s)}
        <div class="bt-chartbar bt-lev"><label>槓桿倍數 <input type="number" id="${s.id}-lev" value="2" min="0.1" max="10" step="0.1" inputmode="decimal"></label><span class="bt-note">浮虧與報酬直接乘上倍數（簡化計算，不含正 2 每日重設、利息與追繳）</span></div>
        <div class="bt-scroll noterm"><table class="t bt"><thead><tr><th class="r">首日日期</th><th class="r">首日收盤</th><th class="r">首次翻正</th><th class="r">穩定翻正</th>
          <th class="r">翻正前最低日</th><th class="r">到達最低(天)</th><th class="r">最大浮虧</th><th class="r">浮虧×槓桿</th>${T.stable!=null?`<th class="r">第${T.stable}天報酬</th><th class="r">第${T.stable}天×槓桿</th>`:''}<th class="r">${T.H}天報酬</th><th class="r">${T.H}天報酬×槓桿</th>${s.paths&&s.paths[120]?'<th class="r">120天報酬</th><th class="r">120天報酬×槓桿</th>':''}</tr></thead>
          <tbody id="${s.id}-turnb">${turnRows(s,2)}</tbody></table></div>`;
    };
    // BC 系列：高檔觀測（引擎在 backtest.js 的 highWatch）
    const hwSec=s=>{
      const H=s.hw; if(!H) return '';
      const HS=[7,14,30,60,120], B=H.base;
      // 下跌機率比基準高 15 個百分點以上的格子標出來
      const cell=(o,N)=>{ const h=o.h[N]; if(!h.n) return '<td class="r">—</td>';
        const hot=o!==B&&h.down-B.h[N].down>=15;
        return `<td class="r${hot?' bt-top':''}"><span class="${cls(h.avg)}">${btFmt(h.avg,'pct')}</span><br><span class="bt-gap">下跌機率 ${h.down.toFixed(0)}%</span></td>`; };
      const row=(o,k)=>`<tr${k?` class="${k}"`:''}><td class="tx">${o.name}</td><td class="r">${o===B?'每天':o.n}</td>${HS.map(N=>cell(o,N)).join('')}
        <td class="r${o!==B&&o.crash!=null&&o.crash-B.crash>=10?' bt-top':''}">${o.crash==null?'—':`${o.crash.toFixed(0)}%${o===B?'':`<br><span class="bt-gap">${o.crashN} / ${o.doneN}</span>`}`}</td></tr>`;
      const main=H.rows.filter(r=>!['fiturn','ratio'].includes(r.key)), ext=H.rows.filter(r=>['fiturn','ratio'].includes(r.key));
      // 結論只說站得住的：平均報酬差距不到 1 個百分點算「差不多」；
      // 「明顯比較容易跌」要已完成 14 天的樣本至少 8 次、下跌機率比基準高 15 個百分點以上（與紫底同一標準）
      const first=H.rows[0], lit=H.tops.filter(t=>t.lit).length;
      const few=n=>n<12?`；只有 ${n} 次，僅供參考`:'';
      const pc0=v=>`<b class="num">${v.toFixed(0)}%</b>`;
      const f30=first.h[30], gap30=f30.avg-B.h[30].avg;
      const cand=H.rows.filter(r=>r.key!=='every'&&r.h[14].n>=8&&r.h[14].down-B.h[14].down>=15).sort((a,b)=>b.h[14].down-a.h[14].down)[0];
      // 首日本身的下跌機率明顯偏高時，不下「不是賣出訊號」的結論，避免前後兩句矛盾
      const notSell=cand&&cand===first?'':'，亮燈本身不是賣出訊號';
      const avgTxt=!f30.n?'':`首日之後 30 天平均 ${bv(f30.avg,'pct')}（基準 ${bv(B.h[30].avg,'pct')}），`+
        (gap30>=1?`<b>比基準好${notSell}</b>`:gap30>-1?`<b>和基準差不多（差距不到 1 個百分點）${notSell}</b>`:`比基準低 ${Math.abs(gap30).toFixed(2)} 個百分點`)+few(f30.n)+'。';
      const candTxt=cand?`14 天後下跌機率明顯比基準高的是「${cand.name}」：${pc0(cand.h[14].down)}，基準 ${pc0(B.h[14].down)}（${cand.h[14].n} 次${cand.h[14].n<12?'，次數少，僅供參考':''}）。`
        :`各起點 14 天後的下跌機率都沒有比基準（${pc0(B.h[14].down)}）高 15 個百分點以上，<b>沒有哪個起點明顯比較容易跌</b>。`;
      const N=H.now, last=mk.d[LAST];
      return `
        <h2 class="bt-h2" id="${s.id}-hw">高檔觀測：亮燈之後大盤怎麼走？</h2>
        <div class="card bt-status noterm"><div class="dgrid keys">
          <div><span>${dt(last)}</span><b class="num ${N.on?'up':''}">${N.on?`亮燈中・連續 ${N.streak} 天`:'沒亮'}</b><em>${N.lastLit?`最近一次亮燈 ${dt(N.lastLit)}`:'2012 年以來沒亮過'}</em></div>
          <div><span>最近 60 個交易日</span><b class="num">亮 ${N.recent} 天</b><em>亮燈＝當天以前資料的前 ${Math.round(s.pct*100)}%</em></div>
          <div><span>最後一天的值</span><b class="num">${H.lastVal==null?"—":fmt(H.lastVal/1e5,1)+" 億"}</b><em>${s.col}</em></div>
          <div><span>亮燈門檻（當天）</span><b class="num">${H.lastThr==null?"—":fmt(H.lastThr/1e5,1)+" 億"}</b><em>門檻逐日變動，不寫死</em></div>
        </div></div>
        <p class="bt-lead">BC 燈號亮的時候，大盤常常還在漲（緩漲急跌、長期多頭），所以除了「首日」，也比較了幾種不同的起點。
          ${avgTxt}${candTxt}</p>
        <div class="bt-scroll noterm"><table class="t bt"><thead><tr><th class="tx">從哪一天開始算</th><th class="r">次數</th>${HS.map(N=>`<th class="r">${N} 天後</th>`).join('')}<th class="r">120 天內曾跌<br>10% 以上</th></tr></thead><tbody>
          ${main.map(o=>row(o)).join('')}${row(B,'base grp')}${ext.map((o,k)=>row(o,k?'':'grp')).join('')}
        </tbody></table></div>
        <p class="bt-note bt-after">每格上面是平均報酬（第 N 天收盤比起算日收盤的漲跌幅，所有次數平均），下面是下跌機率（歷史上第 N 天收盤比起算日低的次數占幾成；次數少時只代表過去的結果，不代表下次的機率）；紫底＝下跌機率比基準高 15 個百分點以上（最後一欄是高 10 個百分點以上）。
          全部只用當天就知道的資訊：「熄燈」＝前一個交易日亮、當天沒亮；「連續亮 K 天以上後熄燈」看的是熄燈前連續亮了幾個交易日。
          「一段亮燈的最後一天」要等之後沒再亮才知道，等於偷看未來，所以不用。外資期貨淨單＝外資(大小台)期貨總未平倉，由 ≥0 變成 &lt;0。${ext.some(r=>r.key==='ratio')?'BC÷SC 是同一天外資 BC 金額除以 SC 金額，用來排除「大盤上漲讓 BC 金額跟著變大」的影響，只當參考。':''}</p>
        <h3 class="bt-h3">2012 年以來跌 10% 以上的高點：高點前 90 天內有沒有亮燈？</h3>
        <div class="bt-scroll noterm"><table class="t bt"><thead><tr><th class="r">高點（收盤）</th><th class="r">高點收盤</th><th class="r">之後最低</th><th class="r">最大跌幅</th><th class="r">高點前 90 天內亮燈</th><th class="r">最近一次亮燈</th></tr></thead><tbody>
          ${H.tops.map(t=>`<tr><td class="r">${dt(t.date)}</td><td class="r">${fmt(t.close)}</td><td class="r">${dt(t.low)}</td><td class="r down">${btFmt(t.drop,'pct')}</td>
            <td class="r">${t.lit?'<b class="up">有</b>':'<span class="dim">沒有</span>'}</td><td class="r">${t.lit?(t.before===0?'高點當天':`高點前 ${t.before} 天（${dt(t.litDate)}）`):'—'}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="bt-note bt-after">高點＝之後收盤跌 10% 以上、又回到原高點以前的最高收盤（最新一段還沒回到高點也列入）。${H.tops.length} 個高點裡有 ${lit} 個在高點前 90 天內亮過燈；
          反過來看，亮燈首日之後 120 天內真的跌 10% 以上的是 ${first.crashN} / ${first.doneN} 次。所以這個燈號比較像「現在在高檔」的提醒，要搭配其他條件，不能單獨當賣出訊號。</p>`;
    };
    const section=(s,k)=>`
      <section id="${s.id}" data-sig="${s.id}"${k?' hidden':''}>
        ${status(s)}
        <p class="bt-lead">${lead(s)}</p>
        ${hwSec(s)}
        <h2 class="bt-h2" id="${s.id}-history">訊號在歷史走勢上的位置</h2>
        <p class="bt-note">箭頭＝計入的訊號首日。點一下圖表後可用滑鼠滾輪放大縮小，按住拖曳左右移動（手機：兩指縮放、左右滑動），雙擊回到全部；點一下箭頭附近可跳到表一那一列。</p>
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
        ${turnSec(s)}
        <h2 class="bt-h2" id="${s.id}-events">表一　訊號日期追蹤表</h2>
        <p class="bt-note">「—」＝低點就是首日，不適用；「未達成(N天)」＝截至資料最後一天已經過 N 天仍未發生。站回／再跌破費時自前一事件起算。</p>
        ${btTable('events',s.events,{rowId:r=>`ev-${s.id}-${r['首日日期']}`})}
        <h2 class="bt-h2" id="${s.id}-summary">表二　多週期表現與極值統計摘要</h2>
        <p class="bt-note">只有「首日收盤」可以實際交易；兩種低點是事後才知道的，僅供參考（斜體）。灰字為無條件基準。持有週期未滿的事件不計入，列在「未完成」。</p>
        ${btTable('summary',s.summary,{group:'評估基準'})}
        <h2 class="bt-h2" id="${s.id}-pullbacks">表三　突破前高後回檔 5%／10%／15%／20%</h2>
        <p class="bt-note">回檔＝收盤價相對「突破日起的滾動最高收盤」的跌幅，費時自突破日起算。多個訊號共用同一個突破日時合併成一列。共 ${s.pullbacks.length} 個突破日。</p>
        ${s.pullbacks.length?btTable('pullbacks',s.pullbacks):'<p class="bt-note">目前沒有已突破前高的事件。</p>'}
        <h2 class="bt-h2" id="${s.id}-robust">穩健性檢查（持有 ${(s.regimeHolds||[30,60]).join("／")} 天）</h2>
        ${robust(s)}
        <p class="bt-note">分年度：基準＝同一年所有交易日。超額為負代表那一年訊號輸給隨便買。${mk.d[0].slice(5)!=='01-01'?`${mk.year[0]} 年資料從 ${+mk.d[0].slice(5,7)} 月開始，全年漲跌只算到該年第一天以後。`:''}</p>
        ${btTable('byYear',s.byYear,{cols:btRegCols(BT_COLS.byYear.slice(0,3),s.regimeHolds||[30,60])})}
        <p class="bt-note bt-after">分盤勢：前三種分類在訊號當天就能判斷；「全年漲跌」要到年底才知道，只能用來理解訊號，不能拿來交易。基準＝同一組別的所有交易日。每組只有個位數到二十幾筆，差距要保守看待。</p>
        ${btTable('byRegime',s.byRegime,{group:'分類方式',cols:btRegCols(BT_COLS.byRegime.slice(0,3),s.regimeHolds||[30,60])})}
        ${exitSec(s)}
      </section>`;
    // 訊號選擇卡：一張卡一類（強烈落底／BP過熱／BC過熱），點了切換下方內容；同一類有多個燈號時，卡片下方是第二層
    const pickCard=([gname,ids,gdesc],k)=>{
      const one=ids.length===1, s0=res.signals.find(y=>y.id===ids[0]);
      const head=`<button class="bt-card-pick bt-tab" role="tab" data-grp="${k}" aria-selected="${k?'false':'true'}" style="--sc:${SIG_COLOR[ids[0]]||'#3B82F6'}">
        <span class="bt-pk-top"><i class="bt-dot"></i><b>${one?s0.label:gname}</b><em class="bt-pk-on">目前查看</em></span>
        <span class="bt-pk-desc">${one?s0.desc:gdesc}</span>`;
      if(one){ const x=btPick(s0.excess,{'持有週期':'30天'}), e=s0.events[0];
        return head+`<span class="bt-pk-stats">
          <span><small>計入次數</small><b class="num">${s0.count}</b></span>
          <span><small>最近一次</small><b class="num">${e?dt(e['首日日期']):'—'}</b></span>
          <span><small>30 天勝率</small>${bv(x['訊號勝率'],'pct0')}<small class="bt-pk-base">基準 ${btFmt(x['基準勝率'],'pct0')}</small></span>
          <span><small>30 天超額</small>${bv(x['超額期望值'],'pct',1)}</span>
        </span></button>`; }
      return head+`<span class="bt-pk-rows">${ids.map(id=>{ const s=res.signals.find(y=>y.id===id), e=s.events[0], x=btPick(s.excess,{'持有週期':'30天'});
          return `<span class="bt-pk-row" style="--sc:${SIG_COLOR[id]||'#3B82F6'}"><i class="bt-dot"></i><b>${s.name}</b><span class="num">${s.count} 次</span><span class="num">最近 ${e?dt(e['首日日期']):'—'}</span><span>30 天超額 ${bv(x['超額期望值'],'pct',1)}</span></span>`; }).join('')}</span></button>`;
    };

    main.innerHTML=`
      <div class="crumb"><a href="index.html">主頁</a><span>/</span><span>訊號回測</span></div>
      <div class="card r-head">
        <div class="eyebrow">資料更新至 ${dt(res.last)}（${weekday(res.last)}）・${dt(res.first)} 起共 ${res.days.toLocaleString()} 個交易日</div>
        <h1>台股籌碼訊號回測</h1>
        <p class="bt-sub">加權指數收盤價，所有天數皆為日曆天，日期由新到舊。訊號觸發後 10 個交易日內不重複計算。資料直接讀取每日籌碼試算表，試算表更新後重新整理即會重算。</p>
        ${end?`<p class="bt-warn">驗算模式：只使用 ${dt(end)} 以前的資料。<a href="signals.html">回到最新資料 →</a></p>`:''}
        ${warn.length?`<details class="bt-warn"><summary>資料檢查有 ${data.warnings.length} 項提醒</summary><ul>${warn.map(w=>`<li>${w}</li>`).join('')}</ul></details>`:''}
      </div>
      <h2 class="bt-pick-h noterm">選擇要看的訊號 <span>點卡片切換；BP過熱、BC過熱在卡片下方再選燈號；往下捲時，上方會固定一條切換列</span></h2>
      <div class="bt-pick noterm" role="tablist" id="btPick">${GROUPS.map(pickCard).join('')}</div>
      <div class="bt-subtabs" id="bt-sub" role="tablist"></div>
      <div class="bt-switch noterm" id="btSwitch" aria-hidden="true"><div class="bt-switch-in">
        <span class="bt-switch-l">訊號</span>
        ${GROUPS.map((g,k)=>`<button class="bt-tab" data-grp="${k}" style="--sc:${SIG_COLOR[g[1][0]]||'#3B82F6'}" aria-selected="false" tabindex="-1"><i class="bt-dot"></i>${g[0]}</button>`).join('')}
        <span class="bt-switch-sub" id="btSwSub"></span></div></div>
      ${res.signals.map(section).join('')}
      <details class="card bt-details" id="definitions"><summary>定義與計算方式</summary><ul>
        <li><b>資料來源</b>：每日籌碼試算表「工作表1」的加權指數收盤、落底訊號用到的欄位（強烈落底由網站自算，規則同每日籌碼頁）、外資(BC)／(BP)OP未平倉金額與結算比（T、W 欄）、外資(大小台)期貨未平倉；「Sheet1」的外資 BC（H 欄）、SC、BP 金額。網頁開啟時即時讀取並計算。</li>
        <li><b>持有週期</b>：7／14／30／60／90 個日曆天（BP極端過熱紅燈另外加上「第一次穩定達到 100%」那天與 120 天，這個天數會隨新資料浮動；BP過熱紫燈、BP紫爆與 BC 系列加上 120 天），出場價取到期日當天或之前最後一個交易日的收盤。資料不足一個完整週期的事件列為「未完成」，不計入統計。</li>
        <li><b>燈號（逐日判斷）</b>：當天的值 ≥ 當天以前（含當天）所有資料由大到小第 k 大的值，k＝資料天數×門檻百分比，無條件捨去、至少 1。只用當天以前的資料，所以不會因為後來的資料而改變（試算表的條件格式是拿整欄比較、包含之後的資料，舊日期的顏色會和這裡不同）。2012 年起判斷；連續亮燈只取第一天，距離上一個亮燈日滿 10 個交易日才算新的一次。
          <ul>
            <li>BP 系列（大跌時的極端行情）：<b>BP極端過熱紅燈</b>＝外資 BP 金額前 2%（簡稱 BP紅燈）；<b>BP過熱紫燈</b>＝外資 BP 金額前 10%；<b>BP紫爆</b>＝外資(BP)OP未平倉金額與結算比（W 欄）前 1%。</li>
            <li>BC 系列（高檔或暴漲時）：<b>BC極端過熱綠燈</b>＝外資 BC 金額（Sheet1 H 欄）前 1%；<b>BC過熱黃燈</b>＝外資 BC 金額前 10%；<b>BC紫爆</b>＝外資(BC)OP未平倉金額與結算比（T 欄）前 1%。</li>
            <li>「與結算比」在結算日歸零，代表上次結算以來增加了多少，可能是負數。</li>
          </ul></li>
        <li><b>價格</b>：加權指數收盤價；沒有盤中高低。</li>
        <li><b>天數</b>：所有「費時」「到達天數」「持有週期」都是日曆天（兩個日期相減）。</li>
        <li><b>冷卻期</b>：訊號出現後 10 個交易日內的訊號不另計，以最後一個「計入」的訊號為起點。</li>
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

    res.signals.filter(s=>s.turn).forEach(s=>{
      const inp=$('#'+s.id+'-lev'), capEl=$('#'+s.id+'-cap'), box=$('#'+s.id+'-exitc');
      const lev=()=>{ const L=parseFloat(inp&&inp.value); return L>0?L:2; };
      let cap=capEl?+capEl.querySelector('button').dataset.c:null;
      const redrawExit=()=>{ if(box&&cap) box.innerHTML=exitBody(s,cap,lev()); };
      if(inp) inp.addEventListener('input',()=>{ const L=parseFloat(inp.value); if(!(L>0)) return; $('#'+s.id+'-turnb').innerHTML=turnRows(s,L); const e=$('#'+s.id+'-evlev'); if(e) e.textContent=evLev(s,L); redrawExit(); });
      if(capEl) capEl.addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; cap=+b.dataset.c; capEl.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b)); redrawExit(); });
      const ph=$('#'+s.id+'-ph'), pbox=$('#'+s.id+'-pathc');
      if(ph&&pbox) ph.addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; ph.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));
        pbox.innerHTML=pathBody(s,+b.dataset.h); pathChart($('#'+s.id+'-pc'),s.paths[b.dataset.h],s.turn.stable); });
    });

    /* 歷史走勢圖：分頁第一次顯示時才建立（隱藏時量不到寬度） */
    const made={};
    const histChart=s=>{
      if(made[s.id]||!window.LightweightCharts) return; made[s.id]=1;
      const el=$('#'+s.id+'-hc'), lg=$('#'+s.id+'-lg');
      const ch=baseChart(el,{rightPriceScale:{borderColor:'#232B3A',mode:1},timeScale:{borderColor:'#232B3A',fixLeftEdge:true,fixRightEdge:true,minBarSpacing:0.05},
        // 點一下圖表後滾輪＝放大縮小（以滑鼠位置為中心，見 clickToZoom）；按住拖曳＝左右移動；手機兩指縮放、左右滑動，上下滑仍捲動頁面
        handleScroll:{mouseWheel:false,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
        handleScale:{mouseWheel:false,pinch:true,axisPressedMouseMove:{time:true,price:false},axisDoubleClickReset:false}});
      (window.__btCharts||(window.__btCharts={}))[s.id]=ch;   // 方便在主控台檢查
      const ser=ch.addAreaSeries({lineColor:'#60A5FA',topColor:'rgba(96,165,250,.2)',bottomColor:'rgba(96,165,250,.02)',lineWidth:1.5,priceFormat:{type:'price',precision:0,minMove:1}});
      ser.setData(mk.d.map((d,i)=>({time:d,value:mk.c[i]})));
      const mcol=s.id==='bp'?PURPLE:SIG_COLOR[s.id]||UP;   // BP紅燈用紫色箭頭，與每日籌碼走勢圖一致；BC 系列（高檔）箭頭在上方朝下
      ser.setMarkers(s.idxs.map(i=>s.kind==='high'?{time:mk.d[i],position:'aboveBar',color:mcol,shape:'arrowDown'}:{time:mk.d[i],position:'belowBar',color:mcol,shape:'arrowUp'}));
      ch.timeScale().fitContent();
      const evd=s.idxs.map(i=>mk.d[i]);
      const show=t=>{ const i=t?mk.idxOf.get(t):LAST; lg.innerHTML=`<b>${dt(mk.d[i])}</b> 加權 <b>${fmt(mk.c[i])}</b>${evd.includes(mk.d[i])?` ・<span style="color:${mcol}">${s.name}</span>`:''}`; };
      show(); ch.subscribeCrosshairMove(p=>show(p&&tStr(p.time)));
      /* ---- 日期區間：點一下圖表後滾輪放大縮小、按住拖曳左右移動；快速按鈕與起訖日期；雙擊回到全部 ---- */
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
    const evMade={}, lastSel={};
    const groupOf=id=>GROUPS.findIndex(g=>g[1].includes(id));
    // 第二層按鈕：同一類的燈號（BP過熱：BP過熱紫燈、BP極端過熱紅燈、BP紫爆；BC過熱：BC過熱黃燈、BC極端過熱綠燈、BC紫爆）
    const subBtns=(G,id,short)=>G[1].length<2?'':G[1].map(x=>{ const s=res.signals.find(y=>y.id===x);
      return `<button class="bt-subtab" role="tab" data-tab="${x}" aria-selected="${x===id}" title="${s.label}" style="--sc:${SIG_COLOR[x]||'#3B82F6'}"><i class="bt-dot"></i>${short?s.name:s.label}</button>`; }).join('');
    const show=id=>{
      if(!res.signals.some(s=>s.id===id)) id=res.signals[0].id;
      const gi=groupOf(id), G=GROUPS[gi]; lastSel[gi]=id;
      document.querySelectorAll('.bt-tab[data-grp]').forEach(b=>b.setAttribute('aria-selected',+b.dataset.grp===gi?'true':'false'));
      const sub=$('#bt-sub'); sub.hidden=G[1].length<2; sub.innerHTML=subBtns(G,id);
      const ss=$('#btSwSub'); ss.innerHTML=subBtns(G,id,true); ss.hidden=G[1].length<2;
      document.querySelectorAll('section[data-sig]').forEach(x=>{ x.hidden=x.id!==id; });
      const s=res.signals.find(x=>x.id===id);
      histChart(s);
      if(!evMade[id]){ evMade[id]=1; evChart($('#'+id+'-ev'),s.excess,SIG_COLOR[id]||'#3B82F6'); }
      if(s.turn&&!evMade[id+'-pc']){ const el=$('#'+id+'-pc'); if(el){ evMade[id+'-pc']=1; pathChart(el,s.paths[Object.keys(s.paths)[0]],s.turn.stable); } }
    };
    /* 固定切換列：選擇卡捲出畫面後出現在導覽列下方 */
    const sw=$('#btSwitch'), pick=$('#btPick'), navEl=$('#nav');
    const navH=()=>navEl?navEl.offsetHeight:56;
    const setTop=()=>main.style.setProperty('--navh',navH()+'px');
    // 導覽列高度會變（手機換行、即時指數晚一點才出現），跟著更新
    setTop(); window.addEventListener('resize',setTop); if(window.ResizeObserver&&navEl) new ResizeObserver(setTop).observe(navEl);
    const onScroll=()=>{ const on=$('#bt-sub').getBoundingClientRect().bottom<navH()+4&&pick.getBoundingClientRect().bottom<navH()+4; sw.classList.toggle('on',on); sw.setAttribute('aria-hidden',on?'false':'true');
      sw.querySelectorAll('button').forEach(b=>b.tabIndex=on?0:-1); };
    window.addEventListener('scroll',onScroll,{passive:true}); onScroll();
    // 切換時停在同一個段落（例如表一 → 另一個訊號的表一）；還在頁首就不捲動
    const switchTo=(id,fromBar)=>{
      const cur=document.querySelector('section[data-sig]:not([hidden])');
      const off=navH()+(sw.classList.contains('on')?sw.firstElementChild.offsetHeight:0)+12;
      let part=null;
      if(cur) cur.querySelectorAll('.bt-h2').forEach(h=>{ if(h.getBoundingClientRect().top<=off+40) part=h.id.slice(cur.id.length); });
      show(id); history.replaceState(null,'',location.pathname+location.search+'#'+id);
      // 另一個訊號沒有同名段落（例如 BP紅燈獨有的分析）時，回到該訊號開頭
      const target=(part&&$('#'+id+part))||(part||fromBar?$('#'+id):null);
      // 圖表在 show() 裡才建立，等版面穩定再捲；不要平滑捲動（html 設了 smooth）
      const go=()=>{ if(target) window.scrollTo({top:target.getBoundingClientRect().top+scrollY-off,behavior:'instant'}); onScroll(); };
      go(); setTimeout(go,0);
    };
    // 第一層（選擇卡、切換列的類別）：回到這一類上次看的燈號；第二層：直接切到該燈號
    const onPick=fromBar=>e=>{ const t=e.target.closest('.bt-subtab'); if(t) return switchTo(t.dataset.tab,fromBar);
      const b=e.target.closest('.bt-tab[data-grp]'); if(b){ const gi=+b.dataset.grp; switchTo(lastSel[gi]||GROUPS[gi][1][0],fromBar); } };
    pick.addEventListener('click',onPick(false)); $('#bt-sub').addEventListener('click',onPick(false)); sw.addEventListener('click',onPick(true));
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
// 燈號與名詞都是外資；「自營 BP 過熱」這類自營商數字不連結、不算搜尋命中
const NOT_DEALER='(?<!自營\\s?)';
function termPat(n){
  const t=n.trim(); if(!t) return null;
  const core=[...t.replace(/\s/g,'')].map(escRe).join('\\s*');
  return NOT_DEALER+(/^[A-Za-z0-9]/.test(t)?'(?<![A-Za-z0-9])':'')+core+(/[A-Za-z0-9]$/.test(t)?'(?![A-Za-z0-9])':'');
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
  const re=new RegExp(NOT_DEALER+'(?:'+pats.map(x=>x.p).join('|')+')','g');
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
