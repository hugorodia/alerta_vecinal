<?php
// index.php - Página principal de la aplicación
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Aplicación de alertas de seguridad para residentes de barrios o localidades. Mantente informado sobre situaciones de peligro en tiempo real.">
    <meta name="keywords" content="alertas vecinales, seguridad, robo, asalto, actividad sospechosa, app seguridad">
    <meta name="author" content="Tu Nombre">
    <title>Alerta Vecinal - Aplicación de Seguridad</title>
    <link rel="icon" type="image/x-icon" href="/public/favicon.ico?v=1">
    <link rel="apple-touch-icon" sizes="180x180" href="/public/apple-touch-icon.png?v=1">
    <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css" />
    <link rel="stylesheet" href="style.css?v=1.0">
</head>
<body>
    <header class="header">
        <h1>Alerta Vecinal</h1>
        <p>Tu seguridad es nuestra prioridad</p>
    </header>
    <main class="container">
        <div id="map" class="map"></div>
        <section class="alert-form">
            <h2>Enviar Alerta</h2>
            <form id="send-alert-form">
                <label for="alert-type">Tipo de Alerta:</label>
                <select id="alert-type" name="alert-type" required>
                    <option value="robo">Robo</option>
                    <option value="asalto">Asalto</option>
                    <option value="actividad_sospechosa">Actividad Sospechosa</option>
                </select>
                <label for="alert-radius">Radio de Alcance (km):</label>
                <input type="number" id="alert-radius" name="alert-radius" min="1" max="10" value="5" required>
                <button type="submit" class="alert-button">Enviar Alerta</button>
            </form>
        </section>
    </main>
    <footer class="footer">
        <p>© 2023 Alerta Vecinal. Todos los derechos reservados.</p>
    </footer>
    <script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
    <script src="https://js.pusher.com/8.0/pusher.min.js"></script>
    <script>
        window.PUSHER_KEY = <?php echo json_encode(getenv('PUSHER_KEY')); ?>;
        window.PUSHER_CLUSTER = <?php echo json_encode(getenv('PUSHER_CLUSTER')); ?>;
    </script>
    <script src="script.js?v=1.0"></script>
</body>
</html>