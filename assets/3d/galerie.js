/* Slalom — galerie : les photos deviennent liquides.
   Elles ondulent sous la souris (ou le doigt), se courbent quand on fait défiler
   la page et apparaissent en montant comme une vague. */
import * as T from './three.js';

export function demarrerGalerie() {
  const racine = document.documentElement;
  const cartes = Array.prototype.slice.call(document.querySelectorAll('#galerie .card'));
  if (!cartes.length) return null;

  const toile = document.createElement('canvas');
  toile.className = 'galerie-3d';
  toile.setAttribute('aria-hidden', 'true');
  document.body.appendChild(toile);

  let rendu;
  try {
    rendu = new T.WebGLRenderer({ canvas: toile, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance', stencil: false });
  } catch (e) { toile.remove(); return null; }
  rendu.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  rendu.setClearColor(0x000000, 0);

  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, -100, 100);
  let W = 1, H = 1;
  function dimensionner() {
    W = Math.max(1, toile.clientWidth); H = Math.max(1, toile.clientHeight);
    rendu.setSize(W, H, false);
    camera.left = -W / 2; camera.right = W / 2; camera.top = H / 2; camera.bottom = -H / 2;
    camera.updateProjectionMatrix();
  }
  dimensionner();

  const temps = { value: 0 }, vitesse = { value: 0 };
  const geo = new T.PlaneGeometry(1, 1, 28, 28);
  const rayon = parseFloat(getComputedStyle(cartes[0].querySelector('.card-vis')).borderTopLeftRadius) || 0;

  const plans = cartes.map(carte => {
    const vis = carte.querySelector('.card-vis');
    const img = carte.querySelector('img');
    const mat = new T.ShaderMaterial({
      uniforms: {
        uTex: { value: null }, uTaille: { value: new T.Vector2(1, 1) }, uImg: { value: new T.Vector2(1, 1) },
        uSouris: { value: new T.Vector2(.5, .5) }, uSurvol: { value: 0 }, uTemps: temps, uVitesse: vitesse,
        uRayon: { value: rayon }, uApparition: { value: 0 }, uImpulsion: { value: 0 }
      },
      vertexShader: /* glsl */`
        uniform vec2 uTaille; uniform float uVitesse, uApparition;
        varying vec2 vUv;
        void main(){
          vUv = uv;
          vec3 p = position;
          // la photo se courbe comme une feuille quand la page défile
          p.y += sin(uv.x * 3.14159) * uVitesse * .9 / uTaille.y;
          // et monte en se dépliant à son apparition
          float a = 1. - uApparition;
          p.y -= a * a * .18;
          p.x *= 1. - a * .06;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uTex; uniform vec2 uTaille, uImg, uSouris;
        uniform float uSurvol, uTemps, uVitesse, uRayon, uApparition, uImpulsion;
        varying vec2 vUv;
        float h12(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vb(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
          return mix(mix(h12(i), h12(i + vec2(1., 0.)), u.x), mix(h12(i + vec2(0., 1.)), h12(i + vec2(1., 1.)), u.x), u.y); }
        vec2 couvrir(vec2 uv){
          float ra = uTaille.x / uTaille.y, ri = uImg.x / uImg.y;
          vec2 s = ra > ri ? vec2(1., ri / ra) : vec2(ra / ri, 1.);
          return (uv - .5) * s + .5;
        }
        void main(){
          vec2 uv = vUv;
          // coins arrondis, comme les cartes
          vec2 q = abs(uv - .5) * uTaille - (uTaille * .5 - uRayon);
          float coin = length(max(q, 0.)) - uRayon;
          float masque = 1. - smoothstep(-1., .6, coin);
          // apparition : une vague monte depuis le bas
          float bordV = uApparition * 1.35 - .15 + (vb(vec2(uv.x * 5., uTemps * .6)) - .5) * .14;
          masque *= smoothstep(0., .04, bordV - (1. - uv.y));
          if (masque < .002) discard;
          // ondes liquides autour du pointeur
          vec2 d = (uv - uSouris) * vec2(uTaille.x / uTaille.y, 1.);
          float r = length(d);
          vec2 dir = r > 1e-4 ? d / r : vec2(0.);
          float amp = uSurvol * .75 + uImpulsion;
          float onde = sin(r * 34. - uTemps * 5.5) * exp(-r * 4.2) * amp;
          vec2 dec = dir * onde * .016;
          dec += (vec2(vb(uv * 3. + uTemps * .35), vb(uv * 3. - uTemps * .3)) - .5) * .012 * amp;
          dec.y += sin(uv.x * 3.14159) * uVitesse * .00045;
          vec2 uvz = (uv - .5) * (1. - .07 * uSurvol) + .5;
          vec2 uvc = couvrir(uvz + dec);
          float ca = abs(onde) * .007 + min(abs(uVitesse) * .00009, .012);
          vec2 cd = dir * ca + vec2(0., ca * sign(uVitesse)) * .6;
          vec3 c = vec3(texture2D(uTex, uvc + cd).r, texture2D(uTex, uvc).g, texture2D(uTex, uvc - cd).b);
          // reflet qui suit la souris
          c += smoothstep(.45, 0., r) * .07 * uSurvol;
          gl_FragColor = vec4(c * masque, masque);
        }`,
      transparent: true, depthTest: false, depthWrite: false, premultipliedAlpha: true
    });
    const m = new T.Mesh(geo, mat);
    m.visible = false;
    scene.add(m);
    const p = { carte, vis, img, mat, m, pret: false, survol: 0, cible: 0, vu: false, app: 0, imp: 0, sx: .5, sy: .5 };
    const src = img.currentSrc || img.src;
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => {
      const tex = new T.Texture(im);
      tex.colorSpace = T.NoColorSpace;
      tex.minFilter = T.LinearFilter; tex.generateMipmaps = false;
      tex.needsUpdate = true;
      mat.uniforms.uTex.value = tex;
      mat.uniforms.uImg.value.set(im.naturalWidth, im.naturalHeight);
      p.pret = true;
      carte.classList.add('liquide');
      relancer();
    };
    im.src = src;
    return p;
  });
  racine.classList.add('galerie3d-actif');
  toile.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    cartes.forEach(c => c.classList.remove('liquide'));
    racine.classList.remove('galerie3d-actif');
    toile.remove();
  }, false);

  /* ---------- pointeur ---------- */
  let mx = -1, my = -1;
  window.addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; relancer(); }, { passive: true });
  document.addEventListener('mouseleave', () => { mx = my = -1; relancer(); });
  window.addEventListener('pointerdown', e => {
    for (const p of plans) {
      const r = p.vis.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        p.sx = (e.clientX - r.left) / r.width; p.sy = 1 - (e.clientY - r.top) / r.height;
        p.imp = 1.1;
      }
    }
    relancer();
  }, { passive: true });

  /* ---------- défilement ---------- */
  let yPrec = window.pageYOffset, v = 0;
  window.addEventListener('scroll', relancer, { passive: true });
  window.addEventListener('resize', () => { dimensionner(); relancer(); }, { passive: true });

  /* ---------- boucle ---------- */
  let anime = false, tPrec = performance.now();
  function relancer() { if (!anime && !document.hidden) { anime = true; tPrec = performance.now(); requestAnimationFrame(boucle); } }
  function boucle(t) {
    const dt = Math.min(.05, (t - tPrec) / 1000);
    tPrec = t;
    temps.value += dt;
    const y = window.pageYOffset;
    const vi = (y - yPrec) / Math.max(dt, 1 / 120) / 60;   // px par image à 60 i/s
    yPrec = y;
    v += (Math.max(-60, Math.min(60, vi)) - v) * Math.min(1, dt * 10);
    vitesse.value = v;

    let actif = Math.abs(v) > .05;
    for (const p of plans) {
      const r = p.vis.getBoundingClientRect();
      const dedans = r.bottom > -60 && r.top < H + 60 && r.width > 0;
      p.m.visible = p.pret && dedans;
      if (!p.pret || !dedans) continue;
      if (!p.vu && r.top < H * .92) p.vu = true;
      if (p.vu && p.app < 1) { p.app = Math.min(1, p.app + dt / 1.15); actif = true; }
      const sur = mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom;
      p.cible = sur ? 1 : 0;
      if (sur) { p.sx += ((mx - r.left) / r.width - p.sx) * Math.min(1, dt * 10); p.sy += ((1 - (my - r.top) / r.height) - p.sy) * Math.min(1, dt * 10); }
      p.survol += (p.cible - p.survol) * Math.min(1, dt * (p.cible ? 5 : 2.5));
      p.imp *= Math.pow(.2, dt);
      if (p.survol > .002 || p.cible || p.imp > .01) actif = true;
      const u = p.mat.uniforms;
      u.uTaille.value.set(r.width, r.height);
      u.uSouris.value.set(p.sx, p.sy);
      u.uSurvol.value = p.survol;
      u.uImpulsion.value = p.imp;
      const a = p.app;
      u.uApparition.value = 1 - Math.pow(1 - a, 3);
      p.m.scale.set(r.width, r.height, 1);
      p.m.position.set(r.left + r.width / 2 - W / 2, H / 2 - r.top - r.height / 2, 0);
    }
    rendu.render(scene, camera);
    // une image de plus pour suivre le défilement, puis on s'arrête si rien ne bouge
    if (actif || Math.abs(y - (boucle.yv || 0)) > .5) { boucle.yv = y; requestAnimationFrame(boucle); }
    else anime = false;
  }
  relancer();
  return { relancer };
}
