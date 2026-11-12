# Keep installed icon resources versioned and shortcut references absolute.
# Windows PowerShell 5.1 reads BOM-less scripts as ANSI: keep this file ASCII.

function ResolveShortcutIcon {
  param([Parameter(Mandatory = $true)][string]$IconPath)

  $source = (Resolve-Path -LiteralPath $IconPath).Path
  $sourceBytes = [IO.File]::ReadAllBytes($source)
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $hash = [BitConverter]::ToString($sha.ComputeHash($sourceBytes)).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose() }
  $directory = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'BlanksTools\Icons'
  [void](New-Item -ItemType Directory -Force -Path $directory)
  $name = [IO.Path]::GetFileNameWithoutExtension($source)
  $installed = Join-Path $directory ($name + '_' + $hash.Substring(0, 16) + '.ico')
  [IO.File]::WriteAllBytes($installed, $sourceBytes)
  return $installed
}

function RemoveEnvironmentIconBlock {
  param([Parameter(Mandatory = $true)][string]$LinkPath)

  $bytes = [IO.File]::ReadAllBytes($LinkPath)
  if ($bytes.Length -lt 76 -or [BitConverter]::ToUInt32($bytes, 0) -ne 76) {
    throw 'Invalid Shell Link header'
  }
  $flags = [BitConverter]::ToUInt32($bytes, 20)
  $offset = 76
  if ($flags -band 1) { $offset += 2 + [BitConverter]::ToUInt16($bytes, $offset) }
  if ($flags -band 2) { $offset += [BitConverter]::ToUInt32($bytes, $offset) }
  $characterWidth = 1
  if ($flags -band 128) { $characterWidth = 2 }
  foreach ($bit in 2..6) {
    if ($flags -band (1 -shl $bit)) {
      $offset += 2 + [BitConverter]::ToUInt16($bytes, $offset) * $characterWidth
    }
  }
  if ($offset -gt $bytes.Length - 4) { throw 'Invalid Shell Link string data' }

  # SLDF_HAS_EXP_ICON and IconEnvironmentDataBlock can override the absolute
  # IconLocation with an unresolved %USERPROFILE% path in Explorer.
  [BitConverter]::GetBytes([uint32]($flags -band 0xffffbfff)).CopyTo($bytes, 20)
  $output = New-Object IO.MemoryStream
  try {
    $output.Write($bytes, 0, $offset)
    while ($offset -lt $bytes.Length) {
      $size = [BitConverter]::ToUInt32($bytes, $offset)
      if ($size -eq 0) {
        $output.Write($bytes, $offset, $bytes.Length - $offset)
        break
      }
      if ($size -lt 8 -or $offset + $size -gt $bytes.Length) { throw 'Invalid Shell Link extra data' }
      $signature = [BitConverter]::ToUInt32($bytes, $offset + 4)
      if ($signature -ne 0xa0000007) { $output.Write($bytes, $offset, $size) }
      $offset += $size
    }
    [IO.File]::WriteAllBytes($LinkPath, $output.ToArray())
  } finally { $output.Dispose() }
}

function SaveShortcutIcon {
  param(
    [Parameter(Mandatory = $true)]$Shortcut,
    [Parameter(Mandatory = $true)][string]$LinkPath,
    [Parameter(Mandatory = $true)][string]$IconPath
  )

  $installed = ResolveShortcutIcon -IconPath $IconPath
  $staging = Join-Path ([IO.Path]::GetTempPath()) ('BlanksShortcut-' + [Guid]::NewGuid().ToString('N'))
  [void](New-Item -ItemType Directory -Path $staging)
  $prepared = Join-Path $staging 'Prepared.lnk'
  try {
    if (Test-Path -LiteralPath $LinkPath) { Copy-Item -LiteralPath $LinkPath -Destination $prepared }
    $shell = New-Object -ComObject WScript.Shell
    $saved = $shell.CreateShortcut($prepared)
    foreach ($field in @('TargetPath', 'Arguments', 'WorkingDirectory', 'Description', 'WindowStyle', 'Hotkey')) {
      $saved.$field = $Shortcut.$field
    }
    $saved.IconLocation = "$installed,0"
    $saved.Save()
    RemoveEnvironmentIconBlock -LinkPath $prepared
    # Explorer first sees the completed link, with its absolute icon reference.
    Move-Item -LiteralPath $prepared -Destination $LinkPath -Force
  } finally {
    if (Test-Path -LiteralPath $prepared) { Remove-Item -LiteralPath $prepared }
    Remove-Item -LiteralPath $staging
  }
}
