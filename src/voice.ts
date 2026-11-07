import * as THREE from 'three';

/**
 * Proximity voice chat. Each remote player's voice is placed in 3D at their
 * avatar's head with an HRTF panner: you hear them from the right direction,
 * and they fade to silence beyond VOICE_RANGE metres.
 */

export const VOICE_RANGE = 10;
const SPEAK_THRESHOLD = 0.035;

interface Remote {
  el: HTMLAudioElement;
  src: MediaStreamAudioSourceNode;
  panner: PannerNode;
  analyser: AnalyserNode;
  data: Uint8Array;
  level: number;
}

function rms(analyser: AnalyserNode, data: Uint8Array): number {
  analyser.getByteTimeDomainData(data);
  let s = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    s += v * v;
  }
  return Math.sqrt(s / data.length);
}

function setParam(p: AudioParam | undefined, v: number, ctx: AudioContext) {
  if (p) p.setTargetAtTime(v, ctx.currentTime, 0.05);
}

export class Voice {
  micOn = false;
  localLevel = 0;
  private micStream: MediaStream | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micData = new Uint8Array(512);
  private remotes = new Map<string, Remote>();
  /** Streams that arrived before audio was unlocked; attached on the next update. */
  private pending = new Map<string, MediaStream>();
  private out: GainNode | null = null;

  constructor(private getCtx: () => AudioContext | null) {}

  private ctx(): AudioContext | null {
    const ctx = this.getCtx();
    if (ctx && !this.out) {
      this.out = ctx.createGain();
      this.out.gain.value = 1;
      this.out.connect(ctx.destination);
    }
    return ctx;
  }

  /** Ask for the microphone. Returns the track to send, or throws a friendly error. */
  async startMic(stream?: MediaStream): Promise<MediaStreamTrack> {
    if (!stream) {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot use a microphone here (HTTPS is required).');
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        throw new Error('Microphone permission was denied.');
      }
    }
    this.micStream = stream;
    const ctx = this.ctx();
    if (ctx) {
      this.micAnalyser = ctx.createAnalyser();
      this.micAnalyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(this.micAnalyser);
    }
    this.micOn = true;
    return stream.getAudioTracks()[0];
  }

  stopMic() {
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    this.micAnalyser = null;
    this.micOn = false;
    this.localLevel = 0;
  }

  /** Route a remote player's audio through a 3D panner. */
  attach(id: string, stream: MediaStream) {
    const ctx = this.ctx();
    if (!ctx || !this.out) {
      this.pending.set(id, stream);
      return;
    }
    this.detach(id);
    // Chrome only feeds remote WebRTC audio into Web Audio if an element is also playing it
    const el = new Audio();
    el.srcObject = stream;
    el.muted = true;
    void el.play().catch(() => {});
    const src = ctx.createMediaStreamSource(stream);
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'linear';
    panner.refDistance = 1.2;
    panner.maxDistance = VOICE_RANGE;
    panner.rolloffFactor = 1;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    src.connect(panner).connect(this.out);
    this.remotes.set(id, { el, src, panner, analyser, data: new Uint8Array(512), level: 0 });
  }

  detach(id: string) {
    this.pending.delete(id);
    const r = this.remotes.get(id);
    if (!r) return;
    r.src.disconnect();
    r.panner.disconnect();
    r.el.srcObject = null;
    this.remotes.delete(id);
  }

  detachAll() {
    for (const id of [...this.remotes.keys()]) this.detach(id);
  }

  /** Is this player (or 'me') currently talking? */
  speaking(id: string | 'me'): boolean {
    return (id === 'me' ? this.localLevel : this.remotes.get(id)?.level ?? 0) > SPEAK_THRESHOLD;
  }

  /** How loud a player is to you right now (0…1) – handy for UI. */
  audibility(id: string, listener: THREE.Vector3, head: THREE.Vector3): number {
    if (!this.remotes.has(id)) return 0;
    const d = listener.distanceTo(head);
    return THREE.MathUtils.clamp(1 - (d - 1.2) / (VOICE_RANGE - 1.2), 0, 1);
  }

  /** Place the listener at the camera and every voice at its avatar's head. */
  update(camera: THREE.Camera, heads: Map<string, THREE.Vector3>) {
    const ctx = this.getCtx();
    if (!ctx) return;
    for (const [id, stream] of this.pending) {
      this.pending.delete(id);
      this.attach(id, stream);
    }
    const l = ctx.listener;
    const p = camera.getWorldPosition(new THREE.Vector3());
    const f = camera.getWorldDirection(new THREE.Vector3());
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    if (l.positionX) {
      setParam(l.positionX, p.x, ctx);
      setParam(l.positionY, p.y, ctx);
      setParam(l.positionZ, p.z, ctx);
      setParam(l.forwardX, f.x, ctx);
      setParam(l.forwardY, f.y, ctx);
      setParam(l.forwardZ, f.z, ctx);
      setParam(l.upX, u.x, ctx);
      setParam(l.upY, u.y, ctx);
      setParam(l.upZ, u.z, ctx);
    } else {
      (l as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(p.x, p.y, p.z);
      (l as unknown as { setOrientation(...a: number[]): void }).setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
    for (const [id, r] of this.remotes) {
      const h = heads.get(id);
      if (h) {
        if (r.panner.positionX) {
          setParam(r.panner.positionX, h.x, ctx);
          setParam(r.panner.positionY, h.y, ctx);
          setParam(r.panner.positionZ, h.z, ctx);
        } else r.panner.setPosition(h.x, h.y, h.z);
      }
      r.level = r.level * 0.6 + rms(r.analyser, r.data) * 0.4;
    }
    if (this.micAnalyser) this.localLevel = this.localLevel * 0.6 + rms(this.micAnalyser, this.micData) * 0.4;
  }

  /** Debug/test: current level of a remote voice. */
  level(id: string) {
    return this.remotes.get(id)?.level ?? 0;
  }
}
