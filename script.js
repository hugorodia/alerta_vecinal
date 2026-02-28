(function() {
    "use strict";
    console.log('DOM cargado, inicializando...');

    const OPEN_CAGE_API_KEY = '152807e980154a4ab1ae6c9cdc7a4953';
    let map, userMarker, historyMarkers = [], historyVisible = false, alertCount = 0, pusher, channel;
    const alertSound = new Audio('/public/alert.wav');

    const unlockAudio = () => {
        alertSound.play().then(() => {
            console.log('Audio desbloqueado con éxito');
            alertSound.pause();
            alertSound.currentTime = 0;
        }).catch(error => {
            console.error('Error al desbloquear audio:', error);
        });
        document.removeEventListener('click', unlockAudio);
    };
    document.addEventListener('click', unlockAudio);

    function initMap(lat = -34.6037, lng = -58.3816) {
        console.log('Inicializando mapa con lat:', lat, 'lng:', lng);
        if (typeof L === 'undefined') {
            console.error('Leaflet no está cargado');
            return;
        }
        if (map) {
            map.setView([lat, lng], 13);
            return;
        }
        map = L.map('map').setView([lat, lng], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
        setupPusher();
        updateUserLocation();
        setInterval(updateUserLocation, 300000);
    }

    function updateUserLocation() {
        navigator.geolocation.getCurrentPosition(
            pos => {
                const { latitude, longitude } = pos.coords;
                console.log('Geolocalización obtenida:', latitude, longitude);
                map.setView([latitude, longitude], 13);
                if (!userMarker) {
                    userMarker = L.marker([latitude, longitude]).addTo(map).bindPopup("Tu ubicación").openPopup();
                } else {
                    userMarker.setLatLng([latitude, longitude]);
                }
                fetchNearbyAlerts(latitude, longitude, 5);
            },
            err => {
                console.log('Geolocalización falló o no permitida:', err.message);
                fetchNearbyAlerts(-34.6037, -58.3816, 5);
            }
        );
    }

    function setupPusher() {
        pusher = new Pusher(window.PUSHER_KEY || '2c963fd334205de07cf7', { cluster: 'us2', encrypted: true });
        channel = pusher.subscribe('alert-channel');
        channel.bind('new-alert', data => {
            console.log('Alerta recibida:', data);
            const notificationsEnabled = document.getElementById('enable-notifications')?.checked || false;
            if (notificationsEnabled && userMarker) {
                const userLocation = userMarker.getLatLng();
                const distance = calculateDistance(userLocation.lat, userLocation.lng, data.latitud, data.longitud);
                if (distance <= 5) {
                    addAlertToMapWithAnimation(data);
                    showNotification(data);
                    playAlertSound();
                }
            } else {
                addAlertToMapWithAnimation(data);
            }
            updateAlertCount();
        });
        pusher.connection.bind('connected', () => console.log('Conectado a Pusher'));
        pusher.connection.bind('disconnected', () => console.log('Desconectado de Pusher'));
    }

    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    async function sendAlert(tipo, latitud, longitud) {
        const userId = 'anonymous-test';

        try {
            const response = await fetch('https://us-central1-alerta-vecinal-a8bef.cloudfunctions.net/registrarAlerta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tipo, latitud, longitud, user_id: userId })
            });

            if (!response.ok) throw new Error('Respuesta no OK: ' + response.status);

            const result = await response.json();
            if (result.success) {
                console.log('Alerta enviada con éxito:', result.alert);
                if (result.alert && result.alert.latitud && result.alert.longitud) {
                    addAlertToMapWithAnimation(result.alert);
                    addRadarAnimation(latitud, longitud, 1.25);
                }
            } else {
                alert("Error: " + (result.error || 'Desconocido'));
            }
        } catch (err) {
            console.error('Error al enviar alerta:', err);
            alert("Error al conectar con el servidor");
        }
    }

    function addAlertToMapWithAnimation(alert) {
        if (!alert.latitud || !alert.longitud) return console.warn('Alerta sin coordenadas');
        const marker = L.marker([alert.latitud, alert.longitud], {
            icon: L.icon({ iconUrl: '/alert-icon.png', iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32] })
        }).addTo(map);
        const popupContent = `
            <div id="alert-popup-${alert.id}" style="display: flex; flex-direction: column; align-items: center;">
                <video id="alert-video-${alert.id}" src="/alert-animation.mp4" autoplay loop style="width: 100%; max-width: 150px; margin-bottom: 10px;"></video>
                <div style="text-align: center;">
                    <b>Tipo:</b> ${alert.tipo}<br>
                    <b>Fecha:</b> ${new Date(alert.fecha).toLocaleString()}<br>
                    <b>Enviado por:</b> ${alert.nombre} ${alert.apellido}<br>
                </div>
            </div>
        `;
        marker.bindPopup(popupContent).openPopup();
        marker.on('popupopen', () => {
            setTimeout(() => marker.closePopup(), 86400000);
        });
    }

    function addRadarAnimation(latitud, longitud, maxRadius) {
        let currentRadius = 0;
        const radarCircle = L.circle([latitud, longitud], {
            color: '#ffff00',
            fillColor: '#ffff00',
            fillOpacity: 0.45,
            radius: currentRadius,
            weight: 2.5
        }).addTo(map);

        const animation = setInterval(() => {
            currentRadius += 65;
            if (currentRadius >= maxRadius * 1000) {
                clearInterval(animation);
                let opacity = 0.45;
                const fadeOut = setInterval(() => {
                    opacity -= 0.025;
                    if (opacity <= 0) {
                        clearInterval(fadeOut);
                        map.removeLayer(radarCircle);
                    } else {
                        radarCircle.setStyle({ fillOpacity: opacity });
                    }
                }, 80);
            } else {
                radarCircle.setRadius(currentRadius);
            }
        }, 65);
    }

    async function fetchNearbyAlerts(latitud, longitud, radio) {
        const response = await fetch('https://alerta-vecinal.onrender.com/functions.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'obtenerAlertasCercanas', latitud, longitud, radio })
        });
        const result = await response.json();
        if (result.success) result.alerts.forEach(addAlertToMapWithAnimation);
    }

    function showNotification(alert) {
        console.log('Mostrando notificación para alerta:', alert);
        const notificationDiv = document.createElement('div');
        notificationDiv.id = `notification-${alert.id}`;
        notificationDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: white;
            border: 1px solid #ccc;
            padding: 10px;
            z-index: 1000;
            max-width: 300px;
        `;
        notificationDiv.innerHTML = `
            <b>Nueva Alerta</b><br>
            <b>Tipo:</b> ${alert.tipo}<br>
            <b>Fecha:</b> ${new Date(alert.fecha).toLocaleString()}<br>
            <b>Enviado por:</b> ${alert.nombre} ${alert.apellido}<br>
            <video src="/alert-animation.mp4" autoplay style="width: 100%; max-width: 200px;"></video>
            <button onclick="this.parentElement.remove()">Cerrar</button>
        `;
        document.body.appendChild(notificationDiv);
        setTimeout(() => {
            if (notificationDiv) notificationDiv.remove();
        }, 86400000);
    }

    function playAlertSound() {
        console.log('Intentando reproducir alert.wav');
        alertSound.play()
            .then(() => console.log('Sonido reproducido con éxito'))
            .catch(error => console.error('Error al reproducir el sonido:', error.message));
    }

    function updateAlertCount() {
        alertCount++;
        const counter = document.getElementById('alert-counter') || document.createElement('span');
        counter.id = 'alert-counter';
        counter.textContent = alertCount;
        counter.style.cssText = 'background-color: red; color: white; border-radius: 50%; padding: 2px 6px; position: absolute; top: 10px; right: 10px;';
        if (!document.getElementById('alert-counter')) document.body.appendChild(counter);
    }

    const enableNotificationsCheckbox = document.getElementById('enable-notifications');
    if (enableNotificationsCheckbox) {
        const savedNotificationState = localStorage.getItem('enableNotifications');
        if (savedNotificationState !== null) {
            enableNotificationsCheckbox.checked = savedNotificationState === 'true';
        }
        enableNotificationsCheckbox.addEventListener('change', () => {
            localStorage.setItem('enableNotifications', enableNotificationsCheckbox.checked);
        });
    }

    if (!map) {
        initMap();
    }

    document.getElementById('send-alert-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const tipo = document.getElementById('alert-type').value;
        if (!userMarker) {
            console.log('userMarker no definido, actualizando ubicación');
            updateUserLocation();
            return alert("Habilita la geolocalización y vuelve a intentarlo.");
        }
        const { lat, lng } = userMarker.getLatLng();
        await sendAlert(tipo, lat, lng);
    });

    document.getElementById('show-history-btn')?.addEventListener('click', toggleAlertHistory);

    // ================== FCM - ALERTA VECINAL ==================
    const messaging = firebase.messaging();

    async function initFCM() {
      try {
        if ('Notification' in window && Notification.permission === 'default') {
          await Notification.requestPermission();
        }
        if (Notification.permission === 'granted') {
          const token = await messaging.getToken({
            vapidKey: 'BKi0PePqfD_mCV584TgC0Yb5llI9bcHe799ESxaNaQC2Z9hyFmQcDzrnsdN3hwklAlhqZjIS8kCWBE19aIKJ-so',
            serviceWorkerRegistration: await navigator.serviceWorker.ready
          });
          console.log('✅ Token FCM guardado correctamente:', token);
        }
      } catch (err) {
        console.error('Error initFCM:', err);
      }
    }

    initFCM();

    messaging.onMessage((payload) => {
      console.log('✅ Alerta recibida en primer plano:', payload);
      const data = payload.data || payload.notification || {};
      playAlertSound();
      addAlertToMapWithAnimation(data);
      showNotification(data);
      alert(`🚨 ¡ALERTA INMEDIATA!\n\nTipo: ${data.tipo}\nEnviado por: ${data.nombre || 'Anónimo'}`);
    });

})();
console.log('script.js cargado completamente');
