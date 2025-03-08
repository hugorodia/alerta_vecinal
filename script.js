document.addEventListener('DOMContentLoaded', () => {
    const OPEN_CAGE_API_KEY = '152807e980154a4ab1ae6c9cdc7a4953';
    let map, userMarker, historyMarkers = [], historyVisible = false, alertCount = 0;

    function initMap(lat = -34.6037, lng = -58.3816) {
        map = L.map('map').setView([lat, lng], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        const pusher = new Pusher(window.PUSHER_KEY || '2c963fd334205de07cf7', { cluster: 'us2', encrypted: true });
        const channel = pusher.subscribe('alert-channel');
        channel.bind('new-alert', data => {
            addAlertToMap(data);
            if (document.getElementById('enable-notifications').checked) showNotification(data);
            updateAlertCount();
        });

        navigator.geolocation.getCurrentPosition(
            pos => {
                const { latitude, longitude } = pos.coords;
                map.setView([latitude, longitude], 13);
                userMarker = L.marker([latitude, longitude]).addTo(map).bindPopup("Tu ubicación").openPopup();
                fetchNearbyAlerts(latitude, longitude, 10);
            },
            () => {
                fetchNearbyAlerts(lat, lng, 10);
            }
        );
    }

    async function sendAlert(tipo, latitud, longitud, radio) {
        const userId = localStorage.getItem('user_id');
        if (!userId) return alert("Debes iniciar sesión.");
        const response = await fetch('functions.php', {
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
        const response = await fetch('functions.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'obtenerAlertasCercanas', latitud, longitud, radio })
        });
        const result = await response.json();
        if (result.success) result.alerts.forEach(addAlertToMap);
    }

    async function deleteAlert(alertId) {
        const userId = localStorage.getItem('user_id');
        const response = await fetch('functions.php', {
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
            const response = await fetch('functions.php', {
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
    }

    function updateAlertCount() {
        alertCount++;
        const counter = document.getElementById('alert-counter') || document.createElement('span');
        counter.id = 'alert-counter';
        counter.textContent = alertCount;
        counter.style.cssText = 'background-color: red; color: white; border-radius: 50%; padding: 2px 6px; position: absolute; top: 10px; right: 10px;';
        if (!document.getElementById('alert-counter')) document.body.appendChild(counter);
    }

    // Login automático tras verificación
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('verified') === 'true' && urlParams.get('user_id')) {
        localStorage.setItem('user_id', urlParams.get('user_id'));
        window.history.replaceState({}, document.title, '/'); // Limpiar URL
    }

    const userId = localStorage.getItem('user_id');
    const registerFormSection = document.querySelector('.auth-form');
    const logoutBtn = document.getElementById('logout-btn');
    initMap();

    if (userId) {
        if (registerFormSection) registerFormSection.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'block';
    } else {
        if (registerFormSection) registerFormSection.style.display = 'block';
        if (logoutBtn) logoutBtn.style.display = 'none';
    }

    document.getElementById('register-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const nombre = document.getElementById('nombre').value;
        const apellido = document.getElementById('apellido').value;
        const password = document.getElementById('password').value;
        const response = await fetch('functions.php', {
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
        const response = await fetch('functions.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'login', email, password })
        });
        const result = await response.json();
        if (result.success) {
            localStorage.setItem('user_id', result.user_id);
            document.querySelector('.auth-form').style.display = 'none';
            document.getElementById('logout-btn').style.display = 'block';
        } else {
            alert("Error: " + result.error);
        }
    });

    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        const response = await fetch('functions.php', {
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