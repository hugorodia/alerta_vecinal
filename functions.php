<?php
error_log("Antes de cargar autoload");
if (!file_exists('vendor/autoload.php')) {
    error_log("vendor/autoload.php no encontrado");
    echo json_encode(['success' => false, 'message' => 'Autoload no encontrado']);
    exit;
}
require 'vendor/autoload.php';

use Pusher\Pusher;

error_log("Iniciando functions.php - Versión pre-Neon con depuración");

$pusher = new Pusher(
    getenv('key') ?: 'missing_key',
    getenv('secret') ?: 'missing_secret',
    getenv('app_id') ?: 'missing_app_id',
    ['cluster' => getenv('cluster') ?: 'missing_cluster', 'useTLS' => true]
);
error_log("Pusher configurado con key: " . getenv('key'));

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
            error_log("Alerta enviada a Pusher: " . json_encode($alertData));

            echo json_encode(['success' => true, 'alert' => $alertData]);
        } catch (Exception $e) {
            error_log("Error al enviar alerta: " . $e->getMessage());
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