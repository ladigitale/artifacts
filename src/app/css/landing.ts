import {css} from "lit";

export const landingStyles = css`
  :host {
    display: block;
    min-height: 100%;
    font-family: var(--sc-font-family-base, "DM Sans", system-ui, sans-serif);
    background: var(--sc-base-50, #e8e4f8);
    color: var(--sc-base-content, #14101f);
  }
  .stage {
    min-height: 100%;
    display: flex;
    flex-direction: column;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.25rem 1.5rem;
    max-width: 72rem;
    width: 100%;
    margin: 0 auto;
    box-sizing: border-box;
  }
  main {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr;
    gap: 2.5rem;
    align-items: center;
    padding: 1.5rem 1.5rem 3rem;
    max-width: 72rem;
    width: 100%;
    margin: 0 auto;
    box-sizing: border-box;
  }
  @media (min-width: 900px) {
    main {
      grid-template-columns: 1.1fr 0.9fr;
      gap: 3.5rem;
      padding-top: 2rem;
      padding-bottom: 4rem;
    }
  }
  .brand {
    font-family: var(--sc-font-family-headings, "Space Grotesk", system-ui, sans-serif);
    font-weight: 700;
    font-size: clamp(3rem, 10vw, 5.5rem);
    line-height: 0.95;
    letter-spacing: -0.03em;
    margin: 1rem 0 0;
    color: var(--sc-base-900);
  }
  .lede {
    max-width: 26rem;
    margin: 1.15rem 0 0;
    font-size: 1.05rem;
    line-height: 1.55;
    color: var(--sc-base-500);
  }
  .meta {
    margin-top: 1.5rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .hero-viz {
    width: min(18rem, 100%);
    aspect-ratio: 4 / 3;
    border-radius: var(--sc-rounded, 0.625rem);
    background:
      linear-gradient(135deg, var(--sc-primary) 0%, transparent 55%),
      linear-gradient(225deg, var(--sc-info) 0%, transparent 50%),
      var(--sc-base-100);
    border: 1px solid var(--sc-base-100);
  }
  .auth-panel {
    background: var(--sc-base);
    padding: 1.5rem 1.35rem 1.6rem;
    border-radius: var(--sc-rounded, 0.625rem);
    border: 1px solid var(--sc-base-100);
  }
  .auth-title {
    font-family: var(--sc-font-family-headings, "Space Grotesk", system-ui, sans-serif);
    font-weight: 700;
    font-size: 1.35rem;
    letter-spacing: -0.02em;
    margin: 0;
    color: var(--sc-base-900);
  }
  .auth-lede {
    margin: 0.35rem 0 1.1rem;
    font-size: 0.9rem;
    color: var(--sc-base-500);
  }
  footer {
    padding: 1rem 1.5rem 1.5rem;
    max-width: 72rem;
    width: 100%;
    margin: 0 auto;
    box-sizing: border-box;
    color: var(--sc-base-400);
    font-size: 0.8rem;
  }
`;
