/* Sunil Choudhary, personal page.
   1. Twin figure: an industrial scene as a point cloud that morphs between a
      noisy physical capture and its clean digital twin. Both share one camera
      trajectory, which is the property the released dataset is built around.
   2. Copy buttons for BibTeX and email.
   3. Current-section highlight in the nav. */

(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------ twin figure */
  var canvas = document.getElementById("twin-canvas");
  if (canvas && canvas.getContext) initTwin(canvas);

  function initTwin(canvas) {
    var ctx = canvas.getContext("2d");
    var rand = mulberry32(7);
    var gauss = function () { // Box-Muller
      var u = 1 - rand(), v = rand();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };

    // Scene sampled on a regular lattice, the way a CAD-derived twin would be.
    var pts = [];
    function add(x, y, z, sigma) {
      pts.push({
        x: x, y: y, z: z,
        nx: gauss() * sigma, ny: gauss() * sigma, nz: gauss() * sigma,
        dropped: rand() < 0.14,          // holes in the physical capture
        outlier: false, floor: y === 0
      });
    }
    var i, j, a;
    // floor
    for (i = -22; i <= 22; i += 2) for (j = -22; j <= 22; j += 2) add(i / 10, 0, j / 10, 0.018);
    // machine body (box)
    var bx = -0.7, bz = -0.1, w = 1.1, h = 0.9, d = 0.8, s = 0.1;
    for (var u = 0; u <= w + 1e-6; u += s) for (var v = 0; v <= h + 1e-6; v += s) {
      add(bx - w / 2 + u, v, bz - d / 2, 0.022);
      add(bx - w / 2 + u, v, bz + d / 2, 0.022);
    }
    for (u = 0; u <= d + 1e-6; u += s) for (v = 0; v <= h + 1e-6; v += s) {
      add(bx - w / 2, v, bz - d / 2 + u, 0.022);
      add(bx + w / 2, v, bz - d / 2 + u, 0.022);
    }
    for (u = 0; u <= w + 1e-6; u += s) for (v = 0; v <= d + 1e-6; v += s) add(bx - w / 2 + u, h, bz - d / 2 + v, 0.022);
    // part on the machine (sphere, Fibonacci sampling)
    for (i = 0; i < 70; i++) {
      var yy = 1 - (i / 69) * 2, r = Math.sqrt(1 - yy * yy), th = i * 2.39996;
      add(bx + 0.15 + Math.cos(th) * r * 0.16, h + 0.16 + yy * 0.16, bz + Math.sin(th) * r * 0.16, 0.012);
    }
    // tank (vertical cylinder) with cap
    var tx = 0.95, tz = 0.35, tr = 0.38, thh = 1.3;
    for (v = 0; v <= thh + 1e-6; v += 0.1) for (a = 0; a < 24; a++) {
      add(tx + Math.cos(a / 24 * 2 * Math.PI) * tr, v, tz + Math.sin(a / 24 * 2 * Math.PI) * tr, 0.026);
    }
    for (var rr = 0.12; rr < tr; rr += 0.13) for (a = 0; a < 20; a++) {
      add(tx + Math.cos(a / 20 * 2 * Math.PI) * rr, thh, tz + Math.sin(a / 20 * 2 * Math.PI) * rr, 0.02);
    }
    // pipe joining machine and tank
    for (u = bx + w / 2; u <= tx - tr + 1e-6; u += 0.08) for (a = 0; a < 8; a++) {
      add(u, 0.7 + Math.cos(a / 8 * 2 * Math.PI) * 0.07, 0.15 + Math.sin(a / 8 * 2 * Math.PI) * 0.07, 0.015);
    }
    // floaters: reconstruction noise that exists only in the physical capture
    for (i = 0; i < 90; i++) {
      pts.push({ x: (rand() - 0.5) * 3.6, y: rand() * 1.6, z: (rand() - 0.5) * 3, nx: 0, ny: 0, nz: 0, dropped: false, outlier: true });
    }

    // One camera trajectory, shared by both domains.
    var target = { x: 0.1, y: 0.5, z: 0.1 };
    var traj = [];
    for (i = 0; i <= 44; i++) {
      a = -0.15 * Math.PI + (i / 44) * 1.35 * Math.PI;
      traj.push({ x: target.x + Math.cos(a) * 2.5, y: 1.7 + Math.sin(i / 44 * Math.PI * 3) * 0.1, z: target.z + Math.sin(a) * 2.1 });
    }

    var state = {
      t: 0, goal: 0,                     // 0 = physical, 1 = digital
      yaw: -0.55, pitch: 0.62, dist: 6.2,
      auto: !reduceMotion, visible: true, dragging: false,
      lastX: 0, lastY: 0, lastSwap: 0, w: 0, h: 0, dpr: 1
    };
    var colors = readColors();

    // Buttons
    var buttons = document.querySelectorAll(".twin-toggle button");
    buttons.forEach(function (b) {
      b.addEventListener("click", function () { state.auto = false; setMode(b.dataset.mode === "digital" ? 1 : 0); });
    });
    function setMode(goal) {
      state.goal = goal;
      if (reduceMotion) state.t = goal;
      buttons.forEach(function (b) {
        b.setAttribute("aria-pressed", String((b.dataset.mode === "digital" ? 1 : 0) === goal));
      });
      if (reduceMotion) draw();
    }

    // Drag to orbit
    canvas.addEventListener("pointerdown", function (e) {
      state.dragging = true; state.auto = false; state.lastX = e.clientX; state.lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!state.dragging) return;
      state.yaw += (e.clientX - state.lastX) * 0.008;
      state.pitch = Math.max(0.08, Math.min(1.2, state.pitch + (e.clientY - state.lastY) * 0.006));
      state.lastX = e.clientX; state.lastY = e.clientY;
      if (reduceMotion) draw();
    });
    ["pointerup", "pointercancel"].forEach(function (ev) {
      canvas.addEventListener(ev, function () { state.dragging = false; });
    });

    // Size and theme
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
      new IntersectionObserver(function (entries) { state.visible = entries[0].isIntersecting; }).observe(canvas);
    }

    function project(p, cy, sy, cp, sp, f, cx0, cy0) {
      var x = p.x - target.x, y = p.y - target.y, z = p.z - target.z;
      var x1 = x * cy - z * sy, z1 = x * sy + z * cy;          // yaw
      var y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;        // pitch
      var zc = z2 + state.dist;
      return { x: cx0 + (x1 * f) / zc, y: cy0 - (y2 * f) / zc, z: zc };
    }

    function draw() {
      var W = state.w, H = state.h, dpr = state.dpr;
      if (!W) return;
      ctx.clearRect(0, 0, W, H);
      var t = ease(state.t);
      var cy = Math.cos(state.yaw), sy = Math.sin(state.yaw), cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
      var f = Math.min(W, H * 1.3) * 1.05, cx0 = W / 2, cyy = H * 0.5;
      var col = mix(colors.phys, colors.accent, t);
      var fill = "rgb(" + col.join(",") + ")";

      // points
      ctx.fillStyle = fill;
      for (var k = 0; k < pts.length; k++) {
        var p = pts[k], alpha;
        if (p.outlier) alpha = (1 - t) * 0.55;
        else if (p.dropped) alpha = t * (p.floor ? 0.45 : 1);
        else alpha = p.floor ? 0.45 : 1;
        if (alpha < 0.02) continue;
        var q = project({ x: p.x + p.nx * (1 - t), y: p.y + p.ny * (1 - t), z: p.z + p.nz * (1 - t) }, cy, sy, cp, sp, f, cx0, cyy);
        if (q.z < 0.5) continue;
        var depth = Math.max(0.35, Math.min(1, 1.55 - q.z / (state.dist * 1.45)));
        var size = (1.5 + 1.3 * (state.dist / q.z)) * dpr * 0.9;
        ctx.globalAlpha = alpha * depth;
        ctx.fillRect(q.x - size / 2, q.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;

      // trajectory
      ctx.lineWidth = 1.2 * dpr;
      ctx.strokeStyle = "rgba(" + colors.ink.join(",") + ",0.45)";
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.beginPath();
      for (k = 0; k < traj.length; k++) {
        var tq = project(traj[k], cy, sy, cp, sp, f, cx0, cyy);
        if (k === 0) ctx.moveTo(tq.x, tq.y); else ctx.lineTo(tq.x, tq.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // camera frustums along the trajectory, each looking at the scene centre
      ctx.strokeStyle = "rgba(" + colors.ink.join(",") + ",0.8)";
      ctx.lineWidth = 1 * dpr;
      for (k = 0; k < traj.length; k += 4) drawFrustum(traj[k], cy, sy, cp, sp, f, cx0, cyy);
    }

    function drawFrustum(c, cy, sy, cp, sp, f, cx0, cyy) {
      var fx = target.x - c.x, fy = target.y - c.y, fz = target.z - c.z;
      var fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
      var rx = fz, rz = -fx, rl = Math.hypot(rx, rz); rx /= rl; rz /= rl;   // right = forward x up
      var ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;             // up = right x forward
      var dpt = 0.32, hw = 0.16, hh = 0.11;
      var o = project(c, cy, sy, cp, sp, f, cx0, cyy);
      var corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (m) {
        return project({
          x: c.x + fx * dpt + rx * hw * m[0] + ux * hh * m[1],
          y: c.y + fy * dpt + uy * hh * m[1],
          z: c.z + fz * dpt + rz * hw * m[0] + uz * hh * m[1]
        }, cy, sy, cp, sp, f, cx0, cyy);
      });
      ctx.beginPath();
      corners.forEach(function (q) { ctx.moveTo(o.x, o.y); ctx.lineTo(q.x, q.y); });
      ctx.moveTo(corners[0].x, corners[0].y);
      for (var m = 1; m <= 4; m++) ctx.lineTo(corners[m % 4].x, corners[m % 4].y);
      ctx.stroke();
    }

    var last = performance.now();
    function frame(now) {
      var dt = Math.min(64, now - last); last = now;
      if (state.visible && !document.hidden) {
        if (state.auto) {
          state.yaw += dt * 0.00018;
          if (now - state.lastSwap > 4200) { state.lastSwap = now; setMode(state.goal ? 0 : 1); }
        }
        state.t += (state.goal - state.t) * Math.min(1, dt * 0.0035);
        draw();
      }
      requestAnimationFrame(frame);
    }

    resize();
    if (!reduceMotion) { state.lastSwap = performance.now(); requestAnimationFrame(frame); }
  }

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    return { phys: hex(cs.getPropertyValue("--phys")), accent: hex(cs.getPropertyValue("--accent")), ink: hex(cs.getPropertyValue("--ink")) };
  }
  function hex(v) {
    v = v.trim().replace("#", "");
    if (v.length === 3) v = v.split("").map(function (c) { return c + c; }).join("");
    var n = parseInt(v, 16);
    return isNaN(n) ? [90, 100, 110] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) { return [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * t); }); }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
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
