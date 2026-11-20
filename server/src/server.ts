import http from 'http';
import https from 'https';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import { getLocalIpAddress, getAllLocalIps, generateQrCodes } from './network.js';
import { getOrCreateCertificates } from './ssl.js';
import { SignalingServer } from './signaling.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8443;
const HTTP_PORT = process.env.HTTP_PORT ? parseInt(process.env.HTTP_PORT, 10) : 8080;

const ROOT_DIR = path.resolve(__dirname, '../../');
const CERTS_DIR = path.join(ROOT_DIR, '.certs');
const MOBILE_WEB_DIR = path.join(ROOT_DIR, 'mobile-web', 'public');
const DESKTOP_DIST_DIR = path.join(ROOT_DIR, 'desktop-app', 'dist');

async function bootstrap() {
  const localIp = getLocalIpAddress();
  const allIps = getAllLocalIps();
  const httpsUrl = `https://${localIp}:${PORT}`;
  const mobileCamUrl = `${httpsUrl}/cam`;
  const certs = getOrCreateCertificates(localIp, CERTS_DIR);

  const app = express();
  app.use(express.json());

  // Servir archivos estáticos del cliente móvil
  app.use('/cam-assets', express.static(MOBILE_WEB_DIR));
  app.use(express.static(MOBILE_WEB_DIR));

  // Servir archivos estáticos del switcher de escritorio
  if (fs.existsSync(DESKTOP_DIST_DIR)) {
    app.use('/studio-dist', express.static(DESKTOP_DIST_DIR));
  }

  // 1. Ruta específica para la cámara móvil: /cam
  app.get('/cam', (req, res) => {
    res.sendFile(path.join(MOBILE_WEB_DIR, 'index.html'));
  });

  // 2. Ruta específica para la consola de producción: /studio
  app.get('/studio', (req, res) => {
    const desktopIndex = path.join(DESKTOP_DIST_DIR, 'index.html');
    if (fs.existsSync(desktopIndex)) {
      res.sendFile(desktopIndex);
    } else {
      res.sendFile(path.join(MOBILE_WEB_DIR, 'index.html'));
    }
  });

  // 3. Endpoint API para la aplicación Electron de escritorio
  app.get('/api/server-info', async (req, res) => {
    const { dataUrl } = await generateQrCodes(mobileCamUrl);
    res.json({
      localIp,
      port: PORT,
      httpsUrl,
      mobileCamUrl,
      qrCodeDataUrl: dataUrl,
      allIps,
    });
  });

  // 4. Ruta raíz /: Redirige según el dispositivo
  app.get('/', (req, res) => {
    const ua = req.headers['user-agent'] || '';
    const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);

    if (isMobile) {
      res.sendFile(path.join(MOBILE_WEB_DIR, 'index.html'));
    } else {
      const desktopIndex = path.join(DESKTOP_DIST_DIR, 'index.html');
      if (fs.existsSync(desktopIndex)) {
        res.sendFile(desktopIndex);
      } else {
        res.sendFile(path.join(MOBILE_WEB_DIR, 'index.html'));
      }
    }
  });

  // Servidor HTTPS principal
  const server = https.createServer(
    {
      key: certs.key,
      cert: certs.cert,
    },
    app
  );

  // Iniciar servidor de señalización WebSockets en /ws
  const signaling = new SignalingServer(server);

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ Error fatal: El puerto HTTPS ${PORT} ya está en uso.`);
      console.error(`   Cierra el proceso anterior o usa otro puerto: PORT=9443 npm run dev:server\n`);
    } else {
      console.error('Error en el servidor HTTPS:', err);
    }
    process.exit(1);
  });

  server.listen(PORT, '0.0.0.0', async () => {
    const { terminal } = await generateQrCodes(mobileCamUrl);

    console.clear();
    console.log('===========================================================');
    console.log('🎥  ADIRECTOR - LAN WEBRTC VIDEO PRODUCTION STUDIO');
    console.log('===========================================================');
    console.log(`[✓] Servidor HTTPS seguro escuchando en:`);
    console.log(`    Local (PC):  https://localhost:${PORT}/studio`);
    console.log(`    Móvil LAN:   ${mobileCamUrl}`);
    if (allIps.length > 1) {
      console.log(`    Otras IPs detectadas en tu red:`);
      allIps.forEach((i) => console.log(`      - https://${i.address}:${PORT}/cam (${i.name})`));
    }
    console.log('-----------------------------------------------------------');
    console.log('📱 Escanea este código QR con la cámara de tu iPhone / Android:');
    console.log(terminal);
    console.log('-----------------------------------------------------------');
    console.log('💡 RESOLUCIÓN DE PROBLEMAS EN SAFARI (iOS):');
    console.log('   1. Asegúrate de que tu iPhone está en la misma red Wi-Fi (no datos móviles).');
    console.log(`   2. Abre en Safari: ${mobileCamUrl}`);
    console.log('   3. Pulsa "Mostrar detalles" -> "Visitar este sitio web" -> "Visitar sitio web".');
    console.log('===========================================================');
  });

  // Servidor HTTP secundario para redirección automática (puerto 8080)
  // Si alguien escribe accidentalmente http:// en lugar de https://, se redirige solo
  try {
    const redirectApp = express();
    redirectApp.get('*', (req, res) => {
      const host = req.headers.host ? req.headers.host.split(':')[0] : localIp;
      res.redirect(`https://${host}:${PORT}${req.url}`);
    });

    const redirectServer = http.createServer(redirectApp);

    redirectServer.on('error', (err: any) => {
      // Si el puerto 8080 ya está en uso por otro servicio, no tumbar el servidor principal
      if (err.code === 'EADDRINUSE') {
        console.log(`[HTTP Redirection] Nota: Puerto ${HTTP_PORT} ocupado por otra app. Redirección HTTP secundaria desactivada.`);
      } else {
        console.warn(`[HTTP Redirection] Aviso: ${err.message}`);
      }
    });

    redirectServer.listen(HTTP_PORT, '0.0.0.0', () => {
      console.log(`[HTTP Redirection] Redireccionando http://*:${HTTP_PORT} -> https://*:${PORT}`);
    });
  } catch (e) {
    // Silencioso ante cualquier excepción síncrona
  }

  const shutdown = () => {
    console.log('\n[Cierre] Deteniendo servidores...');
    signaling.close();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('Error fatal al iniciar el servidor:', err);
  process.exit(1);
});
