import type {DirectiveResult} from "lit/directive.js";
import {renderAdminShell} from "../../views/admin-shell";

export default (children: DirectiveResult, _params?: Record<string, string>) =>
  renderAdminShell(children);
