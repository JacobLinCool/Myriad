import "./app.css";
import { mount } from "svelte";
import App from "./App.svelte";
import { migrateStorage } from "./lib/storage-migration";
import "./lib/posthog";

// Before any state reads storage, so drafts saved under the old name are found.
migrateStorage();

// Caches compiler toolchain files; see public/toolchain-sw.js.
if ("serviceWorker" in navigator)
  navigator.serviceWorker
    .register("/toolchain-sw.js", { updateViaCache: "none" })
    .catch(() => {});

const target = document.getElementById("app")!;
target.replaceChildren();
const app = mount(App, { target });

export default app;
