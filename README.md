# MTX 復盤筆記

台股加權指數與小台指（MTX）的**每週交易復盤**，整理成網站，供群組內分享交流。

- 主頁（Summary）：最新盤勢、信用交易（大盤融資維持率、每日信用交易統計）、所有復盤列表、加權指數走勢、部位與訊號時間軸、籌碼總覽
- 每週復盤頁：依每週 PDF 筆記整理重點、籌碼圖，並附上當週市場資訊與新聞來源
- 每日籌碼頁：直接讀取每日整理的 Google 試算表，顯示最新籌碼、落底訊號、長期走勢與每日明細；可自選日期區間（範圍依試算表資料而定）與明細表要顯示的欄位（記在瀏覽器裡）
- 訊號回測頁：用同一份每日籌碼試算表，在瀏覽器裡即時計算強烈落底、BP紅燈（歷史前 2%）的歷史回測，對照所有交易日的無條件基準
- 搜尋與主題頁：全文搜尋所有復盤，或依主題（強烈落底、BP 過熱、驚驚漲…）查看每次提到的週次與之後指數走勢
- 導覽列即時大盤指數：盤中每 15 秒更新（需部署 Cloudflare Worker，見下方說明）
- 專有名詞懸浮說明：BP、強烈落底、驚驚漲、V 轉等名詞，滑鼠移上去（手機點一下）即顯示簡短解釋

> 本站為個人交易復盤，**不構成投資建議**。籌碼圖優先讀取每日籌碼試算表；讀取失敗時改用筆記截圖判讀的數字，個別數值可能有誤差。

網站網址（啟用 GitHub Pages 後）：<https://maojiyw.github.io/mtx-notes/>

## 目錄結構

```
.
├── index.html          # 主頁（Summary）
├── chips.html          # 每日籌碼（讀 Google 試算表）
├── signals.html        # 訊號回測（讀 Google 試算表，即時計算）
├── topics.html         # 搜尋與主題索引
├── reviews/            # 每週復盤頁，檔名＝復盤日期 YYYYMMDD
│   ├── 20261113.html   # 最新一篇
│   ├── …
│   └── 20260605.html   # 最早一篇（目前共 14 篇）
├── assets/
│   ├── data.js         # 全站資料：指數、籌碼、每週復盤內容、統計表、專有名詞
│   ├── sheet.js        # 讀取並解析每日籌碼試算表
│   ├── backtest.js     # 訊號回測計算引擎（沿用 backtest.py 的邏輯）
│   ├── app.js          # 頁面渲染（主頁與復盤頁共用）
│   └── style.css       # 樣式（深色主題、紅漲綠跌、RWD）
├── data/
│   └── margin.json     # 信用交易資料（GitHub Actions 每晚 21:30 自動更新）
├── scripts/
│   └── update-margin.ps1  # 抓取信用交易資料的程式（PowerShell）
├── .github/workflows/
│   └── update-margin.yml  # 每晚 21:30 的自動更新排程
├── worker/
│   └── taiex.js        # Cloudflare Worker：轉發證交所即時大盤指數
└── notes-pdf/          # 每週復盤原始 PDF
```

純靜態網站，不需要建置流程。圖表使用 [Lightweight Charts](https://github.com/tradingview/lightweight-charts) 4.1.3（CDN 載入）。

## 本機預覽

```bash
python -m http.server 8765
```

瀏覽器開啟 <http://localhost:8765/>。

## 新增一週復盤

1. 把該週 PDF 放進 `notes-pdf/`。
2. 在 `assets/data.js` 的 `reviews` 陣列**最前面**新增一筆，欄位可參考既有資料：
   - `id`、`date`、`week`（該週起訖日）、`pdf`（PDF 檔名）
   - `title`、`close` / `chg` / `pct` / `o` / `h` / `l` / `vol`、`position`、`pills`、`summary`
   - `tldr`：本週重點
   - `parts`：內文段落；`items` 中寫成 `{k:1, t:'…'}` 會標為重點
   - `market`：當週每日市場資訊（`facts` 數據、`notes` 說明）
   - `sources`：新聞來源 `[標題, 網址]`
3. 視需要更新 `daily`（每日收盤）、`campaign`（時間軸與圖表標記）、`tables`（統計表）。
4. 複製 `reviews/` 底下任一 HTML，改成新的檔名，並修改：
   - `<body data-id="YYYYMMDD">`
   - `<title>`、`og:title`、`og:description`（分享連結時的預覽文字）

主頁列表、上一週／下一週導覽會自動更新。

## 每日籌碼試算表

`assets/sheet.js` 在網頁開啟時讀取 Google 試算表（同一個檔案每天更新即可，網頁重新整理就會看到最新資料）：

- **工作表1**：大盤、外資期貨未平倉、散戶多空、落底訊號
- **Sheet1**：外資選擇權 BC／SC／BP／SP 金額

注意事項：

- 試算表的共用設定必須維持「知道連結的任何人都能檢視」，否則網頁讀不到。
- 程式以第一列的**欄名**對應資料：新增欄位沒關係，欄位改名或刪除會讀不到該項（每日籌碼頁底部會列出找不到的欄位）。
- 若之後換成新的試算表檔案，修改 `assets/sheet.js` 裡的 `ID`。
- 讀取失敗時，主頁與復盤頁的籌碼圖會改用 `data.js` 裡 `chips` 的備用數字。

## 專有名詞

名詞清單在 `assets/data.js` 的 `glossary`，格式為：

```js
['名詞|別名', '說明']
```

頁面載入時會自動標記內文中的名詞；同一區塊只標第一次出現。新增或修改說明直接編輯此清單即可。

## 搜尋與主題索引

`topics.html` 在瀏覽器端搜尋 `data.js` 裡所有復盤的標題、摘要、重點、內文、統計表與當週市場資訊，不需要額外建索引；新增一週復盤後自動納入。

- 不分大小寫、忽略空白；查詢字與 `glossary` 的名詞相符時，同義詞會一起搜尋（例如紫爆／紫燈）。
- 網址可直接分享：`topics.html?q=強烈落底`。
- 從結果點進復盤頁時，命中處會標示出來，底部工具列可上下跳轉。
- 主題索引的清單在 `data.js` 的 `topics`：`['分類', ['名詞', …]]`，名詞須是 `glossary` 中的第一個名稱，說明文字取自 `glossary`。
- 「之後 7 天／30 天」是復盤日收盤到 N 個日曆天後（當天或之前最後一個交易日）的加權指數變化（取自 `daily`），只表示當週提到該主題後的大盤走勢。

## 訊號回測

`signals.html` 開啟時讀取每日籌碼試算表（和每日籌碼頁同一份），由 `assets/backtest.js` 在瀏覽器裡重算所有表格，試算表更新後重新整理即可，不需要另外建置。

- 用到的欄位：工作表1 的 `日期`、`加權指數`、`強烈落底`（值為 O）；Sheet1 的 `外資BP金額`。欄位改名會讀不到。
- 天數一律是日曆天（持有 7／14／30／60／90 天、費時、到達天數）；冷卻期是 10 個交易日。
- **新增訊號**：在 `backtest.js` 的 `SIGNALS` 加一筆 `{id, name, label, detect}`，`detect` 回傳訊號日的索引即可，頁面會自動多一個分頁。
- **驗算**：網址加 `?end=YYYY-MM-DD` 只用該日以前的資料計算，例如 `signals.html?end=2026-11-17` 應與交接規格的驗收數字一致。主控台的 `window.__bt` 是完整結果。
- 資料有日期重複、沒排序，或 2019 年後出現週末日期時，頁首會列出提醒。

整站的日期計算一律用日曆天：主題頁的「之後 N 天」、每日籌碼的 1M／3M／6M／1Y／3Y 區間、主頁與復盤頁的籌碼小圖（近 90 天）都是日曆天。

## 信用交易（主頁）

主頁「信用交易」區塊讀取 `data/margin.json`，由 GitHub Actions 每個交易日晚上 21:30（台北時間）執行 `scripts/update-margin.ps1` 自動更新並 commit 到 `main`。

- **大盤融資維持率**：玩股網「上市・扣除 ETF 資券進出」的維持率與融資餘額（維持率由玩股網計算，公開資料無法重現同一數字）。
- **每日信用交易統計**（格式參考 PTT 股票版每日的信用交易統計）：
  - 上市：證交所「融資融券餘額」全部的融資金額（資增減，億）與融券張數（券增減，張）
  - 上櫃：櫃買中心「上櫃股票融資融券餘額」的融資金（億）與融券合計（張）
  - ETF：00685L、00631L 的融資、融券今日餘額減前日餘額（張），並計算連續增減天數、近 5／20 日合計、最長連增／連減
- 每次執行會自動補齊上次更新後缺少的交易日；資料沒有變動（休市、尚未公布）時不會 commit。
- 要追蹤其他 ETF：在 `update-margin.ps1` 的 `$ETFS` 加上代號與名稱，下次更新起開始累積（舊日期可用 `-Since` 回補）。
- 手動更新：GitHub repo 的 **Actions → 每日信用交易更新 → Run workflow**；或在本機執行 `powershell -File scripts/update-margin.ps1`。
- 排程本身已要求寫入權限（`permissions: contents: write`）；若 Actions 的 commit 被拒絕，請 repo 擁有者到 **Settings → Actions → General** 確認 Actions 有啟用、Workflow permissions 沒有被限制為唯讀。
- GitHub 的排程可能延遲幾分鐘到幾十分鐘；若某天沒更新，隔天執行時會一併補上。

## 即時大盤指數

導覽列會顯示加權指數。證交所的即時報價不開放跨網域讀取，網頁無法直接抓，所以要透過一支 Cloudflare Worker 轉一手：

- **還沒設定 Worker**：顯示證交所最新一天的**收盤**（盤後才更新），標示「收盤 MM/DD」。
- **設定 Worker 後**：盤中（週一至週五 08:45–13:35）每 15 秒更新，標示「盤中 HH:MM」；其他時間每 5 分鐘檢查一次。切到別的分頁時會暫停。

部署 Worker（一次性，免費方案即可）：

1. 登入 [Cloudflare](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Create Worker**，名稱例如 `taiex`，按 **Deploy**。
2. 進入該 Worker → **Edit code**，把 `worker/taiex.js` 的內容整個貼上取代原本的程式，按 **Deploy**。
3. 複製 Worker 網址（例如 `https://taiex.<你的帳號>.workers.dev`），瀏覽器打開應該會看到一段 JSON（`price` 為最新指數）。
4. 把網址填入 `assets/app.js` 的 `LIVE_URL`，更新 `?v=` 版本號後推送。

`worker/taiex.js` 只允許 `https://maojiyw.github.io` 與本機 `localhost` 讀取；網站換網址時記得修改 `ALLOW`。

## 部署

推送到 `main` 後，於 GitHub repo 的 **Settings → Pages** 將來源設為 `main` 分支根目錄（`/ (root)`）即可。

修改 `assets/` 底下的檔案後，請把各頁面引用的 `?v=` 版本號一起改掉，避免瀏覽器使用快取的舊檔。
