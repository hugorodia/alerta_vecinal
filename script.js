document.addEventListener('DOMContentLoaded', () => {
    const OPEN_CAGE_API_KEY = '152807e980154a4ab1ae6c9cdc7a4953';
    let map, userMarker;

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
            fetchAlertHistory(); // Actualizar historial al recibir nueva alerta
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
            } else {
                alert("Error al enviar la alerta: " . result.error);
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
                fetchAlertHistory(); // Actualizar historial tras eliminar
            } else {
                alert("Error al eliminar: " + result.error);
            }
        } catch (error) {
            console.error("Error al eliminar alerta:", error);
            alert("Ocurrió un error al eliminar la alerta.");
        }
    }

    async function fetchAlertHistory() {
        const url = 'functions.php';
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'obtenerHistorialAlertas' })
            });
            const result = await response.json();
            if (result.success) {
                const tbody = document.querySelector('#alert-table tbody');
                tbody.innerHTML = '';
                result.alerts.forEach(alert => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${alert.id}</td>
                        <td>${alert.tipo}</td>
                        <td>${new Date(alert.fecha).toLocaleString()}</td>
                        <td>${alert.visible ? 'Sí' : 'No'}</td>
                    `;
                    tbody.appendChild(row);
                });
            } else {
                console.error("Error al obtener historial:", result.error);
            }
        } catch (error) {
            console.error("Error al cargar historial:", error);
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

    initMap();
    fetchAlertHistory(); // Cargar historial al iniciar
});