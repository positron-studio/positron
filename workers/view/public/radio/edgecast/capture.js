// demo/radio/edge/capture.js: 'pcm-frames', an AudioWorklet that cuts its stereo input into frames of
// `frame` samples (960 = 20 ms at 48 kHz) as interleaved s16, the shape castlab takes, and posts each one.
// The tab's audio clock paces the frames, so a file and a microphone both leave in real time.
class PcmFrames extends AudioWorkletProcessor {
  constructor(o) {
    super();
    this.n = o?.processorOptions?.frame ?? 960;
    this.buf = new Int16Array(this.n * 2);
    this.at = 0;
    this.on = true;
    this.port.onmessage = (e) => { if (e.data?.cmd === 'stop') this.on = false; };
  }
  process(inputs) {
    if (!this.on) return false;
    const ch = inputs[0];
    if (!ch || !ch.length) return true;
    const L = ch[0], R = ch[1] || ch[0];
    for (let i = 0; i < L.length; i++) {
      const l = Math.max(-1, Math.min(1, L[i])), r = Math.max(-1, Math.min(1, R[i]));
      this.buf[this.at++] = l < 0 ? l * 32768 : l * 32767;
      this.buf[this.at++] = r < 0 ? r * 32768 : r * 32767;
      if (this.at === this.buf.length) {
        const out = this.buf;
        this.port.postMessage(out.buffer, [out.buffer]);
        this.buf = new Int16Array(this.n * 2);
        this.at = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm-frames', PcmFrames);
