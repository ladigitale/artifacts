export default async (h) => {
  let s = await h.state("scene");
  h.check("réglages initialisés", s.param0 === 1 && s.param1 === 4 && s.param2 === 0.6, JSON.stringify([s.param0, s.param1, s.param2]));
  h.check("3 réglages affichés", await h.visible("[data-control]") === 3);
  h.check("libellés et valeurs", (await h.text("[data-control]")).join(" | ").includes("Vitesse 1"), (await h.text("[data-control]")).join(" | "));
  await h.click("[data-inc='1']"); await h.wait(200); await h.click("[data-inc='1']"); await h.wait(200);
  await h.click("[data-dec='0']"); await h.wait(200);
  s = await h.state("scene");
  h.check("+ / −", s.param1 === 6 && s.param0 === 0.75, JSON.stringify([s.param0, s.param1]));
  for (let i = 0; i < 12; i++) { await h.click("[data-inc='2']"); await h.wait(60); }
  await h.wait(200);
  h.check("borné au max", (await h.state("scene")).param2 === 1, (await h.state("scene")).param2);
  await h.click("[data-random]"); await h.wait(300);
  s = await h.state("scene");
  h.check("hasard dans les bornes, pas de réglage alignés", s.param1 >= 1 && s.param1 <= 12 && Number.isInteger(s.param1) && s.param0 >= 0 && s.param0 <= 3, JSON.stringify([s.param0, s.param1, s.param2]));
  await h.click("[data-reset]"); await h.wait(300);
  s = await h.state("scene");
  h.check("réinitialiser", s.param0 === 1 && s.param1 === 4 && s.param2 === 0.6);
  const sh = await h.eval(`const e = all("sonic-shader")[0]; return {p0: e.param0, p1: e.param1, canvas: !!(e.shadowRoot && e.shadowRoot.querySelector("canvas")), title: e.title || ""};`);
  h.check("shader relié aux réglages", sh.p0 === 1 && sh.p1 === 4 && sh.canvas && sh.title === "", JSON.stringify(sh));
  await h.wait(800);
};
