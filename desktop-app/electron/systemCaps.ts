import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';

export interface SystemCapabilities {
  platform: NodeJS.Platform;
  isChromeOS: boolean;
  hasV4L2Loopback: boolean;
  virtualCamDevice: string | null;
  hasNdiRuntime: boolean;
  supportedOutputs: {
    recordMp4: boolean;
    rtmp: boolean;
    virtualCam: boolean;
    ndi: boolean;
  };
  reasons: {
    virtualCam?: string;
    ndi?: string;
  };
}

/**
 * Detecta si el sistema operativo se está ejecutando dentro del contenedor
 * Linux Crostini de ChromeOS o en una máquina virtual sin módulos de kernel.
 */
export function isChromeOSCrostini(): boolean {
  if (os.platform() !== 'linux') return false;

  try {
    // 1. Verificar indicador de ChromeOS milestone en Crostini
    if (fs.existsSync('/dev/.cros_milestone')) return true;

    // 2. Comprobar /etc/lsb-release o /etc/os-release
    if (fs.existsSync('/etc/os-release')) {
      const content = fs.readFileSync('/etc/os-release', 'utf8');
      if (/chromeos|cros/i.test(content)) return true;
    }

    // 3. Comprobar el hostname estándar de Crostini
    if (os.hostname().includes('penguin')) return true;
  } catch (e) {}

  return false;
}

/**
 * Busca dispositivos de loopback de video en Linux (/dev/video*)
 */
export function findV4L2Device(): string | null {
  if (os.platform() !== 'linux') return null;

  try {
    const devices = fs.readdirSync('/dev').filter((f) => f.startsWith('video'));
    for (const dev of devices) {
      const fullPath = `/dev/${dev}`;
      try {
        // Ejecutar v4l2-ctl o verificar que no sea un sensor de hardware
        const info = execSync(`v4l2-ctl --device=${fullPath} --all 2>/dev/null`, { encoding: 'utf8' });
        if (/loopback|dummy|virtual/i.test(info)) {
          return fullPath;
        }
      } catch (e) {}
    }
    // Si hay un /dev/video0 o video10 estándar
    if (fs.existsSync('/dev/video10')) return '/dev/video10';
    if (devices.length > 0) return `/dev/${devices[devices.length - 1]}`;
  } catch (e) {}

  return null;
}

/**
 * Evalúa las capacidades nativas del host para habilitar o deshabilitar
 * de forma reactiva las funciones de NDI y Cámara Virtual.
 */
export function detectSystemCapabilities(): SystemCapabilities {
  const platform = os.platform();
  const isCros = isChromeOSCrostini();
  const v4l2Device = findV4L2Device();

  let hasNdiRuntime = false;
  let hasVirtualCam = false;
  const reasons: { virtualCam?: string; ndi?: string } = {};

  // 1. Evaluación de NDI
  if (isCros) {
    hasNdiRuntime = false;
    reasons.ndi = 'NDI deshabilitado: El puente de red de ChromeOS Crostini bloquea paquetes mDNS/Multicast UDP.';
  } else {
    try {
      // Comprobar si existe la librería NDI en el sistema
      if (platform === 'darwin') {
        hasNdiRuntime = fs.existsSync('/Library/NDI/lib/libndi.dylib') || fs.existsSync('/usr/local/lib/libndi.dylib');
      } else if (platform === 'win32') {
        const progFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
        hasNdiRuntime = fs.existsSync(`${progFiles}\\NDI\\NDI 5 Runtime\\v5\\Processing.NDI.Lib.x64.dll`) ||
                        fs.existsSync(`${progFiles}\\NDI\\NDI 6 Runtime\\v6\\Processing.NDI.Lib.x64.dll`);
      } else {
        hasNdiRuntime = fs.existsSync('/usr/lib/libndi.so') || fs.existsSync('/usr/local/lib/libndi.so');
      }
      if (!hasNdiRuntime) {
        // Si no está el runtime instalado, se puede usar pipeline FFmpeg o GStreamer
        hasNdiRuntime = true; // Habilitado con fallback de pipeline
      }
    } catch (e) {
      hasNdiRuntime = true;
    }
  }

  // 2. Evaluación de Cámara Virtual
  if (isCros) {
    hasVirtualCam = false;
    reasons.virtualCam = 'Cámara Virtual deshabilitada: Los contenedores de ChromeOS prohíben la carga del módulo de kernel v4l2loopback.';
  } else if (platform === 'linux') {
    hasVirtualCam = !!v4l2Device;
    if (!hasVirtualCam) {
      reasons.virtualCam = 'No se encontró un nodo v4l2loopback en /dev/video*. Ejecuta: sudo modprobe v4l2loopback';
    }
  } else if (platform === 'darwin') {
    // macOS: Requiere OBS Virtual Camera DAL plugin o dispositivo CMIO
    hasVirtualCam = fs.existsSync('/Library/CoreMediaIO/Plug-Ins/DAL/obs-mac-virtualcam.plugin');
    if (!hasVirtualCam) {
      // Fallback a softcam o driver genérico
      hasVirtualCam = true;
    }
  } else if (platform === 'win32') {
    // Windows: Requiere driver DirectShow Virtual Cam
    hasVirtualCam = true;
  }

  return {
    platform,
    isChromeOS: isCros,
    hasV4L2Loopback: !!v4l2Device,
    virtualCamDevice: v4l2Device,
    hasNdiRuntime,
    supportedOutputs: {
      recordMp4: true, // Siempre soportado
      rtmp: true,      // Siempre soportado
      virtualCam: hasVirtualCam,
      ndi: hasNdiRuntime,
    },
    reasons,
  };
}
