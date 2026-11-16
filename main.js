/*
  main.js: everything on the MOI website that moves or thinks.
  Parts, in order:
    1. Setup and settings checks (reduce motion, phone, touch)
    2. Ink canvas: drifting letters that get pushed away by the mouse
    3. Mouse glow, hero parallax, and tilting cards
    4. Scroll story: the Read/Think/Write/Finish scene follows your scroll
    5. Reveal-on-scroll
    6. Download section (reads downloads.json)
  Syntax note: "const x = ..." makes a named value; "function name() {}" is a
  reusable recipe; "() => {}" is a short unnamed recipe, often handed to
  something that will run it later (for example when the mouse moves).
*/
(function () {
  "use strict"; // asks the browser to be stricter about mistakes

  // ---------- 1. Setup ----------
  document.documentElement.classList.add("js"); // tells the CSS that JavaScript is on

  var calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches; // visitor asked for less motion
  var touch = window.matchMedia("(pointer: coarse)").matches;               // phone or tablet
  var small = window.innerWidth < 800;
  var lightMode = touch || small; // phones get fewer particles and no tilt, to stay smooth

  var mouse = { x: -9999, y: -9999 }; // far away until the mouse first moves
  var scrollY = 0;

  // ---------- 2. Ink canvas ----------
  var canvas = document.getElementById("ink");
  var ctx = canvas.getContext("2d");
  var W = 0, H = 0, dpr = 1, parts = [];
  var GLYPHS = "abcdefghilmnoprstuw&§¶*#[]".split("");

  // Sizes the canvas to the window (and sharp on high-resolution screens)
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var count = lightMode ? 28 : Math.round(Math.min(110, W * H / 14000));
    parts = [];
    for (var i = 0; i < count; i++) {
      parts.push({
        x: Math.random() * W, y: Math.random() * H,
        ox: 0, oy: 0,                                  // push offset from the mouse
        vx: (Math.random() - .5) * .25, vy: -Math.random() * .3 - .05, // slow upward drift
        s: 12 + Math.random() * 26,                    // font size
        g: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
        a: .05 + Math.random() * .16                   // see-through-ness
      });
    }
    draw(); // draw once so reduce-motion visitors still see the background
  }

  // Paints every letter at its current spot
  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      ctx.font = p.s + "px Georgia, serif";
      ctx.fillStyle = "rgba(243,236,224," + p.a + ")";
      // scrolling shifts the letters at a speed tied to their size: depth (parallax)
      var py = ((p.y + p.oy - scrollY * p.s * .01) % (H + 60) + H + 60) % (H + 60) - 30;
      ctx.fillText(p.g, p.x + p.ox, py);
    }
  }

  // Moves the letters one tiny step; mouse pushes nearby ones away, then they ease back
  function step() {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < -30) p.x = W + 30; if (p.x > W + 30) p.x = -30;
      var py = ((p.y + p.oy - scrollY * p.s * .01) % (H + 60) + H + 60) % (H + 60) - 30;
      var dx = p.x + p.ox - mouse.x, dy = py - mouse.y, d2 = dx * dx + dy * dy;
      if (d2 < 22500 && d2 > 1) { // within 150px of the pointer
        var d = Math.sqrt(d2), f = (150 - d) / 150;
        p.ox += dx / d * f * 4; p.oy += dy / d * f * 4;
      }
      p.ox *= .94; p.oy *= .94; // spring back
    }
  }

  // ---------- 3. Mouse effects ----------
  var root = document.documentElement;
  var lines = document.querySelectorAll(".hero h1 .line");
  var heroShift = { x: 0, y: 0 };
  var needFrame = true; // used by the animation loop below

  if (!touch) {
    window.addEventListener("mousemove", function (e) {
      mouse.x = e.clientX; mouse.y = e.clientY;
      root.style.setProperty("--mx", e.clientX + "px");
      root.style.setProperty("--my", e.clientY + "px");
      heroShift.x = (e.clientX / W - .5); heroShift.y = (e.clientY / H - .5);
    }, { passive: true });

    if (!calm) {
      // Tilt cards toward the mouse and move their inner spotlight
      document.querySelectorAll(".card").forEach(function (card) {
        card.addEventListener("mousemove", function (e) {
          var r = card.getBoundingClientRect();
          // clamp keeps the numbers between 0 and 1 so the tilt can never flip the card over
          var px = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), py = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
          card.style.setProperty("--cx", px * 100 + "%");
          card.style.setProperty("--cy", py * 100 + "%");
          card.style.transform = "perspective(700px) rotateX(" + (.5 - py) * 10 + "deg) rotateY(" + (px - .5) * 12 + "deg) translateY(-4px)";
        });
        card.addEventListener("mouseleave", function () { card.style.transform = ""; });
      });
    }
  }

  // ---------- 4. Scroll story ----------
  var story = document.getElementById("story");
  var stageBtns = document.querySelectorAll(".stages button");
  var copies = document.querySelectorAll(".copy");
  var scenes = document.querySelectorAll(".scene");
  var bar = document.getElementById("progress-bar");
  var currentStage = -1;

  // Highlights stage n (0 to 3) in the list, text and pretend window
  function showStage(n) {
    if (n === currentStage) return;
    currentStage = n;
    for (var i = 0; i < 4; i++) {
      var on = i === n;
      stageBtns[i].classList.toggle("on", on);
      stageBtns[i].setAttribute("aria-current", on ? "step" : "false");
      copies[i].classList.toggle("on", on);
      scenes[i].classList.toggle("on", on);
    }
  }

  // How far through the story section the visitor has scrolled, from 0 to 1
  function storyProgress() {
    var r = story.getBoundingClientRect();
    var total = story.offsetHeight - window.innerHeight;
    return Math.max(0, Math.min(1, -r.top / total));
  }

  // Clicking a stage name (or pressing Enter on it) scrolls to that part of the story
  stageBtns.forEach(function (b, i) {
    b.addEventListener("click", function () {
      var total = story.offsetHeight - window.innerHeight;
      var top = story.getBoundingClientRect().top + window.pageYOffset;
      window.scrollTo({ top: top + total * (i + .5) / 4, behavior: calm ? "auto" : "smooth" });
    });
  });

  // ---------- 5. Reveal on scroll ----------
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { threshold: .12 });
    reveals.forEach(function (el, i) { el.style.transitionDelay = (i % 4) * 80 + "ms"; io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  // ---------- Animation loop ----------
  // requestAnimationFrame asks the browser to call us right before each screen
  // refresh, so motion stays in step with the display and pauses in hidden tabs.
  function frame() {
    scrollY = window.pageYOffset;
    var p = storyProgress();
    showStage(Math.min(3, Math.floor(p * 4)));
    bar.style.transform = "scaleX(" + p + ")";
    if (!calm) {
      step(); draw();
      for (var i = 0; i < lines.length; i++) { // hero words slide with scroll and mouse
        var depth = parseFloat(lines[i].getAttribute("data-depth"));
        lines[i].style.transform = "translate(" + heroShift.x * depth * -120 + "px," + (scrollY * depth * -1.2 + heroShift.y * depth * -60) + "px)";
      }
    } else { draw(); }
    requestAnimationFrame(frame);
  }
  window.addEventListener("resize", resize);
  resize();
  if (calm) {
    // In calm mode redraw only when scrolling, not 60 times a second
    window.addEventListener("scroll", function () { scrollY = window.pageYOffset; showStage(Math.min(3, Math.floor(storyProgress() * 4))); bar.style.transform = "scaleX(" + storyProgress() + ")"; draw(); }, { passive: true });
    showStage(0);
  } else {
    requestAnimationFrame(frame);
  }

  // ---------- 6. Download section ----------
  // A copy of downloads.json used when the page is opened straight from a file
  // (browsers block reading other files that way). Keep it in step with downloads.json.
  var FALLBACK = { version: "0.1.0-test", date: "2026-11-16", mac: "", windows: "",
    notes: ["Early test version for friends. Expect rough edges.", "Read, Think, Write and Finish in one window.", "Your notes are plain Markdown files in a folder you choose."] };

  // Fills in the version, notes and the two buttons
  function showDownloads(d) {
    document.getElementById("dl-version").textContent = d.version;
    document.getElementById("dl-date").textContent = "(" + d.date + ")";
    var ul = document.getElementById("dl-notes");
    ul.innerHTML = "";
    (d.notes || []).forEach(function (n) { var li = document.createElement("li"); li.textContent = n; ul.appendChild(li); });

    var ua = navigator.userAgent;
    var os = /Windows/i.test(ua) ? "win" : /iPhone|iPad|Android/i.test(ua) ? "mobile" : /Mac/i.test(ua) ? "mac" : "other";
    var info = document.getElementById("dl-detected");
    info.textContent = os === "mac" ? "It looks like you are on a Mac." : os === "win" ? "It looks like you are on Windows." :
      os === "mobile" ? "MOI is a computer app. Open this page on a Mac or Windows computer to download it." : "";

    [["dl-mac", d.mac, "Mac", "mac"], ["dl-win", d.windows, "Windows", "win"]].forEach(function (b) {
      var a = document.getElementById(b[0]);
      if (b[1]) { a.href = b[1]; a.textContent = "Download for " + b[2]; a.setAttribute("download", ""); }
      else { a.textContent = "Download for " + b[2] + ": coming soon"; a.classList.add("soon"); a.removeAttribute("href"); a.setAttribute("aria-disabled", "true"); }
      if (os === b[3]) a.classList.add("mine"); // highlight the visitor's own system
    });
  }

  fetch("downloads.json").then(function (r) { return r.json(); }).then(showDownloads)
    .catch(function () { showDownloads(FALLBACK); });
})();
