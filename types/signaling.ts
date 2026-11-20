/**
 * Protocolo de señalización y control remoto para ADirector
 */

export type ClientRole = 'host' | 'camera';

export interface DeviceInfo {
  id: string;
  role: ClientRole;
  name: string;
  os?: 'ios' | 'android' | 'desktop' | 'unknown';
  batteryLevel?: number;
  availableCameras?: Array<{ deviceId: string; label: string; facingMode?: string }>;
  currentCamera?: 'user' | 'environment';
  torchSupported?: boolean;
  torchActive?: boolean;
}

// Mensajes enviados desde los clientes al servidor de señalización
export type ClientMessage =
  | { type: 'join'; role: ClientRole; name: string; deviceInfo?: Partial<DeviceInfo> }
  | { type: 'offer'; targetId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; targetId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; targetId: string; candidate: RTCIceCandidateInit }
  | { type: 'device-info-update'; info: Partial<DeviceInfo> }
  | { type: 'remote-command'; targetId: string; command: RemoteCommand }
  | { type: 'command-ack'; commandId: string; success: boolean; error?: string };

// Mensajes enviados desde el servidor a los clientes
export type ServerMessage =
  | { type: 'registered'; yourId: string; role: ClientRole }
  | { type: 'peer-joined'; peer: DeviceInfo }
  | { type: 'peer-left'; peerId: string }
  | { type: 'offer'; senderId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; senderId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; senderId: string; candidate: RTCIceCandidateInit }
  | { type: 'remote-command'; commandId: string; command: RemoteCommand }
  | { type: 'device-list'; devices: DeviceInfo[] }
  | { type: 'error'; message: string };

// Comandos remotos ejecutables por el Host (PC) en las Cámaras (Móviles)
export type RemoteCommand =
  | { action: 'switch-camera'; facingMode?: 'user' | 'environment'; deviceId?: string }
  | { action: 'toggle-torch'; enabled: boolean }
  | { action: 'set-zoom'; factor: number }
  | { action: 'set-bitrate'; maxBitrateKbps: number }
  | { action: 'ping' };
