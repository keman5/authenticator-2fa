import { mount } from "svelte";
import "./style.css";
import App from "./App.svelte";
if (
  typeof chrome !== "undefined" &&
  chrome.extension?.getViews?.({ type: "popup" }).includes(window)
) {
  document.documentElement.classList.add("extension-popup");
}
mount(App, { target: document.getElementById("app")! });
