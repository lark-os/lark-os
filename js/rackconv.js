/* rackconv.js -- LarkOS Rack: JV-880 ROMs to card files, in the browser.
 *
 * A line-for-line port of synth-plugin-sdk/engines/rack/tools/rack_convert.py
 * and rack_larkos.py. It reads the three ROM files the person picks, and
 * returns a zip laid out like the card: System/Synths/Samples/RACK (129 waves)
 * and System/Synths/Patches/RACK (192 converted patches, plus bank L).
 * Nothing leaves the page: there is no network code in here.
 *
 * Checked against the Python scripts byte for byte (tools/check_rackconv.js).
 */
(function (root) {
  "use strict";

  // ---------------------------------------------------------------- layout
  var AA = [2, 0, 3, 4, 1, 9, 13, 10, 18, 17, 6, 15, 11, 16, 8, 5, 12, 7, 14, 19];
  var DD = [2, 0, 4, 5, 7, 6, 3, 1];
  var N_WAVES = 129;
  var SAMPLE_TABLE = 0x1E40;
  var HEADER_WORDS = 4 + 16 * 12;
  var PEAK = 30000.0;

  var BANKS = [["I", 0x8CE0], ["A", 0x10CE0], ["B", 0x18CE0]];
  var PATCH_SIZE = 362;
  var TONE_SIZE = 84;
  var KEYFOLLOW = [-100, -70, -50, -30, -10, 0, 10, 20, 30, 40, 50, 70, 100, 120, 150, 200];

  var PER_TONE = 17;
  var F_LEVEL = 0, F_PAN = 1, F_COARSE = 2, F_FINE = 3, F_FMODE = 4, F_CUTOFF = 5, F_RESO = 6,
    F_ENVAMT = 7, F_KEYF = 8, F_FA = 9, F_FD = 10, F_FS = 11, F_FR = 12, F_AA = 13, F_AD = 14,
    F_AS = 15, F_AR = 16;
  var C_LFORATE = 68, C_LFODELAY = 69, C_LFOPITCH = 70, C_LFOFILTER = 71, C_LFOAMP = 72,
    C_VEL = 73, C_GLIDE = 74, C_TUNE = 75, C_VOLUME = 76;
  var EXT_BASE = 77, PER_TONE_EXT = 5;
  var X_PDEPTH = 0, X_PTIME = 1, X_VELLO = 2, X_VELHI = 3, X_DELAY = 4;
  var C_LFO2RATE = 97, C_LFO2PITCH = 98, C_LFO2FILTER = 99, C_LFO2AMP = 100;
  var C_TONESEL = 101, EDIT_BASE = 102, N_PARAMS = 124;
  var TYPE_ID = 14;

  // ------------------------------------------------------- Python's habits
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function s8(v) { return v > 127 ? v - 256 : v; }
  // numpy's rint and Python's round(): halves go to the even neighbour.
  function rint(x) {
    if (Math.abs(x % 1) === 0.5) return 2 * Math.round(x / 2);
    return Math.round(x);
  }
  // np.interp, including its edge cases.
  function interp(x, xs, ys) {
    var n = xs.length;
    if (x < xs[0]) return ys[0];
    if (x > xs[n - 1]) return ys[n - 1];
    var j = 0;
    while (j < n - 1 && xs[j + 1] <= x) j++;
    if (j === n - 1) return ys[j];
    if (xs[j] === x) return ys[j];
    var slope = (ys[j + 1] - ys[j]) / (xs[j + 1] - xs[j]);
    return slope * (x - xs[j]) + ys[j];
  }
  var PY_SPACE = " \t\n\r\x0b\x0c\x1c\x1d\x1e\x1f";
  function pyStrip(s) {
    var a = 0, b = s.length;
    while (a < b && PY_SPACE.indexOf(s[a]) >= 0) a++;
    while (b > a && PY_SPACE.indexOf(s[b - 1]) >= 0) b--;
    return s.slice(a, b);
  }
  function ascii(bytes, replace) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) {
      var c = bytes[i];
      if (c > 127) {
        if (!replace) throw new Error("a wave name is not plain text: is this the right ROM?");
        s += "�";
      } else s += String.fromCharCode(c);
    }
    return s;
  }
  function safe(name) {
    var out = "";
    for (var i = 0; i < name.length; i++) {
      var c = name[i];
      out += /[A-Za-z0-9 \-+']/.test(c) ? c : "_";
    }
    return pyStrip(out);
  }
  function pad3(n) { return ("00" + n).slice(-3); }
  function pad2(n) { return ("0" + n).slice(-2); }
  function waveFile(n, name) { return pad3(n + 1) + " " + safe(name) + ".wav"; }

  // ------------------------------------------------------------ the ROMs
  var PERM = null, BITS = null;
  function tables() {
    if (PERM) return;
    PERM = new Uint32Array(1 << 20);
    for (var i = 0; i < (1 << 20); i++) {
      var a = 0;
      for (var j = 0; j < 20; j++) a |= ((i >>> j) & 1) << AA[j];
      PERM[i] = a;
    }
    BITS = new Uint8Array(256);
    for (var s = 0; s < 256; s++) {
      var o = 0;
      for (var k = 0; k < 8; k++) o |= ((s >> DD[k]) & 1) << k;
      BITS[s] = o;
    }
  }

  function unscramble(src) {
    tables();
    var n = src.length, out = new Uint8Array(n);
    for (var i = 0; i < n; i++) {
      var addr = ((i & ~0xFFFFF) | PERM[i & 0xFFFFF]) >>> 0;
      out[i] = BITS[src[addr]];
    }
    return out;
  }

  function Roms(rom2, wave1, wave2) {
    this.rom2 = rom2;
    var w1 = unscramble(wave1), w2 = unscramble(wave2);
    this.wave = new Uint8Array(w1.length + w2.length);
    this.wave.set(w1, 0);
    this.wave.set(w2, w1.length);
    var tag = String.fromCharCode.apply(null, this.wave.subarray(32, 38));
    if (tag !== "INT100")
      throw new Error("The wave ROMs did not unscramble to what Rack expects. Check that jv880_waverom1.bin and jv880_waverom2.bin are the JV-880's, and not swapped with another file.");
  }

  Roms.prototype.waves = function () {
    var out = [];
    for (var i = 0; i < N_WAVES; i++) {
      var r = this.rom2.subarray(4 + i * 60, 64 + i * 60);
      var zones = [];
      for (var k = 0; k < 16; k++) {
        var idx = (r[28 + 2 * k] << 8) | r[29 + 2 * k];
        if (idx !== 0xFFFF) zones.push([r[12 + k], idx]);
      }
      out.push([pyStrip(ascii(r.subarray(0, 12), false)), zones]);
    }
    return out;
  };

  Roms.prototype.sample = function (i) {
    var r = this.rom2.subarray(SAMPLE_TABLE + i * 18, SAMPLE_TABLE + (i + 1) * 18);
    function b24(o) { return (r[o] << 16) | (r[o + 1] << 8) | r[o + 2]; }
    return { level: r[0], start: b24(1), loop: b24(4), end: b24(7), mode: r[12],
      root: r[13], tune: ((r[14] << 8) | r[15]) - 1024 };
  };

  Roms.prototype.decode = function (start, end) {
    var w = this.wave, n = end - start + 1, out = new Float64Array(n), acc = 0;
    for (var t = 0; t < n; t++) {
      var a = start + t;
      var s = w[a] > 127 ? w[a] - 256 : w[a];
      var nb = w[(a & ~0xFFFFF) | ((a & 0xFFFFF) >> 5)];
      var nib = ((a >> 4) & 1) ? (nb >> 4) & 15 : nb & 15;
      acc += s * Math.pow(2, nib);
      out[t] = acc;
    }
    return out;
  };

  function pair(v) { return [(v >>> 15) & 0x7FFF, v & 0x7FFF]; }

  function build(roms, zones) {
    var header = [0x5241, 0x434B, 1, zones.length];
    var body = [];
    var offset = HEADER_WORDS;
    for (var z = 0; z < zones.length; z++) {
      var key = zones[z][0], s = roms.sample(zones[z][1]);
      var pcm = roms.decode(s.start, s.end);
      var loop = s.loop - s.start;
      var mode = s.mode;
      if (mode >= 4) { pcm.reverse(); mode = 2; loop = 0; }
      else if (mode > 2) mode = 2;
      var peak = 0;
      for (var i = 0; i < pcm.length; i++) { var m = Math.abs(pcm[i]); if (m > peak) peak = m; }
      if (!peak) peak = 1.0;
      var k = PEAK / peak, out = new Int16Array(pcm.length);
      for (i = 0; i < pcm.length; i++) out[i] = rint(pcm[i] * k);
      var gain = (peak / 65536.0) / (PEAK / 32768.0) * (s.level / 127.0);
      header.push(key, s.root, clamp(s.tune, -32000, 32000) & 0xFFFF, mode,
        Math.min(32767, rint(gain * 4096)));
      header.push.apply(header, pair(offset).concat(pair(out.length),
        pair(Math.max(0, Math.min(loop, out.length - 1))), [0]));
      body.push(out);
      offset += out.length;
    }
    while (header.length < HEADER_WORDS) header.push(0);
    var total = HEADER_WORDS;
    for (z = 0; z < body.length; z++) total += body[z].length;
    var all = new Int16Array(total);
    for (i = 0; i < HEADER_WORDS; i++) all[i] = header[i] << 16 >> 16;
    var at = HEADER_WORDS;
    for (z = 0; z < body.length; z++) { all.set(body[z], at); at += body[z].length; }
    return all;
  }

  function wavBytes(data, rate) {
    rate = rate || 32000;
    var len = data.length * 2, buf = new ArrayBuffer(44 + len), dv = new DataView(buf);
    function str(o, s) { for (var i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); }
    str(0, "RIFF"); dv.setUint32(4, 36 + len, true); str(8, "WAVEfmt ");
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true);
    dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    str(36, "data"); dv.setUint32(40, len, true);
    for (var i = 0; i < data.length; i++) dv.setInt16(44 + 2 * i, data[i], true);
    return new Uint8Array(buf);
  }

  // ------------------------------------------------ the measured curves
  function table(points, v, log) {
    var xs = [], ys = [];
    for (var i = 0; i < points.length; i++) {
      xs.push(points[i][0]);
      ys.push(log ? Math.log(points[i][1]) : points[i][1]);
    }
    var y = interp(v, xs, ys);
    return log ? Math.exp(y) : y;
  }
  var TIME = [[0, 0.002], [1, 0.012], [2, 0.022], [5, 0.036], [10, 0.066], [20, 0.166], [30, 0.29],
    [40, 0.512], [50, 0.855], [60, 1.39], [70, 2.24], [80, 3.56], [90, 5.64], [100, 8.87],
    [110, 13.95], [120, 22.3], [127, 30.9]];
  var CUTOFF = [[0, 60], [2, 141], [4, 242], [6, 336], [8, 430], [10, 539], [15, 781], [20, 1031],
    [30, 1562], [40, 2180], [50, 3000], [60, 4234], [70, 5977], [75, 7391], [80, 10164],
    [85, 14000], [90, 19000], [127, 20000]];
  var LEVEL_DB = [[0, -90.0], [8, -48.0], [16, -36.0], [32, -24.6], [64, -14.9], [96, -7.0], [127, 0.0]];
  var LFO_RATE = [[0, 0.16], [20, 0.214], [40, 0.557], [60, 1.198], [80, 2.563], [90, 3.754],
    [100, 5.50], [110, 8.04], [120, 11.77], [127, 15.37]];
  var LFO_PITCH_CENTS = [[0, 0], [1, 1], [5, 8], [10, 24], [20, 78], [63, 710]];
  var LFO_FILTER_OCT = [[0, 0], [5, 0.33], [20, 0.75], [63, 2.3]];
  var ENV_OCT_PER_UNIT = 0.14, KEYFOLLOW_SCALE = 1.1, DELAY_PER_UNIT = 0.016, DECAY_SCALE = 1.4;
  var FILTER_VEL_CURVE = [0.39, 0.69, 0.95, 0.18];
  var AMP_VEL_CURVE = [0.079, 0.15, 0.20, 0.04];
  var T1_VEL_PER_STEP = 0.07;

  function seconds(v) { return table(TIME, clamp(v, 0, 127), true); }
  function gainOf(units) { return Math.pow(10.0, table(LEVEL_DB, clamp(units, 0.0, 127.0)) / 20.0); }

  function adsr(t1, l1, t2, l2, t3, l3, t4, level, t1vel) {
    if (t1vel === undefined) t1vel = 7;
    var peak = Math.max(l1, l2, 1);
    var first = seconds(t1) * clamp(1.0 + (t1vel - 7) * T1_VEL_PER_STEP, 0.3, 1.6);
    var sustain, decay, release, attack;
    if (l2 <= l1 && seconds(t2) >= 4.0) {
      sustain = clamp(l2 / peak, 0.0, 1.0);
      decay = seconds(t2) * (level ? DECAY_SCALE : 1.0);
      release = seconds(t4) * (level ? (DECAY_SCALE + 0.9 * (1.0 - sustain)) : 1.0);
      return [clamp(first, 0.001, 8.0), clamp(decay, 0.005, 40.0), sustain,
        clamp(release, 0.005, 16.0), peak / 127.0];
    }
    if (l2 > l1) {
      var left = level ? (1.0 - gainOf(l1) / gainOf(l2)) : (1.0 - l1 / l2);
      attack = first + seconds(t2) * left;
      decay = seconds(t3);
    } else {
      attack = first;
      decay = seconds(t3) + (l2 < l1 ? seconds(t2) : 0.0);
    }
    sustain = clamp(l3 / peak, 0.0, 1.0);
    if (level) {
      decay *= DECAY_SCALE;
      release = seconds(t4) * (DECAY_SCALE + 0.9 * (1.0 - sustain));
    } else {
      release = seconds(t4);
    }
    return [clamp(attack, 0.001, 8.0), clamp(decay, 0.005, 40.0), sustain,
      clamp(release, 0.005, 16.0), peak / 127.0];
  }

  function neutral(v, t) {
    var b = t * PER_TONE, x = EXT_BASE + t * PER_TONE_EXT;
    v[b + F_FMODE] = 1; v[b + F_CUTOFF] = 1.0; v[b + F_KEYF] = 0.5;
    v[b + F_FA] = 0.005; v[b + F_FD] = 0.5; v[b + F_FS] = 0.5; v[b + F_FR] = 0.5;
    v[b + F_AA] = 0.003; v[b + F_AD] = 1.0; v[b + F_AS] = 1.0; v[b + F_AR] = 0.3;
    v[x + X_PTIME] = 0.1; v[x + X_VELHI] = 127.0;
  }

  function editCopies(v) {
    v[C_TONESEL] = 0.0;
    for (var k = 0; k < PER_TONE; k++) v[EDIT_BASE + k] = v[k];
    for (k = 0; k < PER_TONE_EXT; k++) v[EDIT_BASE + PER_TONE + k] = v[EXT_BASE + k];
  }

  function lfoDepths(dp, df, da, v, rateIdx, pitchIdx, filterIdx, ampIdx, rate) {
    v[rateIdx] = clamp(table(LFO_RATE, rate, true), 0.02, 30.0);
    v[pitchIdx] = clamp(table(LFO_PITCH_CENTS, Math.min(dp, 63)) / 100.0, 0.0, 1.0);
    v[filterIdx] = clamp(table(LFO_FILTER_OCT, Math.min(df, 63)) / 2.0, 0.0, 1.0);
    v[ampIdx] = clamp(1.0 - Math.pow(10.0, -0.29 * Math.min(da, 63) / 20.0), 0.0, 1.0);
  }

  function translate(rec, waveNames) {
    var name = pyStrip(ascii(rec.subarray(0, 12), true));
    var common = rec.subarray(12, 26);
    var v = new Array(N_PARAMS);
    for (var q = 0; q < N_PARAMS; q++) v[q] = 0.0;
    var paths = ["", "", "", ""];
    var vel = [], lfo = null, lfo2 = null;
    for (var t = 0; t < 4; t++) {
      var tn = rec.subarray(26 + t * TONE_SIZE, 26 + (t + 1) * TONE_SIZE);
      var b = t * PER_TONE, x = EXT_BASE + t * PER_TONE_EXT;
      neutral(v, t);
      if ((tn[0] & 0x80) === 0) continue;
      var path = null;
      if ((tn[0] & 3) === 0 && tn[1] < N_WAVES) path = "RACK/" + waveFile(tn[1], waveNames[tn[1]]);
      if (!path) continue;
      paths[t] = path;

      var A = adsr(tn[74], tn[75], tn[76], tn[77], tn[78], tn[79], tn[80], true, tn[73] & 15);
      var top = tn[67] * A[4];
      v[b + F_LEVEL] = clamp(Math.sqrt(gainOf(top)), 0.0, 1.0);
      var as = clamp(gainOf(top * A[2]) / Math.max(gainOf(top), 1e-6), 0.0, 1.0);
      v[b + F_PAN] = tn[68] > 127 ? 0.0 : clamp((tn[68] - 64) / 63.0, -1.0, 1.0);
      v[b + F_COARSE] = clamp(s8(tn[37]), -24, 24);
      v[b + F_FINE] = clamp(s8(tn[38]), -50, 50);
      v[b + F_AA] = A[0]; v[b + F_AD] = A[1]; v[b + F_AS] = as; v[b + F_AR] = A[3];

      var mode = (tn[55] >> 3) & 3;
      v[b + F_FMODE] = mode === 0 ? 0 : mode === 2 ? 3 : 1;
      v[b + F_CUTOFF] = clamp(Math.log2(table(CUTOFF, tn[52], true) / 40.0) / 9.0, 0.0, 1.0);
      var peakDb = (tn[53] & 127) / 127.0 * 12.0 * ((tn[53] & 128) ? 2.0 : 1.0);
      var Q = 0.707 + (Math.pow(10.0, peakDb / 20.0) - 1.0) * 1.1;
      v[b + F_RESO] = clamp((2.0 - 1.0 / Q) / 1.9, 0.0, 1.0);
      v[b + F_KEYF] = clamp(KEYFOLLOW[tn[54] & 15] / 100.0 * KEYFOLLOW_SCALE, -1.0, 2.2);
      var F = adsr(tn[59], tn[60], tn[61], tn[62], tn[63], tn[64], tn[65], false, tn[57] & 15);
      var soft = 1.0 - clamp(s8(tn[56]), 0, 63) / 57.0 * FILTER_VEL_CURVE[tn[55] & 3];
      soft = clamp(soft, 0.0, 1.0);
      v[b + F_ENVAMT] = clamp(s8(tn[58]) * ENV_OCT_PER_UNIT * F[4] * soft / 7.4, -1.0, 1.0);
      v[b + F_FA] = F[0]; v[b + F_FD] = F[1]; v[b + F_FS] = F[2]; v[b + F_FR] = F[3];

      vel.push(clamp(s8(tn[72]) * AMP_VEL_CURVE[tn[71] & 3] / 3.0, 0.0, 1.0));

      var pdepth = s8(tn[43]), pt1 = tn[44], pl1 = s8(tn[45]), pl2 = s8(tn[47]), pl3 = s8(tn[49]);
      if (pdepth && pl1 && pt1 <= 12 && Math.abs(pl3) <= 4) {
        v[x + X_PDEPTH] = clamp(pdepth * pl1 / 63.0, -12.0, 12.0);
        v[x + X_PTIME] = clamp(seconds(tn[46]) * DECAY_SCALE * (Math.abs(pl2) <= 4 ? 1.0 : 2.0), 0.005, 4.0);
      }
      var lo = tn[3] & 127, hi = tn[4] & 127;
      if (0 < hi && lo <= hi) { v[x + X_VELLO] = lo; v[x + X_VELHI] = hi; }
      if (0 < tn[69] && tn[69] < 128) v[x + X_DELAY] = clamp(tn[69] * DELAY_PER_UNIT, 0.0, 4.0);
      var d2 = [Math.abs(s8(tn[34])), Math.abs(s8(tn[35])), Math.abs(s8(tn[36]))];
      if (lfo2 === null && (d2[0] || d2[1] || d2[2])) lfo2 = [tn[28], d2];
      var dep = [Math.abs(s8(tn[31])), Math.abs(s8(tn[32])), Math.abs(s8(tn[33]))];
      if (lfo === null && (dep[0] || dep[1] || dep[2])) lfo = [tn[24], tn[25], dep];
    }

    v[C_LFORATE] = 5.0;
    if (lfo !== null) {
      lfoDepths(lfo[2][0], lfo[2][1], lfo[2][2], v, C_LFORATE, C_LFOPITCH, C_LFOFILTER, C_LFOAMP, lfo[0]);
      v[C_LFODELAY] = clamp(lfo[1] ? seconds(lfo[1]) : 0.0, 0.0, 3.0);
    }
    v[C_LFO2RATE] = 0.5;
    if (lfo2 !== null)
      lfoDepths(lfo2[1][0], lfo2[1][1], lfo2[1][2], v, C_LFO2RATE, C_LFO2PITCH, C_LFO2FILTER, C_LFO2AMP, lfo2[0]);
    if (vel.length) {
      var sum = 0.0;
      for (q = 0; q < vel.length; q++) sum += vel[q];
      v[C_VEL] = sum / vel.length;
    } else v[C_VEL] = 0.5;
    v[C_GLIDE] = (common[12] & 0x40) ? clamp(seconds(common[13] & 127) * 0.5, 0.0, 2.0) : 0.0;
    v[C_TUNE] = 0.0;
    v[C_VOLUME] = clamp(0.8 * Math.sqrt(common[9] / 127.0), 0.0, 1.0);
    editCopies(v);
    return { name: name, values: v, paths: paths };
  }

  // ---------------------------------------- the Tracker's patch file format
  function Bytes() { this.a = []; }
  Bytes.prototype.push = function (arr) { for (var i = 0; i < arr.length; i++) this.a.push(arr[i]); return this; };

  function varint(n) {
    var out = [];
    // values here are small and non-negative
    do {
      var b = n % 128;
      n = Math.floor(n / 128);
      out.push(b | (n ? 0x80 : 0));
    } while (n);
    return out;
  }
  function field(num, wire, payload) { return varint((num << 3) | wire).concat(payload); }
  function message(num, body) { return field(num, 2, varint(body.length).concat(body)); }
  var F32 = new DataView(new ArrayBuffer(4));
  function f32(num, value) {
    F32.setFloat32(0, value, true);
    return field(num, 5, [F32.getUint8(0), F32.getUint8(1), F32.getUint8(2), F32.getUint8(3)]);
  }
  function asciiBytes(s) { var o = []; for (var i = 0; i < s.length; i++) o.push(s.charCodeAt(i) & 0x7F); return o; }

  var MACROS = [
    ["Cutoff", true, [0, 1, 2, 3].map(function (t) { return [t * PER_TONE + F_CUTOFF, 1.0]; })],
    ["Resonance", false, [0, 1, 2, 3].map(function (t) { return [t * PER_TONE + F_RESO, 1.0]; })],
    ["Attack", true, [0, 1, 2, 3].map(function (t) { return [t * PER_TONE + F_AA, 1.0]; })],
    ["Release", true, [0, 1, 2, 3].map(function (t) { return [t * PER_TONE + F_AR, 1.0]; })],
    ["Balance", true, [[0 * PER_TONE + F_LEVEL, -0.5], [1 * PER_TONE + F_LEVEL, -0.5],
      [2 * PER_TONE + F_LEVEL, 0.5], [3 * PER_TONE + F_LEVEL, 0.5]]],
    ["Vibrato", false, [[C_LFOPITCH, 1.0]]],
    ["", false, []],
    ["", false, []]
  ];

  function patchFile(values, paths) {
    var out = field(1, 0, varint(TYPE_ID));
    var i, k;
    for (i = 0; i < values.length; i++) out = out.concat(message(6, f32(1, values[i])));
    for (i = 0; i < 4; i++) out = out.concat(message(7, paths[i] ? message(1, asciiBytes(paths[i])) : []));
    for (i = 0; i < MACROS.length; i++) {
      var name = MACROS[i][0], bipolar = MACROS[i][1], mods = MACROS[i][2], body = [];
      if (name) body = body.concat(message(1, asciiBytes(name)));
      if (bipolar) body = body.concat(field(2, 0, varint(1)));
      if (mods.length) body = body.concat(field(3, 0, varint(mods.length)));
      for (k = 0; k < 6; k++) {
        var m = [];
        if (k < mods.length) m = (mods[k][0] ? field(1, 0, varint(mods[k][0])) : []).concat(f32(2, mods[k][1]));
        body = body.concat(message(4, m));
      }
      out = out.concat(message(8, body));
    }
    var arp = field(1, 0, varint(3)).concat(field(2, 0, varint(1)));
    out = out.concat(message(9, message(1, message(2, arp))));
    return new Uint8Array(out);
  }

  // ------------------------------------------------------------- bank L
  var LARKOS = [{"name":"Glass Choir","tones":[{"wave":"043 Male Ooh","level":1,"pan":-0.25,"coarse":0,"fine":0,"mode":1,"cutoff":0.78,"reso":0.0,"env":0.0,"keyf":0.4,"fenv":[0.005,0.5,0.5,0.5],"aenv":[0.6,2.0,0.85,2.2],"pitch":[0.0,0.1],"vel":[0,127],"delay":0.0},{"wave":"051 Fanta Bell","level":0.69,"pan":0.3,"coarse":12,"fine":0,"mode":1,"cutoff":0.9,"reso":0.0,"env":0.0,"keyf":0.5,"fenv":[0.005,0.5,0.5,0.5],"aenv":[0.004,1.4,0.0,1.2],"pitch":[0.0,0.1],"vel":[0,127],"delay":0.0},{"wave":"047 JP Strings","level":0.75,"pan":0.35,"coarse":12,"fine":0,"mode":3,"cutoff":0.45,"reso":0.0,"env":0.0,"keyf":0.5,"fenv":[0.005,0.5,0.5,0.5],"aenv":[1.8,3.0,0.9,2.6],"pitch":[0.0,0.1],"vel":[0,127],"delay":0.9},{"wave":"045 VOX Noise","level":0.38,"pan":-0.4,"coarse":0,"fine":0,"mode":2,"cutoff":0.72,"reso":0.35,"env":0.0,"keyf":0.5,"fenv":[0.005,0.5,0.5,0.5],"aenv":[0.9,2.0,0.6,1.8],"pitch":[0.0,0.1],"vel":[0,127],"delay":0.0}],"lfo1":[4.6,1.2,0.08,0.0,0.0],"lfo2":[0.18,0.0,0.25,0.0],"vel":0.3,"glide":0.0,"volume":0.89},{"name":"Tin Sky","tones":[{"wave":"046 Soft Pad","level":1,"pan":0.0,"coarse":0,"fine":0,"mode":1,"cutoff":0.62,"reso":0.2,"env":0.08,"keyf":0.4,"fenv":[1.5,3.0,0.6,2.0],"aenv":[0.9,3.0,0.9,3.0],"pitch":[0.0,0.1],"vel":[0,127],"delay":0.0},{"wave":"117 REV Tin Wave","level":0.62,"pan":-0.5,"coarse":0,"fine":0,"mode":2,"cutoff":0.7,"reso":0.4,"env":0.0,"keyf":0.5,"fenv":[0.005,0.5,0.5,0.5],"aenv":[0.3,4.0,0.4,2.5],"pitch":[0.0,0.1],"vel":[0,127],"delay":0.5},{"wave":"083 Spectrum 1","level":0.56,"pan":0.5,"coarse":12,"fine":0,"mode":3,"cutoff":0.5,"reso":0.0,"env":0.0,"keyf":0.5,"fenv":[0.005,0.5,0.5,0.5],"aenv":[2.2,4.0,0.7,3.2],"pitch":[0.0,0.1],"vel":[0,127],"delay":1.1},{"wave":"080 Wind Chimes","level":0.38,"pan":0.2,"coarse":0,"fine":0,"mode":3,"cutoff":0.6,"reso":0.0,"env":0.0,"keyf":0.5,"fenv":[0.005,0.5,0.5,0.5],"aenv":[0.02,5.0,0.2,3.0],"pitch":[0.0,0.1],"vel":[0,127],"delay":1.8}],"lfo1":[5.0,0.0,0.0,0.0,0.0],"lfo2":[0.11,0.0,0.45,0.1],"vel":0.2,"glide":0.0,"volume":0.78},{"name":"Bottle Saw","tones":[{"wave":"066 Synth Saw 1","level":1,"pan":0.0,"coarse":0,"fine":0,"mode":1,"cutoff":0.66,"reso":0.3,"env":0.14,"keyf":0.7,"fenv":[0.01,0.5,0.5,0.3],"aenv":[0.008,1.0,0.9,0.25],"pitch":[0.0,0.1],"vel":[0,127],"delay":0.0},{"wave":"035 Bottle","level":0.88,"pan":-0.15,"coarse":0,"fine":0,"mode":1,"cutoff":0.85,"reso":0.0,"env":0.0,"keyf":0.5,"fenv":[0.005,0.5,0.5,0.5],"aenv":[0.004,0.5,0.25,0.2],"pitch":[0.0,0.1],"vel":[0,127],"delay":0.0},{"wave":"034 Blow Pipe","level":0.56,"pan":0.2,"coarse":0,"fine":0,"mode":3,"cutoff":0.5,"reso":0.0,"env":0.0,"keyf":0.5,"fenv":[0.005,0.5,0.5,0.5],"aenv":[0.05,1.0,0.7,0.25],"pitch":[0.0,0.1],"vel":[0,127],"delay":0.0}],"lfo1":[5.4,0.5,0.22,0.0,0.0],"lfo2":[0.5,0.0,0.0,0.0],"vel":0.5,"glide":0.06,"volume":0.83},{"name":"Held Feedback","tones":[{"wave":"065 Lead Wave","level":1,"pan":0.0,"coarse":0,"fine":0,"mode":1,"cutoff":0.72,"reso":0.25,"env":0.1,"keyf":0.7,"fenv":[0.005,0.4,0.6,0.3],"aenv":[0.005,1.0,0.9,0.22],"pitch":[0.0,0.1],"vel":[0,127],"delay":0.0},{"wave":"015 Stratus","level":0.69,"pan":-0.2,"coarse":0,"fine":0,"mode":1,"cutoff":0.8,"reso":0.0,"env":0.0,"keyf":0.5,"fenv":[0.005,0.5,0.5,0.5],"aenv":[0.006,1.5,0.7,0.25],"pitch":[0.0,0.1],"vel":[0,127],"delay":0.0},{"wave":"078 Feedbackwave","level":0.75,"pan":0.25,"coarse":12,"fine":0,"mode":1,"cutoff":0.8,"reso":0.0,"env":0.0,"keyf":0.5,"fenv":[0.005,0.5,0.5,0.5],"aenv":[1.2,2.0,1.0,0.5],"pitch":[0.0,0.1],"vel":[0,127],"delay":0.55}],"lfo1":[5.8,0.7,0.28,0.0,0.0],"lfo2":[0.5,0.0,0.0,0.0],"vel":0.5,"glide":0.04,"volume":0.9},{"name":"Log Sub","tones":[{"wave":"073 Sine","level":1,"pan":0.0,"coarse":-12,"fine":0,"mode":0,"cutoff":1.0,"reso":0.0,"env":0.0,"keyf":0.5,"fenv":[0.005,0.5,0.5,0.5],"aenv":[0.004,1.2,0.75,0.18],"pitch":[0.0,0.1],"vel":[0,127],"delay":0.0},{"wave":"057 Log Drum","level":0.94,"pan":0.0,"coarse":0,"fine":0,"mode":1,"cutoff":0.7,"reso":0.0,"env":0.15,"keyf":0.3,"fenv":[0.002,0.2,0.0,0.2],"aenv":[0.002,0.5,0.0,0.2],"pitch":[0.0,0.1],"vel":[0,127],"delay":0.0},{"wave":"021 Fretless 1","level":0.5,"pan":0.0,"coarse":0,"fine":0,"mode":1,"cutoff":0.5,"reso":0.0,"env":0.0,"keyf":0.3,"fenv":[0.005,0.5,0.5,0.5],"aenv":[0.01,1.5,0.5,0.2],"pitch":[0.0,0.1],"vel":[0,127],"delay":0.0}],"lfo1":[5.0,0.0,0.0,0.0,0.0],"lfo2":[0.5,0.0,0.0,0.0],"vel":0.6,"glide":0.0,"volume":0.85},{"name":"Clav Slap","tones":[{"wave":"023 Slap Bass 1","level":1,"pan":0.0,"coarse":0,"fine":0,"mode":1,"cutoff":0.85,"reso":0.0,"env":0.0,"keyf":0.5,"fenv":[0.005,0.5,0.5,0.5],"aenv":[0.002,0.9,0.2,0.12],"pitch":[0.0,0.1],"vel":[0,127],"delay":0.0},{"wave":"006 Clav 1","level":0.69,"pan":0.15,"coarse":-12,"fine":0,"mode":1,"cutoff":0.75,"reso":0.0,"env":0.0,"keyf":0.5,"fenv":[0.005,0.5,0.5,0.5],"aenv":[0.002,0.6,0.1,0.12],"pitch":[0.0,0.1],"vel":[0,127],"delay":0.0},{"wave":"070 Synth Pulse1","level":0.69,"pan":-0.15,"coarse":-12,"fine":0,"mode":1,"cutoff":0.34,"reso":0.45,"env":0.5,"keyf":0.3,"fenv":[0.002,0.18,0.1,0.15],"aenv":[0.002,0.8,0.4,0.12],"pitch":[0.0,0.1],"vel":[0,127],"delay":0.0}],"lfo1":[5.0,0.0,0.0,0.0,0.0],"lfo2":[0.5,0.0,0.0,0.0],"vel":0.7,"glide":0.0,"volume":1},{"name":"Tines and Bars","tones":[{"wave":"002 SA Rhodes 1","level":1,"pan":-0.2,"coarse":0,"fine":0,"mode":1,"cutoff":0.8,"reso":0.0,"env":0.0,"keyf":0.5,"fenv":[0.005,0.5,0.5,0.5],"aenv":[0.003,3.0,0.0,0.5],"pitch":[0.0,0.1],"vel":[0,127],"delay":0.0},{"wave":"055 Vibes","level":0.75,"pan":0.25,"coarse":0,"fine":0,"mode":1,"cutoff":0.85,"reso":0.0,"env":0.0,"keyf":0.5,"fenv":[0.005,0.5,0.5,0.5],"aenv":[0.003,3.5,0.0,0.9],"pitch":[0.0,0.1],"vel":[0,127],"delay":0.0},{"wave":"012 GTR HARM","level":0.75,"pan":0.1,"coarse":12,"fine":0,"mode":1,"cutoff":1.0,"reso":0.0,"env":0.0,"keyf":0.5,"fenv":[0.005,0.5,0.5,0.5],"aenv":[0.003,2.0,0.0,0.8],"pitch":[0.0,0.1],"vel":[100,127],"delay":0.0}],"lfo1":[4.4,0.0,0.0,0.0,0.3],"lfo2":[0.5,0.0,0.0,0.0],"vel":0.8,"glide":0.0,"volume":0.84},{"name":"Wood and Gut","tones":[{"wave":"056 Marimba Wave","level":1,"pan":0.0,"coarse":0,"fine":0,"mode":1,"cutoff":0.8,"reso":0.0,"env":0.0,"keyf":0.5,"fenv":[0.005,0.5,0.5,0.5],"aenv":[0.002,1.1,0.0,0.5],"pitch":[0.0,0.1],"vel":[0,127],"delay":0.0},{"wave":"040 Pizz","level":0.81,"pan":-0.3,"coarse":0,"fine":0,"mode":1,"cutoff":0.85,"reso":0.0,"env":0.0,"keyf":0.5,"fenv":[0.005,0.5,0.5,0.5],"aenv":[0.002,0.7,0.0,0.3],"pitch":[0.0,0.1],"vel":[0,127],"delay":0.0},{"wave":"010 Nylon GTR","level":0.62,"pan":0.3,"coarse":0,"fine":0,"mode":1,"cutoff":0.75,"reso":0.0,"env":0.0,"keyf":0.5,"fenv":[0.005,0.5,0.5,0.5],"aenv":[0.002,1.6,0.0,0.5],"pitch":[0.0,0.1],"vel":[0,127],"delay":0.0},{"wave":"060 Steel Drums","level":0.38,"pan":0.1,"coarse":12,"fine":0,"mode":3,"cutoff":0.5,"reso":0.0,"env":0.0,"keyf":0.5,"fenv":[0.005,0.5,0.5,0.5],"aenv":[0.002,0.9,0.0,0.4],"pitch":[0.0,0.1],"vel":[90,127],"delay":0.0}],"lfo1":[5.0,0.0,0.0,0.0,0.0],"lfo2":[0.5,0.0,0.0,0.0],"vel":0.8,"glide":0.0,"volume":0.85}];

  // The Volume each factory patch needs to sit at one loudness, as measured
  // by test/audit_patches and passed to rack_convert.py as its levels file.
  // Banks I, A and B in order, 64 each.
  var LEVELS = [0.8645,0.6842,1,0.8931,1,0.6556,0.8175,1,1,1,0.8727,1,0.8848,0.6152,0.923,0.8777,0.8574,0.7505,0.9239,0.6922,1,0.738,1,1,0.9259,1,1,1,1,0.9005,0.9082,0.9596,1,1,0.8715,0.828,0.7087,0.7643,1,0.9473,1,0.8516,0.7237,0.8777,0.96,0.8203,1,0.8273,0.8183,0.7254,0.9981,0.9957,1,1,1,1,0.8405,0.7735,0.9649,0.8032,1,0.9049,0.7513,1,1,0.973,1,0.8967,1,1,1,0.8937,1,1,1,0.7302,0.8067,1,0.9737,1,1,1,1,0.8818,1,1,0.9473,1,0.8398,0.8208,0.8072,0.915,0.8298,1,1,0.975,1,0.8739,0.9927,1,0.9599,1,1,1,1,0.9159,1,0.9856,1,1,0.8755,0.8446,1,0.7873,1,1,0.6836,0.6513,1,1,0.7226,0.8954,0.857,0.6342,0.6408,0.8059,0.6198,0.6333,0.9988,0.9591,1,1,0.9946,1,1,0.8204,1,0.8799,1,1,1,0.8512,0.8495,0.9789,0.8674,1,0.9685,1,1,1,1,0.6648,1,0.9515,1,1,0.8131,0.9925,0.8246,1,0.9048,1,0.6839,0.6725,0.7571,0.9577,1,1,0.911,0.9299,0.8971,1,0.9671,0.7323,0.7529,0.9088,1,1,0.6318,0.7265,0.7409,0.6702,0.8002,0.7344,0.8513,0.8852,1,1,1,1,1,1];

  function larkosValues(p) {
    var v = new Array(N_PARAMS), paths = ["", "", "", ""];
    for (var q = 0; q < N_PARAMS; q++) v[q] = 0.0;
    for (var t = 0; t < 4; t++) {
      var b = t * PER_TONE, x = EXT_BASE + t * PER_TONE_EXT;
      neutral(v, t);
      if (t >= p.tones.length) continue;
      var tn = p.tones[t];
      paths[t] = "RACK/" + tn.wave + ".wav";
      v[b + F_LEVEL] = tn.level; v[b + F_PAN] = tn.pan;
      v[b + F_COARSE] = tn.coarse; v[b + F_FINE] = tn.fine;
      v[b + F_FMODE] = tn.mode; v[b + F_CUTOFF] = tn.cutoff; v[b + F_RESO] = tn.reso;
      v[b + F_ENVAMT] = tn.env; v[b + F_KEYF] = tn.keyf;
      v[b + F_FA] = tn.fenv[0]; v[b + F_FD] = tn.fenv[1]; v[b + F_FS] = tn.fenv[2]; v[b + F_FR] = tn.fenv[3];
      v[b + F_AA] = tn.aenv[0]; v[b + F_AD] = tn.aenv[1]; v[b + F_AS] = tn.aenv[2]; v[b + F_AR] = tn.aenv[3];
      v[x + X_PDEPTH] = tn.pitch[0]; v[x + X_PTIME] = tn.pitch[1];
      v[x + X_VELLO] = tn.vel[0]; v[x + X_VELHI] = tn.vel[1];
      v[x + X_DELAY] = tn.delay;
    }
    v[C_LFORATE] = p.lfo1[0]; v[C_LFODELAY] = p.lfo1[1]; v[C_LFOPITCH] = p.lfo1[2];
    v[C_LFOFILTER] = p.lfo1[3]; v[C_LFOAMP] = p.lfo1[4];
    v[C_LFO2RATE] = p.lfo2[0]; v[C_LFO2PITCH] = p.lfo2[1]; v[C_LFO2FILTER] = p.lfo2[2]; v[C_LFO2AMP] = p.lfo2[3];
    v[C_VEL] = p.vel; v[C_GLIDE] = p.glide; v[C_TUNE] = 0.0; v[C_VOLUME] = p.volume;
    editCopies(v);
    return { values: v, paths: paths };
  }

  // ------------------------------------------------------- a small zip
  var CRC = null;
  function crc32(data) {
    if (!CRC) {
      CRC = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        CRC[n] = c >>> 0;
      }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < data.length; i++) crc = CRC[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function Zip() { this.parts = []; this.central = []; this.offset = 0; this.count = 0; }
  // 25 November 2026, 12:00: every entry carries the same stamp.
  var DOS_TIME = (12 << 11), DOS_DATE = ((2026 - 1980) << 9) | (11 << 5) | 25;
  Zip.prototype.add = function (name, data) {
    var nb = asciiBytes(name), isDir = name.charAt(name.length - 1) === "/";
    data = data || new Uint8Array(0);
    var crc = isDir ? 0 : crc32(data);
    var lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 10, true); lh.setUint16(6, 0, true);
    lh.setUint16(8, 0, true); lh.setUint16(10, DOS_TIME, true); lh.setUint16(12, DOS_DATE, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
    lh.setUint16(26, nb.length, true); lh.setUint16(28, 0, true);
    var ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 10, true);
    ch.setUint16(8, 0, true); ch.setUint16(10, 0, true); ch.setUint16(12, DOS_TIME, true);
    ch.setUint16(14, DOS_DATE, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true); ch.setUint16(30, 0, true);
    ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
    ch.setUint32(38, isDir ? 0x10 : 0, true); ch.setUint32(42, this.offset, true);
    var nameArr = new Uint8Array(nb);
    this.parts.push(new Uint8Array(lh.buffer), nameArr, data);
    this.central.push(new Uint8Array(ch.buffer), nameArr);
    this.offset += 30 + nb.length + data.length;
    this.count++;
  };
  Zip.prototype.finish = function () {
    var size = 0, i;
    for (i = 0; i < this.central.length; i++) size += this.central[i].length;
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, this.count, true);
    end.setUint16(10, this.count, true); end.setUint32(12, size, true);
    end.setUint32(16, this.offset, true); end.setUint16(20, 0, true);
    return this.parts.concat(this.central, [new Uint8Array(end.buffer)]);
  };

  // ------------------------------------------------------------ the job
  var wait = function () { return new Promise(function (r) { setTimeout(r, 0); }); };

  /* files: { rom2, wave1, wave2 } as Uint8Arrays.
     progress(fraction, text) is called as it goes.
     Resolves to { parts: [Uint8Array...], waves, patches, larkos, bytes, skipped }. */
  function convert(files, progress, opts) {
    opts = opts || {};
    progress = progress || function () {};
    var zip = new Zip(), roms, names, i;
    var SAMP = "System/Synths/Samples/RACK/", PAT = "System/Synths/Patches/RACK/";
    var waveBytes = 0, onCard = {}, rows = [];
    return Promise.resolve().then(function () {
      if (files.rom2.length !== 0x40000)
        throw new Error("jv880_rom2.bin should be 256 KB and this one is " + files.rom2.length + " bytes. Check that it is the JV-880's second program ROM, not rom1.");
      if (files.wave1.length !== 0x200000 || files.wave2.length !== 0x200000)
        throw new Error("Each wave ROM should be 2 MB (2,097,152 bytes). Check jv880_waverom1.bin and jv880_waverom2.bin.");
      progress(0.01, "Unscrambling the wave ROMs");
      return wait();
    }).then(function () {
      roms = new Roms(files.rom2, files.wave1, files.wave2);
      names = roms.waves().map(function (w) { return w[0]; });
      ["System/", "System/Synths/", "System/Synths/Samples/", SAMP, "System/Synths/Patches/", PAT]
        .forEach(function (d) { zip.add(d); });
      var list = roms.waves(), n = 0;
      function next() {
        if (n >= list.length) return Promise.resolve();
        var end = Math.min(list.length, n + 8);
        for (; n < end; n++) {
          var fn = waveFile(n, list[n][0]);
          var data = wavBytes(build(roms, list[n][1]));
          zip.add(SAMP + fn, data);
          onCard["RACK/" + fn] = true;
          waveBytes += data.length - 44;
        }
        progress(0.05 + 0.8 * n / list.length, "Writing waves: " + n + " of " + list.length);
        return wait().then(next);
      }
      return next();
    }).then(function () {
      progress(0.88, "Translating 192 patches");
      var count = 0;
      for (var bk = 0; bk < BANKS.length; bk++) {
        for (i = 0; i < 64; i++) {
          var base = BANKS[bk][1];
          var rec = roms.rom2.subarray(base + i * PATCH_SIZE, base + (i + 1) * PATCH_SIZE);
          var p = translate(rec, names);
          if (opts.levels !== false) p.values[C_VOLUME] = LEVELS[bk * 64 + i];
          var fn = BANKS[bk][0] + pad2(i + 1) + " " + safe(p.name);
          zip.add(PAT + fn + ".patch", patchFile(p.values, p.paths));
          rows.push(fn);
          count++;
        }
      }
      var larkos = 0, skipped = [];
      if (opts.larkos !== false) {
        for (i = 0; i < LARKOS.length; i++) {
          var lp = larkosValues(LARKOS[i]);
          var lfn = "L" + pad2(i + 1) + " " + LARKOS[i].name;
          var missing = lp.paths.filter(function (q) { return q && !onCard[q]; });
          if (missing.length) { skipped.push(lfn); continue; }
          zip.add(PAT + lfn + ".patch", patchFile(lp.values, lp.paths));
          larkos++;
        }
      }
      progress(0.97, "Packing the zip");
      return wait().then(function () {
        var parts = zip.finish(), bytes = 0;
        for (var q = 0; q < parts.length; q++) bytes += parts[q].length;
        progress(1, "Done");
        return { parts: parts, waves: names.length, waveBytes: waveBytes, patches: count,
          larkos: larkos, skipped: skipped, bytes: bytes };
      });
    });
  }

  var api = { convert: convert, unscramble: unscramble, Roms: Roms, build: build,
    wavBytes: wavBytes, translate: translate, patchFile: patchFile, larkosValues: larkosValues,
    LARKOS: LARKOS, LEVELS: LEVELS, crc32: crc32, Zip: Zip, waveFile: waveFile, safe: safe };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RackConvert = api;
})(typeof self !== "undefined" ? self : this);
