self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const options = {
    body:    data.body  ?? '',
    icon:    '/logo.png',
    badge:   '/favicon-96x96.png',
    tag:     data.tag   ?? 'elm-notification',
    vibrate: data.vibrate ?? [200, 100, 200],
    data:    {
      url: data.url ?? '/',
    },
    requireInteraction: true, // Keep notification visible until user acts
  };

  event.waitUntil(
    self.registration.showNotification(data.title ?? 'ElmApp', options)
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
