import os from 'os';
import QRCode from 'qrcode';

export interface LocalInterface {
  name: string;
  address: string;
}

/**
 * Devuelve todas las IPs locales IPv4 disponibles (WiFi, Ethernet, etc.)
 */
export function getAllLocalIps(): LocalInterface[] {
  const interfaces = os.networkInterfaces();
  const list: LocalInterface[] = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        list.push({ name, address: addr.address });
      }
    }
  }

  return list;
}

/**
 * Detecta la IP local (IPv4) prioritaria de la red local (WiFi/Ethernet).
 */
export function getLocalIpAddress(): string {
  const all = getAllLocalIps();
  const preferred = /(en0|eth0|wlan0|wi-fi|ethernet)/i;

  for (const item of all) {
    if (preferred.test(item.name)) {
      return item.address;
    }
  }

  return all.length > 0 ? all[0].address : '127.0.0.1';
}

/**
 * Genera el código QR para la terminal y en formato DataURL
 */
export async function generateQrCodes(url: string): Promise<{ terminal: string; dataUrl: string }> {
  const terminal = await QRCode.toString(url, { type: 'terminal', small: true });
  const dataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 2,
    scale: 8,
  });

  return { terminal, dataUrl };
}
