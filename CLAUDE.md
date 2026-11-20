# mtx-notes：給 Claude Code 的專案說明

台股加權指數與小台指（MTX）的每週交易復盤網站，純靜態、部署在 GitHub Pages（`main` 分支根目錄）。使用者以繁體中文溝通，網站文字一律繁體中文。網站架構與檔案說明見 `README.md`；這份檔案記錄**討論後定下來的規則與做法**，接手時請先讀完。

## 環境

- Windows。**沒有 Python、沒有 Node**；用 PowerShell 5.1（本機）與 Git Bash。GitHub CLI 在 `C:\Program Files\GitHub CLI\gh.exe`，以 `ohyehya` 登入（repo 擁有者是 `maojiyw`，ohyehya 是協作者）。
- 本機預覽：沒有 Python 的 http.server，用 PowerShell 的 HttpListener 寫小型靜態伺服器（port 8765）。
- Chrome 在 `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`，可用 `--headless=new --screenshot` 截圖（加 `--user-data-dir` 指到暫存資料夾）。
- PowerShell 腳本含中文時，**必須存成有 BOM 的 UTF-8**，否則 PowerShell 5.1 會用 Big5 解析而出現語法錯誤。

## 通用規則（使用者明確要求）

- **日期計算一律用日曆天**（兩個日期相減）：持有天數、費時、主題頁「之後 7／30 天」、每日籌碼 1M～3Y 區間、籌碼小圖近 90 天。
  - 例外：訊號回測的**冷卻期 10 個交易日**、BP紅燈熄燈 10 個交易日（規格與驗收數字依此計算；是否改日曆天尚未定案）。
- **顏色紅漲綠跌**（正值紅、負值綠），橘色＝尚未發生／警示。
- **「紅燈」與「BP紅燈（歷史前 2%）」是同一個定義**：外資 BP 金額 ≥ 當天以前所有資料的前 2%（逐日判斷，2012 起）。11/6 時門檻 3,646,286，即筆記的「約 3.64 億」。名詞表中「紅燈」是「BP紅燈」的別名。未來可能有其他紅燈，定義不清楚時要先問使用者。
- **全站圖表**（Lightweight Charts 4.1.3）：滑鼠滾輪放大縮小、按住拖曳左右移動；手機兩指縮放、左右滑動，上下滑仍捲動頁面。設定在 `assets/app.js` 的 `baseChart`。多張圖共用時間軸用 `syncCharts`（只由使用者正在操作的圖帶動其他圖）。
- 圖表建立當下常量不到寬度，`setVisibleRange` 會失效（只顯示最後幾個月）；量到寬度後要再套用一次區間（`ResizeObserver`）。
- 修改 `assets/` 下的檔案後，所有 HTML 的 `?v=` 版本號要一起更新（目前格式 `YYYYMMDD` 加英文字母）。
- 使用者要求才 commit／開 PR；PR 用 `gh pr create --repo maojiyw/mtx-notes`。commit 結尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`，PR 說明結尾加 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。

## 新增一週復盤（使用者常見要求：「我新增了一個 PDF，幫我建立 html」）

1. 讀 `notes-pdf/` 裡新的 PDF（標題以內頁為準，檔名可能不同）。
2. 在 `assets/data.js` 的 `reviews` 依日期放到正確位置（陣列新到舊），欄位照既有格式：`tldr`、`parts`（`{k:1,t:'…'}` 為重點，可附 `tables`）、`market`（當週每日 facts／notes）、`sources`（新聞來源）。
3. 當日開高低與成交值查新聞；`daily` 若缺該週收盤，用證交所 `FMTQIK` 月資料補（`https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?date=YYYYMM01&response=json`）。
4. 視需要補 `campaign.timeline`／`events`、`tables`、`glossary`。
5. 複製一個 `reviews/*.html` 改檔名、`data-id`、title、og。更新所有 `?v=`、README 篇數。
6. 本機預覽檢查，再依使用者要求 commit／PR。

## 訊號回測頁（signals.html）

- 依使用者先前的交接規格（`E:\ohyehcode\PROMPT.md`）製作，資料改為**每日籌碼 Google 試算表**（`assets/sheet.js` 的 `MTXSheet.load()`），由 `assets/backtest.js` 在瀏覽器即時計算。
- 驗算：`signals.html?end=2026-11-17` 與規格第 7 節驗收數字、原儀表板 2,558 格完全一致。主控台 `window.__bt` 是完整結果。
- 新增訊號：在 `backtest.js` 的 `SIGNALS` 加一筆 `{id, name, label, detect}`。
- 尚未製作：規格第 6 節「槓桿模擬」（缺 `leverage_sim.py`）。

## 信用交易（每日籌碼頁；分支 feature-margin，尚未合併）

- 資料檔 `data/margin.json`，由 `scripts/update-margin.ps1` 產生；GitHub Actions（`.github/workflows/update-margin.yml`）每個交易日台北 21:30（UTC 13:30）執行並 commit 到 `main`。資料沒變不會 commit；漏掉的日期下次自動補。
- **大盤融資維持率（上市扣除 ETF）**：使用者選擇直接抓玩股網數字（公開資料算不出相同值；公開算法約是玩股網的 1/0.87）。來源 `https://www.wantgoo.com/stock/-ETFA/margin-trading/historical-lending-balance`（需 Referer 與 X-Requested-With 標頭），`marginRatio`×100＝維持率、`lendingBalance`÷1e5＝融資餘額（億）；只有 2024/11 起。GitHub 主機在國外，可能被擋，擋住時保留舊值。
- **每日信用交易統計**（格式參考 PTT 股票版每日的「信用交易統計」）：
  - 上市：證交所 `MI_MARGN?date=YYYYMMDD&selectType=ALL` 第一張表；資增減（億）＝融資金額(仟元) 今日－前日 ÷1e5，券增減（張）＝融券(交易單位) 今日－前日。
  - 上櫃：櫃買 `https://www.tpex.org.tw/www/zh-tw/margin/balance?date=YYYY%2FMM%2FDD&id=&response=json` 的 summary「融資金(仟元)」與「合計(張)」。
  - ETF（00685L、00631L，在腳本 `$ETFS` 設定）：MI_MARGN 個股列的融資、融券今日餘額－前日餘額（張）；頁面計算連增／連減天數、近 5／20 日合計、最長連增／連減。
  - 玩股網「扣除 ETF」＝證交所 `selectType=STOCK`（融券 11/19 為 122,448 張，已核對）。
- 證交所有頻率限制，請求間隔 3 秒。歷史回補從 2014 年起（約 3,100 個交易日、5～6 小時），**只在原本那台電腦執行**；回補完成後由那台 commit 並開 PR。回補期間其他電腦不要執行 `update-margin.ps1` 或修改 `data/margin.json`。

## 尚待使用者決定

- 冷卻期與 BP 熄燈是否改為日曆天（會改變驗收數字）。
- 是否製作槓桿模擬分頁。
