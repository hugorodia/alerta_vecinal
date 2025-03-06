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

// Conexión a Neon usando variables PG*
$host = getenv('PGHOST') ?: 'missing_host';
$dbname = getenv('PGDATABASE') ?: 'missing_dbname';
$user = getenv('PGUSER') ?: 'missing_user';
$pass = getenv('PGPASSWORD') ?: 'missing_pass';
error_log("PGHOST: '$host', PGDATABASE: '$dbname', PGUSER: '$user', PGPASSWORD: '$pass'");

try {
    $dsn = "pgsql:host=$host;dbname=$dbname;user=$user;password=$pass;sslmode=require";
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

            $stmt = $pdo->prepare("INSERT INTO alertas (tipo, latitud, longitud, radio, fecha, visible) VALUES (?, ?, ?, ?, NOW(), TRUE)");
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

            $fechaLimite = $pdo->query("SELECT (NOW() AT TIME ZONE 'UTC') - INTERVAL '24 hours' + INTERVAL '3 hours'")->fetchColumn();
            error_log("Fecha límite en UTC (ajustada para UTC-3): " . $fechaLimite);

            $stmt = $pdo->prepare("
                SELECT id, tipo, latitud, longitud, radio, fecha,
                       (6371 * acos(cos(radians(?)) * cos(radians(latitud)) 
                       * cos(radians(longitud) - radians(?)) + sin(radians(?)) 
                       * sin(radians(latitud)))) AS distancia
                FROM alertas
                WHERE (6371 * acos(cos(radians(?)) * cos(radians(latitud)) 
                       * cos(radians(longitud) - radians(?)) + sin(radians(?)) 
                       * sin(radians(latitud)))) <= ?
                AND fecha >= ?
                AND visible = TRUE
                ORDER BY fecha DESC
            ");
            $stmt->execute([$latitud, $longitud, $latitud, $latitud, $longitud, $latitud, $radio, $fechaLimite]);
            $alerts = $stmt->fetchAll(PDO::FETCH_ASSOC);

            error_log("Alertas cercanas obtenidas: " . json_encode($alerts));
            echo json_encode(['success' => true, 'alerts' => $alerts]);
        } catch (Exception $e) {
            error_log("Error al obtener alertas: " . $e->getMessage());
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
    } elseif ($action === 'eliminarAlerta') {
        try {
            $alert_id = $data['id'] ?? null;
            if ($alert_id === null) {
                throw new Exception('Falta el ID de la alerta');
            }

            $stmt = $pdo->prepare("UPDATE alertas SET visible = FALSE WHERE id = ?");
            $stmt->execute([$alert_id]);
            error_log("Alerta $alert_id marcada como no visible");
            echo json_encode(['success' => true]);
        } catch (Exception $e) {
            error_log("Error al eliminar alerta: " . $e->getMessage());
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
    } elseif ($action === 'obtenerHistorialAlertas') {
        try {
            $stmt = $pdo->prepare("SELECT id, tipo, latitud, longitud, radio, fecha, visible FROM alertas ORDER BY fecha DESC");
            $stmt->execute();
            $alerts = $stmt->fetchAll(PDO::FETCH_ASSOC);

            error_log("Historial de alertas obtenido: " . json_encode($alerts));
            echo json_encode(['success' => true, 'alerts' => $alerts]);
        } catch (Exception $e) {
            error_log("Error al obtener historial: " . $e->getMessage());
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
    } else {
        echo json_encode(['success' => false, 'error' => 'Acción no válida']);
    }
} else {
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    http_response_code(405);
}