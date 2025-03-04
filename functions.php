<?php
require 'vendor/autoload.php';

use Pusher\Pusher;

header('Content-Type: application/json');
error_log("Iniciando functions.php - Versión mínima pre-Neon");

echo json_encode(['success' => true, 'message' => 'Servidor funcionando sin Neon']);
exit;