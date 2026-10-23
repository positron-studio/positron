// demo/shell/presence.mjs: is the thing on the other end there? Four states:
// unknown, coming, online, offline. `presenceOf` is the pure policy; call `seen()`
// when a message arrives (your clock, never the sender's `at`).
// why: lessons/kit-presence.md#header

/** The four, most-present first. The order is the one the kit shows them in. */
export const PRESENCE_STATES = ['online', 'checking', 'coming', 'offline', 'unknown'];

/**
 * What a visitor reads. Plain words, no jargon, and none of them is a
 * mechanism: a person who has never heard of a heartbeat can read all four.
 * A page may shorten them (`says: { coming: 'starting' }`), which also shortens
 * the badge, because the reserved width is measured off whatever it can say.
 */
export const SAYS = {
  online: 'online',
  /**
   * `checking` is us asking about a thing probably there; `coming` is it starting up.
   * Colour says what is known, motion says something is happening.
   * why: lessons/kit-presence.md#says-checking
   */
  checking: 'checking',
  coming: 'coming online',
  offline: 'offline',
  // why: lessons/kit-presence.md#says-unknown
  unknown: 'unknown',
};

/**
 * Words for an instrument on a cable: connected, connecting, not connected.
 * unknown and offline share words, so the hollow dot carries the difference.
 * One shared map so USB pages cannot drift apart; relay pages keep SAYS.
 * why: lessons/kit-presence.md#wired
 */
export const WIRED = {
  online: 'connected',
  checking: 'connecting',
  coming: 'connecting',
  offline: 'not connected',
  unknown: 'not connected',
};

/**
 * Words for a stream: stream off, starting, on. checking also reads starting,
 * and unknown and offline both read stream off.
 * why: lessons/kit-presence.md#stream
 */
export const STREAM = {
  online: 'on',
  checking: 'starting',
  coming: 'starting',
  offline: 'stream off',
  unknown: 'stream off',
};
/**
 * The STREAM words with the transport's own name in them. The badge uppercases by CSS.
 * why: lessons/kit-presence.md#stream-says
 */
export const streamSays = (name) => ({
  online: `${name} on`,
  checking: 'starting',
  coming: 'starting',
  offline: `${name} off`,
  unknown: `${name} off`,
});
/**
 * Which of those a live stream badge can reach, which is what its width is
 * measured on. The same pairing `transport-views.mjs` uses for `ON_AIR_CAN`.
 */
export const STREAM_CAN = ['offline', 'coming', 'online'];

/**
 * Words for a camera. starting covers the permission prompt and the legs coming up.
 * why: lessons/kit-presence.md#camera
 */
export const CAMERA = {
  online: 'camera on',
  checking: 'starting',
  coming: 'starting',
  offline: 'camera off',
  unknown: 'camera off',
};
export const CAMERA_CAN = ['offline', 'coming', 'online'];

/** How many expected beats may be missed before it is called gone. */
export const MISSES = 2;

/**
 * One of `PRESENCE_STATES`, from a last-seen time and the interval the thing
 * promised to speak on. Pure: no clock, no DOM, no socket.
 *
 * @param {object}  o
 * @param {number}  o.now          this moment, in ms, from the same clock as the rest
 * @param {number}  o.everyMs      how often it is expected to speak. REQUIRED
 * @param {?number} o.lastSeenAt   when it last spoke, or null if never
 * @param {number}  o.misses       beats it may miss before it is called gone
 * @param {?number} o.since        when this page started listening, or null
 * @param {?number} o.comingSince  when a deliberate start began, or null
 * @param {?number} o.comingMs     how long that start is allowed to take, null for no limit
 */
export function presenceOf({
  now,
  everyMs,
  lastSeenAt = null,
  misses = MISSES,
  since = null,
  comingSince = null,
  comingMs = null,
} = {}) {
  if (!Number.isFinite(now)) {
    throw new Error('presence: `now` must be a time in ms. Pass Date.now().');
  }
  /**
   * No default for `everyMs`: a wrong guess flickers working hardware offline.
   * Only the page knows the interval, so a missing one throws on the first call.
   * why: lessons/kit-presence.md#no-default-every
   */
  if (!Number.isFinite(everyMs) || everyMs <= 0) {
    throw new Error('presence: `everyMs` must say how often the thing speaks, in ms '
      + '(the board beats every 5000). There is no safe default for it.');
  }
  if (!Number.isFinite(misses) || misses < 1) {
    throw new Error('presence: `misses` must be at least 1. Zero would call it gone '
      + 'the instant a beat is due, and a beat is never exactly on time.');
  }

  const window = misses * everyMs;

  // Heard from the future: two clocks, not one measurement. See the header.
  if (lastSeenAt != null && lastSeenAt > now) return 'unknown';

  if (lastSeenAt != null && now - lastSeenAt < window) return 'online';

  /**
   * `coming` loses to online and beats both greys, since a board synth takes 10 to 40 s.
   * It may expire after `comingMs`; null means the page clears it itself.
   * why: lessons/kit-presence.md#coming
   */
  const starting = comingSince != null && comingSince <= now
    && (comingMs == null || now - comingSince < comingMs);
  if (starting) return 'coming';

  // It spoke once and has stopped. This is a measurement, so it is grey INK
  // rather than grey absence: see the note on the two greys in shell.css.
  if (lastSeenAt != null) return 'offline';

  // Never heard, but listened for long enough that silence is an answer.
  if (since != null && now - since >= window) return 'offline';

  // Never heard, and not yet listened for long enough to say anything at all.
  return 'unknown';
}

/**
 * The same four words read off a WebSocket (`openWire`'s state and stats).
 * A socket and the thing behind it are two badges. A closed socket is offline
 * even with a retry pending; the retry turns it to coming within 300 ms.
 * why: lessons/kit-presence.md#wire-presence
 */
export function wirePresence({ ready = null, refusal = null, reconnects = 0 } = {}) {
  if (ready == null) return { state: 'unknown', why: 'no socket has been opened' };
  if (ready === 0) {
    return { state: 'coming', why: reconnects > 0 ? 'the socket is coming back' : 'the socket is opening' };
  }
  if (ready === 1) return { state: 'online', why: null };
  if (ready === 2) return { state: 'offline', why: 'the socket is closing' };
  if (ready === 3) return { state: 'offline', why: refusal };
  throw new Error(`presence: readyState ${ready} is not one of 0, 1, 2, 3. `
    + 'Pass `wire.state()`, which answers exactly those.');
}

/**
 * A badge, or a dot that clips its words so screen readers still hear them.
 * Never changes size: only opacity animates, and the word's min-width is reserved
 * in `ch` for the longest phrase. No letter-spacing, or it overflows that reserve.
 * why: lessons/kit-presence.md#create-presence
 */
export function createPresence({
  of = '',
  mode = 'badge',
  says = {},
  state = 'unknown',
  /**
   * The states this badge can show; the reserve is the longest of them, so a fixed
   * specimen passing its one state sits at its own width.
   * why: lessons/kit-presence.md#can
   */
  can = null,
  /**
   * Who is driving the instrument, refining `online` rather than a new state.
   * The reserve covers these words too, so the badge cannot twitch.
   * why: lessons/kit-presence.md#busy-words
   */
  busyWords = null,
  /**
   * Which kind is driving at build, for a fixed specimen; `busy()` fades for 90 ms
   * and a check reading inside that trough sees the old word.
   * why: lessons/kit-presence.md#busy-at-build
   */
  busy = null,
  why = null,
  showName = null,
  onChange = null,
} = {}) {
  if (mode !== 'badge' && mode !== 'dot') {
    throw new Error(`presence: mode is 'badge' or 'dot', not ${JSON.stringify(mode)}.`);
  }
  const words = { ...SAYS, ...says };
  for (const s of PRESENCE_STATES) {
    if (typeof words[s] !== 'string' || !words[s]) {
      throw new Error(`presence: there is no word for "${s}". Every state a badge can reach needs one.`);
    }
    if (words[s].includes('—')) {
      throw new Error(`presence: "${words[s]}" carries an em dash, and this is read by a visitor.`);
    }
  }
  const named = showName == null ? (mode === 'badge' && !!of) : (showName && !!of);

  const root = document.createElement('span');
  root.className = 'pos-pres';
  root.dataset.mode = mode;
  // `status` + polite: a change is announced once, when it happens. It changes
  // on a transition and never on a tick, so this is not a thing that talks over
  // somebody sixty times a second.
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');

  /**
   * The dot leads: after the word it would park at the end of the reserved width.
   * why: lessons/kit-presence.md#dot-leads
   */
  const dot = document.createElement('i');
  dot.className = 'pos-pres-dot';
  dot.setAttribute('aria-hidden', 'true');

  /**
   * Name and state are one string with one fade; the reserve covers the whole phrase,
   * and it carries no letter-spacing.
   * why: lessons/kit-presence.md#one-phrase
   */
  const word = document.createElement('span');
  word.className = 'pos-pres-w';
  // The reserve. Whatever this instance can say, at its longest, in characters
  // of its own monospace face. A page that shortens the words gets a shorter
  // badge for free, and a page that lengthens one cannot make the badge twitch.
  const reach = Array.isArray(can) && can.length ? can.filter((x) => PRESENCE_STATES.includes(x)) : PRESENCE_STATES;
  const busySay = busyWords && typeof busyWords === 'object' ? busyWords : null;
  if (busySay) {
    for (const [k, v] of Object.entries(busySay)) {
      if (typeof v !== 'string' || !v) throw new Error(`presence: busyWords.${k} must be a word.`);
      if (v.includes('—')) throw new Error(`presence: "${v}" carries an em dash, and this is read by a visitor.`);
    }
  }
  // `busy` names which kind of client is driving, or null; only changes the word while
  // online. data-busy is set at build too, since the stylesheet greys off it.
  // why: lessons/kit-presence.md#busy-attr
  let busyKind = busy || null;
  const wordFor = (x) => (x === 'online' && busyKind && busySay?.[busyKind]) || words[x];
  const phrase = (x) => (named ? `${of} ${wordFor(x)}` : wordFor(x));
  // The reserve includes the busy variants, or the badge grows when somebody else drives.
  // why: lessons/kit-presence.md#reserve-busy
  const widest = Math.max(...reach.map((x) => phrase(x).length),
    ...(busySay && reach.includes('online')
      ? Object.values(busySay).map((w) => (named ? `${of} ${w}`.length : w.length))
      : [0]));
  word.style.setProperty('--pres-ch', String(widest));
  if (busyKind) root.dataset.busy = busyKind;
  root.append(dot, word);

  let now = null, note = null;
  let timer = null, f = null;
  // A question is out. It outranks a derived `unknown` and nothing else: the
  // moment anything actually answers, what it said is the better fact.
  let asking = false;

  // Two lines, not a middot: the phrase, then the detail on its own line (`\n` breaks a title).
  // why: lessons/kit-presence.md#title
  function title() {
    const base = of ? `${of} ${wordFor(now)}` : wordFor(now);
    return note ? `${base}\n${note}` : base;
  }

  /**
   * A state change fades the word out and in, 90 ms each way, swapped at the trough
   * inside the reserve. The live region announces it either way.
   * why: lessons/kit-presence.md#word-fade
   */
  const WORD_FADE_MS = 90;
  let fading = null, fadingTo = null;

  function paint() {
    root.dataset.state = now;
    root.title = title();
    const next = phrase(now);
    if (word.textContent === next) return;
    /**
     * A fade already heading to this word is not restarted: `seen()` at 50 Hz would
     * keep the badge blank for as long as frames arrive.
     * why: lessons/kit-presence.md#fade-not-restarted
     */
    if (fadingTo === next) return;
    // First paint, or a browser that says no: swap it and say nothing more.
    if (!word.textContent || matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      word.textContent = next;
      return;
    }
    clearTimeout(fading);
    fadingTo = next;
    word.style.opacity = '0';
    fading = setTimeout(() => {
      word.textContent = next;
      word.style.opacity = '';
      fadingTo = null;
    }, WORD_FADE_MS);
  }

  function set(next, reason = null) {
    if (!PRESENCE_STATES.includes(next)) {
      throw new Error(`presence: "${next}" is not one of ${PRESENCE_STATES.join(', ')}.`);
    }
    const changed = next !== now || (reason ?? null) !== note;
    now = next;
    note = reason ?? null;
    paint();
    // Only on a real change: a callback per tick is a log line per tick, which
    // is the "slop log" this project already has a rule about.
    if (changed && onChange) onChange(now, note);
    return api;
  }

  function derive() {
    const d = presenceOf({ now: Date.now(), ...f });
    // Only over unknown: never hide a live heartbeat or erase a measured silence.
    // why: lessons/kit-presence.md#asking
    set(asking && d === 'unknown' ? 'checking' : d, f.why);
  }

  const api = {
    el: root,
    set,
    state: () => now,
    why: () => note,
    says: (s = now) => words[s],
    /** The reserved width, in characters. Handy in a check. */
    reserve: () => widest,

    /**
     * Derive the state from a heartbeat instead of being told it.
     *
     * Idempotent: calling it again replaces the rule and the timer. It derives
     * ONCE before starting the timer, so a bad `everyMs` throws here rather
     * than inside an interval where nothing would ever see it.
     */
    follow(opts = {}) {
      api.stop();
      f = {
        everyMs: opts.everyMs,
        misses: opts.misses ?? MISSES,
        comingMs: opts.comingMs ?? null,
        since: opts.since === undefined ? Date.now() : opts.since,
        lastSeenAt: opts.lastSeenAt ?? null,
        comingSince: opts.comingSince ?? null,
        why: opts.why ?? null,
      };
      derive();
      // Fast enough that "gone" is noticed within a second of the deadline,
      // slow enough that nothing is doing arithmetic at frame rate.
      const tick = Math.min(1000, Math.max(200, f.everyMs / 4));
      timer = setInterval(derive, tick);
      return api;
    },

    /**
     * It spoke. Stamp it with YOUR clock, at the moment it arrived.
     * Cheap: called 50 times a second, it derives only when the answer could change.
     * why: lessons/kit-presence.md#seen
     */
    seen(at = Date.now()) {
      if (!f) throw new Error('presence: seen() needs follow() first, which is where the heartbeat interval is.');
      const wasComing = f.comingSince != null;
      f.lastSeenAt = at;
      f.comingSince = null;             // it is here; it is not on its way any more
      if (now !== 'online' || wasComing) derive();
      return api;
    },

    /** A deliberate start began, or ended without arriving. */
    /** A question is out and no answer has come back. Grey, and moving. */
    checking(on = true) {
      asking = !!on;
      derive();
      return api;
    },

    coming(on = true, at = Date.now()) {
      if (!f) throw new Error('presence: coming() needs follow() first.');
      f.comingSince = on ? at : null;
      derive();
      return api;
    },

    /**
     * Somebody else is driving the thing this badge is about, or nobody is.
     * `kind` is a key of `busyWords`, or null. Never touches presence.
     * why: lessons/kit-presence.md#busy
     */
    busy(kind = null) {
      const next = kind && busySay?.[kind] ? kind : null;
      if (next === busyKind) return api;
      busyKind = next;
      root.dataset.busy = next || '';
      paint();
      return api;
    },

    /** Which kind is driving, or null. */
    get driver() { return busyKind; },

    /** A standing reason, kept across ticks. `wirePresence`'s `why` goes here. */
    because(text) {
      if (f) f.why = text ?? null;
      else note = text ?? null;
      if (f) derive(); else paint();
      return api;
    },

    stop() {
      if (timer != null) { clearInterval(timer); timer = null; }
      return api;
    },
  };

  set(state, why);
  return api;
}

/**
 * A primary-row control whose face is the status. It stays a press (nothing opens on
 * a visit) and lives in `.pos-controls`, where demo/verify.mjs presses.
 * Returns the presence api with `el` the button and `badge` the badge inside.
 * why: lessons/kit-presence.md#presence-button
 */
export function createPresenceButton({ of = '', press = () => {}, aria = '', badge: given = null, ...rest } = {}) {
  // `badge` wraps a badge something else already drives, so one fact has one copy.
  // why: lessons/kit-presence.md#wrap-badge
  const badge = given || createPresence({ of, mode: 'badge', ...rest });
  const b = document.createElement('button');
  b.type = 'button';
  // Secondary, not primary: checking an instrument is not the page's main action.
  // why: lessons/kit-presence.md#secondary
  b.className = 'pos-presence-btn';
  b.dataset.id = 'presence';
  b.append(badge.el);
  b.addEventListener('click', () => press());
  // The badge keeps its own live region. The button names the action, and a caller
  // may name its own when the press switches something rather than checks it.
  // why: lessons/kit-presence.md#aria-label
  b.setAttribute('aria-label', aria || `check whether ${of || 'it'} is there`);
  let this_;
  // Delegated, not spread: `{ ...badge }` would freeze getters like `driver`.
  // why: lessons/kit-presence.md#delegated
  this_ = {
    el: b, button: b, badge: badge.el,
    set: (...a) => { badge.set(...a); return this_; },
    busy: (...a) => { badge.busy(...a); return this_; },
    because: (...a) => { badge.because(...a); return this_; },
    stop: () => { badge.stop(); return this_; },
    get state() { return badge.state; },
    get driver() { return badge.driver; },
  };
  return this_;
}
