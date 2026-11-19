import "./app/router-location-fix";
import "@supersoniks/concorde/theme";
import "@supersoniks/concorde/router";
import "./app/concorde-sdui-runtime";

import {applyTheme, loadStoredThemeId} from "./app/appearance";

// Thème avant le premier rendu (pas de <script> inline : CSP). Même normalisation que le reste.
applyTheme(loadStoredThemeId());

import "./app-router-host";
import {registerWebMcpTools} from "./app/webmcp";

// Bloc statique lisible sans JS (index.html) : l'app prend le relais.
document.getElementById("static-intro")?.remove();
registerWebMcpTools();
