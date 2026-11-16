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

const page = document.body.dataset.page;
const base = page==='review' ? '../' : '';
const reviewUrl = r => `${base}reviews/${r.id}.html`;
const pdfUrl = r => base + 'notes-pdf/' + encodeURIComponent(r.pdf);

// daily with change
const DAILY = D.daily.map(([t,c],i,a)=>{ const p=i?a[i-1][1]:null; return {time:t,value:c,chg:p==null?null:c-p,pct:p==null?null:(c-p)/p*100}; });
const dayOf = t => DAILY.find(d=>d.time===t);

/* ---------- nav ---------- */
function nav(activeId){
  const onChips = activeId==='chips', onTopics = activeId==='topics';
  $('#nav').innerHTML = `<div class="nav-in"><a class="brand" href="${base}index.html"><div class="brand-logo">MTX</div><span>復盤筆記</span></a>
    <nav class="nav-tabs">
      <a href="${base}index.html#list" class="tab-review${onChips||onTopics?'':' on'}"><i class="ico">▤</i>每週復盤<span class="cnt">${D.reviews.length}</span></a>
      <a href="${base}chips.html" class="tab-chips${onChips?' on':''}"><i class="live"></i>每日籌碼</a>
      <a href="${base}topics.html" class="tab-search${onTopics?' on':''}" aria-label="搜尋與主題"><i class="ico">⌕</i><span class="lbl">搜尋</span></a>
    </nav></div>`;
}

/* ---------- charts ---------- */
function baseChart(el,extra){
  return LightweightCharts.createChart(el,Object.assign({
    autoSize:true,
    layout:{background:{type:'solid',color:'#151A23'},textColor:'#8A94A7',fontSize:11,fontFamily:"'JetBrains Mono',monospace"},
    grid:{vertLines:{visible:false},horzLines:{color:'rgba(35,43,58,.6)'}},
    rightPriceScale:{borderColor:'#232B3A'},
    timeScale:{borderColor:'#232B3A',fixLeftEdge:true,fixRightEdge:true},
    crosshair:{mode:LightweightCharts.CrosshairMode.Magnet,vertLine:{color:'#5D677B',labelBackgroundColor:'#2E3850'},horzLine:{color:'#5D677B',labelBackgroundColor:'#2E3850'}},
    handleScroll:false,handleScale:false,localization:{locale:'zh-TW'}
  },extra||{}));
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
function chipCharts(ids,C,{end=null,n=60}={}){
  if(!window.LightweightCharts) return;
  let idx=C.dates.map((d,i)=>i).filter(i=>!end||C.dates[i]<=end); idx=idx.slice(-n);
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
    h2.createPriceLine({price:3640000,color:UP,lineStyle:2,lineWidth:1,title:'紅燈'}); c2.timeScale().fitContent();
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
      <div class="hero-price"><span class="px num ${cls(latest.chg)}">${fmt(latest.close)}</span><span class="ch num ${cls(latest.chg)}">${sign(latest.chg)}${fmt(latest.chg)}（${sign(latest.pct)}${latest.pct}%）</span><span class="badge">加權指數收盤</span></div>
      <div class="ctas"><a class="cta" href="${reviewUrl(latest)}">閱讀本週復盤 →</a><a class="cta ghost" href="#list">所有復盤</a></div>
    </div>
    <div class="card hero-main feat feat-chips" id="daily"><div class="feat-tag"><i class="live"></i>每日籌碼<span>每日更新</span></div><p class="loading">讀取試算表中…</p></div>`;
  dailyCard($('#daily'));
  $('#campaign').innerHTML = `<div class="card"><div class="kpis k6">
      <div class="kpi"><span>前高（${md(D.campaign.high.date)} 收盤）</span><b class="num">${fmt(hi)}</b><em>10 月初高檔，散戶 FOMO</em></div>
      <div class="kpi"><span>波段低點（${md(D.campaign.low.date)} 盤中）</span><b class="num down">${fmt(lo)}</b><em>自最高點 ${D.campaign.drawdown}%</em></div>
      <div class="kpi"><span>最新收盤（${md(last.time)}）</span><b class="num ${cls(last.chg)}">${fmt(last.value)}</b><em>已收復約 ${rec.toFixed(0)}% 跌幅</em></div>
      <div class="kpi"><span>目前部位</span><b class="num">${latest.position}</b><em>11/2 以 1.68 倍進場</em></div>
      <div class="kpi"><span>外資 BP 峰值（11/6）</span><b class="num" style="color:#C084FC">3.25 億</b><em>紅燈約 3.64 億，未觸發</em></div>
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
  withChips(['#hc1','#hc2','#hc3'],{n:60},$('#chipsNote'));
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
      <div class="sec-h"><h2>籌碼圖</h2><p>本週為止的近 60 個交易日・<span id="chipsNote">讀取中</span>・<a href="../chips.html">看每日籌碼 →</a></p></div>
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
  withChips(['#rc1','#rc2','#rc3'],{end:r.week[1],n:60},$('#chipsNote'));
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

function renderChips(){
  nav('chips');
  const main=$('#main');
  window.MTXSheet.load().then(data=>{
    const R=data.rows, L=R[R.length-1], P=R[R.length-2]||{};
    const lastStrong=[...R].reverse().find(r=>sigOn(r.sigStrong));
    const sigs=sigList(L);
    const delta=k=>L[k]!=null&&P[k]!=null?L[k]-P[k]:null;
    const kpi=(label,val,sub)=>`<div class="kpi"><span>${label}</span><b class="num">${val}</b><em>${sub}</em></div>`;
    const ranges=[['3M',63],['6M',126],['1Y',250],['3Y',750],['全部',0]];
    const panes=[['加權指數','紅箭頭＝強烈落底'],['外資期貨未平倉','口・相對結算日'],['外資選擇權金額','BP 紫・BC 紅・SC 綠'],['散戶多空','多單紅・空單綠（口）']];
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
          ${lastStrong?`<span class="sigs-last">最近一次強烈落底：<b class="num">${lastStrong.date.replace(/-/g,'/')}</b></span>`:''}</div>
      </div>
      <div class="card" style="margin-top:12px"><div class="kpis k4">
        ${kpi('外資期貨未平倉（相對結算日）',sgn0(L.fiRel)+' 口',`前日增減 ${sgn0(L.fiDelta)}・總未平倉 ${n0(L.fiOI)}`)}
        ${kpi('外資 BP 金額',n0(L.bp),`較前日 ${sgn0(delta('bp'))}・BP/SP 增幅比 ${L.bpsp==null?'—':L.bpsp.toFixed(1)+'%'}`)}
        ${kpi('外資 BC／SC 金額',`${n0(L.bc)}／${n0(L.sc)}`,`BC/SC 增幅比 ${L.bcsc==null?'—':L.bcsc.toFixed(1)+'%'}`)}
        ${kpi('散戶多單／空單',`${n0(L.rtLong)}／${n0(L.rtShort)}`,`多單持倉百分位 ${pctTxt(L.rtLongPct)}・較前日 ${sgn0(delta('rtLong'))}`)}
      </div></div>

      <section class="sec">
        <div class="sec-h"><h2>籌碼走勢</h2><div class="tabs" id="range">${ranges.map(([t,n],i)=>`<button data-n="${n}" class="${i===1?'on':''}">${t}</button>`).join('')}</div></div>
        <div class="stack">${panes.map(([h,sub],i)=>`
          <div class="card"><div class="card-h"><span>${h}</span> <span class="sub">${sub}</span></div><div class="chart tall"><div class="chart-legend num" id="lg${i}"></div><div id="ch${i}" style="position:absolute;inset:0"></div></div></div>`).join('')}
        </div>
      </section>

      <section class="sec" id="tbl">
        <div class="sec-h"><h2>近 30 個交易日</h2><p>最新在最上面・紅底＝有落底訊號</p></div>
        <div class="card"><div class="tscroll"><table class="t daily">
          <thead><tr><th>日期</th><th class="r">加權</th><th class="r">漲跌%</th><th class="r">外資現貨(億)</th><th class="r">外資期貨<br>相對結算</th><th class="r">前日增減</th><th class="r">BP 金額</th><th class="r">散戶多</th><th class="r">散戶空</th><th class="r">多單百分位</th><th>訊號</th></tr></thead>
          <tbody>${R.slice(-30).reverse().map(r=>{ const s=sigList(r); return `<tr${s.length?' class="sig"':''}>
            <td class="num">${md(r.date)}</td><td class="r num">${n2(r.idx)}</td><td class="r num ${cls(r.pct)}">${r.pct==null?'—':sign(r.pct)+r.pct.toFixed(2)}</td>
            <td class="r num ${cls(r.fiSpot)}">${n2(r.fiSpot)}</td><td class="r num ${cls(r.fiRel)}">${n0(r.fiRel)}</td><td class="r num ${cls(r.fiDelta)}">${n0(r.fiDelta)}</td>
            <td class="r num">${n0(r.bp)}</td><td class="r num">${n0(r.rtLong)}</td><td class="r num">${n0(r.rtShort)}</td><td class="r num">${pctTxt(r.rtLongPct)}</td>
            <td class="sigcell">${s.join('、')}</td></tr>`; }).join('')}</tbody></table></div></div>
        ${data.missing.length?`<p class="chart-note">試算表中找不到這些欄位：${data.missing.join('、')}</p>`:''}
      </section>`;

    glossary(main);
    if(!window.LightweightCharts) return;
    const T=r=>r.date, byDate=new Map(R.map(r=>[r.date,r])), charts=[];
    const legend=(i,fn,c)=>{ const el=$('#lg'+i); const show=t=>{ const r=byDate.get(t)||L; el.innerHTML=`<b>${r.date.replace(/-/g,'/')}</b> `+fn(r); }; show(L.date); c.subscribeCrosshairMove(p=>show(p&&p.time)); };
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

    const setRange=n=>{ const from=n?R[Math.max(0,R.length-n)].date:R[0].date; charts.forEach(ch=>ch.timeScale().setVisibleRange({from,to:L.date})); };
    setRange(126);
    $('#range').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; [...$('#range').children].forEach(x=>x.classList.toggle('on',x===b)); setRange(+b.dataset.n); });
  }).catch(err=>{
    main.innerHTML=`<div class="card r-head"><h1>每日籌碼</h1><p style="margin-top:8px;color:var(--muted)">讀不到籌碼試算表（${String(err&&err.message||err)}）。請確認試算表的共用設定仍是「知道連結的任何人都能檢視」，再重新整理頁面。</p></div>`;
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
// 復盤日之後 n 個交易日的指數變化
function after(date,n){
  let i=-1; DAILY.forEach((d,k)=>{ if(d.time<=date) i=k; });
  if(i<0||i+n>=DAILY.length) return null;
  return (DAILY[i+n].value-DAILY[i].value)/DAILY[i].value*100;
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
      ${R.length?`<div class="card tscroll"><table class="t ftbl"><thead><tr><th>復盤日</th><th class="r">當日收盤</th><th class="r">之後 5 日</th><th class="r">之後 20 日</th><th class="r">提到</th></tr></thead><tbody>
        ${R.map(({r,n})=>`<tr><td><a href="${href(r)}">${r.date.replace(/-/g,'/')}</a></td><td class="r num">${fmt(r.close)}</td><td class="r num">${aftTxt(after(r.date,5))}</td><td class="r num">${aftTxt(after(r.date,20))}</td><td class="r num">${n} 處</td></tr>`).join('')}
        </tbody></table><div class="tbl-n">「之後 N 日」＝復盤日收盤到第 N 個交易日收盤的加權指數變化，只是當週提到此主題後的大盤走勢，不代表訊號本身的績效。</div></div>
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
  const SKIP='a,script,style,.term,.chart,.chart-legend,.toc,.nav,.num,button';
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
})();
