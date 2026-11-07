/**
 * Multiplayer signaling – a Vercel Function (Node.js runtime, Web Request/Response).
 *
 * Players only use this to find each other and exchange WebRTC offers/answers/ICE.
 * All gameplay and voice then flow peer-to-peer. Messages are short-lived
 * mailboxes per player, stored in Upstash Redis (Vercel Marketplace) when its
 * env vars are present, or in memory for local development.
 *
 * POST /api/signal  { action: 'create' }                         → { room, iceServers }
 * POST /api/signal  { action: 'join', room }                     → { hostId, iceServers }
 * POST /api/signal  { action: 'send', room, to, msg }            → { ok }
 * POST /api/signal  { action: 'poll', room, id }                 → { messages }
 * POST /api/signal  { action: 'close', room, id }                → { ok }
 */

const ROOM_TTL = 4 * 60 * 60; // seconds
const INBOX_TTL = 10 * 60;
const MAX_MSG = 64 * 1024;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

type Cmd = (string | number)[];

interface Store {
  /** Run commands atomically, returning each result. */
  exec(cmds: Cmd[]): Promise<unknown[]>;
}

// ------------------------------------------------------------------ stores

function upstashStore(url: string, token: string): Store {
  return {
    async exec(cmds) {
      const res = await fetch(`${url.replace(/\/$/, '')}/multi-exec`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cmds),
      });
      if (!res.ok) throw new Error(`Redis error ${res.status}`);
      const out = (await res.json()) as { result?: unknown; error?: string }[];
      return out.map((r) => {
        if (r.error) throw new Error(r.error);
        return r.result;
      });
    },
  };
}

/** In-memory fallback (local dev, or a single warm serverless instance). */
function memoryStore(): Store {
  const data = new Map<string, { v: string | string[]; exp: number }>();
  const live = (k: string) => {
    const e = data.get(k);
    if (e && e.exp < Date.now()) data.delete(k);
    return data.get(k);
  };
  const run = (c: Cmd): unknown => {
    const [op, key] = [String(c[0]).toUpperCase(), String(c[1])];
    switch (op) {
      case 'SET': {
        if (c.includes('NX') && live(key)) return null;
        const ex = c.indexOf('EX');
        data.set(key, { v: String(c[2]), exp: Date.now() + (ex > 0 ? Number(c[ex + 1]) * 1000 : 1e12) });
        return 'OK';
      }
      case 'GET':
        return (live(key)?.v as string) ?? null;
      case 'RPUSH': {
        const e = live(key) ?? { v: [], exp: Date.now() + 1e12 };
        (e.v as string[]).push(String(c[2]));
        data.set(key, e);
        return (e.v as string[]).length;
      }
      case 'LRANGE':
        return [...((live(key)?.v as string[]) ?? [])];
      case 'EXPIRE': {
        const e = live(key);
        if (e) e.exp = Date.now() + Number(c[2]) * 1000;
        return e ? 1 : 0;
      }
      case 'DEL':
        return data.delete(key) ? 1 : 0;
    }
    throw new Error(`unsupported ${op}`);
  };
  return { exec: async (cmds) => cmds.map(run) };
}

const g = globalThis as unknown as { __chayaStore?: Store; process?: { env: Record<string, string | undefined> } };

function store(): { s: Store; persistent: boolean } {
  const env = g.process?.env ?? {};
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return { s: upstashStore(url, token), persistent: true };
  g.__chayaStore ??= memoryStore();
  return { s: g.__chayaStore, persistent: false };
}

function iceServers(): RTCIceServer[] {
  const env = g.process?.env ?? {};
  const list: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (env.TURN_URLS) {
    list.push({ urls: env.TURN_URLS.split(',').map((s) => s.trim()), username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL });
  }
  return list;
}

// ------------------------------------------------------------------ handler

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

const validRoom = (r: unknown): r is string => typeof r === 'string' && /^[A-Z0-9]{4}$/.test(r);
const validId = (r: unknown): r is string => typeof r === 'string' && /^[a-z0-9]{6,16}$/.test(r);

export async function handleSignal(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Bad JSON' }, 400);
  }
  const { s, persistent } = store();
  try {
    switch (body.action) {
      case 'create': {
        if (!validId(body.id)) return json({ error: 'Bad id' }, 400);
        for (let attempt = 0; attempt < 8; attempt++) {
          const room = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
          const [ok] = await s.exec([['SET', `room:${room}`, body.id, 'NX', 'EX', ROOM_TTL]]);
          if (ok) return json({ room, iceServers: iceServers(), persistent });
        }
        return json({ error: 'Could not allocate a room code' }, 503);
      }
      case 'join': {
        if (!validRoom(body.room)) return json({ error: 'Room codes have 4 letters' }, 400);
        const [hostId] = await s.exec([['GET', `room:${body.room}`]]);
        if (!hostId) return json({ error: 'Room not found. Check the code with your host.' }, 404);
        return json({ hostId, iceServers: iceServers(), persistent });
      }
      case 'send': {
        if (!validRoom(body.room) || !validId(body.to)) return json({ error: 'Bad target' }, 400);
        const msg = JSON.stringify(body.msg ?? null);
        if (msg.length > MAX_MSG) return json({ error: 'Message too large' }, 413);
        const key = `inbox:${body.room}:${body.to}`;
        await s.exec([
          ['RPUSH', key, msg],
          ['EXPIRE', key, INBOX_TTL],
        ]);
        return json({ ok: true });
      }
      case 'poll': {
        if (!validRoom(body.room) || !validId(body.id)) return json({ error: 'Bad poll' }, 400);
        const key = `inbox:${body.room}:${body.id}`;
        const [list] = await s.exec([
          ['LRANGE', key, 0, -1],
          ['DEL', key],
        ]);
        const messages = ((list as string[]) ?? []).map((m) => JSON.parse(m));
        return json({ messages });
      }
      case 'close': {
        if (!validRoom(body.room)) return json({ error: 'Bad room' }, 400);
        const [hostId] = await s.exec([['GET', `room:${body.room}`]]);
        if (hostId === body.id) await s.exec([['DEL', `room:${body.room}`]]);
        return json({ ok: true });
      }
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: `Signaling store failed: ${(e as Error).message}` }, 500);
  }
}

export function POST(request: Request) {
  return handleSignal(request);
}
