import { Server as HttpServer } from 'https';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';
import { ClientMessage, ServerMessage, DeviceInfo } from '../../types/signaling.js';

interface ConnectedPeer {
  id: string;
  ws: WebSocket;
  info: DeviceInfo;
  isAlive: boolean;
}

export class SignalingServer {
  private wss: WebSocketServer;
  private peers = new Map<string, ConnectedPeer>();
  private heartbeatInterval!: NodeJS.Timeout;

  constructor(server: HttpServer) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.setupListeners();
    this.startHeartbeat();
  }

  private setupListeners() {
    this.wss.on('connection', (ws: WebSocket) => {
      const peerId = crypto.randomUUID();
      const peer: ConnectedPeer = {
        id: peerId,
        ws,
        info: {
          id: peerId,
          role: 'camera',
          name: `Device-${peerId.slice(0, 4)}`,
        },
        isAlive: true,
      };

      this.peers.set(peerId, peer);

      ws.on('pong', () => {
        peer.isAlive = true;
      });

      ws.on('message', (raw: string) => {
        try {
          const message: ClientMessage = JSON.parse(raw.toString());
          this.handleClientMessage(peer, message);
        } catch (err) {
          console.error(`[Signaling] Error procesando mensaje de ${peer.id}:`, err);
        }
      });

      ws.on('close', () => {
        this.handlePeerDisconnect(peerId);
      });

      ws.on('error', (err) => {
        console.error(`[Signaling] Error en socket ${peerId}:`, err);
      });
    });
  }

  private handleClientMessage(peer: ConnectedPeer, msg: ClientMessage) {
    switch (msg.type) {
      case 'join': {
        peer.info.role = msg.role;
        peer.info.name = msg.name || peer.info.name;
        if (msg.deviceInfo) {
          peer.info = { ...peer.info, ...msg.deviceInfo };
        }

        // Confirmar registro al cliente
        this.send(peer.ws, {
          type: 'registered',
          yourId: peer.id,
          role: peer.info.role,
        });

        // Notificar a todos los demás dispositivos conectados
        this.broadcastExcept(peer.id, {
          type: 'peer-joined',
          peer: peer.info,
        });

        // Enviar la lista de todos los dispositivos al nuevo cliente
        const activeDevices = Array.from(this.peers.values()).map((p) => p.info);
        this.send(peer.ws, {
          type: 'device-list',
          devices: activeDevices,
        });

        console.log(`[Signaling] ${peer.info.role.toUpperCase()} conectado: ${peer.info.name} (${peer.id})`);
        break;
      }

      case 'offer': {
        const target = this.peers.get(msg.targetId);
        if (target) {
          this.send(target.ws, {
            type: 'offer',
            senderId: peer.id,
            sdp: msg.sdp,
          });
        }
        break;
      }

      case 'answer': {
        const target = this.peers.get(msg.targetId);
        if (target) {
          this.send(target.ws, {
            type: 'answer',
            senderId: peer.id,
            sdp: msg.sdp,
          });
        }
        break;
      }

      case 'ice-candidate': {
        const target = this.peers.get(msg.targetId);
        if (target) {
          this.send(target.ws, {
            type: 'ice-candidate',
            senderId: peer.id,
            candidate: msg.candidate,
          });
        }
        break;
      }

      case 'device-info-update': {
        peer.info = { ...peer.info, ...msg.info };
        this.broadcastExcept(peer.id, {
          type: 'peer-joined',
          peer: peer.info,
        });
        break;
      }

      case 'remote-command': {
        // Enviar comando desde el Host a un móvil específico
        const target = this.peers.get(msg.targetId);
        if (target) {
          const commandId = crypto.randomUUID();
          this.send(target.ws, {
            type: 'remote-command',
            commandId,
            command: msg.command,
          });
          console.log(`[Signaling] Comando '${msg.command.action}' enviado a ${target.info.name}`);
        }
        break;
      }

      case 'command-ack': {
        // Retransmitir respuesta de comando a los hosts
        this.broadcastToRole('host', {
          type: 'device-list',
          devices: Array.from(this.peers.values()).map((p) => p.info),
        });
        break;
      }
    }
  }

  private handlePeerDisconnect(peerId: string) {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    this.peers.delete(peerId);
    console.log(`[Signaling] Desconectado: ${peer.info.name} (${peerId})`);

    this.broadcast({
      type: 'peer-left',
      peerId,
    });
  }

  private send(ws: WebSocket, message: ServerMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcast(message: ServerMessage) {
    const payload = JSON.stringify(message);
    for (const peer of this.peers.values()) {
      if (peer.ws.readyState === WebSocket.OPEN) {
        peer.ws.send(payload);
      }
    }
  }

  private broadcastExcept(excludedPeerId: string, message: ServerMessage) {
    const payload = JSON.stringify(message);
    for (const [id, peer] of this.peers.entries()) {
      if (id !== excludedPeerId && peer.ws.readyState === WebSocket.OPEN) {
        peer.ws.send(payload);
      }
    }
  }

  private broadcastToRole(role: 'host' | 'camera', message: ServerMessage) {
    const payload = JSON.stringify(message);
    for (const peer of this.peers.values()) {
      if (peer.info.role === role && peer.ws.readyState === WebSocket.OPEN) {
        peer.ws.send(payload);
      }
    }
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      for (const [id, peer] of this.peers.entries()) {
        if (!peer.isAlive) {
          peer.ws.terminate();
          this.handlePeerDisconnect(id);
          continue;
        }
        peer.isAlive = false;
        peer.ws.ping();
      }
    }, 30000);
  }

  public getConnectedDevices(): DeviceInfo[] {
    return Array.from(this.peers.values()).map((p) => p.info);
  }

  public close() {
    clearInterval(this.heartbeatInterval);
    this.wss.close();
  }
}
