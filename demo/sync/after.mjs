// AFTER tab: the show and its cues are both files, aligned because the picture
// is the clock. Owns the page's one published transport bar. The loop is laid
// around the first cue, so cue timing is graded on every run.
// See lessons/page-sync.md#sync-26

import { el, armVideo, playOrPrompt } from '/shell/shell.mjs';
import { createBar } from '/shell/bar.mjs';
import { createTransportControl, transportApi, publishTransport } from '/shell/transport-control.mjs';
import { playToggle, clockView, ratesView, loopView, noteView } from '/shell/transport-views.mjs';
import { bindTransportKeys } from '/shell/transport-keys.mjs';
import { createStripView } from '/shell/strip.mjs';
import { createGlue } from '/shell/glue.mjs';
import { tabDiagram } from './how.mjs';
import { createDeck } from '/timeline/transport.mjs';
import { mediaMaster } from '/timeline/media-master.mjs';
import { ARCHIVE, CUES, cueItems } from '/shell/archive.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One lap, long enough that a picture ignoring the loop is a full second past
// `b` by the time sampling stops.
// See lessons/page-sync.md#sync-27
const LOOP_MS = 900;
const SAMPLE_MS = 2000;
// The first cue sits inside the lap, 400 ms after its start.
const LOOP_LEAD_MS = 400;
// What the wrap may cost: the bar wraps at 60 Hz and re-anchors on the picture
// four times a second, so a third of a second is slack, not tolerance.
// See lessons/page-sync.md#sync-28
const LOOP_SLACK_MS = 350;

// Native HLS only on WebKit, gated on ManagedMediaSource: `canPlayType` answers
// "maybe" for HLS in Chrome too. Same rule as src/low-latency-player.js.
// See lessons/page-sync.md#sync-29
const NATIVE_HLS = 'ManagedMediaSource' in window
  && !!document.createElement('video').canPlayType('application/vnd.apple.mpegurl');

// `media` is not a cell: the picture's own clock is printed on the bar beside
// the duration. `worst` is, because a median on its own hides the one bad fire.
// What this tab is, in the fixed box under the tab row (`tab-page.mjs` rule 6).
export const about = 'A recorded show with eight cues, where the video itself is the clock so every cue lands on its own moment of the picture. Press play, or drag along the timeline.';

export const readout = { 'cues fired': '', 'late by': 'ms', worst: 'ms', drift: 'ms' };

export function build({ panel, log, set, d }) {
  const video = el('video', 'sync-video', null, { playsinline: '', muted: '', preload: 'auto' });
  video.muted = true;
  // What the empty box says until the first frame is decoded. Words, not a
  // poster: a poster is a fetch, and a visit opens nothing.
  const len = `${Math.floor(ARCHIVE.durationMs / 60000)}:${String(Math.round(ARCHIVE.durationMs / 1000) % 60).padStart(2, '0')}`;
  const say = el('p', 'sync-say', `The ${len} recording plays here when you press play.`);
  const screen = el('div', 'sync-screen');
  screen.append(video, say);
  video.addEventListener('loadeddata', () => { say.hidden = true; }, { once: true });

  // ── the cue lane: the media is the master, the deck is the score ─────────
  const fires = [];
  const cueAdapter = {
    // NO `rates`: this playhead follows a media element and never drives it,
    // so there is no speed to arm, and a lattice of one draws a lone `1`.
    caps: { continuous: false, assertOnSeek: true },
    actuate(payload) {
      // error is measured in MEDIA time, the only clock that means anything
      // for a recording
      const mediaMs = video.currentTime * 1000;
      fires.push({ id: payload.id, mediaMs, wantMs: payload.offsetMs, errMs: mediaMs - payload.offsetMs });
      render();
    },
    // reduceAt() hands over the PREFIX already, and each row is the payload
    reduce(rows) { return { count: rows.length, last: rows.length ? rows[rows.length - 1].id : null }; },
    assertState(state) { return state; },
  };
  const deck = createDeck({ items: cueItems(), adapters: { cue: cueAdapter }, range: [0, ARCHIVE.durationMs] });

  let master = null, hls = null, loaded = false;

  /** Point the element at the show. Once, on the first press of ▸. */
  function attach() {
    if (loaded) return;
    loaded = true;
    armVideo(video);
    const url = ARCHIVE.hls;
    if (NATIVE_HLS) {
      video.src = url;
    } else if (window.Hls && window.Hls.isSupported()) {
      hls = new window.Hls({ enableWorker: true });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) log(`hls fatal ${data.type}/${data.details}`, 'bad');
      });
    } else {
      log('this browser has no way to play HLS', 'bad');
      return;
    }
    // media is the master: the deck follows currentTime, it does not drive it
    // See lessons/page-sync.md#sync-30
    master = mediaMaster(deck, video, {
      anchorMs: 0,
      onCorrection: (c) => log(`correction ${JSON.stringify(c).slice(0, 90)}`),
    });
    video.addEventListener('loadedmetadata', () => {
      log(`playing ${ARCHIVE.hls.split('/').slice(-2).join('/')}, ${video.duration?.toFixed?.(1)} s, ${CUES.length} cues`);
    }, { once: true });
  }

  /**
   * The bar asks the page, not the deck: the deck follows the picture, so a seek
   * written to it is undone on the next tick. Every verb drives the element.
   * See lessons/page-sync.md#sync-31
   */
  const command = {
    play: () => {
      const first = !loaded;
      attach();
      // The picture starts where the playhead already is.
      if (first) {
        const at = Math.max(0, deck.position());
        if (at > 1) { try { video.currentTime = at / 1000; } catch { /* no data yet */ } }
      }
      // FIRED, NEVER AWAITED: play() waits on a gesture and does not reject.
      playOrPrompt(video, d);
      deck.play();
    },
    pause: () => { video.pause(); deck.pause(); },
    seek: (pos) => {
      const ms = Math.max(0, pos);
      if (loaded) { try { video.currentTime = ms / 1000; } catch { /* no data yet */ } }
      return deck.seek(ms);
    },
  };

  // One position surface: the strip seeks on press and drag; no way button. In the
  // page before the strip is made, or it fits to a detached 300 px and never refits.
  // See lessons/page-sync.md#sync-32
  const shelf = el('div');
  panel.add(screen, shelf);
  const control = createTransportControl(deck, { command });
  const bar = createBar({
    start: [playToggle(control).el],
    middle: [clockView(control).el, noteView(control).el],
    end: [loopView(control).el, ratesView(control).el],
  });
  shelf.append(bar.el);
  bindTransportKeys(control, { scope: bar.el });
  const transport = transportApi(control, { el: bar.el });
  publishTransport(transport);
  const strip = createStripView(shelf, deck, { size: 'default', lanes: [{
    id: 'cue', kind: 'cue', height: 44, as: 'ticks',
    color: '#ffd400', width: 2.5, latch: true, firedColor: '#8fd6a8',
  }] });
  shelf.append(createGlue(bar.el, strip.el));

  function render() {
    set('cues fired', fires.length);
    if (!fires.length) return;
    const errs = fires.map((f) => Math.abs(f.errMs)).sort((a, b) => a - b);
    set('late by', errs[errs.length >> 1]);
    set('worst', errs[errs.length - 1]);
  }

  // Watchdog: inside jumpMs an error is frame quantisation, past it the element
  // moved and the timeline follows. Only while rolling, never during a paused scrub.
  // See lessons/page-sync.md#sync-33
  const watch = setInterval(() => {
    if (!master || video.readyState < 2) return;
    const off = video.currentTime * 1000 - deck.position();
    set('drift', off, Math.abs(off) > 250 ? 'bad' : 'ok');
    if (deck.playing?.() && Math.abs(off) > 250) {
      deck.seek(video.currentTime * 1000);
      log(`pulled the timeline back ${off.toFixed(0)} ms onto the picture`, 'bad');
    }
  }, 400);
  addEventListener('pagehide', () => clearInterval(watch));

  /**
   * The diagram, last in the tab, drawn on first showing: a closed panel has no
   * width, and by then the readout and log are in place above.
   * See lessons/page-sync.md#sync-34
   */
  let fitted = false;
  const how = tabDiagram(panel, () => ({
      caption: 'The picture is the clock. Everything else in this tab follows where it has got to.',
      nodes: [
        { id: 'cf', label: 'Cloudflare', sub: 'R2 bucket', kind: 'cloud', tech: 'cloudflare',
          children: [
            { id: 'playlist', label: 'playlist', sub: 'm3u8 text',
              note: 'Text naming every four second file of the show, in order. It is fetched '
                  + 'once, because a recording that has already finished never grows.' },
            { id: 'segs', label: 'segments', sub: '4s each',
              note: 'The show itself, cut into four second files at the moment it was '
                  + 'recorded. A seek fetches the one file the playhead landed in.' },
          ] },
        // `set: true`: these four are not one chain, and `cue log` is a file
        // this page ships rather than something upstream produces.
        { id: 'you', label: 'Browser', sub: 'this tab', kind: 'here', tech: 'browser', set: true,
          children: [
            { id: 'hls', label: 'hls.js', sub: 'MediaSource',
              note: 'Fetches the files the playlist names and appends them to a '
                  + '**MediaSource** buffer. Safari has no need of it: **ManagedMediaSource** '
                  + 'means WebKit plays the playlist itself and this never loads.' },
            { id: 'video', label: 'video', sub: 'one element',
              note: 'Muted, and decoding whatever is in the buffer. Its currentTime is the '
                  + 'only clock in this tab that means anything.' },
            { id: 'cues', label: 'cue log', sub: '8, in the page',
              note: 'Eight cues an operator called while the show went out on 2026-08-26, each '
                  + 'stamped with how far into the recording it happened. Hard coded into this '
                  + 'page as a JavaScript module: no Durable Object, nothing fetched.' },
            { id: 'clock', label: 'timeline', sub: '8 cues, 1 loop',
              note: 'Holds the eight cues at the moment each was called, and the two marks a '
                  + 'loop runs between. A lap coming round writes **video** currentTime, '
                  + 'which is what makes the picture turn round with the playhead.' },
          ] },
      ],
      links: [
        { from: 'playlist', to: 'hls', label: 'file names',
          note: 'Under a kilobyte of text, listing the files and how long each one runs. The '
              + 'player turns that list into a duration it can seek inside before a single '
              + 'frame is fetched.' },
        { from: 'segs', to: 'hls', label: '4s of video',
          note: 'Ordinary HTTP GETs, one per file, and only for the part of the show being '
              + 'watched. Seeking to the end of a 190 second recording fetches one file '
              + 'rather than 48.' },
        { from: 'hls', to: 'video',
          note: 'Bytes appended below JavaScript, which is why a locked phone keeps playing: '
              + 'nothing on the page runs between one frame and the next.' },
        { from: 'video', to: 'clock',
          note: 'Where the picture has actually got to, read from **timeupdate** four times a '
              + 'second and from **requestVideoFrameCallback** once per presented frame. The '
              + '**timeline** is bent onto it and never the other way round.' },
        // NO ARROW FROM `cue log` TO `timeline`: `createDiagram` refused it on
        // `cuts` in both orderings, and its note carries what it would have said.
      ],
  }));

  /** The loop, pressed the way a finger presses it, around the first cue. */
  async function gradeLoop() {
    const cap = performance.now() + 8000;
    while (video.readyState < 2 && performance.now() < cap) await sleep(100);
    if (video.readyState < 2) {
      return { pass: false, detail: `no picture arrived to loop, readyState ${video.readyState}` };
    }
    const a = CUES[0].offsetMs - LOOP_LEAD_MS;
    const b = a + LOOP_MS;
    command.seek(a); transport.pressLoop();
    command.seek(b); transport.pressLoop();
    if (!transport.loop) return { pass: false, detail: 'the loop did not take' };
    // a seek into a part of the show not buffered yet is a wait, not a failure
    const go = performance.now() + 4000;
    while ((video.currentTime * 1000 < a || video.currentTime * 1000 > b) && performance.now() < go) await sleep(50);
    const from = video.currentTime;
    while (video.currentTime <= from && performance.now() < go) await sleep(50);
    let maxCt = video.currentTime;
    const end = performance.now() + SAMPLE_MS;
    while (performance.now() < end) {
      maxCt = Math.max(maxCt, video.currentTime);
      await sleep(50);
    }
    transport.pressLoop();                     // take it off again
    const ceiling = (b + LOOP_SLACK_MS) / 1000;
    const ran = maxCt - a / 1000;
    // BOTH HALVES, or a picture that never played would pass by standing still
    return {
      pass: ran > 0.4 && maxCt <= ceiling,
      detail: `the picture ran ${ran.toFixed(2)} s from the loop start and reached `
        + `${maxCt.toFixed(2)} s, against a ceiling of ${ceiling.toFixed(2)} s`,
    };
  }

  return {
    show() {
      how.draw();
      // the strip fits the whole show to its width once it has one
      if (!fitted) { fitted = true; requestAnimationFrame(() => strip.strip.fit()); }
    },
    hide() { if (deck.playing?.()) command.pause(); },

    async check({ A }) {
      A('nothing was fetched and no picture was asked for before the first press of play',
        !loaded && !hls && !video.currentSrc, loaded ? 'already attached' : 'the element has no source yet');
      {
        const r = video.getBoundingClientRect();
        const shown = getComputedStyle(say).display !== 'none' && say.textContent.length > 0;
        A('before play the picture box is the recording\'s shape and says what will appear in it',
          shown && Math.abs(r.width / r.height - 16 / 9) < 0.05,
          `${r.width.toFixed(0)} by ${r.height.toFixed(0)}, ${shown ? `"${say.textContent}"` : 'NO WORDS IN THE BOX'}`);
      }
      transport.el.querySelector('.tbar-toggle').click();
      const lp = await gradeLoop();
      A('the picture stays inside the loop', lp.pass, lp.detail);
      A('the words in the box leave once a frame is there',
        video.readyState >= 2 && getComputedStyle(say).display === 'none',
        `readyState ${video.readyState}, words ${getComputedStyle(say).display === 'none' ? 'gone' : 'still showing'}`);
      const toggle = transport.el.querySelector('.tbar-toggle');
      if (transport.playing) toggle.click();
      if (fires.length) {
        const errs = fires.map((f) => Math.abs(f.errMs)).sort((x, y) => x - y);
        const p50 = errs[Math.floor(errs.length * 0.5)];
        A('cues land within 250 ms of the picture', p50 < 250,
          `p50 ${p50.toFixed(0)} ms, worst ${errs[errs.length - 1].toFixed(0)} ms, over ${fires.length} fires of ${fires[0].id}`);
      } else {
        A('cues land within 250 ms of the picture', false, `no cue fired inside a loop laid around ${CUES[0].id}`);
      }
      // the MANIFEST, not the element's readiness, which depends on how fast
      // R2 answered. A second request, made only to grade, so only here.
      let mOk = false, mStatus = 0;
      try { const r = await fetch(ARCHIVE.hls, { cache: 'no-store' }); mStatus = r.status; mOk = r.ok; } catch (e) { log(String(e), 'bad'); }
      A('archive manifest reachable', mOk, `HTTP ${mStatus}, readyState ${video.readyState}`);
      A('media is the transport master', !!master);
      A('deck range is the show length', deck.durationMs === ARCHIVE.durationMs, `${deck.durationMs} ms`);
      A('all eight cues are in the score',
        (deck.reduceAt?.('cue', ARCHIVE.durationMs)?.count ?? 0) === CUES.length,
        `${deck.reduceAt?.('cue', ARCHIVE.durationMs)?.count} of ${CUES.length}`);
      // Both halves are the claim, read off this tab's bar, so a bar that drew nothing
      // cannot pass as one that leaves out a control.
      // See lessons/page-sync.md#sync-35
      const loopBtn = transport.el.querySelector('.tbar-loop');
      const ways = transport.el.querySelectorAll('.tbar-loopgrp .tbar-x').length;
      A('a loop, and no way button, because a picture only runs forwards', !!loopBtn && ways === 0,
        `${loopBtn ? 'LOOP is on the bar' : 'NO LOOP BUTTON AT ALL'}, ${ways} way button(s) beside it`);
      const rateBtns = transport.el.querySelectorAll('.tbar-rates button').length;
      A('no speed picker, because nothing here has a speed to arm',
        transport.lattice === null && rateBtns === 0, `lattice ${JSON.stringify(transport.lattice)}, ${rateBtns} buttons`);
      A('this is the page’s one published transport', window.__demo?.transport === transport,
        window.__demo?.transport === transport ? 'the harness drills this bar' : 'another bar is published');
      // Written out here rather than read off the spec: the bucket the show is
      // fetched from, and the four parts of this tab that play and follow it.
      await how.check(A, ['Cloudflare, R2 bucket', 'playlist, m3u8 text', 'segments, 4s each',
        'Browser, this tab', 'hls.js, MediaSource', 'video, one element', `cue log, ${CUES.length}, in the page`,
        `timeline, ${CUES.length} cues, 1 loop`]);
    },
  };
}
