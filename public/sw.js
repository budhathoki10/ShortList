self.addEventListener("push", (event) => {
  if (!event.data) return;
  event.waitUntil((async () => {
    let data;
    try { data = event.data.json(); } catch { return; }
    if (!data || typeof data.title !== "string" || typeof data.url !== "string" || !data.url.startsWith("/app/")) return;
    await self.registration.showNotification(data.title.slice(0, 120), {
      body: typeof data.body === "string" ? data.body.slice(0, 180) : "Open Shortlist to review this match.",
      icon: "/shortlist-icon.svg",
      badge: "/shortlist-icon.svg",
      tag: typeof data.tag === "string" ? data.tag.slice(0, 120) : "shortlist-job-match",
      data: { url: data.url },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data && typeof event.notification.data.url === "string" && event.notification.data.url.startsWith("/app/")
    ? event.notification.data.url
    : "/app/radar";
  event.waitUntil((async () => {
    const target = new URL(path, self.location.origin).href;
    // Focus the match if it's already open. Never navigate another Shortlist tab away: it may hold unsaved work.
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = windows.find((client) => client.url === target);
    if (open) return open.focus();
    return self.clients.openWindow(target);
  })());
});
