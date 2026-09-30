import {html} from "lit";
import type {DirectiveResult} from "lit/directive.js";

function goHome(event: Event) {
  event.preventDefault();
  if (location.pathname === "/") return;
  history.pushState({}, "", "/");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default (children: DirectiveResult) => html`
  <div class="app-shell flex flex-col min-h-screen">
    <nav
      class="shrink-0 border-b border-current/20 print:hidden"
      aria-label="Navigation"
    >
      <div class="mx-auto flex w-full max-w-6xl items-center gap-3 px-3 py-3 sm:px-4">
        <a
          href="/"
          class="font-semibold no-underline text-lg"
          style="color:inherit"
          @click=${goHome}
          >Artefacts</a
        >
        <div class="flex-1"></div>
        <a href="/cloud" class="text-sm underline opacity-80">Compte</a>
      </div>
    </nav>
    <main class="flex-1 w-full">
      <div class="mx-auto w-full max-w-6xl px-3 py-4 sm:px-4">${children}</div>
    </main>
  </div>
`;
