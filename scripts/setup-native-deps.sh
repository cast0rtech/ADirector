#!/usr/bin/env bash
# ==============================================================================
# ADirector: Instalador de Dependencias Nativas (Linux & macOS)
# Configura soporte para FFmpeg, NDI SDK y Cámara Virtual (v4l2loopback / OBS DAL)
# ==============================================================================

set -e

OS="$(uname -s)"
echo "----------------------------------------------------------------"
echo " Instalando dependencias nativas para ADirector en: $OS"
echo "----------------------------------------------------------------"

if [ "$OS" = "Darwin" ]; then
    echo "[macOS] Comprobando Homebrew..."
    if ! command -v brew &>/dev/null; then
        echo "Error: Homebrew no está instalado. Instálalo desde https://brew.sh"
        exit 1
    fi

    echo "[macOS] Instalando FFmpeg..."
    brew install ffmpeg

    echo "[macOS] Instalando NDI Video SDK / Runtime..."
    brew install --cask ndi-core-suite || echo "NDI Core Suite ya presente o descargable desde https://ndi.video/tools/"

    echo "[macOS] Comprobando plugin de Cámara Virtual CoreMediaIO..."
    if [ ! -d "/Library/CoreMediaIO/Plug-Ins/DAL/obs-mac-virtualcam.plugin" ]; then
        echo "Aviso: Para habilitar la cámara virtual en macOS, instala OBS Studio o el plugin OBS VirtualCam."
        brew install --cask obs || true
    fi

    echo "[✓] Configuración para macOS completada."

elif [ "$OS" = "Linux" ]; then
    # Detectar si estamos dentro del contenedor Crostini de ChromeOS
    if [ -f "/dev/.cros_milestone" ] || grep -q -i "chromeos" /etc/os-release 2>/dev/null; then
        echo "================================================================"
        echo " [!] DETECTADO ENTORNO CHROMEOS (CROSTINI LINUX CONTAINER)"
        echo "================================================================"
        echo " Aviso: En ChromeOS los contenedores tienen acceso restringido a"
        echo " módulos de kernel (modprobe prohibido). Las funciones de NDI"
        echo " y Cámara Virtual (v4l2loopback) estarán desactivadas."
        echo " La grabación local MP4 y la emisión RTMP funcionarán al 100%."
        echo "================================================================"
        sudo apt-get update && sudo apt-get install -y ffmpeg
        exit 0
    fi

    echo "[Linux] Instalando FFmpeg y utilidades V4L2..."
    if command -v apt-get &>/dev/null; then
        sudo apt-get update
        sudo apt-get install -y ffmpeg v4l2loopback-dkms v4l2loopback-utils linux-headers-$(uname -r)
    elif command -v pacman &>/dev/null; then
        sudo pacman -S --needed ffmpeg v4l2loopback-dkms linux-headers
    elif command -v dnf &>/dev/null; then
        sudo dnf install -y ffmpeg v4l2loopback kernel-devel
    fi

    echo "[Linux] Configurando módulo de kernel v4l2loopback para Cámara Virtual..."
    # Cargar módulo con dispositivo /dev/video10 exclusivo para apps de videollamada
    sudo modprobe -r v4l2loopback || true
    sudo modprobe v4l2loopback devices=1 video_nr=10 card_label="ADirector Virtual Cam" exclusive_caps=1

    echo "[Linux] Asegurando persistencia en reinicios (/etc/modules-load.d/)..."
    echo "v4l2loopback" | sudo tee /etc/modules-load.d/v4l2loopback.conf > /dev/null
    echo 'options v4l2loopback devices=1 video_nr=10 card_label="ADirector Virtual Cam" exclusive_caps=1' | sudo tee /etc/modprobe.d/v4l2loopback.conf > /dev/null

    echo "[✓] Configuración para Linux completada. Dispositivo virtual disponible en /dev/video10"
fi
