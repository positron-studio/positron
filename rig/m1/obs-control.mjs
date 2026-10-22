// obs-websocket v5 client, zero deps (a copy of rig/obs-docker/control.mjs for the studio agent on the Mac):
// node obs-control.mjs call <Request> ['<json>'] | rtt
// Env: OBS_WS_URL (ws://127.0.0.1:4455), OBS_WS_PASSWORD (obsdock).
// why: lessons/rig-obs.md#obs-control
import crypto from "node:crypto";

const now = () => performance.timeOrigin + performance.now();

export class ObsClient {
  constructor({ url = process.env.OBS_WS_URL || "ws://127.0.0.1:4455",
                password = process.env.OBS_WS_PASSWORD || "obsdock",
                eventSubscriptions = 2047 } = {}) {
    this.url = url;
    this.password = password;
    this.eventSubscriptions = eventSubscriptions;
    this.pending = new Map();
    this.eventHandlers = [];
    this.nextId = 1;
  }

  connect({ timeoutMs = 10000 } = {}) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      const to = setTimeout(() => { try { ws.close(); } catch {} ; reject(new Error("connect timeout")); }, timeoutMs);
      ws.addEventListener("error", (e) => { clearTimeout(to); reject(new Error("ws error: " + (e.message || "?"))); });
      ws.addEventListener("close", (e) => {
        for (const [, p] of this.pending) p.reject(new Error("ws closed"));
        this.pending.clear();
        this.closed = true;
      });
      ws.addEventListener("message", (m) => {
        const msg = JSON.parse(m.data);
        if (msg.op === 0) { // Hello
          const d = { rpcVersion: 1, eventSubscriptions: this.eventSubscriptions };
          if (msg.d.authentication) {
            const { challenge, salt } = msg.d.authentication;
            const secret = crypto.createHash("sha256").update(this.password + salt).digest("base64");
            d.authentication = crypto.createHash("sha256").update(secret + challenge).digest("base64");
          }
          ws.send(JSON.stringify({ op: 1, d }));
        } else if (msg.op === 2) { // Identified
          clearTimeout(to);
          this.identified = true;
          resolve(msg.d);
        } else if (msg.op === 7) { // RequestResponse
          const p = this.pending.get(msg.d.requestId);
          if (p) {
            this.pending.delete(msg.d.requestId);
            const t = now();
            if (msg.d.requestStatus.result) p.resolve({ data: msg.d.responseData || {}, tResp: t, rttMs: t - p.tSend });
            else p.reject(Object.assign(new Error(`${msg.d.requestType}: ${msg.d.requestStatus.code} ${msg.d.requestStatus.comment || ""}`), { code: msg.d.requestStatus.code }));
          }
        } else if (msg.op === 5) { // Event
          for (const h of this.eventHandlers) h(msg.d.eventType, msg.d.eventData || {}, now());
        }
      });
    });
  }

  onEvent(fn) { this.eventHandlers.push(fn); }

  waitEvent(type, pred = () => true, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error("timeout waiting " + type)), timeoutMs);
      const h = (et, ed, t) => {
        if (et === type && pred(ed)) {
          clearTimeout(to);
          this.eventHandlers = this.eventHandlers.filter((x) => x !== h);
          resolve({ data: ed, t });
        }
      };
      this.onEvent(h);
    });
  }

  call(requestType, requestData = {}) {
    const requestId = String(this.nextId++);
    const tSend = now();
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, tSend });
      this.ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
    });
  }

  close() { try { this.ws.close(); } catch {} }
}

export const pct = (arr, p) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

// ---- CLI -------------------------------------------------------------------
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const [cmd, a1, a2] = process.argv.slice(2);
  const c = new ObsClient();
  await c.connect();
  if (cmd === "call") {
    const r = await c.call(a1, a2 ? JSON.parse(a2) : {});
    console.log(JSON.stringify(r.data, null, 2));
    console.log(`# rtt ${r.rttMs.toFixed(1)} ms`);
  } else if (cmd === "rtt") {
    const N = Number(a1 || 50);
    const plans = [
      ["GetVersion", () => ({})],
      ["GetStats", () => ({})],
      ["GetSceneList", () => ({})],
      ["GetStreamStatus", () => ({})],
      ["SetCurrentProgramScene", (i) => ({ sceneName: i % 2 ? "A" : "B" })],
      ["SetInputSettings", (i) => ({ inputName: "colorA", inputSettings: { color: i % 2 ? 0xff0000ff : 0xff1000ff } })],
    ];
    const out = [];
    for (const [type, mk] of plans) {
      const rtts = [];
      let fail = 0;
      for (let i = 0; i < N; i++) {
        try { const r = await c.call(type, mk(i)); rtts.push(r.rttMs); }
        catch (e) { fail++; if (fail === 1) console.error(`${type}: ${e.message}`); }
      }
      const row = { kind: "rtt", cmd: type, n: rtts.length, fail,
        p50: +pct(rtts, 50).toFixed(2), p95: +pct(rtts, 95).toFixed(2),
        min: +Math.min(...rtts).toFixed(2), max: +Math.max(...rtts).toFixed(2) };
      out.push(row);
      console.log(JSON.stringify(row));
    }
    const { appendFileSync } = await import("node:fs");
    const f = new URL("../../results/obs-docker-rtt.jsonl", import.meta.url).pathname;
    for (const r of out) appendFileSync(f, JSON.stringify({ t: Date.now(), ...r }) + "\n");
    console.log("# wrote " + f);
  } else {
    console.error("usage: control.mjs call <RequestType> [jsonData] | rtt [n]");
    process.exitCode = 2;
  }
  c.close();
}
