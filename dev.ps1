<#
.SYNOPSIS
  Windows task runner for this project (the equivalent of the Makefile).

.DESCRIPTION
  Run from the project root in PowerShell:

    .\dev.ps1 setup           install everything (Python venv, packages, Node packages, .env)
    .\dev.ps1 db              create the database, load boundaries, train + seed the SYNTHETIC dev model
    .\dev.ps1 dev             start the API and the website, each in its own window
    .\dev.ps1 api             start only the API       (http://localhost:8000/docs)
    .\dev.ps1 web             start only the website   (http://localhost:3000)
    .\dev.ps1 test            run all tests
    .\dev.ps1 lint            lint and type-check everything
    .\dev.ps1 e2e             browser walkthrough (the API and a built website must be running)

  Production on Windows (no Docker): PostgreSQL and a real model are required.
    .\dev.ps1 prod-env  configure production environment variables manually.
    .\dev.ps1 prod-bootstrap  migrate DB + load geographies (no synthetic seed)
    .\dev.ps1 prod-api        run API without reload (ENV from backend\.env)
    .\dev.ps1 prod-web        production Next.js build + start
    .\dev.ps1 prod            API + website in two windows (after model is activated)

  If PowerShell refuses to run scripts, allow it for this window only:
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet(
    'setup', 'db', 'api', 'web', 'dev', 'test', 'lint', 'e2e',
    'prod-env', 'prod-bootstrap', 'prod-api', 'prod-web', 'prod', 'help'
  )]
  [string]$Task = 'help'
)

$ErrorActionPreference = 'Stop'
$Root     = $PSScriptRoot
$Backend  = Join-Path $Root 'backend'
$Frontend = Join-Path $Root 'frontend'
$VenvPy   = Join-Path $Backend '.venv\Scripts\python.exe'

function Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }

# Runs a command in a folder and stops with a clear message if it fails.
function Run([string]$Dir, [string]$Exe, [string[]]$CmdArgs) {
  Push-Location $Dir
  try {
    & $Exe @CmdArgs
    if ($LASTEXITCODE -ne 0) { throw "Command failed (exit $LASTEXITCODE): $Exe $($CmdArgs -join ' ')" }
  } finally { Pop-Location }
}

function Require-Venv {
  if (-not (Test-Path $VenvPy)) { throw "The backend virtual environment is missing. Run:  .\dev.ps1 setup" }
}

# Finds a Python 3.11+ (prefers whatever `python` is on PATH, then the py launcher).
function Find-Python {
  # Prefer `python` first so a locally installed version (e.g. 3.14) is used as-is.
  # Probe with cmd so a missing py -3.12 tag does not trip $ErrorActionPreference Stop.
  $candidates = @(@('python'), @('py', '-3.12'), @('py', '-3.11'), @('py', '-3'))
  foreach ($c in $candidates) {
    $exe = $c[0]
    $pre = if ($c.Count -gt 1) { $c[1..($c.Count - 1)] } else { @() }
    if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) { continue }
    $probe = if ($pre.Count) { "$exe $($pre -join ' ')" } else { $exe }
    $version = cmd /c "$probe -c `"import sys; print('%d.%d' % sys.version_info[:2])`" 2>nul"
    if ($LASTEXITCODE -eq 0 -and $version -and ([version]$version -ge [version]'3.11')) {
      if ([version]$version -ge [version]'3.13') {
        Write-Warning "Python $version found. The pinned packages were tested on 3.12; if 'pip install' fails, install Python 3.12."
      }
      return , (@($exe) + $pre)
    }
  }
  throw "Python 3.11 or newer was not found. Install Python 3.12 from https://www.python.org/downloads/ and tick 'Add python.exe to PATH'."
}

function Require-Node {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js was not found. Install Node 22 LTS from https://nodejs.org/" }
  $major = [int]((& node -p "process.versions.node.split('.')[0]"))
  if ($major -lt 20) { throw "Node $major is too old. Install Node 20 or newer (22 LTS recommended)." }
}

switch ($Task) {
  'setup' {
    Step 'Checking tools'
    $py = Find-Python
    Require-Node

    Step 'Creating the Python virtual environment (backend\.venv)'
    if (-not (Test-Path $VenvPy)) {
      $pre = if ($py.Count -gt 1) { $py[1..($py.Count - 1)] } else { @() }
      Run $Backend $py[0] ($pre + @('-m', 'venv', '.venv'))
    }

    Step 'Installing Python packages (a few minutes the first time)'
    Run $Backend $VenvPy @('-m', 'pip', 'install', '--upgrade', 'pip')
    Run $Backend $VenvPy @('-m', 'pip', 'install', '-r', 'requirements-dev.txt')

    Step 'Creating backend\.env (uses a local SQLite file, no database server needed)'
    $envFile = Join-Path $Backend '.env'
    if (-not (Test-Path $envFile)) { Copy-Item (Join-Path $Backend '.env.example') $envFile; Write-Host 'created backend\.env' }
    else { Write-Host 'backend\.env already exists, left unchanged' }

    Step 'Installing website packages (a few minutes the first time)'
    Run $Frontend 'npm' @('ci')

    Write-Host "`nDone. Next:  .\dev.ps1 db   then   .\dev.ps1 dev" -ForegroundColor Green
  }

  'db' {
    Require-Venv
    Step 'Creating the database tables'
    Run $Backend $VenvPy @('-m', 'alembic', 'upgrade', 'head')
    Step 'Loading boundaries'
    Run $Backend $VenvPy @('-m', 'scripts.load_geographies')
    Step 'Training the SYNTHETIC dev model and seeding sample data'
    Run $Backend $VenvPy @('-m', 'scripts.seed_dev')
    Write-Host "`nDone. Start everything with:  .\dev.ps1 dev" -ForegroundColor Green
  }

  'api' {
    Require-Venv
    Run $Backend $VenvPy @('-m', 'uvicorn', 'app.main:create_app', '--factory', '--reload', '--port', '8000')
  }

  'web' {
    Require-Node
    Run $Frontend 'npm' @('run', 'dev')
  }

  'dev' {
    Require-Venv
    Require-Node
    Step 'Starting the API and the website in two new windows'
    $shell = if (Get-Command pwsh -ErrorAction SilentlyContinue) { 'pwsh' } else { 'powershell' }
    Start-Process $shell -ArgumentList '-NoExit', '-Command', "`$host.UI.RawUI.WindowTitle='API'; Set-Location '$Backend'; & '$VenvPy' -m uvicorn app.main:create_app --factory --reload --port 8000"
    Start-Process $shell -ArgumentList '-NoExit', '-Command', "`$host.UI.RawUI.WindowTitle='Website'; Set-Location '$Frontend'; npm run dev"
    Write-Host 'API:     http://localhost:8000/docs'
    Write-Host 'Website: http://localhost:3000   (the first page load compiles, give it a few seconds)'
    Write-Host 'Close the two windows to stop.'
  }

  'test' {
    Require-Venv
    Step 'Backend tests'
    Run $Backend $VenvPy @('-m', 'pytest', '-q')
    Step 'Website tests'
    Run $Frontend 'npm' @('test')
  }

  'lint' {
    Require-Venv
    Step 'Backend: ruff, format check, mypy'
    Run $Backend $VenvPy @('-m', 'ruff', 'check', '.')
    Run $Backend $VenvPy @('-m', 'ruff', 'format', '--check', '.')
    Run $Backend $VenvPy @('-m', 'mypy', 'app', 'scripts')
    Step 'Website: eslint and TypeScript'
    Run $Frontend 'npm' @('run', 'lint')
    Run $Frontend 'npm' @('run', 'typecheck')
  }

  'e2e' {
    Require-Venv
    Step 'Installing the test browser (first run only)'
    Run $Backend $VenvPy @('-m', 'pip', 'install', 'playwright')
    Run $Backend $VenvPy @('-m', 'playwright', 'install', 'chromium')
    Step 'Running the browser walkthrough (needs the API and `npm run build; npm start` running)'
    Run $Root $VenvPy @((Join-Path $Root 'scripts\e2e_smoke.py'))
  }

  'prod-env' {
     = Join-Path $Backend '.env'
    if (-not (Test-Path $envFile)) {
      @('# Production configuration - fill in real values before starting the API.', 'ENV=production', 'DATABASE_URL=', 'CORS_ORIGINS=') | Set-Content -Path $envFile -Encoding utf8
      Write-Host 'Created backend\.env placeholder. Configure DATABASE_URL and CORS_ORIGINS before starting the API.' -ForegroundColor Green
    } else {
      Write-Host 'backend\.env already exists. Check ENV, DATABASE_URL, and CORS_ORIGINS manually.' -ForegroundColor Yellow
    }
    Write-Host 'Create frontend\.env.local manually if needed; configure the API URL for your environment.' -ForegroundColor Cyan
  }

  'prod-bootstrap' {
    Require-Venv
    Step 'Production bootstrap: migrate + load geographies (no synthetic seed)'
    Run $Backend $VenvPy @('-m', 'scripts.bootstrap_production')
    Write-Host @"

Next (from backend\, with your real model already in models\<version>\):
  .\.venv\Scripts\python.exe -m scripts.activate_model <version>
  .\.venv\Scripts\python.exe -m scripts.import_observations path\to\observations.csv
  .\.venv\Scripts\python.exe -m scripts.score_forecasts YYYY-MM
  ..\dev.ps1 prod

"@ -ForegroundColor Cyan
  }

  'prod-api' {
    Require-Venv
    Step 'Starting API (no reload; uses backend\.env)'
    Run $Backend $VenvPy @('-m', 'uvicorn', 'app.main:create_app', '--factory', '--host', '0.0.0.0', '--port', '8000', '--proxy-headers')
  }

  'prod-web' {
    Require-Node
    Step 'Building the website for production'
    Run $Frontend 'npm' @('run', 'build')
    Step 'Starting the website (http://localhost:3000)'
    Run $Frontend 'npm' @('run', 'start')
  }

  'prod' {
    Require-Venv
    Require-Node
    Step 'Building the website'
    Run $Frontend 'npm' @('run', 'build')
    Step 'Starting API and website in two new windows'
    $shell = if (Get-Command pwsh -ErrorAction SilentlyContinue) { 'pwsh' } else { 'powershell' }
    Start-Process $shell -ArgumentList '-NoExit', '-Command', "`$host.UI.RawUI.WindowTitle='API (prod)'; Set-Location '$Backend'; & '$VenvPy' -m uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000 --proxy-headers"
    Start-Process $shell -ArgumentList '-NoExit', '-Command', "`$host.UI.RawUI.WindowTitle='Website (prod)'; Set-Location '$Frontend'; npm run start"
    Write-Host 'API:     http://localhost:8000/readyz'
    Write-Host 'Website: http://localhost:3000'
    Write-Host 'Close the two windows to stop.'
  }

  default {
    Get-Help $PSCommandPath -Detailed
  }
}
