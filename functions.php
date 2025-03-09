<?php
ob_start();
header('Content-Type: application/json');

require 'vendor/autoload.php';

use Pusher\Pusher;
use SendGrid\Mail\Mail;

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

function sendVerificationEmail($email, $nombre, $token) {
    $sendgridApiKey = getenv('SENDGRID_API_KEY');
    $fromEmail = 'alertavecinal2025@gmail.com';
    $emailObj = new Mail();
    $emailObj->setFrom($fromEmail, "Alerta Vecinal");
    $emailObj->setSubject("Verifica tu cuenta en Alerta Vecinal");
    $emailObj->addTo($email, $nombre);
    $emailObj->addContent(
        "text/html",
        "Hola $nombre,<br><br>Verifica tu cuenta:<br><br>" .
        "<a href='https://alerta-vecinal.onrender.com/?action=verify&token=$token' target='_self'>Verificar mi cuenta</a><br><br>" .
        "O usa este token manualmente: $token<br><br>" .
        "Equipo de Alerta Vecinal"
    );
    $sendgrid = new \SendGrid($sendgridApiKey);
    try {
        $response = $sendgrid->send($emailObj);
        return $response->statusCode() >= 200 && $response->statusCode() < 300;
    } catch (Exception $e) {
        error_log("Error al enviar email: " . $e->getMessage());
        return false;
    }
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
            $token = bin2hex(random_bytes(16));
            $stmt = $conn->prepare("INSERT INTO users (email, nombre, apellido, password, verification_token) VALUES (:email, :nombre, :apellido, :password, :token)");
            $stmt->execute([
                'email' => $email,
                'nombre' => $nombre,
                'apellido' => $apellido,
                'password' => $hashedPassword,
                'token' => $token
            ]);
            if (sendVerificationEmail($email, $nombre, $token)) {
                die(json_encode(['success' => true, 'message' => 'Revisa tu correo para verificar']));
            } else {
                die(json_encode(['success' => false, 'error' => 'Error al enviar correo']));
            }
            break;

        case 'login':
            $email = $data['email'] ?? '';
            $password = $data['password'] ?? '';
            if (empty($email) || empty($password)) {
                die(json_encode(['success' => false, 'error' => 'Correo y contraseña obligatorios']));
            }
            $stmt = $conn->prepare("SELECT id, password, is_verified FROM users WHERE email = :email");
            $stmt->execute(['email' => $email]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($user && password_verify($password, $user['password'])) {
                if (!$user['is_verified']) {
                    die(json_encode(['success' => false, 'error' => 'Verifica tu correo primero']));
                }
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
            $stmt = $conn->prepare("SELECT id FROM users WHERE session_token = :session_token AND is_verified = TRUE");
            $stmt->execute(['session_token' => $sessionToken]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($user) {
                $stmt = $conn->prepare("UPDATE users SET session_token = NULL WHERE id = :id");
                $stmt->execute(['id' => $user['id']]);
                die(json_encode(['success' => true, 'user_id' => $user['id']]));
            } else {
                die(json_encode(['success' => false, 'error' => 'Token inválido o usuario no verificado']));
            }
            break;

        case 'logout':
            die(json_encode(['success' => true, 'message' => 'Sesión cerrada']));
            break;

        case 'registrarAlerta':
            $user_id = $data['user_id'] ?? '';
            if (empty($user_id)) {
                die(json_encode(['success' => false, 'error' => 'Debes iniciar sesión']));
            }
            $stmt = $conn->prepare("SELECT is_verified, nombre, apellido FROM users WHERE id = :user_id");
            $stmt->execute(['user_id' => $user_id]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$user || !$user['is_verified']) {
                die(json_encode(['success' => false, 'error' => 'Verifica tu correo']));
            }
            $tipo = $data['tipo'] ?? '';
            $latitud = $data['latitud'] ?? '';
            $longitud = $data['longitud'] ?? '';
            $radio = $data['radio'] ?? '';
            if (empty($tipo) || empty($latitud) || empty($longitud) || empty($radio)) {
                die(json_encode(['success' => false, 'error' => 'Faltan datos']));
            }
            $stmt = $conn->prepare("INSERT INTO alerts (tipo, latitud, longitud, radio, user_id) VALUES (:tipo, :latitud, :longitud, :radio, :user_id) RETURNING id, fecha");
            $stmt->execute([
                'tipo' => $tipo,
                'latitud' => $latitud,
                'longitud' => $longitud,
                'radio' => $radio,
                'user_id' => $user_id
            ]);
            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            $alert = [
                'id' => $result['id'],
                'tipo' => $tipo,
                'latitud' => $latitud,
                'longitud' => $longitud,
                'radio' => $radio,
                'fecha' => $result['fecha'],
                'user_id' => $user_id,
                'nombre' => $user['nombre'],
                'apellido' => $user['apellido']
            ];
            $pusher = getPusher();
            if ($pusher) {
                $pusher->trigger('alert-channel', 'new-alert', $alert);
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
                SELECT a.id, a.tipo, a.latitud, a.longitud, a.radio, a.fecha, a.visible, a.user_id, u.nombre, u.apellido
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
            $query = "SELECT a.id, a.tipo, a.latitud, a.longitud, a.radio, a.fecha, a.visible, a.user_id, u.nombre, u.apellido FROM alerts a JOIN users u ON a.user_id = u.id";
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
} elseif ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'verify' && isset($_GET['token'])) {
    $token = $_GET['token'];
    $conn = getDBConnection();
    $stmt = $conn->prepare("SELECT id FROM users WHERE verification_token = :token AND is_verified = FALSE");
    $stmt->execute(['token' => $token]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($user) {
        $stmt = $conn->prepare("UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE id = :id");
        $stmt->execute(['id' => $user['id']]);
        $sessionToken = bin2hex(random_bytes(16));
        $stmt = $conn->prepare("UPDATE users SET session_token = :session_token WHERE id = :id");
        $stmt->execute(['session_token' => $sessionToken, 'id' => $user['id']]);
        error_log("Verificación exitosa para user_id: {$user['id']}, session_token generado: $sessionToken");
        // Devolver el session_token como JSON en lugar de redirigir
        ob_end_clean();
        echo json_encode(['success' => true, 'session_token' => $sessionToken]);
        exit;
    } else {
        error_log("Token inválido o ya verificado: $token");
        ob_end_clean();
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Token inválido o ya verificado']);
        exit;
    }
} else {
    ob_end_clean();
    http_response_code(405);
    die(json_encode(['success' => false, 'error' => 'Método no permitido']));
}

ob_end_clean();
?>