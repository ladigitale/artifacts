export default async (h) => {
  const t = await h.text("artifact-a2ui-view");
  h.check("formulaire rendu", t[0]?.includes("Repas de quartier") && t[0]?.includes("Tu viens ? *") && t[0]?.includes("Dessert"), t[0]?.slice(0, 200));
  // Envoi sans les réponses obligatoires.
  await h.click("artifact-a2ui-view sonic-button[type=primary], artifact-a2ui-view sonic-button");
  await h.wait(500);
  let s = await h.state("form");
  h.check("champs obligatoires signalés", s?.msg?.startsWith("Il manque :") && s.msg.includes("Tu viens ?") && h.posts.length === 0, s?.msg);
  // Remplir : oui/non, choix, multi, texte.
  const pick = async (label) => h.eval(`const el = all("label, sonic-radio, sonic-checkbox, button").find(e => (e.textContent || "").trim() === arg || e.getAttribute("label") === arg); if (!el) return false; el.scrollIntoView({block: "center"}); const r = el.getBoundingClientRect(); return {x: r.x + 10, y: r.y + r.height / 2};`, label);
  for (const l of ["Oui", "Dessert", "Ranger", "Cuisiner"]) {
    const box = await pick(l);
    if (box) await h.page.mouse.click(box.x, box.y); else h.check("option " + l, false);
    await h.wait(150);
  }
  const input = await h.eval(`const i = all("input[type=text], input:not([type])").find(e => e.offsetParent); if (!i) return null; i.scrollIntoView({block: "center"}); const r = i.getBoundingClientRect(); return {x: r.x + 5, y: r.y + r.height / 2};`);
  if (input) { await h.page.mouse.click(input.x, input.y); await h.page.keyboard.type("Julien"); }
  await h.wait(300);
  await h.click("artifact-a2ui-view sonic-button");
  await h.wait(1200);
  s = await h.state("form");
  const post = h.posts[0];
  h.check("réponse envoyée à la collecte", !!post && /answers|reponses/.test(post.path), JSON.stringify(h.posts).slice(0, 300));
  h.check("valeurs envoyées", post && JSON.stringify(post.body).includes('"vient":"Oui"') && JSON.stringify(post.body).includes('"plat":"Dessert"') && JSON.stringify(post.body).includes('"aide":"Ranger, Cuisiner"') && JSON.stringify(post.body).includes('"personnes":1'), JSON.stringify(post?.body));
  h.check("merci + file vidée", s.msg === "Merci, ta réponse est enregistrée !" && s.outbox.length === 0 && s.sent === 1, JSON.stringify({msg: s.msg, outbox: s.outbox, sent: s.sent}));
};
