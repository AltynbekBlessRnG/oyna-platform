# Превращает компьютер клуба в «киоск Vence». Запускать от администратора.
#
#   powershell -ExecutionPolicy Bypass -File kiosk-setup.ps1 [-VenceExe "C:\Program Files\Vence\Vence.exe"]
#
# Что делает:
#   - заводит пользователя vence-player (на старых установках остаётся zen-player) без пароля и без прав администратора: под ним сидят гости;
#   - Windows сама входит под ним при включении;
#   - вместо рабочего стола запускается сторож Vence (Vence.exe --guard): ни панели задач, ни «Пуска»;
#   - гостю закрыты диспетчер задач, смена пользователя, блокировка и смена пароля в Ctrl+Alt+Del.
# Откатить: kiosk-remove.ps1. Выйти в Windows на месте: Ctrl+Alt+Shift+F12 и PIN администратора.
param([string]$VenceExe = "C:\Program Files\Vence\Vence.exe")
$ErrorActionPreference = "Stop"

if (-not (Test-Path $VenceExe)) { throw "Не найден $VenceExe" }
# Программа раньше называлась Zen: если гость уже заведён под старым именем, оставляем его.
$player = if (Get-LocalUser -Name "zen-player" -ErrorAction SilentlyContinue) { "zen-player" } else { "vence-player" }
$winlogon = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"

if (-not (Get-LocalUser -Name $player -ErrorAction SilentlyContinue)) {
  New-LocalUser -Name $player -NoPassword -FullName "Гость Vence" -Description "Гости клуба" -AccountNeverExpires | Out-Null
}
Set-LocalUser -Name $player -PasswordNeverExpires $true
# Группа «Пользователи» по SID: её имя зависит от языка Windows.
Add-LocalGroupMember -SID "S-1-5-32-545" -Member $player -ErrorAction SilentlyContinue

Set-ItemProperty $winlogon -Name AutoAdminLogon -Value "1"
Set-ItemProperty $winlogon -Name DefaultUserName -Value $player
Set-ItemProperty $winlogon -Name DefaultDomainName -Value $env:COMPUTERNAME
Set-ItemProperty $winlogon -Name DefaultPassword -Value ""
Set-ItemProperty $winlogon -Name Shell -Value "`"$VenceExe`" --guard"

# Политики гостя живут в его ветке реестра. Профиля ещё может не быть, поэтому пишем
# и в шаблон новых профилей (Default), и в уже созданный профиль гостя, если он есть.
function Set-GuestPolicies([string]$hive) {
  $system = "Registry::$hive\Software\Microsoft\Windows\CurrentVersion\Policies\System"
  $explorer = "Registry::$hive\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer"
  New-Item -Path $system -Force | Out-Null
  New-Item -Path $explorer -Force | Out-Null
  Set-ItemProperty $system -Name DisableTaskMgr -Value 1 -Type DWord
  Set-ItemProperty $system -Name DisableLockWorkstation -Value 1 -Type DWord
  Set-ItemProperty $system -Name DisableChangePassword -Value 1 -Type DWord
  Set-ItemProperty $explorer -Name NoLogoff -Value 1 -Type DWord
  Set-ItemProperty $explorer -Name NoRun -Value 1 -Type DWord
}

function With-Hive([string]$file, [scriptblock]$action) {
  if (-not (Test-Path $file)) { return }
  reg load HKU\VenceHive $file | Out-Null
  try { & $action "HKEY_USERS\VenceHive" } finally { [gc]::Collect(); reg unload HKU\VenceHive | Out-Null }
}

With-Hive "C:\Users\Default\NTUSER.DAT" { param($hive) Set-GuestPolicies $hive }
$profile = Get-CimInstance Win32_UserProfile | Where-Object { $_.LocalPath -like "*\$player" } | Select-Object -First 1
if ($profile -and -not $profile.Loaded) { With-Hive (Join-Path $profile.LocalPath "NTUSER.DAT") { param($hive) Set-GuestPolicies $hive } }

# C:\ProgramData\Vence — только администраторы и SYSTEM: туда пишет обновление от имени SYSTEM,
# и гость не должен иметь возможности подложить там ссылку на системный файл.
# По умолчанию ProgramData даёт «Пользователям» создавать файлы, поэтому наследование отключаем.
$data = Join-Path $env:ProgramData "Vence"
$legacyData = Join-Path $env:ProgramData "Zen"
New-Item -ItemType Directory -Force $data | Out-Null
icacls $data /inheritance:r /grant:r "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-545:(OI)(CI)RX" | Out-Null
# Настройки подключения к клубу пишет сам гость при вводе кода клуба — ему отдельная папка.
$station = Join-Path $data "station"
New-Item -ItemType Directory -Force $station | Out-Null
icacls $station /grant "*S-1-5-32-545:(OI)(CI)M" | Out-Null
# Переустановка поверх Zen: переносим подключение к клубу, чтобы не вводить код заново.
$legacyStation = Join-Path $legacyData "station"
if ((Test-Path $legacyStation) -and -not (Get-ChildItem $station -File -ErrorAction SilentlyContinue)) {
  Copy-Item (Join-Path $legacyStation "*") $station -Force -ErrorAction SilentlyContinue
}
$legacy = Join-Path $data "station.json"
if ((Test-Path $legacy) -and -not (Test-Path (Join-Path $station "station.json"))) { Move-Item $legacy $station }
# Перенесённый файл сохраняет права старой закрытой папки: возвращаем ему права папки station.
Get-ChildItem $station -File | ForEach-Object { icacls $_.FullName /reset | Out-Null }

# Смена пользователя в Ctrl+Alt+Del — для всех.
Set-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" -Name HideFastUserSwitching -Value 1 -Type DWord

Write-Output "Готово. После перезагрузки компьютер войдёт как $player и откроет Vence."
