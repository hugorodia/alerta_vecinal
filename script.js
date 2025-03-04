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
                    // Cargar alertas cercanas después de obtener la posición
                    fetchNearbyAlerts(latitude, longitude, 10); // Ajusta el radio si quieres
                },
                () => {
                    alert("No se pudo obtener tu ubicación. Usando ubicación por defecto.");
                    // Opcional: cargar alertas con ubicación por defecto
                    fetchNearbyAlerts(lat, lng, 10);
                }
            );
        } else {
            // Si no hay geolocalización, usar ubicación por defecto
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
                alert("Error al enviar la alerta: " + result.error);
            }
        } catch (error) {
            console.error("Error al enviar la alerta:", error);
            alert("Ocurrió un error al enviar la alerta. Por favor, intenta nuevamente.");
        }
    }

    function addAlertToMap(alert) {
        const marker = L.marker([alert.latitud, alert.longitud]).addTo(map);
        marker.bindPopup(`
            <b>Tipo:</b> ${alert.tipo}<br>
            <b>Radio:</b> ${alert.radio} km<br>
            <b>Fecha:</b> ${new Date(alert.fecha).toLocaleString()}
        `).openPopup();
    }

    async function fetchNearbyAlerts(latitud, longitud, radio) {
        const url = 'functions.php';
        try {
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
                })
            });

            const result = await response.json();
            if (result.success) {
                result.alerts.forEach(addAlertToMap);
            } else {
                alert("Error al obtener alertas cercanas: " + result.error);
            }
        } catch (error) {
            console.error("Error al obtener alertas cercanas:", error);
            alert("Ocurrió un error al obtener alertas cercanas. Por favor, intenta nuevamente.");
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
});