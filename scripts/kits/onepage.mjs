export default async (h) => {
  await h.wait(600);
  const icons = await h.eval(`return all("sonic-icon").map(e => !!(e.shadowRoot && e.shadowRoot.querySelector("svg")))`);
  h.check("icônes rendues", icons.length > 0 && icons.every(Boolean), JSON.stringify(icons));
  h.check("bandeau", (await h.text("[data-hero]"))[0]?.startsWith("Fanfare des Ponts") , await h.text("[data-hero]"));
  h.check("bouton d'action", (await h.eval(`return all("[data-cta]")[0]?.getAttribute("href")`)) === "https://example.org/contact");
  h.check("2 sections", await h.visible("[data-section]") === 2);
  h.check("cartes de la section 2", (await h.text("[data-item]")).join(" | ") .replace(/ /g, "") === "ConcertsFêtesdevillage,mariages,carnavals.|AteliersInitiationauxcuivreslesamedimatin.|Prêtd'instruments", (await h.text("[data-item]")).join(" | "));
  h.check("FAQ", (await h.text("[data-faq-section]"))[0]?.includes("Questions fréquentes") && (await h.text("[data-faq]"))[0]?.includes("d'oreille"), await h.text("[data-faq-section]"));
  h.check("pied de page", (await h.text("footer"))[0] === "Fanfare des Ponts — association loi 1901");
};
