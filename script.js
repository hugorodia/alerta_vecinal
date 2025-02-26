document.addEventListener('DOMContentLoaded', () => {
    const OPEN_CAGE_API_KEY = '152807e980154a4ab1ae6c9cdc7a4953'; // Reemplaza con tu clave de OpenCage
    let map, userMarker;

    // Inicializar el mapa
    function initMap(lat = -34.6037, lng = -58.3816) { // Buenos Aires como ubicación por defecto
        if (!map) {
            map = L.map('map').setView([lat, lng], 13);

            // Agregar capa de mapa de OpenStreetMap
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(map);
        }

        // Configuración de Pusher
const pusher = new Pusher('2c963fd334205de07cf7', {
    cluster: 'us2',
    encrypted: true
});

// Escuchar el canal de alertas
const channel = pusher.subscribe('alert-channel');
channel.bind('new-alert', function(data) {
    console.log("Nueva alerta recibida:", data);
    addAlertToMap(data);
});

        // Obtener ubicación del usuario
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    map.setView([latitude, longitude], 13);
                    if (userMarker) {
                        map.removeLayer(userMarker);
                    }
                    userMarker = L.marker([latitude, longitude]).addTo(map).bindPopup("Tu ubicación").openPopup();
                },
                () => {
                    alert("No se pudo obtener tu ubicación. Usando ubicación por defecto.");
                }
            );
        }
    }

    // Enviar alerta al backend
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

    // Añadir una alerta al mapa
    function addAlertToMap(alert) {
        const marker = L.marker([alert.latitud, alert.longitud]).addTo(map);
        marker.bindPopup(`
            <b>Tipo:</b> ${alert.tipo}<br>
            <b>Radio:</b> ${alert.radio} km<br>
            <b>Fecha:</b> ${new Date(alert.fecha).toLocaleString()}
        `).openPopup();
    }

    // Obtener alertas cercanas desde el backend
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

    // Manejar el envío del formulario de alertas
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

    // Inicializar el mapa al cargar la página
    initMap();

    // Obtener alertas cercanas al cargar la página
    if (userMarker) {
        const latitud = userMarker.getLatLng().lat;
        const longitud = userMarker.getLatLng().lng;
        const radio = 5; // Radio predeterminado en km
        fetchNearbyAlerts(latitud, longitud, radio);
    }
});