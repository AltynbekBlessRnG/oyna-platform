# Откат kiosk-setup.ps1: обычный рабочий стол, без автовхода гостя. Запускать от администратора.
$ErrorActionPreference = "Stop"
$winlogon = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
Set-ItemProperty $winlogon -Name Shell -Value "explorer.exe"
Set-ItemProperty $winlogon -Name AutoAdminLogon -Value "0"
Remove-ItemProperty $winlogon -Name DefaultPassword -ErrorAction SilentlyContinue
Remove-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" -Name HideFastUserSwitching -ErrorAction SilentlyContinue

reg load HKU\VenceHive "C:\Users\Default\NTUSER.DAT" | Out-Null
try {
  Remove-Item "Registry::HKEY_USERS\VenceHive\Software\Microsoft\Windows\CurrentVersion\Policies\System" -Recurse -ErrorAction SilentlyContinue
  Remove-Item "Registry::HKEY_USERS\VenceHive\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer" -Recurse -ErrorAction SilentlyContinue
} finally { [gc]::Collect(); reg unload HKU\VenceHive | Out-Null }

Write-Output "Готово. Гостевой пользователь (vence-player или zen-player) остался; удалить: Remove-LocalUser <имя>"
