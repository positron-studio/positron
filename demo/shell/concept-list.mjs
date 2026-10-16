// demo/shell/concept-list.mjs: every concept page in teaching order; the front page's cards and the
// pagers read it. `id` is `<group>/<slug>`, folder and URL; the slug is one plain lowercase word,
// unique in its group, never the group's name. `group` sets the card heading when it is not the folder.
// why: lessons/kit-concept-list.md#header
export const CONCEPTS = [
  // Patch from words is off the index; the page stays at /room/words/.
  // why: lessons/kit-concept-list.md#words
  { id: 'synth/keyboard', title: 'Keyboard', say: 'Play a sine synthesizer from the on-screen keys or a MIDI keyboard plugged into this computer.' },
  { id: 'synth/recorder', title: 'Recorder', say: 'Record what you play and play it back, every note in a table with its time, velocity and length.' },
  { id: 'synth/timeline', title: 'Timeline', say: 'The same recorder drawn on a timeline, so a take shows as notes in time and plays from its start.' },
  // why: lessons/kit-concept-list.md#synth-040
  { id: 'synth/sound', title: 'Sound design', say: 'One voice from the keys through a filter, an envelope and an LFO, every knob on a wire of its own.' },
  // why: lessons/kit-concept-list.md#envelope-lfo
  { id: 'code/faust', title: 'Faust synth', say: 'A Faust synth voice compiled in this tab on your first key, with a knob for each of its parameters.' },
  { id: 'code/collide', title: 'Collide synth', say: 'Play a small SuperCollider program from the keys and edit its code, recompiled when you stop typing.' },
  { id: 'code/wish', group: 'wish', title: 'Sound wish', say: 'Type or say a wish for a sound and a model writes it in SuperCollider. Play it from the keys.' },
  // why: lessons/kit-concept-list.md#plaits
  { id: 'code/plaits', title: 'Plaits', say: 'The same Plaits voice played from the keys or a MIDI keyboard, with all ten controls as knobs.' },
  // A row's `group` sets the heading it shows under; its folder and URL stay where they are.
  // why: lessons/kit-concept-list.md#group-headings
  { id: 'code/piano', title: 'Piano and Rhodes', say: 'A grand piano and a Rhodes on SuperCollider, looped by the sustain pedal with no tempo and no grid.' },
  // why: lessons/kit-concept-list.md#dots
  { id: 'synth/dots', title: 'Dot piano', say: 'Each note draws an arc on a ring, by a shader in this tab and by C firmware on an emulated Pico.' },
  { id: 'granulator/grains', title: 'Granulator', say: 'Our radio recordings granulated in this tab, each grain marked on the wave where it read the sound.' },
  // why: lessons/kit-concept-list.md#beat
  { id: 'granulator/beat', title: 'Beat granulator', say: 'The Ida recording granulated on Dub, its echo and grains put on the beat a tempo detector hears.' },
  // remote: every concept page that plays on the Raspberry Pi.
  // why: lessons/kit-concept-list.md#remote
  { id: 'remote/circuit', title: 'Circuit on Pi', say: 'A Novation Circuit in another building, played from here through its Pi. Keys, MIDI and 8 macros.' },
  { id: 'remote/collide', title: 'Collide on Pi', say: 'SuperCollider here and on a Pi in another building at once. Crossfade between the two.' },
  { id: 'remote/piano', title: 'Piano and Rhodes on Pi', say: 'A piano and a Rhodes on a Pi in another building, played from here over the relay or direct.' },
  { id: 'remote/plaits', title: 'Plaits on Pi', say: "Emilie Gillet's Plaits running on a Pi in another building. Play it and turn its knobs from here." },
  { id: 'devices/text', title: 'Text on Pi screen', say: 'Type a line and it shows on a small screen on the Pi. Its four keys show up here.' },
  { id: 'devices/dots', title: 'Dots on Pi screen', say: 'A short score plays as rings of dots on the Pi\'s small screen, the dot piano of the Pico.' },
  { id: 'devices/patches', title: 'Patches on Pi screen', say: 'Small patches drawn as the Pi\'s screen shows them. Send one to the Pi to check it.' },
  { id: 'devices/drums', title: 'Drums on Pi', say: 'The Pi\'s sequencer plays its own drums out of its PWM output. Its keys edit the steps.' },
  { id: 'devices/beat', title: 'Circuit drums from Pi', say: 'The Pi\'s sequencer plays the Circuit\'s drums. Its keys edit the steps.' },
  { id: 'devices/camera', title: 'Camera on Pi screen', say: 'The Pi\'s camera plays in one bit dots on its small screen and here. It needs the camera key.' },
  { id: 'devices/keys', title: 'Keyboard to Circuit on Pi', say: 'The keyboard on the Pi plays the Circuit\'s synth 1 or 2. The Pi keeps the link when the tab closes.' },
  { id: 'devices/synth', title: 'Keyboard to Pi synth', say: 'The keyboard on the Pi plays Plaits on the Pi, heard from the Pi\'s PWM output.' },
  { id: 'devices/circuit', title: 'Circuit drums on Pi', say: 'The Circuit\'s drums play SuperCollider drums on the Pi, heard here. The Pi\'s screen draws them.' },
  { id: 'devices/pico', title: 'Pico on Wi-Fi', say: 'A Pico on Wi-Fi joins the Pi\'s room. Its button, light and temperature link to this tab.' },
  { id: 'devices/split', title: 'Split screen', say: 'Drums, a scope and a status line share the Pi\'s small screen. Its keys move between them.' },
  { id: 'devices/control', title: 'Pi screens', say: 'The Pi\'s screens, full or two halves at once. Up and down switch them.' },
  { id: 'devices/knobs', title: 'Circuit on Pi screen', say: 'The Circuit\'s knobs over its drum grid on the Pi\'s small screen, simulated.' },
  { id: 'devices/hdmi', title: 'Pi HDMI screen', say: 'The Pi\'s camera or a test pattern full screen on its HDMI, drawn by the GPU.' },
  // why: lessons/kit-concept-list.md#draw
  { id: 'radio/blend', title: 'Blend', say: 'Listen to Vikerraadio and Ida Radio Tallinn live and blend between them on a crossfader.' },
  { id: 'radio/tuner', title: 'Tuner', say: 'Turn one dial across four live stations, as on an old AM set, with noise and a whistle in between.' },
  { id: 'radio/tempo', title: 'Tempo', say: 'Find the tempo of recordings of Raadio 2, Raadio 4 and Ida, with the beats it hears on the wave.' },
  { id: 'radio/live', title: 'Live tempo', say: 'The same tempo detector on Raadio 2, Raadio 4 or Ida live, one station at a time through our relay.' },
  { id: 'radio/key', title: 'Live key', say: 'Hear a live station, see the key a detector finds in it lit on a keyboard, and play along in it.' },
  { id: 'radio/cast', title: 'Väin cast', say: 'Väin\'s archive played live into an Icecast channel from Cloudflare.' },
  { id: 'radio/scenery', title: 'Radio landscape', say: 'Live radio, granulated, blends slowly from station to station through tuning noise. The waves rise.' },
  // why: lessons/kit-concept-list.md#clock
  { id: 'video/camera', title: 'Camera', say: 'Turn on your camera and see it on the page while the patchbay holds the link from camera to screen.' },
  { id: 'video/shader', title: 'Camera shader', say: 'Your camera beside itself through a two tone dither shader, with one knob for how coarse it is.' },
  { id: 'video/recorder', title: 'Camera recorder', say: 'Record up to ten seconds of your camera and play it back on a timeline, kept in this browser.' },
  { id: 'video/webrtc', title: 'WebRTC loopback', say: 'Your camera over WebRTC to Cloudflare Stream and back beside the original, with the delay timed.' },
  // Not 040: /archive/ labels the archived TV page `video 040`.
  // why: lessons/kit-concept-list.md#llhls
  { id: 'video/llhls', title: 'LL-HLS loopback', say: 'Your camera to Cloudflare Stream and back as LL-HLS beside the original, with the delay timed.' },
  { id: 'video/moq', title: 'MoQ loopback', say: 'Your camera over MoQ to Cloudflare\'s relay and back beside the original, with the delay timed.' },
  // why: lessons/kit-concept-list.md#tv
  { id: 'shader/mirror', title: 'Mirror shader', say: 'A kaleidoscope shader with one knob for its mirrors, and code that recompiles as you edit.' },
  // shader/020 and not 010: 010's old address 404s on purpose, so it is not reused for a different page.
  { id: 'shader/landscape', title: 'Scan landscape', say: 'A radio recording drawn as a scan landscape. Six knobs shape the ridges.' },
  // why: lessons/kit-concept-list.md#shader-remote
  { id: 'shader/remote', title: 'Shader on Pi', say: 'A kaleidoscope shader here and on a Pi in another building, each change timed to its first frame.' },
  { id: 'shader/wish', group: 'wish', title: 'Picture wish', say: 'Type or say a wish for a picture and a model writes its shader. The code stays in the box to edit.' },
  // why: lessons/kit-concept-list.md#pico
  { id: 'room/chat', title: 'Chat', say: 'A chat window whose every line crosses the room along a patchbay link, drawn underneath.' },
  // why: lessons/kit-concept-list.md#room-chat
  { id: 'room/broadcast', title: 'Broadcast chat', say: 'Whoever joins first is admin and broadcasts in a column of their own while the rest chat beside.' },
  { id: 'room/history', title: 'Chat timeline', say: 'The broadcast chat with a memory: until you join, the room\'s last fifty lines replay at their pace.' },
  // why: lessons/kit-concept-list.md#room-history
  { id: 'typist/paper', title: 'Paper', say: 'A sheet of white paper to type on, with a blocky cursor and a page that opens full screen.' },
  { id: 'typist/typewriter', title: 'Typewriter', say: 'The same paper, now sounding like a Hermes Precisa 305 typewriter, bell and all.' },
  { id: 'typist/machines', title: 'Typewriters', say: 'The typewriter through an effects box where every number gives a different machine.' },
  { id: 'typist/playback', title: 'Playback', say: 'Everything you type, deletions included, is kept and played back as the page writes itself again.' },
  { id: 'typist/score', title: 'Multi typer', say: 'Up to six papers typed at once from a written score, each through a typewriter of its own.' },
  // why: lessons/kit-concept-list.md#sampler
  { id: 'drums/machine', title: 'Drum machine', say: 'Four SuperCollider drums on 16 steps, each on a patchbay wire that silences it when taken away.' },
  { id: 'drums/knobs', title: 'Drum knobs', say: 'The same drum machine with a knob and a waveform for each drum, heard from the next hit.' },
  { id: 'drums/samples', title: 'Sample drums', say: 'Drop a Circuit pack or WAVs and each sample becomes a named row. Drag across the grid to draw hits.' },
  // why: lessons/kit-concept-list.md#rhythm-030
  { id: 'drums/camera', title: 'Camera drums', say: 'Point your camera and its picture plays as a 16 by 9 drum pattern, where brighter areas play busier.' },
  // why: lessons/kit-concept-list.md#drums-remote
  { id: 'drums/remote', title: 'Drums on the Pi', say: 'One drum pattern here and on a Pi in another building at the same moment. Crossfade the two.' },
  // archives: /reel/ with the newsreel and the radio as two boxes, on /reel/'s line.
  // why: lessons/kit-concept-list.md#archives
  { id: 'history/newsreels', group: 'archives', title: 'Newsreels', say: 'ERR\'s 1965 newsreels on a line, each silent film played with that day\'s surviving radio.' },
  // misc has no concept page left.
  // why: lessons/kit-concept-list.md#misc
];

// The folders under demo/ that hold concept pages, the first URL segment. workers/view/build.mjs
// refuses a build where one is also a demo slug or a listed file, or a row names a folder not here.
// why: lessons/kit-concept-list.md#concept-dirs
export const CONCEPT_DIRS = ['synth', 'code', 'granulator', 'remote', 'devices', 'radio', 'video', 'shader', 'room', 'typist', 'drums', 'history'];

// The demos on the front page: every listed, built manifest row once, under a group. A concept group
// draws it as a demo card, CASE_GROUPS as a use case card. Kept out of CONCEPTS so the pager skips it.
// `supersededBy: '<group>/<slug>'` labels its card `not needed`, naming that page.
// why: lessons/kit-concept-list.md#concept-groups
export const CONCEPT_GROUPS = ['wish', 'synth', 'code', 'granulator', 'remote', 'devices', 'drums', 'radio', 'video', 'shader', 'typist', 'sampler', 'archives', 'room'];
// A group's heading on the front page is its key unless it is named here.
// why: lessons/kit-concept-list.md#group-titles
export const GROUP_TITLES = { archives: 'history', synth: 'building instruments', code: 'instruments in code', remote: 'remote instruments', performances: 'timelines' };
export const CASE_GROUPS = ['archives', 'performances', 'stations', 'instruments'];
export const DEMO_CARDS = {
  // kit: its own heading, last.
  // why: lessons/kit-concept-list.md#kit
  kit: { group: 'kit', plain: true, title: 'Kit', say: 'Every part these pages are built from, one page per part.' },
  connect: { group: 'wish', plain: true, title: 'Connect', say: 'Link the site\'s parts port to port. A part that can run here appears once it is linked.' },
  social: { group: 'kit', plain: true, title: 'Social', say: 'Pictures and reels the site makes of itself. Download one and post it.' },
  // concept like rows first, then use cases; archived rows are listed on /archive/.
  // why: lessons/kit-concept-list.md#archived-rows
  held: { group: 'performances', say: 'Held in Human, a 2024 mixed reality piece, played back from its own score across its eight scenes.' },
  // why: lessons/kit-concept-list.md#archived-cases
};
