<#
  每日信用交易資料更新（GitHub Actions 每晚 21:30 執行；本機也可手動執行）
  - 大盤融資維持率（上市扣除 ETF）：玩股網
  - 每日信用交易統計：臺灣證券交易所（上市）、證券櫃檯買賣中心（上櫃），以及指定 ETF 的融資融券張數
  輸出 data/margin.json。會自動補齊上次更新之後缺少的交易日。

  用法：
    pwsh scripts/update-margin.ps1                 # 補到今天
    pwsh scripts/update-margin.ps1 -Since 2026-08-20   # 指定回補起點（只補還沒有的日期）
    pwsh scripts/update-margin.ps1 -Dates 2014-12-27,2016-01-30   # 只補指定日期的信用交易統計
#>
param(
  [string]$Since = '',
  [string[]]$Dates = @(),
  [string]$Out = (Join-Path $PSScriptRoot '..' | Join-Path -ChildPath 'data/margin.json'),
  [int]$DelaySeconds = 3
)
$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

# 要追蹤的 ETF（代號 → 名稱）；要加別檔就加在這裡
$ETFS = [ordered]@{ '00685L' = '群益臺灣加權正2'; '00631L' = '元大台灣50正2' }
$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

function Get-Json([string]$url, [hashtable]$headers = @{}) {
  $h = @{ 'User-Agent' = $UA } + $headers
  $r = Invoke-WebRequest -Uri $url -Headers $h -UseBasicParsing -TimeoutSec 60
  $ms = New-Object System.IO.MemoryStream; $r.RawContentStream.CopyTo($ms)
  $text = [Text.Encoding]::UTF8.GetString($ms.ToArray())
  return $text | ConvertFrom-Json
}
function To-Num($s) { $t = ([string]$s) -replace '[,\s]', ''; if ($t -eq '' -or $t -eq '-') { return $null }; return [double]$t }
function Get-TaipeiNow { [DateTime]::UtcNow.AddHours(8) }

# ---------- 讀舊資料 ----------
$data = [ordered]@{ updated = ''; ratio = @(); credit = @(); etfs = $ETFS; log = @() }
if (Test-Path $Out) {
  $old = Get-Content -Raw -Encoding UTF8 $Out | ConvertFrom-Json
  if ($old.ratio) { $data.ratio = @($old.ratio) }
  if ($old.credit) { $data.credit = @($old.credit) }
}
$log = New-Object System.Collections.Generic.List[string]
$have = @{}; foreach ($c in $data.credit) { $have[$c.d] = $true }

# ---------- 1. 玩股網：大盤融資維持率（上市扣除 ETF） ----------
try {
  $wg = Get-Json 'https://www.wantgoo.com/stock/-ETFA/margin-trading/historical-lending-balance' @{ 'Referer' = 'https://www.wantgoo.com/stock/margin-trading/exclude-etf/taiex'; 'X-Requested-With' = 'XMLHttpRequest' }
  # 用 List 逐筆加入，避免 PowerShell 5.1 把巢狀陣列包成 {value, Count} 物件輸出
  $byDate = @{}
  foreach ($x in $wg) {
    $d = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$x.date).UtcDateTime.AddHours(8).ToString('yyyy-MM-dd')
    $byDate[$d] = [object[]]@($d, [math]::Round([double]$x.marginRatio * 100, 2), [math]::Round([double]$x.lendingBalance / 1e5, 2))
  }
  $rows = New-Object System.Collections.Generic.List[object]
  foreach ($k in ($byDate.Keys | Sort-Object)) { $rows.Add($byDate[$k]) }
  if ($rows.Count -gt 0) { $data.ratio = $rows.ToArray(); $log.Add("玩股網維持率 $($rows.Count) 筆，最新 $($rows[$rows.Count-1][0]) $($rows[$rows.Count-1][1])%") }
} catch { $log.Add("玩股網讀取失敗：$($_.Exception.Message)") }

# ---------- 2. 證交所＋櫃買：每日信用交易統計 ----------
function Get-Twse([DateTime]$day) {
  $j = Get-Json ("https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date={0:yyyyMMdd}&selectType=ALL&response=json" -f $day)
  if ($j.stat -ne 'OK' -or -not $j.tables -or -not $j.tables[0].data) { return $null }
  $sum = @{}; foreach ($r in $j.tables[0].data) { $sum[$r[0]] = $r }
  $amt = $sum['融資金額(仟元)']; $sh = $sum['融券(交易單位)']
  $res = [ordered]@{
    loan = [math]::Round((To-Num $amt[5]) / 1e5, 2); loanChg = [math]::Round(((To-Num $amt[5]) - (To-Num $amt[4])) / 1e5, 2)
    short = To-Num $sh[5]; shortChg = (To-Num $sh[5]) - (To-Num $sh[4])
  }
  $etf = [ordered]@{}
  foreach ($r in $j.tables[1].data) {
    $code = ([string]$r[0]).Trim()
    if ($ETFS.Contains($code)) {
      $etf[$code] = [ordered]@{ loan = To-Num $r[6]; loanChg = (To-Num $r[6]) - (To-Num $r[5]); short = To-Num $r[12]; shortChg = (To-Num $r[12]) - (To-Num $r[11]) }
    }
  }
  return @{ twse = $res; etf = $etf }
}
function Get-Tpex([DateTime]$day) {
  $j = Get-Json ("https://www.tpex.org.tw/www/zh-tw/margin/balance?date={0:yyyy}%2F{0:MM}%2F{0:dd}&id=&response=json" -f $day)
  $t = $j.tables | Select-Object -First 1
  if (-not $t -or -not $t.summary) { return $null }
  $amt = $t.summary | Where-Object { $_[1] -like '融資金*' } | Select-Object -First 1
  $cnt = $t.summary | Where-Object { $_[1] -like '合計*' } | Select-Object -First 1
  if (-not $amt -or -not $cnt -or (To-Num $amt[6]) -eq $null) { return $null }
  return [ordered]@{
    loan = [math]::Round((To-Num $amt[6]) / 1e5, 2); loanChg = [math]::Round(((To-Num $amt[6]) - (To-Num $amt[2])) / 1e5, 2)
    short = To-Num $cnt[14]; shortChg = (To-Num $cnt[14]) - (To-Num $cnt[10])
  }
}

$today = (Get-TaipeiNow).Date
if ($Since) { $start = [DateTime]::ParseExact($Since, 'yyyy-MM-dd', $null) }
elseif ($data.credit.Count) { $start = [DateTime]::ParseExact(($data.credit | ForEach-Object { $_.d } | Sort-Object | Select-Object -Last 1), 'yyyy-MM-dd', $null).AddDays(1) }
else { $start = $today.AddMonths(-3) }

# 寫檔：每補 20 天存一次，長時間回補中斷也不會前功盡棄
function Save-MarginData {
  $data.credit = @($credit | Sort-Object d)
  $data.updated = (Get-TaipeiNow).ToString('yyyy-MM-dd HH:mm')
  $data.log = @($log | Select-Object -Last 40)
  $dir = Split-Path $Out; if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
  $json = $data | ConvertTo-Json -Depth 8 -Compress
  [IO.File]::WriteAllText((Resolve-Path $dir).Path + '/' + (Split-Path $Out -Leaf), $json, (New-Object Text.UTF8Encoding($false)))
}
$credit = New-Object System.Collections.Generic.List[object]
foreach ($c in $data.credit) { $credit.Add($c) }
$added = 0
if ($Dates.Count) { $days = @($Dates | ForEach-Object { $_ -split ',' } | Where-Object { $_.Trim() } | ForEach-Object { [DateTime]::ParseExact($_.Trim(), 'yyyy-MM-dd', $null) }) }
else { $days = @(); for ($d = $start; $d -le $today; $d = $d.AddDays(1)) { $days += $d } }
foreach ($day in $days) {
  # 週日一律休市；週六在 2018 年以前可能是補班交易日（例如 2014-12-27），照樣查，沒資料會記在 log 並跳過
  if ($day.DayOfWeek -eq 'Sunday' -or ($day.DayOfWeek -eq 'Saturday' -and $day.Year -ge 2019)) { continue }
  $ds = $day.ToString('yyyy-MM-dd')
  if ($have[$ds]) { continue }
  try {
    $tw = Get-Twse $day; Start-Sleep -Seconds $DelaySeconds
    if (-not $tw) { $log.Add("$ds 證交所沒有資料（休市或尚未公布）"); continue }
    $tp = $null
    try { $tp = Get-Tpex $day } catch { $log.Add("$ds 櫃買讀取失敗：$($_.Exception.Message)") }
    Start-Sleep -Seconds $DelaySeconds
    $credit.Add([pscustomobject]([ordered]@{ d = $ds; twse = $tw.twse; tpex = $tp; etf = $tw.etf }))
    $have[$ds] = $true; $added++
    if ($added % 20 -eq 0) { Save-MarginData }
    Write-Host "$ds 上市資 $($tw.twse.loanChg) 億、券 $($tw.twse.shortChg) 張"
  } catch { $log.Add("$ds 讀取失敗：$($_.Exception.Message)"); Start-Sleep -Seconds ($DelaySeconds * 3) }
}
$data.credit = @($credit | Sort-Object d)
$log.Add("信用交易新增 $added 天，共 $($data.credit.Count) 天")

# ---------- 輸出 ----------
# 資料沒有變動（休市日、尚未公布）就不改寫檔案，避免產生沒有意義的 commit
$sig = { param($o) "$((@($o.ratio) | Select-Object -Last 1) -join ',')|$(@($o.ratio).Count)|$(@($o.credit).Count)" }
if ((Test-Path $Out) -and $old -and ((& $sig $old) -eq (& $sig $data))) {
  $log | ForEach-Object { Write-Host $_ }; Write-Host '沒有新資料，不更新檔案'; return
}
Save-MarginData
$log | ForEach-Object { Write-Host $_ }
if (-not $data.credit.Count -and -not $data.ratio.Count) { throw '所有資料來源都讀取失敗' }
