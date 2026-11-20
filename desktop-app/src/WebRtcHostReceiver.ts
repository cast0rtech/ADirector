/**
 * ADirector Desktop Host Receiver
 * Diseñado para ejecutarse en el proceso Renderer de Electron (o aplicación React/Vite).
 * Recibe los streams WebRTC de múltiples dispositivos móviles y envía comandos remotos.
 */

import { ClientMessage, ServerMessage, DeviceInfo, RemoteCommand } from '../../types/signaling.js';

export interface StreamEvent {
  peerId: string;
  device: DeviceInfo;
  stream: MediaStream;
}

export class WebRtcHostReceiver {
  private ws: WebSocket | null = null;
  private myId: string | null = null;
  private peerConnections = new Map<string, RTCPeerConnection>();
  private activeStreams = new Map<string, MediaStream>();
  private devices = new Map<string, DeviceInfo>();

  // Callbacks para actualización de UI en React
  public onStreamAdded?: (event: StreamEvent) => void;
  public onStreamRemoved?: (peerId: string) => void;
  public onDeviceListUpdated?: (devices: DeviceInfo[]) => void;
  public onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected') => void;

  constructor(private serverUrl: string = 'wss://localhost:8443/ws') {}

  public connect() {
    this.onStatusChange?.('connecting');
    this.ws = new WebSocket(this.serverUrl);

    this.ws.onopen = () => {
      this.onStatusChange?.('connected');
      this.send({
        type: 'join',
        role: 'host',
        name: 'Desktop Studio Host',
      });
    };

    this.ws.onmessage = async (event) => {
      const msg: ServerMessage = JSON.parse(event.data);
      await this.handleMessage(msg);
    };

    this.ws.onclose = () => {
      this.onStatusChange?.('disconnected');
      setTimeout(() => this.connect(), 2500); // Reintento
    };
  }

  private async handleMessage(msg: ServerMessage) {
    switch (msg.type) {
      case 'registered':
        this.myId = msg.yourId;
        break;

      case 'device-list':
        this.devices.clear();
        for (const dev of msg.devices) {
          this.devices.set(dev.id, dev);
        }
        this.onDeviceListUpdated?.(Array.from(this.devices.values()));
        break;

      case 'peer-joined':
        this.devices.set(msg.peer.id, msg.peer);
        this.onDeviceListUpdated?.(Array.from(this.devices.values()));
        break;

      case 'peer-left':
        this.cleanupPeer(msg.peerId);
        this.devices.delete(msg.peerId);
        this.onDeviceListUpdated?.(Array.from(this.devices.values()));
        break;

      case 'offer':
        await this.handleOffer(msg.senderId, msg.sdp);
        break;

      case 'ice-candidate':
        await this.handleCandidate(msg.senderId, msg.candidate);
        break;
    }
  }

  private async handleOffer(senderId: string, sdp: RTCSessionDescriptionInit) {
    const pc = new RTCPeerConnection({
      iceServers: [], // LAN Direct
    });

    this.peerConnections.set(senderId, pc);

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        this.activeStreams.set(senderId, remoteStream);
        const device = this.devices.get(senderId) || {
          id: senderId,
          role: 'camera',
          name: `Cam-${senderId.slice(0, 4)}`,
        };
        this.onStreamAdded?.({
          peerId: senderId,
          device,
          stream: remoteStream,
        });
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.send({
          type: 'ice-candidate',
          targetId: senderId,
          candidate: event.candidate,
        });
      }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.send({
      type: 'answer',
      targetId: senderId,
      sdp: answer,
    });
  }

  private async handleCandidate(senderId: string, candidate: RTCIceCandidateInit) {
    const pc = this.peerConnections.get(senderId);
    if (pc && candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  /**
   * Envía un comando remoto al móvil especificado (ej. cambiar de cámara o encender flash)
   */
  public sendRemoteCommand(targetCameraId: string, command: RemoteCommand) {
    this.send({
      type: 'remote-command',
      targetId: targetCameraId,
      command,
    });
  }

  private cleanupPeer(peerId: string) {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }
    this.activeStreams.delete(peerId);
    this.onStreamRemoved?.(peerId);
  }

  private send(msg: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public disconnect() {
    for (const [id] of this.peerConnections) {
      this.cleanupPeer(id);
    }
    if (this.ws) {
      this.ws.close();
    }
  }
}
