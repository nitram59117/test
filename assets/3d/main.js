/* Slalom — chargeur des effets 3D (chargé après l'affichage de la page) */
const racine = document.documentElement;
const base = new URL('./', import.meta.url).href;

function echec(e) {
  racine.classList.remove('gl3d-intro', 'hero3d-actif');
  racine.classList.add('gl3d-echec');
  if (window.console && e) console.warn('[slalom 3d]', e);
}

async function lancer() {
  if (!racine.classList.contains('gl3d')) return;
  const corps = document.body;

  // si la page a déjà basculé sur sa version sans 3D (réseau très lent), on ne remplace plus le logo
  if (corps.classList.contains('accueil') && !racine.classList.contains('gl3d-echec')) {
    try {
      const { demarrerHero } = await import('./hero.js');
      const h = await demarrerHero({ mode: racine.classList.contains('gl3d-intro') ? 'intro' : 'court', base });
      if (!h) echec();
    } catch (e) { echec(e); }
  }

  try {
    const { demarrerDamier } = await import('./damier.js');
    demarrerDamier({ base });
  } catch (e) { racine.classList.remove('damier3d-actif'); }

  if (corps.classList.contains('page-galerie')) {
    try {
      const { demarrerGalerie } = await import('./galerie.js');
      demarrerGalerie({ base });
    } catch (e) { racine.classList.remove('galerie3d-actif'); }
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', lancer);
else lancer();
