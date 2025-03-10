document.addEventListener('DOMContentLoaded', () => {
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
        let opacity = 0.4, scale