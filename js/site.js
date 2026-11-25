// LarkOS site: the chord palette, and the Rack converter's controls.
{
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // ------------------------------------------------------- chord palette
  // Written by LarkOS's own harmony code (core/source/mtHarmony.cpp) on a
  // computer: each key's seven chords in the 7th colour, the colours a
  // second press steps through, and each one's notes in close voicing.
  const PALETTE = [
{"key":"C major","slots":[{"roman":"I","cycle":[{"name":"Cmaj7","colour":"7th","notes":[48,52,55,59]},{"name":"Cmaj9","colour":"9th","notes":[48,52,55,59,62]},{"name":"Cmaj13","colour":"13th","notes":[48,52,59,62,69]},{"name":"C","colour":"Triad","notes":[48,52,55]}]},{"roman":"ii","cycle":[{"name":"Dm7","colour":"7th","notes":[50,53,57,60]},{"name":"Dm9","colour":"9th","notes":[50,53,57,60,64]},{"name":"Dm11","colour":"11th","notes":[50,53,57,60,64,67]},{"name":"Dm13","colour":"13th","notes":[50,53,60,64,71]},{"name":"Dm","colour":"Triad","notes":[50,53,57]}]},{"roman":"iii","cycle":[{"name":"Em7","colour":"7th","notes":[52,55,59,62]},{"name":"Em7add11","colour":"11th","notes":[52,55,57,59,62]},{"name":"Em","colour":"Triad","notes":[52,55,59]}]},{"roman":"IV","cycle":[{"name":"Fmaj7","colour":"7th","notes":[53,57,60,64]},{"name":"Fmaj9","colour":"9th","notes":[53,57,60,64,67]},{"name":"Fmaj9#11","colour":"11th","notes":[53,57,60,64,67,71]},{"name":"Fmaj13","colour":"13th","notes":[53,57,64,67,74]},{"name":"F","colour":"Triad","notes":[53,57,60]}]},{"roman":"V","cycle":[{"name":"G7","colour":"7th","notes":[55,59,62,65]},{"name":"G9","colour":"9th","notes":[55,59,62,65,69]},{"name":"G11","colour":"11th","notes":[55,62,65,69,72]},{"name":"G13","colour":"13th","notes":[55,59,65,69,76]},{"name":"G","colour":"Triad","notes":[55,59,62]}]},{"roman":"vi","cycle":[{"name":"Am7","colour":"7th","notes":[57,60,64,67]},{"name":"Am9","colour":"9th","notes":[57,60,64,67,71]},{"name":"Am11","colour":"11th","notes":[57,60,64,67,71,74]},{"name":"Am","colour":"Triad","notes":[57,60,64]}]},{"roman":"viio","cycle":[{"name":"Bm7b5","colour":"7th","notes":[59,62,65,69]},{"name":"Bm11b5","colour":"11th","notes":[47,53,57,62,64]},{"name":"Bdim","colour":"Triad","notes":[59,62,65]}]}]},
{"key":"A minor","slots":[{"roman":"i","cycle":[{"name":"Am7","colour":"7th","notes":[57,60,64,67]},{"name":"Am9","colour":"9th","notes":[57,60,64,67,71]},{"name":"Am11","colour":"11th","notes":[57,60,64,67,71,74]},{"name":"Am","colour":"Triad","notes":[57,60,64]}]},{"roman":"iio","cycle":[{"name":"Bm7b5","colour":"7th","notes":[59,62,65,69]},{"name":"Bm11b5","colour":"11th","notes":[47,53,57,62,64]},{"name":"Bdim","colour":"Triad","notes":[59,62,65]}]},{"roman":"bIII","cycle":[{"name":"Cmaj7","colour":"7th","notes":[48,52,55,59]},{"name":"Cmaj9","colour":"9th","notes":[48,52,55,59,62]},{"name":"Cmaj13","colour":"13th","notes":[48,52,59,62,69]},{"name":"C","colour":"Triad","notes":[48,52,55]}]},{"roman":"iv","cycle":[{"name":"Dm7","colour":"7th","notes":[50,53,57,60]},{"name":"Dm9","colour":"9th","notes":[50,53,57,60,64]},{"name":"Dm11","colour":"11th","notes":[50,53,57,60,64,67]},{"name":"Dm13","colour":"13th","notes":[50,53,60,64,71]},{"name":"Dm","colour":"Triad","notes":[50,53,57]}]},{"roman":"v","cycle":[{"name":"Em7","colour":"7th","notes":[52,55,59,62]},{"name":"Em7add11","colour":"11th","notes":[52,55,57,59,62]},{"name":"Em","colour":"Triad","notes":[52,55,59]}]},{"roman":"bVI","cycle":[{"name":"Fmaj7","colour":"7th","notes":[53,57,60,64]},{"name":"Fmaj9","colour":"9th","notes":[53,57,60,64,67]},{"name":"Fmaj9#11","colour":"11th","notes":[53,57,60,64,67,71]},{"name":"Fmaj13","colour":"13th","notes":[53,57,64,67,74]},{"name":"F","colour":"Triad","notes":[53,57,60]}]},{"roman":"bVII","cycle":[{"name":"G7","colour":"7th","notes":[55,59,62,65]},{"name":"G9","colour":"9th","notes":[55,59,62,65,69]},{"name":"G11","colour":"11th","notes":[55,62,65,69,72]},{"name":"G13","colour":"13th","notes":[55,59,65,69,76]},{"name":"G","colour":"Triad","notes":[55,59,62]}]}]}
];
  const LOW = 45, HIGH = 81; // A2 to A5
  const BLACK = [1, 3, 6, 8, 10];
  const pal = $('#palette');
  const state = { key: 0, slot: -1, step: 0, hear: false };
  let ac = null;

  function roman(r) { return r.replace(/o$/, '°'); }

  function drawKeys(notes) {
    const lit = new Set(notes || []);
    const low = notes && notes.length ? Math.min(...notes) : -1;
    let white = '', black = '', wi = 0;
    for (let n = LOW; n <= HIGH; n++) {
      const isBlack = BLACK.includes(n % 12);
      const cls = lit.has(n) ? (n === low ? ' bass' : ' on') : '';
      if (isBlack) black += `<i class="bk${cls}" style="--x:${wi}"></i>`;
      else { white += `<i class="wk${cls}"></i>`; wi++; }
    }
    $('.keys', pal).style.setProperty('--n', wi);
    $('.keys', pal).innerHTML = `<div class="whites">${white}</div>${black}`;
  }

  function render() {
    const k = PALETTE[state.key];
    $('.buttons', pal).innerHTML = k.slots.map((s, i) =>
      `<button type="button" class="chord${i === state.slot ? ' cur' : ''}" data-i="${i}" aria-pressed="${i === state.slot}">` +
      `<b>${esc(roman(s.roman))}</b><span>${esc(s.cycle[0].name)}</span></button>`).join('');
    const c = state.slot >= 0 ? k.slots[state.slot].cycle[state.step] : null;
    $('#pal-title').textContent = c ? `Chord: ${c.name}` : 'Chords';
    const cyc = c ? k.slots[state.slot].cycle : null;
    $('#pal-colour').textContent = c ? `Colour: ${c.colour}. Next press: ${cyc[(state.step + 1) % cyc.length].colour}.` : 'Press a chord. Press it again for its next colour.';
    drawKeys(c && c.notes);
    pal.querySelectorAll('.keysel button').forEach((b, i) => b.setAttribute('aria-pressed', String(i === state.key)));
  }

  function sound(notes) {
    if (!state.hear || !notes.length) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      const now = ac.currentTime, out = ac.createGain();
      out.gain.value = 0.5 / Math.sqrt(notes.length);
      out.connect(ac.destination);
      notes.forEach((n, i) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'triangle';
        o.frequency.value = 440 * Math.pow(2, (n - 69) / 12);
        const at = now + i * 0.012;
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.9, at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.25, at + 0.5);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);
        o.connect(g); g.connect(out);
        o.start(at); o.stop(at + 1.7);
      });
    } catch (e) { /* no audio here; the keys still light */ }
  }

  if (pal && PALETTE) {
    pal.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.i !== undefined) {
        const i = +b.dataset.i;
        if (i === state.slot) state.step = (state.step + 1) % PALETTE[state.key].slots[i].cycle.length;
        else { state.slot = i; state.step = 0; }
        render();
        sound(PALETTE[state.key].slots[i].cycle[state.step].notes);
        const again = pal.querySelector(`button[data-i="${i}"]`);
        if (again) again.focus();
      } else if (b.dataset.key !== undefined) {
        state.key = +b.dataset.key; state.slot = -1; state.step = 0; render();
      } else if (b.id === 'pal-hear') {
        state.hear = !state.hear;
        b.setAttribute('aria-pressed', String(state.hear));
        b.textContent = state.hear ? 'Hear: on' : 'Hear: off';
      }
    });
    render();
  }

  // ------------------------------------------------------ Rack converter
  const rc = $('#rackconv');
  const NEED = [
    { id: 'rom2', name: 'jv880_rom2.bin', size: 0x40000 },
    { id: 'wave1', name: 'jv880_waverom1.bin', size: 0x200000 },
    { id: 'wave2', name: 'jv880_waverom2.bin', size: 0x200000 },
  ];
  const have = {};
  let zip = null;
  const dlCap = (window.claude && typeof window.claude.use === 'function') ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);

  function kb(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB'; }

  function showFiles() {
    $('#rc-files').innerHTML = NEED.map((r) => {
      const f = have[r.id];
      return `<li class="${f ? 'ok' : ''}"><span class="mark" aria-hidden="true"></span><code>${r.name}</code>` +
        `<span class="st">${f ? (f.name.toLowerCase() === r.name ? 'found' : 'found as ' + esc(f.name)) + ', ' + kb(f.size) : 'not chosen yet'}</span></li>`;
    }).join('');
    $('#rc-go').disabled = !NEED.every((r) => have[r.id]);
  }

  function say(msg, bad) {
    const m = $('#rc-msg');
    m.textContent = msg;
    m.classList.toggle('bad', !!bad);
  }

  function take(list) {
    const files = [...list];
    const spare = [];
    for (const f of files) {
      const hit = NEED.find((r) => f.name.toLowerCase() === r.name);
      if (hit) have[hit.id] = f; else spare.push(f);
    }
    // Files renamed on the way: go by size. Two 2 MB files can be either
    // way round; the conversion tries the other order if the first fails.
    for (const f of spare) {
      if (f.size === 0x40000 && !have.rom2) have.rom2 = f;
      else if (f.size === 0x200000 && !have.wave1) have.wave1 = f;
      else if (f.size === 0x200000 && !have.wave2) have.wave2 = f;
    }
    zip = null;
    $('#rc-save').hidden = true;
    showFiles();
    const missing = NEED.filter((r) => !have[r.id]).map((r) => r.name);
    if (missing.length) say(missing.length === 3 ? 'None of those look like JV-880 ROMs. The three files are named below.' : 'Still needed: ' + missing.join(', ') + '.', false);
    else say('All three are here. Nothing has been read yet.', false);
  }

  function progress(v, text) {
    $('#rc-bar').style.setProperty('--p', Math.round(v * 1000) / 10 + '%');
    $('#rc-bar').setAttribute('aria-valuenow', String(Math.round(v * 100)));
    if (text) say(text);
  }

  async function run() {
    const go = $('#rc-go');
    go.disabled = true;
    $('#rc-save').hidden = true;
    rc.classList.add('busy');
    try {
      const [a, b, c] = await Promise.all([have.rom2, have.wave1, have.wave2].map((f) => f.arrayBuffer()));
      const opts = { larkos: $('#rc-larkos').checked };
      let res;
      try {
        res = await window.RackConvert.convert({ rom2: new Uint8Array(a), wave1: new Uint8Array(b), wave2: new Uint8Array(c) }, progress, opts);
      } catch (e) {
        if (!/unscramble/.test(e.message)) throw e;
        res = await window.RackConvert.convert({ rom2: new Uint8Array(a), wave1: new Uint8Array(c), wave2: new Uint8Array(b) }, progress, opts);
      }
      zip = new Blob(res.parts, { type: 'application/zip' });
      say(`Done: ${res.waves} waves (${(res.waveBytes / 1048576).toFixed(1)} MB) and ${res.patches + res.larkos} patches, in one ${kb(res.bytes)} zip.` + (res.skipped.length ? ' Skipped: ' + res.skipped.join(', ') + '.' : ''));
      $('#rc-save').hidden = false;
      $('#rc-save').focus();
    } catch (e) {
      progress(0);
      say(e && e.message ? e.message : 'The conversion stopped. Check the three files and try again.', true);
    } finally {
      rc.classList.remove('busy');
      go.disabled = !NEED.every((r) => have[r.id]);
    }
  }

  async function save() {
    if (!zip) return;
    const name = 'LarkOS-Rack-card.zip';
    const cap = await dlCap;
    if (cap) {
      try { await cap.save({ filename: name, data: zip }); say('Saved. Unzip it and copy its System folder onto the card.'); }
      catch (e) { say(e && e.code === 'declined' ? 'Not saved. Press Save again when you want it.' : 'This view can’t save files. Open the page in a browser to save the zip.', e && e.code !== 'declined'); }
      return;
    }
    const url = URL.createObjectURL(zip), a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    say('Saved as ' + name + '. Unzip it and copy its System folder onto the card.');
  }

  if (rc && window.RackConvert) {
    const input = $('#rc-input'), drop = $('#rc-drop');
    input.addEventListener('change', () => { take(input.files); input.value = ''; });
    ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files.length) take(e.dataTransfer.files); });
    $('#rc-go').addEventListener('click', run);
    $('#rc-save').addEventListener('click', save);
    showFiles();
  }
}
