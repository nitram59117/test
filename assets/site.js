/* Slalom — comportements communs */
(function () {
  'use strict';

  var douce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finPointeur = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- 1. apparition au défilement ---------- */
  function reveler() {
    var cibles = document.querySelectorAll('[data-reveal]');
    if (!cibles.length) return;
    if (douce || !('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(cibles, function (n) { n.classList.add('vu'); });
      return;
    }
    var obs = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('vu'); obs.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    Array.prototype.forEach.call(cibles, function (n) { obs.observe(n); });
    // filet de sécurité : rien ne doit rester invisible si l'observateur ne se déclenche pas
    setTimeout(function () {
      Array.prototype.forEach.call(cibles, function (n) { n.classList.add('vu'); });
    }, 2600);
  }

  /* ---------- 2. inclinaison 3D des cartes ---------- */
  function inclinaison() {
    if (douce || !finPointeur) return;
    var cartes = document.querySelectorAll('.card-vis, .planche, .next-grid a');
    Array.prototype.forEach.call(cartes, function (c) {
      var att = null;
      c.addEventListener('mousemove', function (e) {
        if (att) return;
        att = requestAnimationFrame(function () {
          att = null;
          var r = c.getBoundingClientRect();
          var x = (e.clientX - r.left) / r.width - 0.5;
          var y = (e.clientY - r.top) / r.height - 0.5;
          c.style.transform = 'perspective(900px) rotateY(' + (x * 9).toFixed(2) +
                              'deg) rotateX(' + (-y * 9).toFixed(2) + 'deg) translateY(-6px)';
        });
      });
      c.addEventListener('mouseleave', function () { c.style.transform = ''; });
    });
  }

  /* ---------- 3. profondeur au défilement ---------- */
  function profondeur() {
    if (douce) return;
    var couches = document.querySelectorAll('[data-profondeur]');
    if (!couches.length) return;
    var att = false;
    function placer() {
      att = false;
      var y = window.pageYOffset;
      Array.prototype.forEach.call(couches, function (n) {
        var k = parseFloat(n.getAttribute('data-profondeur')) || 0.18;
        n.style.transform = 'translate3d(0,' + (y * k).toFixed(1) + 'px,0)';
      });
    }
    window.addEventListener('scroll', function () {
      if (!att) { att = true; requestAnimationFrame(placer); }
    }, { passive: true });
    placer();
  }

  /* ---------- 4. compte à rebours ---------- */
  var SOIREES = [
    { d: '2026-09-24T23:59', n: "Jeudi Free — La Boum 80'" },
    { d: '2026-09-25T23:59', n: "Slalom XXL — Popof" },
    { d: '2026-09-26T23:59', n: "Gang Gang — Baddies Edition" },
    { d: '2026-10-02T23:59', n: "Kiss My Erasmus — Italian Night" },
    { d: '2026-10-03T23:59', n: "JetLag — Reggaeton y Perreo" },
    { d: '2026-10-08T23:59', n: "La Studenti" },
    { d: '2026-10-10T23:59', n: "Trendy invite Phaphane" },
    { d: '2026-10-17T23:59', n: "La Bug de l'an 2000 — Vol. 15" },
    { d: '2026-11-21T23:59', n: "Arch Club" }
  ];
  function rebours() {
    var b = document.getElementById('rebours');
    if (!b) return;
    var nom = b.querySelector('[data-nom]'), temps = b.querySelector('[data-temps]');
    function tic() {
      var now = Date.now(), p = null;
      for (var i = 0; i < SOIREES.length; i++) {
        var t = new Date(SOIREES[i].d).getTime();
        if (t > now) { p = { t: t, n: SOIREES[i].n }; break; }
      }
      // aucune date à venir : on n'affiche rien plutôt qu'une information fausse
      if (!p) { b.hidden = true; return; }
      b.hidden = false;
      var s = Math.floor((p.t - now) / 1000);
      var j = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
      nom.textContent = p.n;
      temps.textContent = (j > 0 ? j + ' j ' : '') + h + ' h ' + (j > 0 ? '' : m + ' min');
    }
    tic();
    setInterval(tic, 30000);
  }


  /* ---------- 5. menu mobile ---------- */
  function menuMobile() {
    var b = document.getElementById('burger'), m = document.getElementById('menu');
    if (!b || !m) return;

    function ouvrir(v) {
      m.hidden = !v;
      b.setAttribute('aria-expanded', String(v));
      b.setAttribute('aria-label', v ? 'Fermer le menu' : 'Ouvrir le menu');
      document.body.classList.toggle('menu-ouvert', v);
    }
    b.addEventListener('click', function () {
      ouvrir(b.getAttribute('aria-expanded') !== 'true');
    });
    // un lien cliqué referme le panneau
    Array.prototype.forEach.call(m.querySelectorAll('a'), function (a) {
      a.addEventListener('click', function () { ouvrir(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !m.hidden) { ouvrir(false); b.focus(); }
    });
    // passage en grand écran : on referme pour ne pas bloquer le défilement
    window.addEventListener('resize', function () {
      if (window.innerWidth > 960 && !m.hidden) ouvrir(false);
    });
  }

  function demarrer() { reveler(); inclinaison(); profondeur(); rebours(); menuMobile(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
