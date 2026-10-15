import {css} from "lit";

/**
 * Couche UI commune des pages d'administration (Opérer : lisibilité, constance, densité).
 *
 * Tout passe par les variables Concorde `--sc-*` : les treize thèmes (clairs, sombres,
 * bruyants) restent lisibles sans règle par thème. Aucune couleur en dur.
 *
 * Échelle d'espacement sur base 4 : --ui-1 (4) · 2 (8) · 3 (12) · 4 (16) · 6 (24) · 8 (32) · 12 (48).
 * Échelle typographique fixe (pas de fluide dans une appli) : xs 12 · sm 14 · md 16 · lg 18 · xl 22 · 2xl 28.
 */
export const uiStyles = css`
  :host {
    display: block;
    --ui-1: 0.25rem;
    --ui-2: 0.5rem;
    --ui-3: 0.75rem;
    --ui-4: 1rem;
    --ui-6: 1.5rem;
    --ui-8: 2rem;
    --ui-12: 3rem;
    --ui-fs-xs: 0.75rem;
    --ui-fs-sm: 0.875rem;
    --ui-fs-md: 1rem;
    --ui-fs-lg: 1.125rem;
    --ui-fs-xl: 1.375rem;
    --ui-fs-2xl: 1.75rem;
    --ui-ink: var(--sc-base-content);
    /* Texte secondaire : teinté depuis l'encre, jamais un gris posé. */
    --ui-muted: color-mix(in srgb, var(--sc-base-content) 70%, var(--sc-base));
    --ui-line: color-mix(in srgb, var(--sc-base-content) 14%, transparent);
    --ui-line-strong: color-mix(in srgb, var(--sc-base-content) 26%, transparent);
    --ui-hover: color-mix(in srgb, var(--sc-base-content) 6%, transparent);
    --ui-selected: color-mix(in srgb, var(--sc-primary) 12%, transparent);
    --ui-radius: var(--sc-rounded, 0.5rem);
    --ui-shadow-pop:
      0 1px 2px color-mix(in srgb, var(--sc-base-content) 12%, transparent),
      0 12px 28px -10px color-mix(in srgb, var(--sc-base-content) 30%, transparent);
    --ui-ease: cubic-bezier(0.22, 1, 0.36, 1);
    color: var(--sc-base-content);
    font-family: var(--sc-font-family-base, system-ui, sans-serif);
    font-size: var(--ui-fs-md);
    line-height: 1.5;
  }
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
  h1,
  h2,
  h3,
  p,
  ul,
  ol,
  dl,
  dd,
  figure {
    margin: 0;
  }
  ul,
  ol {
    padding: 0;
    list-style: none;
  }
  legend {
    padding: 0;
  }
  code {
    font-family: var(--sc-font-family-mono, ui-monospace, "SFMono-Regular", Menlo, monospace);
    font-size: 0.92em;
  }
  a {
    color: inherit;
    text-decoration-color: color-mix(in srgb, currentColor 40%, transparent);
    text-underline-offset: 0.18em;
  }
  a:hover {
    text-decoration-color: currentColor;
  }
  :focus-visible {
    outline: 2px solid var(--sc-base-content);
    outline-offset: 2px;
  }
  ::selection {
    background: color-mix(in srgb, var(--sc-primary) 30%, transparent);
  }

  /* ───── Page ───── */
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--ui-6);
  }
  .page-narrow {
    max-width: 40rem;
  }
  .page-head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--ui-3) var(--ui-6);
  }
  .page-head .titles {
    display: flex;
    flex-direction: column;
    gap: var(--ui-1);
    min-width: 0;
  }
  h1 {
    font-family: var(--sc-font-family-headings, inherit);
    font-size: var(--ui-fs-2xl);
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.015em;
    text-wrap: balance;
    overflow-wrap: anywhere;
  }
  h2 {
    font-family: var(--sc-font-family-headings, inherit);
    font-size: var(--ui-fs-lg);
    font-weight: 600;
    line-height: 1.3;
    text-wrap: balance;
  }
  .sub {
    color: var(--ui-muted);
    font-size: var(--ui-fs-sm);
    max-width: 62ch;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ui-2);
  }
  .crumb {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-1);
    align-self: flex-start;
    margin-inline-start: calc(var(--ui-2) * -1);
    padding: var(--ui-1) var(--ui-2);
    border-radius: var(--ui-radius);
    color: var(--ui-muted);
    font-size: var(--ui-fs-sm);
    text-decoration: none;
    transition: background-color 0.15s, color 0.15s;
  }
  .crumb:hover {
    color: var(--sc-base-content);
    background: var(--ui-hover);
  }
  .crumb sonic-icon {
    flex: none;
  }

  /* ───── Surface : une seule, jamais imbriquée ───── */
  .panel {
    background: var(--sc-base);
    border: 1px solid var(--ui-line);
    border-radius: var(--ui-radius);
  }
  .panel-pad {
    padding: var(--ui-6);
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: var(--ui-3);
  }
  .section-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* ───── Pastille d'état (visibilité) ───── */
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    padding: 0.1em 0.65em 0.1em 0.5em;
    border: 1px solid var(--ui-line-strong);
    border-radius: 9999px;
    font-size: var(--ui-fs-xs);
    font-weight: 500;
    line-height: 1.6;
    white-space: nowrap;
  }
  .pill::before {
    content: "";
    flex: none;
    width: 0.5em;
    height: 0.5em;
    border-radius: 50%;
    background: var(--pill, var(--sc-base-400));
  }
  .pill[data-tone="public"] {
    --pill: var(--sc-success);
  }
  .pill[data-tone="link"] {
    --pill: var(--sc-info);
  }
  .pill[data-tone="private"] {
    --pill: var(--sc-base-400);
  }

  /* ───── Messages ───── */
  .notice {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ui-2) var(--ui-3);
    padding: var(--ui-3) var(--ui-4);
    border-radius: var(--ui-radius);
    background: color-mix(in srgb, var(--tone, var(--sc-info)) 14%, var(--sc-base));
    border: 1px solid color-mix(in srgb, var(--tone, var(--sc-info)) 45%, transparent);
    font-size: var(--ui-fs-sm);
  }
  .notice[data-tone="danger"] {
    --tone: var(--sc-danger);
  }
  .notice[data-tone="warning"] {
    --tone: var(--sc-warning);
  }
  .notice[data-tone="success"] {
    --tone: var(--sc-success);
  }
  .notice > sonic-icon {
    flex: none;
  }
  .notice .grow {
    flex: 1 1 14rem;
    min-width: 0;
  }

  /* ───── Vide / chargement ───── */
  .empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--ui-3);
    padding: var(--ui-8) var(--ui-6);
  }
  .empty p {
    color: var(--ui-muted);
    max-width: 46ch;
  }
  .skeleton {
    display: block;
    height: 1em;
    border-radius: 0.35em;
    background: linear-gradient(
      90deg,
      var(--ui-hover) 0%,
      color-mix(in srgb, var(--sc-base-content) 12%, transparent) 50%,
      var(--ui-hover) 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1.4s linear infinite;
  }
  @keyframes shimmer {
    to {
      background-position: -200% 0;
    }
  }

  /* ───── Formulaire ───── */
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--ui-4);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--ui-1);
    min-width: 0;
    border: 0;
    padding: 0;
    margin: 0;
  }
  .label {
    font-size: var(--ui-fs-sm);
    font-weight: 600;
  }
  .hint {
    color: var(--ui-muted);
    font-size: var(--ui-fs-sm);
  }
  .form-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-2);
    padding-top: var(--ui-2);
  }

  /* ───── Chiffres alignés ───── */
  .num,
  time {
    font-variant-numeric: tabular-nums;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
    }
  }
`;

/** « il y a 2 h », « hier », « 3 sept. » — le détail exact reste dans l'attribut `title`. */
export function relativeTime(iso: string | undefined | null, now = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return String(iso);
  const diff = t - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("fr", {numeric: "auto"});
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (abs < min) return "à l’instant";
  if (abs < hour) return rtf.format(Math.round(diff / min), "minute");
  if (abs < day) return rtf.format(Math.round(diff / hour), "hour");
  if (abs < 7 * day) return rtf.format(Math.round(diff / day), "day");
  const d = new Date(t);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString("fr", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : {year: "numeric"}),
  });
}

export function fullDate(iso: string | undefined | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("fr", {dateStyle: "long", timeStyle: "short"});
}

export const VISIBILITY_LABELS: Record<string, {label: string; hint: string}> = {
  public: {label: "Public", hint: "Visible par tout le monde"},
  link: {label: "Lien", hint: "Visible avec le lien secret"},
  private: {label: "Privé", hint: "Visible par vous seul"},
};

/** Referme le `sonic-pop` qui contient l'élément cliqué (menus d'actions). */
export function hidePop(e: Event): void {
  const pop = (e.currentTarget as HTMLElement | null)?.closest<HTMLElement & {hide?: () => void}>("sonic-pop");
  pop?.hide?.();
}
