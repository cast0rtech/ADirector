# 📖 Manual de Usuario y Guía de Operación: ADirector Studio

Bienvenido a **ADirector Studio**, el sistema profesional de realización y conmutación de video multicámara en tiempo real sobre red local (LAN). Con ADirector puedes transformar teléfonos móviles (iOS y Android) en cámaras inalámbricas de producción con latencia ultrabaja, mezclando audio y video sin necesidad de servicios en la nube ni hardware de captura dedicado.

---

## 📑 Tabla de Contenidos

1. [Requisitos del Sistema y Preparación](#1-requisitos-del-sistema-y-preparación)
2. [Instalación y Puesta en Marcha](#2-instalación-y-puesta-en-marcha)
3. [Conexión de Teléfonos Móviles](#3-conexión-de-teléfonos-móviles)
   - [Aceptación del Certificado SSL (iOS Safari)](#paso-a-paso-en-ios-safari)
   - [Aceptación del Certificado SSL (Android Chrome)](#paso-a-paso-en-android-chrome)
4. [Operación de la Interfaz Móvil (PWA)](#4-operación-de-la-interfaz-móvil-pwa)
5. [Consola de Realización de Escritorio](#5-consola-de-realización-de-escritorio)
   - [Multivista y Tally](#multivista-y-tally-en-vivo)
   - [Conmutación sin Cortes (Program)](#conmutación-sin-cortes-program-cut)
   - [Control Remoto de Sensores](#control-remoto-desde-el-pc)
   - [Mezclador de Audio Independiente](#mezclador-de-audio-independiente-web-audio-api)
6. [Salidas Profesionales](#6-salidas-profesionales)
   - [Grabación Local MP4](#a-grabación-local-en-disco-mp4)
   - [Retransmisión RTMP (YouTube / Twitch)](#b-retransmisión-rtmp-en-vivo)
   - [Salida NDI en Red Local](#c-salida-ndi-en-red-local-lan)
   - [Cámara Virtual (Zoom / Meet / Teams)](#d-cámara-virtual)
7. [Detección de Entorno ChromeOS](#7-modo-chromeos-crostini)
8. [Resolución de Problemas (FAQ)](#8-resolución-de-problemas-faq)

---

## 1. Requisitos del Sistema y Preparación

### Infraestructura de Red
- **Red Wi-Fi Local (LAN):** Se recomienda encarecidamente utilizar un router Wi-Fi en la banda de **5 GHz** o **Wi-Fi 6**. El PC de realización preferiblemente debe estar conectado por cable Ethernet al router.
- Tanto el PC como los teléfonos móviles deben pertenecer al mismo segmento de red local (ej. `192.168.1.X`).

### Dispositivos Compatibles
- **Móviles Emisores:**
  - **Apple iOS:** iPhone o iPad con iOS 14.3+ utilizando **Safari**.
  - **Android:** Cualquier smartphone con Android 8.0+ utilizando **Google Chrome**.
- **Consola de Escritorio (Host):**
  - **macOS:** macOS 11 Big Sur o superior (Intel y Apple Silicon M1/M2/M3/M4).
  - **Windows:** Windows 10 u 11 (64-bit).
  - **Linux:** Ubuntu 20.04+, Debian 11+, Arch Linux, Fedora 36+.
  - **ChromeOS:** Chromebooks con contenedor Linux Crostini activado.

---

## 2. Instalación y Puesta en Marcha

### Paso 1: Instalar dependencias del proyecto
Abre una terminal en la carpeta del proyecto y ejecuta:
```bash
npm install
```

### Paso 2: Configurar dependencias nativas (FFmpeg, V4L2, NDI)
- En **Linux y macOS**:
  ```bash
  chmod +x scripts/setup-native-deps.sh
  ./scripts/setup-native-deps.sh
  ```
- En **Windows** (PowerShell como Administrador):
  ```powershell
  Set-ExecutionPolicy RemoteSigned -Scope Process
  .\scripts\setup-windows.ps1
  ```

### Paso 3: Iniciar el servidor local
```bash
npm run dev:server
```
Al iniciar, la consola mostrará la dirección IP asignada y el **código QR** para vincular las cámaras.

---

## 3. Conexión de Teléfonos Móviles (Web o Código QR)

Puedes conectar cualquier teléfono móvil al sistema mediante dos métodos sencillos:

### Método A: Escanear el Código QR
1. En la consola de escritorio, pulsa el botón **`📱 Vincular Móviles (Web / QR)`** en la barra superior.
2. Abre la app nativa de **Cámara** en tu iPhone o Android y enfoca el código QR en pantalla.
3. Toca la notificación emergente para abrir el enlace en tu navegador móvil.

### Método B: Ingresar la Dirección Web Directa
1. Si prefieres no usar la cámara para escanear, copia la dirección web que se muestra en la cabecera de la app (ejemplo: `https://192.168.1.3:8443/cam`) pulsando **`📋 Copiar`**.
2. Abre **Safari** en iOS o **Google Chrome** en Android y pega la URL en la barra de direcciones.

> [!IMPORTANT]
> **Permiso del Certificado SSL Autofirmado:**
> Los navegadores móviles bloquean el acceso al sensor óptico (`getUserMedia`) en direcciones IP que no usen HTTPS. Al tratarse de un certificado autofirmado local generado en tu propio ordenador:

### Paso a paso en iOS (Safari):
1. Al abrir la URL, Safari mostrará: *"Esta conexión no es privada"*.
2. Pulsa en **«Mostrar detalles»** (en la parte inferior).
3. Pulsa en el enlace **«Visitar este sitio web»**.
4. Confirma pulsando **«Visitar sitio web»** en el diálogo emergente.
5. Concede permiso a Safari para usar la **Cámara** y el **Micrófono**.

### Paso a paso en Android (Chrome):
1. Chrome mostrará la advertencia: *"La conexión no es privada"*.
2. Pulsa en el botón **«Configuración avanzada»**.
3. Pulsa en el enlace inferior: **«Acceder a 192.168.X.X (no seguro)»**.
4. Pulsa en **«Permitir»** cuando el navegador solicite acceso a la cámara y micrófono.

---

## 4. Operación de la Interfaz Móvil (PWA)

Una vez cargada la aplicación web en el teléfono, la interfaz HUD táctil ofrece control total:

```text
┌────────────────────────────────────────────────────────┐
│  [● Listo] [1280x720 @ 30fps]          [🔋] [⚙️ Ajustes]│
│                                                        │
│                                                        │
│                    VISTA PREVIA                        │
│                 DE CÁMARA EN VIVO                      │
│                                                        │
│                                                        │
│           [ Frontal ]  [ 1x Principal ]  [ 0.5x Wide ] │
│         (Mic)          [ TRANSMITIR ]          (Flash) │
└────────────────────────────────────────────────────────┘
```

- **Píldoras de Lente Rápida:** Pulsa sobre `0.5x` (Gran Angular), `1x` (Principal) o `Frontal` para conmutar de lente al instante.
- **Botón `TRANSMITIR`:**
  - Inicia el envío del stream WebRTC hacia la consola central.
  - Activa automáticamente el **Screen Wake Lock**, impidiendo que el teléfono apague la pantalla o entre en suspensión durante el directo.
  - La barra perimetral de la pantalla se iluminará en rojo indicando que la cámara está en línea.
- **Modo Ahorro de Energía (Pantalla Negra OLED):**
  - Pulsa el icono de batería `[🔋]` en la esquina superior derecha.
  - La pantalla se volverá **completamente negra** (`#000000`) para reducir drásticamente el consumo energético y temperatura en pantallas OLED, manteniendo la transmisión activa en segundo plano.
  - **Para salir del modo ahorro:** Toca la pantalla dos veces seguidas (*doble toque de seguridad*).
- **Selector de Micrófonos:** En el panel `[⚙️ Ajustes]` puedes escoger si usar el micrófono integrado del móvil, auriculares con cable o microfonía inalámbrica Bluetooth.

---

## 5. Consola de Realización de Escritorio

### Previsualización Multicámara (Multiview) y Tally en Vivo
La parte derecha de la consola despliega todas las fuentes WebRTC conectadas y la pantalla del PC en una cuadrícula autoajustable:
- **Tally Gris:** La fuente está conectada y en espera (*Standby*).
- **Tally Azul:** La cámara está asignada a un recuadro secundario en la salida compuesta (Slot 2, 3 o 4).
- **Tally Rojo Pulsante:** La cámara es la fuente principal en **PROGRAM (AL AIRE)** (Slot 1).
- **Vúmetro LED por Cámara:** Cada celda muestra un medidor VU con indicador de pico dB en tiempo real.
- **Selector '+ Slot':** Permite asignar la cámara directamente a cualquiera de los recuadros de composición (*Slot 1, 2, 3 o 4*).
- **Clic Directo:** Al pulsar sobre cualquier celda, se conmuta al instante como fuente principal de Program (*Cut to Program*).

### Auditoría Técnica y Visual de la Salida Program
El monitor de Program (esquina superior izquierda) cuenta con una suite completa de auditoría:
- **Badge Técnico en Vivo:** Muestra la resolución de salida activa (hasta **2.7K `2720x1530`** o **1080p `1920x1080`**), tasa de cuadros por segundo (**60 FPS**), estado de transmisión RTMP y grabación en disco.
- **Tira de Auditoría de Composición:** Detalla qué fuentes están componiendo la salida en cada momento (ej. `Slot 1: iPhone 13 | Slot 2: Pantalla PC`).
- **Botón `⛶ Fullscreen`:** Maximiza la señal Program a pantalla completa en un monitor secundario dedicado o en la pantalla principal para auditoría de calidad de imagen por el director.

### Composición Multicámara y Captura de Pantalla PC
- **Layouts Soportados:**
  - **1 CÁMARA (SOLO):** Modo clásico de corte directo a pantalla completa.
  - **2 CÁMARAS (PiP):** Imagen principal con recuadro flotante en la esquina inferior derecha.
  - **2 CÁMARAS (SPLIT):** División horizontal 50% / 50% lado a lado.
  - **3 CÁMARAS (TRI-VIEW):** Cámara principal en mitad izquierda y dos cámaras apiladas en la derecha.
  - **4 CÁMARAS (QUAD 2x2):** Cuadrícula simétrica de 4 fuentes simultáneas.
- **Compartir Pantalla del PC:** Pulsa **`🖥️ Compartir Pantalla PC`** para incorporar presentaciones, diapositivas, videojuegos o videollamadas a cualquier slot de salida, con audio de sistema sincronizado.

### Control Remoto desde el PC
Desde el propio PC de realización puedes controlar los teléfonos sin tocarlos físicamente:
- **Botón `🔄 Lente`:** Envía una orden vía WebSocket al teléfono para alternar entre sus sensores físicos (Frontal, Principal, Ultra Gran Angular).
- **Botón `⚡ Flash`:** Enciende o apaga la linterna/antorcha trasera del smartphone para iluminar al presentador en entornos oscuros.

### Mezclador de Audio y Auditoría de Auriculares (Web Audio API)
Situado en el dock inferior de la ventana:
- **Fader Individual:** Ajusta la ganancia de cada micrófono de forma independiente (de `0.0` a `1.5`).
- **Botón `M` (Mute):** Silencia temporalmente ese teléfono sin cortar su video.
- **Botón `S` (Solo):** Escucha y emite exclusivamente esa fuente de audio, atenuando las demás automáticamente.
- **Canal MASTER:** Controla el volumen general de la mezcla estéreo que se envía a grabación, RTMP, NDI y Cámara Virtual.
- **Módulo de Auditoría de Salida (`🎧 AUDITORÍA`):**
  - **Botón `🔊 AUDIT ON/OFF`:** Conecta la mezcla maestra directamente a los auriculares del director u operador a través de la salida de audio local del PC.
  - **Fader de Volumen de Auriculares:** Permite regular el volumen de escucha personal del operador sin modificar el nivel máster de la transmisión o grabación.

---

## 6. Salidas Profesionales

La cabecera superior permite activar 4 motores de salida simultáneos e independientes:

### A. Grabación Local en Disco (.MP4)
- Pulsa el botón **`GRABAR`**.
- El contador empezará a cronometrar `HH:MM:SS`.
- Utiliza aceleración por hardware (**Apple VideoToolbox** en Mac, **NVIDIA NVENC** en Windows, **VAAPI** en Linux o **libx264** en CPU).
- Las grabaciones se almacenan automáticamente en:
  - macOS / Linux: `~/Videos/ADirector/`
  - Windows: `C:\Users\<Usuario>\Videos\ADirector\`

### B. Retransmisión RTMP en Vivo
1. Pulsa el botón de engranaje `⚙️` junto a RTMP.
2. Introduce la URL del servidor (ej. `rtmp://a.rtmp.youtube.com/live2` o `rtmp://live.twitch.tv/app/`).
3. Pega tu **Stream Key** privada.
4. Elige el bitrate deseado (por defecto: `4500 kbps` para 1080p).
5. Pulsa **`EMITIR RTMP`**. La consola mostrará el indicador verde en vivo y la tasa de transferencia en tiempo real.

### C. Salida NDI en Red Local (LAN)
- Pulsa el botón **`SALIDA NDI`**.
- La señal maestra aparecerá publicada en tu red bajo el nombre **`ADIRECTOR (Program)`**.
- En **OBS Studio** o **vMix**, añade una fuente de tipo *NDI™ Source* y selecciona `ADIRECTOR (Program)` para recibir el video y audio con latencia inferior a un fotograma.

### D. Cámara Virtual
- Pulsa el botón **`CÁMARA VIRTUAL`**.
- Abre Zoom, Google Meet, Microsoft Teams o Discord.
- En la configuración de video de la aplicación, selecciona como cámara web **`ADirector Virtual Cam`**.
- Tu realización en vivo se proyectará como si fuera tu cámara web física.

---

## 7. Modo ChromeOS (Crostini)

Si ejecutas ADirector dentro del entorno Linux de un **Chromebook**:
- El sistema detectará automáticamente el contenedor Crostini.
- Las funciones de **NDI** y **Cámara Virtual (V4L2)** se deshabilitarán de forma preventiva, indicando la insignia `⚡ CHROMEOS CROSTINI MODE` (debido a que ChromeOS restringe el acceso a módulos de kernel del sistema anfitrión).
- **La Grabación Local en MP4 y la Emisión por RTMP funcionarán con total normalidad.**

---

## 8. Resolución de Problemas (FAQ)

### ¿El teléfono no abre la página web al escanear el código QR?
1. Verifica que el teléfono esté conectado a la **misma red Wi-Fi** que el ordenador (no a datos móviles 4G/5G).
2. Comprueba que el firewall de tu sistema operativo permita conexiones entrantes en el puerto TCP `8443`.
3. Asegúrate de que el router no tenga activado el aislamiento de clientes (*AP Isolation*).

### ¿La imagen parpadea o se congela durante el streaming?
- Comprueba que estás conectado a una red Wi-Fi de **5 GHz**. Las redes de 2.4 GHz sufren interferencias con Bluetooth y microondas.
- Reduce la resolución objetivo a `720p` desde el menú de ajustes de la web móvil si el procesador del teléfono experimenta sobrecalentamiento.

### ¿No se escucha el audio de uno de los teléfonos?
1. Revisa que el botón de micrófono en la pantalla del móvil no esté marcado en rojo (silenciado).
2. En la consola de escritorio, comprueba que el canal no tenga activado el botón `M` (Mute) ni que otro canal tenga activado el botón `S` (Solo).
3. Verifica el vúmetro verde/amarillo del canal en el mezclador inferior.

### ¿Cómo cerrar la aplicación ordenadamente?
Pulsa `Ctrl + C` en la terminal o cierra la ventana de Electron. El servidor cerrará ordenadamente los procesos activos de FFmpeg, garantizando que los archivos `.mp4` se finalicen correctamente con su índice (*moov atom*).
