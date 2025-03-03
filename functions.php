<?php
require 'vendor/autoload.php';

use Pusher\Pusher;

// Conexión a Neon (PostgreSQL)
try {
    $dsn = "pgsql:host=" . getenv('DB_HOST') . ";dbname=" . getenv('DB_NAME') . ";user=" . getenv('DB_USER') . ";password=" . getenv('DB_PASS');
    $pdo = new PDO($dsn);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Error de conexión a la base de datos: ' . $e->getMessage()]);
    exit;
}

// Configuración de Pusher
$pusher = new Pusher(
    getenv('PUSHER_KEY'),
    getenv('PUSHER_SECRET'),
    getenv('PUSHER_APP_ID'),
    ['cluster' => getenv('PUSHER_CLUSTER'), 'useTLS' => true]
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

            $stmt = $pdo->prepare("INSERT INTO alertas (tipo, latitud, longitud, radio, fecha) VALUES (?, ?, ?, ?, NOW())");
            $stmt->execute([$tipo, $latitud, $longitud, $radio]);
            $alert_id = $pdo->lastInsertId('alertas_id_seq');

            $alertData = [
                'id' => $alert_id,
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
        try {
            $latitud = $data['latitud'] ?? null;
            $longitud = $data['longitud'] ?? null;
            $radio = $data['radio'] ?? 5;

            if ($latitud === null || $longitud === null) {
                throw new Exception('Faltan coordenadas');
            }

            $stmt = $pdo->prepare("
                SELECT id, tipo, latitud, longitud, radio, fecha,
                       (6371 * acos(cos(radians(?)) * cos(radians(latitud)) 
                       * cos(radians(longitud) - radians(?)) + sin(radians(?)) 
                       * sin(radians(latitud)))) AS distancia
                FROM alertas
                WHERE (6371 * acos(cos(radians(?)) * cos(radians(latitud)) 
                       * cos(radians(longitud) - radians(?)) + sin(radians(?)) 
                       * sin(radians(latitud)))) <= ?
                ORDER BY fecha DESC
            ");
            $stmt->execute([$latitud, $longitud, $latitud, $latitud, $longitud, $latitud, $radio]);
            $alerts = $stmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode(['success' => true, 'alerts' => $alerts]);
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
    } else {
        echo json_encode(['success' => false, 'error' => 'Acción no válida']);
    }
} else {
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    http_response_code(405);
}