document.addEventListener('DOMContentLoaded', () => {
    const OPEN_CAGE_API_KEY = '152807e980154a4ab1ae6c9cdc7a4953';
    let map, userMarker, historyMarkers = [], historyVisible = false, alertCount = 0;

    function initMap(lat = -34.6037, lng = -58.3816) {
        if (!map) {
            const mapElement = document.getElementById('map');
            if (!mapElement) {
                console.error("Elemento con ID 'map' no encontrado en el HTML");
                return;
            }
            map = L.map('map').setView([lat, lng], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(map);
        }

        const pusher = new Pusher(window.PUSHER_KEY || '2c963fd334205de07cf7', {
            cluster: window.PUSHER_CLUSTER || 'us2',
            encrypted: true
        });
        const channel = pusher.subscribe('alert-channel');
        channel.bind('new-alert', function(data) {
            console.log("Nueva alerta recibida:", data);
            addAlertToMap(data);
            if (document.getElementById('enable-notifications').checked) {
                showNotification(data);
            }
            updateAlertCount();
        });

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    map.setView([latitude, longitude], 13);
                    if (userMarker) {
                        map.removeLayer(userMarker);
                    }
                    userMarker = L.marker([latitude, longitude]).addTo(map).bindPopup("Tu ubicación").openPopup();
                    fetchNearbyAlerts(latitude, longitude, 10);
                },
                () => {
                    alert("No se pudo obtener tu ubicación. Usando ubicación por defecto.");
                    fetchNearbyAlerts(lat, lng, 10);
                }
            );
        } else {
            alert("Geolocalización no soportada. Usando ubicación por defecto.");
            fetchNearbyAlerts(lat, lng, 10);
        }

        if ('Notification' in window && Notification.permission !== 'granted') {
            Notification.requestPermission().then(permission => {
                console.log("Estado del permiso de notificaciones:", permission);
            });
        }

        const enableNotifications = document.getElementById('enable-notifications');
        if (enableNotifications) {
            if (localStorage.getItem('notificationsEnabled') === 'true') {
                enableNotifications.checked = true;
            }
            enableNotifications.addEventListener('change', () => {
                localStorage.setItem('notificationsEnabled', enableNotifications.checked);
            });
        } else {
            console.warn("Elemento 'enable-notifications' no encontrado");
        }
    }

    async function sendAlert(tipo, latitud, longitud, radio) {
        const userId = localStorage.getItem('user_id');
        if (!userId) {
            alert("Para enviar alertas, primero debes registrarte e iniciar sesión.");
            return;
        }
        const url = 'functions.php';
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'registrarAlerta',
                    tipo,
                    latitud,
                    longitud,
                    radio
                })
            });

            const result = await response.json();
            if (result.success) {
                alert("Alerta enviada correctamente.");
                addAlertToMap(result.alert);
                addRadarAnimation(latitud, longitud, radio);
            } else {
                console.error("Error al enviar la alerta:", result.error);
                alert("Error al enviar la alerta: " + result.error);
            }
        } catch (error) {
            console.error("Error al enviar la alerta:", error);
            alert("Ocurrió un error al enviar la alerta. Por favor, intenta nuevamente.");
        }
    }

    function addAlertToMap(alert) {
        const alertIcon = L.icon({
            iconUrl: '/alert-icon.png',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        });
        const marker = L.marker([alert.latitud, alert.longitud], { icon: alertIcon }).addTo(map);
        const popupContent = document.createElement('div');
        popupContent.innerHTML = `
            <video width="128" height="128" autoplay loop muted>
                <source src="/alert-animation.mp4" type="video/mp4">
                Tu navegador no soporta video.
            </video>
            <br>
            <b>Tipo:</b> ${alert.tipo}<br>
            <b>Radio:</b> ${alert.radio} km<br>
            <b>Fecha:</b> ${new Date(alert.fecha).toLocaleString()}<br>
            <b>Enviado por:</b> ${alert.nombre} ${alert.apellido}<br>
            ${localStorage.getItem('user_id') && localStorage.getItem('user_id') == alert.user_id ? `<button id="delete-btn-${alert.id}">Eliminar</button>` : ''}
        `;
        marker.bindPopup(popupContent).openPopup();
        marker.on('popupopen', () => {
            const deleteBtn = document.getElementById(`delete-btn-${alert.id}`);
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    deleteAlert(alert.id);
                });
            }
        });
    }

    function addRadarAnimation(latitud, longitud, radio) {
        const radiusInMeters = radio * 1000;
        const radarCircle = L.circle([latitud, longitud], {
            color: '#ffff00',
            fillColor: '#ffff00',
            fillOpacity: 0.4,
            radius: radiusInMeters,
            weight: 2
        }).addTo(map);

        let opacity = 0.4;
        let scale = 1;
        const animation = setInterval(() => {
            opacity -= 0.05;
            scale += 0.1;
            if (opacity <= 0) {
                clearInterval(animation);
                map.removeLayer(radarCircle);
            } else {
                radarCircle.setStyle({ fillOpacity: opacity });
                radarCircle.setRadius(radiusInMeters * scale);
            }
        }, 200);
    }

    async function fetchNearbyAlerts(latitud, longitud, radio) {
        const url = 'functions.php';
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'obtenerAlertasCercanas',
                    latitud,
                    longitud,
                    radio
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const result = await response.json();
            if (result.success) {
                result.alerts.forEach(addAlertToMap);
            } else {
                console.error("Error al obtener alertas cercanas: " + result.error);
            }
        } catch (error) {
            console.error("Error al obtener alertas cercanas:", error);
            if (error.name === 'AbortError') {
                console.log("La carga de alertas tomó demasiado tiempo.");
            }
        }
    }

    async function deleteAlert(alertId) {
        try {
            const response = await fetch('functions.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'eliminarAlerta',
                    id: alertId
                })
            });
            const result = await response.json();
            if (result.success) {
                alert("Alerta eliminada del mapa.");
                location.reload();
            } else {
                alert("Error al eliminar: " + result.error);
            }
        } catch (error) {
            console.error("Error al eliminar alerta:", error);
            alert("Ocurrió un error al eliminar la alerta.");
        }
    }

    async function toggleAlertHistory() {
        if (!localStorage.getItem('user_id')) {
            alert("Para ver el historial, primero debes registrarte e iniciar sesión.");
            return;
        }
        const historyBtn = document.getElementById('show-history-btn');
        if (!historyBtn) {
            console.warn("Elemento 'show-history-btn' no encontrado");
            return;
        }
        if (!historyVisible) {
            const url = 'functions.php';
            const fechaInicio = document.getElementById('history-start')?.value;
            const fechaFin = document.getElementById('history-end')?.value;
            const body = { action: 'obtenerHistorialAlertas' };
            if (fechaInicio && fechaFin) {
                body.fechaInicio = fechaInicio + ' 00:00:00';
                body.fechaFin = fechaFin + ' 23:59:59';
            }

            try {
                const response = await fetch(url, {
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
                            icon: L.icon({
                                iconUrl: '/alert-icon.png',
                                iconSize: [32, 32],
                                iconAnchor: [16, 32],
                                popupAnchor: [0, -32]
                            })
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
                } else {
                    console.error("Error al obtener historial:", result.error);
                }
            } catch (error) {
                console.error("Error al cargar historial:", error);
            }
        } else {
            historyMarkers.forEach(marker => map.removeLayer(marker));
            historyMarkers = [];
            historyBtn.textContent = 'Ver Historial';
            historyVisible = false;
        }
    }

    function showNotification(alert) {
        if ('Notification' in window) {
            if (Notification.permission === 'granted') {
                new Notification('Nueva Alerta', {
                    body: `Tipo: ${alert.tipo}\nFecha: ${new Date(alert.fecha).toLocaleString()}\nEnviado por: ${alert.nombre} ${alert.apellido}`,
                    icon: '/public/favicon.ico'
                });
            } else if (Notification.permission !== 'denied') {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        new Notification('Nueva Alerta', {
                            body: `Tipo: ${alert.tipo}\nFecha: ${new Date(alert.fecha).toLocaleString()}\nEnviado por: ${alert.nombre} ${alert.apellido}`,
                            icon: '/public/favicon.ico'
                        });
                    }
                });
            }
        }
        if (document.getElementById('enable-notifications')?.checked && 'vibrate' in navigator) {
            navigator.vibrate([200, 100, 200]);
        }
    }

    function updateAlertCount() {
        alertCount++;
        const counter = document.getElementById('alert-counter') || document.createElement('span');
        counter.id = 'alert-counter';
        counter.textContent = alertCount;
        counter.style.backgroundColor = 'red';
        counter.style.color = 'white';
        counter.style.borderRadius = '50%';
        counter.style.padding = '2px 6px';
        counter.style.position = 'absolute';
        counter.style.top = '10px';
        counter.style.right = '10px';
        if (!document.getElementById('alert-counter')) {
            document.body.appendChild(counter);
        }
        if ('setAppBadge' in navigator) {
            navigator.setAppBadge(alertCount).catch(err => console.log("Error al setear badge:", err));
        }
    }

    // Verificación de login persistente al cargar la página
    const userId = localStorage.getItem('user_id');
    const registerForm = document.getElementById('register-form');
    const mapContainer = document.getElementById('map'); // Ajustado a 'map'
    const logoutBtn = document.getElementById('logout-btn');

    if (userId) {
        // Usuario logueado
        if (registerForm) registerForm.style.display = 'none';
        else console.warn("Elemento 'register-form' no encontrado");
        if (mapContainer) mapContainer.style.display = 'block';
        else console.error("Elemento 'map' no encontrado");
        if (logoutBtn) logoutBtn.style.display = 'block';
        else console.warn("Elemento 'logout-btn' no encontrado");
        initMap(); // Inicializa el mapa
    } else {
        // No logueado
        if (registerForm) registerForm.style.display = 'block';
        else console.warn("Elemento 'register-form' no encontrado");
        if (mapContainer) mapContainer.style.display = 'none';
        else console.error("Elemento 'map' no encontrado");
        if (logoutBtn) logoutBtn.style.display = 'none';
        else console.warn("Elemento 'logout-btn' no encontrado");
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const nombre = document.getElementById('nombre').value;
            const apellido = document.getElementById('apellido').value;
            const password = document.getElementById('password').value;
            try {
                const response = await fetch('functions.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'register', email, nombre, apellido, password })
                });
                const result = await response.json();
                if (result.success) {
                    alert(result.message);
                    document.getElementById('email').value = '';
                    document.getElementById('nombre').value = '';
                    document.getElementById('apellido').value = '';
                    document.getElementById('password').value = '';
                } else {
                    alert("Error al registrar: " + result.error);
                }
            } catch (error) {
                console.error("Error al registrar:", error);
                alert("Ocurrió un error al registrar.");
            }
        });

        document.getElementById('login-btn')?.addEventListener('click', async () => {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            console.log("Enviando login - Email:", email, "Password:", password); // Depuración
            try {
                const response = await fetch('functions.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'login', email, password })
                });
                const result = await response.json();
                if (result.success) {
                    localStorage.setItem('user_id', result.user_id);
                    if (registerForm) registerForm.style.display = 'none';
                    if (mapContainer) mapContainer.style.display = 'block';
                    if (logoutBtn) logoutBtn.style.display = 'block';
                    initMap(); // Inicializa el mapa tras login
                } else {
                    alert("Error al iniciar sesión: " + result.error);
                }
            } catch (error) {
                console.error("Error al iniciar sesión:", error);
                alert("Ocurrió un error al iniciar sesión.");
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('user_id');
            if (registerForm) registerForm.style.display = 'block';
            if (mapContainer) mapContainer.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'none';
            if (map) {
                map.remove(); // Limpia el mapa
                map = null; // Resetea la variable
            }
        });
    }

    const form = document.getElementById('send-alert-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const tipo = document.getElementById('alert-type').value;
            const radio = parseInt(document.getElementById('alert-radius').value, 10);
            if (!userMarker) {
                alert("No se ha detectado tu ubicación. Por favor, habilita la geolocación.");
                return;
            }
            const latitud = userMarker.getLatLng().lat;
            const longitud = userMarker.getLatLng().lng;
            await sendAlert(tipo, latitud, longitud, radio);
        });
    }

    document.getElementById('show-history-btn')?.addEventListener('click', toggleAlertHistory);
});