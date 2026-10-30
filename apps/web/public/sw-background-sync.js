// Loaded into the generated Workbox service worker through importScripts.
self.addEventListener("sync", function replayQueuedSync(event) {
    if (event.tag !== "praxbit-sync") {
        return;
    }
    event.waitUntil(
        self.clients
            .matchAll({ type: "window", includeUncontrolled: true })
            .then(function wakeClients(clients) {
                for (const client of clients) {
                    client.postMessage({ type: "praxbit:sync" });
                }
            }),
    );
});
