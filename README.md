# ADirector: LAN Multi-Camera WebRTC Studio

Sistema de producción y realización de video y audio en tiempo real sobre red local (LAN) desde navegadores móviles (iOS Safari, Android Chrome) hacia una aplicación de escritorio (Windows, macOS, Linux, ChromeOS).

> 📘 **¿Buscando el manual de instrucciones?** Consulta la **[Guía Completa de Usuario](file:///Users/castordfedez/Desktop/ADirector/docs/GUIA_USUARIO.md)** para aprender a conectar teléfonos, realizar la mezcla de audio, emitir por RTMP y usar NDI / Cámara Virtual.
> 
> ⚙️ **Detalles de arquitectura nativa:** Consulta la documentación técnica de **[Salidas NDI y Cámara Virtual](file:///Users/castordfedez/Desktop/ADirector/docs/NATIVE_OUTPUTS.md)**.

---

## 📁 Arquitectura del Proyecto

```text
ADirector/
├── .certs/                       # Certificados SSL locales generados automáticamente
├── desktop-app/                  # Aplicación de escritorio (Electron + React/Vite)
│   └── src/
│       └── WebRtcHostReceiver.ts # Cliente receptor WebRTC para el renderer de Electron
├── mobile-web/                   # PWA móvil servida directamente por el backend local
│   └── public/
│       ├── index.html            # Interfaz HUD de cámara móvil a pantalla completa
│       ├── style.css             # Estilos de UI táctil responsiva
│       └── app.js                # Lógica WebRTC + manejo de cámara y comandos remotos
├── server/                       # Servidor HTTPS + WebSockets en Node.js / TypeScript
│   ├── src/
│   │   ├── network.ts            # Detección de IP LAN y generador de Códigos QR
│   │   ├── ssl.ts                # Generador automático de certificados SSL con SAN
│   │   ├── signaling.ts          # Servidor de señalización WebRTC y control remoto
│   │   └── server.ts             # Servidor Express HTTPS integrado
│   └── tsconfig.json
├── types/
│   └── signaling.ts              # Tipos compartidos del protocolo de señalización
├── package.json
└── README.md
```

---

## 🔒 Manejo de Certificados SSL en LAN (iOS / Android)

Los navegadores modernos prohíben `navigator.mediaDevices.getUserMedia` fuera de contextos seguros (`localhost` o `https://`).
Para transmitir desde una IP de red local (`https://192.168.x.x:8443`):

1. **Generación con SAN (Subject Alternative Names):** `server/src/ssl.ts` crea automáticamente un certificado X.509 incluyendo la IP local en la extensión `subjectAltName` (`altNames: IP:<local-ip>`) con validez de 365 días (compatible con el límite de 398 días de iOS 13+).
2. **Primera conexión en el móvil:**
   - **Safari (iOS):** Al abrir la URL por primera vez tras escanear el QR, pulsar *«Mostrar detalles»* → *«Visitar este sitio web»*.
   - **Chrome (Android):** Pulsar *«Configuración avanzada»* → *«Acceder a 192.168.x.x (no seguro)»*.
3. Una vez aceptado el certificado de origen, el navegador concede acceso a la cámara y micrófono sin restricciones.

---

## 🚀 Puesta en Marcha

### 1. Instalar dependencias
```bash
npm install
```

### 2. Iniciar el servidor local
```bash
npm run dev:server
```

El servidor detectará la IP de tu interfaz WiFi/Ethernet, generará los certificados SSL si no existen y mostrará en la terminal:
- La URL HTTPS LAN.
- El **código QR ASCII** en consola (para escanear al instante).
- El endpoint `/api/server-info` que provee el código QR en DataURL para el frontend de Electron.
