self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'ElmApp', {
      body:  data.body  ?? '',
      icon:  '/web-app-manifest-192x192.png',
      badge: '/favicon-96x96.png',
      tag:   data.tag   ?? 'elm-notification',
      data:  data.url   ? { url: data.url } : undefined,
      requireInteraction: false,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url;
  if (!url) return;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => c.url.includes(url));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
