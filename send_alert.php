<?php
require 'vendor/autoload.php'; // Carga Composer y Pusher

use Pusher\Pusher;

// Configura las credenciales de Pusher desde las variables de entorno
$options = [
    'cluster' => getenv('PUSHER_CLUSTER'),
    'useTLS' => true
];
$pusher = new Pusher(
    getenv('PUSHER_KEY'),
    getenv('PUSHER_SECRET'),
    getenv('PUSHER_APP_ID'),
    $options
);

// Obtiene los datos del formulario
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $alert_type = $_POST['alert-type'] ?? 'unknown';
    $alert_radius = $_POST['alert-radius'] ?? 5;

    // Datos para enviar a Pusher
    $data = [
        'type' => $alert_type,
        'radius' => $alert_radius,
        'timestamp' => time()
    ];

    // Publica el evento en el canal 'alerts'
    $pusher->trigger('alerts', 'new-alert', $data);

    // Responde con JSON
    header('Content-Type: application/json');
    echo json_encode(['status' => 'success', 'message' => 'Alerta enviada']);
} else {
    // Si no es POST, devuelve un error
    header('Content-Type: application/json', true, 405);
    echo json_encode(['status' => 'error', 'message' => 'Método no permitido']);
}