# ==============================================================================
# ADirector: Instalador de Dependencias Nativas para Windows (PowerShell)
# ==============================================================================

Write-Host "----------------------------------------------------------------" -ForegroundColor Cyan
Write-Host " Configurando dependencias nativas para ADirector en Windows" -ForegroundColor Cyan
Write-Host "----------------------------------------------------------------" -ForegroundColor Cyan

# 1. Comprobar e instalar FFmpeg vía winget o choco
if (!(Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Host "[1/3] Instalando FFmpeg mediante winget..." -ForegroundColor Yellow
    winget install Gyan.FFmpeg --accept-package-agreements --accept-source-agreements
} else {
    Write-Host "[1/3] FFmpeg ya instalado en el sistema." -ForegroundColor Green
}

# 2. Descargar e instalar NDI 5/6 Runtime
Write-Host "[2/3] Comprobando NDI Runtime..." -ForegroundColor Yellow
$ndiPath = "$env:ProgramFiles\NDI\NDI 6 Runtime\v6\Processing.NDI.Lib.x64.dll"
if (!(Test-Path $ndiPath)) {
    Write-Host "Descargando e instalando NDI Core Runtime..." -ForegroundColor Yellow
    $installerUrl = "https://downloads.ndi.tv/SDK/NDI_SDK_v6/NDI_6_Runtime.exe"
    $output = "$env:TEMP\NDI_Runtime.exe"
    Invoke-WebRequest -Uri $installerUrl -OutFile $output
    Start-Process -FilePath $output -ArgumentList "/SILENT" -Wait
    Remove-Item $output
} else {
    Write-Host "NDI Runtime detectado correctamente." -ForegroundColor Green
}

# 3. Registrar filtro DirectShow para Cámara Virtual
Write-Host "[3/3] Para usar Cámara Virtual en Windows, se recomienda instalar OBS Studio o AkVirtualCamera." -ForegroundColor Yellow
if (!(Get-Command obs64 -ErrorAction SilentlyContinue)) {
    Write-Host "Instalando OBS Studio con soporte de Virtual Cam..." -ForegroundColor Cyan
    winget install OBSProject.OBSStudio --accept-package-agreements --accept-source-agreements
}

Write-Host "[✓] Instalación completada para Windows." -ForegroundColor Green
