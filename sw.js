// sw.js
self.addEventListener('install', (event) => {
    console.log('Service Worker instalado');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker activado');
    self.clients.claim();
});

self.addEventListener('push', (event) => {
    const data = event.data.json();
    console.log('Push recibido:', data);
    const options = {
        body: `Tipo: ${data.tipo}\nFecha: ${new Date(data.fecha).toLocaleString()}`,
        icon: '/public/favicon.ico'
    };
    event.waitUntil(
        self.registration.showNotification('Nueva Alerta', options)
    );
});