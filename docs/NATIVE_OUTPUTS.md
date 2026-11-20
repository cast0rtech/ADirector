# Documentación Técnica: Salida NDI y Cámara Virtual en ADirector

Este documento describe la arquitectura de bajo nivel implementada para extraer la señal del lienzo `<canvas>` (1080p@60fps) y el bus de audio maestro para publicarlos como **NDI** y **Cámara Virtual**.

---

## 1. Salida NDI (Network Device Interface)

NDI permite transmitir video y audio de latencia ultrabaja (< 1 frame en LAN) sobre redes Gigabit estándar.

### Formatos y Conversión de Fotogramas
El NDI SDK espera fotogramas sin compresión temporal en formatos de color **UYVY 4:2:2** o **RGBA 32-bit**, y audio PCM continuo:

1. **Fotogramas de Video:**
   - **Formato:** `UYVY422` (FourCC: `UYVY`) o `RGBA32` (FourCC: `RGBA`).
   - **Resolución:** 1920x1080 progresivo a 60 fps.
   - **Tasa de transferencia:** En UYVY cada píxel ocupa 16 bits (\(1920 \times 1080 \times 2 = 4.14\text{ MB}\) por cuadro, aprox. 250 MB/s en memoria o comprimido con NDI SpeedHQ a ~120 Mbps en LAN).
2. **Audio PCM:**
   - Muestras estéreo (2 canales) a **48,000 Hz**, codificadas en PCM entero con signo de 16 bits (`pcm_s16le`) o Float32.
3. **Mecanismo de Publicación:**
   - Se publica bajo el identificador de red: `ADIRECTOR (Program)`.
   - El protocolo anuncia la fuente mediante **mDNS / Bonjour** en el puerto UDP 5353 y negocia puertos TCP/UDP para streaming unificado detectable automáticamente por OBS Studio, vMix, Wirecast y consolas NewTek.

---

## 2. Cámara Virtual Multiplataforma

Permite que aplicaciones de videoconferencia (Zoom, Microsoft Teams, Google Meet, Discord) reciban la realización en vivo como si fuera una cámara web física.

### A. Linux (`v4l2loopback`)
- Utiliza el módulo de kernel `v4l2loopback` para crear un nodo de dispositivo de video en `/dev/video10`.
- El proceso principal de Node.js ejecuta FFmpeg enviando el flujo a `/dev/video10` en formato `yuv420p`.
- El parámetro `exclusive_caps=1` es fundamental para que navegadores como Google Chrome y clientes como Zoom lo reconozcan como dispositivo de captura legítimo y no como un emisor.

### B. macOS (CoreMediaIO DAL Plugin)
- En macOS, los navegadores y aplicaciones no pueden abrir dispositivos `/dev` directamente.
- Emplea el plugin de capa de abstracción de dispositivos de CoreMediaIO (`/Library/CoreMediaIO/Plug-Ins/DAL/obs-mac-virtualcam.plugin`).
- El pipeline envía los fotogramas raw al pipe de entrada que el driver expone como dispositivo AVFoundation.

### C. Windows (DirectShow Virtual Camera)
- Utiliza un filtro DirectShow registrado en el registro de Windows como `ADirector Virtual Camera`.

---

## 3. Aislamiento y Fallback Automático en ChromeOS (Crostini)

Los Chromebooks que ejecutan Linux a través de **Crostini** corren dentro de un contenedor LXC gestionado por la máquina virtual *crosvm*.

### Restricciones de ChromeOS:
1. **Restricción de Módulos de Kernel:**
   En Crostini no se permite ejecutar `sudo modprobe v4l2loopback`. El kernel compartido de ChromeOS no tiene habilitado el módulo loopback para contenedores invitados.
2. **Restricción de Red (mDNS Multicast):**
   El puente virtual `cros0` aísla los paquetes multicast UDP, por lo que el descubrimiento NDI puede fallar si no se configuran reglas NAT avanzadas.

### Solución Implementada (`systemCaps.ts`):
- La función `isChromeOSCrostini()` detecta automáticamente la presencia de `/dev/.cros_milestone` y el hostname `penguin`.
- Si se detecta ChromeOS:
  - Los botones de **NDI** y **Cámara Virtual** se deshabilitan visualmente en la interfaz con un badge: `⚡ CHROMEOS CROSTINI MODE`.
  - Las salidas de **Grabación Local (.mp4 con aceleración)** y **Emisión RTMP (YouTube, Twitch, Nginx)** permanecen **100% operativas**.
