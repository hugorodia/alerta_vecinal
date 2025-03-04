<?php
error_log("Antes de cargar autoload");
if (!file_exists('vendor/autoload.php')) {
    error_log("vendor/autoload.php no encontrado");
    echo json_encode(['success' => false, 'message' => 'Autoload no encontrado']);
    exit;
}
require 'vendor/autoload.php';

use Pusher\Pusher;

error_log("Iniciando functions.php - Versión con Neon");

// Configuración de Pusher
$pusher = new Pusher(
    getenv('key') ?: 'missing_key',
    getenv('secret') ?: 'missing_secret',
    getenv('app_id') ?: 'missing_app_id',
    ['cluster' => getenv('cluster') ?: 'missing_cluster', 'useTLS' => true]
);
error_log("Pusher configurado con key: " . getenv('key'));

// Conexión a Neon
$host = getenv('DB_HOST') ?: 'missing_host';
$dbname = getenv('DB_NAME') ?: 'missing_dbname';
$user = getenv('DB_USER') ?: 'missing_user';
$pass = getenv('DB_PASS') ?: 'missing_pass';
error_log("DB_HOST: '$host', DB_NAME: '$dbname', DB_USER: '$user', DB_PASS: '$pass'");

try {
    $dsn = "pgsql:host=$host;dbname=$dbname;user=$user;password=$pass";
    error_log("Intentando conectar con DSN: '$dsn'");
    $pdo = new PDO($dsn);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    error_log("Conexión a Neon exitosa");
} catch (PDOException $e) {
    error_log("Error de conexión a Neon: " . $e->getMessage());
    echo json_encode(['success' => false, 'error' => 'Error de conexión a Neon: ' . $e->getMessage()]);
    exit;
}

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

            // Insertar en la base de datos
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
            error_log("Alerta registrada y enviada a Pusher: " . json_encode($alertData));

            echo json_encode(['success' => true, 'alert' => $alertData]);
        } catch (Exception $e) {
            error_log("Error al registrar alerta: " . $e->getMessage());
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

            error_log("Alertas cercanas obtenidas: " . json_encode($alerts));
            echo json_encode(['success' => true, 'alerts' => $alerts]);
        } catch (Exception $e) {
            error_log("Error al obtener alertas: " . $e->getMessage());
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
    } else {
        echo json_encode(['success' => false, 'error' => 'Acción no válida']);
    }
} else {
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    http_response_code(405);
}