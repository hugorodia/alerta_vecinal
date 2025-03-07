document.addEventListener('DOMContentLoaded', () => {
    const OPEN_CAGE_API_KEY = '152807e980154a4ab1ae6c9cdc7a4953';
    let map, userMarker, historyMarkers = [], historyVisible = false, alertCount = 0;

    function initMap(lat = -34.6037, lng = -58.3816) {
        if (!map) {
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

        // Restaurar estado del checkbox desde localStorage
        const enableNotifications = document.getElementById('enable-notifications');
        if (localStorage.getItem('notificationsEnabled') === 'true') {
            enableNotifications.checked = true;
        }
        enableNotifications.addEventListener('change', () => {
            localStorage.setItem('notificationsEnabled', enableNotifications.checked);
        });
    }

    async function sendAlert(tipo, latitud, longitud, radio) {
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
            <button id="delete-btn-${alert.id}">Eliminar</button>
        `;
        marker.bindPopup(popupContent).openPopup();
        marker.on('popupopen', () => {
            document.getElementById(`delete-btn-${alert.id}`).addEventListener('click', () => {
                deleteAlert(alert.id);
            });
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
                alert("Error al obtener alertas cercanas: " + result.error);
            }
        } catch (error) {
            console.error("Error al obtener alertas cercanas:", error);
            if (error.name === 'AbortError') {
                alert("La carga de alertas tomó demasiado tiempo. Por favor, recarga la página.");
            } else {
                alert("Ocurrió un error al obtener alertas cercanas. Por favor, intenta nuevamente.");
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
        const historyBtn = document.getElementById('show-history-btn');
        if (!historyVisible) {
            const url = 'functions.php';
            const fechaInicio = document.getElementById('history-start').value;
            const fechaFin = document.getElementById('history-end').value;
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
        console.log("Intentando mostrar notificación...");
        if ('Notification' in window) {
            if (Notification.permission === 'granted') {
                console.log("Notificación permitida, disparando:", alert);
                const notification = new Notification('Nueva Alerta', {
                    body: `Tipo: ${alert.tipo}\nFecha: ${new Date(alert.fecha).toLocaleString()}`,
                    icon: '/public/favicon.ico'
                });
                console.log("Notificación enviada:", notification);
            } else if (Notification.permission !== 'denied') {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        console.log("Permiso concedido ahora, disparando notificación");
                        const notification = new Notification('Nueva Alerta', {
                            body: `Tipo: ${alert.tipo}\nFecha: ${new Date(alert.fecha).toLocaleString()}`,
                            icon: '/public/favicon.ico'
                        });
                        console.log("Notificación enviada tras permiso:", notification);
                    } else {
                        console.log("Permiso denegado por el usuario");
                    }
                });
            } else {
                console.log("Notificaciones denegadas previamente");
            }
        } else {
            console.log("API de Notificaciones no soportada en este navegador");
        }

        if (document.getElementById('enable-notifications').checked && 'vibrate' in navigator) {
            console.log("Vibrando...");
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
            navigator.setAppBadge(alertCount).then(() => {
                console.log("Badge actualizado a:", alertCount);
            }).catch(err => console.log("Error al setear badge:", err));
        }
    }

    const form = document.getElementById('send-alert-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const tipo = document.getElementById('alert-type')?.value;
            const radio = parseInt(document.getElementById('alert-radius')?.value, 10);
            if (!userMarker) {
                alert("No se ha detectado tu ubicación. Por favor, habilita la geolocación.");
                return;
            }
            const latitud = userMarker.getLatLng().lat;
            const longitud = userMarker.getLatLng().lng;
            await sendAlert(tipo, latitud, longitud, radio);
        });
    }

    document.getElementById('show-history-btn').addEventListener('click', toggleAlertHistory);

    initMap();
});