/**
 * 信用交易 Google 試算表自動更新（Apps Script）
 *
 * 用法（只做一次）：
 *   1. 新增一份 Google 試算表 → 擴充功能 → Apps Script → 把這整個檔案貼上 → 儲存
 *   2. 左側齒輪「專案設定」→ 時區選「(GMT+08:00) 台北」
 *   3. 上方函式選單選「setup」→ 執行 → 依指示授權
 *      會建立「信用交易」工作表、匯入 2014 年起的歷史資料（已有資料就略過）、測試玩股網、設定自動更新
 *   4. 試算表 → 共用 → 一般存取權改成「知道連結的任何人」可檢視
 *
 * 之後每天台北時間 21:30、22:30、23:30 左右（Google 排程會前後差 15 分鐘內）自動執行 update()：
 *   - 新增證交所已公布的日期（也會補最近 10 天內漏掉的日期）
 *   - 櫃買還沒公布時先寫入、上櫃欄位空白，之後的執行抓到就補上
 * B 欄「維持率」：玩股網擋國外連線時抓不到，請手動填（例如 119.53）；程式不會覆蓋手動填的數字。
 *   當天的列還沒出現時，可以自己在任何位置新增一列，填日期和維持率；程式執行時會把同一天合併成一列。
 * 每次執行後整張表依日期由新到舊排好（最新的在最上面），日期欄存成文字，不需要自己排序。
 */

const SHEET = '信用交易';
const ETFS = { '00685L': '群益臺灣加權正2', '00631L': '元大台灣50正2' };   // 要加別檔：這裡加一筆，並在 HEAD 後面加 4 欄
const HEAD = ['日期', '維持率(%)', '融資餘額扣除ETF(億)',
  '上市融資(億)', '上市資增減(億)', '上市融券(張)', '上市券增減(張)',
  '上櫃融資(億)', '上櫃資增減(億)', '上櫃融券(張)', '上櫃券增減(張)',
  '00685L融資(張)', '00685L資增減(張)', '00685L融券(張)', '00685L券增減(張)',
  '00631L融資(張)', '00631L資增減(張)', '00631L融券(張)', '00631L券增減(張)'];
// 舊版資料檔（repo 已移除，固定指向最後一版的 commit）
const HISTORY_URL = 'https://raw.githubusercontent.com/maojiyw/mtx-notes/960fb91c36f68354cf3995f1d1966f0caf43b408/data/margin.json';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/* ---------- 一次性設定（改排程時間也是重新執行這個） ---------- */
const RUN_HOURS = [21, 22, 23];   // 每天這幾點的 30 分左右執行（台北時間）
function setup() {
  const tz = Session.getScriptTimeZone();
  if (tz !== 'Asia/Taipei') throw new Error('專案時區是 ' + tz + '，請先到左側齒輪「專案設定」把時區改成台北（GMT+08:00），再執行一次 setup');
  const sh = getSheet_();
  if (sh.getLastRow() <= 1) importHistory_(sh);
  const wg = fetchWantgoo_();
  Logger.log(wg ? '玩股網：抓得到（最新 ' + wg[wg.length - 1].join(' ') + '），維持率會自動更新'
                : '玩股網：抓不到（被擋），B 欄維持率請每天手動填');
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  RUN_HOURS.forEach(h => ScriptApp.newTrigger('update').timeBased().atHour(h).nearMinute(30).everyDays(1).create());
  Logger.log('已設定每天 ' + RUN_HOURS.map(h => h + ':30').join('、') + ' 自動更新');
  run_(true);
}
/* ---------- 排程執行 ---------- */
function update() { run_(false); }
/* 整張表讀進來、以日期為準處理、最後依日期由新到舊整張寫回。
   所以手動插列、手動排序、同一天出現兩列都沒關係：同一天會合併成一列（空白格用另一列的數字補），日期一律存成文字 yyyy-MM-dd。 */
function run_(force) {
  const now = new Date();
  const hour = +Utilities.formatDate(now, 'Asia/Taipei', 'H');
  const sh = getSheet_();
  const by = readRows_(sh);
  const today = Utilities.formatDate(now, 'Asia/Taipei', 'yyyy-MM-dd');
  if (force || hour >= 21) {                              // 證交所約 21:00 公布
    // 最近 10 天內：沒有這一天、或這一天只有手動填的維持率（上市欄位空白）→ 抓證交所
    for (let d = addDays_(today, -10); d <= today; d = addDays_(d, 1)) {
      const wd = new Date(d + 'T12:00:00+08:00').getUTCDay();
      if (wd === 0 || wd === 6) continue;
      if (by[d] && by[d][3] !== '') continue;
      const tw = fetchTwse_(d); Utilities.sleep(3000);
      if (!tw) { Logger.log(d + ' 證交所沒有資料（休市或尚未公布）'); continue; }
      const row = by[d] || blankRow_(d);
      put_(row, 3, [tw.loan, tw.loanChg, tw.short, tw.shortChg]);
      Object.keys(ETFS).forEach((c, k) => { const e = tw.etf[c]; if (e) put_(row, 11 + k * 4, [e.loan, e.loanChg, e.short, e.shortChg]); });
      by[d] = row;
      Logger.log(d + ' 已新增：上市資增減 ' + tw.loanChg + ' 億');
    }
    // 最近 10 天內上櫃欄位（H～K）空白的日期，抓櫃買補上（櫃買有時比證交所晚公布）
    Object.keys(by).filter(d => d >= addDays_(today, -10) && by[d][3] !== '' && by[d][7] === '').sort().forEach(d => {
      let tp = null; try { tp = fetchTpex_(d); } catch (e) { Logger.log(d + ' 櫃買讀取失敗：' + e); }
      Utilities.sleep(3000);
      if (!tp) { Logger.log(d + ' 櫃買尚未公布，上櫃欄位先空白，之後補'); return; }
      put_(by[d], 7, [tp.loan, tp.loanChg, tp.short, tp.shortChg]);
      Logger.log(d + ' 已補上櫃資料');
    });
    const wg = fetchWantgoo_();
    if (wg) fillRatio_(by, wg);
  }
  writeRows_(sh, by);
}
/** 讀整張表 → {日期: 一列}；同一天有好幾列就合併（每格取第一個不是空白的值） */
function readRows_(sh) {
  const by = {}, n = sh.getLastRow() - 1;
  if (n < 1) return by;
  sh.getRange(2, 1, n, HEAD.length).getValues().forEach(r => {
    const d = ymd_(r[0]); if (!/^\d{4}-\d\d-\d\d$/.test(d)) return;
    r[0] = d;
    if (!by[d]) { by[d] = r; return; }
    by[d].forEach((v, i) => { if (v === '' && r[i] !== '') by[d][i] = r[i]; });
  });
  return by;
}
/** 依日期由新到舊整張寫回（最新的在最上面），日期欄設成純文字 */
function writeRows_(sh, by) {
  const rows = Object.keys(by).sort().reverse().map(d => by[d]);
  const old = sh.getLastRow() - 1;
  if (old > rows.length) sh.getRange(rows.length + 2, 1, old - rows.length, sh.getLastColumn()).clearContent();
  if (!rows.length) return;
  sh.getRange(2, 1, rows.length, 1).setNumberFormat('@');
  sh.getRange(2, 1, rows.length, HEAD.length).setValues(rows);
}
function blankRow_(d) { const r = HEAD.map(() => ''); r[0] = d; return r; }
function put_(row, at, vals) { vals.forEach((v, i) => row[at + i] = v); }


/* ---------- 資料來源 ---------- */
function getJson_(url, headers) {
  const r = UrlFetchApp.fetch(url, { headers: Object.assign({ 'User-Agent': UA }, headers || {}), muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('HTTP ' + r.getResponseCode());
  return JSON.parse(r.getContentText('UTF-8'));
}
const num_ = s => { const t = String(s == null ? '' : s).replace(/[,\s]/g, ''); return t === '' || t === '-' ? null : +t; };
const r2_ = v => Math.round(v * 100) / 100;

function fetchTwse_(d) {
  const j = getJson_('https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date=' + d.replace(/-/g, '') + '&selectType=ALL&response=json');
  if (j.stat !== 'OK' || !j.tables || !j.tables[0] || !j.tables[0].data) return null;
  const sum = {}; j.tables[0].data.forEach(r => sum[r[0]] = r);
  const amt = sum['融資金額(仟元)'], sh = sum['融券(交易單位)'];
  const out = { loan: r2_(num_(amt[5]) / 1e5), loanChg: r2_((num_(amt[5]) - num_(amt[4])) / 1e5),
                short: num_(sh[5]), shortChg: num_(sh[5]) - num_(sh[4]), etf: {} };
  ((j.tables[1] || {}).data || []).forEach(r => {
    const c = String(r[0]).trim();
    if (ETFS[c]) out.etf[c] = { loan: num_(r[6]), loanChg: num_(r[6]) - num_(r[5]), short: num_(r[12]), shortChg: num_(r[12]) - num_(r[11]) };
  });
  return out;
}
function fetchTpex_(d) {
  const j = getJson_('https://www.tpex.org.tw/www/zh-tw/margin/balance?date=' + d.replace(/-/g, '%2F') + '&id=&response=json');
  const t = (j.tables || [])[0]; if (!t || !t.summary) return null;
  const amt = t.summary.find(r => String(r[1]).indexOf('融資金') === 0), cnt = t.summary.find(r => String(r[1]).indexOf('合計') === 0);
  if (!amt || !cnt || num_(amt[6]) == null) return null;
  return { loan: r2_(num_(amt[6]) / 1e5), loanChg: r2_((num_(amt[6]) - num_(amt[2])) / 1e5),
           short: num_(cnt[14]), shortChg: num_(cnt[14]) - num_(cnt[10]) };
}
/** 玩股網：大盤融資維持率（上市扣除 ETF）。被擋就回傳 null */
function fetchWantgoo_() {
  try {
    const a = getJson_('https://www.wantgoo.com/stock/-ETFA/margin-trading/historical-lending-balance',
      { 'Referer': 'https://www.wantgoo.com/stock/margin-trading/exclude-etf/taiex', 'X-Requested-With': 'XMLHttpRequest' });
    return a.map(x => [Utilities.formatDate(new Date(+x.date), 'Asia/Taipei', 'yyyy-MM-dd'), r2_(x.marginRatio * 100), r2_(x.lendingBalance / 1e5)])
            .sort((p, q) => p[0] < q[0] ? -1 : 1);
  } catch (e) { Logger.log('玩股網讀取失敗：' + e); return null; }
}
/** 把玩股網的維持率填進 B、C 欄（只填空白格，不覆蓋手動填的數字） */
function fillRatio_(by, wg) {
  wg.forEach(w => { const r = by[w[0]]; if (!r) return;
    if (r[1] === '') r[1] = w[1];
    if (r[2] === '') r[2] = w[2]; });
}

/* ---------- 歷史資料（網站 repo 的 data/margin.json，2014 年起） ---------- */
function importHistory_(sh) {
  const M = getJson_(HISTORY_URL);
  const ratio = {}; (M.ratio || []).forEach(r => ratio[r[0]] = r);
  const pick = (o, keys) => keys.map(k => o && o[k] != null ? o[k] : '');
  const K = ['loan', 'loanChg', 'short', 'shortChg'];
  const rows = (M.credit || []).map(c => {
    const r = ratio[c.d];
    let row = [c.d, r ? r[1] : '', r ? r[2] : ''].concat(pick(c.twse, K), pick(c.tpex, K));
    Object.keys(ETFS).forEach(e => row = row.concat(pick((c.etf || {})[e], K)));
    return row;
  });
  if (rows.length) sh.getRange(2, 1, rows.length, HEAD.length).setValues(rows);
  Logger.log('已匯入歷史 ' + rows.length + ' 天（' + rows[0][0] + ' ～ ' + rows[rows.length - 1][0] + '）');
}

/* ---------- 工具 ---------- */
function getSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) { sh = ss.insertSheet(SHEET, 0); }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('@');            // 日期存成文字，避免時區換算
  }
  return sh;
}
function ymd_(v) { return v instanceof Date ? Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM-dd') : String(v).trim(); }
function addDays_(d, n) { const t = new Date(d + 'T12:00:00+08:00'); t.setUTCDate(t.getUTCDate() + n); return Utilities.formatDate(t, 'Asia/Taipei', 'yyyy-MM-dd'); }
