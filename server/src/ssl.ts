import fs from 'fs';
import path from 'path';
import selfsigned from 'selfsigned';
import { getAllLocalIps } from './network.js';

export interface SslCertificates {
  key: string;
  cert: string;
}

/**
 * Genera o recupera un certificado SSL autofirmado con SAN (Subject Alternative Names)
 * compatible con iOS (Safari) y Android (Chrome) para el uso de getUserMedia en IP local.
 *
 * Requisitos de iOS 13+ / Safari:
 * - SAN que incluya explícitamente todas las IPs locales y localhost.
 * - Validez no mayor a 398 días (usamos 365 días).
 * - Extended Key Usage para Server Authentication.
 */
export function getOrCreateCertificates(localIp: string, certsDir: string): SslCertificates {
  const keyPath = path.join(certsDir, 'server.key');
  const certPath = path.join(certsDir, 'server.crt');

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    const existingCert = fs.readFileSync(certPath, 'utf8');
    // Verificar si el certificado ya incluye la IP local actual
    if (existingCert.includes(localIp)) {
      return {
        key: fs.readFileSync(keyPath, 'utf8'),
        cert: existingCert,
      };
    }
    console.log(`[SSL] La IP local cambió a ${localIp}. Regenerando certificado...`);
  }

  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
  }

  console.log(`[SSL] Generando certificado autofirmado con SAN para IP: ${localIp}...`);

  const attrs = [
    { name: 'commonName', value: localIp },
    { name: 'organizationName', value: 'ADirector Local Studio' },
    { shortName: 'OU', value: 'WebRTC Studio' },
  ];

  // Incluir todas las IPs locales detectadas en el SAN
  const allIps = getAllLocalIps();
  const altNames: Array<{ type: number; value?: string; ip?: string }> = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
    { type: 7, ip: localIp },
  ];

  for (const item of allIps) {
    if (item.address !== localIp && item.address !== '127.0.0.1') {
      altNames.push({ type: 7, ip: item.address });
    }
  }

  const pems = selfsigned.generate(attrs, {
    keySize: 2048,
    days: 365,
    algorithm: 'sha256',
    extensions: [
      {
        name: 'basicConstraints',
        cA: true,
      },
      {
        name: 'keyUsage',
        keyCertSign: true,
        digitalSignature: true,
        nonRepudiation: true,
        keyEncipherment: true,
        dataEncipherment: true,
      },
      {
        name: 'extKeyUsage',
        serverAuth: true,
        clientAuth: true,
      },
      {
        name: 'subjectAltName',
        altNames,
      },
    ],
  });

  fs.writeFileSync(keyPath, pems.private, { encoding: 'utf8' });
  fs.writeFileSync(certPath, pems.cert, { encoding: 'utf8' });

  console.log(`[SSL] Certificados guardados con SAN en ${certsDir}`);

  return {
    key: pems.private,
    cert: pems.cert,
  };
}
