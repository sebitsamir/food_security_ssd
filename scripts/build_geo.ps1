<#
.SYNOPSIS
  Builds the website's boundary files from an official admin-2 (county) dataset. Windows version of build_geo.sh.

.EXAMPLE
  .\scripts\build_geo.ps1 -Path C:\data\ssd_admin2.shp `
    -GeoSource 'OCHA COD-AB South Sudan, <release>' `
    -Attribution 'Boundaries: OCHA via HDX' -License '<licence from the dataset page>'

.NOTES
  The provenance parameters are required on purpose: someone must read the dataset's licence page.
  Field names differ between releases. Inspect yours first:   npx mapshaper C:\data\ssd_admin2.shp -info
  Needs Node.js (for npx) and a finished  .\dev.ps1 setup.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Path,
  [Parameter(Mandatory)][string]$GeoSource,
  [Parameter(Mandatory)][string]$Attribution,
  [Parameter(Mandatory)][string]$License,
  [string]$Pcode2 = 'ADM2_PCODE',
  [string]$Name2  = 'ADM2_EN',
  [string]$Pcode1 = 'ADM1_PCODE',
  [string]$Name1  = 'ADM1_EN',
  [string]$Simplify = '8%'   # raise for smaller files, lower for more detail
)

$ErrorActionPreference = 'Stop'
$Root    = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'backend'
$Out     = Join-Path $Backend 'data\geo'
$VenvPy  = Join-Path $Backend '.venv\Scripts\python.exe'

if (-not (Test-Path $Path))   { throw "Source not found: $Path" }
if (-not (Test-Path $VenvPy)) { throw 'Run  .\dev.ps1 setup  first.' }
New-Item -ItemType Directory -Force -Path $Out | Out-Null

function Mapshaper([string[]]$CmdArgs) {
  & npx --yes mapshaper@0.6 @CmdArgs
  if ($LASTEXITCODE -ne 0) { throw "mapshaper failed (exit $LASTEXITCODE)" }
}

# Counties. Mapshaper simplifies with shared-border topology, so neighbours never gain gaps or overlaps.
Mapshaper @($Path, '-proj', 'wgs84', '-simplify', $Simplify, 'keep-shapes',
  '-rename-fields', "pcode=$Pcode2,name=$Name2,parent=$Pcode1",
  '-filter-fields', 'pcode,name,parent',
  '-o', (Join-Path $Out 'counties.geojson'), 'format=geojson', 'precision=0.001', 'force')

# States: dissolve counties by their parent.
Mapshaper @($Path, '-proj', 'wgs84', '-simplify', $Simplify, 'keep-shapes',
  '-dissolve', $Pcode1, "copy-fields=$Name1",
  '-rename-fields', "pcode=$Pcode1,name=$Name1",
  '-filter-fields', 'pcode,name',
  '-o', (Join-Path $Out 'states.geojson'), 'format=geojson', 'precision=0.001', 'force')

# meta.json as UTF-8 WITHOUT a BOM (Windows PowerShell 5.1's Out-File would add one).
$meta = [ordered]@{
  synthetic   = $false
  source      = $GeoSource
  attribution = $Attribution
  license     = $License
  built_at    = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
} | ConvertTo-Json
[System.IO.File]::WriteAllText((Join-Path $Out 'meta.json'), $meta, (New-Object System.Text.UTF8Encoding($false)))

Write-Host 'Validating with the same rules the API applies at startup...'
Push-Location $Backend
try {
  & $VenvPy -m scripts.validate_geo
  if ($LASTEXITCODE -ne 0) { throw 'Validation failed. Do not deploy these files.' }
} finally { Pop-Location }
