<?php
require 'vendor/autoload.php';

use Pusher\Pusher;

header('Content-Type: application/json');
error_log("Iniciando functions.php - Versión básica para prueba 503");

echo json_encode(['success' => true, 'message' => 'Servidor funcionando sin base de datos']);
exit;