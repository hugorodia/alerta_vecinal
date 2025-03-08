<?php
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
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => "Error de conexión: " . $e->getMessage()]);
        exit;
    }
}

function getPusher() {
    $options = [
        'cluster' => getenv('PUSHER_CLUSTER'),
        'encrypted' => true
    ];
    $pusher = new Pusher(
        getenv('PUSHER_KEY'),
        getenv('PUSHER_SECRET'),
        getenv('PUSHER_APP_ID'),
        $options
    );
    if (!$pusher) {
        error_log("Error al inicializar Pusher");
    }
    return $pusher;
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
        $responseBody = $response->body();
        error_log("SendGrid response: $statusCode - $responseBody");
        if ($statusCode >= 200 && $statusCode < 300) {
            return true;
        } else {
            error_log("SendGrid fallo con código: $statusCode - $responseBody");
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
                echo json_encode(['success' => false, 'error' => 'Todos los campos son obligatorios']);
                exit;
            }
            try {
                $stmt = $conn->prepare("SELECT id FROM users WHERE email = :email");
                $stmt->execute(['email' => $email]);
                if ($stmt->fetch()) {
                    echo json_encode(['success' => false, 'error' => 'El correo ya está registrado']);
                    exit;
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
                    echo json_encode(['success' => true, 'message' => 'Registro exitoso. Revisa tu correo para verificar tu cuenta.']);
                } else {
                    echo json_encode(['success' => false, 'error' => 'Error al enviar el correo de verificación']);
                }
            } catch (PDOException $e) {
                echo json_encode(['success' => false, 'error' => $e->getMessage()]);
            }
            break;

        case 'login':
            $email = $data['email'] ?? '';
            $password = $data['password'] ?? '';
            if (empty($email) || empty($password)) {
                echo json_encode(['success' => false, 'error' => 'Correo y contraseña son obligatorios']);
                exit;
            }
            try {
                $stmt = $conn->prepare("SELECT id, password, is_verified FROM users WHERE email = :email");
                $stmt->execute(['email' => $email]);
                $user = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($user && password_verify($password, $user['password'])) {
                    if (!$user['is_verified']) {
                        echo json_encode(['success' => false, 'error' => 'Debes verificar tu correo antes de iniciar sesión']);
                        exit;
                    }
                    echo json_encode(['success' => true, 'user_id' => $user['id']]);
                } else {
                    echo json_encode(['success' => false, 'error' => 'Correo o contraseña incorrectos']);
                }
            } catch (PDOException $e) {
                echo json_encode(['success' => false, 'error' => $e->getMessage()]);
            }
            break;

        case 'registrarAlerta':
            $user_id = $data['user_id'] ?? '';
            if (empty($user_id)) {
                echo json_encode(['success' => false, 'error' => 'Debes iniciar sesión para enviar alertas']);
                exit;
            }
            $stmt = $conn->prepare("SELECT is_verified FROM users WHERE id = :user_id");
            $stmt->execute(['user_id' => $user_id]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$user || !$user['is_verified']) {
                echo json_encode(['success' => false, 'error' => 'Debes verificar tu correo para enviar alertas']);
                exit;
            }
            $tipo = $data['tipo'] ?? '';
            $latitud = $data['latitud'] ?? '';
            $longitud = $data['longitud'] ?? '';
            $radio = $data['radio'] ?? '';

            if (empty($tipo) || empty($latitud) || empty($longitud) || empty($radio)) {
                error_log("Faltan datos requeridos: tipo=$tipo, latitud=$latitud, longitud=$longitud, radio=$radio");
                echo json_encode(['success' => false, 'error' => 'Faltan datos requeridos']);
                exit;
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

                $stmt = $conn->prepare("SELECT nombre, apellido FROM users WHERE id = :user_id");
                $stmt->execute(['user_id' => $user_id]);
                $user = $stmt->fetch(PDO::FETCH_ASSOC);

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
                    error_log("Pusher no disponible, alerta no enviada al canal");
                }

                echo json_encode(['success' => true, 'alert' => $alert]);
            } catch (PDOException $e) {
                error_log("Error al registrar alerta: " . $e->getMessage());
                echo json_encode(['success' => false, 'error' => $e->getMessage()]);
            }
            break;

        case 'obtenerAlertasCercanas':
            $latitud = $data['latitud'] ?? '';
            $longitud = $data['longitud'] ?? '';
            $radio = $data['radio'] ?? '';
            if (empty($latitud) || empty($longitud) || empty($radio)) {
                echo json_encode(['success' => false, 'error' => 'Faltan datos requeridos']);
                exit;
            }

            try {
                $stmt = $conn->prepare("
                    SELECT a.id, a.tipo, a.latitud, a.longitud, a.radio, a.fecha, a.visible, a.user_id, u.nombre, u.apellido
                    FROM alerts a
                    JOIN users u ON a.user_id = u.id
                    WHERE a.visible = true
                    AND (6371 * acos(cos(radians(:latitud)) * cos(radians(a.latitud)) * cos(radians(a.longitud) - radians(:longitud)) + sin(radians(:latitud)) * sin(radians(a.latitud)))) < :radio
                ");
                $stmt->execute([
                    'latitud' => $latitud,
                    'longitud' => $longitud,
                    'radio' => $radio
                ]);
                $alerts = $stmt->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode(['success' => true, 'alerts' => $alerts]);
            } catch (PDOException $e) {
                echo json_encode(['success' => false, 'error' => $e->getMessage()]);
            }
            break;

        case 'eliminarAlerta':
            $user_id = $data['user_id'] ?? '';
            if (empty($user_id)) {
                echo json_encode(['success' => false, 'error' => 'Debes iniciar sesión']);
                exit;
            }
            $id = $data['id'] ?? '';
            if (empty($id)) {
                echo json_encode(['success' => false, 'error' => 'ID de alerta requerido']);
                exit;
            }
            try {
                $stmt = $conn->prepare("UPDATE alerts SET visible = false WHERE id = :id AND user_id = :user_id");
                $stmt->execute(['id' => $id, 'user_id' => $user_id]);
                if ($stmt->rowCount() > 0) {
                    echo json_encode(['success' => true]);
                } else {
                    echo json_encode(['success' => false, 'error' => 'Alerta no encontrada o no tienes permiso']);
                }
            } catch (PDOException $e) {
                echo json_encode(['success' => false, 'error' => $e->getMessage()]);
            }
            break;

        case 'obtenerHistorialAlertas':
            $user_id = $data['user_id'] ?? '';
            if (empty($user_id)) {
                echo json_encode(['success' => false, 'error' => 'Debes iniciar sesión para ver el historial']);
                exit;
            }
            $fechaInicio = $data['fechaInicio'] ?? null;
            $fechaFin = $data['fechaFin'] ?? null;
            try {
                $query = "
                    SELECT a.id, a.tipo, a.latitud, a.longitud, a.radio, a.fecha, a.visible, a.user_id, u.nombre, u.apellido 
                    FROM alerts a
                    JOIN users u ON a.user_id = u.id
                ";
                $params = [];
                if ($fechaInicio && $fechaFin) {
                    $query .= " WHERE a.fecha BETWEEN :fechaInicio AND :fechaFin";
                    $params['fechaInicio'] = $fechaInicio;
                    $params['fechaFin'] = $fechaFin;
                }
                $stmt = $conn->prepare($query);
                $stmt->execute($params);
                $alerts = $stmt->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode(['success' => true, 'alerts' => $alerts]);
            } catch (PDOException $e) {
                echo json_encode(['success' => false, 'error' => $e->getMessage()]);
            }
            break;

        default:
            echo json_encode(['success' => false, 'error' => 'Acción no válida']);
    }
} elseif ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['token'])) {
    $token = $_GET['token'];
    $conn = getDBConnection();
    error_log("Verificando token: $token");
    try {
        $stmt = $conn->prepare("SELECT id FROM users WHERE verification_token = :token AND is_verified = FALSE");
        $stmt->execute(['token' => $token]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($user) {
            $stmt = $conn->prepare("UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE id = :id");
            $stmt->execute(['id' => $user['id']]);
            error_log("Usuario verificado: ID " . $user['id']);
            echo "<h1>Cuenta verificada</h1><p>Tu cuenta ha sido verificada. Puedes iniciar sesión en Alerta Vecinal.</p>";
        } else {
            error_log("Token no encontrado o ya verificado: $token");
            echo "<h1>Error</h1><p>Token inválido o cuenta ya verificada.</p>";
        }
    } catch (PDOException $e) {
        error_log("Error en verificación: " . $e->getMessage());
        echo "<h1>Error</h1><p>" . $e->getMessage() . "</p>";
    }
} else {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
}
?>