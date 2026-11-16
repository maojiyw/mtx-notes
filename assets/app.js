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
  const shown = D.reviews.filter((r,i)=>i<5||r.id===activeId);
  const links = [`<a href="${base}index.html" class="${activeId?'':'on'}">主頁</a>`]
    .concat(shown.map(r=>`<a href="${reviewUrl(r)}" class="${activeId===r.id?'on':''}">${md(r.date)}</a>`))
    .concat(D.reviews.length>shown.length?[`<a href="${base}index.html#list">全部 ${D.reviews.length} 篇</a>`]:[]);
  $('#nav').innerHTML = `<div class="nav-in"><a class="brand" href="${base}index.html"><div class="brand-logo">MTX</div><span>復盤筆記</span></a><nav class="nav-links">${links.join('')}</nav></div>`;
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
function chipCharts(ids,dates){
  if(!window.LightweightCharts) return;
  const C=D.chips; const idx=C.dates.map((d,i)=>i).filter(i=>!dates||(C.dates[i]>=dates[0]&&C.dates[i]<=dates[1]));
  const pick=(arr)=>idx.map(i=>({time:C.dates[i],v:arr[i]})).filter(x=>x.v!=null);
  const empty=(id,arr)=>{ if(pick(arr).length) return false; $(id).innerHTML='<p class="mini-empty">此期間筆記沒有這項籌碼資料</p>'; return true; };
  if(empty(ids[0],C.fiOI)) return;
  const c1=baseChart($(ids[0])); const h1=c1.addHistogramSeries({priceFormat:{type:'volume'}});
  h1.setData(pick(C.fiOI).map(x=>({time:x.time,value:x.v,color:x.v>=0?UP:(x.v<=-10000?DN:'rgba(16,185,129,.5)')})));
  h1.createPriceLine({price:-20000,color:'#F59E0B',lineStyle:2,lineWidth:1,title:'−2萬'}); c1.timeScale().fitContent();
  const c2=baseChart($(ids[1])); const h2=c2.addHistogramSeries({priceFormat:{type:'volume'}});
  h2.setData(pick(C.fiBP).map(x=>({time:x.time,value:x.v,color:x.v>=2500000?'#A855F7':x.v>=2000000?'rgba(168,85,247,.6)':'rgba(96,165,250,.5)'})));
  h2.createPriceLine({price:3640000,color:UP,lineStyle:2,lineWidth:1,title:'紅燈'}); c2.timeScale().fitContent();
  if(empty(ids[2],C.rtLong)) return;
  const c3=baseChart($(ids[2]),{leftPriceScale:{visible:true,borderColor:'#232B3A'}});
  const h3=c3.addHistogramSeries({priceScaleId:'left',priceFormat:{type:'volume'},color:'rgba(239,68,68,.35)'});
  h3.setData(pick(C.rtLong).map(x=>({time:x.time,value:x.v})));
  const l3=c3.addLineSeries({color:'#F59E0B',lineWidth:2,priceFormat:{type:'custom',formatter:v=>v.toFixed(0)+'%'}});
  l3.setData(pick(C.rtPct).map(x=>({time:x.time,value:x.v}))); c3.timeScale().fitContent();
}
const chipCardsHTML = (p) => `
  <div class="grid3">
    <div class="card"><div class="card-h">外資期貨未平倉 <span class="sub">口・相對結算日</span></div><div class="mini" id="${p}1"></div></div>
    <div class="card"><div class="card-h">外資 BP 金額 <span class="sub">千元・紫＝過熱</span></div><div class="mini" id="${p}2"></div></div>
    <div class="card"><div class="card-h">散戶多單 <span class="sub">柱＝口數・線＝持倉比</span></div><div class="mini" id="${p}3"></div></div>
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
function renderHome(){
  nav(null);
  const latest=D.reviews[0], last=DAILY[DAILY.length-1];
  const hi=D.campaign.high.value, lo=D.campaign.low.value, peakIntra=lo/(1+D.campaign.drawdown/100);
  const rec=(last.value-lo)/(peakIntra-lo)*100;

  $('#hero').innerHTML = `
    <div class="card hero-main">
      <div class="eyebrow">最新復盤・${latest.date.replace(/-/g,'/')}</div>
      <h1>${latest.title}</h1>
      <p>${latest.summary}</p>
      <div class="hero-price"><span class="px num ${cls(latest.chg)}">${fmt(latest.close)}</span><span class="ch num ${cls(latest.chg)}">${sign(latest.chg)}${fmt(latest.chg)}（${sign(latest.pct)}${latest.pct}%）</span><span class="badge">加權指數收盤</span></div>
      <a class="cta" href="${reviewUrl(latest)}">閱讀本週復盤 →</a>
    </div>
    <div class="card"><div class="kpis">
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
  chipCharts(['#hc1','#hc2','#hc3']);
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
    <div class="toc">${parts.map((p,k)=>`<a href="#${p.anchor}">${CN[k]}、${p.h}</a>`).join('')}${r.week[1]<D.chips.dates[0]?'':'<a href="#chips">籌碼圖</a>'}<a href="#market">當週市場資訊</a></div>`;

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
    <section class="sec" id="chips"${r.week[1]<D.chips.dates[0]?' hidden':''}>
      <div class="sec-h"><h2>籌碼圖</h2><p>取自筆記中的籌碼表，到本週為止</p></div>
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
  if(r.week[1]>=D.chips.dates[0]) chipCharts(['#rc1','#rc2','#rc3'],[D.chips.dates[0],r.week[1]]);
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
if(page==='review'){ renderReview(document.body.dataset.id); glossary($('#main')); }
})();
