document.addEventListener('DOMContentLoaded', () => {
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
        map = L.map('map').setView([lat, lng], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        setupPusher();

        setInterval(() => {
            console.log('Verificando conexión con Pusher...');
            if (!pusher || pusher.connection.state !== 'connected') {
                console.log('Reconectando Pusher...');
                if (pusher) pusher.disconnect();
                setupPusher();
            } else {
                console.log('Conexión con Pusher sigue activa');
            }
        }, 300000); // Cada 5 minutos

        navigator.geolocation.getCurrentPosition(
            pos => {
                const { latitude, longitude } = pos.coords;
                console.log('Geolocalización obtenida:', latitude, longitude);
                map.setView([latitude, longitude], 13);
                userMarker = L.marker([latitude, longitude]).addTo(map).bindPopup("Tu ubicación").openPopup();
                fetchNearbyAlerts(latitude, longitude, 10);
            },
            err => {
                console.log('Geolocalización falló o no permitida:', err.message);
                fetchNearbyAlerts(lat, lng, 10);
            }
        );
    }

    function setupPusher() {
        pusher = new Pusher(window.PUSHER_KEY || '2c963fd334205de07cf7', { cluster: 'us2', encrypted: true });
        channel = pusher.subscribe('alert-channel');
        channel.bind('new-alert', data => {
            console.log('Alerta recibida:', data);
            addAlertToMapWithAnimation(data);
            const localUserId = localStorage.getItem('user_id');
            const notificationsEnabled = document.getElementById('enable-notifications')?.checked || false;
            console.log('Local User ID:', localUserId, 'Alert User ID:', data.user_id);
            console.log('Notificaciones habilitadas:', notificationsEnabled);
            if (!localUserId) {
                console.log('No hay user_id local, usuario no autenticado');
                return;
            }
            if (localUserId !== data.user_id && notificationsEnabled) {
                console.log('Usuario no es emisor y notificaciones habilitadas');
                if (userMarker) {
                    const userLocation = userMarker.getLatLng();
                    const distance = calculateDistance(userLocation.lat, userLocation.lng, data.latitud, data.longitud);
                    console.log('Ubicación del usuario:', userLocation);
                    console.log('Distancia calculada:', distance, 'Radio:', data.radio);
                    if (distance <= data.radio) {
                        console.log('Dentro del radio, mostrando notificación y reproduciendo sonido');
                        showNotification(data);
                        playAlertSound();
                    } else {
                        console.log('Fuera del radio, no se reproduce sonido ni animación');
                    }
                } else {
                    console.log('userMarker no definido, intentando obtener geolocalización nuevamente');
                    navigator.geolocation.getCurrentPosition(
                        pos => {
                            const { latitude, longitude } = pos.coords;
                            userMarker = L.marker([latitude, longitude]).addTo(map).bindPopup("Tu ubicación");
                            const distance = calculateDistance(latitude, longitude, data.latitud, data.longitud);
                            if (distance <= data.radio) {
                                console.log('Geolocalización recuperada, dentro del radio, reproduciendo sonido');
                                showNotification(data);
                                playAlertSound();
                            }
                        },
                        err => console.error('No se pudo recuperar geolocalización:', err.message)
                    );
                }
            } else {
                console.log('Condición no cumplida: usuario es emisor o notificaciones deshabilitadas');
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

    async function sendAlert(tipo, latitud, longitud, radio) {
        const userId = localStorage.getItem('user_id');
        if (!userId) return alert("Debes iniciar sesión.");
        const response = await fetch('https://alerta-vecinal.onrender.com/functions.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'registrarAlerta', tipo, latitud, longitud, radio, user_id: userId })
        });
        const result = await response.json();
        if (result.success) {
            console.log('Alerta enviada con éxito:', result.alert);
            addAlertToMapWithAnimation(result.alert);
            addRadarAnimation(latitud, longitud, radio);
        } else {
            alert("Error: " + result.error);
        }
    }

    function addAlertToMapWithAnimation(alert) {
        const marker = L.marker([alert.latitud, alert.longitud], {
            icon: L.icon({ iconUrl: '/alert-icon.png', iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32] })
        }).addTo(map);
        const popupContent = `
            <div id="alert-popup-${alert.id}" style="display: flex; flex-direction: column; align-items: center;">
                <video id="alert-video-${alert.id}" src="/alert-animation.mp4" autoplay loop style="width: 100%; max-width: 150px; margin-bottom: 10px;"></video>
                <div style="text-align: center;">
                    <b>Tipo:</b> ${alert.tipo}<br>
                    <b>Radio:</b> ${alert.radio} km<br>
                    <b>Fecha:</b> ${new Date(alert.fecha).toLocaleString()}<br>
                    <b>Enviado por:</b> ${alert.nombre} ${alert.apellido}<br>
                    ${localStorage.getItem('user_id') == alert.user_id ? `<button id="delete-btn-${alert.id}">Eliminar</button>` : ''}
                </div>
            </div>
        `;
        marker.bindPopup(popupContent).openPopup();
        marker.on('popupopen', () => {
            document.getElementById(`delete-btn-${alert.id}`)?.addEventListener('click', () => deleteAlert(alert.id));
            setTimeout(() => {
                marker.closePopup();
            }, 86400000);
        });
    }

    function addRadarAnimation(latitud, longitud, radio) {
        const radarCircle = L.circle([latitud, longitud], { color: '#ffff00', fillColor: '#ffff00', fillOpacity: 0.4, radius: radio * 1000, weight: 2 }).addTo(map);
        let opacity = 0.4, scale = 1;
        const animation = setInterval(() => {
            opacity -= 0.05;
            scale += 0.1;
            if (opacity <= 0) {
                clearInterval(animation);
                map.removeLayer(radarCircle);
            } else {
                radarCircle.setStyle({ fillOpacity: opacity });
                radarCircle.setRadius(radio * 1000 * scale);
            }
        }, 200);
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
                        <b>Radio:</b> ${alert.radio} km<br>
                        <b>Fecha:</b> ${new Date(alert.fecha).toLocaleString()}<br>
                        <b>Enviado por:</b> ${alert.nombre} ${alert.apellido}<br>
                        <b>Visible:</b> ${alert.visible ? 'Sí' : 'No'}
                    `);
                    historyMarkers.push(marker);
                });
                historyBtn.textContent = 'Ocultar Historial';
                historyVisible = true;
                document.getElementById('history-start').disabled = true;
                document.getElementById('history-end').disabled = true;
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
        console.log('Detectado intento de verificación con token:', verifyToken);
        fetch(`https://alerta-vecinal.onrender.com/functions.php?action=verify&token=${verifyToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        })
        .then(response => response.json())
        .then(result => {
            console.log('Respuesta de verificación:', result);
            if (result.success && result.session_token) {
                fetch('https://alerta-vecinal.onrender.com/functions.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'auto_login', session_token: result.session_token })
                })
                .then(response => response.json())
                .then(autoLoginResult => {
                    console.log('Respuesta de auto_login:', autoLoginResult);
                    if (autoLoginResult.success) {
                        localStorage.setItem('user_id', autoLoginResult.user_id);
                        document.querySelector('.auth-form').style.display = 'none';
                        document.getElementById('logout-btn').style.display = 'block';
                        window.history.replaceState({}, document.title, '/');
                        console.log('Auto-login exitoso con user_id:', autoLoginResult.user_id);
                    } else {
                        alert('Error en auto-login: ' + autoLoginResult.error);
                    }
                })
                .catch(error => console.error('Error en auto-login:', error));
            } else {
                alert('Error en verificación: ' + result.error);
            }
        })
        .catch(error => console.error('Error en verificación:', error));
    } else if (sessionToken) {
        console.log('Session token detectado:', sessionToken);
        fetch('https://alerta-vecinal.onrender.com/functions.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'auto_login', session_token: sessionToken })
        })
        .then(response => response.json())
        .then(result => {
            console.log('Respuesta de auto_login:', result);
            if (result.success) {
                localStorage.setItem('user_id', result.user_id);
                document.querySelector('.auth-form').style.display = 'none';
                document.getElementById('logout-btn').style.display = 'block';
                window.history.replaceState({}, document.title, '/');
                console.log('Auto-login exitoso con user_id:', result.user_id);
            } else {
                alert('Error en auto-login: ' + result.error);
            }
        })
        .catch(error => console.error('Error en fetch:', error));
    } else {
        console.log('No se detectó session_token ni intento de verificación en la URL');
    }

    const userId = localStorage.getItem('user_id');
    const registerFormSection = document.querySelector('.auth-form');
    const logoutBtn = document.getElementById('logout-btn');

    console.log('Llamando a initMap...');
    initMap();

    if (userId && !sessionToken && !verifyToken) {
        registerFormSection.style.display = 'none';
        logoutBtn.style.display = 'block';
    } else if (!sessionToken && !verifyToken) {
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
            map.remove();
            initMap();
        }
    });

    document.getElementById('send-alert-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const tipo = document.getElementById('alert-type').value;
        const radio = parseInt(document.getElementById('alert-radius').value, 10);
        if (!userMarker) return alert("Habilita la geolocalización.");
        const { lat, lng } = userMarker.getLatLng();
        await sendAlert(tipo, lat, lng, radio);
    });

    document.getElementById('show-history-btn')?.addEventListener('click', toggleAlertHistory);
});

console.log('script.js cargado completamente');