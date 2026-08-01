param(
  [string]$ApiUrl = "http://localhost:4010/api"
)

$ErrorActionPreference = "Stop"
$phone = "+7 700 000 00 00"
$startAt = (Get-Date).AddDays(2).Date.AddHours(18).ToUniversalTime().ToString("o")

$challenge = Invoke-RestMethod -Method Post -Uri "$ApiUrl/auth/request-code" -ContentType "application/json" -Body (@{ phone = $phone } | ConvertTo-Json)
$session = Invoke-RestMethod -Method Post -Uri "$ApiUrl/auth/verify-code" -ContentType "application/json" -Body (@{ challengeId = $challenge.challengeId; code = "0000"; name = "Pilot User" } | ConvertTo-Json)
$authHeaders = @{ Authorization = "Bearer $($session.accessToken)" }

$availability = Invoke-RestMethod -Method Get -Uri "$ApiUrl/clubs/vertex-arena/availability?zoneId=standard&startAt=$([uri]::EscapeDataString($startAt))&durationHours=2"
$seatId = ($availability.seats | Where-Object { $_.status -eq "available" } | Select-Object -First 1).id

$bookingBody = @{
  clubId = "vertex-arena"
  zoneId = "standard"
  seatIds = @($seatId)
  startAt = $startAt
  durationHours = 2
  playerName = "Client value must be ignored"
} | ConvertTo-Json

$booking = Invoke-RestMethod -Method Post -Uri "$ApiUrl/bookings" -Headers $authHeaders -ContentType "application/json" -Body $bookingBody
if ($booking.status -ne "pending") { throw "Expected pending booking" }

$adminHeaders = @{ "x-club-admin-key" = "pilot-admin" }
$queue = Invoke-RestMethod -Method Get -Uri "$ApiUrl/admin/clubs/vertex-arena/bookings" -Headers $adminHeaders
if (-not ($queue.id -contains $booking.id)) { throw "Booking was not found in club queue" }

$confirmed = Invoke-RestMethod -Method Patch -Uri "$ApiUrl/admin/bookings/$($booking.id)/status" -Headers $adminHeaders -ContentType "application/json" -Body (@{ status = "confirmed" } | ConvertTo-Json)
if ($confirmed.status -ne "confirmed") { throw "Admin confirmation failed" }

$history = Invoke-RestMethod -Method Get -Uri "$ApiUrl/bookings" -Headers $authHeaders
$historyBooking = $history | Where-Object { $_.id -eq $booking.id }
if ($historyBooking.status -ne "confirmed") { throw "Confirmed status did not reach user history" }

[pscustomobject]@{
  user = $session.user.phone
  booking = $booking.id
  seat = $seatId
  initialStatus = $booking.status
  finalStatus = $historyBooking.status
  queueSize = @($queue).Count
} | ConvertTo-Json
