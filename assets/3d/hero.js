/* Slalom — accueil : le logo naît d'une nuée de particules puis devient du chrome
   qui reflète la vidéo du dancefloor. Sous la souris ou le doigt, le chrome se
   désagrège en particules qui s'écartent comme une foule, puis se reforme. */
import * as T from './three.js';

/* ---------------------------------------------------------------- GLSL communs */

const BRUIT = /* glsl */`
float h12(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vbruit(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(h12(i), h12(i + vec2(1., 0.)), u.x), mix(h12(i + vec2(0., 1.)), h12(i + vec2(1., 1.)), u.x), u.y);
}
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 3; i++){ s += a * vbruit(p); p *= 2.03; a *= .5; } return s / .875; }
`;

/* état de dissolution du chrome en un point : > 0 = désagrégé */
const CHAMP = /* glsl */`
uniform float uReveal, uFuite, uTemps;
uniform sampler2D uSillage;
float champ(vec2 lp, vec2 suv){
  float nf = fbm(lp * 1.55 + vec2(0., uTemps * .04));
  float rev = (1. - uReveal) * 1.3 - ((.5 - lp.x / 10.) * .8 + nf * .2);
  float tr = texture2D(uSillage, suv).b * 1.3 - (.26 + nf * .8);
  float fu = uFuite * 1.3 - (nf * .7 + (1. - (lp.y + 2.) / 4.) * .3);
  return max(rev, max(tr, fu));
}
`;

const PLEIN_ECRAN_VS = /* glsl */`void main(){ gl_Position = vec4(position.xy, 0., 1.); }`;

/* -------------------------------------------------------------- outils */

const lisse = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* contours aplatis nous-mêmes : points dédoublonnés, triangulation fiable */
function aplatir(cmds, pas) {
  const pts = [];
  let cx = 0, cy = 0;
  for (const c of cmds) {
    if (c[0] === 'M' || c[0] === 'L') { cx = c[1]; cy = c[2]; pts.push([cx, cy]); continue; }
    const x1 = c[1], y1 = c[2], x2 = c[3], y2 = c[4], x3 = c[5], y3 = c[6];
    const lg = Math.hypot(x1 - cx, y1 - cy) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
    const n = Math.max(1, Math.min(18, Math.ceil(lg / pas)));
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      pts.push([u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
                u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3]);
    }
    cx = x3; cy = y3;
  }
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4) out.push(p);
  }
  while (out.length > 3 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 1e-4) out.pop();
  return out.map(p => new T.Vector2(p[0], p[1]));
}
function formes(liste, pas) {
  return liste.map(f => {
    const s = new T.Shape(aplatir(f.o, pas));
    for (const h of f.h) s.holes.push(new T.Path(aplatir(h, pas)));
    return s;
  });
}

function chargerImage(src) {
  return new Promise((ok, ko) => {
    const i = new Image();
    i.decoding = 'async';
    i.onload = () => ok(i);
    i.onerror = ko;
    i.src = src;
  });
}

/* ================================================================ entrée */

export async function demarrerHero({ mode = 'intro', base = 'assets/3d/' } = {}) {
  const hero = document.querySelector('.hero');
  const boiteLogo = hero && hero.querySelector('h1 .logo-img');
  if (!hero || !boiteLogo) return null;
  const video = hero.querySelector('.hero-video');
  const racine = document.documentElement;
  const tactile = matchMedia('(hover: none), (pointer: coarse)').matches;
  const petit = Math.min(screen.width, screen.height) < 700 || tactile;

  const [donnees, imgSdf] = await Promise.all([
    fetch(base + 'logo-formes.json').then(r => r.json()),
    chargerImage(base + 'logo-relief.webp')
  ]);

  /* ---------- rendu ---------- */
  const toile = document.createElement('canvas');
  toile.className = 'hero-3d';
  toile.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(window.devicePixelRatio || 1, petit ? 1.75 : 2);
  const rendu = new T.WebGLRenderer({
    canvas: toile, alpha: true, antialias: dpr < 1.5, premultipliedAlpha: true,
    powerPreference: 'high-performance', stencil: false
  });
  rendu.setPixelRatio(dpr);
  rendu.setClearColor(0x000000, 0);
  rendu.autoClear = false;
  hero.appendChild(toile);

  const gl = rendu.getContext();
  const typeFlottant = rendu.extensions.has('EXT_color_buffer_float') ? T.FloatType
    : (rendu.extensions.has('EXT_color_buffer_half_float') ? T.HalfFloatType : null);

  const scene = new T.Scene();
  const FOV = 30;
  const camera = new T.PerspectiveCamera(FOV, 1, 10, 10000);
  let L = 1, H = 1, dist = 1;

  /* ---------- logo : géométrie extrudée ---------- */
  const LARG = donnees.largeur, HAUT = donnees.hauteur;
  const logo = new T.Group();
  scene.add(logo);

  const texSdf = new T.Texture(imgSdf);
  texSdf.colorSpace = T.NoColorSpace;
  texSdf.minFilter = T.LinearFilter; texSdf.magFilter = T.LinearFilter;
  texSdf.generateMipmaps = false;
  texSdf.needsUpdate = true;
  const S = donnees.sdf;

  /* reflet vidéo : une petite image du dancefloor rafraîchie en continu */
  const refl = document.createElement('canvas');
  const RW = 96, RH = 54;
  refl.width = RW; refl.height = RH;
  const rctx = refl.getContext('2d', { alpha: false });
  rctx.fillStyle = '#000'; rctx.fillRect(0, 0, RW, RH);
  const texEnv = new T.CanvasTexture(refl);
  texEnv.colorSpace = T.NoColorSpace;
  texEnv.minFilter = T.LinearFilter; texEnv.generateMipmaps = false;

  /* sillage de la souris : champ de vitesse + intensité, en espace écran */
  const sillW = 192;
  let sillH = 108;
  const optsRT = { type: typeFlottant ? T.HalfFloatType : T.UnsignedByteType, format: T.RGBAFormat, depthBuffer: false, stencilBuffer: false };
  let sillage = [
    new T.WebGLRenderTarget(sillW, sillH, { ...optsRT, minFilter: T.LinearFilter, magFilter: T.LinearFilter }),
    new T.WebGLRenderTarget(sillW, sillH, { ...optsRT, minFilter: T.LinearFilter, magFilter: T.LinearFilter })
  ];

  const communs = {
    uReveal: { value: 0 }, uFuite: { value: 0 }, uTemps: { value: 0 },
    uSillage: { value: sillage[0].texture }
  };

  const epSlalom = petit ? { pas: .062, bs: 2 } : { pas: .042, bs: 3 };
  const gSlalom = new T.ExtrudeGeometry(formes(donnees.slalom.formes, epSlalom.pas), {
    depth: .46, bevelEnabled: true, bevelThickness: .08, bevelSize: .035, bevelOffset: 0,
    bevelSegments: epSlalom.bs, curveSegments: 1
  });
  gSlalom.translate(0, 0, -.23);
  const gCulture = new T.ExtrudeGeometry(formes(donnees.culture.formes, epSlalom.pas * .8), {
    depth: .24, bevelEnabled: true, bevelThickness: .05, bevelSize: .025, bevelOffset: 0,
    bevelSegments: Math.max(2, epSlalom.bs - 1), curveSegments: 1
  });
  gCulture.translate(0, 0, -.12);
  gSlalom.deleteAttribute('uv'); gCulture.deleteAttribute('uv');
  const ZAV_SLALOM = .23 + .08, ZAV_CULTURE = .12 + .05;

  const matChrome = new T.ShaderMaterial({
    uniforms: {
      ...communs,
      uRelief: { value: texSdf }, uSdfBoite: { value: new T.Vector4(S.x0, S.x1, S.y0, S.y1) },
      uCoussin: { value: 1.25 },
      uEnv: { value: texEnv }, uEnvOk: { value: 0 },
      uCam: { value: new T.Vector3() }, uRot: { value: new T.Matrix3() },
      uRes: { value: new T.Vector2(1, 1) }
    },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vWP; varying vec2 vLP; varying float vAvant;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.);
        vWP = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vLP = position.xy;
        vAvant = normal.z;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      ${BRUIT}
      ${CHAMP}
      varying vec3 vN; varying vec3 vWP; varying vec2 vLP; varying float vAvant;
      uniform sampler2D uRelief, uEnv;
      uniform vec4 uSdfBoite; uniform vec2 uRes;
      uniform float uCoussin, uEnvOk;
      uniform vec3 uCam; uniform mat3 uRot;

      vec3 env(vec3 r){
        float y = r.y;
        vec3 ciel = mix(vec3(.8), vec3(1.1), smoothstep(.05, .75, y));
        vec3 sol = mix(vec3(0.), vec3(.12), smoothstep(-.95, -.12, y));
        vec3 g = mix(sol, ciel, smoothstep(-.07, .07, y));
        g += exp(-abs(y - .03) * 18.) * .3;
        vec2 uv = vec2(.5 + r.x * .62, .52 + r.y * .62);
        vec3 v = texture2D(uEnv, uv).rgb;
        float l = dot(v, vec3(.299, .587, .114));
        vec3 vid = mix(vec3(l), v, .16);
        vid = pow(smoothstep(vec3(.02), vec3(.6), vid), vec3(1.15)) * 1.25;
        float w = uEnvOk * smoothstep(.1, .85, r.z) * .42;
        return mix(g, vid + g * .3, w);
      }

      void main(){
        vec2 suv = gl_FragCoord.xy / uRes;
        float m = champ(vLP, suv);
        if (m > 0.) discard;
        vec3 N = normalize(vN);
        if (vAvant > .6){
          vec2 uv = vec2((vLP.x - uSdfBoite.x) / (uSdfBoite.y - uSdfBoite.x), (vLP.y - uSdfBoite.z) / (uSdfBoite.w - uSdfBoite.z));
          vec2 nxy = texture2D(uRelief, uv).rg * 2. - 1.;
          float nz = sqrt(max(0., 1. - dot(nxy, nxy)));
          N = normalize(uRot * normalize(vec3(nxy * uCoussin, nz)));
        }
        vec3 V = normalize(uCam - vWP);
        vec3 R = reflect(-V, N);
        vec3 c = env(R);
        float fr = pow(1. - max(dot(N, V), 0.), 4.);
        c *= .84 + .36 * fr;
        vec3 Lm = normalize(vec3(sin(uTemps * .43) * .9, .42 + .34 * cos(uTemps * .31), .78));
        c += pow(max(dot(R, Lm), 0.), 110.) * 1.5;
        vec3 Lb = normalize(vec3(-.6 + sin(uTemps * .21) * .3, -.2, .8));
        c += pow(max(dot(R, Lb), 0.), 40.) * .18;
        float bord = smoothstep(-.06, 0., m);
        c = mix(c, vec3(1.08), bord * .9);
        gl_FragColor = vec4(c, 1.);
      }`
  });

  const mSlalom = new T.Mesh(gSlalom, matChrome);
  const mCulture = new T.Mesh(gCulture, matChrome);
  logo.add(mSlalom, mCulture);

  /* ---------- particules (simulation GPU) ---------- */
  let particules = null;
  if (typeFlottant) particules = creerParticules();

  function creerParticules() {
    const TW = petit ? 128 : 256, TH = 128, N = TW * TH;

    // positions d'arrivée : tirées dans la surface du logo, d'après le champ de distance
    const c2 = document.createElement('canvas');
    c2.width = S.w; c2.height = S.h;
    const x2 = c2.getContext('2d', { willReadFrequently: true });
    x2.drawImage(imgSdf, 0, 0);
    const px = x2.getImageData(0, 0, S.w, S.h).data;
    const dedans = [];
    for (let i = 0, n = S.w * S.h; i < n; i++) if (px[i * 4 + 2] > 131) dedans.push(i);

    const cible = new Float32Array(N * 4), depart = new Float32Array(N * 4);
    const yCoupure = (donnees.slalom.y0 + donnees.culture.y1) / 2;
    for (let i = 0; i < N; i++) {
      const k = dedans[(Math.random() * dedans.length) | 0];
      const gx = (k % S.w) + Math.random(), gy = ((k / S.w) | 0) + Math.random();
      const x = S.x0 + gx / S.w * (S.x1 - S.x0);
      const y = S.y1 - gy / S.h * (S.y1 - S.y0);
      const z = (y > yCoupure ? ZAV_SLALOM : ZAV_CULTURE) + (Math.random() - .5) * .03;
      const r = Math.random();
      cible.set([x, y, z, r], i * 4);
      if (mode === 'intro') {
        // tourbillon : un disque épais qui tourne autour du logo
        const a = Math.random() * Math.PI * 2, rr = 1.6 + Math.pow(Math.random(), 1.5) * 9.5;
        const bras = Math.sin(a * 2 + rr * .55);
        depart.set([Math.cos(a) * rr * 1.2, Math.sin(a) * rr * .5 + bras * .35, (Math.random() - .5) * 4.5 - 1.5 + bras * .6, 1], i * 4);
      } else {
        depart.set([x + (Math.random() - .5) * 3.2, y + (Math.random() - .5) * 2.2, z + (Math.random() - .5) * 4, 1], i * 4);
      }
    }
    const texCible = new T.DataTexture(cible, TW, TH, T.RGBAFormat, T.FloatType);
    texCible.minFilter = texCible.magFilter = T.NearestFilter; texCible.needsUpdate = true;
    const texDepart = new T.DataTexture(depart, TW, TH, T.RGBAFormat, T.FloatType);
    texDepart.minFilter = texDepart.magFilter = T.NearestFilter; texDepart.needsUpdate = true;

    const o = { type: typeFlottant, format: T.RGBAFormat, minFilter: T.NearestFilter, magFilter: T.NearestFilter, depthBuffer: false, stencilBuffer: false };
    const pos = [new T.WebGLRenderTarget(TW, TH, o), new T.WebGLRenderTarget(TW, TH, o)];
    const vit = [new T.WebGLRenderTarget(TW, TH, o), new T.WebGLRenderTarget(TW, TH, o)];

    const taille = { value: new T.Vector2(TW, TH) };
    const matCopie = new T.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTaille: taille, uVit: { value: 0 } },
      vertexShader: PLEIN_ECRAN_VS,
      fragmentShader: /* glsl */`
        uniform sampler2D tSrc; uniform vec2 uTaille; uniform float uVit;
        void main(){
          vec2 uv = gl_FragCoord.xy / uTaille;
          vec4 p = texture2D(tSrc, uv);
          // vitesse initiale : le tourbillon tourne déjà
          gl_FragColor = uVit > .5 ? vec4(-p.y * .9, p.x * .9, 0., 1.) : p;
        }`
    });
    const matVit = new T.ShaderMaterial({
      uniforms: {
        tPos: { value: null }, tVit: { value: null }, tCible: { value: texCible }, uTaille: taille,
        uSillage: communs.uSillage, uDt: { value: .016 }, uTemps: communs.uTemps, uAssT: { value: 0 },
        uTourbillon: { value: mode === 'intro' ? 1 : .35 }, uFuite: communs.uFuite,
        uMVP: { value: new T.Matrix4() }, uPoussee: { value: new T.Vector2(1, 1) }
      },
      vertexShader: PLEIN_ECRAN_VS,
      fragmentShader: /* glsl */`
        uniform sampler2D tPos, tVit, tCible, uSillage;
        uniform vec2 uTaille, uPoussee;
        uniform float uDt, uTemps, uAssT, uTourbillon, uFuite;
        uniform mat4 uMVP;
        vec3 fs(vec3 p){
          return vec3(sin(p.y * 1.7 + uTemps * .6) + sin(p.z * 2.3 - uTemps * .4),
                      sin(p.z * 1.9 + uTemps * .5) + sin(p.x * 2.1 + uTemps * .3),
                      sin(p.x * 1.5 - uTemps * .5) + sin(p.y * 2.7 + uTemps * .2));
        }
        vec3 curl(vec3 p){
          const float e = .12;
          vec3 dx = vec3(e, 0., 0.), dy = vec3(0., e, 0.), dz = vec3(0., 0., e);
          vec3 a = fs(p + dy) - fs(p - dy), b = fs(p + dz) - fs(p - dz), c = fs(p + dx) - fs(p - dx);
          return vec3(a.z - b.y, b.x - c.z, c.y - a.x) / (2. * e);
        }
        void main(){
          vec2 uv = gl_FragCoord.xy / uTaille;
          vec3 p = texture2D(tPos, uv).xyz;
          vec3 v = texture2D(tVit, uv).xyz;
          vec4 C = texture2D(tCible, uv);
          float f = clamp((uAssT - C.w * .95) / .85, 0., 1.);
          f = f * f * (3. - 2. * f);
          float k = mix(1.2, 46., f) * (1. - uFuite * .9);
          vec3 acc = (C.xyz - p) * k;
          if (uTourbillon > .001) {
            float g = uTourbillon * (1. - f);
            acc += curl(p * .3) * g * 1.3;
            acc.xy -= p.xy * .8 * g;
            acc.z -= (p.z + 1.5) * .6 * g;
          }
          vec4 cp = uMVP * vec4(p, 1.);
          vec2 s = cp.xy / cp.w * .5 + .5;
          vec4 tr = texture2D(uSillage, s);
          acc.xy += tr.rg * uPoussee * 20.;
          if (tr.b > .01) {
            acc += curl(p * 1.15 + vec3(0., 0., uTemps * .35)) * tr.b * 7.;
            acc.z += tr.b * (fract(C.w * 13.7) - .28) * 55.;
          }
          if (uFuite > .001) {
            acc += (vec3(p.x * .12, 1., (fract(C.w * 5.3) - .45) * 2.2) * (6. + fract(C.w * 3.1) * 8.) + curl(p * .45) * 3.) * uFuite;
          }
          v += acc * uDt;
          v *= exp(-mix(.7, 7.2, f) * uDt);
          float sp = length(v);
          if (sp > 60.) v *= 60. / sp;
          gl_FragColor = vec4(v, 1.);
        }`
    });
    const matPos = new T.ShaderMaterial({
      uniforms: { tPos: { value: null }, tVit: { value: null }, uTaille: taille, uDt: { value: .016 } },
      vertexShader: PLEIN_ECRAN_VS,
      fragmentShader: /* glsl */`
        uniform sampler2D tPos, tVit; uniform vec2 uTaille; uniform float uDt;
        void main(){
          vec2 uv = gl_FragCoord.xy / uTaille;
          gl_FragColor = vec4(texture2D(tPos, uv).xyz + texture2D(tVit, uv).xyz * uDt, 1.);
        }`
    });

    // nuage de points : chaque sommet lit sa position dans la texture
    const ref = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) { ref[i * 2] = ((i % TW) + .5) / TW; ref[i * 2 + 1] = (((i / TW) | 0) + .5) / TH; }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('aRef', new T.BufferAttribute(ref, 2));
    const matPoints = new T.ShaderMaterial({
      uniforms: {
        ...communs, tPos: { value: null }, tVit: { value: null }, tCible: { value: texCible },
        uTaillePt: { value: petit ? 2.7 : 2.5 }, uPR: { value: dpr }, uDist: { value: 1 }, uAssT: { value: 0 }
      },
      vertexShader: /* glsl */`
        ${BRUIT}
        ${CHAMP}
        attribute vec2 aRef;
        uniform sampler2D tPos, tVit, tCible;
        uniform float uTaillePt, uPR, uDist, uAssT;
        varying float vA; varying float vL;
        void main(){
          vec3 p = texture2D(tPos, aRef).xyz;
          vec3 v = texture2D(tVit, aRef).xyz;
          vec4 C = texture2D(tCible, aRef);
          vec4 mv = modelViewMatrix * vec4(p, 1.);
          gl_Position = projectionMatrix * mv;
          vec4 cc = projectionMatrix * modelViewMatrix * vec4(C.xyz, 1.);
          float dissous = step(0., champ(C.xy, cc.xy / cc.w * .5 + .5));
          float ecart = length(p - C.xyz);
          float vis = max(dissous, smoothstep(.03, .16, ecart));
          float vi = length(v);
          vA = vis * (.4 + .6 * fract(C.w * 7.31));
          float f = clamp((uAssT - C.w * .95) / .85, 0., 1.);
          vL = (.8 + .28 * sin(uTemps * 2.6 + C.w * 40.) + min(vi * .06, 1.)) * (1. + (1. - f) * .55);
          gl_PointSize = uTaillePt * uPR * (.55 + fract(C.w * 3.7) * .9) * (1. + (1. - f) * .45 + min(ecart * 1.4, 1.1)) * (uDist / max(-mv.z, 1.));
        }`,
      fragmentShader: /* glsl */`
        varying float vA; varying float vL;
        void main(){
          vec2 q = gl_PointCoord - .5;
          float a = clamp(exp(-dot(q, q) * 14.) * vA * vL, 0., 1.);
          if (a < .012) discard;
          gl_FragColor = vec4(vec3(a), a);
        }`,
      transparent: true, depthWrite: false, depthTest: true,
      blending: T.CustomBlending, blendEquation: T.AddEquation,
      blendSrc: T.OneFactor, blendDst: T.OneFactor,
      blendSrcAlpha: T.OneFactor, blendDstAlpha: T.OneMinusSrcAlphaFactor
    });
    const points = new T.Points(geo, matPoints);
    points.frustumCulled = false;
    points.renderOrder = 2;
    logo.add(points);

    return { TW, TH, pos, vit, matCopie, matVit, matPos, matPoints, texDepart, points, i: 0, pret: false };
  }

  /* ---------- passes plein écran ---------- */
  const camPass = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new T.Mesh(new T.PlaneGeometry(2, 2), null);
  const scenePass = new T.Scene();
  scenePass.add(quad);
  function passe(mat, cible) {
    quad.material = mat;
    rendu.setRenderTarget(cible);
    rendu.render(scenePass, camPass);
  }

  const matSillage = new T.ShaderMaterial({
    uniforms: {
      tPrec: { value: null }, uTaille: { value: new T.Vector2(sillW, sillH) },
      uM: { value: new T.Vector2() }, uM0: { value: new T.Vector2() },
      uForce: { value: 0 }, uAspect: { value: 1 }, uRayon: { value: .072 },
      uDecV: { value: .9 }, uDecI: { value: .965 }
    },
    vertexShader: PLEIN_ECRAN_VS,
    fragmentShader: /* glsl */`
      uniform sampler2D tPrec; uniform vec2 uTaille, uM, uM0;
      uniform float uForce, uAspect, uRayon, uDecV, uDecI;
      void main(){
        vec2 uv = gl_FragCoord.xy / uTaille;
        vec4 p = texture2D(tPrec, uv);
        p.rg *= uDecV; p.b *= uDecI;
        vec2 a = vec2(uAspect, 1.);
        vec2 pa = (uv - uM0) * a, ba = (uM - uM0) * a;
        float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-7), 0., 1.);
        float d = length(pa - ba * h);
        float s = exp(-d * d / (uRayon * uRayon)) * uForce;
        p.rg += (uM - uM0) * s * 9.;
        p.b = min(p.b + s * .55, 1.);
        gl_FragColor = vec4(clamp(p.rg, -1.5, 1.5), p.b, 1.);
      }`
  });

  /* ---------- dimensions et placement ---------- */
  function dimensionner() {
    L = Math.max(1, hero.clientWidth); H = Math.max(1, hero.clientHeight);
    rendu.setSize(L, H, false);
    camera.aspect = L / H;
    dist = (H / 2) / Math.tan(T.MathUtils.degToRad(FOV / 2));
    camera.position.set(0, 0, dist);
    camera.near = dist / 20; camera.far = dist * 4;
    camera.updateProjectionMatrix();
    const nh = Math.max(8, Math.round(sillW * H / L));
    if (nh !== sillH) { sillH = nh; sillage.forEach(r => r.setSize(sillW, sillH)); }
    matSillage.uniforms.uTaille.value.set(sillW, sillH);
    matSillage.uniforms.uAspect.value = L / H;
    const b = rendu.getDrawingBufferSize(new T.Vector2());
    matChrome.uniforms.uRes.value.copy(b);
    if (particules) particules.matPoints.uniforms.uDist.value = dist;
    placer(true);
  }

  const place = { x: 0, y: 0, s: 1 }, placeCible = { x: 0, y: 0, s: 1 };
  function placer(immediat) {
    const hr = hero.getBoundingClientRect(), lr = boiteLogo.getBoundingClientRect();
    if (!lr.width) return;
    placeCible.s = Math.min(lr.width / LARG, lr.height / HAUT) * 1.02;
    placeCible.x = lr.left + lr.width / 2 - (hr.left + hr.width / 2);
    placeCible.y = -(lr.top + lr.height / 2 - (hr.top + hr.height / 2));
    if (immediat) Object.assign(place, placeCible);
  }

  /* ---------- pointeur ---------- */
  const ptr = { x: .5, y: .5, x0: .5, y0: .5, actif: false, vu: 0, nx: 0, ny: 0 };
  let dernierGeste = performance.now(), gesteAuto = null, nbAuto = 0;
  function suivre(cx, cy) {
    const r = toile.getBoundingClientRect();
    const x = (cx - r.left) / r.width, y = 1 - (cy - r.top) / r.height;
    if (!ptr.actif) { ptr.x0 = x; ptr.y0 = y; }
    ptr.x = x; ptr.y = y; ptr.actif = true;
    ptr.nx = x * 2 - 1; ptr.ny = y * 2 - 1;
    dernierGeste = performance.now(); gesteAuto = null;
  }
  hero.addEventListener('pointermove', e => suivre(e.clientX, e.clientY), { passive: true });
  hero.addEventListener('pointerleave', () => { ptr.actif = false; ptr.nx *= .5; ptr.ny *= .5; }, { passive: true });
  hero.addEventListener('touchmove', e => { const t = e.touches[0]; if (t) suivre(t.clientX, t.clientY); }, { passive: true });
  hero.addEventListener('touchend', () => { ptr.actif = false; }, { passive: true });

  /* ---------- cycle de vie ---------- */
  let visible = true, actif = true, raf = 0;
  const io = new IntersectionObserver(e => { visible = e[0].isIntersecting; }, { threshold: 0 });
  io.observe(hero);
  document.addEventListener('visibilitychange', () => { actif = !document.hidden; });
  let redim = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(redim); redim = requestAnimationFrame(dimensionner); }, { passive: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => placer(false));

  toile.addEventListener('webglcontextlost', e => { e.preventDefault(); abandon(); }, false);
  function abandon() {
    cancelAnimationFrame(raf);
    racine.classList.remove('hero3d-actif', 'gl3d-intro');
    racine.classList.add('gl3d-echec');
    toile.remove();
  }

  /* ---------- chronologie ---------- */
  const intro = mode === 'intro';
  const debutReveal = intro ? 2.25 : .38, dureeReveal = intro ? 1.05 : .75;
  let temps = 0, chrono = 0, assT = intro ? -.35 : .75, revele = false, sauter = false, t0 = 0;
  function passer() { if (!revele && chrono < debutReveal - .3) { sauter = true; } }
  if (intro) {
    ['wheel', 'keydown', 'touchstart', 'mousedown'].forEach(ev =>
      window.addEventListener(ev, passer, { passive: true, once: true }));
  }

  const mvp = new T.Matrix4(), rot = new T.Matrix3();
  let reflT = 0;
  let tPrec = performance.now();

  dimensionner();

  function image(maintenant, manuel) {
    if (!manuel) raf = requestAnimationFrame(image);
    if (!visible || !actif) { tPrec = maintenant; return; }
    const dt = Math.min((maintenant - tPrec) / 1000, 1 / 30);
    tPrec = maintenant;
    if (!t0) t0 = maintenant;
    temps += dt;
    // la chronologie suit l'horloge réelle : un appareil lent voit la même mise en scène
    const avance = Math.max(0, (maintenant - t0) / 1000 - chrono);
    chrono += avance;

    if (sauter) { t0 -= Math.max(0, debutReveal - .25 - chrono) * 1000; chrono = Math.max(chrono, debutReveal - .25); assT = Math.max(assT, 1.9); sauter = false; }
    assT += avance;

    // révélation du chrome et de la page
    const rv = lisse(debutReveal, debutReveal + dureeReveal, chrono);
    communs.uReveal.value = rv;
    if (!revele && chrono >= debutReveal + .08) {
      revele = true;
      racine.classList.remove('gl3d-intro');
    }
    communs.uTemps.value = temps;

    // le logo s'efface en particules quand on quitte le haut de page
    const y = window.pageYOffset;
    communs.uFuite.value = lisse(H * .04, H * .46, y);

    // reflet vidéo (30 images/s suffisent)
    reflT += dt;
    if (video && video.readyState >= 2 && reflT > 1 / 30) {
      reflT = 0;
      try { rctx.drawImage(video, 0, 0, RW, RH); texEnv.needsUpdate = true; matChrome.uniforms.uEnvOk.value = Math.min(1, matChrome.uniforms.uEnvOk.value + .05); } catch (e) {}
    }

    // geste automatique si personne ne touche au logo : on montre l'effet
    const calme = maintenant - dernierGeste;
    if (revele && !ptr.actif && calme > (tactile ? 4200 : 6500) && !gesteAuto && y < H * .5 && nbAuto < 4) {
      nbAuto++;
      gesteAuto = { t: 0, sens: Math.random() < .5 ? 1 : -1, yb: .42 + Math.random() * .16 };
    }
    let mx = ptr.x, my = ptr.y, force = 0;
    if (gesteAuto) {
      gesteAuto.t += dt / 1.5;
      const u = gesteAuto.t;
      const lx = (place.x + L / 2) / L, ly = (place.y + H / 2) / H;
      const demi = (LARG * place.s / L) * .62;
      mx = lx + (u * 2 - 1) * demi * gesteAuto.sens;
      my = ly + Math.sin(u * Math.PI * 2) * .06 + (gesteAuto.yb - .5) * .12;
      force = Math.sin(Math.min(u, 1) * Math.PI) * .55;
      if (u >= 1) { gesteAuto = null; dernierGeste = maintenant; }
      if (u < dt / 1.5 * 1.01) { ptr.x0 = mx; ptr.y0 = my; }
    } else if (ptr.actif) {
      const v = Math.hypot(ptr.x - ptr.x0, (ptr.y - ptr.y0) * H / L);
      force = Math.min(1, v * 28);
    }
    const u = matSillage.uniforms;
    u.tPrec.value = sillage[0].texture;
    u.uM.value.set(mx, my); u.uM0.value.set(ptr.x0, ptr.y0);
    u.uForce.value = force;
    u.uDecV.value = Math.pow(.9, dt * 60); u.uDecI.value = Math.pow(.962, dt * 60);
    passe(matSillage, sillage[1]);
    sillage.reverse();
    communs.uSillage.value = sillage[0].texture;
    ptr.x0 = mx; ptr.y0 = my;
    if (gesteAuto) { ptr.x = mx; ptr.y = my; }

    // le logo flotte et s'incline vers le pointeur
    placeCible.s && ['x', 'y', 's'].forEach(k => { place[k] += (placeCible[k] - place[k]) * Math.min(1, dt * 6); });
    const ry = (ptr.actif && !tactile ? ptr.nx * .26 : Math.sin(temps * .37) * .16);
    const rx = (ptr.actif && !tactile ? -ptr.ny * .16 : Math.cos(temps * .29) * .06) + communs.uFuite.value * .5;
    logo.rotation.y += (ry - logo.rotation.y) * Math.min(1, dt * 3);
    logo.rotation.x += (rx - logo.rotation.x) * Math.min(1, dt * 3);
    logo.position.set(place.x, place.y + Math.sin(temps * .8) * 3, 0);
    logo.scale.setScalar(place.s);
    logo.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    matChrome.uniforms.uCam.value.copy(camera.position);
    rot.setFromMatrix4(logo.matrixWorld);
    const e = rot.elements, sc = Math.hypot(e[0], e[1], e[2]) || 1;
    for (let i = 0; i < 9; i++) e[i] /= sc;
    matChrome.uniforms.uRot.value.copy(rot);

    // simulation des particules
    if (particules) {
      const P = particules;
      if (!P.pret) {
        P.matCopie.uniforms.tSrc.value = P.texDepart; P.matCopie.uniforms.uVit.value = 0;
        passe(P.matCopie, P.pos[0]);
        P.matCopie.uniforms.uVit.value = intro ? 1 : 0;
        passe(P.matCopie, P.vit[0]);
        P.pret = true;
      }
      mvp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(logo.matrixWorld);
      const mv = P.matVit.uniforms;
      mv.tPos.value = P.pos[0].texture; mv.tVit.value = P.vit[0].texture;
      mv.uDt.value = dt; mv.uAssT.value = assT; mv.uMVP.value.copy(mvp);
      mv.uPoussee.value.set(L / place.s, H / place.s);
      passe(P.matVit, P.vit[1]);
      const mp = P.matPos.uniforms;
      mp.tPos.value = P.pos[0].texture; mp.tVit.value = P.vit[1].texture; mp.uDt.value = dt;
      passe(P.matPos, P.pos[1]);
      P.pos.reverse(); P.vit.reverse();
      P.matPoints.uniforms.tPos.value = P.pos[0].texture;
      P.matPoints.uniforms.uAssT.value = assT;
      P.matPoints.uniforms.tVit.value = P.vit[0].texture;
    }

    rendu.setRenderTarget(null);
    rendu.clear(true, true, true);
    rendu.render(scene, camera);

    if (!racine.classList.contains('hero3d-actif')) racine.classList.add('hero3d-actif');
  }
  // mode d'inspection (#debug3d) : on avance image par image, sans horloge
  if (location.hash.indexOf('debug3d') >= 0) {
    let tv = performance.now();
    window.__hero3d = {
      avancer(sec, pas = 1 / 30) { let n = Math.max(1, Math.round(sec / pas)); while (n--) { tv += pas * 1000; image(tv, true); } },
      pointeur(cx, cy) { suivre(cx, cy); },
      lacher() { ptr.actif = false; }
    };
    tPrec = tv;
  } else raf = requestAnimationFrame(image);
  return { abandon };
}
