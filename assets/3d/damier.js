/* Slalom — le damier du fond devient une surface de cases en relief :
   elles se soulèvent en vague autour de la souris, du doigt, et au défilement.
   Au repos, le rendu est identique au damier CSS qu'il remplace. */
import * as T from './three.js';

const COTE = 56;          // côté d'une case, en px (motif CSS : 112 px pour deux cases)
const EP = 10;            // épaisseur d'une case
const NB_ONDES = 10;

export function demarrerDamier() {
  const racine = document.documentElement;
  const toile = document.createElement('canvas');
  toile.className = 'damier-3d';
  toile.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(toile, document.body.firstChild);

  let rendu;
  try {
    rendu = new T.WebGLRenderer({ canvas: toile, antialias: true, alpha: false, powerPreference: 'low-power', stencil: false });
  } catch (e) { toile.remove(); return null; }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  rendu.setPixelRatio(dpr);
  rendu.setClearColor(0xffffff, 1);

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(30, 1, 10, 20000);
  let W = 1, H = 1;

  const ondes = [];
  for (let i = 0; i < NB_ONDES; i++) ondes.push(new T.Vector4(0, 0, -99, 0));
  const communs = {
    uOndes: { value: ondes }, uNow: { value: 0 },
    uSouris: { value: new T.Vector3(0, 0, 0) },
    uDefil: { value: new T.Vector2(0, 0) }
  };

  const HAUTEUR = /* glsl */`
    uniform vec4 uOndes[${NB_ONDES}];
    uniform float uNow;
    uniform vec3 uSouris;
    uniform vec2 uDefil;
    float hauteur(vec2 p){
      vec2 d = p - uSouris.xy;
      float h = uSouris.z * exp(-dot(d, d) / 17000.);
      for (int i = 0; i < ${NB_ONDES}; i++){
        vec4 o = uOndes[i];
        float age = uNow - o.z;
        if (o.w <= 0. || age < 0. || age > 2.6) continue;
        float dd = length(p - o.xy) - age * 640.;
        h += o.w * exp(-age * 1.7) * exp(-dd * dd / 5200.);
      }
      h += uDefil.x * (.5 + .5 * sin(p.y * .011 + p.x * .0045 - uDefil.y));
      return h;
    }
    mat3 rotAxe(vec3 a, float t){
      float c = cos(t), s = sin(t), k = 1. - c;
      return mat3(c + a.x * a.x * k,       a.y * a.x * k + a.z * s, a.z * a.x * k - a.y * s,
                  a.x * a.y * k - a.z * s, c + a.y * a.y * k,       a.z * a.y * k + a.x * s,
                  a.x * a.z * k + a.y * s, a.y * a.z * k - a.x * s, c + a.z * a.z * k);
    }
    void pente(vec2 c, out float h, out mat3 R){
      h = hauteur(c);
      const float e = 18.;
      vec2 g = vec2(hauteur(c + vec2(e, 0.)) - hauteur(c - vec2(e, 0.)),
                    hauteur(c + vec2(0., e)) - hauteur(c - vec2(0., e))) / (2. * e);
      float l = length(g);
      R = mat3(1.);
      if (l > 1e-5) R = rotAxe(normalize(vec3(g.y, -g.x, 0.)), atan(l * 1.35));
    }
  `;

  /* ---------- les cases ---------- */
  const gCase = new T.BoxGeometry(COTE, COTE, EP);
  gCase.translate(0, 0, -EP / 2);
  gCase.rotateZ(Math.PI / 4);
  const matCase = new T.ShaderMaterial({
    uniforms: { ...communs },
    vertexShader: /* glsl */`
      ${HAUTEUR}
      attribute vec2 aCentre;
      attribute float aTeinte;
      varying vec3 vN; varying float vTeinte; varying float vDessus; varying float vH;
      void main(){
        float h; mat3 R;
        pente(aCentre, h, R);
        vec3 p = R * position;
        vN = R * normal;
        vDessus = step(.5, normal.z);
        vTeinte = aTeinte;
        vH = h;
        gl_Position = projectionMatrix * viewMatrix * vec4(aCentre + p.xy, p.z + h, 1.);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vN; varying float vTeinte; varying float vDessus; varying float vH;
      void main(){
        vec3 L = normalize(vec3(-.42, .5, .76));
        vec3 n = normalize(vN);
        float base = mix(230. / 255., 1., vTeinte);
        float s = vDessus > .5 ? 1. + (dot(n, L) - L.z) * 1.05 : mix(1., .72 + .2 * max(dot(n, L), 0.), clamp(vH / 3., 0., 1.));
        gl_FragColor = vec4(vec3(min(base * s, 1.)), 1.);
      }`
  });

  /* ---------- ombres portées (une tache douce par case soulevée) ---------- */
  const gOmbre = new T.PlaneGeometry(COTE, COTE);
  gOmbre.rotateZ(Math.PI / 4);
  const matOmbre = new T.ShaderMaterial({
    uniforms: { ...communs },
    vertexShader: /* glsl */`
      ${HAUTEUR}
      attribute vec2 aCentre;
      varying vec2 vUv; varying float vA;
      void main(){
        float h = hauteur(aCentre);
        vUv = uv;
        vA = clamp(h / 30., 0., 1.) * .4;
        vec3 p = position * (1. + h / 220.);
        vec2 dec = vec2(.42, -.5) * h * .95;
        gl_Position = projectionMatrix * viewMatrix * vec4(aCentre + p.xy + dec, .35, 1.);
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying float vA;
      void main(){
        vec2 q = abs(vUv - .5) * 2.;
        float a = (1. - smoothstep(.55, 1., max(q.x, q.y))) * vA;
        if (a < .004) discard;
        gl_FragColor = vec4(0., 0., 0., a);
      }`,
    transparent: true, depthWrite: false, depthTest: true
  });

  let cases = null, ombres = null;

  function construire() {
    W = Math.max(1, toile.clientWidth); H = Math.max(1, toile.clientHeight);
    rendu.setSize(W, H, false);
    camera.aspect = W / H;
    const dist = (H / 2) / Math.tan(T.MathUtils.degToRad(15));
    camera.position.set(0, 0, dist);
    camera.near = dist / 10; camera.far = dist * 3;
    camera.updateProjectionMatrix();

    // on reprend exactement la géométrie du damier CSS (body::before : carré de 220vmax tourné de 45°)
    let S = 0;
    try { S = parseFloat(getComputedStyle(document.body, '::before').width) || 0; } catch (e) {}
    if (!S) S = 2.2 * Math.max(window.innerWidth, window.innerHeight);
    const cx = document.documentElement.clientWidth / 2, cy = document.documentElement.clientHeight / 2;
    const c45 = Math.SQRT1_2;
    const n = Math.ceil(S / COTE);
    const centres = [], teintes = [];
    const marge = COTE * 1.2;
    // domaine utile : seules les cases proches de l'écran
    const R = Math.hypot(W, H) / 2 + marge;
    const i0 = Math.max(0, Math.floor((S / 2 - R - Math.hypot(cx - W / 2, cy - H / 2)) / COTE));
    const i1 = Math.min(n, Math.ceil((S / 2 + R + Math.hypot(cx - W / 2, cy - H / 2)) / COTE));
    for (let i = i0; i < i1; i++) {
      for (let j = i0; j < i1; j++) {
        const lx = (i + .5) * COTE - S / 2, ly = (j + .5) * COTE - S / 2;
        const px = cx + (lx - ly) * c45, py = cy + (lx + ly) * c45;
        if (px < -marge || px > W + marge || py < -marge || py > H + marge) continue;
        centres.push(px - W / 2, H / 2 - py);
        teintes.push((i + j) % 2 === 1 ? 0 : 1);
      }
    }
    const N = teintes.length;
    if (cases) { scene.remove(cases, ombres); cases.geometry.dispose(); ombres.geometry.dispose(); }
    const gc = gCase.clone(), go = gOmbre.clone();
    gc.setAttribute('aCentre', new T.InstancedBufferAttribute(new Float32Array(centres), 2));
    gc.setAttribute('aTeinte', new T.InstancedBufferAttribute(new Float32Array(teintes), 1));
    go.setAttribute('aCentre', new T.InstancedBufferAttribute(new Float32Array(centres), 2));
    cases = new T.InstancedMesh(gc, matCase, N);
    ombres = new T.InstancedMesh(go, matOmbre, N);
    cases.frustumCulled = ombres.frustumCulled = false;
    ombres.renderOrder = 2;
    scene.add(cases, ombres);
    dessiner();
  }

  /* ---------- interaction ---------- */
  const souris = { x: 0, y: 0, tx: 0, ty: 0, amp: 0, cible: 0, dernier: 0, px: null, py: null, parcours: 0 };
  let io = 0, t0 = performance.now(), anime = false, maintenant = 0;
  const defil = { amp: 0, phase: 0, y: window.pageYOffset, t: performance.now() };

  function versMonde(cx, cy) { return [cx - W / 2, H / 2 - cy]; }
  function onde(x, y, force) {
    const o = ondes[io];
    o.set(x, y, maintenant, force);
    io = (io + 1) % NB_ONDES;
    relancer();
  }

  const finPointeur = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const opaque = el => !!(el && el.closest && el.closest('.hero, .sombre, footer, .menu, .loader, .wipe'));
  window.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    if (opaque(e.target)) { if (souris.cible) { souris.cible = 0; relancer(); } souris.px = null; return; }
    const [x, y] = versMonde(e.clientX, e.clientY);
    souris.tx = x; souris.ty = y;
    if (souris.px === null) { souris.x = x; souris.y = y; }
    else souris.parcours += Math.hypot(x - souris.px, y - souris.py);
    souris.px = x; souris.py = y;
    souris.cible = 22; souris.dernier = performance.now();
    if (souris.parcours > 190) { souris.parcours = 0; onde(x, y, 12); }
    relancer();
  }, { passive: true });
  document.addEventListener('mouseleave', () => { souris.cible = 0; relancer(); });
  window.addEventListener('pointerdown', e => {
    if (opaque(e.target)) return;
    const [x, y] = versMonde(e.clientX, e.clientY);
    onde(x, y, e.pointerType === 'mouse' ? 38 : 30);
  }, { passive: true });
  let dernierToucher = null;
  window.addEventListener('touchmove', e => {
    const t = e.touches[0];
    if (!t) return;
    const [x, y] = versMonde(t.clientX, t.clientY);
    if (!dernierToucher || Math.hypot(x - dernierToucher[0], y - dernierToucher[1]) > 150) {
      dernierToucher = [x, y];
      onde(x, y, 16);
    }
  }, { passive: true });
  window.addEventListener('touchend', () => { dernierToucher = null; }, { passive: true });
  window.addEventListener('scroll', () => {
    const y = window.pageYOffset, t = performance.now();
    const dy = y - defil.y, dt = Math.max(8, t - defil.t);
    defil.y = y; defil.t = t;
    defil.phase += dy * .012;
    defil.cible = Math.min(11, Math.abs(dy / dt) * 4.5);
    relancer();
  }, { passive: true });

  /* ---------- rendu à la demande ---------- */
  function dessiner() {
    communs.uNow.value = maintenant;
    communs.uSouris.value.set(souris.x, souris.y, souris.amp);
    communs.uDefil.value.set(defil.amp, defil.phase);
    rendu.render(scene, camera);
  }
  function relancer() { if (!anime && !document.hidden) { anime = true; requestAnimationFrame(boucle); } }
  let tPrec = performance.now();
  function boucle(t) {
    const dt = Math.min(.05, (t - tPrec) / 1000);
    tPrec = t;
    maintenant = (t - t0) / 1000;
    if (finPointeur && t - souris.dernier > 1400) souris.cible = 0;
    souris.x += (souris.tx - souris.x) * Math.min(1, dt * 9);
    souris.y += (souris.ty - souris.y) * Math.min(1, dt * 9);
    souris.amp += (souris.cible - souris.amp) * Math.min(1, dt * (souris.cible > souris.amp ? 5 : 2.2));
    defil.amp += ((defil.cible || 0) - defil.amp) * Math.min(1, dt * 6);
    defil.cible = (defil.cible || 0) * Math.pow(.02, dt);
    dessiner();
    let vivantes = false;
    for (const o of ondes) if (o.w > 0 && maintenant - o.z < 2.6) { vivantes = true; break; }
    const encore = vivantes || souris.amp > .05 || souris.cible > 0 || defil.amp > .05;
    if (encore) requestAnimationFrame(boucle);
    else {
      anime = false;
      souris.amp = 0; defil.amp = 0;
      dessiner();   // dernière image : parfaitement à plat
    }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) relancer(); });

  let redim = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(redim); redim = requestAnimationFrame(construire); }, { passive: true });

  toile.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    racine.classList.remove('damier3d-actif');
    toile.remove();
  }, false);

  construire();
  racine.classList.add('damier3d-actif');
  return { onde };
}
