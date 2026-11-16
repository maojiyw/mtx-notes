# MTX 復盤筆記

台股加權指數與小台指（MTX）的**每週交易復盤**，整理成網站，供群組內分享交流。

- 主頁（Summary）：最新盤勢、所有復盤列表、加權指數走勢、部位與訊號時間軸、籌碼總覽
- 每週復盤頁：依每週 PDF 筆記整理重點、籌碼圖，並附上當週市場資訊與新聞來源
- 專有名詞懸浮說明：BP、強烈落底、驚驚漲、V 轉等名詞，滑鼠移上去（手機點一下）即顯示簡短解釋

> 本站為個人交易復盤，**不構成投資建議**。籌碼數字由截圖判讀，個別數值可能有誤差。

網站網址（啟用 GitHub Pages 後）：<https://maojiyw.github.io/mtx-notes/>

## 目錄結構

```
.
├── index.html          # 主頁（Summary）
├── reviews/            # 每週復盤頁，檔名＝復盤日期 YYYYMMDD
│   ├── 20261113.html
│   ├── 20261106.html
│   └── 20261030.html
├── assets/
│   ├── data.js         # 全站資料：指數、籌碼、每週復盤內容、統計表、專有名詞
│   ├── app.js          # 頁面渲染（主頁與復盤頁共用）
│   └── style.css       # 樣式（深色主題、紅漲綠跌、RWD）
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
3. 視需要更新 `daily`（每日收盤）、`chips`（籌碼表）、`campaign`（時間軸與圖表標記）、`tables`（統計表）。
4. 複製 `reviews/` 底下任一 HTML，改成新的檔名，並修改：
   - `<body data-id="YYYYMMDD">`
   - `<title>`、`og:title`、`og:description`（分享連結時的預覽文字）

主頁列表、上一週／下一週導覽會自動更新。

## 專有名詞

名詞清單在 `assets/data.js` 的 `glossary`，格式為：

```js
['名詞|別名', '說明']
```

頁面載入時會自動標記內文中的名詞；同一區塊只標第一次出現。新增或修改說明直接編輯此清單即可。

## 部署

推送到 `main` 後，於 GitHub repo 的 **Settings → Pages** 將來源設為 `main` 分支根目錄（`/ (root)`）即可。
