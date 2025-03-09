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
                die