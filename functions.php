<?php
// functions.php - Lógica del backend

// Configuración de la base de datos
$host = 'sql104.infinityfree.com'; // Cambia esto si usas un host diferente
$dbname = 'if0_38113752_alertavecinal_db'; // Nombre de la base de datos
$username = 'if0_38113752'; // Usuario de la base de datos
$password = 'evKNucdVS8'; // Contraseña de la base de datos

try {
    // Conexión a la base de datos
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    require 'vendor/autoload.php';

use Pusher\Pusher;

// Configuración de Pusher
$pusher = new Pusher(
    '2c963fd334205de07cf7', // Reemplaza con tu clave de Pusher
    '01b70984e3e2a14351e1', // Reemplaza con tu secreto de Pusher
    '1941024', // Reemplaza con tu ID de Pusher
    ['cluster' => 'us2'] // Reemplaza con tu cluster de Pusher
);

    // Función para registrar una nueva alerta
    function registrarAlerta($tipo, $latitud, $longitud, $radio) {
        global $pdo;function registrarAlerta($tipo, $latitud, $longitud, $radio) {
    global $pdo, $pusher;

    $stmt = $pdo->prepare("INSERT INTO alertas (tipo, latitud, longitud, radio, fecha) VALUES (:tipo, :latitud, :longitud, :radio, NOW())");
    $stmt->execute([
        ':tipo' => $tipo,
        ':latitud' => $latitud,
        ':longitud' => $longitud,
        ':radio' => $radio
    ]);

    $id = $pdo->lastInsertId();

    // Enviar alerta en tiempo real
    $alertData = [
        'id' => $id,
        'tipo' => $tipo,
        'latitud' => $latitud,
        'longitud' => $longitud,
        'radio' => $radio,
        'fecha' => date('Y-m-d H:i:s')
    ];
    $pusher->trigger('alert-channel', 'new-alert', $alertData);

    return $id;
}

        $stmt = $pdo->prepare("INSERT INTO alertas (tipo, latitud, longitud, radio, fecha) VALUES (:tipo, :latitud, :longitud, :radio, NOW())");
        $stmt->execute([
            ':tipo' => $tipo,
            ':latitud' => $latitud,
            ':longitud' => $longitud,
            ':radio' => $radio
        ]);

        return $pdo->lastInsertId();
    }

    // Función para obtener alertas cercanas
    function obtenerAlertasCercanas($latitud, $longitud, $radio) {
        global $pdo;

        $stmt = $pdo->prepare("
            SELECT *, 
                   ( 6371 * acos( cos( radians(:latitud) ) * cos( radians( latitud ) ) 
                   * cos( radians( longitud ) - radians(:longitud) ) + sin( radians(:latitud) ) 
                   * sin( radians( latitud ) ) ) ) AS distancia 
            FROM alertas 
            HAVING distancia <= :radio 
            ORDER BY fecha DESC
        ");

        $stmt->execute([
            ':latitud' => $latitud,
            ':longitud' => $longitud,
            ':radio' => $radio
        ]);

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    // Manejar solicitudes POST
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true);
        $action = $data['action'];

        if ($action === 'registrarAlerta') {
            try {
                $tipo = $data['tipo'];
                $latitud = $data['latitud'];
                $longitud = $data['longitud'];
                $radio = $data['radio'];

                $id = registrarAlerta($tipo, $latitud, $longitud, $radio);
                echo json_encode(['success' => true, 'alert' => [
                    'id' => $id,
                    'tipo' => $tipo,
                    'latitud' => $latitud,
                    'longitud' => $longitud,
                    'radio' => $radio,
                    'fecha' => date('Y-m-d H:i:s')
                ]]);
            } catch (Exception $e) {
                echo json_encode(['success' => false, 'error' => $e->getMessage()]);
            }
        } elseif ($action === 'obtenerAlertasCercanas') {
            try {
                $latitud = $data['latitud'];
                $longitud = $data['longitud'];
                $radio = $data['radio'];

                $alerts = obtenerAlertasCercanas($latitud, $longitud, $radio);
                echo json_encode(['success' => true, 'alerts' => $alerts]);
            } catch (Exception $e) {
                echo json_encode(['success' => false, 'error' => $e->getMessage()]);
            }
        }
    }
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}