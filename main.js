/*
  main.js: everything on the MOI website that moves or thinks.
  Parts, in order:
    1. Setup and settings checks (reduce motion, phone, touch)
    2. Ink canvas: drifting letters pushed by the mouse, threads from the
       mouse to nearby letters, and a trail of sparks behind the pointer
    3. Mouse glow, hero parallax, magnetic buttons and tilting cards
    4. Scroll story: the Read/Think/Write/Finish stage follows your scroll and
       swaps the page colour and the big background scene to match
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
  // One colour per stage, written twice: as a normal colour for the CSS, and as
  // "red,green,blue" numbers because the canvas needs that form to add see-through-ness.
  var STAGE_HEX = ["#f2a950", "#b39bff", "#5fe0c0", "#ff8fa3"];
  var STAGE_RGB = ["242,169,80", "179,155,255", "95,224,192", "255,143,163"];
  var rgb = STAGE_RGB[0]; // colour of the stage showing right now
  // The colour actually on screen, as three numbers [red, green, blue]. It creeps
  // toward the current stage's colour a little every frame, which is what makes
  // the whole page fade from one stage colour to the next.
  var accentNow = [242, 169, 80];
  var lastFade = 0; // clock time (in milliseconds) of the previous fade step
  var sparks = [];        // short-lived dots that trail behind the mouse

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
      // Letters close to the mouse light up in the stage colour and get a thread to the pointer
      var dx = p.x + p.ox - mouse.x, dy = py - mouse.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < 190) {
        var near = 1 - d / 190;
        ctx.strokeStyle = "rgba(" + rgb + "," + near * .5 + ")";
        ctx.beginPath(); ctx.moveTo(mouse.x, mouse.y); ctx.lineTo(p.x + p.ox + p.s * .25, py - p.s * .3); ctx.stroke();
        ctx.fillStyle = "rgba(" + rgb + "," + Math.min(1, p.a + near * .8) + ")";
      }
      ctx.fillText(p.g, p.x + p.ox, py);
    }
    for (var k = 0; k < sparks.length; k++) { // the mouse trail
      var s = sparks[k];
      ctx.fillStyle = "rgba(" + rgb + "," + s.life * .9 + ")";
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * s.life, 0, 6.283); ctx.fill(); // 6.283 = a full circle
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
    // Sparks drift, slow down and fade; filter() keeps only the ones still alive
    for (var k = 0; k < sparks.length; k++) {
      var s = sparks[k];
      s.x += s.vx; s.y += s.vy; s.vy += .03; s.vx *= .97; s.life -= .022;
    }
    sparks = sparks.filter(function (s) { return s.life > 0; });
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
      root.style.setProperty("--px", heroShift.x); // the background scene slides using these
      root.style.setProperty("--py", heroShift.y);
      if (!calm && sparks.length < 140) { // drop two sparks where the mouse is (capped so it stays smooth)
        for (var n = 0; n < 2; n++) sparks.push({ x: e.clientX, y: e.clientY, vx: (Math.random() - .5) * 2.4, vy: (Math.random() - .5) * 2.4, r: 1.5 + Math.random() * 3, life: 1 });
      }
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
      // Magnetic buttons: a button leans a little toward the pointer while it is hovered
      document.querySelectorAll(".btn").forEach(function (btn) {
        btn.addEventListener("mousemove", function (e) {
          var r = btn.getBoundingClientRect();
          btn.style.transform = "translate(" + (e.clientX - r.left - r.width / 2) * .25 + "px," + (e.clientY - r.top - r.height / 2) * .35 + "px) scale(1.05)";
        });
        btn.addEventListener("mouseleave", function () { btn.style.transform = ""; });
      });
    }
  }

  // ---------- 4. Scroll story ----------
  var story = document.getElementById("story");
  var stageBtns = document.querySelectorAll(".stages button");
  var copies = document.querySelectorAll(".copy");
  var scenes = document.querySelectorAll(".scene");
  var bar = document.getElementById("progress-bar");
  var bgScenes = document.querySelectorAll(".bg-scene"); // the four big background drawings
  var ghosts = document.querySelectorAll(".ghost");      // the giant outlined stage names
  var appWindow = document.querySelector(".window");
  var currentStage = -1;
  var lastScroll = 0, speed = 0; // how fast the page is being scrolled, smoothed

  // Highlights stage n (0 to 3) in the list, text and pretend window, and switches
  // the page colour and background scene to that stage's
  function showStage(n) {
    if (n === currentStage) return;
    currentStage = n;
    for (var i = 0; i < 4; i++) {
      var on = i === n;
      stageBtns[i].classList.toggle("on", on);
      stageBtns[i].setAttribute("aria-current", on ? "step" : "false");
      copies[i].classList.toggle("on", on);
      scenes[i].classList.toggle("on", on);
      bgScenes[i].classList.toggle("on", on);
      ghosts[i].classList.toggle("on", on);
    }
    rgb = STAGE_RGB[n];
    // Calm mode has no animation loop to do the fade, so switch colour at once.
    if (calm) root.style.setProperty("--accent", STAGE_HEX[n]);
  }

  // Moves the on-screen colour one small step toward the current stage's colour.
  // Called once per frame; hands nothing back. We do the fade here rather than
  // with a CSS transition because the browser kept starting that fade late.
  function fadeAccent() {
    var target = rgb.split(","); // "242,169,80" -> ["242","169","80"]
    var moved = false;
    // Work out how much time passed since the last step, so the fade takes about
    // the same time (roughly a second) on a fast screen and on a slow one.
    var now = performance.now();
    var share = 1 - Math.exp(-(now - lastFade) / 250); // share of the remaining distance to cover this step
    lastFade = now;
    for (var i = 0; i < 3; i++) {
      var gap = target[i] - accentNow[i];
      if (Math.abs(gap) < .5) { accentNow[i] = +target[i]; continue; } // close enough: land exactly (+ turns text into a number)
      accentNow[i] += gap * share; // covers part of what is left each time, so it eases out
      moved = true;
    }
    // Only touch the page when the colour really changed, to save work.
    if (moved) root.style.setProperty("--accent", "rgb(" + Math.round(accentNow[0]) + "," + Math.round(accentNow[1]) + "," + Math.round(accentNow[2]) + ")");
  }

  // Tells the CSS whether the story is on screen (scenes go full strength there)
  // and how far along the current stage we are (slides the giant word).
  function storyExtras(p) {
    var r = story.getBoundingClientRect();
    root.classList.toggle("in-story", r.top < window.innerHeight * .6 && r.bottom > window.innerHeight * .4);
    root.style.setProperty("--slide", (p * 4) % 1);
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
    storyExtras(p);
    if (!calm) {
      fadeAccent();
      step(); draw();
      // speed follows how many pixels were scrolled since the last frame, eased so it is not jumpy
      speed += ((scrollY - lastScroll) - speed) * .15; lastScroll = scrollY;
      var lean = Math.max(-7, Math.min(7, speed * .12)); // degrees, never more than 7 either way
      for (var i = 0; i < lines.length; i++) { // hero words slide with scroll and mouse, and lean when you scroll fast
        var depth = parseFloat(lines[i].getAttribute("data-depth"));
        lines[i].style.transform = "translate(" + heroShift.x * depth * -260 + "px," + (scrollY * depth * -1.6 + heroShift.y * depth * -120) + "px) skewY(" + lean * depth * 6 + "deg)";
      }
      // the pretend app window turns to face the mouse
      if (!lightMode) appWindow.style.transform = "perspective(900px) rotateY(" + heroShift.x * 14 + "deg) rotateX(" + heroShift.y * -10 + "deg)";
    } else { draw(); }
    requestAnimationFrame(frame);
  }
  window.addEventListener("resize", resize);
  resize();
  if (calm) {
    // In calm mode redraw only when scrolling, not 60 times a second
    window.addEventListener("scroll", function () { scrollY = window.pageYOffset; showStage(Math.min(3, Math.floor(storyProgress() * 4))); bar.style.transform = "scaleX(" + storyProgress() + ")"; storyExtras(storyProgress()); draw(); }, { passive: true });
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
