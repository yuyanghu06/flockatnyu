param([string]$Role, [string]$Description, [string]$Body, [string]$Milestone = 'M1')
# Append a project pass using the required New York timestamp convention.
$passTime = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTimeOffset]::UtcNow, 'Eastern Standard Time')
$passName = $passTime.ToString('yyyy-MM-dd_HH-mm-ss-ffffff') + '-' + $Role + '-' + $Description + '.md'
$passPath = Join-Path $PSScriptRoot "../milestones/history/$passName"
Set-Content -LiteralPath $passPath -Value "# $Description`n`n- Local timestamp / acting role / milestone: $($passTime.ToString('o')) / $Role / $Milestone.`n$Body"
Add-Content -LiteralPath (Join-Path $PSScriptRoot '../milestones/milestone.md') -Value "`nLatest pass: [$Description](history/$passName)."
Write-Output $passName
