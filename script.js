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
            console.log('Mapa ya inicializado, no se vuelve a llamar initMap');
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
                const userId = localStorage.getItem('user_id');
                if (userId) {
                    fetch('https://alerta-vecinal.onrender.com/functions.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'updateLocation', user_id: userId, latitud: latitude, longitud: longitude })
                    }).then(response => response.json()).then(result => {
                        if (result.success) console.log('Ubicación actualizada en servidor');
                    });
                }
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
            const localUserId = localStorage.getItem('user_id');
            if (!localUserId) return console.log('No hay user_id local, ignorando alerta');
            const notificationsEnabled = document.getElementById('enable-notifications')?.checked || false;
            if (localUserId !== data.user_id && notificationsEnabled && userMarker) {
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
        const userId = localStorage.getItem('user_id');
        if (!userId) return alert("Debes iniciar sesión.");
        try {
            const response = await fetch('https://us-central1-alerta-vecinal-a8bef.cloudfunctions.net/registrarAlerta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tipo, latitud, longitud, user_id: userId })
            });
            const result = await response.json();
            if (result.success) {
                console.log('Alerta enviada con éxito:', result.alert);
                if (result.alert && result.alert.latitud && result.alert.longitud) {
                    addAlertToMapWithAnimation(result.alert);
                    addRadarAnimation(latitud, longitud, 5);
                } else {
                    console.warn('Alerta enviada, pero alert incompleto');
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
                    ${localStorage.getItem('user_id') == alert.user_id ? `<button id="delete-btn-${alert.id}">Eliminar</button>` : ''}
                </div>
            </div>
        `;
        marker.bindPopup(popupContent).openPopup();
        marker.on('popupopen', () => {
            document.getElementById(`delete-btn-${alert.id}`)?.addEventListener('click', () => deleteAlert(alert.id));
            setTimeout(() => marker.closePopup(), 86400000);
        });
    }

   function addRadarAnimation(latitud, longitud, radius) {
    const radarCircle = L.circle([latitud, longitud], {
        color: '#ffff00',
        fillColor: '#ffff00',
        fillOpacity: 0.4,
        radius: radius * 1000,  // 5 km = 5000 metros
        weight: 2
    }).addTo(map);

    let opacity = 0.4;
    const animation = setInterval(() => {
        opacity -= 0.03;  // más lento para que no desaparezca rápido
        if (opacity <= 0) {
            clearInterval(animation);
            map.removeLayer(radarCircle);
        } else {
            radarCircle.setStyle({ fillOpacity: opacity });
        }
    }, 300);  // cada 300 ms en vez de 200
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

    async function deleteAlert(alertId) {
        const userId = localStorage.getItem('user_id');
        const response = await fetch('https://alerta-vecinal.onrender.com/functions.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'eliminarAlerta', id: alertId, user_id: userId })
        });
        const result = await response.json();
        if (result.success) location.reload();
        else alert("Error: " + result.error);
    }

    async function toggleAlertHistory() {
        const userId = localStorage.getItem('user_id');
        if (!userId) return alert("Debes iniciar sesión.");
        const historyBtn = document.getElementById('show-history-btn');
        if (!historyVisible) {
            const fechaInicio = document.getElementById('history-start')?.value;
            const fechaFin = document.getElementById('history-end')?.value;
            const body = { action: 'obtenerHistorialAlertas' };
            if (fechaInicio && fechaFin) {
                body.fechaInicio = fechaInicio + ' 00:00:00';
                body.fechaFin = fechaFin + ' 23:59:59';
            }
            const response = await fetch('https://alerta-vecinal.onrender.com/functions.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const result = await response.json();
            if (result.success) {
                historyMarkers.forEach(marker => map.removeLayer(marker));
                historyMarkers = [];
                result.alerts.forEach(alert => {
                    const marker = L.marker([alert.latitud, alert.longitud], {
                        icon: L.icon({ iconUrl: '/alert-icon.png', iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32] })
                    }).addTo(map);
                    marker.bindPopup(`
                        <b>Tipo:</b> ${alert.tipo}<br>
                        <b>Fecha:</b> ${new Date(alert.fecha).toLocaleString()}<br>
                        <b>Enviado por:</b> ${alert.nombre} ${alert.apellido}<br>
                        <b>Visible:</b> ${alert.visible ? 'Sí' : 'No'}
                    `);
                    historyMarkers.push(marker);
                });
                historyBtn.textContent = 'Ocultar Historial';
                historyVisible = true;
                document.getElementById('history-start').disabled = true;
                document.getElementById('history-end').disabled = false;
            }
        } else {
            historyMarkers.forEach(marker => map.removeLayer(marker));
            historyMarkers = [];
            historyBtn.textContent = 'Ver Historial';
            historyVisible = false;
            document.getElementById('history-start').disabled = false;
            document.getElementById('history-end').disabled = false;
        }
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

    const urlParams = new URLSearchParams(window.location.search);
    const sessionToken = urlParams.get('session_token');
    const verifyAction = urlParams.get('action');
    const verifyToken = urlParams.get('token');
    console.log('URL actual:', window.location.href);

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

    if (verifyAction === 'verify' && verifyToken) {
        fetch(`https://alerta-vecinal.onrender.com/functions.php?action=verify&token=${verifyToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        })
        .then(response => response.json())
        .then(result => {
            if (result.success && result.session_token) {
                fetch('https://alerta-vecinal.onrender.com/functions.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'auto_login', session_token: result.session_token })
                })
                .then(response => response.json())
                .then(autoLoginResult => {
                    if (autoLoginResult.success) {
                        localStorage.setItem('user_id', autoLoginResult.user_id);
                        document.querySelector('.auth-form').style.display = 'none';
                        document.getElementById('logout-btn').style.display = 'block';
                        window.history.replaceState({}, document.title, '/');
                        initMap(); // Fuerza mapa después de verificación
                    } else {
                        alert('Error en auto-login: ' + autoLoginResult.error);
                    }
                });
            } else {
                alert('Error en verificación: ' + result.error);
            }
        });
    } else if (sessionToken) {
        fetch('https://alerta-vecinal.onrender.com/functions.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'auto_login', session_token: sessionToken })
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                localStorage.setItem('user_id', result.user_id);
                document.querySelector('.auth-form').style.display = 'none';
                document.getElementById('logout-btn').style.display = 'block';
                window.history.replaceState({}, document.title, '/');
                initMap(); // Fuerza mapa después de auto-login
            } else {
                alert('Error en auto-login: ' + result.error);
            }
        });
    }

    const userId = localStorage.getItem('user_id');
    const registerFormSection = document.querySelector('.auth-form');
    const logoutBtn = document.getElementById('logout-btn');

    if (!map) {
        initMap();
    }

    if (userId) {
        registerFormSection.style.display = 'none';
        logoutBtn.style.display = 'block';
    } else {
        registerFormSection.style.display = 'block';
        logoutBtn.style.display = 'none';
    }

    document.getElementById('register-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const nombre = document.getElementById('nombre').value;
        const apellido = document.getElementById('apellido').value;
        const password = document.getElementById('password').value;
        const response = await fetch('https://alerta-vecinal.onrender.com/functions.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'register', email, nombre, apellido, password })
        });
        const result = await response.json();
        alert(result.success ? result.message : "Error: " + result.error);
    });

    document.getElementById('login-btn')?.addEventListener('click', async () => {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const response = await fetch('https://alerta-vecinal.onrender.com/functions.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'login', email, password })
        });
        const result = await response.json();
        if (result.success) {
            localStorage.setItem('user_id', result.user_id);
            document.querySelector('.auth-form').style.display = 'none';
            document.getElementById('logout-btn').style.display = 'block';
            console.log('Login exitoso, user_id:', result.user_id);
            initMap(); // Fuerza mapa después de login
        } else {
            alert("Error: " + result.error);
        }
    });

    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        const response = await fetch('https://alerta-vecinal.onrender.com/functions.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'logout' })
        });
        const result = await response.json();
        if (result.success) {
            localStorage.removeItem('user_id');
            document.querySelector('.auth-form').style.display = 'block';
            document.getElementById('logout-btn').style.display = 'none';
            if (map) map.remove();
            map = null;
            initMap(); // Fuerza reinicio del mapa después de logout
        }
    });

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
          const userId = localStorage.getItem('user_id');
          if (token && userId) {
            fetch('https://alerta-vecinal.onrender.com/functions.php', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'saveFcmToken', user_id: userId, token })
            });
            console.log('✅ Token FCM guardado correctamente');
          }
        }
      } catch (err) {
        console.error('Error initFCM:', err);
      }
    }

    // Llamar después de login exitoso
    document.getElementById('login-btn')?.addEventListener('click', async () => {
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const response = await fetch('https://alerta-vecinal.onrender.com/functions.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password })
      });
      const result = await response.json();
      if (result.success) {
        localStorage.setItem('user_id', result.user_id);
        document.querySelector('.auth-form').style.display = 'none';
        document.getElementById('logout-btn').style.display = 'block';
        console.log('Login exitoso, user_id:', result.user_id);
        initFCM();
        initMap(); // Fuerza mapa después de login
      } else {
        alert("Error: " + result.error);
      }
    });

    // Alerta en primer plano
    messaging.onMessage((payload) => {
      console.log('✅ Alerta recibida en primer plano:', payload);
      const data = payload.data || payload.notification || {};
      playAlertSound();
      addAlertToMapWithAnimation(data);
      showNotification(data);
      alert(`🚨 ¡ALERTA INMEDIATA!\n\nTipo: ${data.tipo}\nEnviado por: ${data.nombre || ''} ${data.apellido || ''}`);
    });

    // Login automático para pruebas (comentar cuando termines)
    if (!localStorage.getItem('user_id')) {
      const testEmail = 'prueba@test.com';
      const testPassword = '123456';
      fetch('https://alerta-vecinal.onrender.com/functions.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email: testEmail, password: testPassword })
      })
      .then(response => response.json())
      .then(result => {
        if (result.success) {
          localStorage.setItem('user_id', result.user_id);
          document.querySelector('.auth-form').style.display = 'none';
          document.getElementById('logout-btn').style.display = 'block';
          console.log('Login automático exitoso, user_id:', result.user_id);
          initFCM();
          initMap();
        }
      })
      .catch(err => console.error('Login automático falló:', err));
    }

})();
console.log('script.js cargado completamente');
