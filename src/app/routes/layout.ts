import {html} from "lit";
import type {DirectiveResult} from "lit/directive.js";

/** Layout racine minimal : pas de chrome (landing a le sien ; admin a son layout). */
export default (children: DirectiveResult) => html`${children}`;
