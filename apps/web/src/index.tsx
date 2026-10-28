import { render } from "solid-js/web";
import { registerSW } from "virtual:pwa-register";
import { App } from "./app/App.tsx";
import "./styles/global.css";

const root = document.querySelector("#root");
if (root === null) {
    throw new Error("Praxbit could not find its root element.");
}

render(function renderApp() {
    return <App />;
}, root);

registerSW({ immediate: true });
