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
    $pusherKey = getenv('key');        // Cambiado de PUSHER_KEY a key
    $pusherSecret = getenv('secret');  // Cambiado de PUSHER_SECRET a secret
    $pusherAppId = getenv('app_id');   // Cambiado de PUSHER_APP_ID a app_id
    $pusherCluster = getenv('cluster') ?: 'us2'; // Cambiado de PUSHER_CLUSTER a cluster

    error_log("Pusher Config - Key: " . ($pusherKey ? 'Set' : 'Not Set') . 
              ", Secret: " . ($pusherSecret ? 'Set' : 'Not Set') . 
              ", App ID: " . ($pusherAppId ? 'Set' : 'Not Set') . 
              ", Cluster: $pusherCluster");

    if (!$pusherKey || !$pusherSecret || !$pusherAppId) {
        error_log("Credenciales de Pusher incompletas. No se enviará al canal.");
        return null;
    }

    $options = [
        'cluster' => $pusherCluster,
        'encrypted' => true
    ];
    try {
        $pusher = new Pusher($pusherKey, $pusherSecret, $pusherAppId, $options);
        return $pusher;
    } catch (Exception $e) {
        error_log("Error al inicializar Pusher: " . $e->getMessage());
        return null;
    }
}

function sendVerificationEmail($email, $nombre, $token) {
    $sendgridApiKey = getenv('SENDGRID_API_KEY');
    $fromEmail = 'alertavecinal2025@gmail.com';

    if (empty($sendgridApiKey)) {
        error_log("SENDGRID_API_KEY no está configurada");
        return false;
    }

    $emailObj = new Mail();
    $emailObj->setFrom($fromEmail, "Alerta Vecinal");
    $emailObj->setSubject("Verifica tu cuenta en Alerta Vecinal");
    $emailObj->addTo($email, $nombre);
    $emailObj->addContent(
        "text/html",
        "Hola $nombre,<br><br>Gracias por registrarte en Alerta Vecinal. Por favor, verifica tu cuenta haciendo clic en el siguiente enlace:<br><br>" .
        "<a href='https://alerta-vecinal.onrender.com/verify?token=$token'>Verificar mi cuenta</a><br><br>" .
        "Si no te registraste, ignora este correo.<br>Equipo de Alerta Vecinal"
    );

    $sendgrid = new \SendGrid($sendgridApiKey);
    try {
        $response = $sendgrid->send($emailObj);
        $statusCode = $response->statusCode();
        if ($statusCode >= 200 && $statusCode < 300) {
            return true;
        } else {
            error_log("SendGrid fallo con código: $statusCode");
            return false;
        }
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
            try {
                $stmt = $conn->prepare("SELECT id FROM users WHERE email = :email");
                $stmt->execute(['email' => $email]);
                if ($stmt->fetch()) {
                    die(json_encode(['success' => false, 'error' => 'El correo ya está registrado']));
                }
                $hashedPassword = password_hash($password, PASSWORD_DEFAULT);
                $token = bin2hex(random_bytes(16));
                $stmt = $conn->prepare("
                    INSERT INTO users (email, nombre, apellido, password, verification_token) 
                    VALUES (:email, :nombre, :apellido, :password, :token)
                ");
                $stmt->execute([
                    'email' => $email,
                    'nombre' => $nombre,
                    'apellido' => $apellido,
                    'password' => $hashedPassword,
                    'token' => $token
                ]);

                if (sendVerificationEmail($email, $nombre, $token)) {
                    die(json_encode(['success' => true, 'message' => 'Registro exitoso. Revisa tu correo para verificar tu cuenta.']));
                } else {
                    die(json_encode(['success' => false, 'error' => 'Error al enviar el correo de verificación']));
                }
            } catch (PDOException $e) {
                error_log("Error en registro: " . $e->getMessage());
                die(json_encode(['success' => false, 'error' => $e->getMessage()]));
            }
            break;

        case 'login':
            $email = $data['email'] ?? '';
            $password = $data['password'] ?? '';
            if (empty($email) || empty($password)) {
                die(json_encode(['success' => false, 'error' => 'Correo y contraseña son obligatorios']));
            }
            try {
                $stmt = $conn->prepare("SELECT id, password, is_verified FROM users WHERE email = :email");
                $stmt->execute(['email' => $email]);
                $user = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($user && password_verify($password, $user['password'])) {
                    if (!$user['is_verified']) {
                        die(json_encode(['success' => false, 'error' => 'Debes verificar tu correo antes de iniciar sesión']));
                    }
                    die(json_encode(['success' => true, 'user_id' => $user['id']]));
                } else {
                    die(json_encode(['success' => false, 'error' => 'Correo o contraseña incorrectos']));
                }
            } catch (PDOException $e) {
                error_log("Error en login: " . $e->getMessage());
                die(json_encode(['success' => false, 'error' => $e->getMessage()]));
            }
            break;

        case 'registrarAlerta':
            $user_id = $data['user_id'] ?? '';
            if (empty($user_id)) {
                die(json_encode(['success' => false, 'error' => 'Debes iniciar sesión para enviar alertas']));
            }
            $stmt = $conn->prepare("SELECT is_verified, nombre, apellido FROM users WHERE id = :user_id");
            $stmt->execute(['user_id' => $user_id]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$user || !$user['is_verified']) {
                die(json_encode(['success' => false, 'error' => 'Debes verificar tu correo para enviar alertas']));
            }
            $tipo = $data['tipo'] ?? '';
            $latitud = $data['latitud'] ?? '';
            $longitud = $data['longitud'] ?? '';
            $radio = $data['radio'] ?? '';

            if (empty($tipo) || empty($latitud) || empty($longitud) || empty($radio)) {
                error_log("Faltan datos requeridos: tipo=$tipo, latitud=$latitud, longitud=$longitud, radio=$radio");
                die(json_encode(['success' => false, 'error' => 'Faltan datos requeridos']));
            }

            try {
                $stmt = $conn->prepare("
                    INSERT INTO alerts (tipo, latitud, longitud, radio, user_id) 
                    VALUES (:tipo, :latitud, :longitud, :radio, :user_id) 
                    RETURNING id, fecha
                ");
                $stmt->execute([
                    'tipo' => $tipo,
                    'latitud' => $latitud,
                    'longitud' => $longitud,
                    'radio' => $radio,
                    'user_id' => $user_id
                ]);
                $result = $stmt->fetch(PDO::FETCH_ASSOC);
                $alertId = $result['id'];
                $fecha = $result['fecha'];

                $alert = [
                    'id' => $alertId,
                    'tipo' => $tipo,
                    'latitud' => $latitud,
                    'longitud' => $longitud,
                    'radio' => $radio,
                    'fecha' => $fecha,
                    'user_id' => $user_id,
                    'nombre' => $user['nombre'],
                    'apellido' => $user['apellido']
                ];

                $pusher = getPusher();
                if ($pusher) {
                    $pusher->trigger('alert-channel', 'new-alert', $alert);
                    error_log("Alerta enviada a Pusher: ID $alertId");
                } else {
                    error_log("Pusher no disponible, alerta registrada pero no enviada al canal");
                }

                die(json_encode(['success' => true, 'alert' => $alert]));
            } catch (PDOException $e) {
                error_log("Error al registrar alerta: " . $e->getMessage());
                die(json_encode(['success' => false, 'error' => $e->getMessage()]));
            }
            break;

        case 'obtenerAlertasCercanas':
            $latitud = $data['latitud'] ?? '';
            $longitud = $data['longitud'] ?? '';
            $radio = $data['radio'] ?? '';
            if (empty($latitud) || empty($longitud) || empty($radio)) {
                die(json_encode(['success' => false, 'error' => 'Faltan datos requeridos']));
            }

            try {
                $stmt = $conn->prepare("
                    SELECT a.id, a.tipo, a.latitud, a.longitud, a.radio, a.fecha, a.visible, a.user_id, u.nombre, u.apellido
                    FROM alerts a
                    JOIN users u ON a.user_id = u.id
                    WHERE a.visible = true
                    AND (6371 * acos(cos(radians(:latitud)) * cos(radians(a.latitud)) * cos(radians(a.longitud) - radians(:longitud)) + sin(radians(:latitud)) *