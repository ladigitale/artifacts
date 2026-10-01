import "@supersoniks/concorde/theme";
import "@supersoniks/concorde/router";
import "./app/concorde-sdui-runtime";

// Thème avant paint basique — pas de <script> inline (CSP).
try {
  const t = localStorage.getItem("artifacts-theme");
  if (t && t !== "default") {
    document.documentElement.setAttribute("data-theme", t);
  }
} catch {
  /* ignore */
}

import "./app-router-host";
