/* Load and play each looping clip only while it is on screen; never autoplay under reduced motion. */
(function () {
  "use strict";
  const videos = document.querySelectorAll("video[data-src]");
  const phone = window.matchMedia("(max-width: 700px)").matches;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const load = (v) => {
    if (!v.getAttribute("src")) v.src = (phone && v.dataset.srcPhone) || v.dataset.src;
  };
  if (still) videos.forEach((v) => { v.controls = true; });
  const show = (v) => { load(v); if (!still) v.play().catch(() => {}); };
  if (!("IntersectionObserver" in window)) { videos.forEach(show); return; }
  const seen = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) show(e.target);
      else if (e.target.getAttribute("src")) e.target.pause();
    });
  }, { rootMargin: "200px 0px" });
  videos.forEach((v) => seen.observe(v));
})();
