importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCBP-fPS1HZOnblNKRNInutcwcjL0DpvOw",
  authDomain: "alerta-vecinal-a8bef.firebaseapp.com",
  projectId: "alerta-vecinal-a8bef",
  storageBucket: "alerta-vecinal-a8bef.firebasestorage.app",
  messagingSenderId: "479895936339",
  appId: "1:479895936339:web:e8c1abb4e4d345fb91d5a6"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('Alerta recibida en segundo plano / cerrada:', payload);

  const notificationTitle = '🚨 ¡ALERTA VECINAL!';
  const notificationOptions = {
    body: `${payload.data?.tipo || 'Alerta'} cerca tuyo\nEnviado por: ${payload.data?.nombre || 'Usuario'}`,
    icon: '/alert-icon.png',
    badge: '/alert-icon.png',
    vibrate: [500, 200, 500, 200, 500],  // Vibración fuerte para llamar atención
    tag: 'alerta-vecinal',
    renotify: true,
    requireInteraction: true,  // Mantiene la notificación visible hasta que la toques
    data: payload.data || {}   // Datos para abrir la alerta al tocar
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
