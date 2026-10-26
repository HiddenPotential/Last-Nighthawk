// Places: switch between the orb room, the deep ocean, the sand garden, the lantern lake, the wooden fish, the bamboo grove, the rainy window and the hearth.
// Each place's elements carry data-for="<place>"; the rest fade out (class "away").
// game.js, deep.js, sand.js, lanterns.js, woodfish.js, bamboo.js, window.js and hearth.js read document.body.dataset.place and pause while away.
(() => {
  "use strict";
  const KEY = "drift-place";
  const PLACES = ["orbs", "deep", "sand", "lanterns", "woodfish", "bamboo", "window", "hearth"];
  const CHIME = { orbs: [9, 12], deep: [7, 10], sand: [5, 8], lanterns: [6, 11], woodfish: [4, 9], bamboo: [7, 12], window: [8, 13], hearth: [5, 10] };
  const THEME_COLOR = { deep: "#030a16", sand: "#cfc4ae", lanterns: "#0b0c26", woodfish: "#1d0e09", bamboo: "#16200f", window: "#0b1028", hearth: "#140b07" };

  let place = "orbs";
  try { place = localStorage.getItem(KEY) || "orbs"; } catch (_) { /* storage unavailable */ }
  if (place === "pond") place = "deep"; // the koi pond was replaced by the deep ocean
  if (!PLACES.includes(place)) place = "orbs";

  function go(p, initial = false) {
    place = p;
    document.body.dataset.place = p;
    for (const el of document.querySelectorAll("[data-for]")) el.classList.toggle("away", el.dataset.for !== p);
    for (const b of document.querySelectorAll("#places button")) b.setAttribute("aria-pressed", b.dataset.place === p);
    try { localStorage.setItem(KEY, p); } catch (_) { /* ignore */ }
    if (THEME_COLOR[p]) document.querySelector('meta[name="theme-color"]').setAttribute("content", THEME_COLOR[p]);
    else window.Zen?.syncUi();
    window.dispatchEvent(new CustomEvent("placechange", { detail: p }));
    if (!initial && window.Zen) {
      Zen.ensureAudio();
      // a soft two-note chime as you arrive
      const [a, b] = CHIME[p] || CHIME.orbs;
      Zen.bell(Zen.noteFreq(a), 0.035, innerWidth / 2, 2.4);
      setTimeout(() => Zen.bell(Zen.noteFreq(b), 0.03, innerWidth / 2, 2.6), 140);
    }
  }

  for (const b of document.querySelectorAll("#places button")) {
    b.addEventListener("click", () => { if (b.dataset.place !== place) go(b.dataset.place); });
  }
  go(place, true);
})();
