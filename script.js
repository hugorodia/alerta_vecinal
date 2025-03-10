document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM cargado, inicializando...');
    const OPEN_CAGE_API_KEY = '152807e980154a4ab1ae6c9cdc7a4953';
    let map, userMarker, historyMarkers = [], historyVisible = false, alertCount = 0;
    const alertSound = new Audio('/public/alert.wav');

    // Desbloquear audio con la primera interacción
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

        const pusher = new Pusher(window.PUSHER_KEY || '2c963fd334205de07cf7', { cluster: 'us2', encrypted: true });
        const channel = pusher.subscribe('alert-channel');
        channel.bind('new-alert', data => {
            console.log('Alerta recibida:', data);
            addAlertToMap(data);
            const localUserId = localStorage.getItem('user_id');
            const notificationsEnabled = document.getElementById('enable-notifications').checked;
            console.log('Notificaciones habilitadas:', notificationsEnabled);
            if (localUserId !== data.user_id && notificationsEnabled) {
                console.log('Usuario no es emisor y notificaciones habilitadas');
                if (userMarker) {
                    const userLocation = userMarker.getLatLng();
                    const distance = calculateDistance(userLocation.lat, userLocation.lng, data.latitud, data.longitud);
                    console.log('Distancia calculada:', distance, 'Radio:', data.radio);
                    if (distance <= data.radio) {
                        console.log('Dentro del radio, mostrando notificación, animación y sonido');
                        showNotification(data);
                        playAlertSound();
                    } else {
                        console.log('Fuera del radio, no se reproduce sonido ni animación');
                    }
                } else {
                    console.log('userMarker no definido, no se calcula distancia');
                }
            } else {
                console.log('Condición no cumplida: usuario es emisor o notificaciones deshabilitadas');
            }
            updateAlertCount();
        });

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
            addAlertToMap(result.alert);
            addRadarAnimation(latitud, longitud, radio);
        } else {
            alert("Error: " + result.error);
        }
    }

    function addAlertToMap(alert) {
        const marker = L.marker([alert.latitud, alert.longitud], {
            icon: L.icon({ iconUrl: '/alert-icon.png', iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32] })
        }).addTo(map);
        marker.bindPopup(`
            <b>Tipo:</b> ${alert.tipo}<br>
            <b>Radio:</b> ${alert.radio} km<br>
            <b>Fecha:</b> ${new Date(alert.fecha).toLocaleString()}<br>
            <b>Enviado por:</b> ${alert.nombre} ${alert.apellido}<br>
            ${localStorage.getItem('user_id') == alert.user_id ? `<button id="delete-btn-${alert.id}">Eliminar</button>` : ''}
        `).openPopup();
        marker.on('popupopen', () => {
            document.getElementById(`delete-btn-${alert.id}`)?.addEventListener('click', () => deleteAlert(alert.id));
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
        if (result.success) result.alerts.forEach(addAlertToMap);
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
        if (Notification.permission === 'granted') {
            new Notification('Nueva Alerta', {
                body: `Tipo: ${alert.tipo}\nFecha: ${new Date(alert.fecha).toLocaleString()}\nEnviado por: ${alert.nombre} ${alert.apellido}`,
                icon: '/public/favicon.ico'
            });
        }
        showAlertAnimation();
    }

    function showAlertAnimation() {
        let alertVideo = document.getElementById('alert-video');
        if (!alertVideo) {
            alertVideo = document.createElement('video');
            alertVideo.id = 'alert-video';
            alertVideo.src = '/alert-animation.mp4';
            alertVideo.autoplay = true;
            alertVideo.loop = false;
            alertVideo.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: 1000;
                max-width: 80%;
                max-height: 80%;
            `;
            document.body.appendChild(alertVideo);
        } else {
            alertVideo.currentTime = 0;
            alertVideo.play();
        }
        alertVideo.onended = () => {
            alertVideo.style.display = 'none';
        };
        alertVideo.style.display = 'block';
    }

    function playAlertSound() {
        alertSound.play().catch(error => {
            console.error('Error al reproducir el sonido:', error);
        });
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