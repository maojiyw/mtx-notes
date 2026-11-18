# MTX 復盤筆記

台股加權指數與小台指（MTX）的**每週交易復盤**，整理成網站，供群組內分享交流。

- 主頁（Summary）：最新盤勢、所有復盤列表、加權指數走勢、部位與訊號時間軸、籌碼總覽
- 每週復盤頁：依每週 PDF 筆記整理重點、籌碼圖，並附上當週市場資訊與新聞來源
- 每日籌碼頁：直接讀取每日整理的 Google 試算表，顯示最新籌碼、落底訊號、長期走勢與每日明細；可自選日期區間（範圍依試算表資料而定）與明細表要顯示的欄位（記在瀏覽器裡）
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
├── topics.html         # 搜尋與主題索引
├── reviews/            # 每週復盤頁，檔名＝復盤日期 YYYYMMDD
│   ├── 20261113.html   # 最新一篇
│   ├── …
│   └── 20260723.html   # 最早一篇（目前共 12 篇）
├── assets/
│   ├── data.js         # 全站資料：指數、籌碼、每週復盤內容、統計表、專有名詞
│   ├── sheet.js        # 讀取並解析每日籌碼試算表
│   ├── app.js          # 頁面渲染（主頁與復盤頁共用）
│   └── style.css       # 樣式（深色主題、紅漲綠跌、RWD）
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
- 「之後 5 日／20 日」是復盤日收盤到之後第 N 個交易日的加權指數變化（取自 `daily`），只表示當週提到該主題後的大盤走勢。

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
