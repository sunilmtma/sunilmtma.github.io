/* Sunil Choudhary, personal page.
   1. Digital twin figure: a robot cell in a dark 3D viewport that grows through
      four stages of a digital twin, from a blueprint model to a live,
      simulating, camera-guided copy of the cell.
   2. Copy buttons for BibTeX and email.
   3. Current-section highlight in the nav. */

(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var canvas = document.getElementById("twin-canvas");
  if (canvas && canvas.getContext) initTwin(canvas);

  function initTwin(canvas) {
    var ctx = canvas.getContext("2d");
    var readout = document.getElementById("twin-readout");
    var badge = document.getElementById("twin-badge");
    var badgeText = badge && badge.querySelector(".txt");
    var desc = document.getElementById("twin-desc");
    var stepButtons = Array.prototype.slice.call(document.querySelectorAll(".twin-step"));

    // ---------------------------------------------------------- palette
    // The viewport is dark in both page themes, so these are fixed colours.
    var CYAN = [102, 208, 255], AMBER = [255, 184, 77], WHITE = [236, 244, 250];
    var ARM = [226, 234, 242], COLUMN = [128, 146, 164], HUB = [34, 50, 66];
    var STEEL = [86, 106, 126], BELT = [58, 76, 94], PALLET = [104, 122, 140], PART = [255, 172, 64];
    var LIGHT = norm({ x: -0.45, y: 1, z: -0.6 });
    var FONT = '600 {s}px Archivo, "Helvetica Neue", Arial, sans-serif';

    // ---------------------------------------------------------- robot model
    var SH = 0.62, L1 = 1.0, L2 = 0.92, G = 0.22, BOX = 0.22;   // metres, roughly
    var BELT_Y = 0.34, BELT_Z = -1.3, BELT_X0 = -0.1, BELT_X1 = 2.7;
    var PAL = { x: -1.05, z: 0.85, h: 0.12 };
    var CAM = { x: -0.6, y: 1.5, z: -2.0 };
    var SLOTS = [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]];
    var BUMPS = [0.0, 0.28, 0.6];          // candidate transfer arcs; index 1 is chosen
    var FOV = [[0.05, -1.65], [1.55, -1.65], [1.55, -0.95], [0.05, -0.95]];

    function ik(x, y, z) {
      var yaw = Math.atan2(z, x), r = Math.hypot(x, z), wy = y + G - SH;
      var d = Math.min(Math.hypot(r, wy), L1 + L2 - 0.001);
      var c2 = (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2);
      var t2 = -Math.acos(Math.max(-1, Math.min(1, c2)));
      var t1 = Math.atan2(wy, r) - Math.atan2(L2 * Math.sin(t2), L1 + L2 * Math.cos(t2));
      return [yaw, t1, t2];
    }
    function fk(j) {
      var cy = Math.cos(j[0]), sy = Math.sin(j[0]);
      var sh = { x: 0, y: SH, z: 0 };
      var el = { x: cy * Math.cos(j[1]) * L1, y: SH + Math.sin(j[1]) * L1, z: sy * Math.cos(j[1]) * L1 };
      var a = j[1] + j[2];
      var wr = { x: el.x + cy * Math.cos(a) * L2, y: el.y + Math.sin(a) * L2, z: el.z + sy * Math.cos(a) * L2 };
      return { sh: sh, el: el, wr: wr, tip: { x: wr.x, y: wr.y - G, z: wr.z }, yaw: j[0] };
    }
    function lerpJ(a, b, s, bump) {
      var j = [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
      if (bump) { var k = Math.sin(Math.PI * s) * bump; j[1] += k; j[2] -= k * 0.6; }
      return j;
    }

    // ---------------------------------------------------------- view state
    var STAGES = [
      "A 3D model of a robot cell. It has the right geometry, but no connection to the real machine.",
      "Sensors stream joint angles into the model, so it now mirrors the real robot as it works.",
      "The twin tries out candidate motions in simulation and picks the best one before the robot moves.",
      "A camera locates each part. The twin replans, and the robot adapts without being reprogrammed."
    ];
    var BADGES = ["Static model", "Live", "Live · simulating", "Live · camera-guided"];
    var state = {
      stage: 1, auto: !reduceMotion, stageTime: 0,
      yaw: 0.62, pitch: 0.5, dist: 7.0, visible: true, w: 0, h: 0, dpr: 1, clock: 0,
      mix: { solid: 0, sim: 0, cam: 0 }
    };
    var target = { x: 0.55, y: 0.35, z: -0.45 };

    // ---------------------------------------------------------- simulation state
    var rand = mulberry32(11);
    var sim = { cycle: 0, u: 0, placed: [], pick: null, place: null, J: null, joints: null, holding: false };
    var T = 6.0, hist = [], lastSample = 0;
    function newCycle() {
      if (sim.placed.length >= 4) sim.placed = [];
      var slot = SLOTS[sim.placed.length];
      var jitter = state.stage >= 4;
      sim.pick = { x: 0.62 + (jitter ? (rand() - 0.5) * 0.45 : 0), z: BELT_Z + (jitter ? (rand() - 0.5) * 0.2 : 0) };
      sim.place = { x: PAL.x + slot[0], z: PAL.z + slot[1] };
      sim.J = {
        A: ik(sim.place.x, 0.95, sim.place.z),
        B: ik(sim.pick.x, 0.95, sim.pick.z),
        C: ik(sim.pick.x, BELT_Y + BOX, sim.pick.z),
        D: ik(sim.place.x, PAL.h + BOX, sim.place.z)
      };
    }
    function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
    function seg(u, a, b) { return ease(Math.max(0, Math.min(1, (u - a) / (b - a)))); }
    function poseAt(u) {
      var J = sim.J;
      if (u < 1.2) return lerpJ(J.A, J.B, seg(u, 0, 1.2), 0.15);
      if (u < 1.6) return lerpJ(J.B, J.C, seg(u, 1.2, 1.6));
      if (u < 1.85) return J.C;
      if (u < 2.25) return lerpJ(J.C, J.B, seg(u, 1.85, 2.25));
      if (u < 3.85) return lerpJ(J.B, J.A, seg(u, 2.25, 3.85), BUMPS[1]);
      if (u < 4.25) return lerpJ(J.A, J.D, seg(u, 3.85, 4.25));
      if (u < 4.45) return J.D;
      if (u < 4.85) return lerpJ(J.D, J.A, seg(u, 4.45, 4.85));
      return J.A;
    }
    function step(dt) {
      sim.u += dt;
      if (sim.u >= T) { sim.u -= T; sim.cycle++; sim.placed.push(sim.place); newCycle(); }
      sim.joints = poseAt(sim.u);
      sim.holding = sim.u >= 1.75 && sim.u < 4.35;
    }
    function fillHistory() {   // so the telemetry traces are never empty
      hist = [];
      for (var i = 63; i >= 0; i--) hist.push(poseAt(((sim.u - i * 0.06) % T + T) % T));
    }

    newCycle();
    sim.u = reduceMotion ? 3.0 : 0;
    sim.joints = poseAt(sim.u);
    fillHistory();

    function setStage(n, fromUser) {
      state.stage = n; state.stageTime = 0;
      if (fromUser) { state.auto = false; canvas.closest(".twin").classList.add("is-manual"); }
      stepButtons.forEach(function (b, i) {
        var on = i + 1 === n;
        b.setAttribute("aria-pressed", String(on));
        b.classList.remove("is-active");
        if (on) { void b.offsetWidth; b.classList.add("is-active"); }   // restarts the progress bar
      });
      if (desc) desc.textContent = STAGES[n - 1];
      if (badgeText) badgeText.textContent = BADGES[n - 1];
      if (badge) badge.classList.toggle("is-live", n >= 2);
      if (reduceMotion) {
        snapMix();
        newCycle(); sim.u = 3.0; sim.joints = poseAt(sim.u); sim.holding = true; fillHistory(); draw();
      }
    }
    stepButtons.forEach(function (b, i) { b.addEventListener("click", function () { setStage(i + 1, true); }); });

    function mixTargets() { return { solid: state.stage >= 2 ? 1 : 0, sim: state.stage >= 3 ? 1 : 0, cam: state.stage >= 4 ? 1 : 0 }; }
    function snapMix() { state.mix = mixTargets(); }
    function approach(v, t, s) { return v < t ? Math.min(t, v + s) : Math.max(t, v - s); }

    function resize() {
      var r = canvas.getBoundingClientRect();
      state.dpr = Math.min(window.devicePixelRatio || 1, 2);
      state.w = Math.max(1, Math.round(r.width * state.dpr));
      state.h = Math.max(1, Math.round(r.height * state.dpr));
      canvas.width = state.w; canvas.height = state.h;
      draw();
    }
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);
    else window.addEventListener("resize", resize);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (e) { state.visible = e[0].isIntersecting; }).observe(canvas);
    }

    // ---------------------------------------------------------- drawing helpers
    var P;   // projection constants for the current frame
    function project(p) {
      var x = p.x - target.x, y = p.y - target.y, z = p.z - target.z;
      var x1 = x * P.cy - z * P.sy, z1 = x * P.sy + z * P.cy;
      var y2 = y * P.cp - z1 * P.sp, z2 = y * P.sp + z1 * P.cp;
      var zc = z2 + state.dist;
      return { x: P.cx + (x1 * P.f) / zc, y: P.cyy - (y2 * P.f) / zc, z: zc, k: P.f / zc };
    }
    function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
    function norm(v) { var l = Math.hypot(v.x, v.y, v.z); return { x: v.x / l, y: v.y / l, z: v.z / l }; }
    function shade(c, n) {
      var k = 0.42 + 0.58 * Math.max(0, n.x * LIGHT.x + n.y * LIGHT.y + n.z * LIGHT.z);
      return "rgb(" + Math.round(c[0] * k) + "," + Math.round(c[1] * k) + "," + Math.round(c[2] * k) + ")";
    }
    function line(a, b) { var p = project(a), q = project(b); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); }
    function poly(pts, close) {
      pts.forEach(function (p, i) { var q = project(p); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
      if (close) ctx.closePath();
    }
    function font(px) { return FONT.replace("{s}", (px * state.dpr).toFixed(1)); }
    function rrect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
    function tag(text, x, y, col) {   // small dark chip with a coloured label, centred on x
      var dpr = state.dpr;
      ctx.font = font(10);
      var w = ctx.measureText(text).width + 12 * dpr, h = 17 * dpr;
      rrect(x - w / 2, y - h / 2, w, h, h / 2);
      ctx.fillStyle = "rgba(8,18,28,0.82)"; ctx.fill();
      ctx.strokeStyle = rgba(col, 0.55); ctx.lineWidth = dpr; ctx.stroke();
      ctx.fillStyle = rgba(col, 1); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(text, x, y + 0.5 * dpr);
    }
    function floorBlob(p, r, col, a) {   // soft ellipse lying on the floor
      var q = project(p), R = r * q.k;
      ctx.save(); ctx.translate(q.x, q.y); ctx.scale(1, 0.45);
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    var FACES = [
      { f: [4, 5, 6, 7], n: { x: 0, y: 1, z: 0 } },
      { f: [0, 1, 5, 4], n: { x: 0, y: 0, z: -1 } },
      { f: [1, 2, 6, 5], n: { x: 1, y: 0, z: 0 } },
      { f: [2, 3, 7, 6], n: { x: 0, y: 0, z: 1 } },
      { f: [3, 0, 4, 7], n: { x: -1, y: 0, z: 0 } }
    ];
    // mat: an [r,g,b] base colour for a lit solid, or null for a blueprint wireframe
    function cuboid(x0, y0, z0, x1, y1, z1, mat) {
      var dpr = state.dpr;
      var c = [
        { x: x0, y: y0, z: z0 }, { x: x1, y: y0, z: z0 }, { x: x1, y: y0, z: z1 }, { x: x0, y: y0, z: z1 },
        { x: x0, y: y1, z: z0 }, { x: x1, y: y1, z: z0 }, { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 }
      ];
      var pc = c.map(project);
      var faces = FACES.map(function (o) {
        return { f: o.f, n: o.n, z: (pc[o.f[0]].z + pc[o.f[1]].z + pc[o.f[2]].z + pc[o.f[3]].z) / 4 };
      }).sort(function (a, b) { return b.z - a.z; });
      ctx.lineJoin = "round";
      faces.forEach(function (o) {
        ctx.beginPath();
        o.f.forEach(function (k, n) { if (n) ctx.lineTo(pc[k].x, pc[k].y); else ctx.moveTo(pc[k].x, pc[k].y); });
        ctx.closePath();
        if (mat) {
          ctx.fillStyle = shade(mat, o.n); ctx.fill();
          ctx.strokeStyle = "rgba(6,14,22,0.45)"; ctx.lineWidth = 0.8 * dpr; ctx.stroke();
        } else {
          ctx.strokeStyle = rgba(CYAN, 0.75); ctx.lineWidth = dpr; ctx.stroke();
        }
      });
      if (!mat) {
        ctx.fillStyle = rgba(WHITE, 0.9);
        pc.forEach(function (p) { ctx.fillRect(p.x - dpr, p.y - dpr, 2 * dpr, 2 * dpr); });
      }
    }
    function part(cx, cy, cz) {
      var h = BOX / 2;
      cuboid(cx - h, cy - h, cz - h, cx + h, cy + h, cz + h, PART);
    }

    // ---------------------------------------------------------- scene
    function grid() {
      var dpr = state.dpr, cx = 0.6, cz = -0.4;
      ctx.lineWidth = dpr;
      function segLine(a, b) {
        for (var t = 0; t < 1; t += 0.1) {
          var p = { x: a.x + (b.x - a.x) * t, y: 0, z: a.z + (b.z - a.z) * t };
          var q = { x: a.x + (b.x - a.x) * (t + 0.1), y: 0, z: a.z + (b.z - a.z) * (t + 0.1) };
          var d = Math.hypot((p.x + q.x) / 2 - cx, (p.z + q.z) / 2 - cz);
          var al = 0.32 * Math.pow(Math.max(0, 1 - d / 3.3), 1.6);
          if (al < 0.01) continue;
          ctx.beginPath(); ctx.strokeStyle = rgba(CYAN, al); line(p, q); ctx.stroke();
        }
      }
      for (var g = -2; g <= 3.51; g += 0.5) segLine({ x: g, z: -3 }, { x: g, z: 2 });
      for (g = -3; g <= 2.01; g += 0.5) segLine({ x: -2, z: g }, { x: 3.5, z: g });
    }

    function baseCylinder(solid) {
      var dpr = state.dpr, n = 28, r = 0.3, h = 0.14, b = [], t = [], i;
      for (i = 0; i <= n; i++) {
        var a = i / n * Math.PI * 2;
        b.push({ x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r, nx: Math.cos(a), nz: Math.sin(a) });
        t.push({ x: Math.cos(a) * r, y: h, z: Math.sin(a) * r });
      }
      if (!solid) {
        ctx.lineWidth = dpr; ctx.strokeStyle = rgba(CYAN, 0.75);
        ctx.beginPath(); poly(b); ctx.stroke(); ctx.beginPath(); poly(t); ctx.stroke();
        ctx.beginPath();
        for (i = 0; i < n; i += 7) line(b[i], t[i]);
        ctx.stroke();
        return;
      }
      var quads = [];
      for (i = 0; i < n; i++) {
        var z = (project(b[i]).z + project(b[i + 1]).z) / 2;
        quads.push({ i: i, z: z });
      }
      quads.sort(function (p, q) { return q.z - p.z; }).forEach(function (o) {
        var k = o.i;
        ctx.beginPath(); poly([b[k], b[k + 1], t[k + 1], t[k]], true);
        ctx.fillStyle = shade(STEEL, { x: (b[k].nx + b[k + 1].nx) / 2, y: 0, z: (b[k].nz + b[k + 1].nz) / 2 });
        ctx.fill();
      });
      ctx.beginPath(); poly(t, true); ctx.fillStyle = shade([150, 168, 186], { x: 0, y: 1, z: 0 }); ctx.fill();
      ctx.strokeStyle = rgba(CYAN, 0.35); ctx.lineWidth = dpr; ctx.stroke();
    }

    function tube(a, b, w, col) {   // a lit cylinder-ish link: outline, body, highlight
      var p = project(a), q = project(b), dpr = state.dpr;
      var W = w * (p.k + q.k) / 2;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
      ctx.lineWidth = W + 2 * dpr; ctx.strokeStyle = "rgba(6,14,22,0.7)"; ctx.stroke();
      ctx.lineWidth = W; ctx.strokeStyle = shade(col, { x: 0.2, y: 0.6, z: -0.3 }); ctx.stroke();
      var dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy) || 1;
      var nx = -dy / L, ny = dx / L;
      if (ny > 0) { nx = -nx; ny = -ny; }
      var o = W * 0.22;
      ctx.beginPath(); ctx.moveTo(p.x + nx * o, p.y + ny * o); ctx.lineTo(q.x + nx * o, q.y + ny * o);
      ctx.lineWidth = W * 0.26; ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.stroke();
    }

    function drawArm(a, mode, alpha) {
      var dpr = state.dpr, cy = Math.cos(a.yaw), sy = Math.sin(a.yaw);
      var links = [[{ x: 0, y: 0.14, z: 0 }, a.sh, 0.17, COLUMN], [a.sh, a.el, 0.13, ARM], [a.el, a.wr, 0.1, ARM], [a.wr, a.tip, 0.05, COLUMN]];
      if (mode === "ghost") {
        ctx.lineCap = "round";
        links.forEach(function (l) {
          var p = project(l[0]), q = project(l[1]);
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
          ctx.lineWidth = l[2] * p.k; ctx.strokeStyle = rgba(CYAN, alpha); ctx.stroke();
        });
        return;
      }
      var solid = mode === "solid";
      if (solid) links.forEach(function (l) { tube(l[0], l[1], l[2], l[3]); });
      else {
        ctx.lineCap = "round"; ctx.lineWidth = 1.2 * dpr; ctx.strokeStyle = rgba(CYAN, 0.9);
        links.forEach(function (l) {   // two parallel edges per link, like a blueprint
          var p = project(l[0]), q = project(l[1]);
          var dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy) || 1, o = l[2] * p.k / 2;
          var nx = -dy / L * o, ny = dx / L * o;
          ctx.beginPath();
          ctx.moveTo(p.x + nx, p.y + ny); ctx.lineTo(q.x + nx, q.y + ny);
          ctx.moveTo(p.x - nx, p.y - ny); ctx.lineTo(q.x - nx, q.y - ny);
          ctx.stroke();
        });
      }
      // gripper fingers, perpendicular to the arm's heading
      var open = sim.holding && solid ? BOX / 2 + 0.01 : 0.15;
      ctx.beginPath(); ctx.lineWidth = (solid ? 3.2 : 1.2) * dpr; ctx.strokeStyle = solid ? shade(COLUMN, LIGHT) : rgba(CYAN, 0.9);
      [-1, 1].forEach(function (sg) {
        var fx = a.tip.x - sy * open * sg, fz = a.tip.z + cy * open * sg;
        line({ x: a.tip.x - sy * 0.15 * sg, y: a.tip.y, z: a.tip.z + cy * 0.15 * sg }, { x: fx, y: a.tip.y, z: fz });
        line({ x: fx, y: a.tip.y, z: fz }, { x: fx, y: a.tip.y - 0.14, z: fz });
      });
      ctx.stroke();
      // joint hubs; in a live twin each one carries a sensor (amber ring)
      [a.sh, a.el, a.wr].forEach(function (p) {
        var q = project(p);
        ctx.beginPath(); ctx.arc(q.x, q.y, solid ? 0.075 * q.k : 3 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = solid ? rgba(HUB, 1) : "rgba(8,18,28,1)"; ctx.fill();
        ctx.lineWidth = (solid ? 2 : 1.2) * dpr; ctx.strokeStyle = solid ? rgba(AMBER, 0.95) : rgba(CYAN, 0.9); ctx.stroke();
      });
    }

    function dimension(a, b, off, text) {   // blueprint dimension line with end ticks
      var dpr = state.dpr;
      var A = { x: a.x + off.x, y: a.y + off.y, z: a.z + off.z }, B = { x: b.x + off.x, y: b.y + off.y, z: b.z + off.z };
      ctx.beginPath(); ctx.lineWidth = dpr; ctx.strokeStyle = rgba(CYAN, 0.55);
      line(a, A); line(b, B); line(A, B); ctx.stroke();
      var m = project({ x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, z: (A.z + B.z) / 2 });
      tag(text, m.x, m.y, CYAN);
    }

    function cell(solid, partPos) {
      var dpr = state.dpr;
      // camera on a pole
      ctx.beginPath(); ctx.lineWidth = (solid ? 3 : 1) * dpr; ctx.strokeStyle = solid ? shade(STEEL, LIGHT) : rgba(CYAN, 0.75);
      line({ x: CAM.x, y: 0, z: CAM.z }, CAM); ctx.stroke();
      cuboid(CAM.x - 0.12, CAM.y - 0.08, CAM.z - 0.08, CAM.x + 0.12, CAM.y + 0.08, CAM.z + 0.08, solid ? [70, 88, 108] : null);
      if (solid) {   // lens
        var lens = project({ x: CAM.x - 0.06, y: CAM.y - 0.02, z: CAM.z + 0.09 });
        ctx.beginPath(); ctx.arc(lens.x, lens.y, 2.4 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = rgba(AMBER, 0.6 + 0.4 * state.mix.cam); ctx.fill();
      }
      // pallet and placed parts
      cuboid(PAL.x - 0.38, 0, PAL.z - 0.38, PAL.x + 0.38, PAL.h, PAL.z + 0.38, solid ? PALLET : null);
      if (solid) sim.placed.forEach(function (p) { part(p.x, PAL.h + BOX / 2, p.z); });
      // conveyor: legs, body, moving slats
      [BELT_X0 + 0.15, BELT_X1 - 0.15].forEach(function (x) {
        cuboid(x - 0.05, 0, BELT_Z - 0.25, x + 0.05, BELT_Y - 0.08, BELT_Z - 0.17, solid ? STEEL : null);
        cuboid(x - 0.05, 0, BELT_Z + 0.17, x + 0.05, BELT_Y - 0.08, BELT_Z + 0.25, solid ? STEEL : null);
      });
      cuboid(BELT_X0, BELT_Y - 0.08, BELT_Z - 0.3, BELT_X1, BELT_Y, BELT_Z + 0.3, solid ? BELT : null);
      ctx.beginPath(); ctx.lineWidth = dpr; ctx.strokeStyle = solid ? "rgba(6,14,22,0.55)" : rgba(CYAN, 0.3);
      var off = solid && !reduceMotion ? (state.clock * 0.0004) % 0.2 : 0;
      for (var s = BELT_X0 + 0.08 + off; s < BELT_X1 - 0.04; s += 0.2) {
        line({ x: s, y: BELT_Y + 0.001, z: BELT_Z - 0.28 }, { x: s, y: BELT_Y + 0.001, z: BELT_Z + 0.28 });
      }
      ctx.stroke();
      if (solid && partPos) part(partPos.x, partPos.y, partPos.z);
    }

    // ---------------------------------------------------------- frame
    function draw() {
      var W = state.w, H = state.h, dpr = state.dpr;
      if (!W || !sim.J) return;
      var yaw = state.yaw + (reduceMotion ? 0 : Math.sin(state.clock * 0.00012) * 0.12);
      P = { cy: Math.cos(yaw), sy: Math.sin(yaw), cp: Math.cos(state.pitch), sp: Math.sin(state.pitch),
            f: Math.min(W, H * 1.5) * 1.16, cx: W * 0.5, cyy: H * 0.65 };
      ctx.clearRect(0, 0, W, H);
      var m = state.mix;

      grid();
      floorBlob({ x: 0, y: 0, z: 0 }, 1.9, CYAN, 0.10 + 0.08 * m.solid);

      var partPos = null;
      if (sim.u < 1.75) {
        var e = 1 - Math.pow(1 - Math.min(1, sim.u / 1.5), 3);
        partPos = { x: BELT_X1 - 0.25 + (sim.pick.x - (BELT_X1 - 0.25)) * e, y: BELT_Y + BOX / 2, z: sim.pick.z };
      }

      // ---- blueprint layer (stage 1)
      if (m.solid < 1) {
        ctx.save(); ctx.globalAlpha = 1 - m.solid;
        ctx.shadowColor = rgba(CYAN, 0.8); ctx.shadowBlur = 6 * dpr;
        // reach envelope
        ctx.beginPath(); ctx.lineWidth = dpr; ctx.strokeStyle = rgba(CYAN, 0.35); ctx.setLineDash([4 * dpr, 5 * dpr]);
        var env = [];
        for (var i = 0; i <= 64; i++) { var t = i / 64 * Math.PI * 2; env.push({ x: Math.cos(t) * 1.75, y: 0, z: Math.sin(t) * 1.75 }); }
        poly(env); ctx.stroke(); ctx.setLineDash([]);
        cell(false, null);
        baseCylinder(false);
        drawArm(fk(sim.J.A), "wire");
        ctx.shadowBlur = 0;
        dimension({ x: BELT_X0, y: 0, z: BELT_Z + 0.3 }, { x: BELT_X1, y: 0, z: BELT_Z + 0.3 }, { x: 0, y: 0, z: 0.35 }, "2.8 m");
        dimension({ x: CAM.x, y: 0, z: CAM.z }, CAM, { x: -0.35, y: 0, z: 0 }, "1.5 m");
        // scanning sweep, as if the model were being built
        if (!reduceMotion) {
          var sx = ((state.clock * 0.00022) % 1.4 - 0.2) * W;
          var g = ctx.createLinearGradient(sx - 60 * dpr, 0, sx + 60 * dpr, 0);
          g.addColorStop(0, rgba(CYAN, 0)); g.addColorStop(0.5, rgba(CYAN, 0.08)); g.addColorStop(1, rgba(CYAN, 0));
          ctx.fillStyle = g; ctx.fillRect(sx - 60 * dpr, 0, 120 * dpr, H);
          ctx.fillStyle = rgba(CYAN, 0.35); ctx.fillRect(sx, 0, dpr, H);
        }
        ctx.restore();
      }

      // ---- live layer (stages 2 to 4)
      var arm = fk(sim.joints);
      if (m.solid > 0) {
        ctx.save(); ctx.globalAlpha = m.solid;
        floorBlob({ x: 0, y: 0, z: 0 }, 0.5, [0, 0, 0], 0.55);
        floorBlob({ x: arm.tip.x, y: 0, z: arm.tip.z }, 0.28, [0, 0, 0], sim.holding ? 0.5 : 0.3);
        cell(true, partPos);

        // stage 4: camera frustum, scan line and a pick target on the belt
        if (m.cam > 0) {
          ctx.save(); ctx.globalAlpha = m.solid * m.cam;
          var fov = FOV.map(function (c) { return { x: c[0], y: BELT_Y + 0.002, z: c[1] }; });
          for (var k = 0; k < 4; k++) {
            ctx.beginPath(); poly([CAM, fov[k], fov[(k + 1) % 4]], true);
            ctx.fillStyle = rgba(AMBER, 0.06); ctx.fill();
          }
          ctx.beginPath(); poly(fov, true); ctx.fillStyle = rgba(AMBER, 0.1); ctx.fill();
          ctx.lineWidth = dpr; ctx.strokeStyle = rgba(AMBER, 0.7); ctx.stroke();
          ctx.beginPath(); ctx.strokeStyle = rgba(AMBER, 0.35);
          fov.forEach(function (c) { line(CAM, c); }); ctx.stroke();
          var sc = FOV[0][0] + (FOV[1][0] - FOV[0][0]) * (reduceMotion ? 0.5 : (state.clock * 0.0005) % 1);
          ctx.beginPath(); ctx.lineWidth = 2 * dpr; ctx.strokeStyle = rgba(AMBER, 0.9);
          ctx.shadowColor = rgba(AMBER, 1); ctx.shadowBlur = 8 * dpr;
          line({ x: sc, y: BELT_Y + 0.003, z: FOV[0][1] }, { x: sc, y: BELT_Y + 0.003, z: FOV[2][1] }); ctx.stroke();
          ctx.shadowBlur = 0;
          var pk = project({ x: sim.pick.x, y: BELT_Y + 0.003, z: sim.pick.z });
          ctx.beginPath(); ctx.lineWidth = 1.5 * dpr; ctx.strokeStyle = rgba(CYAN, 0.95);
          ctx.ellipse(pk.x, pk.y, 0.16 * pk.k, 0.07 * pk.k, 0, 0, Math.PI * 2);
          ctx.moveTo(pk.x - 0.24 * pk.k, pk.y); ctx.lineTo(pk.x + 0.24 * pk.k, pk.y);
          ctx.stroke();
          ctx.restore();
        }

        baseCylinder(true);
        drawArm(arm, "solid");
        if (sim.holding) part(arm.tip.x, arm.tip.y - BOX / 2, arm.tip.z);

        // stage 3: candidate paths (the chosen one bright), a moving probe and ghost poses ahead
        if (m.sim > 0) {
          ctx.save(); ctx.globalAlpha = m.solid * m.sim;
          var chosen = [];
          BUMPS.forEach(function (b, i) {
            var pts = [];
            for (var k = 0; k <= 36; k++) pts.push(fk(lerpJ(sim.J.B, sim.J.A, k / 36, b)).tip);
            if (i === 1) chosen = pts;
            ctx.beginPath(); ctx.lineWidth = (i === 1 ? 2.2 : 1.2) * dpr;
            ctx.strokeStyle = rgba(CYAN, i === 1 ? 0.95 : 0.4);
            ctx.setLineDash(i === 1 ? [] : [4 * dpr, 5 * dpr]);
            if (i === 1) { ctx.shadowColor = rgba(CYAN, 1); ctx.shadowBlur = 10 * dpr; }
            poly(pts); ctx.stroke(); ctx.shadowBlur = 0;
          });
          ctx.setLineDash([]);
          var pr = reduceMotion ? 0.5 : (state.clock * 0.0004) % 1;
          var pp = project(chosen[Math.round(pr * 36)]);
          ctx.beginPath(); ctx.arc(pp.x, pp.y, 3.5 * dpr, 0, Math.PI * 2);
          ctx.fillStyle = rgba(WHITE, 1); ctx.shadowColor = rgba(CYAN, 1); ctx.shadowBlur = 12 * dpr; ctx.fill(); ctx.shadowBlur = 0;
          if (!reduceMotion) {
            drawArm(fk(poseAt((sim.u + 0.6) % T)), "ghost", 0.16);
            drawArm(fk(poseAt((sim.u + 1.2) % T)), "ghost", 0.08);
          }
          var end = project(chosen[33]);
          tag("best of 3 paths", end.x, end.y - 18 * dpr, CYAN);
          ctx.restore();
        }

        // sensor pulses on each joint
        var pulse = reduceMotion ? 0.5 : (state.clock * 0.0012) % 1;
        [arm.sh, arm.el, arm.wr].forEach(function (p, i) {
          var ph = (pulse + i * 0.33) % 1, q = project(p);
          ctx.beginPath(); ctx.arc(q.x, q.y, (7 + 12 * ph) * dpr, 0, Math.PI * 2);
          ctx.strokeStyle = rgba(AMBER, 0.7 * (1 - ph)); ctx.lineWidth = 1.5 * dpr; ctx.stroke();
        });

        // stage 4: detection box on the incoming part
        if (m.cam > 0 && partPos && partPos.x < FOV[1][0] + 0.05) {
          ctx.save(); ctx.globalAlpha = m.solid * m.cam;
          var bb = bracket(partPos);
          tag("part · 97%", (bb.x0 + bb.x1) / 2, bb.y0 - 12 * dpr, AMBER);
          ctx.restore();
        }

        telemetry(arm, m.cam);
        ctx.restore();
      }

      if (readout) {
        if (state.stage === 1) readout.textContent = "Geometry only · no live data";
        else {
          var deg = function (r) { var d = Math.round(r * 180 / Math.PI); return (d < 0 ? "−" : " ") + Math.abs(d); };
          var j = sim.joints;
          readout.textContent = "J1" + deg(j[0]) + "°  J2" + deg(j[1]) + "°  J3" + deg(j[2]) + "°   parts " + (sim.cycle + (sim.u > 4.35 ? 1 : 0));
        }
      }
    }

    function bracket(p) {
      var h = BOX * 0.85, dpr = state.dpr;
      var a = project({ x: p.x - h, y: p.y + h, z: p.z }), b = project({ x: p.x + h, y: p.y - h, z: p.z });
      var x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
      var L = (x1 - x0) * 0.3;
      ctx.beginPath(); ctx.lineWidth = 2 * dpr; ctx.strokeStyle = rgba(AMBER, 1);
      ctx.shadowColor = rgba(AMBER, 1); ctx.shadowBlur = 6 * dpr;
      [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]].forEach(function (k) {
        ctx.moveTo(k[0] + k[2] * L, k[1]); ctx.lineTo(k[0], k[1]); ctx.lineTo(k[0], k[1] + k[3] * L);
      });
      ctx.stroke(); ctx.shadowBlur = 0;
      return { x0: x0, x1: x1, y0: y0, y1: y1 };
    }

    // live telemetry panel in the top-right corner, fed by packets from each sensor
    function telemetry(arm, camMix) {
      var W = state.w, dpr = state.dpr;
      var pw = Math.min(176 * dpr, W * 0.34), ph = pw * 0.5, px = W - pw - 14 * dpr, py = 14 * dpr;
      var inX = px, inY = py + ph * 0.62;

      // data packets travelling from the joints (and the camera) into the panel
      var srcs = [arm.sh, arm.el, arm.wr];
      if (camMix > 0.5) srcs.push(CAM);
      srcs.forEach(function (s, i) {
        var a = project(s), cx = (a.x + inX) / 2, cy = Math.min(a.y, inY) - 40 * dpr;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(cx, cy, inX, inY);
        ctx.lineWidth = dpr; ctx.strokeStyle = rgba(AMBER, 0.12); ctx.stroke();
        for (var d = 0; d < 3; d++) {
          var t = reduceMotion ? (d + 1) / 4 : (state.clock * 0.0005 + d / 3 + i * 0.17) % 1;
          var x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * cx + t * t * inX;
          var y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * cy + t * t * inY;
          ctx.beginPath(); ctx.arc(x, y, 1.8 * dpr, 0, Math.PI * 2);
          ctx.fillStyle = rgba(AMBER, Math.sin(Math.PI * t) * 0.95); ctx.fill();
        }
      });

      rrect(px, py, pw, ph, 8 * dpr);
      ctx.fillStyle = "rgba(8,18,28,0.78)"; ctx.fill();
      ctx.strokeStyle = rgba(CYAN, 0.28); ctx.lineWidth = dpr; ctx.stroke();
      ctx.font = font(9); ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillStyle = rgba(CYAN, 0.85); ctx.fillText("JOINT TELEMETRY", px + 9 * dpr, py + 7 * dpr);
      var gx = px + 9 * dpr, gy = py + 24 * dpr, gw = pw - 18 * dpr, gh = ph - 32 * dpr;
      ctx.beginPath(); ctx.strokeStyle = rgba(CYAN, 0.12);
      for (var r = 0; r <= 2; r++) { ctx.moveTo(gx, gy + gh * r / 2); ctx.lineTo(gx + gw, gy + gh * r / 2); }
      ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.rect(gx, gy, gw, gh); ctx.clip();
      [[0, AMBER], [1, CYAN], [2, WHITE]].forEach(function (c) {
        ctx.beginPath(); ctx.lineWidth = 1.4 * dpr; ctx.strokeStyle = rgba(c[1], 0.95);
        hist.forEach(function (j, n) {
          var x = gx + gw * n / (hist.length - 1), y = gy + gh / 2 - (j[c[0]] / Math.PI) * gh * 0.5;
          if (n) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.stroke();
      });
      ctx.restore();
    }

    // ---------------------------------------------------------- loop
    var last = performance.now(), STAGE_MS = 6000;
    function frame(now) {
      var dt = Math.min(64, now - last); last = now;
      if (state.visible && !document.hidden) {
        state.clock += dt;
        step(dt / 1000);
        if (state.clock - lastSample > 60) { lastSample = state.clock; hist.push(sim.joints); if (hist.length > 64) hist.shift(); }
        var tg = mixTargets(), s = dt / 420;
        state.mix.solid = approach(state.mix.solid, tg.solid, s);
        state.mix.sim = approach(state.mix.sim, tg.sim, s);
        state.mix.cam = approach(state.mix.cam, tg.cam, s);
        if (state.auto) {
          state.stageTime += dt;
          if (state.stageTime > STAGE_MS) setStage(state.stage % 4 + 1, false);
        }
        draw();
      }
      requestAnimationFrame(frame);
    }

    if (reduceMotion) { state.stage = 4; sim.holding = true; }
    // ?stage=1..4 opens the figure on one stage and holds it there
    var asked = parseInt(new URLSearchParams(location.search).get("stage"), 10);
    if (asked >= 1 && asked <= 4) {
      state.stage = asked; state.auto = false; canvas.closest(".twin").classList.add("is-manual");
      newCycle(); sim.u = 1.0; sim.joints = poseAt(sim.u); sim.holding = false; fillHistory();
    }
    setStage(state.stage, false);
    snapMix();
    resize();
    if (!reduceMotion) requestAnimationFrame(frame);
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------------------ copy buttons */
  document.querySelectorAll(".copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var pre = btn.previousElementSibling;
      var text = btn.dataset.copy || (pre && pre.textContent) || "";
      var label = btn.textContent;
      var done = function (msg) { btn.textContent = msg; setTimeout(function () { btn.textContent = label; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done("Copied"); }, function () { selectFallback(pre); done("Press Ctrl+C"); });
      } else { selectFallback(pre); done("Press Ctrl+C"); }
    });
  });
  function selectFallback(el) {
    if (!el) return;
    var range = document.createRange(); range.selectNodeContents(el);
    var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  }

  /* ------------------------------------------------------------ nav highlight */
  var links = {};
  document.querySelectorAll(".nav a").forEach(function (a) { links[a.getAttribute("href").slice(1)] = a; });
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting || !links[e.target.id]) return;
        Object.keys(links).forEach(function (k) { links[k].removeAttribute("aria-current"); });
        links[e.target.id].setAttribute("aria-current", "true");
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    document.querySelectorAll("main section[id]").forEach(function (s) { io.observe(s); });
  }
})();
