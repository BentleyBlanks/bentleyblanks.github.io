# 旁白与台词配音：用 Windows 自带的 OneCore 中文语音合成 WAV。
#
# 为什么走 WinRT 而不是 System.Speech：SAPI 这台机器上只装了 Huihui 一个中文
# 声音，全角色会是同一个人；WinRT 的 OneCore 声库有 Kangkang(男)/Huihui(女)/
# Yaoyao(女) 三个，配上 SSML 的音高语速，才分得出旁白、爹、妹妹。
#
# 用法：powershell -File Script_VoiceBake.ps1 -Manifest <json> -OutDir <wav目录>
param(
  [Parameter(Mandatory = $true)][string]$Manifest,
  [Parameter(Mandatory = $true)][string]$OutDir
)
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media, ContentType = WindowsRuntime] | Out-Null

# PowerShell 5.1 不认 await，靠反射拿到 IAsyncOperation<T>.AsTask 再同步等
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]
function Await($op, $type) {
  $task = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  if (-not $task.Wait(60000)) { throw "语音合成超时" }
  return $task.Result
}

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$voices = @{}
foreach ($v in [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices) {
  foreach ($name in @("Kangkang", "Huihui", "Yaoyao")) {
    if ($v.DisplayName -like "*$name*") { $voices[$name] = $v }
  }
}
if ($voices.Count -eq 0) { throw "没找到任何中文 OneCore 语音" }

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$data = Get-Content -Raw -Encoding UTF8 $Manifest | ConvertFrom-Json

# 角色 → OneCore 声线与音高语速。清单里的 voice 是角色名（Narrator/Father/…），
# 这里折成三个中文声库的具体参数；清单行上若带 pitch/rate 以行为准
$profiles = @{
  "Narrator"    = @{ v = "Kangkang"; pitch = "-2st"; rate = "0.92" }
  "Father"      = @{ v = "Kangkang"; pitch = "-3st"; rate = "0.90" }
  "GaoChuanbao" = @{ v = "Kangkang"; pitch = "-1st"; rate = "1.00" }
  "Elder"       = @{ v = "Kangkang"; pitch = "-4st"; rate = "0.85" }
  "Militia"     = @{ v = "Kangkang"; pitch = "+1st"; rate = "1.05" }
  "Enemy"       = @{ v = "Kangkang"; pitch = "-2st"; rate = "0.88" }
  "Traitor"     = @{ v = "Kangkang"; pitch = "+2st"; rate = "1.06" }
  "Mother"      = @{ v = "Huihui";  pitch = "-1st"; rate = "0.95" }
  "Sister"      = @{ v = "Yaoyao";  pitch = "+4st"; rate = "1.04" }
  "Zhuzi"       = @{ v = "Yaoyao";  pitch = "-2st"; rate = "1.00" }
}

$done = 0; $skipped = 0
foreach ($line in $data.lines) {
  $path = Join-Path $OutDir "$($line.id).wav"
  if (Test-Path $path) { $skipped += 1; continue }

  $prof = $profiles[[string]$line.voice]
  if ($null -eq $prof) { $prof = $profiles["Narrator"] }
  $voice = $voices[$prof.v]
  if ($null -eq $voice) { $voice = $voices["Kangkang"] }
  $synth.Voice = $voice
  $pitch = if ($line.pitch) { $line.pitch } else { $prof.pitch }
  $rate = if ($line.rate) { $line.rate } else { $prof.rate }

  # SSML 里的文本要转义，剧本里有引号和 & 的话会把标记打断
  $safe = [System.Security.SecurityElement]::Escape($line.text)
  # 句末补一段静音：过场是按行切的，收尾太急听着像被剪断
  $ssml = @"
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
<prosody pitch="$pitch" rate="$rate">$safe</prosody><break time="320ms"/>
</speak>
"@

  try {
    $stream = Await $synth.SynthesizeSsmlToStreamAsync($ssml) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  } catch {
    # 某一行的 SSML 让声库噎住：报出来接着走，别把整批一起带崩
    Write-Host "  ✗ 合成失败 $($line.id) [$($line.voice)] $($line.text)"
    continue
  }
  $src = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream.GetInputStreamAt(0))
  $dst = [System.IO.File]::Create($path)
  try { $src.CopyTo($dst) } finally { $dst.Dispose(); $src.Dispose(); $stream.Dispose() }
  $done += 1
  if ($done % 20 -eq 0) { Write-Host "  已合成 $done 条" }
}
$synth.Dispose()
Write-Host "配音完成：新合成 $done 条，已存在跳过 $skipped 条 → $OutDir"
