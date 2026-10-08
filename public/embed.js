/*!
 * Artefacts — intégration par balise script.
 *
 *   <script src="https://artifacts.tadaaa.space/embed.js" data-artifact="mon-slug" async></script>
 *
 * Attributs (tous facultatifs sauf data-artifact) :
 *   data-artifact   slug de l'artefact
 *   data-theme      thème Artefacts : dark, nord, terminal, matcha…
 *   data-view       vue de départ (id d'une vue du document)
 *   data-key        jeton d'un artefact partagé « par lien » (k)
 *   data-read-key   lien secret de lecture des collections (rk)
 *   data-height     hauteur fixe (480px, 60vh…) ; sinon hauteur naturelle
 *   data-target     sélecteur CSS du conteneur ; sinon juste avant la balise script
 *   data-transparent  fond transparent
 *   data-open-link="false"  masque le lien « Ouvrir dans Artefacts »
 *   data-api        URL de l'API Tadaaa (développement uniquement)
 *
 * Le script insère un <artifact-embed> (web component, shadow DOM) et charge une seule
 * fois le module partagé, même avec plusieurs balises sur la page.
 * Pas de module ni d'ES récent ici : ce fichier doit tourner tel quel partout.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script || !script.src) return;

  var moduleUrl = new URL("embed/artifact-embed.js", script.src).href;
  var w = window;
  var data = script.dataset || {};

  if (data.api && !w.__artifactsApiBase) w.__artifactsApiBase = data.api;

  // Module partagé : une seule fois par page (et pas du tout s'il est déjà là en <script type="module">).
  if (!w.__artifactsEmbedLoading && !document.querySelector('script[type="module"][src="' + moduleUrl + '"]')) {
    w.__artifactsEmbedLoading = true;
    var mod = document.createElement("script");
    mod.type = "module";
    mod.src = moduleUrl;
    mod.crossOrigin = "anonymous";
    document.head.appendChild(mod);
  }

  var slug = (data.artifact || "").trim();
  if (!slug) {
    if (w.console) w.console.warn("[artefacts] data-artifact manquant sur", script);
    return;
  }

  var el = document.createElement("artifact-embed");
  el.setAttribute("slug", slug);
  var attrs = {theme: "theme", view: "view", key: "link-key", readKey: "read-key", height: "height", openLink: "open-link"};
  for (var k in attrs) {
    if (Object.prototype.hasOwnProperty.call(attrs, k) && data[k]) el.setAttribute(attrs[k], data[k]);
  }
  if (data.transparent !== undefined && data.transparent !== "false") el.setAttribute("transparent", "");

  function mount() {
    var target = data.target ? document.querySelector(data.target) : null;
    if (target) target.appendChild(el);
    else if (script.parentNode) script.parentNode.insertBefore(el, script);
  }

  // Avec async/defer, data-target peut viser un élément pas encore parsé.
  if (data.target && document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
