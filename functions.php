<?php
require 'vendor/autoload.php';

use Pusher\Pusher;

header('Content-Type: application/json');
error_log("Iniciando functions.php - Versión de prueba para confirmar despliegue");

echo json_encode(['success' => true, 'message' => 'VERSIÓN DE PRUEBA CONFIRMADA']);
exit;