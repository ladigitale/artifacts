/**
 * Premier module évalué du bundle embed.
 *
 * Les composants Concorde et creative-stack sont préfixés `afx-` à la compilation ; seuls
 * les modules enfants définis en boucle (`sonic-osc`, `sonic-voice`, `sonic-body`…) gardent
 * leur nom. Si la page hôte en a déjà défini un (ou si deux bundles embed de versions
 * différentes cohabitent), `customElements.define` lèverait une exception et tout
 * l'artefact tomberait : on garde la définition existante et on le signale.
 */
const registry = window.customElements;
const define = registry.define.bind(registry);

registry.define = (name: string, ctor: CustomElementConstructor, options?: ElementDefinitionOptions) => {
  if (registry.get(name)) {
    console.warn(`[artefacts] <${name}> est déjà défini sur cette page : définition existante conservée.`);
    return;
  }
  define(name, ctor, options);
};

export {};
