import "./app/router-location-fix";
import "@supersoniks/concorde/theme";
import "@supersoniks/concorde/router";
import "./app/concorde-sdui-runtime";

import {applyTheme, loadStoredThemeId} from "./app/appearance";

// Thème avant le premier rendu (pas de <script> inline : CSP). Même normalisation que le reste.
applyTheme(loadStoredThemeId());

import "./app-router-host";
