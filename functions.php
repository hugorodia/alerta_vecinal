<?php
require 'vendor/autoload.php';

use Pusher\Pusher;

$pusher = new Pusher(
    getenv('2c963fd334205de07cf7'),
    getenv('01b70984e3e2a14351e1'),
    getenv('1941024'),
    ['cluster' => getenv('us2'), 'useTLS' => true]
);

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $action = $data['action'] ?? '';

    if ($action === 'registrarAlerta') {
        try {
            $tipo = $data['tipo'] ?? 'unknown';
            $latitud = $data['latitud'] ?? null;
            $longitud = $data['longitud'] ?? null;
            $radio = $data['radio'] ?? 5;

            if ($latitud === null || $longitud === null) {
                throw new Exception('Faltan coordenadas');
            }

            $alertData = [
                'tipo' => $tipo,
                'latitud' => floatval($latitud),
                'longitud' => floatval($longitud),
                'radio' => $radio,
                'fecha' => date('Y-m-d H:i:s')
            ];

            $pusher->trigger('alert-channel', 'new-alert', $alertData);

            echo json_encode(['success' => true, 'alert' => $alertData]);
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
    } elseif ($action === 'obtenerAlertasCercanas') {
        echo json_encode(['success' => true, 'alerts' => []]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Acción no válida']);
    }
} else {
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    http_response_code(405);
}