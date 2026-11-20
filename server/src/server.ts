import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { getLocalIpAddress, generateQrCodes } from './network.js';
import { getOrCreateCertificates } from './ssl.js';
import { SignalingServer } from './signaling.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8443;
const ROOT_DIR = path.resolve(__dirname, '../../');
const CERTS_DIR = path.join(ROOT_DIR, '.certs');
const MOBILE_WEB_DIR = path.join(ROOT_DIR, 'mobile-web', 'public');

async function bootstrap() {
  const localIp = getLocalIpAddress();
  const httpsUrl = `https://${localIp}:${PORT}`;
  const certs = getOrCreateCertificates(localIp, CERTS_DIR);

  const app = express();
  app.use(express.json());

  // Servir cliente PWA móvil
  app.use(express.static(MOBILE_WEB_DIR));

  // Endpoint API para la aplicación Electron de escritorio
  app.get('/api/server-info', async (req, res) => {
    const { dataUrl } = await generateQrCodes(httpsUrl);
    res.json({
      localIp,
      port: PORT,
      httpsUrl,
      qrCodeDataUrl: dataUrl,
    });
  });

  // Fallback para PWA
  app.get('*', (req, res) => {
    res.sendFile(path.join(MOBILE_WEB_DIR, 'index.html'));
  });

  // Crear servidor HTTPS
  const server = https.createServer(
    {
      key: certs.key,
      cert: certs.cert,
    },
    app
  );

  // Iniciar servidor de señalización WebSockets
  const signaling = new SignalingServer(server);

  server.listen(PORT, '0.0.0.0', async () => {
    const { terminal, dataUrl } = await generateQrCodes(httpsUrl);

    console.clear();
    console.log('===========================================================');
    console.log('🎥  ADIRECTOR - LAN WEBRTC VIDEO PRODUCTION STUDIO');
    console.log('===========================================================');
    console.log(`[✓] Servidor HTTPS y WebSockets escuchando en:`);
    console.log(`    Local:   https://localhost:${PORT}`);
    console.log(`    Red LAN: ${httpsUrl}`);
    console.log('-----------------------------------------------------------');
    console.log('📱 Escanea este código QR con la cámara de tu móvil:');
    console.log(terminal);
    console.log('-----------------------------------------------------------');
    console.log('💡 NOTA IMPORTANTE PARA iOS / ANDROID:');
    console.log('   Al ser un certificado autofirmado local, la primera vez pulsa:');
    console.log('   - En Safari (iOS): "Mostrar detalles" -> "Visitar este sitio web"');
    console.log('   - En Chrome (Android): "Configuración avanzada" -> "Continuar a..."');
    console.log('===========================================================');
  });

  // Manejo de apagado graceful
  const shutdown = () => {
    console.log('\n[Cierre] Deteniendo servidores...');
    signaling.close();
    server.close(() => {
      console.log('[Cierre] Servidor cerrado.');
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
