<?php
// functions.php - Lógica del backend para Render

require 'vendor/autoload.php';

use Pusher\Pusher;

// Configuración de Pusher desde variables de entorno
$pusher = new Pusher(
    getenv('PUSHER_KEY'),
    getenv('PUSHER_SECRET'),
    getenv('PUSHER_APP_ID'),
    ['cluster' => getenv('PUSHER_CLUSTER'), 'useTLS' => true]
);

// Manejar solicitudes POST
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json');
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

            // Enviar alerta vía Pusher
            $pusher->trigger('alert-channel', 'new-alert', $alertData);

            echo json_encode([
                'success' => true,
                'alert' => $alertData
            ]);
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
    } elseif ($action === 'obtenerAlertasCercanas') {
        // Sin base de datos, devolvemos un array vacío por ahora
        echo json_encode(['success' => true, 'alerts' => []]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Acción no válida']);
    }
} else {
    header('Content-Type: application/json', true, 405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
}