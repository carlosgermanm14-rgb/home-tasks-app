self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  
  const title = data.title || 'Tareas del Hogar 🏠';
  const options = {
    body: data.body || 'Tienes tareas pendientes para hoy.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: data.url || '/',
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data || '/')
  );
});