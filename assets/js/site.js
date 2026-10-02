/* Feet2Feat project page: players, explorer, charts tooltips, gallery. No dependencies. */
(function () {
  "use strict";
  const CLIPS = window.F2F_CLIPS || {};
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = navigator.connection && navigator.connection.saveData;
  const portrait = () => window.matchMedia("(max-width: 700px)").matches;
  const SVGNS = "http://www.w3.org/2000/svg";
  const ICON_PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 2.5v11l9-5.5z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z"/></svg>';
  const fmt = (x, d) => Number(x).toFixed(d);

  /* ---------- top bar state and scrollspy ---------- */
  const topbar = document.getElementById("topbar");
  const navLinks = Array.from(document.querySelectorAll(".topnav a"));
  const onScroll = () => topbar.classList.toggle("scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  if ("IntersectionObserver" in window) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + entry.target.id));
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    navLinks.forEach((a) => { const el = document.querySelector(a.getAttribute("href")); if (el) spy.observe(el); });
  }

  /* ---------- trace chart synced to a player ---------- */
  function el(tag, attrs, parent) {
    const node = document.createElementNS(SVGNS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function Trace(host, trace) {
    host.innerHTML = "";
    if (!trace) { host.hidden = true; return null; }
    host.hidden = false;
    const narrow = host.clientWidth && host.clientWidth < 640;
    const W = narrow ? 520 : 1000, H = narrow ? 190 : 150, L = 40, R = 12, T = 14, B = 28;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": trace.label }, host);
    const tmax = trace.t[trace.t.length - 1];
    const all = trace.series.flatMap((s) => s.y);
    const ymax = Math.max(trace.ymin_max || 0, ...all) * 1.08;
    const x = (t) => L + (W - L - R) * (t / tmax);
    const y = (v) => H - B - (H - T - B) * (v / ymax);
    const ticks = trace.ticks || [0, ymax / 2];
    ticks.forEach((v) => {
      el("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: "#e4e7eb" }, svg);
      const tx = el("text", { x: L - 8, y: y(v) + 4, "text-anchor": "end", fill: "#8a939c", "font-size": 11 }, svg);
      tx.textContent = trace.fmt ? trace.fmt(v) : v + trace.unit;
    });
    for (let s = 0; s <= tmax; s += 5) {
      const tx = el("text", { x: x(s), y: H - 8, "text-anchor": "middle", fill: "#8a939c", "font-size": 11 }, svg);
      tx.textContent = s + " s";
    }
    const yl = el("text", { x: L, y: T - 1, fill: "#5c6670", "font-size": 11.5 }, svg);
    yl.textContent = trace.label;
    const lines = trace.series.map((s) => {
      const d = s.y.map((v, i) => (i ? "L" : "M") + x(trace.t[i]).toFixed(1) + " " + y(v).toFixed(1)).join("");
      el("path", { d, fill: "none", stroke: s.color, "stroke-width": s.dash ? 1.6 : 2.4, "stroke-dasharray": s.dash ? "5 4" : "none", "stroke-linejoin": "round" }, svg);
      return s.dash ? null : el("circle", { r: 4.5, fill: s.color, stroke: "#fff", "stroke-width": 1.5 }, svg);
    });
    const head = el("line", { y1: T, y2: H - B, stroke: "#101418", "stroke-width": 1, opacity: 0.35 }, svg);
    return {
      update(time) {
        const t = Math.min(time, tmax);
        let i = Math.round((t / tmax) * (trace.t.length - 1));
        i = Math.max(0, Math.min(trace.t.length - 1, i));
        head.setAttribute("x1", x(t)); head.setAttribute("x2", x(t));
        trace.series.forEach((s, k) => { if (lines[k]) { lines[k].setAttribute("cx", x(trace.t[i])); lines[k].setAttribute("cy", y(s.y[i])); } });
      },
    };
  }

  /* ---------- paired player ---------- */
  function Player(root, opts) {
    const stage = root.querySelector(".stage");
    const video = root.querySelector("video");
    const playBtn = root.querySelector(".ctl.play");
    const bigPlay = root.querySelector(".bigplay");
    const time = root.querySelector(".time");
    const scrub = root.querySelector(".scrub");
    const badge = root.querySelector(".badge");
    const speedBtns = Array.from(root.querySelectorAll(".speeds button"));
    const traceHost = root.querySelector(".trace");
    let rate = Number((speedBtns.find((b) => b.getAttribute("aria-pressed") === "true") || {}).dataset?.rate || 1);
    let userPaused = false, trace = null, scrubbing = false, clip = null, duration = 20;

    const setIcon = () => {
      const playing = !video.paused && !video.ended;
      playBtn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
      playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
      stage.classList.toggle("playing", playing || video.currentTime > 0.05);
    };
    const render = () => {
      const t = video.currentTime || 0;
      time.textContent = `${fmt(t, 1)} / ${fmt(duration, 1)} s`;
      if (!scrubbing) scrub.value = String(Math.round((t / duration) * 1000));
      if (trace) trace.update(t);
    };
    const loop = () => { render(); if (!video.paused) (video.requestVideoFrameCallback ? video.requestVideoFrameCallback(loop) : requestAnimationFrame(loop)); };
    const setRate = (r) => {
      rate = r; video.playbackRate = r; video.defaultPlaybackRate = r;
      speedBtns.forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.rate) === r)));
      if (badge) badge.textContent = (r === 1 ? "1× real time" : r + "× speed");
    };
    const play = () => { const p = video.play(); if (p && p.catch) p.catch(() => {}); };

    playBtn.innerHTML = ICON_PLAY;
    playBtn.addEventListener("click", () => { if (video.paused) { userPaused = false; play(); } else { userPaused = true; video.pause(); } });
    bigPlay.addEventListener("click", () => { userPaused = false; play(); });
    video.addEventListener("click", () => { if (video.paused) { userPaused = false; play(); } else { userPaused = true; video.pause(); } });
    video.addEventListener("play", () => { setIcon(); loop(); });
    video.addEventListener("pause", setIcon);
    video.addEventListener("ended", setIcon);
    video.addEventListener("loadedmetadata", () => { duration = video.duration || duration; video.playbackRate = rate; render(); });
    video.addEventListener("seeked", render);
    scrub.addEventListener("input", () => { scrubbing = true; video.currentTime = (Number(scrub.value) / 1000) * duration; render(); });
    scrub.addEventListener("change", () => { scrubbing = false; });
    speedBtns.forEach((b) => b.addEventListener("click", () => setRate(Number(b.dataset.rate))));
    root.addEventListener("keydown", (e) => {
      if (e.target.closest("input, button")) { if (e.key !== " ") return; }
      if (e.key === " ") { e.preventDefault(); playBtn.click(); }
      if (e.key === "ArrowRight") { video.currentTime = Math.min(duration, video.currentTime + (e.shiftKey ? 1 : 0.04)); }
      if (e.key === "ArrowLeft") { video.currentTime = Math.max(0, video.currentTime - (e.shiftKey ? 1 : 0.04)); }
    });
    root.tabIndex = -1;

    const load = (c) => {
      clip = c;
      const vertical = portrait();
      stage.classList.toggle("portrait", vertical);
      video.poster = vertical ? c.poster_v : c.poster;
      video.src = vertical ? c.src_v : c.src;
      video.setAttribute("aria-label", c.alt || "");
      duration = c.duration || 20;
      trace = traceHost ? Trace(traceHost, c.trace) : null;
      setRate(opts.rate || rate);
      render(); setIcon();
    };

    if (opts.autoplay && !reduceMotion && !saveData && "IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.35) { if (!userPaused && video.paused) play(); }
          else if (!video.paused) video.pause();
        });
      }, { threshold: [0, 0.35, 0.6] });
      io.observe(stage);
    }
    document.addEventListener("visibilitychange", () => { if (document.hidden && !video.paused) video.pause(); });
    return { load, video, setRate };
  }

  /* fill text placeholders from clip data, e.g. data-fill="turn_flat.lag.left" */
  document.querySelectorAll("[data-fill]").forEach((node) => {
    const v = node.dataset.fill.split(".").reduce((o, k) => (o ? o[k] : undefined), CLIPS);
    if (v !== undefined) node.textContent = v;
  });

  /* ---------- traces from clip data ---------- */
  function traceFor(c) {
    if (!c.series) return null;
    const S = c.series;
    const colors = { left: "#e69f00", right: "#4f86c6" };
    if (c.kind === "turn") return { label: "Heading lag behind the command (degrees)", t: S.t, unit: "°", ticks: [0, 30, 60, 90].filter((v) => v <= Math.max(...S.left, ...S.right) * 1.1), series: [{ y: S.left, color: colors.left }, { y: S.right, color: colors.right }] };
    if (c.kind === "walkturn") return { label: "Distance from the commanded path (m)", t: S.t, unit: " m", ticks: [0, 0.5, 1, 1.5].filter((v) => v <= Math.max(...S.left, ...S.right) * 1.1), series: [{ y: S.left, color: colors.left }, { y: S.right, color: colors.right }] };
    if (c.kind === "follow") return { label: "Backward progress along the command (m)", t: S.t, unit: " m", ticks: [0, 5, 10], series: [{ y: S.left, color: colors.left }, { y: S.right, color: colors.right }] };
    return null;
  }
  Object.values(CLIPS).forEach((c) => { if (c && typeof c === "object" && c.series) c.trace = traceFor(c); });

  /* ---------- hero ---------- */
  const heroRoot = document.getElementById("hero-player");
  if (heroRoot && CLIPS.turn_flat) Player(heroRoot, { autoplay: true, rate: 2 }).load(CLIPS.turn_flat);

  /* ---------- explorer ---------- */
  const exRoot = document.getElementById("explorer");
  if (exRoot && CLIPS.groups) {
    const player = Player(exRoot.querySelector("#explorer-player"), { autoplay: false, rate: 1 });
    const tabs = Array.from(document.querySelectorAll(".tabs .tab"));
    const sub = exRoot.querySelector(".subtabs");
    const show = (gid, cid, autoplay) => {
      const g = CLIPS.groups.find((x) => x.id === gid);
      const c = CLIPS[cid || g.clips[0]];
      tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.group === gid)));
      exRoot.querySelector(".ex-title").textContent = g.title;
      exRoot.querySelector(".ex-scope").textContent = c.scope || g.scope || "";
      sub.innerHTML = "";
      if (g.clips.length > 1) {
        g.clips.forEach((id) => {
          const b = document.createElement("button");
          b.type = "button"; b.className = "subtab"; b.textContent = CLIPS[id].variant;
          b.setAttribute("aria-pressed", String(id === (cid || g.clips[0])));
          b.addEventListener("click", () => show(gid, id, true));
          sub.appendChild(b);
        });
      }
      exRoot.querySelector(".ex-legend").innerHTML = c.legend || "";
      exRoot.querySelector(".ex-caption").innerHTML = c.caption || "";
      exRoot.querySelector(".ex-metrics").innerHTML = (c.metrics || []).map((m) =>
        `<div class="metric"><div class="label">${m.label}</div><div class="vals"><span class="v stock">${m.left}</span><span class="arrow">→</span><span class="v ours">${m.right}</span>${m.delta ? `<span class="delta">${m.delta}</span>` : ""}</div></div>`).join("");
      player.load(c);
      if (autoplay) { const p = player.video.play(); if (p && p.catch) p.catch(() => {}); }
      if (history.replaceState) history.replaceState(null, "", "#videos/" + (cid || g.clips[0]));
    };
    tabs.forEach((t) => t.addEventListener("click", () => show(t.dataset.group, null, true)));
    const m = location.hash.match(/^#videos\/(.+)$/);
    const start = m && CLIPS[m[1]] ? CLIPS.groups.find((g) => g.clips.includes(m[1])) : CLIPS.groups[0];
    show(start.id, m && CLIPS[m[1]] ? m[1] : null, false);
  }

  /* ---------- chart tooltips ---------- */
  const tip = document.getElementById("tooltip");
  let tipTarget = null;
  const placeTip = (e) => {
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - pad;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  };
  document.addEventListener("pointerover", (e) => {
    const t = e.target.closest && e.target.closest("[data-tip]");
    if (!t) return;
    tipTarget = t;
    tip.innerHTML = t.getAttribute("data-tip") + (t.dataset.img ? `<img src="${t.dataset.img}" alt="">` : "");
    tip.classList.add("on"); placeTip(e);
  });
  document.addEventListener("pointermove", (e) => { if (tipTarget) placeTip(e); });
  document.addEventListener("pointerout", (e) => { if (tipTarget && !tipTarget.contains(e.relatedTarget)) { tip.classList.remove("on"); tipTarget = null; } });

  /* ---------- gallery ---------- */
  const gallery = document.getElementById("gallery");
  if (gallery) {
    const tiles = Array.from(gallery.children);
    const filterBtns = Array.from(document.querySelectorAll("[data-filter]"));
    const sortBtns = Array.from(document.querySelectorAll("[data-sort]"));
    filterBtns.forEach((b) => b.addEventListener("click", () => {
      filterBtns.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      const f = b.dataset.filter;
      tiles.forEach((t) => { t.hidden = !(f === "all" || t.dataset.kind === f || t.dataset.kind === "reference"); });
    }));
    sortBtns.forEach((b) => b.addEventListener("click", () => {
      sortBtns.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      const key = b.dataset.sort;
      tiles.slice().sort((a, c) => key === "grid" ? Number(a.dataset.order) - Number(c.dataset.order) : Number(a.dataset.turning) - Number(c.dataset.turning)).forEach((t) => gallery.appendChild(t));
    }));
  }

  /* ---------- copy citation ---------- */
  document.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
    const text = document.querySelector(b.dataset.copy).textContent;
    const status = document.getElementById("copy-status");
    try { await navigator.clipboard.writeText(text); b.textContent = "Copied"; if (status) status.textContent = "Citation copied."; }
    catch (err) { b.textContent = "Select and copy"; }
    setTimeout(() => { b.textContent = "Copy"; }, 1800);
  }));
})();
