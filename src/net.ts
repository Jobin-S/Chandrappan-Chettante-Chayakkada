/**
 * Peer-to-peer networking: a small WebRTC mesh (up to 4 players).
 *
 * - The room creator is the host. Guests reach the host through the
 *   /api/signal mailbox (offer/answer/ICE), then all further signaling
 *   between guests is relayed over the host's data channel, so the server
 *   is only polled while someone is joining.
 * - Each connection carries a reliable channel ('rel') for actions/events,
 *   an unreliable one ('state') for snapshots/poses, and an audio track for voice.
 */

export type Channel = 'rel' | 'state';
export type Role = 'host' | 'guest';

export const MAX_PLAYERS = 4;

type Sig =
  | { k: 'offer'; from: string; name: string; sdp: RTCSessionDescriptionInit }
  | { k: 'answer'; from: string; sdp: RTCSessionDescriptionInit }
  | { k: 'ice'; from: string; cand: RTCIceCandidateInit }
  | { k: 'reject'; from: string; reason: string };

interface Peer {
  id: string;
  name: string;
  pc: RTCPeerConnection;
  rel: RTCDataChannel | null;
  state: RTCDataChannel | null;
  pendingIce: RTCIceCandidateInit[];
  open: boolean;
}

export interface NetEvents {
  onPeerOpen(id: string, name: string): void;
  onPeerClose(id: string): void;
  onMessage(from: string, msg: Record<string, unknown>, channel: Channel): void;
  onTrack(id: string, stream: MediaStream): void;
  onHostLost(reason: string): void;
}

const newId = () => Math.random().toString(36).slice(2, 12).padEnd(10, '0');

async function api(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch('/api/signal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(data.error ?? `Signaling failed (${res.status})`));
  return data;
}

export class Net {
  readonly id = newId();
  room = '';
  hostId = '';
  /** False when the signaling server has no shared store (fine locally, flaky on Vercel). */
  persistent = true;
  readonly peers = new Map<string, Peer>();
  private ice: RTCIceServer[] = [];
  private mic: MediaStreamTrack | null = null;
  private pollTimer = 0;
  private fastUntil = 0;
  private closed = false;

  private constructor(
    readonly role: Role,
    readonly name: string,
    private ev: NetEvents,
  ) {}

  /** Create a room and become its host. */
  static async host(name: string, ev: NetEvents): Promise<Net> {
    const n = new Net('host', name, ev);
    const r = await api({ action: 'create', id: n.id });
    n.room = String(r.room);
    n.hostId = n.id;
    n.ice = r.iceServers as RTCIceServer[];
    n.persistent = r.persistent !== false;
    n.schedulePoll(0);
    return n;
  }

  /** Join a friend's room by its 4-letter code. Resolves once connected to the host. */
  static async join(room: string, name: string, ev: NetEvents): Promise<Net> {
    const n = new Net('guest', name, ev);
    const r = await api({ action: 'join', room: room.toUpperCase() });
    n.room = room.toUpperCase();
    n.hostId = String(r.hostId);
    n.ice = r.iceServers as RTCIceServer[];
    n.persistent = r.persistent !== false;
    const peer = n.createPeer(n.hostId, 'Host', true);
    n.fastUntil = Date.now() + 30000;
    n.schedulePoll(0);
    await n.offer(peer);
    await new Promise<void>((resolve, reject) => {
      const t0 = Date.now();
      const check = () => {
        if (peer.open) return resolve();
        if (n.closed) return reject(new Error(n.rejectReason || 'Connection closed'));
        if (Date.now() - t0 > 25000) {
          n.leave();
          return reject(new Error('Could not reach the host. Both players may need a TURN server on strict networks.'));
        }
        setTimeout(check, 150);
      };
      check();
    });
    return n;
  }

  private rejectReason = '';

  get isHost() {
    return this.role === 'host';
  }

  get playerCount() {
    return 1 + [...this.peers.values()].filter((p) => p.open).length;
  }

  // ------------------------------------------------------------- messaging

  send(to: string, msg: Record<string, unknown>, channel: Channel = 'rel') {
    const p = this.peers.get(to);
    const ch = channel === 'rel' ? p?.rel : p?.state;
    if (ch && ch.readyState === 'open') {
      try {
        ch.send(JSON.stringify(msg));
      } catch {
        /* buffer full – drop unreliable data */
      }
    }
  }

  broadcast(msg: Record<string, unknown>, channel: Channel = 'rel') {
    const data = JSON.stringify(msg);
    for (const p of this.peers.values()) {
      const ch = channel === 'rel' ? p.rel : p.state;
      if (ch && ch.readyState === 'open') {
        try {
          ch.send(data);
        } catch {
          /* ignore */
        }
      }
    }
  }

  /** Swap the microphone track on every connection (no renegotiation needed). */
  setMic(track: MediaStreamTrack | null) {
    this.mic = track;
    for (const p of this.peers.values()) this.applyMic(p);
  }

  /** Guests: connect to another guest (the newcomer offers, relayed via the host). */
  async connectTo(id: string, name: string) {
    if (this.peers.has(id) || id === this.id) return;
    const peer = this.createPeer(id, name, true);
    await this.offer(peer);
  }

  leave() {
    this.closed = true;
    window.clearTimeout(this.pollTimer);
    for (const p of this.peers.values()) p.pc.close();
    this.peers.clear();
    if (this.isHost) void api({ action: 'close', room: this.room, id: this.id }).catch(() => {});
  }

  // -------------------------------------------------------------- signaling

  private async signal(to: string, msg: Sig) {
    // host↔guest go through the server mailbox; guest↔guest are relayed by the host
    if (this.isHost || to === this.hostId) {
      await api({ action: 'send', room: this.room, to, msg }).catch(() => {});
    } else {
      this.send(this.hostId, { t: 'relay', to, sig: msg });
    }
  }

  /** Host: forward a relayed signal; anyone: handle a relayed signal. */
  handleRelay(from: string, msg: Record<string, unknown>): boolean {
    if (msg.t === 'relay' && this.isHost) {
      this.send(String(msg.to), { t: 'relayed', sig: msg.sig, from });
      return true;
    }
    if (msg.t === 'relayed') {
      void this.onSignal(msg.sig as Sig);
      return true;
    }
    return false;
  }

  private schedulePoll(delay: number) {
    window.clearTimeout(this.pollTimer);
    if (this.closed) return;
    this.pollTimer = window.setTimeout(() => void this.poll(), delay);
  }

  private async poll() {
    if (this.closed) return;
    // guests stop polling once connected to the host; the host keeps an ear out for joiners
    const needed = this.isHost || !this.peers.get(this.hostId)?.open;
    if (!needed) return;
    try {
      const r = await api({ action: 'poll', room: this.room, id: this.id });
      for (const m of r.messages as Sig[]) await this.onSignal(m);
    } catch {
      /* transient – try again */
    }
    const fast = Date.now() < this.fastUntil || [...this.peers.values()].some((p) => !p.open);
    this.schedulePoll(fast ? 400 : 2500);
  }

  private async onSignal(m: Sig) {
    if (!m || typeof m !== 'object') return;
    if (m.k === 'reject') {
      this.rejectReason = m.reason;
      this.closed = true;
      return;
    }
    if (m.k === 'offer') {
      if (this.isHost && this.playerCount >= MAX_PLAYERS && !this.peers.has(m.from)) {
        await this.signal(m.from, { k: 'reject', from: this.id, reason: 'This room is full (4 players).' });
        return;
      }
      this.fastUntil = Date.now() + 20000;
      this.peers.get(m.from)?.pc.close();
      const peer = this.createPeer(m.from, m.name, false);
      await peer.pc.setRemoteDescription(m.sdp);
      for (const t of peer.pc.getTransceivers()) if (t.receiver.track.kind === 'audio') t.direction = 'sendrecv';
      this.applyMic(peer);
      await this.flushIce(peer);
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      await this.signal(m.from, { k: 'answer', from: this.id, sdp: peer.pc.localDescription!.toJSON() });
      if (this.isHost) this.schedulePoll(0);
      return;
    }
    const peer = this.peers.get(m.from);
    if (!peer) return;
    if (m.k === 'answer') {
      await peer.pc.setRemoteDescription(m.sdp);
      await this.flushIce(peer);
    } else if (m.k === 'ice') {
      if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(m.cand).catch(() => {});
      else peer.pendingIce.push(m.cand);
    }
  }

  private async flushIce(peer: Peer) {
    for (const c of peer.pendingIce.splice(0)) await peer.pc.addIceCandidate(c).catch(() => {});
  }

  // ------------------------------------------------------------ connections

  private createPeer(id: string, name: string, offerer: boolean): Peer {
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const peer: Peer = { id, name, pc, rel: null, state: null, pendingIce: [], open: false };
    this.peers.set(id, peer);

    pc.onicecandidate = (e) => {
      if (e.candidate) void this.signal(id, { k: 'ice', from: this.id, cand: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => this.ev.onTrack(id, e.streams[0] ?? new MediaStream([e.track]));
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.drop(id);
    };

    const bind = (ch: RTCDataChannel) => {
      if (ch.label === 'rel') peer.rel = ch;
      else peer.state = ch;
      ch.onopen = () => {
        if (peer.rel?.readyState === 'open' && !peer.open) {
          peer.open = true;
          this.ev.onPeerOpen(id, peer.name);
        }
      };
      ch.onclose = () => {
        if (ch.label === 'rel') this.drop(id);
      };
      ch.onmessage = (e) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(e.data));
        } catch {
          return;
        }
        if (this.handleRelay(id, msg)) return;
        if (msg.t === 'name') peer.name = String(msg.name);
        this.ev.onMessage(id, msg, ch.label as Channel);
      };
    };

    if (offerer) {
      pc.addTransceiver('audio', { direction: 'sendrecv' });
      bind(pc.createDataChannel('rel'));
      bind(pc.createDataChannel('state', { ordered: false, maxRetransmits: 0 }));
      this.applyMic(peer);
    } else {
      pc.ondatachannel = (e) => bind(e.channel);
    }
    return peer;
  }

  private async offer(peer: Peer) {
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    await this.signal(peer.id, { k: 'offer', from: this.id, name: this.name, sdp: peer.pc.localDescription!.toJSON() });
  }

  private applyMic(peer: Peer) {
    for (const t of peer.pc.getTransceivers()) {
      if (t.receiver.track.kind === 'audio' && t.sender) void t.sender.replaceTrack(this.mic).catch(() => {});
    }
  }

  private drop(id: string) {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    p.pc.close();
    if (p.open) this.ev.onPeerClose(id);
    if (!this.isHost && id === this.hostId && !this.closed) {
      this.closed = true;
      this.ev.onHostLost('The host left the room.');
    }
  }
}
