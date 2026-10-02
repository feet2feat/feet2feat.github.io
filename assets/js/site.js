/* Load and play each looping clip only while it is on screen; never autoplay under reduced motion.
   A clip the reader pauses stays paused until the reader plays it again. */
(function () {
  "use strict";
  const videos = document.querySelectorAll("video[data-src]");
  const phone = window.matchMedia("(max-width: 700px)").matches;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const onScreen = new Set();
  const held = new Set();
  videos.forEach((v) => {
    if (phone && v.dataset.posterPhone) v.poster = v.dataset.posterPhone;
    if (still) v.controls = true;
    v.addEventListener("pause", () => { if (onScreen.has(v) && !v.ended) held.add(v); });
    v.addEventListener("play", () => held.delete(v));
  });
  const load = (v) => {
    if (!v.getAttribute("src")) v.src = (phone && v.dataset.srcPhone) || v.dataset.src;
  };
  const show = (v) => {
    load(v);
    if (!still && !held.has(v)) v.play().catch(() => {});
  };
  if (!("IntersectionObserver" in window)) { videos.forEach(show); return; }
  const seen = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const v = e.target;
      if (e.isIntersecting) { onScreen.add(v); show(v); }
      else { onScreen.delete(v); if (v.getAttribute("src")) v.pause(); }
    });
  }, { rootMargin: "200px 0px" });
  videos.forEach((v) => seen.observe(v));
})();
