<?php
ob_start();
header('Content-Type: application/json');
require 'vendor/autoload.php';
use Pusher\Pusher;

function getDBConnection() {
    $dbname = getenv('PGDATABASE');
    $host = getenv('PGHOST');
    $port = getenv('PGPORT') ?: '5432';
    $username = getenv('PGUSER');
    $password = getenv('PGPASSWORD');
    try {
        $conn = new PDO("pgsql:host=$host;port=$port;dbname=$dbname", $username, $password);
        $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        return $conn;
    } catch (PDOException $e) {
        error_log("Error de conexión: " . $e->getMessage());
        http_response_code(500);
        die(json_encode(['success' => false, 'error' => "Error de conexión: " . $e->getMessage()]));
    }
}

function getPusher() {
    $pusherKey = getenv('key');
    $pusherSecret = getenv('secret');
    $pusherAppId = getenv('app_id');
    $pusherCluster = getenv('cluster') ?: 'us2';
    $options = ['cluster' => $pusherCluster, 'encrypted' => true];
    return new Pusher($pusherKey, $pusherSecret, $pusherAppId, $options);
}

function calculateDistance($lat1, $lon1, $lat2, $lon2) {
    $R = 6371; // Radio de la Tierra en km
    $dLat = deg2rad($lat2 - $lat1);
    $dLon = deg2rad($lon2 - $lon1);
    $a = sin($dLat / 2) * sin($dLat / 2) +
         cos(deg2rad($lat1)) * cos(deg2rad($lat2)) *
         sin($dLon / 2) * sin($dLon / 2);
    $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
    return $R * $c;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $action = $data['action'] ?? '';
    $conn = getDBConnection();

    switch ($action) {
        case 'register':
            $email = $data['email'] ?? '';
            $nombre = $data['nombre'] ?? '';
            $apellido = $data['apellido'] ?? '';
            $password = $data['password'] ?? '';
            if (empty($email) || empty($nombre) || empty($apellido) || empty($password)) {
                die(json_encode(['success' => false, 'error' => 'Todos los campos son obligatorios']));
            }
            $stmt = $conn->prepare("SELECT id FROM users WHERE email = :email");
            $stmt->execute(['email' => $email]);
            if ($stmt->fetch()) {
                die(json_encode(['success' => false, 'error' => 'El correo ya está registrado']));
            }
            $hashedPassword = password_hash($password, PASSWORD_DEFAULT);
            $stmt = $conn->prepare("INSERT INTO users (email, nombre, apellido, password, is_verified) VALUES (:email, :nombre, :apellido, :password, TRUE)");
            $stmt->execute([
                'email' => $email,
                'nombre' => $nombre,
                'apellido' => $apellido,
                'password' => $hashedPassword
            ]);
            die(json_encode(['success' => true, 'message' => 'Registro exitoso. Ya podés iniciar sesión.']));
            break;

        case 'login':
            $email = $data['email'] ?? '';
            $password = $data['password'] ?? '';
            if (empty($email) || empty($password)) {
                die(json_encode(['success' => false, 'error' => 'Correo y contraseña obligatorios']));
            }
            $stmt = $conn->prepare("SELECT id, password FROM users WHERE email = :email");
            $stmt->execute(['email' => $email]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($user && password_verify($password, $user['password'])) {
                die(json_encode(['success' => true, 'user_id' => $user['id']]));
            } else {
                die(json_encode(['success' => false, 'error' => 'Correo o contraseña incorrectos']));
            }
            break;

        case 'auto_login':
            $sessionToken = $data['session_token'] ?? '';
            if (empty($sessionToken)) {
                die(json_encode(['success' => false, 'error' => 'Token de sesión requerido']));
            }
            $stmt = $conn->prepare("SELECT id FROM users WHERE session_token = :session_token");
            $stmt->execute(['session_token' => $sessionToken]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($user) {
                $stmt = $conn->prepare("UPDATE users SET session_token = NULL WHERE id = :id");
                $stmt->execute(['id' => $user['id']]);
                die(json_encode(['success' => true, 'user_id' => $user['id']]));
            } else {
                die(json_encode(['success' => false, 'error' => 'Token inválido']));
            }
            break;

        case 'logout':
            die(json_encode(['success' => true, 'message' => 'Sesión cerrada']));
            break;

        case 'updateLocation':
            $user_id = $data['user_id'] ?? '';
            $latitude = $data['latitud'] ?? '';
            $longitude = $data['longitud'] ?? '';
            if (empty($user_id) || empty($latitude) || empty($longitude)) {
                die(json_encode(['success' => false, 'error' => 'Faltan datos']));
            }
            $stmt = $conn->prepare("UPDATE users SET last_latitude = :latitud, last_longitude = :longitud WHERE id = :user_id");
            $stmt->execute(['latitud' => $latitude, 'longitud' => $longitude, 'user_id' => $user_id]);
            die(json_encode(['success' => true]));
            break;

        case 'saveFcmToken':
    $user_id = $data['user_id'] ?? '';
    $token = $data['token'] ?? '';
    if (empty($user_id) || empty($token)) {
        die(json_encode(['success' => false, 'error' => 'Datos incompletos']));
    }
    $stmt = $conn->prepare("UPDATE users SET fcm_token = :token WHERE id = :user_id");
    $stmt->execute(['token' => $token, 'user_id' => $user_id]);
    die(json_encode(['success' => true]));
    break;

        case 'registrarAlerta':
            $user_id = $data['user_id'] ?? '';
            if (empty($user_id)) {
                die(json_encode(['success' => false, 'error' => 'Debes iniciar sesión']));
            }
            $stmt = $conn->prepare("SELECT nombre, apellido FROM users WHERE id = :user_id");
            $stmt->execute(['user_id' => $user_id]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$user) {
                die(json_encode(['success' => false, 'error' => 'Usuario no encontrado']));
            }
            $tipo = $data['tipo'] ?? '';
            $latitud = $data['latitud'] ?? '';
            $longitud = $data['longitud'] ?? '';
            if (empty($tipo) || empty($latitud) || empty($longitud)) {
                die(json_encode(['success' => false, 'error' => 'Faltan datos']));
            }
            $stmt = $conn->prepare("INSERT INTO alerts (tipo, latitud, longitud, user_id) VALUES (:tipo, :latitud, :longitud, :user_id) RETURNING id, fecha");
            $stmt->execute([
                'tipo' => $tipo,
                'latitud' => $latitud,
                'longitud' => $longitud,
                'user_id' => $user_id
            ]);
            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            $alert = [
                'id' => $result['id'],
                'tipo' => $tipo,
                'latitud' => $latitud,
                'longitud' => $longitud,
                'fecha' => $result['fecha'],
                'user_id' => $user_id,
                'nombre' => $user['nombre'],
                'apellido' => $user['apellido']
            ];
            $pusher = getPusher();
            if ($pusher) {
                $stmt = $conn->prepare("SELECT id, last_latitude, last_longitude FROM users WHERE last_latitude IS NOT NULL AND last_longitude IS NOT NULL AND id != :user_id");
                $stmt->execute(['user_id' => $user_id]);
                $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $nearby_users = [];
                foreach ($users as $userItem) {
                    $distance = calculateDistance($latitud, $longitud, $userItem['last_latitude'], $userItem['last_longitude']);
                    if ($distance <= 5) {
                        $nearby_users[] = $userItem['id'];
                    }
                }
                if (!empty($nearby_users)) {
                    $pusher->trigger('alert-channel', 'new-alert', $alert, ['user_ids' => $nearby_users]);
                }
            }
            die(json_encode(['success' => true, 'alert' => $alert]));
            break;

        case 'obtenerAlertasCercanas':
            $latitud = $data['latitud'] ?? '';
            $longitud = $data['longitud'] ?? '';
            $radio = $data['radio'] ?? '';
            if (empty($latitud) || empty($longitud) || empty($radio)) {
                die(json_encode(['success' => false, 'error' => 'Faltan datos']));
            }
            $stmt = $conn->prepare("
                SELECT a.id, a.tipo, a.latitud, a.longitud, a.fecha, a.visible, a.user_id, u.nombre, u.apellido
                FROM alerts a JOIN users u ON a.user_id = u.id
                WHERE a.visible = true
                AND (6371 * acos(cos(radians(:latitud)) * cos(radians(a.latitud)) * cos(radians(a.longitud) - radians(:longitud)) + sin(radians(:latitud)) * sin(radians(a.latitud)))) < :radio
            ");
            $stmt->execute(['latitud' => $latitud, 'longitud' => $longitud, 'radio' => $radio]);
            $alerts = $stmt->fetchAll(PDO::FETCH_ASSOC);
            die(json_encode(['success' => true, 'alerts' => $alerts]));
            break;

        case 'eliminarAlerta':
            $user_id = $data['user_id'] ?? '';
            $id = $data['id'] ?? '';
            if (empty($user_id) || empty($id)) {
                die(json_encode(['success' => false, 'error' => 'Faltan datos']));
            }
            $stmt = $conn->prepare("UPDATE alerts SET visible = false WHERE id = :id AND user_id = :user_id");
            $stmt->execute(['id' => $id, 'user_id' => $user_id]);
            die(json_encode(['success' => $stmt->rowCount() > 0]));
            break;

        case 'obtenerHistorialAlertas':
            $fechaInicio = $data['fechaInicio'] ?? null;
            $fechaFin = $data['fechaFin'] ?? null;
            $query = "SELECT a.id, a.tipo, a.latitud, a.longitud, a.fecha, a.visible, a.user_id, u.nombre, u.apellido FROM alerts a JOIN users u ON a.user_id = u.id";
            $params = [];
            if ($fechaInicio && $fechaFin) {
                $query .= " WHERE a.fecha BETWEEN :fechaInicio AND :fechaFin";
                $params['fechaInicio'] = $fechaInicio;
                $params['fechaFin'] = $fechaFin;
            }
            $query .= " ORDER BY a.fecha DESC";
            $stmt = $conn->prepare($query);
            $stmt->execute($params);
            $alerts = $stmt->fetchAll(PDO::FETCH_ASSOC);
            die(json_encode(['success' => true, 'alerts' => $alerts]));
            break;

        case 'reset_database':
            $conn->exec("DELETE FROM alerts");
            $conn->exec("DELETE FROM users");
            $conn->exec("ALTER SEQUENCE alerts_id_seq RESTART WITH 1");
            $conn->exec("ALTER SEQUENCE users_id_seq RESTART WITH 1");
            die(json_encode(['success' => true]));
            break;
    }
} else {
    ob_end_clean();
    http_response_code(405);
    die(json_encode(['success' => false, 'error' => 'Método no permitido']));
}
ob_end_clean();
?>
