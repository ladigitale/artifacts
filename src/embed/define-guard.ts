/**
 * Premier module évalué du bundle embed.
 *
 * Les composants Concorde sont préfixés `afx-`, mais ceux de la creative-stack gardent
 * leur nom (`sonic-store`, `sonic-3d`…). Si la page hôte en a déjà défini un (autre
 * intégration, autre version), `customElements.define` lèverait une exception et tout
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
