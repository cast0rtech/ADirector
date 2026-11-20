/**
 * ADirector Mobile WebRTC Studio Client
 * - Desacoplamiento total de pistas de Audio y Video.
 * - Cambio de cámara sin interrupción de audio mediante RTCRtpSender.replaceTrack().
 * - Enumeración dinámica de todas las cámaras (Ultra-Wide, Telefoto, Frontal, etc.) y micrófonos.
 * - Control de Wake Lock (pantalla encendida constante).
 * - Modo Ahorro de Energía (OLED Stealth Blackout).
 * - Reconexión automática con exponential backoff e ICE Restart ante microcortes Wi-Fi.
 */

class MobileDirectorClient {
  constructor() {
    // Estado de Conexión
    this.ws = null;
    this.myId = null;
    this.hostId = null;
    this.peerConnection = null;
    this.isStreaming = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 20;
    this.reconnectTimer = null;
    this.isReconnecting = false;

    // WebRTC Senders desacoplados
    this.videoSender = null;
    this.audioSender = null;
    this.currentVideoTrack = null;
    this.currentAudioTrack = null;

    // Dispositivos
    this.videoDevices = [];
    this.audioDevices = [];
    this.selectedCameraId = null;
    this.selectedMicId = null;
    this.currentFacingMode = 'environment';
    this.torchActive = false;
    this.audioMuted = false;

    // Wake Lock y Modo Batería
    this.wakeLock = null;
    this.isBatterySaverActive = false;
    this.lastSaverTap = 0;

    // Referencias DOM
    this.dom = {
      videoPreview: document.getElementById('preview'),
      tallyBorder: document.getElementById('tally-border'),
      statusText: document.getElementById('status-text'),
      statusDot: document.querySelector('.dot'),
      statsBadge: document.getElementById('stats-badge'),
      btnBroadcast: document.getElementById('btn-broadcast'),
      btnToggleMic: document.getElementById('btn-toggle-mic'),
      btnToggleTorch: document.getElementById('btn-toggle-torch'),
      btnBatterySaver: document.getElementById('btn-battery-saver'),
      batterySaverOverlay: document.getElementById('battery-saver-overlay'),
      btnOpenSettings: document.getElementById('btn-open-settings'),
      btnCloseSettings: document.getElementById('btn-close-settings'),
      drawerSettings: document.getElementById('drawer-settings'),
      selectCamera: document.getElementById('select-camera'),
      selectMic: document.getElementById('select-mic'),
      selectResolution: document.getElementById('select-resolution'),
      cameraPills: document.getElementById('camera-pills'),
      wakeLockStatus: document.getElementById('wakelock-status'),
      networkStatus: document.getElementById('network-status'),
      iconMicOn: document.getElementById('icon-mic-on'),
      iconMicOff: document.getElementById('icon-mic-off'),
    };

    this.bindEvents();
    this.init();
  }

  // =========================================================================
  // 1. INICIALIZACIÓN Y ENUMERACIÓN DE DISPOSITIVOS
  // =========================================================================

  async init() {
    this.setupNetworkWatchdog();

    // 1. Obtener stream inicial para que iOS y Android liberen los labels en enumerateDevices()
    await this.requestInitialPermissions();

    // 2. Enumerar todas las cámaras y micrófonos físicos disponibles
    await this.refreshDeviceList();

    // 3. Conectar al WebSocket de señalización
    this.connectSignaling();

    // 4. Iniciar monitor de estadísticas WebRTC
    this.startStatsMonitor();
  }

  bindEvents() {
    this.dom.btnBroadcast.addEventListener('click', () => this.toggleStreaming());
    this.dom.btnToggleMic.addEventListener('click', () => this.toggleMicrophone());
    this.dom.btnToggleTorch.addEventListener('click', () => this.toggleTorch());

    // Modo Ahorro de Energía
    this.dom.btnBatterySaver.addEventListener('click', () => this.enableBatterySaver());
    this.dom.batterySaverOverlay.addEventListener('click', (e) => this.handleBatterySaverTap(e));

    // Menú de Ajustes
    this.dom.btnOpenSettings.addEventListener('click', () => this.toggleSettingsDrawer(true));
    this.dom.btnCloseSettings.addEventListener('click', () => this.toggleSettingsDrawer(false));

    // Selectores de Dispositivos
    this.dom.selectCamera.addEventListener('change', async (e) => {
      await this.switchCameraDevice(e.target.value);
    });

    this.dom.selectMic.addEventListener('change', async (e) => {
      await this.switchMicDevice(e.target.value);
    });

    this.dom.selectResolution.addEventListener('change', async () => {
      if (this.selectedCameraId) {
        await this.switchCameraDevice(this.selectedCameraId);
      }
    });

    // Detectar si el usuario desconecta o conecta auriculares / cámaras
    navigator.mediaDevices.addEventListener('devicechange', async () => {
      console.log('[Media] Detectado cambio en el hardware de dispositivos');
      await this.refreshDeviceList();
    });

    // Restaurar Wake Lock si la pestaña vuelve a primer plano
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && this.isStreaming) {
        await this.requestWakeLock();
      }
    });
  }

  /**
   * Concede acceso inicial a cámara y micro para que enumerateDevices devuelva etiquetas legibles
   */
  async requestInitialPermissions() {
    try {
      this.updateStatus('Iniciando sensores...', 'warning');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: true,
      });

      this.currentVideoTrack = stream.getVideoTracks()[0];
      this.currentAudioTrack = stream.getAudioTracks()[0];

      // Asignar al preview local
      this.dom.videoPreview.srcObject = new MediaStream([this.currentVideoTrack]);
      await this.dom.videoPreview.play().catch(() => {});
    } catch (err) {
      console.error('[Media] Error en permisos iniciales:', err);
      this.updateStatus('Permiso de Cámara Denegado', 'error');
    }
  }

  /**
   * Enumera cámaras y micrófonos y genera los nombres claros (Frontal, Trasera, Ultra-Wide, etc.)
   */
  async refreshDeviceList() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();

      this.videoDevices = devices.filter((d) => d.kind === 'videoinput');
      this.audioDevices = devices.filter((d) => d.kind === 'audioinput');

      // Limpiar y repoblar select de cámaras
      this.dom.selectCamera.innerHTML = '';
      this.dom.cameraPills.innerHTML = '';

      let backCount = 0;
      let frontCount = 0;

      this.videoDevices.forEach((device, index) => {
        let label = device.label || `Cámara ${index + 1}`;
        const isBack = /back|rear|environment|trasera/i.test(label);
        const isFront = /front|delantera|user/i.test(label);

        // Nombres legibles en español
        if (isBack) {
          backCount++;
          if (/wide|ultra/i.test(label)) {
            label = `Trasera Ultra-Wide (0.5x)`;
          } else if (/telephoto|zoom/i.test(label)) {
            label = `Trasera Teleobjetivo (${backCount}x)`;
          } else {
            label = `Trasera Principal (${backCount})`;
          }
        } else if (isFront) {
          frontCount++;
          label = `Frontal (${frontCount})`;
        }

        // Opción del desplegable
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = label;
        if (device.deviceId === this.currentVideoTrack?.getSettings()?.deviceId) {
          option.selected = true;
          this.selectedCameraId = device.deviceId;
        }
        this.dom.selectCamera.appendChild(option);

        // Píldora de acceso rápido en HUD
        const pill = document.createElement('button');
        pill.className = `cam-pill ${device.deviceId === this.selectedCameraId ? 'active' : ''}`;
        pill.textContent = isFront ? 'Frontal' : isBack ? `${backCount}x` : `Cam ${index + 1}`;
        pill.addEventListener('click', () => this.switchCameraDevice(device.deviceId));
        this.dom.cameraPills.appendChild(pill);
      });

      // Limpiar y repoblar select de micrófonos
      this.dom.selectMic.innerHTML = '';
      this.audioDevices.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Micrófono ${index + 1}`;
        if (device.deviceId === this.currentAudioTrack?.getSettings()?.deviceId) {
          option.selected = true;
          this.selectedMicId = device.deviceId;
        }
        this.dom.selectMic.appendChild(option);
      });
    } catch (err) {
      console.error('[Media] Error enumerando dispositivos:', err);
    }
  }

  // =========================================================================
  // 2. GESTIÓN DESACOPLADA DE PISTAS (REPLACE_TRACK SIN CORTAR AUDIO)
  // =========================================================================

  /**
   * Cambia de cámara física en caliente.
   * Utiliza RTCRtpSender.replaceTrack() para enviar la nueva pista de video
   * sin interrumpir la llamada WebRTC ni el streaming de audio continuo.
   */
  async switchCameraDevice(newDeviceId) {
    if (!newDeviceId) return;

    try {
      this.updateStatus('Cambiando cámara...', 'warning');

      const resolution = this.getResolutionConstraints();
      const constraints = {
        audio: false, // Desacoplado: NO tocar audio
        video: {
          deviceId: { exact: newDeviceId },
          ...resolution,
        },
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const newVideoTrack = newStream.getVideoTracks()[0];

      // 1. Reemplazar pista en el Sender WebRTC si estamos transmitiendo
      if (this.videoSender && this.peerConnection) {
        await this.videoSender.replaceTrack(newVideoTrack);
        console.log('[WebRTC] Pista de video reemplazada exitosamente con replaceTrack()');
      }

      // 2. Detener pista de video previa para liberar sensor óptico
      if (this.currentVideoTrack) {
        this.currentVideoTrack.stop();
      }

      // 3. Asignar nuevo track y actualizar preview local
      this.currentVideoTrack = newVideoTrack;
      this.selectedCameraId = newDeviceId;
      this.dom.videoPreview.srcObject = new MediaStream([this.currentVideoTrack]);
      await this.dom.videoPreview.play().catch(() => {});

      // 4. Actualizar estado de UI
      this.dom.selectCamera.value = newDeviceId;
      this.updatePillsUI(newDeviceId);
      this.updateStatus(this.isStreaming ? 'EN VIVO' : 'Listo', this.isStreaming ? 'live' : 'connected');

      // Informar al Host de las capacidades del nuevo lente (ej. si tiene linterna)
      this.notifyCapabilitiesUpdate();
    } catch (err) {
      console.error('[Media] Error cambiando de cámara:', err);
      this.updateStatus('Error al cambiar cámara', 'error');
    }
  }

  /**
   * Cambia de micrófono sin alterar el video
   */
  async switchMicDevice(newDeviceId) {
    if (!newDeviceId) return;

    try {
      const constraints = {
        video: false, // Desacoplado: NO tocar video
        audio: {
          deviceId: { exact: newDeviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const newAudioTrack = newStream.getAudioTracks()[0];

      if (this.audioSender && this.peerConnection) {
        await this.audioSender.replaceTrack(newAudioTrack);
      }

      if (this.currentAudioTrack) {
        this.currentAudioTrack.stop();
      }

      this.currentAudioTrack = newAudioTrack;
      this.selectedMicId = newDeviceId;
      this.dom.selectMic.value = newDeviceId;
    } catch (err) {
      console.error('[Media] Error cambiando de micrófono:', err);
    }
  }

  toggleMicrophone() {
    if (!this.currentAudioTrack) return;
    this.audioMuted = !this.audioMuted;
    this.currentAudioTrack.enabled = !this.audioMuted;

    if (this.audioMuted) {
      this.dom.btnToggleMic.classList.add('muted');
      this.dom.iconMicOn.classList.add('hidden');
      this.dom.iconMicOff.classList.remove('hidden');
    } else {
      this.dom.btnToggleMic.classList.remove('muted');
      this.dom.iconMicOn.classList.remove('hidden');
      this.dom.iconMicOff.classList.add('hidden');
    }
  }

  async toggleTorch() {
    if (!this.currentVideoTrack) return;
    const caps = this.currentVideoTrack.getCapabilities ? this.currentVideoTrack.getCapabilities() : {};

    if (!caps.torch) {
      alert('La linterna (torch) no está disponible en este lente.');
      return;
    }

    try {
      this.torchActive = !this.torchActive;
      await this.currentVideoTrack.applyConstraints({
        advanced: [{ torch: this.torchActive }],
      });
      this.dom.btnToggleTorch.classList.toggle('active', this.torchActive);
    } catch (err) {
      console.error('[Torch] Error alternando linterna:', err);
    }
  }

  getResolutionConstraints() {
    const res = this.dom.selectResolution.value;
    if (res === '2.7k') {
      return { width: { ideal: 2720, min: 2560 }, height: { ideal: 1530, min: 1440 }, frameRate: { ideal: 30 } };
    }
    if (res === '1440p') {
      return { width: { ideal: 2560, min: 1920 }, height: { ideal: 1440, min: 1080 }, frameRate: { ideal: 30 } };
    }
    if (res === '1080p') {
      return { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };
    }
    if (res === '480p') {
      return { width: { ideal: 854 }, height: { ideal: 480 }, frameRate: { ideal: 30 } };
    }
    return { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
  }

  updatePillsUI(activeDeviceId) {
    const pills = this.dom.cameraPills.querySelectorAll('.cam-pill');
    this.videoDevices.forEach((dev, idx) => {
      if (pills[idx]) {
        pills[idx].classList.toggle('active', dev.deviceId === activeDeviceId);
      }
    });
  }

  // =========================================================================
  // 3. WAKE LOCK API Y MODO AHORRO DE BATERÍA (OLED BLACKOUT)
  // =========================================================================

  async requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.dom.wakeLockStatus.textContent = 'Activo (Pantalla siempre encendida)';
        this.dom.wakeLockStatus.style.color = '#10b981';

        this.wakeLock.addEventListener('release', () => {
          this.dom.wakeLockStatus.textContent = 'Inactivo';
          this.dom.wakeLockStatus.style.color = '#94a3b8';
        });
      } catch (err) {
        console.warn('[WakeLock] No se pudo obtener el bloqueo de pantalla:', err);
      }
    } else {
      this.dom.wakeLockStatus.textContent = 'No soportado por el navegador';
    }
  }

  releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release();
      this.wakeLock = null;
    }
  }

  enableBatterySaver() {
    this.isBatterySaverActive = true;
    this.dom.batterySaverOverlay.classList.remove('hidden');
    // Reducir consumo de GPU en rendering deteniendo la reproducción visible sin pausar el track
    this.dom.videoPreview.style.opacity = '0';
  }

  handleBatterySaverTap(e) {
    const now = Date.now();
    // Requerir doble toque para evitar toques accidentales en el bolsillo
    if (now - this.lastSaverTap < 400) {
      this.isBatterySaverActive = false;
      this.dom.batterySaverOverlay.classList.add('hidden');
      this.dom.videoPreview.style.opacity = '1';
    }
    this.lastSaverTap = now;
  }

  toggleSettingsDrawer(show) {
    this.dom.drawerSettings.classList.toggle('hidden', !show);
  }

  // =========================================================================
  // 4. WEBRTC Y RECONEXIÓN AUTOMÁTICA ANTE CAÍDAS DE RED / WI-FI
  // =========================================================================

  setupNetworkWatchdog() {
    window.addEventListener('online', () => {
      this.dom.networkStatus.textContent = 'En línea';
      this.dom.networkStatus.style.color = '#10b981';
      console.log('[Network] Conexión recuperada. Reanudando señalización...');
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.connectSignaling();
      }
    });

    window.addEventListener('offline', () => {
      this.dom.networkStatus.textContent = 'Desconectado (Sin Wi-Fi)';
      this.dom.networkStatus.style.color = '#dc2626';
      this.updateStatus('Sin Red Wi-Fi', 'error');
    });
  }

  connectSignaling() {
    if (this.isReconnecting) return;

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    this.updateStatus('Conectando a Host...', 'warning');
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.isReconnecting = false;
      this.updateStatus('Conectado al Host', 'connected');

      // Registrarse como cámara
      this.send({
        type: 'join',
        role: 'camera',
        name: this.getDeviceModelName(),
        deviceInfo: {
          os: this.detectOS(),
          currentCamera: this.currentFacingMode,
          torchSupported: true,
        },
      });
    };

    this.ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        await this.handleSignalingMessage(msg);
      } catch (err) {
        console.error('[Signaling] Error procesando mensaje:', err);
      }
    };

    this.ws.onclose = () => {
      this.handleSignalingDrop();
    };

    this.ws.onerror = (err) => {
      console.error('[Signaling] Error en WebSocket:', err);
    };
  }

  handleSignalingDrop() {
    if (this.isReconnecting) return;
    this.isReconnecting = true;
    this.updateStatus('Reconectando...', 'warning');

    // Exponential Backoff para reconexión suave
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 8000);
    this.reconnectAttempts++;

    console.log(`[Signaling] Conexión perdida. Reintentando en ${Math.round(delay)}ms...`);
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.isReconnecting = false;
      this.connectSignaling();
    }, delay);
  }

  async handleSignalingMessage(msg) {
    switch (msg.type) {
      case 'registered':
        this.myId = msg.yourId;
        break;

      case 'device-list': {
        const host = msg.devices.find((d) => d.role === 'host');
        if (host) {
          this.hostId = host.id;
          if (this.isStreaming && (!this.peerConnection || this.peerConnection.connectionState === 'failed')) {
            await this.startWebRtcCall();
          }
        }
        break;
      }

      case 'peer-joined':
        if (msg.peer.role === 'host') {
          this.hostId = msg.peer.id;
          if (this.isStreaming) {
            await this.startWebRtcCall();
          }
        }
        break;

      case 'peer-left':
        if (msg.peerId === this.hostId) {
          this.hostId = null;
          this.updateStatus('Host desconectado', 'warning');
        }
        break;

      case 'answer':
        if (this.peerConnection) {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        }
        break;

      case 'ice-candidate':
        if (this.peerConnection && msg.candidate) {
          try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } catch (e) {
            console.warn('[WebRTC] Error agregando ICE candidate:', e);
          }
        }
        break;

      case 'remote-command':
        await this.handleRemoteCommand(msg.commandId, msg.command);
        break;
    }
  }

  /**
   * Inicializa la llamada WebRTC agregando pistas desacopladas
   */
  async startWebRtcCall() {
    if (!this.hostId) return;

    this.cleanupPeerConnection();

    this.peerConnection = new RTCPeerConnection({
      iceServers: [], // LAN pura directa
    });

    // 1. Agregar pista de video desacoplada
    if (this.currentVideoTrack) {
      this.videoSender = this.peerConnection.addTrack(this.currentVideoTrack, new MediaStream([this.currentVideoTrack]));
    }

    // 2. Agregar pista de audio desacoplada
    if (this.currentAudioTrack) {
      this.audioSender = this.peerConnection.addTrack(this.currentAudioTrack, new MediaStream([this.currentAudioTrack]));
    }

    // Monitoreo del estado ICE para autorreparación
    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection.iceConnectionState;
      console.log(`[WebRTC ICE State]: ${state}`);

      if (state === 'disconnected' || state === 'failed') {
        console.warn('[WebRTC] Microcorte detectado en ICE. Reiniciando negociación...');
        this.restartIceNegotiation();
      }
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.send({
          type: 'ice-candidate',
          targetId: this.hostId,
          candidate: event.candidate,
        });
      }
    };

    // Crear oferta SDP inicial
    const offer = await this.peerConnection.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false,
    });

    await this.peerConnection.setLocalDescription(offer);

    this.send({
      type: 'offer',
      targetId: this.hostId,
      sdp: offer,
    });
  }

  async restartIceNegotiation() {
    if (!this.peerConnection || !this.hostId) return;
    try {
      const offer = await this.peerConnection.createOffer({ iceRestart: true });
      await this.peerConnection.setLocalDescription(offer);
      this.send({
        type: 'offer',
        targetId: this.hostId,
        sdp: offer,
      });
    } catch (err) {
      console.error('[WebRTC] Error durante ICE restart:', err);
    }
  }

  // =========================================================================
  // 5. CONTROL REMOTO DESDE EL HOST (PC)
  // =========================================================================

  async handleRemoteCommand(commandId, command) {
    let success = true;
    let error;

    try {
      switch (command.action) {
        case 'switch-camera': {
          if (command.deviceId) {
            await this.switchCameraDevice(command.deviceId);
          } else {
            // Alternar al siguiente dispositivo de cámara
            const currentIndex = this.videoDevices.findIndex((d) => d.deviceId === this.selectedCameraId);
            const nextDevice = this.videoDevices[(currentIndex + 1) % this.videoDevices.length];
            if (nextDevice) {
              await this.switchCameraDevice(nextDevice.deviceId);
            }
          }
          break;
        }

        case 'toggle-torch':
          if (this.currentVideoTrack) {
            await this.currentVideoTrack.applyConstraints({
              advanced: [{ torch: command.enabled }],
            });
            this.torchActive = command.enabled;
            this.dom.btnToggleTorch.classList.toggle('active', this.torchActive);
          }
          break;

        case 'set-zoom':
          if (this.currentVideoTrack) {
            await this.currentVideoTrack.applyConstraints({
              advanced: [{ zoom: command.factor }],
            });
          }
          break;
      }
    } catch (e) {
      success = false;
      error = e.message;
    }

    this.send({
      type: 'command-ack',
      commandId,
      success,
      error,
    });
  }

  notifyCapabilitiesUpdate() {
    if (!this.currentVideoTrack) return;
    const caps = this.currentVideoTrack.getCapabilities ? this.currentVideoTrack.getCapabilities() : {};

    this.send({
      type: 'device-info-update',
      info: {
        torchSupported: !!caps.torch,
        torchActive: this.torchActive,
        currentCamera: this.currentFacingMode,
      },
    });
  }

  // =========================================================================
  // 6. ACCIONES DE TRANSMISIÓN Y ESTADÍSTICAS
  // =========================================================================

  async toggleStreaming() {
    if (this.isStreaming) {
      this.isStreaming = false;
      this.dom.btnBroadcast.classList.remove('live');
      this.dom.btnBroadcast.querySelector('.btn-label').textContent = 'TRANSMITIR';
      this.dom.tallyBorder.classList.remove('live');
      this.updateStatus('Listo', 'connected');
      this.releaseWakeLock();
      this.cleanupPeerConnection();
    } else {
      this.isStreaming = true;
      this.dom.btnBroadcast.classList.add('live');
      this.dom.btnBroadcast.querySelector('.btn-label').textContent = 'DETENER';
      this.dom.tallyBorder.classList.add('live');
      this.updateStatus('EN VIVO', 'live');

      await this.requestWakeLock();

      if (this.hostId) {
        await this.startWebRtcCall();
      } else {
        this.updateStatus('Esperando Host...', 'warning');
      }
    }
  }

  startStatsMonitor() {
    setInterval(async () => {
      if (!this.peerConnection || !this.isStreaming) {
        this.dom.statsBadge.textContent = '-- fps | -- kbps';
        return;
      }

      try {
        const stats = await this.peerConnection.getStats();
        let fps = 0;
        let bitrateKbps = 0;

        stats.forEach((report) => {
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            fps = report.framesPerSecond || 0;
            if (report.bytesSent && this.lastBytesSent) {
              const deltaBytes = report.bytesSent - this.lastBytesSent;
              bitrateKbps = Math.round((deltaBytes * 8) / 1000);
            }
            this.lastBytesSent = report.bytesSent;
          }
        });

        this.dom.statsBadge.textContent = `${Math.round(fps)} fps | ${bitrateKbps} kbps`;
      } catch (e) {}
    }, 1000);
  }

  cleanupPeerConnection() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
      this.videoSender = null;
      this.audioSender = null;
    }
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  updateStatus(text, state) {
    this.dom.statusText.textContent = text;
    this.dom.statusDot.className = `dot ${state}`;
  }

  detectOS() {
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
    if (/Android/.test(ua)) return 'android';
    return 'desktop';
  }

  getDeviceModelName() {
    const os = this.detectOS().toUpperCase();
    return `${os} Cam (${navigator.hardwareConcurrency || 4} Cores)`;
  }
}

// Iniciar aplicación al cargar el DOM
window.addEventListener('DOMContentLoaded', () => {
  new MobileDirectorClient();
});
