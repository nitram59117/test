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
    var gl = document.documentElement.classList.contains('gl3d');
    var cartes = Array.prototype.filter.call(document.querySelectorAll('.card-vis, .planche, .next-grid a'), function (c) {
      // les photos de la galerie sont animées en WebGL : pas d'inclinaison CSS en plus
      return !(gl && c.closest('#galerie'));
    });
    cartes.forEach(function (c) {
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


  /* ---------- 6. barre de progression de lecture ---------- */
  function progres() {
    var el = document.createElement('div');
    el.className = 'progres';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    var att = false;
    function maj() {
      att = false;
      var h = document.documentElement.scrollHeight - window.innerHeight;
      el.style.width = (h > 0 ? (window.pageYOffset / h) * 100 : 0) + '%';
    }
    window.addEventListener('scroll', function () {
      if (!att) { att = true; requestAnimationFrame(maj); }
    }, { passive: true });
    maj();
  }

  /* ---------- 7. transition : les cases du damier se retournent en 3D depuis le clic ---------- */
  function transitions() {
    if (douce) return;
    var N = 20;
    var w = document.createElement('div');
    w.className = 'wipe';
    w.setAttribute('aria-hidden', 'true');
    var g = document.createElement('div');
    g.className = 'wipe-grille';
    var cases = [];
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
        var i = document.createElement('i');
        if ((r + c) % 2 === 0) i.className = 'n';
        g.appendChild(i);
        cases.push({ el: i, r: r, c: c });
      }
    }
    w.appendChild(g);
    document.body.appendChild(w);

    function interne(a) {
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return false;
      var h = a.getAttribute('href') || '';
      if (!h || h.charAt(0) === '#' || h.indexOf('mailto:') === 0 || h.indexOf('tel:') === 0) return false;
      return a.host === location.host;
    }
    function lancer(href, ox, oy) {
      var W = window.innerWidth, H = window.innerHeight;
      var S = 1.7 * Math.max(W, H), s = S / N, k = Math.SQRT1_2, max = 0;
      cases.forEach(function (t) {
        var lx = (t.c + .5 - N / 2) * s, ly = (t.r + .5 - N / 2) * s;
        var x = W / 2 + (lx - ly) * k, y = H / 2 + (lx + ly) * k;
        var d = Math.sqrt((x - ox) * (x - ox) + (y - oy) * (y - oy)) / 3400;
        // les cases hors de l'écran n'attendent pas
        if (x < -s || x > W + s || y < -s || y > H + s) d = 0;
        if (d > max) max = d;
        t.el.style.setProperty('--d', d.toFixed(3) + 's');
      });
      try { sessionStorage.setItem('slalom-transition', JSON.stringify({ x: ox / W, y: oy / H })); } catch (err) {}
      w.classList.add('actif');
      setTimeout(function () { location.href = href; }, Math.min(1000, max * 1000 + 470));
    }
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      var a = e.target.closest && e.target.closest('a');
      if (!interne(a)) return;
      e.preventDefault();
      var ox = e.clientX, oy = e.clientY;
      // clic clavier : on part du centre du lien
      if (!ox && !oy) { var b = a.getBoundingClientRect(); ox = b.left + b.width / 2; oy = b.top + b.height / 2; }
      lancer(a.href, ox, oy);
    });
    // retour arrière : le navigateur peut restituer la page avec le voile en place
    window.addEventListener('pageshow', function () { w.classList.remove('actif'); });
  }

  /* ---------- 8. compteurs ---------- */
  function compteurs() {
    var cibles = document.querySelectorAll('[data-compte]');
    if (!cibles.length) return;
    if (douce || !('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(cibles, function (n) { n.textContent = n.getAttribute('data-compte'); });
      return;
    }
    var obs = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        obs.unobserve(e.target);
        var fin = parseInt(e.target.getAttribute('data-compte'), 10), t0 = null;
        function pas(t) {
          if (!t0) t0 = t;
          var p = Math.min((t - t0) / 1100, 1);
          e.target.textContent = Math.round(fin * (1 - Math.pow(1 - p, 3)));
          if (p < 1) requestAnimationFrame(pas);
        }
        requestAnimationFrame(pas);
      });
    }, { threshold: 0.5 });
    Array.prototype.forEach.call(cibles, function (n) { obs.observe(n); });
  }

  /* ---------- 9. manifeste : les mots s'allument un à un ---------- */
  function manifeste() {
    var p = document.querySelector('.manifeste-txt');
    if (!p) return;
    var mots = p.textContent.trim().split(/\s+/);
    p.textContent = '';
    mots.forEach(function (m, i) {
      var s = document.createElement('span');
      s.className = 'mot';
      s.textContent = m;
      s.style.transitionDelay = (i * 55) + 'ms';
      p.appendChild(s);
      p.appendChild(document.createTextNode(' '));
    });
    if (douce || !('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(p.children, function (s) { s.classList.add('vu'); });
      return;
    }
    var obs = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        obs.unobserve(e.target);
        Array.prototype.forEach.call(p.children, function (s) { s.classList.add('vu'); });
      });
    }, { threshold: 0.35 });
    obs.observe(p);
  }

  /* ---------- 10. projecteur sur le hero ---------- */
  function projecteur() {
    var h = document.querySelector('.hero');
    if (!h || douce || !finPointeur) return;
    var s = document.createElement('div');
    s.className = 'hero-spot';
    s.setAttribute('aria-hidden', 'true');
    h.insertBefore(s, h.firstChild.nextSibling);
    var att = null, x = 50, y = 45;
    h.addEventListener('mousemove', function (e) {
      var r = h.getBoundingClientRect();
      x = ((e.clientX - r.left) / r.width) * 100;
      y = ((e.clientY - r.top) / r.height) * 100;
      if (!att) att = requestAnimationFrame(function () {
        att = null;
        s.style.setProperty('--sx', x.toFixed(1) + '%');
        s.style.setProperty('--sy', y.toFixed(1) + '%');
      });
    }, { passive: true });
  }

  /* ---------- 11. boutons magnétiques ---------- */
  function magnetique() {
    if (douce || !finPointeur) return;
    Array.prototype.forEach.call(document.querySelectorAll('.btn, .pill'), function (b) {
      var att = null;
      b.addEventListener('mousemove', function (e) {
        if (att) return;
        att = requestAnimationFrame(function () {
          att = null;
          var r = b.getBoundingClientRect();
          var dx = (e.clientX - (r.left + r.width / 2)) * 0.22;
          var dy = (e.clientY - (r.top + r.height / 2)) * 0.3;
          b.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
        });
      });
      b.addEventListener('mouseleave', function () { b.style.transform = ''; });
    });
  }

  /* ---------- 12. bandeau cinétique : le défilement accélère la bande ---------- */
  function cinetique() {
    var piste = document.querySelector('.marquee-piste');
    if (!piste || douce) return;
    var dernier = window.pageYOffset, vitesse = 0;
    window.addEventListener('scroll', function () {
      var y = window.pageYOffset;
      vitesse = Math.min(Math.abs(y - dernier) / 9, 7);
      dernier = y;
    }, { passive: true });
    (function boucle() {
      piste.style.animationDuration = (34 / (1 + vitesse)).toFixed(2) + 's';
      vitesse *= 0.92;
      requestAnimationFrame(boucle);
    })();
  }

  /* ---------- arrivée après transition ---------- */
  try {
    if (sessionStorage.getItem('slalom-transition')) {
      document.documentElement.classList.add('vient-de-transition');
      sessionStorage.removeItem('slalom-transition');
    }
  } catch (e) {}
  if (document.documentElement.classList.contains('vient-de-transition')) {
    document.addEventListener('DOMContentLoaded', function () {
      document.body.classList.add('arrivee');
    });
    if (document.body) document.body.classList.add('arrivee');
  }


  /* ---------- 13. consentement avant chargement de la billetterie ---------- */
  var CLE = 'slalom-shotgun-ok';
  function billetterie() {
    var cadre = document.querySelector('.shotgun'), bloc = document.getElementById('consent');
    var iframe = cadre && cadre.querySelector('iframe[data-src]');
    var oui = document.getElementById('consent-oui');
    if (!cadre || !iframe || !bloc) return;

    function charger() {
      iframe.src = iframe.getAttribute('data-src');
      iframe.hidden = false;
      bloc.hidden = true;
    }
    iframe.hidden = true;

    var accepte = false;
    try { accepte = localStorage.getItem(CLE) === '1'; } catch (e) {}
    if (accepte) charger();

    if (oui) oui.addEventListener('click', function () {
      try { localStorage.setItem(CLE, '1'); } catch (e) {}
      charger();
    });
  }

  /* ---------- 14. révoquer le consentement depuis les mentions légales ---------- */
  function revoquer() {
    var b = document.getElementById('revoir-cookies');
    if (!b) return;
    function etat() {
      var ok = false;
      try { ok = localStorage.getItem(CLE) === '1'; } catch (e) {}
      b.textContent = ok ? 'Retirer mon accord pour la billetterie Shotgun'
                         : 'Aucun accord enregistré pour le moment';
      b.disabled = !ok;
      b.style.opacity = ok ? '' : '.5';
    }
    b.addEventListener('click', function () {
      try { localStorage.removeItem(CLE); } catch (e) {}
      etat();
      b.textContent = 'Accord retiré — la billetterie ne se chargera plus sans votre feu vert';
    });
    etat();
  }


  /* ---------- 15. mur d'affiches en perspective ---------- */
  function murPerspective() {
    var murs = Array.prototype.filter.call(document.querySelectorAll('.mur-3d'), function (m) {
      return !m.closest('.anneau-actif');
    });
    if (!murs.length || douce) return;
    var att = false;
    function placer() {
      att = false;
      var h = window.innerHeight;
      Array.prototype.forEach.call(murs, function (m) {
        var r = m.getBoundingClientRect();
        // -1 quand le mur arrive par le bas, 0 au centre, +1 quand il sort par le haut
        var p = ((r.top + r.height / 2) - h / 2) / h;
        p = Math.max(-1, Math.min(1, p));
        m.style.setProperty('--incl', (p * 9).toFixed(2) + 'deg');
      });
    }
    window.addEventListener('scroll', function () {
      if (!att) { att = true; requestAnimationFrame(placer); }
    }, { passive: true });
    window.addEventListener('resize', placer, { passive: true });
    placer();
  }

  /* ---------- 16. monogramme en volume ---------- */
  function monogramme() {
    var s = document.getElementById('s3d');
    if (!s || douce) return;

    var ry = -28, rx = 10, cible = { ry: -28, rx: 10 }, survol = false, visible = true;
    s.style.transition = 'none';

    if (finPointeur) {
      var sec = s.closest('section');
      sec.addEventListener('mousemove', function (e) {
        var r = sec.getBoundingClientRect();
        cible.ry = ((e.clientX - r.left) / r.width - 0.5) * 74;
        cible.rx = -((e.clientY - r.top) / r.height - 0.5) * 36;
        survol = true;
      });
      sec.addEventListener('mouseleave', function () { survol = false; });
    }

    /* on ne fait tourner le S que lorsqu'il est a l'ecran */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) { visible = e[0].isIntersecting; })
        .observe(s);
    }

    var t = 0;
    (function boucle() {
      requestAnimationFrame(boucle);
      if (!visible) return;
      t += 0.006;
      if (!survol) { cible.ry = Math.sin(t) * 26 - 8; cible.rx = Math.cos(t * 0.7) * 9; }
      ry += (cible.ry - ry) * 0.07;
      rx += (cible.rx - rx) * 0.07;
      s.style.setProperty('--ry', ry.toFixed(2) + 'deg');
      s.style.setProperty('--rx', rx.toFixed(2) + 'deg');
    })();
  }


  /* ---------- 17. anneau d'affiches : la roue tourne avec le défilement ---------- */
  function anneau() {
    var sec = document.getElementById('prochaines');
    if (!sec || douce || !document.body.classList.contains('accueil')) return;
    var scene = sec.querySelector('.anneau-scene'), bague = sec.querySelector('.affiches');
    var leg = sec.querySelector('.anneau-legende');
    if (!scene || !bague || !leg) return;
    var items = Array.prototype.slice.call(bague.querySelectorAll('.affiche'));
    var n = items.length;
    if (n < 4) return;
    var pas = 360 / n;
    var nav = document.querySelector('.nav');
    var lNom = leg.querySelector('[data-al-nom]'), lDate = leg.querySelector('[data-al-date]');
    var lLien = leg.querySelector('[data-al-lien]'), lN = leg.querySelector('[data-al-n]');
    var lTot = leg.querySelector('[data-al-total]');
    var infos = items.map(function (a) {
      var b = a.querySelector('.affiche-cap b'), d = a.querySelector('.affiche-cap span');
      return { nom: b ? b.textContent : '', date: d ? d.textContent : '', lien: a.href };
    });

    sec.classList.add('anneau-actif');
    leg.hidden = false;
    lTot.textContent = (n < 10 ? '0' : '') + n;
    bague.style.setProperty('--pas', pas + 'deg');
    items.forEach(function (a, i) { a.style.setProperty('--i', i); });
    var sol = document.createElement('div');
    sol.className = 'anneau-sol';
    sol.setAttribute('aria-hidden', 'true');
    bague.parentNode.appendChild(sol);

    var R = 0, rot = 0, cible = 0, incl = -22, inclCible = -22, actif = -1, att = false, anime = false;
    function mesurer() {
      var w = bague.offsetWidth;
      R = (w / 2) / Math.tan(Math.PI / n) * 1.035;
      bague.style.setProperty('--R', R.toFixed(1) + 'px');
      lire();
    }
    function course() { return Math.max(1, sec.offsetHeight - scene.offsetHeight); }
    function lire() {
      var r = sec.getBoundingClientRect(), hNav = nav ? nav.offsetHeight : 0;
      var p = Math.max(0, Math.min(1, (hNav - r.top) / course()));
      cible = -p * (360 - pas);
      // à l'approche, la roue se redresse ; une fois épinglée elle garde une légère plongée
      var e = Math.max(0, Math.min(1, 1 - (r.top - hNav) / window.innerHeight));
      inclCible = -24 + e * 16;
      if (!anime) { anime = true; requestAnimationFrame(boucle); }
    }
    function legende(i) {
      var f = infos[i];
      lNom.classList.add('change');
      setTimeout(function () {
        lNom.textContent = f.nom;
        lDate.textContent = f.date;
        lLien.href = f.lien;
        lLien.setAttribute('aria-label', 'Réserver — ' + f.nom);
        lN.textContent = (i + 1 < 10 ? '0' : '') + (i + 1);
        lNom.classList.remove('change');
      }, actif < 0 ? 0 : 160);
    }
    function boucle() {
      rot += (cible - rot) * 0.12;
      incl += (inclCible - incl) * 0.12;
      bague.style.transform = 'translateZ(' + (-R).toFixed(1) + 'px) rotateX(' + incl.toFixed(2) +
                              'deg) rotateY(' + rot.toFixed(2) + 'deg)';
      for (var i = 0; i < n; i++) {
        var a = (i * pas + rot) * Math.PI / 180;
        var c = Math.cos(a);
        items[i].style.setProperty('--ombre', ((1 - c) * 0.42).toFixed(3));
      }
      var k = ((Math.round(-rot / pas) % n) + n) % n;
      if (k !== actif) {
        if (actif >= 0) items[actif].classList.remove('face');
        items[k].classList.add('face');
        legende(k);
        actif = k;
      }
      if (Math.abs(cible - rot) > 0.02 || Math.abs(inclCible - incl) > 0.02) requestAnimationFrame(boucle);
      else anime = false;
    }
    // tabulation clavier : l'affiche qui reçoit le focus vient se placer de face
    items.forEach(function (a, i) {
      a.addEventListener('focus', function () {
        var r = sec.getBoundingClientRect(), hNav = nav ? nav.offsetHeight : 0;
        var y = window.pageYOffset + r.top - hNav + (i / (n - 1)) * course();
        window.scrollTo(0, y);
      });
    });
    window.addEventListener('scroll', function () {
      if (!att) { att = true; requestAnimationFrame(function () { att = false; lire(); }); }
    }, { passive: true });
    window.addEventListener('resize', mesurer, { passive: true });
    mesurer();
  }

  function demarrer() {
    reveler(); inclinaison(); profondeur(); rebours(); menuMobile();
    progres(); transitions(); compteurs(); manifeste(); projecteur(); magnetique(); cinetique();
    billetterie(); revoquer(); anneau(); murPerspective(); monogramme();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
