# Primer uso de Git en LexControl AI (ejecutar en PowerShell en la raíz del proyecto).
# Uso:  .\scripts\git-setup.ps1
# Requiere Git en PATH (reinicia la terminal tras instalar Git si no lo encuentra).

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "Git no está en el PATH. Cierra y abre PowerShell/VS Code/Cursor y vuelve a intentar." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path .git)) {
  git init
  Write-Host "Repositorio inicializado." -ForegroundColor Green
} else {
  Write-Host "Ya existe .git — omitiendo init." -ForegroundColor Yellow
}

git add -A
$status = git status --porcelain
if (-not $status) {
  Write-Host "No hay cambios para commitear." -ForegroundColor Yellow
  exit 0
}

git commit -m "Initial commit: LexControl AI"
Write-Host ""
Write-Host "Siguiente paso en GitHub:" -ForegroundColor Cyan
Write-Host "  1. Crea un repositorio nuevo (vacío, sin README)."
Write-Host "  2. En esta carpeta ejecuta (sustituye USUARIO y REPO):"
Write-Host "     git remote add origin https://github.com/USUARIO/REPO.git"
Write-Host "     git branch -M main"
Write-Host "     git push -u origin main"
Write-Host ""
Write-Host "Luego en Vercel: Import Project y elige ese repositorio." -ForegroundColor Cyan
