/* Sunil Choudhary, personal page.
   1. Digital twin figure: a robot cell that grows through four stages of a
      digital twin, from a static 3D model to a live, simulating, self-adjusting
      copy of the cell.
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
    var desc = document.getElementById("twin-desc");
    var stepButtons = Array.prototype.slice.call(document.querySelectorAll(".twin-step"));

    // ---------------------------------------------------------- robot model
    var SH = 0.62, L1 = 1.0, L2 = 0.92, G = 0.22, BOX = 0.22;   // metres, roughly
    var BELT_Y = 0.34, BELT_Z = -1.3, BELT_X0 = -0.1, BELT_X1 = 2.7;
    var PAL = { x: -1.05, z: 0.85, h: 0.12 };
    var CAM = { x: 1.95, y: 2.0, z: -2.15 };
    var SLOTS = [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]];
    var BUMPS = [0.0, 0.28, 0.6];          // candidate transfer arcs; index 1 is chosen

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
    var state = {
      stage: 1, auto: !reduceMotion, stageTime: 0,
      yaw: 0.62, pitch: 0.5, dist: 7.0, visible: true, w: 0, h: 0, dpr: 1, clock: 0
    };
    var colors = readColors();
    var target = { x: 0.55, y: 0.35, z: -0.45 };

    // ---------------------------------------------------------- simulation state
    var rand = mulberry32(11);
    var sim = { cycle: 0, u: 0, placed: [], pick: null, place: null, J: null, joints: null, holding: false };
    var T = 6.0;
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

    newCycle();
    sim.u = reduceMotion ? 3.0 : 0;
    sim.joints = poseAt(sim.u);

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
      if (reduceMotion) { newCycle(); sim.u = 3.0; sim.joints = poseAt(sim.u); sim.holding = true; draw(); }
    }
    stepButtons.forEach(function (b, i) { b.addEventListener("click", function () { setStage(i + 1, true); }); });

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
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () { colors = readColors(); draw(); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (e) { state.visible = e[0].isIntersecting; }).observe(canvas);
    }

    // ---------------------------------------------------------- drawing
    var P;   // projection constants for the current frame
    function project(p) {
      var x = p.x - target.x, y = p.y - target.y, z = p.z - target.z;
      var x1 = x * P.cy - z * P.sy, z1 = x * P.sy + z * P.cy;
      var y2 = y * P.cp - z1 * P.sp, z2 = y * P.sp + z1 * P.cp;
      var zc = z2 + state.dist;
      return { x: P.cx + (x1 * P.f) / zc, y: P.cyy - (y2 * P.f) / zc, z: zc, k: P.f / zc };
    }
    function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
    function line(a, b) { var p = project(a), q = project(b); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); }
    function poly(pts, close) {
      pts.forEach(function (p, i) { var q = project(p); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
      if (close) ctx.closePath();
    }
    function cuboid(x0, y0, z0, x1, y1, z1, fill, edge, lw) {
      var c = [
        { x: x0, y: y0, z: z0 }, { x: x1, y: y0, z: z0 }, { x: x1, y: y0, z: z1 }, { x: x0, y: y0, z: z1 },
        { x: x0, y: y1, z: z0 }, { x: x1, y: y1, z: z0 }, { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 }
      ];
      var pc = c.map(project);
      var faces = [[4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
        .map(function (f) { return { f: f, z: (pc[f[0]].z + pc[f[1]].z + pc[f[2]].z + pc[f[3]].z) / 4 }; })
        .sort(function (a, b) { return b.z - a.z; });
      ctx.lineWidth = lw; ctx.lineJoin = "round";
      faces.forEach(function (o) {
        ctx.beginPath();
        o.f.forEach(function (k, n) { if (n) ctx.lineTo(pc[k].x, pc[k].y); else ctx.moveTo(pc[k].x, pc[k].y); });
        ctx.closePath();
        if (fill) { ctx.fillStyle = o.f[0] === 4 ? fill.top : fill.side; ctx.fill(); }
        ctx.strokeStyle = edge; ctx.stroke();
      });
    }
    function box(cx, cy, cz) {
      var h = BOX / 2;
      cuboid(cx - h, cy - h, cz - h, cx + h, cy + h, cz + h,
        { top: rgba(colors.signalWash, 1), side: rgba(colors.signal, 0.6) }, rgba(colors.ink, 0.85), state.dpr);
    }

    function draw() {
      var W = state.w, H = state.h, dpr = state.dpr;
      if (!W || !sim.J) return;
      var yaw = state.yaw + (reduceMotion ? 0 : Math.sin(state.clock * 0.00012) * 0.12);
      P = { cy: Math.cos(yaw), sy: Math.sin(yaw), cp: Math.cos(state.pitch), sp: Math.sin(state.pitch),
            f: Math.min(W, H * 1.5) * 1.3, cx: W * 0.5, cyy: H * 0.55 };
      ctx.clearRect(0, 0, W, H);
      var stage = state.stage, solid = stage >= 2;
      var wire = rgba(colors.accent, 0.75), ink = rgba(colors.ink, 0.9);
      var plain = solid ? { top: rgba(colors.surface, 1), side: rgba(colors.muted, 0.35) } : null;

      // floor grid
      ctx.beginPath(); ctx.lineWidth = dpr; ctx.strokeStyle = rgba(colors.muted, 0.22);
      for (var g = -1.5; g <= 3.01; g += 0.5) line({ x: g, y: 0, z: -2.5 }, { x: g, y: 0, z: 1.5 });
      for (g = -2.5; g <= 1.51; g += 0.5) line({ x: -1.5, y: 0, z: g }, { x: 3, y: 0, z: g });
      ctx.stroke();

      // camera on a pole (part of the model from the start)
      ctx.beginPath(); ctx.lineWidth = (solid ? 2.5 : 1) * dpr; ctx.strokeStyle = solid ? ink : wire;
      line({ x: CAM.x, y: 0, z: CAM.z }, CAM); ctx.stroke();
      cuboid(CAM.x - 0.1, CAM.y - 0.07, CAM.z - 0.07, CAM.x + 0.1, CAM.y + 0.07, CAM.z + 0.07,
        solid ? { top: rgba(colors.surface, 1), side: rgba(colors.ink, 0.85) } : null, solid ? ink : wire, dpr);

      // pallet and placed parts
      cuboid(PAL.x - 0.38, 0, PAL.z - 0.38, PAL.x + 0.38, PAL.h, PAL.z + 0.38, plain, solid ? ink : wire, dpr);
      if (solid) sim.placed.forEach(function (p) { box(p.x, PAL.h + BOX / 2, p.z); });

      // conveyor with moving slats
      cuboid(BELT_X0, 0, BELT_Z - 0.3, BELT_X1, BELT_Y, BELT_Z + 0.3, plain, solid ? ink : wire, dpr);
      ctx.beginPath(); ctx.lineWidth = dpr; ctx.strokeStyle = rgba(colors.muted, solid ? 0.5 : 0.35);
      var off = solid && !reduceMotion ? (state.clock * 0.0004) % 0.25 : 0;
      for (var s = BELT_X0 + 0.1 + off; s < BELT_X1 - 0.05; s += 0.25) {
        line({ x: s, y: BELT_Y + 0.001, z: BELT_Z - 0.28 }, { x: s, y: BELT_Y + 0.001, z: BELT_Z + 0.28 });
      }
      ctx.stroke();

      // incoming part on the belt
      var partPos = null;
      if (solid && sim.u < 1.75) {
        var e = 1 - Math.pow(1 - Math.min(1, sim.u / 1.5), 3);
        partPos = { x: BELT_X1 - 0.25 + (sim.pick.x - (BELT_X1 - 0.25)) * e, y: BELT_Y + BOX / 2, z: sim.pick.z };
        box(partPos.x, partPos.y, partPos.z);
      }

      // stage 4: camera field of view and a detection bracket on the part
      if (stage >= 4) {
        var fov = [[0.05, -1.65], [1.55, -1.65], [1.55, -0.95], [0.05, -0.95]].map(function (c) { return { x: c[0], y: BELT_Y, z: c[1] }; });
        ctx.beginPath(); ctx.lineWidth = dpr; ctx.strokeStyle = rgba(colors.signal, 0.55); ctx.setLineDash([3 * dpr, 4 * dpr]);
        fov.forEach(function (c) { line(CAM, c); });
        ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.strokeStyle = rgba(colors.signal, 0.7); poly(fov, true); ctx.stroke();
        if (partPos && partPos.x < 1.6) bracket(partPos);
      }

      // stage 3+: candidate transfer paths (the chosen one solid) and a ghost of the next pose
      if (stage >= 3) {
        BUMPS.forEach(function (b, i) {
          ctx.beginPath(); ctx.lineWidth = (i === 1 ? 2 : 1.2) * dpr;
          ctx.strokeStyle = rgba(colors.accent, i === 1 ? 0.95 : 0.4);
          ctx.setLineDash(i === 1 ? [] : [5 * dpr, 5 * dpr]);
          var pts = [];
          for (var k = 0; k <= 32; k++) pts.push(fk(lerpJ(sim.J.B, sim.J.A, k / 32, b)).tip);
          poly(pts); ctx.stroke();
        });
        ctx.setLineDash([]);
        if (!reduceMotion) drawArm(fk(poseAt((sim.u + 0.8) % T)), "ghost");
      }

      // robot
      var arm = fk(stage === 1 ? sim.J.A : sim.joints);
      drawArm(arm, solid ? "solid" : "wire");
      if (solid && sim.holding) box(arm.tip.x, arm.tip.y - BOX / 2, arm.tip.z);

      // stage 2+: sensor pulses on each joint
      if (solid) {
        var pulse = reduceMotion ? 0.5 : (state.clock * 0.0012) % 1;
        [{ x: 0, y: 0.12, z: 0 }, arm.sh, arm.el, arm.wr].forEach(function (p, i) {
          var ph = (pulse + i * 0.25) % 1, q = project(p);
          ctx.beginPath(); ctx.arc(q.x, q.y, (6 + 10 * ph) * dpr, 0, Math.PI * 2);
          ctx.strokeStyle = rgba(colors.signal, 0.75 * (1 - ph)); ctx.lineWidth = 1.5 * dpr; ctx.stroke();
        });
      }

      if (readout) {
        if (stage === 1) readout.textContent = "Geometry only, no live data";
        else {
          var deg = function (r) { return Math.round(r * 180 / Math.PI); }, j = sim.joints;
          readout.textContent = "J1 " + deg(j[0]) + "°  J2 " + deg(j[1]) + "°  J3 " + deg(j[2]) + "°  Parts " + (sim.cycle + (sim.u > 4.35 ? 1 : 0));
        }
      }
    }

    function bracket(p) {
      var h = BOX * 0.8;
      var a = project({ x: p.x - h, y: p.y + h, z: p.z }), b = project({ x: p.x + h, y: p.y - h, z: p.z });
      var x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
      var L = (x1 - x0) * 0.3;
      ctx.beginPath(); ctx.lineWidth = 2 * state.dpr; ctx.strokeStyle = rgba(colors.signal, 1);
      [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]].forEach(function (k) {
        ctx.moveTo(k[0] + k[2] * L, k[1]); ctx.lineTo(k[0], k[1]); ctx.lineTo(k[0], k[1] + k[3] * L);
      });
      ctx.stroke();
    }

    function drawArm(a, mode) {
      var dpr = state.dpr, cy = Math.cos(a.yaw), sy = Math.sin(a.yaw);
      var solid = mode === "solid", ghost = mode === "ghost";
      var stroke = solid ? rgba(colors.ink, 0.92) : rgba(colors.accent, 0.85);
      if (!ghost) {
        var ring = function (y) {
          var pts = [];
          for (var i = 0; i <= 24; i++) { var t = i / 24 * Math.PI * 2; pts.push({ x: Math.cos(t) * 0.3, y: y, z: Math.sin(t) * 0.3 }); }
          return pts;
        };
        ctx.lineWidth = dpr; ctx.strokeStyle = stroke;
        ctx.beginPath(); poly(ring(0)); ctx.stroke();
        ctx.beginPath(); poly(ring(0.12), true);
        if (solid) { ctx.fillStyle = rgba(colors.surface, 1); ctx.fill(); }
        ctx.stroke();
      }
      [[{ x: 0, y: 0.12, z: 0 }, a.sh, 0.13], [a.sh, a.el, 0.11], [a.el, a.wr, 0.085], [a.wr, a.tip, 0.04]].forEach(function (sg) {
        var p = project(sg[0]), q = project(sg[1]);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.lineCap = "round";
        if (solid) { ctx.lineWidth = sg[2] * p.k; ctx.strokeStyle = stroke; }
        else if (ghost) { ctx.lineWidth = sg[2] * p.k; ctx.strokeStyle = rgba(colors.accent, 0.13); }
        else { ctx.lineWidth = 1.2 * dpr; ctx.strokeStyle = stroke; }
        ctx.stroke();
      });
      if (ghost) return;
      // gripper fingers, perpendicular to the arm's heading
      var open = sim.holding && solid ? BOX / 2 + 0.01 : 0.15;
      ctx.beginPath(); ctx.lineWidth = (solid ? 3 : 1.2) * dpr; ctx.strokeStyle = stroke;
      [-1, 1].forEach(function (sg) {
        var fx = a.tip.x - sy * open * sg, fz = a.tip.z + cy * open * sg;
        line({ x: a.tip.x - sy * 0.15 * sg, y: a.tip.y, z: a.tip.z + cy * 0.15 * sg }, { x: fx, y: a.tip.y, z: fz });
        line({ x: fx, y: a.tip.y, z: fz }, { x: fx, y: a.tip.y - 0.14, z: fz });
      });
      ctx.stroke();
      [a.sh, a.el, a.wr].forEach(function (p) {
        var q = project(p);
        ctx.beginPath(); ctx.arc(q.x, q.y, solid ? 0.07 * q.k : 3 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = rgba(colors.surface, 1); ctx.fill();
        ctx.lineWidth = (solid ? 2 : 1.2) * dpr; ctx.strokeStyle = stroke; ctx.stroke();
      });
    }

    // ---------------------------------------------------------- loop
    var last = performance.now(), STAGE_MS = 6000;
    function frame(now) {
      var dt = Math.min(64, now - last); last = now;
      if (state.visible && !document.hidden) {
        state.clock += dt;
        if (state.stage >= 2) step(dt / 1000);
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
      newCycle(); sim.u = 1.0; sim.joints = poseAt(sim.u); sim.holding = false;
    }
    setStage(state.stage, false);
    resize();
    if (!reduceMotion) requestAnimationFrame(frame);
  }

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    var get = function (n) { return hex(cs.getPropertyValue(n)); };
    return { signal: get("--signal"), signalWash: get("--signal-wash"), accent: get("--accent"), ink: get("--ink"), muted: get("--muted"), surface: get("--surface") };
  }
  function hex(v) {
    v = v.trim().replace("#", "");
    if (v.length === 3) v = v.split("").map(function (c) { return c + c; }).join("");
    var n = parseInt(v, 16);
    return isNaN(n) ? [90, 100, 110] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
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
