# LifeLink DOM smoke test (Edge headless)
$ErrorActionPreference = 'Continue'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$root = 'C:\Users\hrupe\OneDrive\Desktop\About_me\LifeLink_App\LifeLink'
$profile = Join-Path $env:TEMP 'lifelink-edge-profile'
$out = Join-Path $env:TEMP 'lifelink-dom'
New-Item -ItemType Directory -Path $out -Force | Out-Null
$base = 'http://127.0.0.1:8777'
$profile = Join-Path $env:TEMP 'lifelink-dom-profile'
if (Test-Path $profile) { Remove-Item $profile -Recurse -Force }

function Dump($url, $name) {
  $file = Join-Path $out "$name.html"
  if (Test-Path $file) { Remove-Item $file -Force }
  & $edge --headless=new --disable-gpu --no-first-run --disable-extensions `
    --user-data-dir="$profile" --virtual-time-budget=7000 --dump-dom "$url" 2>$null |
    Out-File -FilePath $file -Encoding utf8
  if (Test-Path $file) { "{0}: {1} bytes" -f $name, (Get-Item $file).Length }
  else { "${name}: NO OUTPUT" }
}

function Check($name, $mustHave, $mustNotContain) {
  $file = Join-Path $out "$name.html"
  if (-not (Test-Path $file)) { Write-Host "FAIL $name (no file)"; return }
  $content = Get-Content $file -Raw
  $problems = @()
  foreach ($m in $mustHave) {
    if ($content -notlike "*$m*") { $problems += "missing: $m" }
  }
  foreach ($n in $mustNotContain) {
    if ($content -like "*$n*") { $problems += "contains: $n" }
  }
  if ($content -match '<pre id="boot-log"[^>]*>([^<]+)</pre>') {
    $problems += "JS ERROR in boot-log: " + $Matches[1]
  }
  if ($problems.Count -eq 0) { Write-Host "PASS $name" }
  else { Write-Host ("FAIL " + $name + " -> " + ($problems -join ' | ')) }
}

# --- first launch ---
Dump "$base/tools/clearstate.html" 'state-clear'
Dump "$base/" 'welcome'
Check 'welcome' @('Get Started', 'every second matters') @('Need a hospital?')

# --- normal launch with saved location ---
Dump "$base/tools/setstate.html" 'state-set'
Dump "$base/" 'home'
Check 'home' @('Need a hospital?', 'Quick Actions', 'Use My Location', 'Select Location', 'View all hospitals') @()

Dump "$base/#/hospitals" 'hospitals'
Check 'hospitals' @('Search hospital', 'facilities found', 'Nearest', 'Ambulance') @()

Dump "$base/#/hospital/hospital-010" 'hospital'
Check 'hospital' @('Required Documents', 'Emergency', 'Hospital Information', 'Get Route') @()

Dump "$base/#/route/hospital-010" 'route'
Check 'route' @('Start Navigation', 'EST. TIME', 'Call Hospital') @()

Dump "$base/#/map" 'map'
Check 'map' @('id="map"', 'map-canvas', 'map-fallback') @()

Dump "$base/#/map?select=1" 'map-select'
Check 'map-select' @('Tap anywhere to drop a pin', 'Confirm Location') @()

Dump "$base/#/blood" 'blood'
Check 'blood' @('Blood units recorded', 'Demo information') @()

Dump "$base/#/documents" 'documents'
Check 'documents' @('You may need:', 'Document requirements may vary') @()

Dump "$base/#/about" 'about'
Check 'about' @('RK Studios', 'v1.0.0', 'Offline Mode', 'Disclaimer', 'OpenStreetMap') @()

Dump "$base/#/settings" 'settings'
Check 'settings' @('Clear cached data', 'Hospital dataset', 'App version') @()
