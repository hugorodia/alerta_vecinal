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
    <!-- Estilos -->
    <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css" />
    <link rel="stylesheet" href="style.css?v=1.0">
</head>
<body>
    <header class="header">
        <h1>Alerta Vecinal</h1>
        <p>Tu seguridad es nuestra prioridad</p>
    </header>

    <main class="container">
        <!-- Mapa -->
        <div id="map" class="map"></div>

        <!-- Formulario para enviar alertas -->
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
        <p>&copy; 2023 Alerta Vecinal. Todos los derechos reservados.</p>
    </footer>

    <!-- Scripts -->
    <script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
    <script src="script.js?v=1.0"></script>
    <script src="https://js.pusher.com/8.0/pusher.min.js"></script>
</body>
</html>