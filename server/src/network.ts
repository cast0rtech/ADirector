import os from 'os';
import QRCode from 'qrcode';

export interface NetworkConfig {
  localIp: string;
  port: number;
  url: string;
}

/**
 * Detecta la IP local (IPv4) prioritaria de la red local (WiFi/Ethernet).
 * Ignora interfaces internas (127.0.0.1) y adaptadores virtuales comunes.
 */
export function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces();
  const preferredRegex = /(en0|eth0|wlan0|wi-fi|ethernet)/i;

  let fallbackIp = '127.0.0.1';

  // Primero buscar interfaces prioritarias conocidas
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        if (preferredRegex.test(name)) {
          return addr.address;
        }
        fallbackIp = addr.address;
      }
    }
  }

  return fallbackIp;
}

/**
 * Genera el código QR para la terminal y en formato DataURL (SVG o PNG)
 */
export async function generateQrCodes(url: string): Promise<{ terminal: string; dataUrl: string }> {
  // Código QR para la consola
  const terminal = await QRCode.toString(url, { type: 'terminal', small: true });
  // Código QR en formato imagen DataURL para servir a la interfaz de escritorio
  const dataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 2,
    scale: 8,
  });

  return { terminal, dataUrl };
}
