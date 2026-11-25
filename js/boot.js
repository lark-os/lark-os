// ---- larkboot.js
// LarkOS boot animation timing: a line-for-line copy of larkBoot.h for the
// browser preview. Change both together; test_diff checks they agree.
(function (root) {
  'use strict';

  const T = {
    reveal: 320, crouch: 300, liftOff: 440, climbTop: 1060, turn: 1660, land: 2040,
    sing: 2240, fillEnd: 2560, minEnd: 2640, outro: 260, phrase: 1180, windEvery: 78,
  };
  T.windFirst = T.liftOff + T.windEvery;
  T.windLast = T.land - 160;

  const Phase = { reveal: 0, crouch: 1, flight: 2, settle: 3, sing: 4, outro: 5, done: 6 };
  const Pose = {
    stand: 0, crouch: 1, flap0: 2, flap1: 3, flap2: 4, flap3: 5, flap4: 6, flap5: 7,
    glide: 8, flare: 9, perch: 10, sing: 11, count: 12,
  };
  const kMaxNotes = 32;
  const kSongAt = [0, 120, 240, 330, 420, 600, 690, 780, 870, 1010];
  const kSongEvents = kSongAt.length;
  const kBeakOpenMs = 70;
  const kSongNote = [1, 0, 1, 0, 1, 1, 0, 1, 0, 1];

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smooth = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };

  function rnd(i, salt) {
    let h = (Math.imul(i, 2654435761) ^ (((Math.imul(salt, 2246822519) >>> 0) + 0x9E3779B9) >>> 0)) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
    h = Math.imul(h, 2246822519) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 3266489917) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return (h & 0xFFFFFF) / 0x1000000;
  }

  function legAt(g, t, p, v) {
    const d = g.t1 - g.t0;
    const s = clamp01((t - g.t0) / d);
    const s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s;
    const h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    const d00 = 6 * s2 - 6 * s, d10 = 3 * s2 - 4 * s + 1;
    const d01 = -6 * s2 + 6 * s, d11 = 3 * s2 - 2 * s;
    p.x = h00 * g.p0.x + h10 * d * g.v0.x + h01 * g.p1.x + h11 * d * g.v1.x;
    p.y = h00 * g.p0.y + h10 * d * g.v0.y + h01 * g.p1.y + h11 * d * g.v1.y;
    v.x = (d00 * g.p0.x + d10 * d * g.v0.x + d01 * g.p1.x + d11 * d * g.v1.x) / d;
    v.y = (d00 * g.p0.y + d10 * d * g.v0.y + d01 * g.p1.y + d11 * d * g.v1.y) / d;
  }

  function flapPose(since, cycle) {
    const k = (since % cycle) / cycle;
    let i = Math.trunc(k * 6);
    if (i > 5) i = 5;
    return Pose.flap0 + i;
  }

  class Timeline {
    start(nowMs, layout) {
      this.lay = layout;
      this.t0 = nowMs >>> 0;
      this.lastT = 0;
      this.bestReal = 0;
      this.shown = 0;
      this.outroAt = 0;
      this.outroFrom = 0;
      this.inOutro = false;
      this.done = false;
      const lay = layout;
      const turnAt = { x: lay.perch.x - 100, y: lay.perch.y - 40 };
      if (turnAt.x < 92) turnAt.x = 92;
      if (turnAt.y < lay.top.y + 40) turnAt.y = lay.top.y + 40;
      this.legs = [
        { t0: T.liftOff, t1: T.climbTop, p0: lay.ground, v0: { x: -0.10, y: -0.36 }, p1: lay.top, v1: { x: -0.50, y: 0 } },
        { t0: T.climbTop, t1: T.turn, p0: lay.top, v0: { x: -0.50, y: 0 }, p1: turnAt, v1: { x: 0, y: 0.16 } },
        { t0: T.turn, t1: T.land, p0: turnAt, v0: { x: 0, y: 0.16 }, p1: lay.perch, v1: { x: 0, y: 0 } },
      ];
      this.f = { bird: {}, notes: [] };
    }

    finished() { return this.done; }

    update(nowMs, realProgress, loadEnded) {
      const f = this.f;
      const t = ((nowMs >>> 0) - this.t0) >>> 0;
      let dt = t - this.lastT;
      if (t < this.lastT) dt = 0;
      this.lastT = t;

      if (realProgress < 0) realProgress = 0;
      if (realProgress > 100) realProgress = 100;
      if (loadEnded) realProgress = 100;
      if (realProgress > this.bestReal) this.bestReal = realProgress;

      f.t = t;
      f.reveal = smooth(t / T.reveal);

      const cap = 100 * clamp01((t - T.reveal) / (T.fillEnd - T.reveal));
      const target = this.bestReal < cap ? this.bestReal : cap;
      if (!this.inOutro && loadEnded && t >= T.minEnd) {
        this.inOutro = true;
        this.outroAt = t;
        this.outroFrom = this.shown;
      }
      if (this.inOutro) {
        const u = clamp01((t - this.outroAt) / T.outro);
        const e = 1 - (1 - u) * (1 - u);
        this.shown = this.outroFrom + (100 - this.outroFrom) * e;
        f.fade = 1 - smooth((u - 0.3) / 0.7);
        if (u >= 1) {
          this.done = true;
          this.shown = 100;
          f.fade = 0;
        }
      } else {
        if (this.shown < target) {
          this.shown += (target - this.shown) * (1 - Math.exp(-dt / 110));
          if (this.shown > target) this.shown = target;
        }
        f.fade = 1;
      }
      f.progress = this.shown;
      f.waveEnd = this.lay.waveLeft + (this.lay.waveRight - this.lay.waveLeft) * this.shown / 100;
      f.finished = this.done;

      this.birdAt(t, f.bird);
      f.bird.alpha = smooth(t / 200);

      if (this.done) f.phase = Phase.done;
      else if (this.inOutro) f.phase = Phase.outro;
      else if (t < T.crouch) f.phase = Phase.reveal;
      else if (t < T.liftOff) f.phase = Phase.crouch;
      else if (t < T.land) f.phase = Phase.flight;
      else if (t < T.sing) f.phase = Phase.settle;
      else f.phase = Phase.sing;

      this.notesAt(t);
      f.song = this.songLevel(t);
      return f;
    }

    flightAt(t, p, v) {
      const g = t < T.climbTop ? this.legs[0] : t < T.turn ? this.legs[1] : this.legs[2];
      legAt(g, t, p, v);
    }

    songEnd() { return this.inOutro ? this.outroAt : 1e9; }

    birdAt(t, b) {
      const lay = this.lay;
      b.beak = 0; b.angle = 0; b.vx = 0; b.vy = 0;
      if (t < T.liftOff) {
        b.x = lay.ground.x; b.y = lay.ground.y; b.facing = -1;
        b.pose = t < T.crouch ? Pose.stand : Pose.crouch;
        return;
      }
      if (t < T.land) {
        const p = {}, v = {};
        this.flightAt(t, p, v);
        b.x = p.x; b.y = p.y; b.vx = v.x; b.vy = v.y;
        b.facing = t < T.turn ? -1 : 1;
        let pose;
        if (t < T.climbTop) pose = flapPose(t - T.liftOff, 90);
        else if (t < T.turn - 180) {
          const k = (t - T.climbTop) % 520;
          pose = k < 360 ? flapPose(k, 90) : Pose.glide;
        } else if (t < T.turn + 120) pose = Pose.flare;
        else if (t < T.land - 200) pose = flapPose(t - (T.turn + 120), 120);
        else pose = Pose.flare;
        b.pose = pose;

        const ax = v.x < 0 ? -v.x : v.x;
        let pitch = Math.atan2(v.y, ax);
        if (pitch < -0.45) pitch = -0.45;
        if (pitch > 0.55) pitch = 0.55;
        const wTurn = 1 - smooth(Math.abs(t - T.turn) / 220 - 0.4);
        const wLand = smooth((t - (T.land - 260)) / 120);
        const flare = wTurn > wLand ? wTurn : wLand;
        pitch = pitch + ((-0.3) - pitch) * flare;
        b.angle = b.facing * pitch;
        return;
      }
      b.facing = 1;
      b.x = lay.perch.x;
      const s = t - T.land;
      b.y = lay.perch.y + (s < 240 ? 3 * Math.sin(s / 240 * 3.14159265) * (1 - s / 240) : 0);
      b.pose = Pose.perch;
      if (t >= T.sing) {
        const open = this.beakOpen(t);
        b.beak = open;
        if (open > 0.01) b.pose = Pose.sing;
        b.angle = -0.12 * open;
      }
    }

    songEvent(n) {
      const cycle = Math.floor(n / kSongEvents);
      const j = n % kSongEvents;
      return T.sing + cycle * T.phrase + kSongAt[j];
    }

    lastSongEventBefore(t) {
      if (t < T.sing) return -1;
      const s = t - T.sing;
      const cycle = Math.trunc(s / T.phrase);
      const k = s - cycle * T.phrase;
      let j = 0;
      while (j + 1 < kSongEvents && kSongAt[j + 1] <= k) j++;
      return cycle * kSongEvents + j;
    }

    beakOpen(t) {
      if (t < T.sing) return 0;
      const end = this.songEnd();
      let best = 0;
      const last = this.lastSongEventBefore(t);
      for (let n = last; n >= 0 && n > last - 3; n--) {
        const at = this.songEvent(n);
        if (at >= end) continue;
        const s = t - at;
        if (s < 0 || s > kBeakOpenMs + 40) continue;
        const o = s < 20 ? s / 20 : s < kBeakOpenMs ? 1 : 1 - (s - kBeakOpenMs) / 40;
        if (o > best) best = o;
      }
      return best;
    }

    songLevel(t) {
      const last = this.lastSongEventBefore(t);
      const end = this.songEnd();
      let sum = 0;
      for (let n = last; n >= 0 && n > last - 6; n--) {
        const at = this.songEvent(n);
        if (at >= end) continue;
        sum += Math.exp(-(t - at) / 140);
      }
      return sum > 1 ? 1 : sum;
    }

    notesAt(t) {
      const f = this.f;
      const notes = [];
      let dropped = 0;
      const add = (n) => { if (notes.length < kMaxNotes) notes.push(n); else dropped++; };
      const lifeShape = (age, life, n) => {
        const a = age / life;
        n.age = a;
        n.alpha = clamp01(age / 80) * (a < 0.45 ? 1 : clamp01(1 - (a - 0.45) / 0.55));
        n.scale = (0.6 + 0.4 * clamp01(age / 140)) * (1 - 0.25 * a);
      };
      for (let i = 0; ; i++) {
        const ts = T.windFirst + i * T.windEvery + Math.trunc(rnd(i, 8) * 34);
        if (ts > T.windLast) break;
        const life = 900 + 500 * rnd(i, 1);
        const age = t - ts;
        if (age < 0 || age >= life) continue;
        const p = {}, v = {};
        this.flightAt(ts, p, v);
        const facing = ts < T.turn ? -1 : 1;
        const dx = -v.x * 0.3, dy = -v.y * 0.3 - 0.022;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = len > 1e-6 ? -dy / len : 0, ny = len > 1e-6 ? dx / len : 1;
        const side = (rnd(i, 9) - 0.5) * 16;
        const sx = p.x - facing * 22 + nx * side, sy = p.y - 14 + ny * side;
        const drift = age * (1 - age / (2 * life));
        const amp = (12 + 16 * rnd(i, 2)) * (age / life);
        const w = 6.2831853 / (600 + 400 * rnd(i, 3));
        const curl = amp * Math.sin(age * w + 6.2831853 * rnd(i, 4));
        const n = {
          x: sx + dx * drift + nx * curl,
          y: sy + dy * drift + ny * curl,
          angle: 0.4 * Math.sin(age * 0.005 + 6.2831853 * rnd(i, 5)),
          kind: Math.trunc(rnd(i, 6) * 3),
          lane: Math.trunc(rnd(i, 7) * 5),
          song: 0,
          born: ts,
        };
        lifeShape(age, life, n);
        n.scale *= 0.62 + 0.38 * rnd(i, 10);
        add(n);
      }
      const last = this.lastSongEventBefore(t);
      const end = this.songEnd();
      for (let k = last - 14; k <= last; k++) {
        if (k < 0) continue;
        const at = this.songEvent(k);
        if (at >= end) continue;
        const life = 1000 + 200 * rnd(k, 11);
        const age = t - at;
        if (age < 0 || age >= life) continue;
        if (!kSongNote[k % kSongEvents]) continue;
        const dir = -(0.35 + 0.75 * rnd(k, 12));
        const reach = 78 + 40 * rnd(k, 13);
        const u = age / life;
        const out = 1 - (1 - u) * (1 - u) * (1 - u);
        const sway = 5 * Math.sin(age * 0.009 + 6.2831853 * rnd(k, 14)) * u;
        const cx = Math.cos(dir), cy = Math.sin(dir);
        const n = {
          x: this.lay.perch.x + 38 + cx * reach * out - cy * sway,
          y: this.lay.perch.y - 46 + cy * reach * out + cx * sway,
          angle: 0.25 * Math.sin(age * 0.005 + 6.2831853 * rnd(k, 15)),
          kind: Math.trunc(rnd(k, 16) * 3),
          lane: Math.trunc(rnd(k, 17) * 5),
          song: 1,
          born: at,
        };
        lifeShape(age, life, n);
        n.scale *= 0.75 + 0.25 * rnd(k, 18);
        add(n);
      }
      f.notes = notes;
      f.noteCount = notes.length;
      f.notesDropped = dropped;
    }
  }

  const api = { T, Phase, Pose, Timeline, rnd, clamp01, smooth, kMaxNotes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LarkBoot = api;
})(typeof window !== 'undefined' ? window : this);

// ---- art.js
// Geometry for the boot screen: the lark in each pose, two letter
// skeletons for "LarkOS", note glyphs. Everything is point lists, so each
// design can fill, stroke, pixelate or ink them as it likes. Sprites are
// drawn from these once, as the firmware's bitmaps would be.
(function (root) {
  'use strict';
  const P = root.LarkBoot.Pose;

  // ---------------------------------------------------------------- paths
  class Path {
    constructor() { this.subs = []; this.cur = null; this.x = 0; this.y = 0; }
    M(x, y) { this.cur = { pts: [[x, y]], closed: false }; this.subs.push(this.cur); this.x = x; this.y = y; return this; }
    L(x, y) { this.cur.pts.push([x, y]); this.x = x; this.y = y; return this; }
    C(x1, y1, x2, y2, x, y, n = 16) {
      const x0 = this.x, y0 = this.y;
      for (let i = 1; i <= n; i++) {
        const t = i / n, m = 1 - t;
        this.cur.pts.push([m * m * m * x0 + 3 * m * m * t * x1 + 3 * m * t * t * x2 + t * t * t * x,
          m * m * m * y0 + 3 * m * m * t * y1 + 3 * m * t * t * y2 + t * t * t * y]);
      }
      this.x = x; this.y = y; return this;
    }
    // arc in degrees, clockwise when a1 > a0 (screen y down)
    A(cx, cy, r, a0, a1, n = 28, ry = r, rot = 0) {
      const cr = Math.cos(rot), sr = Math.sin(rot);
      for (let i = 0; i <= n; i++) {
        const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180;
        const ex = r * Math.cos(a), ey = ry * Math.sin(a);
        const p = [cx + ex * cr - ey * sr, cy + ex * sr + ey * cr];
        if (!this.cur) { this.cur = { pts: [p], closed: false }; this.subs.push(this.cur); }
        else if (i === 0 && this.cur.pts.length) { this.cur.pts.push(p); }
        else this.cur.pts.push(p);
      }
      const last = this.cur.pts[this.cur.pts.length - 1];
      this.x = last[0]; this.y = last[1]; return this;
    }
    Z() { this.cur.closed = true; return this; }
  }
  const path = () => new Path();

  function xf(subs, o) {
    const c = Math.cos(o.r || 0), s = Math.sin(o.r || 0);
    const sx = o.sx == null ? 1 : o.sx, sy = o.sy == null ? 1 : o.sy;
    const ox = o.ox || 0, oy = o.oy || 0, tx = o.x || 0, ty = o.y || 0, sk = o.skew || 0;
    return subs.map((sp) => ({
      closed: sp.closed,
      pts: sp.pts.map(([x, y]) => {
        let px = (x - ox) * sx + (y - oy) * sk, py = (y - oy) * sy;
        return [ox + tx + px * c - py * s, oy + ty + px * s + py * c];
      }),
    }));
  }

  function trace(ctx, subs) {
    ctx.beginPath();
    for (const sp of subs) {
      sp.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (sp.closed) ctx.closePath();
    }
  }

  function lengthOf(pts) {
    let l = 0;
    for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return l;
  }

  function resample(pts, step) {
    const out = [pts[0]];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const seg = Math.hypot(x1 - x0, y1 - y0);
      let d = step - acc;
      while (d <= seg) {
        const t = d / seg;
        out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
        d += step;
      }
      acc = seg - (d - step);
    }
    const last = pts[pts.length - 1];
    const ol = out[out.length - 1];
    if (Math.hypot(last[0] - ol[0], last[1] - ol[1]) > 0.5) out.push(last);
    return out;
  }

  // ------------------------------------------------------------- the lark
  // Facing right, feet at (0,0), y down. About 70 px tail to beak.
  const wingOutline = [[0, 0], [0.3, -0.07], [0.62, -0.05], [0.86, 0.06], [1.0, 0.24], [0.98, 0.4], [0.92, 0.52],
    [0.83, 0.63], [0.7, 0.74], [0.52, 0.83], [0.32, 0.9], [0.12, 0.93], [-0.04, 0.72]];

  function wing(shoulder, elev, opts) {
    const e = elev * Math.PI / 180;
    const z = Math.cos(e), up = Math.sin(e);
    const fwd = opts.forward || 0;
    const back = -0.3 * (1 - fwd) + fwd * 0.55;
    // Seen from the side and a little above: a wing held out toward us
    // sweeps back over the body.
    const span = opts.far ? [back + z * 0.1, -up - z * 0.45] : [back - z * 0.78, -up - z * 0.16];
    const L = 45 * (opts.flex ? 0.66 : 1);
    const C = opts.flex ? 16 : 21;
    const sl = Math.hypot(span[0], span[1]) || 1;
    let chord = [-span[1] / sl, span[0] / sl];
    if (chord[0] > 0.05 || (Math.abs(chord[0]) <= 0.05 && chord[1] < 0)) chord = [-chord[0], -chord[1]];
    const map = ([u, v]) => [shoulder[0] + u * span[0] * L + v * chord[0] * C, shoulder[1] + u * span[1] * L + v * chord[1] * C];
    const outline = wingOutline.map(map);
    // primaries: lines from the middle of the wing out to the tip edge
    const feathers = [];
    for (let k = 0; k < 5; k++) {
      const a = map([0.5 + k * 0.03, 0.28 + k * 0.1]);
      const b = map([0.98 - k * 0.06, 0.32 + k * 0.1]);
      feathers.push([a, b]);
    }
    const coverts = [map([0.08, 0.36]), map([0.4, 0.4]), map([0.62, 0.3])];
    const trailing = [map([0.7, 0.74]), map([0.52, 0.83]), map([0.32, 0.9]), map([0.12, 0.93])];
    return { outline, feathers, coverts, trailing };
  }

  // Wingbeat: elevation of each flap frame (degrees), and whether the wing is
  // folded for the upstroke.
  const FLAP = [[76, 0], [42, 0], [6, 0], [-34, 0], [-58, 0], [18, 1]];

  function birdParts(pose, beak) {
    const perched = pose === P.stand || pose === P.perch || pose === P.sing || pose === P.crouch;
    const flare = pose === P.flare;
    const parts = { pose };

    // Tail: folded when perched, fanned in flight, dropped for the flare.
    const tail = perched
      ? [[-24, -15], [-41, -9], [-43, -14], [-23, -23]]
      : flare ? [[-22, -15], [-38, -1], [-44, -7], [-41, -16], [-21, -23]]
        : [[-24, -16], [-43, -9], [-47, -15], [-43, -21], [-23, -23]];
    const body = path().M(21, -31).C(22, -20, 14, -7, 0, -7).C(-10, -7, -18, -11, tail[0][0], tail[0][1]);
    for (let i = 1; i < tail.length; i++) body.L(tail[i][0], tail[i][1]);
    body.C(-14, -31, 0, -34, 6, -37).C(8, -43, 14, -46, 19, -42).C(21, -40, 22, -38, 22, -35).Z();
    parts.body = body.subs;
    parts.tailEdge = [tail[1], tail[2]]; // white outer tail feathers
    parts.belly = path().M(18, -24).C(14, -12, 4, -8, -6, -8).C(-14, -9, -18, -12, -21, -15).C(-8, -14, 6, -16, 18, -24).Z().subs;
    parts.crest = path().M(8.5, -41.5).L(3.5, -50).L(12.5, -44.5).Z().subs;
    parts.eye = [15.6, -38.6];
    parts.brow = path().M(12, -41.8).C(14, -43.4, 18, -42.8, 20.4, -40.6, 8).subs;
    parts.cheek = path().M(13, -36).C(15, -33.5, 18, -33.5, 20, -35, 8).subs;
    // Beak: upper and lower mandibles, opened about the gape.
    const open = Math.max(0, Math.min(1, beak));
    const rotAbout = (pts, ox, oy, a) => pts.map(([x, y]) => [ox + (x - ox) * Math.cos(a) - (y - oy) * Math.sin(a), oy + (x - ox) * Math.sin(a) + (y - oy) * Math.cos(a)]);
    parts.beakUpper = [{ closed: true, pts: rotAbout([[21.6, -36.4], [30, -33.4], [21.8, -32.9]], 22, -33.6, -0.42 * open) }];
    parts.beakLower = [{ closed: true, pts: rotAbout([[21.6, -33.4], [28.6, -32.9], [21, -30.6]], 22, -32.4, 0.38 * open) }];
    parts.gape = open > 0.05 ? [{ closed: true, pts: [[22, -33.6], parts.beakUpper[0].pts[1], parts.beakLower[0].pts[1], [21.4, -31.8]] }] : [];
    // Breast streaks.
    parts.streaks = [[[16, -27], [14, -24.5]], [[12, -26], [10, -23]], [[17, -23], [15.5, -20.5]], [[9, -22], [7.5, -19.5]], [[13, -21], [11.5, -18]]];

    if (perched) {
      parts.wingFold = path().M(9, -29).C(2, -35, -14, -31, -32, -19).C(-20, -15, -6, -17, 6, -22).Z().subs;
      parts.foldLines = [[[2, -30], [-18, -22]], [[-4, -27], [-26, -19]], [[-10, -25], [-31, -19.5]]];
      parts.legs = [[[-3, -8], [-2, 0]], [[2, -8], [3, 0]]];
      parts.toes = [[[-2, 0], [6, 0.4]], [[3, 0], [10, 0.4]], [[-2, 0], [-10, 0.6]], [[3, 0], [-5, 0.6]]];
    } else if (flare) {
      parts.legs = [[[-4, -10], [-1, -1]], [[0, -10], [4, 0]]];
      parts.toes = [[[-1, -1], [4, 0]], [[4, 0], [9, 0.4]], [[-1, -1], [-6, -0.5]]];
    } else {
      parts.legs = [];
      parts.toes = [];
    }

    if (!perched) {
      let elev, flex = 0, forward = 0;
      if (pose >= P.flap0 && pose <= P.flap5) [elev, flex] = FLAP[pose - P.flap0];
      else if (pose === P.glide) elev = 10;
      else { elev = 84; forward = 0.3; }
      parts.farWing = wing([8, -30], elev, { far: true, flex, forward });
      parts.nearWing = wing([4, -27], elev, { far: false, flex, forward });
    }

    let all = ['body', 'belly', 'crest', 'brow', 'cheek', 'beakUpper', 'beakLower', 'gape', 'wingFold'];
    // Crouch: lower, leaning forward, legs bent.
    if (pose === P.crouch) {
      const o = { r: 0.16, ox: 0, oy: 0, y: 3 };
      for (const k of all) if (parts[k]) parts[k] = xf(parts[k], o);
      const pt = (p) => xf([{ pts: [p] }], o)[0].pts[0];
      parts.eye = pt(parts.eye);
      parts.streaks = parts.streaks.map((s) => s.map(pt));
      parts.foldLines = parts.foldLines.map((s) => s.map(pt));
      parts.tailEdge = parts.tailEdge.map(pt);
      parts.legs = [[[-1, -5], [-2, 0]], [[3, -5], [3, 0]]];
    }
    return parts;
  }

  // ------------------------------------------------------------ the word
  // Two skeletons, cap height 96, baseline at y = 0. Each letter: strokes
  // (point lists, open), advance, and for L the perch: the top of its stem.
  const GEO = {
    L: () => ({ s: [path().M(0, -104).L(0, 0).L(50, 0)], adv: 50, perch: [0, -104] }),
    a: () => ({ s: [path().A(26, -26, 26, 0, 360, 48), path().M(52, -52).L(52, 0)], adv: 52 }),
    r: () => ({ s: [path().M(0, -52).L(0, 0), path().A(28, -24, 28, 180, 266, 20)], adv: 30 }),
    k: () => ({ s: [path().M(0, -104).L(0, 0), path().M(40, -52).L(2, -22), path().M(14, -32).L(42, 0)], adv: 42 }),
    O: () => ({ s: [path().A(48, -48, 48, 0, 360, 72)], adv: 96 }),
    S: () => ({ s: [path().A(31, -73, 23, -18, -270, 40).A(31, -25, 25, -90, 162, 44)], adv: 58 }),
  };
  const ITAL = {
    L: () => ({ s: [path().M(6, -98).C(12, -106, 24, -106, 26, -98).C(22, -70, 12, -30, 6, -8).C(4, 0, 12, 2, 22, -1).C(34, -4, 46, -4, 56, 0)], adv: 54, perch: [26, -100] }),
    a: () => ({ s: [path().M(44, -42).C(34, -56, 8, -52, 4, -26).C(1, -6, 22, -2, 34, -18).C(38, -26, 42, -40, 45, -50).C(41, -30, 37, -12, 40, -4).C(43, 2, 50, 0, 56, -6)], adv: 52 }),
    r: () => ({ s: [path().M(2, -2).C(6, -18, 9, -34, 12, -50), path().M(10, -36).C(16, -48, 26, -54, 36, -47)], adv: 34 }),
    k: () => ({ s: [path().M(26, -102).C(20, -70, 12, -34, 4, 0), path().M(40, -52).C(28, -40, 18, -34, 11, -30).C(20, -26, 26, -10, 36, -2).C(40, 1, 44, 0, 48, -4)], adv: 46 }),
    O: () => ({ s: [path().A(44, -48, 36, 0, 360, 72, 48, 0.2)], adv: 88 }),
    S: () => ({ s: [path().M(66, -88).C(58, -102, 24, -100, 22, -78).C(20, -56, 62, -52, 58, -24).C(54, 2, 14, 4, 2, -14)], adv: 66 }),
  };

  // Lays "LarkOS" out: returns strokes in screen space, the box and the
  // perch (top of the L's stem).
  function word(set, o) {
    const gaps = o.gaps || [14, 12, 12, 18, 14];
    const letters = ['L', 'a', 'r', 'k', 'O', 'S'];
    let x = 0;
    const raw = [];
    let perch = null;
    letters.forEach((ch, i) => {
      const g = set[ch]();
      const subs = [].concat(...g.s.map((p) => p.subs));
      raw.push({ ch, subs: xf(subs, { x }), x0: x, adv: g.adv });
      if (g.perch) perch = [x + g.perch[0], g.perch[1]];
      x += g.adv + (i < gaps.length ? gaps[i] : 0);
    });
    const width = x;
    const s = o.scale || 1, sxx = (o.stretch || 1) * s;
    const ox = o.cx - width * sxx / 2, oy = o.baseline;
    const place = (subs) => subs.map((sp) => ({ closed: sp.closed, pts: sp.pts.map(([px, py]) => [ox + px * sxx + (o.slant || 0) * -py * s, oy + py * s]) }));
    const letterList = raw.map((l) => ({ ch: l.ch, subs: place(l.subs) }));
    const all = [].concat(...letterList.map((l) => l.subs));
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const sp of all) for (const [px, py] of sp.pts) { minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py); }
    const perchPt = [ox + perch[0] * sxx + (o.slant || 0) * -perch[1] * s, oy + perch[1] * s];
    return { letters: letterList, subs: all, box: { minX, maxX, minY, maxY }, perch: perchPt };
  }

  // -------------------------------------------------------------- notes
  // Three glyphs, about 26 px tall, centred on (0,0): eighth note, two
  // beamed eighths, beamed sixteenths.
  function noteGlyph(kind) {
    const head = (cx, cy) => path().A(cx, cy, 5.2, 0, 360, 20, 3.8, -0.42).Z().subs;
    if (kind === 0) {
      return {
        heads: [head(-3, 9)],
        stems: [[[1.6, 8], [1.6, -13]]],
        flags: [path().M(1.6, -13).C(3, -8, 9, -7, 8.5, 1).C(7.4, -4, 4.5, -5.5, 1.6, -7).Z().subs],
      };
    }
    if (kind === 1) {
      return {
        heads: [head(-8, 10), head(6, 7)],
        stems: [[[-3.4, 9], [-3.4, -12]], [[10.6, 6], [10.6, -15]]],
        flags: [path().M(-3.4, -12).L(10.6, -15).L(10.6, -10.5).L(-3.4, -7.5).Z().subs],
      };
    }
    return {
      heads: [head(-8, 9), head(6, 9)],
      stems: [[[-3.4, 8], [-3.4, -13]], [[10.6, 8], [10.6, -13]]],
      flags: [path().M(-3.4, -13).L(10.6, -13).L(10.6, -9.6).L(-3.4, -9.6).Z().subs,
        path().M(-3.4, -7.4).L(10.6, -7.4).L(10.6, -4).L(-3.4, -4).Z().subs],
    };
  }

  root.LarkArt = { path, Path, xf, trace, lengthOf, resample, birdParts, word, GEO, ITAL, noteGlyph };
})(typeof window !== 'undefined' ? window : globalThis);

// ---- eve.js
// A stand-in for the Tracker's screen chip (FT812) on a 2D canvas. Only
// what the chip can do: bitmaps (tinted, faded, scaled, turned, mirrored),
// points, lines, line strips, rectangles, linear gradients, scissor,
// additive blending, and text from a bitmap font. Each call also counts the
// display-list words the firmware would send, so a design can be held to
// the budget: about 2,040 words a frame.
(function (root) {
  'use strict';

  const BUDGET = 2040;

  class Eve {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.words = 0;
      this.peak = 0;
      this.lastSprite = null;
      this.blend = 'normal';
    }

    resetPeak() { this.peak = 0; }

    frame(bg) {
      const x = this.ctx;
      x.setTransform(this.canvas.width / 800, 0, 0, this.canvas.height / 480, 0, 0);
      x.globalAlpha = 1;
      x.globalCompositeOperation = 'source-over';
      x.fillStyle = bg;
      x.fillRect(0, 0, 800, 480);
      this.words = 4; // clear colour, clear, vertex format, display
      this.lastSprite = null;
      this.blend = 'normal';
    }

    end() { if (this.words > this.peak) this.peak = this.words; }

    setBlend(add) {
      const b = add ? 'add' : 'normal';
      if (b !== this.blend) { this.words += 1; this.blend = b; }
      this.ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
    }

    gradient(x0, y0, c0, x1, y1, c1, box) {
      const x = this.ctx;
      const g = x.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, c0);
      g.addColorStop(1, c1);
      x.globalAlpha = 1;
      x.globalCompositeOperation = 'source-over';
      x.fillStyle = g;
      if (box) { x.fillRect(box[0], box[1], box[2], box[3]); this.words += 4; }
      else x.fillRect(0, 0, 800, 480);
      this.words += 25;
    }

    // Draws inside a box only; pass null to end.
    scissor(box) {
      const x = this.ctx;
      if (box) { x.save(); x.beginPath(); x.rect(box[0], box[1], box[2], box[3]); x.clip(); }
      else x.restore();
      this.words += 2;
    }

    // A sprite: o.ax/o.ay its anchor, angle (radians), sx/sy scale (sx -1
    // mirrors), alpha, add (additive).
    bitmap(spr, px, py, o = {}) {
      if (!spr || !(o.alpha === undefined || o.alpha > 0.004)) return;
      const x = this.ctx;
      if (spr !== this.lastSprite) { this.words += 6; this.lastSprite = spr; }
      this.setBlend(!!o.add);
      const turned = (o.angle || 0) !== 0 || (o.sx != null && o.sx !== 1) || (o.sy != null && o.sy !== 1);
      this.words += 2 + (turned ? 7 : 0);
      x.save();
      x.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
      x.translate(px, py);
      if (o.angle) x.rotate(o.angle);
      x.scale(o.sx == null ? 1 : o.sx, o.sy == null ? 1 : o.sy);
      x.imageSmoothingEnabled = !o.nearest;
      x.drawImage(spr, -(o.ax || 0), -(o.ay || 0));
      x.restore();
    }

    points(list, color, o = {}) {
      if (!list.length) return;
      const x = this.ctx;
      this.setBlend(!!o.add);
      this.words += 3;
      x.fillStyle = color;
      let lastR = -1;
      for (const p of list) {
        if (p.r !== lastR) { this.words += 1; lastR = p.r; }
        this.words += 1 + (p.a !== undefined ? 1 : 0);
        x.globalAlpha = (o.alpha === undefined ? 1 : o.alpha) * (p.a === undefined ? 1 : p.a);
        x.beginPath();
        x.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        x.fill();
      }
      x.globalAlpha = 1;
    }

    // Separate segments [x0, y0, x1, y1, alpha?].
    lines(segs, width, color, o = {}) {
      if (!segs.length) return;
      const x = this.ctx;
      this.setBlend(!!o.add);
      this.words += 4;
      x.strokeStyle = color;
      x.lineWidth = width;
      x.lineCap = 'round';
      for (const s of segs) {
        this.words += 2 + (s[4] !== undefined ? 1 : 0);
        x.globalAlpha = (o.alpha === undefined ? 1 : o.alpha) * (s[4] === undefined ? 1 : s[4]);
        x.beginPath();
        x.moveTo(s[0], s[1]);
        x.lineTo(s[2], s[3]);
        x.stroke();
      }
      x.globalAlpha = 1;
    }

    strip(pts, width, color, o = {}) {
      if (pts.length < 2) return;
      const x = this.ctx;
      this.setBlend(!!o.add);
      this.words += 4 + pts.length;
      x.strokeStyle = color;
      x.lineWidth = width;
      x.lineCap = 'round';
      x.lineJoin = 'round';
      x.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
      x.beginPath();
      pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])));
      x.stroke();
      x.globalAlpha = 1;
    }

    rect(x0, y0, x1, y1, color, o = {}) {
      const x = this.ctx;
      this.setBlend(!!o.add);
      this.words += 5;
      x.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
      x.fillStyle = color;
      x.fillRect(x0, y0, x1 - x0, y1 - y0);
      x.globalAlpha = 1;
    }

    // Many small rectangles in one go (pixel designs).
    rects(list, color, o = {}) {
      if (!list.length) return;
      const x = this.ctx;
      this.setBlend(!!o.add);
      this.words += 3;
      x.fillStyle = color;
      for (const r of list) {
        this.words += 2 + (r[4] !== undefined ? 1 : 0);
        x.globalAlpha = (o.alpha === undefined ? 1 : o.alpha) * (r[4] === undefined ? 1 : r[4]);
        x.fillRect(r[0], r[1], r[2], r[3]);
      }
      x.globalAlpha = 1;
    }

    // A small tile repeated over a box: one bitmap with REPEAT wrapping on
    // the chip, so one draw whatever the box's size.
    pattern(tile, box, o = {}) {
      const x = this.ctx;
      if (!tile.__pat) tile.__pat = x.createPattern(tile, 'repeat');
      if (tile !== this.lastSprite) { this.words += 6; this.lastSprite = tile; }
      this.setBlend(!!o.add);
      this.words += 6;
      x.save();
      x.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
      x.translate(o.ox || 0, o.oy || 0);
      x.fillStyle = tile.__pat;
      x.fillRect(box[0] - (o.ox || 0), box[1] - (o.oy || 0), box[2], box[3]);
      x.restore();
    }

    // Text in the firmware's own font (Roboto Mono), one word a letter.
    text(str, px, py, size, color, o = {}) {
      const x = this.ctx;
      this.setBlend(false);
      this.words += 5 + str.length;
      x.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
      x.fillStyle = color;
      x.font = `${o.weight || 400} ${size}px "Roboto Mono", ui-monospace, monospace`;
      x.textAlign = o.align || 'left';
      x.textBaseline = 'alphabetic';
      x.fillText(str, px, py);
      x.globalAlpha = 1;
    }
  }

  root.Eve = Eve;
  root.EVE_BUDGET = BUDGET;
})(typeof window !== 'undefined' ? window : globalThis);

// ---- designs.js
// The five takes. Each builds its sprites once (as the firmware would hold
// them as bitmaps) and draws a frame from the timeline with Eve's calls
// only. layout() gives the timeline where the line, the perch and the
// ground are.
(function (root) {
  'use strict';
  const A = root.LarkArt, LB = root.LarkBoot, Pose = LB.Pose, T = LB.T;

  // ------------------------------------------------------------- helpers
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  function fill(x, subs, color, alpha = 1) { if (!subs || !subs.length) return; x.globalAlpha = alpha; x.fillStyle = color; A.trace(x, subs); x.fill(); x.globalAlpha = 1; }
  function stroke(x, subs, color, w, alpha = 1) { if (!subs || !subs.length) return; x.globalAlpha = alpha; x.strokeStyle = color; x.lineWidth = w; x.lineCap = 'round'; x.lineJoin = 'round'; A.trace(x, subs); x.stroke(); x.globalAlpha = 1; }
  function poly(x, pts, color, w, alpha = 1) { if (!pts || pts.length < 2) return; stroke(x, [{ pts, closed: false }], color, w, alpha); }
  function dot(x, p, r, color) { x.fillStyle = color; x.beginPath(); x.arc(p[0], p[1], r, 0, 7); x.fill(); }
  const ease = (v) => LB.smooth(v);

  // Bytes a sprite takes in the chip's memory, over its used box.
  function spriteBytes(c, bpp) {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 4) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return 0;
    return Math.ceil((x1 - x0 + 1) * (y1 - y0 + 1) * bpp);
  }
  function box(c) {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 4) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return [x0, y0, x1, y1];
  }

  // Sprite canvases for the lark: one per pose, feet at (AX, AY).
  const BW = 190, BH = 150, AX = 96, AY = 112, BS = 1.24;
  function birdSprites(draw) {
    const out = [];
    for (let p = 0; p < Pose.count; p++) {
      const c = cv(BW, BH), x = c.getContext('2d');
      x.translate(AX, AY);
      x.scale(BS, BS);
      draw(x, A.birdParts(p, p === Pose.sing ? 1 : 0), p);
      out.push(c);
    }
    return out;
  }

  function drawBirdFlat(x, b, pal) {
    if (b.farWing) { fill(x, [{ pts: b.farWing.outline, closed: true }], pal.far); }
    for (const l of b.legs) poly(x, l, pal.legs, 1.5);
    for (const t of b.toes) poly(x, t, pal.legs, 1.1);
    fill(x, b.body, pal.body);
    fill(x, b.belly, pal.belly);
    if (pal.streak) for (const s of b.streaks) poly(x, s, pal.streak, 1.1);
    if (b.wingFold) { fill(x, b.wingFold, pal.wing); for (const s of b.foldLines) poly(x, s, pal.wingLine, 1); }
    fill(x, b.crest, pal.crest || pal.body);
    if (pal.tailEdge) poly(x, b.tailEdge, pal.tailEdge, 1.6);
    if (pal.brow) stroke(x, b.brow, pal.brow, 1.3);
    fill(x, b.gape, pal.gape);
    fill(x, b.beakUpper, pal.beak);
    fill(x, b.beakLower, pal.beak);
    dot(x, b.eye, 1.9, pal.eye);
    if (pal.eyeHi) dot(x, [b.eye[0] + 0.5, b.eye[1] - 0.6], 0.6, pal.eyeHi);
    if (b.nearWing) {
      fill(x, [{ pts: b.nearWing.outline, closed: true }], pal.wing);
      for (const f of b.nearWing.feathers) poly(x, f, pal.wingLine, 1);
      poly(x, b.nearWing.coverts, pal.wingLine, 1);
      if (pal.trailing) poly(x, b.nearWing.trailing, pal.trailing, 1.6);
    }
  }

  function noteSprites(draw) {
    return [0, 1, 2].map((k) => {
      const c = cv(48, 48), x = c.getContext('2d');
      x.translate(24, 24);
      draw(x, A.noteGlyph(k), k);
      return c;
    });
  }
  function drawNoteFlat(x, g, color, stem = 2.2) {
    for (const h of g.heads) fill(x, h, color);
    for (const s of g.stems) poly(x, s, color, stem);
    for (const f of g.flags) fill(x, f, color);
  }

  // A bird-song sample: bursts of trills along the line (0..1).
  function songEnv(u) {
    let e = 0.16;
    for (let i = 0; i < 11; i++) {
      const c = (i + 0.5) / 11 + (LB.rnd(i, 301) - 0.5) * 0.05;
      const w = 0.018 + 0.026 * LB.rnd(i, 302);
      const a = 0.45 + 0.55 * LB.rnd(i, 303);
      const g = a * Math.exp(-(((u - c) / w) ** 2));
      if (g > e) e = g;
    }
    return e;
  }

  // The line's shape up to where it has loaded: [[x, y]...].
  function wavePts(f, lay, o) {
    const pts = [];
    const x0 = lay.waveLeft, x1 = f.waveEnd;
    if (x1 <= x0 + 1) return pts;
    const step = o.step || 3;
    for (let x = x0; x <= x1 + 0.01; x += step) {
      const xx = Math.min(x, x1);
      const u = (xx - lay.waveLeft) / (lay.waveRight - lay.waveLeft);
      const near = Math.exp(-(x1 - xx) / 46);
      const ramp = Math.min(1, (xx - x0) / 18);
      const amp = o.amp * songEnv(u) * (1 + 0.9 * f.song * near) * ramp;
      pts.push([xx, lay.waveY - amp * Math.sin(xx * (o.freq || 0.34) + f.t * (o.speed || 0.011))]);
    }
    return pts;
  }

  // The lark's recent path, newest first: for trails behind it.
  function trail(tl, t, n, every) {
    const out = [];
    const end = Math.min(t, T.land);
    for (let k = 0; k < n; k++) {
      const tt = end - k * every;
      if (tt < T.liftOff || t < T.liftOff) break;
      const p = {}, v = {};
      tl.flightAt(tt, p, v);
      const len = Math.hypot(v.x, v.y) || 1;
      out.push({ x: p.x, y: p.y - 16, nx: -v.y / len, ny: v.x / len, age: (t - tt) });
    }
    return out;
  }

  function drawBird(eve, spr, f, o = {}) {
    const b = f.bird;
    const a = b.alpha * f.fade;
    if (o.glow) eve.bitmap(o.glow[b.pose], b.x, b.y, { ax: AX, ay: AY, angle: o.noTurn ? 0 : b.angle, sx: b.facing, alpha: a * o.glowAlpha, add: true });
    eve.bitmap(spr[b.pose], b.x, b.y, { ax: AX, ay: AY, angle: o.noTurn ? 0 : b.angle, sx: b.facing, alpha: a, nearest: o.nearest });
  }

  function drawNotes(eve, sprites, f, o = {}) {
    for (const n of f.notes) {
      const a = n.alpha * f.fade;
      if (a < 0.01) continue;
      const spr = (o.pick ? o.pick(n) : sprites)[n.kind];
      let x = n.x, y = n.y;
      if (o.snap) { x = Math.round(x / o.snap) * o.snap; y = Math.round(y / o.snap) * o.snap; }
      if (o.glow) eve.points([{ x, y, r: 10 * n.scale }], o.glow, { alpha: a * 0.22, add: true });
      eve.bitmap(spr, x, y, { ax: 24, ay: 24, angle: o.noTurn ? 0 : n.angle, sx: o.noScale ? 1 : n.scale, sy: o.noScale ? 1 : n.scale, alpha: a, nearest: o.nearest });
    }
  }

  function caption(eve, f, lay, color, o = {}) {
    eve.text('Opening last project...', (lay.waveLeft + lay.waveRight) / 2, lay.waveY + (o.dy || 44), 13, color, { align: 'center', alpha: f.reveal * f.fade * (o.alpha || 1) });
    eve.text('v1.0.0 LarkOS', 12, 466, 12, color, { alpha: f.reveal * f.fade * (o.alpha || 1) });
  }

  function layoutFrom(perch, left, right, waveY, top) {
    return { perch: { x: perch[0], y: perch[1] }, waveLeft: left, waveRight: right, waveY, ground: { x: right + 28, y: waveY }, top: { x: (left + right) / 2 + 30, y: top } };
  }

  // =====================================================================
  // 1. Field notes: a naturalist's sketchbook. Pencil lark, a word written
  // with a pen while you watch, notes in ink.
  // =====================================================================
  function fieldNotes() {
    const pal = { paper: '#E8ECE3', grid: '#CFDBDF', pencil: '#3B4046', ink: '#1E3C6B', wash: '#CDB99A', washDark: '#A68D6B', belly: '#F1ECDF', legs: '#8C6B5C' };
    const w = A.word(A.ITAL, { cx: 400, baseline: 258, scale: 1.02, gaps: [10, 8, 8, 16, 10] });
    const strokes = w.letters.map((l) => l.subs.map((s) => A.resample(s.pts, 3.2)));
    const flat = [].concat(...strokes);
    const total = flat.reduce((s, p) => s + p.length, 0);
    const lay = layoutFrom([w.perch[0], w.perch[1] - 3], w.box.minX - 4, w.box.maxX + 4, 318, 108);
    const birds = birdSprites((x, b) => {
      const sk = (subs, col, wd) => { stroke(x, subs, col, wd); stroke(x, A.xf(subs, { x: 0.45, y: 0.35 }), col, wd * 0.6, 0.5); };
      if (b.farWing) { fill(x, [{ pts: b.farWing.outline, closed: true }], pal.washDark, 0.55); sk([{ pts: b.farWing.outline, closed: true }], pal.pencil, 0.9); }
      for (const l of b.legs) poly(x, l, pal.legs, 1.3);
      for (const t of b.toes) poly(x, t, pal.legs, 1);
      fill(x, b.body, pal.wash, 0.92);
      fill(x, b.belly, pal.belly);
      for (const s of b.streaks) poly(x, s, pal.pencil, 0.9, 0.8);
      if (b.wingFold) { fill(x, b.wingFold, pal.washDark, 0.8); for (const s of b.foldLines) poly(x, s, pal.pencil, 0.8, 0.8); sk(b.wingFold, pal.pencil, 0.9); }
      fill(x, b.crest, pal.wash);
      sk(b.crest, pal.pencil, 1);
      sk(b.body, pal.pencil, 1.25);
      stroke(x, b.brow, pal.belly, 1.4);
      fill(x, b.gape, '#7A4E45');
      fill(x, b.beakUpper, '#6D6052');
      fill(x, b.beakLower, '#6D6052');
      dot(x, b.eye, 1.8, pal.ink);
      if (b.nearWing) {
        fill(x, [{ pts: b.nearWing.outline, closed: true }], pal.washDark, 0.85);
        for (const f of b.nearWing.feathers) poly(x, f, pal.pencil, 0.8, 0.85);
        poly(x, b.nearWing.coverts, pal.pencil, 0.8, 0.7);
        poly(x, b.nearWing.trailing, pal.belly, 1.4);
        sk([{ pts: b.nearWing.outline, closed: true }], pal.pencil, 1.1);
      }
    });
    const notes = noteSprites((x, g) => {
      for (const h of g.heads) { fill(x, h, pal.ink); stroke(x, h, pal.ink, 0.8); }
      for (const s of g.stems) poly(x, s, pal.ink, 1.8);
      for (const f of g.flags) fill(x, f, pal.ink);
    });
    // The notebook grid, under everything.
    const grid = [];
    for (let gx = 16; gx < 800; gx += 24) grid.push([gx, 0, gx, 480]);
    for (let gy = 12; gy < 480; gy += 24) grid.push([0, gy, 800, gy]);
    const bytes = birds.reduce((s, c) => s + spriteBytes(c, 2), 0) + notes.reduce((s, c) => s + spriteBytes(c, 1), 0);

    function draw(eve, f, tl) {
      eve.frame(pal.paper);
      eve.lines(grid, 1, pal.grid);
      // pencil swoosh behind the lark
      const tr = trail(tl, f.t, 26, 13);
      for (const off of [-5, 1, 6]) {
        const segs = [];
        for (let k = 1; k < tr.length; k++) {
          const p0 = tr[k - 1], p1 = tr[k];
          const fadeK = 1 - k / tr.length;
          const spread = off * (0.4 + k / tr.length);
          segs.push([p0.x + p0.nx * spread, p0.y + p0.ny * spread, p1.x + p1.nx * spread, p1.y + p1.ny * spread, 0.5 * fadeK * f.fade * (f.t < T.land + 300 ? 1 : Math.max(0, 1 - (f.t - T.land - 300) / 300))]);
        }
        eve.lines(segs, 1.1, pal.pencil);
      }
      // the word, written with a pen
      const writ = ease(f.t / 1350);
      let budget = writ * total;
      for (const s of flat) {
        if (budget <= 1) break;
        const n = Math.min(s.length, Math.ceil(budget));
        eve.strip(s.slice(0, n), 5.4, pal.ink, { alpha: f.fade });
        budget -= s.length;
      }
      // the loading line: pencil dashes, then ink
      const dashes = [];
      for (let x = lay.waveLeft; x < lay.waveRight; x += 12) dashes.push([x, lay.waveY, Math.min(x + 6, lay.waveRight), lay.waveY]);
      eve.lines(dashes, 1.2, pal.pencil, { alpha: 0.45 * f.reveal * f.fade });
      const wp = wavePts(f, lay, { amp: 15, freq: 0.3 });
      eve.strip(wp, 2.4, pal.ink, { alpha: f.fade });
      if (wp.length) eve.points([{ x: wp[wp.length - 1][0], y: wp[wp.length - 1][1], r: 3.2 }], pal.ink, { alpha: f.fade });
      drawNotes(eve, notes, f);
      drawBird(eve, birds, f);
      caption(eve, f, lay, pal.pencil);
    }
    return { id: 'field-notes', name: 'Field notes', blurb: 'A naturalist’s sketchbook: a pencil lark, the word written in ink as you watch, notes inked on the wind.', bg: pal.paper, swatch: [pal.paper, pal.ink, pal.wash], lay, draw, birds, notes, bytes };
  }

  // =====================================================================
  // 2. Chip: pixel art for a tracker. Sprite lark, chunky letters, a pulse
  // wave and a block cursor.
  // =====================================================================
  const PIX = {
    L: ['##......', '##......', '##......', '##......', '##......', '##......', '##......', '##......', '##......', '##......', '##......', '########', '########'],
    a: ['.######.', '########', '......##', '.#######', '########', '##....##', '##...###', '########', '.####.##'],
    r: ['##.####', '#######', '####...', '###....', '##.....', '##.....', '##.....', '##.....', '##.....'],
    k: ['##......', '##......', '##......', '##......', '##....##', '##...###', '##..###.', '##.###..', '#####...', '######..', '##..###.', '##...###', '##....##'],
    O: ['..######..', '.########.', '###....###', '##......##', '##......##', '##......##', '##......##', '##......##', '##......##', '##......##', '###....###', '.########.', '..######..'],
    S: ['..######.', '.########', '###....##', '##.......', '###......', '.######..', '..######.', '......###', '.......##', '.......##', '##....###', '#########', '.#######.'],
  };

  // Pixel lark: the flat lark drawn a third of the size, snapped to a
  // palette, outlined, then blown up three times (the firmware would keep
  // the small one and draw it three times the size).
  const PS = 3;
  function pixelBirds(pal, o = {}) {
    const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const palette = [pal.outline, pal.body, pal.wing, pal.belly, pal.beak, pal.eye].map(hex);
    const birds = [];
    for (let p = 0; p < Pose.count; p++) {
      const sw = Math.ceil(BW / PS), sh = Math.ceil(BH / PS);
      const s = cv(sw, sh), sx = s.getContext('2d');
      sx.translate(AX / PS, AY / PS);
      sx.scale(BS / PS, BS / PS);
      drawBirdFlat(sx, A.birdParts(p, p === Pose.sing ? 1 : 0), { far: o.far || pal.wing, legs: pal.beak, body: pal.body, belly: pal.belly, wing: pal.wing, wingLine: pal.wing, crest: pal.body, gape: pal.eye, beak: pal.beak, eye: pal.eye });
      const im = sx.getImageData(0, 0, sw, sh), d = im.data;
      const solid = new Uint8Array(sw * sh);
      for (let i = 0; i < sw * sh; i++) {
        if (d[i * 4 + 3] < 110) { d[i * 4 + 3] = 0; continue; }
        let best = 1, bd = 1e9;
        for (let k = 1; k < palette.length; k++) { const q = palette[k]; const dd = (d[i * 4] - q[0]) ** 2 + (d[i * 4 + 1] - q[1]) ** 2 + (d[i * 4 + 2] - q[2]) ** 2; if (dd < bd) { bd = dd; best = k; } }
        d[i * 4] = palette[best][0]; d[i * 4 + 1] = palette[best][1]; d[i * 4 + 2] = palette[best][2]; d[i * 4 + 3] = 255;
        solid[i] = 1;
      }
      if (o.outline !== false) {
        for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
          const i = y * sw + x;
          if (solid[i]) continue;
          const n = (x > 0 && solid[i - 1]) || (x < sw - 1 && solid[i + 1]) || (y > 0 && solid[i - sw]) || (y < sh - 1 && solid[i + sw]);
          if (n) { d[i * 4] = palette[0][0]; d[i * 4 + 1] = palette[0][1]; d[i * 4 + 2] = palette[0][2]; d[i * 4 + 3] = 255; }
        }
      }
      sx.setTransform(1, 0, 0, 1, 0, 0);
      sx.putImageData(im, 0, 0);
      const big = cv(BW, BH), bx = big.getContext('2d');
      bx.imageSmoothingEnabled = false;
      bx.drawImage(s, 0, 0, sw * PS, sh * PS);
      birds.push(big);
    }
    return birds;
  }
  // Pixel notes, 3 px pixels; an optional outline so they read on any sky.
  function pixNote(color, outline) {
    return noteSprites((x, g) => {
      const s = cv(18, 18), q = s.getContext('2d');
      q.translate(9, 9); q.scale(0.34, 0.34);
      drawNoteFlat(q, g, color, 4);
      const im = q.getImageData(0, 0, 18, 18), d = im.data;
      const on = new Uint8Array(324);
      for (let i = 0; i < 324; i++) { on[i] = d[i * 4 + 3] > 90 ? 1 : 0; d[i * 4 + 3] = on[i] ? 255 : 0; }
      if (outline) {
        const c = [parseInt(outline.slice(1, 3), 16), parseInt(outline.slice(3, 5), 16), parseInt(outline.slice(5, 7), 16)];
        for (let y = 0; y < 18; y++) for (let xx = 0; xx < 18; xx++) {
          const i = y * 18 + xx;
          if (on[i]) continue;
          if ((xx > 0 && on[i - 1]) || (xx < 17 && on[i + 1]) || (y > 0 && on[i - 18]) || (y < 17 && on[i + 18])) { d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255; }
        }
      }
      q.putImageData(im, 0, 0);
      x.imageSmoothingEnabled = false;
      x.drawImage(s, -27, -27, 54, 54);
    });
  }

  // Pixel letters: cells of a font laid out as "LarkOS" (or "LARKOS").
  function pixelWord(font, letters, C, base, gaps, stem) {
    const widthCells = letters.reduce((s, ch, i) => s + font[ch][0].length + (gaps[i] || 0), 0);
    const x0 = Math.round((400 - widthCells * C / 2) / C) * C;
    const cells = [];
    let cx = 0;
    letters.forEach((ch, i) => {
      const g = font[ch];
      g.forEach((row, r) => [...row].forEach((c, k) => { if (c === '#') cells.push([x0 + (cx + k) * C, base - (g.length - r) * C, i]); }));
      cx += g[0].length + (gaps[i] || 0);
    });
    const rows = font[letters[0]].length;
    return { cells, x0, right: x0 + widthCells * C, top: base - rows * C, perch: [x0 + stem * C / 2, base - rows * C], C };
  }
  function cellSprite(cells, C, color, dx = 0, dy = 0, into) {
    const c = into || cv(800, 480), x = c.getContext('2d');
    x.fillStyle = color;
    for (const [px, py] of cells) x.fillRect(px + dx, py + dy, C, C);
    return c;
  }

  function chip() {
    const pal = { bg: '#12142B', face: '#F6EDDA', shadow: '#4637A6', pink: '#FF7AA2', cyan: '#6FE3E1', dot: '#2B3064', star: '#B9BCF0', outline: '#1E1630', body: '#D9A35B', wing: '#7A4A2E', belly: '#F3E3C3', beak: '#3A2618' };
    const C = 7, base = 262, gaps = [2, 1, 1, 2, 1];
    const letters = ['L', 'a', 'r', 'k', 'O', 'S'];
    const widthCells = letters.reduce((s, ch, i) => s + PIX[ch][0].length + (gaps[i] || 0), 0);
    const x0 = Math.round((400 - widthCells * C / 2) / C) * C;
    const cells = [];
    let cx = 0;
    letters.forEach((ch, i) => {
      const g = PIX[ch];
      g.forEach((row, r) => [...row].forEach((c, k) => { if (c === '#') cells.push([x0 + (cx + k) * C, base - (g.length - r) * C]); }));
      cx += g[0].length + (gaps[i] || 0);
    });
    const word = cv(800, 480), wx = word.getContext('2d');
    wx.fillStyle = pal.shadow; for (const [x, y] of cells) wx.fillRect(x + C, y + C, C, C);
    wx.fillStyle = pal.face; for (const [x, y] of cells) wx.fillRect(x, y, C, C);
    const right = x0 + widthCells * C;
    const lay = layoutFrom([x0 + C, base - 13 * C], x0, right + C, 322, 108);

    const birds = pixelBirds({ outline: pal.outline, body: pal.body, wing: pal.wing, belly: pal.belly, beak: pal.beak, eye: pal.bg });
    const pink = pixNote(pal.pink), cyan = pixNote(pal.cyan);
    const stars = Array.from({ length: 26 }, (_, i) => ({ x: Math.round((20 + LB.rnd(i, 401) * 760) / 3) * 3, y: Math.round((14 + LB.rnd(i, 402) * 200) / 3) * 3, s: LB.rnd(i, 403) < 0.3 ? 6 : 3, ph: LB.rnd(i, 404) }));
    const bytes = spriteBytes(word, 0.125) + birds.reduce((s, c) => s + spriteBytes(c, 1), 0) / 9 + [...pink, ...cyan].reduce((s, c) => s + spriteBytes(c, 0.5), 0);

    function draw(eve, f, tl) {
      eve.frame(pal.bg);
      eve.rects(stars.map((s) => [s.x, s.y, s.s, s.s, (0.35 + 0.65 * ((Math.sin(f.t * 0.004 + s.ph * 6.28) > 0.2) ? 1 : 0.35)) * f.fade]), pal.star);
      // pixel dust behind the lark
      const tr = trail(tl, f.t, 14, 26);
      eve.rects(tr.filter((_, k) => k % 2 === 1).map((p, k) => [Math.round(p.x / 3) * 3, Math.round((p.y + 6) / 3) * 3, 3, 3, (1 - k / 7) * f.fade * (f.t < T.land + 200 ? 1 : 0)]), pal.cyan);
      // the word appears a column of blocks at a time
      const wipe = Math.floor(ease(f.t / 420) * (right - x0 + 2 * C) / C) * C;
      eve.scissor([0, 0, x0 + wipe, 480]);
      eve.bitmap(word, 0, 0, { alpha: f.fade, nearest: true });
      eve.scissor(null);
      // the loading line: dotted, then a pulse wave
      const dots = [];
      for (let x = lay.waveLeft; x <= lay.waveRight; x += C) dots.push([x, lay.waveY - 1, 3, 3]);
      eve.rects(dots, pal.dot, { alpha: f.reveal * f.fade });
      const pts = [];
      const step = C;
      for (let x = lay.waveLeft; x < f.waveEnd; x += step) {
        const u = (x - lay.waveLeft) / (lay.waveRight - lay.waveLeft);
        const near = Math.exp(-(f.waveEnd - x) / 50);
        const amp = Math.round((4 + 14 * songEnv(u) * (1 + 0.8 * f.song * near)) / 3) * 3;
        const hi = Math.sin(x * 0.21 + Math.floor(f.t / 66) * 0.7) > 0;
        const y = lay.waveY + (hi ? -amp : amp);
        if (pts.length) pts.push([x, pts[pts.length - 1][1]]);
        pts.push([x, y]);
      }
      eve.strip(pts, 3, pal.cyan, { alpha: f.fade });
      if (f.progress > 0.5) {
        const on = Math.floor(f.t / 260) % 2 === 0 || f.phase >= 5;
        if (on) eve.rect(Math.floor(f.waveEnd / C) * C, lay.waveY - 10, Math.floor(f.waveEnd / C) * C + C, lay.waveY + 11, pal.face, { alpha: f.fade });
      }
      drawNotes(eve, null, f, { pick: (n) => (n.song || n.kind === 1 ? cyan : pink), snap: 3, noTurn: true, noScale: true, nearest: true });
      drawBird(eve, birds, f, { noTurn: true, nearest: true });
      caption(eve, f, lay, '#8E93C9');
    }
    return { id: 'chip', name: 'Chip', blurb: 'Pixel art from the tracker’s own world: a sprite lark, chunky letters, a pulse wave with a blinking block cursor.', bg: pal.bg, swatch: [pal.bg, pal.face, pal.cyan, pal.pink], lay, draw, birds, notes: pink, bytes };
  }

  // =====================================================================
  // 3. Aurora: a night sky over the word. Moonlit lark, glowing notes, the
  // line drawn in light.
  // =====================================================================
  function aurora() {
    const pal = { top: '#04081A', bottom: '#0D1D38', teal: '#3BE3C3', violet: '#7C66FF', moon: '#EAF0FA', ink: '#C9D6EE', gold: '#FFE1A0', glow: '#7FD6FF', ghost: '#1D2E4F', dim: '#8EA2C8' };
    const w = A.word(A.GEO, { cx: 400, baseline: 260, scale: 0.86, stretch: 1.22, gaps: [22, 20, 18, 26, 22] });
    const word = cv(800, 480), wx = word.getContext('2d');
    stroke(wx, w.subs, pal.moon, 4.4);
    const wordGlow = cv(800, 480), gx = wordGlow.getContext('2d');
    gx.filter = 'blur(9px)'; stroke(gx, w.subs, pal.glow, 9); gx.filter = 'none';
    const lay = layoutFrom([w.perch[0], w.perch[1] - 2.5], w.box.minX - 3, w.box.maxX + 3, 318, 106);
    const silhouette = (x, b) => {
      if (b.farWing) fill(x, [{ pts: b.farWing.outline, closed: true }], '#AFBEDA');
      for (const l of b.legs) poly(x, l, pal.moon, 1.4);
      for (const t of b.toes) poly(x, t, pal.moon, 1);
      fill(x, b.body, pal.moon); fill(x, b.crest, pal.moon); fill(x, b.beakUpper, pal.moon); fill(x, b.beakLower, pal.moon);
      if (b.wingFold) { fill(x, b.wingFold, '#D3DDF0'); for (const s of b.foldLines) poly(x, s, '#9FB0D0', 0.9); }
      if (b.nearWing) { fill(x, [{ pts: b.nearWing.outline, closed: true }], pal.moon); for (const f of b.nearWing.feathers) poly(x, f, '#9FB0D0', 0.9); }
      x.globalCompositeOperation = 'destination-out';
      dot(x, b.eye, 1.8, '#000');
      fill(x, b.gape, '#000');
      x.globalCompositeOperation = 'source-over';
    };
    const birds = birdSprites(silhouette);
    const glows = birds.map((c) => { const g = cv(BW, BH), q = g.getContext('2d'); q.filter = 'blur(7px)'; q.drawImage(c, 0, 0); q.drawImage(c, 0, 0); q.filter = 'none'; q.globalCompositeOperation = 'source-in'; q.fillStyle = pal.glow; q.fillRect(0, 0, BW, BH); return g; });
    const notes = noteSprites((x, g) => drawNoteFlat(x, g, pal.gold));
    const stars = Array.from({ length: 44 }, (_, i) => ({ x: 8 + LB.rnd(i, 501) * 784, y: 6 + LB.rnd(i, 502) * 230, r: 0.7 + LB.rnd(i, 503) * 1.1, ph: LB.rnd(i, 504) * 6.28, sp: 0.002 + LB.rnd(i, 505) * 0.004 }));
    const bytes = spriteBytes(word, 1) + spriteBytes(wordGlow, 1) + birds.reduce((s, c) => s + spriteBytes(c, 1), 0) + glows.reduce((s, c) => s + spriteBytes(c, 1), 0) + notes.reduce((s, c) => s + spriteBytes(c, 1), 0);

    function curtain(eve, f, y0, color, ph, amp) {
      const pts = [];
      for (let x = -20; x <= 820; x += 22) pts.push([x, y0 + amp * Math.sin(x * 0.009 + f.t * 0.0007 + ph) + 10 * Math.sin(x * 0.023 - f.t * 0.0011 + ph * 2)]);
      eve.strip(pts, 64, color, { alpha: 0.09 * f.fade, add: true });
      eve.strip(pts.map(([x, y]) => [x, y - 22]), 18, color, { alpha: 0.12 * f.fade, add: true });
      eve.strip(pts.map(([x, y]) => [x, y - 30]), 2, color, { alpha: 0.28 * f.fade, add: true });
    }

    function draw(eve, f, tl) {
      eve.frame(pal.top);
      eve.gradient(0, 0, pal.top, 0, 480, pal.bottom);
      eve.points(stars.map((s) => ({ x: s.x, y: s.y, r: s.r, a: (0.45 + 0.55 * Math.sin(f.t * s.sp + s.ph) ** 2) * f.fade })), '#DCE6FF');
      curtain(eve, f, 118, pal.teal, 0.3, 26);
      curtain(eve, f, 150, pal.violet, 2.1, 20);
      // a trail of light behind the lark
      const tr = trail(tl, f.t, 22, 14);
      const segs = [];
      for (let k = 1; k < tr.length; k++) segs.push([tr[k - 1].x, tr[k - 1].y, tr[k].x, tr[k].y, (1 - k / tr.length) * 0.7 * f.fade * Math.max(0, 1 - Math.max(0, f.t - T.land) / 400)]);
      eve.lines(segs, 2.2, pal.teal, { add: true });
      eve.bitmap(wordGlow, 0, 0, { alpha: 0.55 * f.reveal * f.fade, add: true });
      eve.bitmap(word, 0, 0, { alpha: f.reveal * f.fade });
      eve.lines([[lay.waveLeft, lay.waveY, lay.waveRight, lay.waveY]], 1.2, pal.ghost, { alpha: f.reveal * f.fade });
      const wp = wavePts(f, lay, { amp: 15, freq: 0.36 });
      eve.strip(wp, 10, pal.teal, { alpha: 0.12 * f.fade, add: true });
      eve.strip(wp, 4.5, pal.teal, { alpha: 0.3 * f.fade, add: true });
      eve.strip(wp, 1.8, '#C8FFF3', { alpha: f.fade });
      if (wp.length) { const h = wp[wp.length - 1]; eve.points([{ x: h[0], y: h[1], r: 11 }], pal.teal, { alpha: 0.3 * f.fade, add: true }); eve.points([{ x: h[0], y: h[1], r: 3 }], '#FFFFFF', { alpha: f.fade }); }
      drawNotes(eve, notes, f, { glow: pal.gold });
      drawBird(eve, birds, f, { glow: glows, glowAlpha: 0.55 });
      caption(eve, f, lay, pal.dim);
    }
    return { id: 'aurora', name: 'Aurora', blurb: 'Night over the word: northern lights, a moonlit lark, notes like warm stars and a line drawn in light.', bg: pal.top, swatch: [pal.top, pal.teal, pal.violet, pal.gold], lay, draw, birds, notes, bytes };
  }

  // =====================================================================
  // 4. Staff: the wind behind the lark is a stave of five lines, the word
  // is written with a broad nib, and the loading line is the stave's
  // middle line coming to life.
  // =====================================================================
  function staff() {
    const pal = { bg: '#26161F', bg2: '#1C1017', gold: '#DDAA48', ivory: '#F5EADB', ink: '#26161F', dim: '#A98A8E' };
    const w = A.word(A.ITAL, { cx: 400, baseline: 256, scale: 1.08, gaps: [8, 6, 6, 14, 8] });
    const word = cv(800, 480), wx = word.getContext('2d');
    const nib = 11.5, ang = -0.72, nx = Math.cos(ang) * nib / 2, ny = Math.sin(ang) * nib / 2;
    wx.fillStyle = pal.ivory; wx.strokeStyle = pal.ivory; wx.lineWidth = 1.4;
    for (const s of w.subs) {
      const pts = A.resample(s.pts, 1.2);
      for (let i = 1; i < pts.length; i++) {
        const [a0, b0] = pts[i - 1], [a1, b1] = pts[i];
        wx.beginPath(); wx.moveTo(a0 - nx, b0 - ny); wx.lineTo(a0 + nx, b0 + ny); wx.lineTo(a1 + nx, b1 + ny); wx.lineTo(a1 - nx, b1 - ny); wx.closePath(); wx.fill(); wx.stroke();
      }
    }
    const lay = layoutFrom([w.perch[0] + 1, w.perch[1] - 4], w.box.minX - 4, w.box.maxX + 6, 322, 108);
    const birds = birdSprites((x, b) => drawBirdFlat(x, b, { far: '#C99A3E', legs: pal.gold, body: pal.ivory, belly: '#FFF8EE', streak: '#C9A878', wing: pal.gold, wingLine: '#8F6A24', crest: pal.ivory, tailEdge: '#FFFFFF', brow: '#FFFFFF', gape: '#7A2E3A', beak: pal.gold, eye: pal.ink, eyeHi: '#FFFFFF', trailing: '#F5EADB' }));
    const notes = noteSprites((x, g) => drawNoteFlat(x, g, pal.ivory));
    const bytes = spriteBytes(word, 1) + birds.reduce((s, c) => s + spriteBytes(c, 2), 0) + notes.reduce((s, c) => s + spriteBytes(c, 1), 0);
    const lanes = [-14, -7, 0, 7, 14];

    function draw(eve, f, tl) {
      eve.frame(pal.bg);
      eve.gradient(0, 0, pal.bg, 0, 480, pal.bg2);
      // the stave the lark trails
      const tr = trail(tl, f.t, 40, 16);
      const fadeOut = Math.max(0, 1 - Math.max(0, f.t - T.land) / 500);
      for (const off of lanes) {
        const segs = [];
        for (let k = 1; k < tr.length; k++) {
          const p0 = tr[k - 1], p1 = tr[k];
          const g = Math.min(1, k / 4);
          segs.push([p0.x + p0.nx * off * g, p0.y + p0.ny * off * g, p1.x + p1.nx * off * Math.min(1, (k + 1) / 4), p1.y + p1.ny * off * Math.min(1, (k + 1) / 4), (1 - k / tr.length) * f.fade * fadeOut]);
        }
        eve.lines(segs, 1.5, pal.gold);
      }
      // the word, revealed as if the nib moves left to right
      const reveal = ease(f.t / 700);
      eve.scissor([0, 0, lay.waveLeft - 10 + reveal * (lay.waveRight - lay.waveLeft + 40), 480]);
      eve.bitmap(word, 0, 0, { alpha: f.fade });
      eve.scissor(null);
      // the stave under the word; its middle line is the loading line
      const st = [];
      for (const off of [-12, -6, 6, 12]) st.push([lay.waveLeft, lay.waveY + off, lay.waveRight, lay.waveY + off]);
      eve.lines(st, 1, pal.gold, { alpha: 0.3 * f.reveal * f.fade });
      eve.lines([[lay.waveLeft, lay.waveY, lay.waveRight, lay.waveY]], 1, pal.gold, { alpha: 0.3 * f.reveal * f.fade });
      const wp = wavePts(f, lay, { amp: 11, freq: 0.33 });
      eve.strip(wp, 2.2, pal.gold, { alpha: f.fade });
      if (wp.length) eve.points([{ x: wp[wp.length - 1][0], y: wp[wp.length - 1][1], r: 3.4 }], pal.ivory, { alpha: f.fade });
      // wind notes sit on the stave's lines where the lark left them, and
      // drift free as the stave fades
      const seated = f.notes.map((n) => {
        if (n.song) return n;
        const p = {}, v = {};
        tl.flightAt(n.born, p, v);
        const len = Math.hypot(v.x, v.y) || 1;
        const off = lanes[n.lane];
        const sx = p.x - v.y / len * off, sy = p.y - 16 + v.x / len * off;
        const free = LB.smooth(n.age * 1.6 - 0.25);
        return Object.assign({}, n, { x: sx + (n.x - sx) * free, y: sy + (n.y - sy) * free, angle: n.angle * free });
      });
      drawNotes(eve, notes, Object.assign({}, f, { notes: seated }));
      drawBird(eve, birds, f);
      caption(eve, f, lay, pal.dim, { dy: 46 });
    }
    return { id: 'staff', name: 'Stave', blurb: 'The wind is a stave of five lines trailing the lark; the word is written with a broad nib, and the stave’s middle line becomes the loading line.', bg: pal.bg, swatch: [pal.bg, pal.ivory, pal.gold], lay, draw, birds, notes, bytes };
  }

  // =====================================================================
  // 5. Sample: bold and flat. The loading line is the lark's song as the
  // sample editor would show it, with a playhead.
  // =====================================================================
  function sample() {
    const pal = { bg: '#000000', white: '#FFFFFF', sun: '#F8B92E', deep: '#D97E22', cream: '#FFF1CC', sky: '#73C6FF', grey: '#2C2C2C', dim: '#8C8C8C' };
    const w = A.word(A.GEO, { cx: 400, baseline: 262, scale: 0.95, gaps: [16, 14, 14, 20, 16] });
    const word = cv(800, 480), wx = word.getContext('2d');
    stroke(wx, w.subs, pal.white, 17);
    const lay = layoutFrom([w.perch[0], w.perch[1] - 8.5], w.box.minX - 9, w.box.maxX + 9, 324, 108);
    const birds = birdSprites((x, b) => drawBirdFlat(x, b, { far: pal.deep, legs: pal.white, body: pal.sun, belly: pal.cream, wing: pal.deep, wingLine: '#A85A14', crest: pal.sun, tailEdge: pal.cream, gape: '#8E2A14', beak: pal.white, eye: '#000000', eyeHi: '#FFFFFF', trailing: pal.cream }));
    const sky = noteSprites((x, g) => drawNoteFlat(x, g, pal.sky, 2.6));
    const sun = noteSprites((x, g) => drawNoteFlat(x, g, pal.sun, 2.6));
    const cols = [];
    for (let x = lay.waveLeft; x <= lay.waveRight; x += 3) cols.push(x);
    const bytes = spriteBytes(word, 0.5) + birds.reduce((s, c) => s + spriteBytes(c, 2), 0) + [...sky, ...sun].reduce((s, c) => s + spriteBytes(c, 0.5), 0);

    function draw(eve, f, tl) {
      eve.frame(pal.bg);
      // speed lines behind the lark
      const tr = trail(tl, f.t, 16, 16);
      for (const off of [-9, 0, 9]) {
        const segs = [];
        for (let k = 2; k < tr.length; k++) {
          const p0 = tr[k - 1], p1 = tr[k];
          segs.push([p0.x + p0.nx * off, p0.y + p0.ny * off, p1.x + p1.nx * off, p1.y + p1.ny * off, (1 - k / tr.length) * 0.5 * f.fade * (f.t < T.land ? 1 : 0)]);
        }
        eve.lines(segs, 1.6, pal.white);
      }
      // letters drop into place one after another
      eve.bitmap(word, 0, (1 - ease(f.t / 320)) * -10, { alpha: f.reveal * f.fade });
      // the sample view
      eve.lines([[lay.waveLeft, lay.waveY, lay.waveRight, lay.waveY]], 1, pal.grey, { alpha: f.reveal * f.fade });
      const bars = [];
      for (const x of cols) {
        if (x > f.waveEnd) break;
        const u = (x - lay.waveLeft) / (lay.waveRight - lay.waveLeft);
        const near = Math.exp(-(f.waveEnd - x) / 40);
        const h = 2 + 26 * songEnv(u) * (0.55 + 0.45 * Math.abs(Math.sin(x * 1.7))) * (1 + 0.7 * f.song * near * Math.abs(Math.sin(f.t * 0.03 + x)));
        bars.push([x, lay.waveY - h, x, lay.waveY + h]);
      }
      eve.lines(bars, 1.6, pal.sky, { alpha: f.fade });
      if (f.progress > 0.2) {
        const px = f.waveEnd;
        eve.lines([[px, lay.waveY - 34, px, lay.waveY + 34]], 2, pal.white, { alpha: f.fade });
      }
      drawNotes(eve, null, f, { pick: (n) => (n.song ? sun : sky) });
      drawBird(eve, birds, f);
      caption(eve, f, lay, pal.dim, { dy: 58 });
    }
    return { id: 'sample', name: 'Sample', blurb: 'Bold and flat on the Tracker’s black. The loading line is the lark’s song as the sample editor would draw it, with a playhead.', bg: pal.bg, swatch: [pal.bg, pal.white, pal.sun, pal.sky], lay, draw, birds, notes: sky, bytes };
  }

  const kit = { cv, fill, stroke, poly, dot, ease, spriteBytes, box, birdSprites, drawBirdFlat, noteSprites, drawNoteFlat, songEnv, wavePts, trail, drawBird, drawNotes, caption, layoutFrom, pixelBirds, pixNote, pixelWord, cellSprite, PIX, AX, AY, BW, BH, BS };
  root.LarkDesigns = { earlier: () => [fieldNotes(), aurora(), staff(), sample()], chip, kit, AX, AY, BW, BH, box };
})(typeof window !== 'undefined' ? window : globalThis);

// ---- hero.js
// The hero: LarkOS's boot animation, from the same timeline the firmware
// runs (larkBoot.h), drawn by the Chip design. It plays once, sings for
// three phrases and stops; Replay starts it again. Under reduced motion it
// shows one still frame.
(function () {
  'use strict';
  const LB = window.LarkBoot, T = LB.T, FRAME = 33, LOAD = 2300;
  const END = T.sing + 3 * T.phrase - 40;
  const STILL = T.sing + 520;
  const cvs = document.getElementById('boot');
  const btn = document.getElementById('replay');
  if (!cvs || !window.LarkDesigns) return;
  const design = window.LarkDesigns.chip();
  const eve = new window.Eve(cvs);
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let tl, ft, f, start, raf = 0;

  function fit() {
    const w = Math.round(cvs.getBoundingClientRect().width * Math.min(2, window.devicePixelRatio || 1));
    if (w > 0 && w !== cvs.width) { cvs.width = w; cvs.height = Math.round(w * 0.6); return true; }
    return false;
  }
  function progressAt(t) {
    if (t >= LOAD) return 100;
    const p = Math.floor(t / LOAD * 100);
    return Math.min(99, p - (p % 7));
  }
  function reset() { tl = new LB.Timeline(); tl.start(0, design.lay); ft = 0; f = tl.update(0, 0, false); }
  function advance(to) {
    while (ft + FRAME <= to) { ft += FRAME; f = tl.update(ft, progressAt(ft), false); }
  }
  function draw() { eve.ctx.imageSmoothingEnabled = false; design.draw(eve, f, tl); eve.end(); }
  function tick(now) {
    if (start === undefined) start = now;
    advance(Math.min(END, now - start));
    draw();
    if (ft + FRAME <= END) raf = requestAnimationFrame(tick);
    else { raf = 0; btn.hidden = false; }
  }
  function play() {
    cancelAnimationFrame(raf);
    reset();
    fit();
    if (reduce) { advance(STILL); draw(); btn.hidden = true; return; }
    btn.hidden = true;
    start = undefined;
    raf = requestAnimationFrame(tick);
  }
  btn.addEventListener('click', play);
  const ro = new ResizeObserver(() => { if (fit() && f) draw(); });
  ro.observe(cvs);
  play();
})();
