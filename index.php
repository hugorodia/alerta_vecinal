<?php
session_start();
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
    <link rel="manifest" href="/manifest.json">
    <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css" />
    <link rel="stylesheet" href="style.css?v=1.1">
</head>
<body>
    <header class="header">
        <h1>Alerta Vecinal</h1>
        <p>Tu seguridad es nuestra prioridad</p>
        <div class="beta-notice">
            <p>Versión Beta: Esta aplicación está en fase de prueba con un servidor gratuito, por lo que puede haber lentitud o interrupciones temporales. ¡Agradecemos tu comprensión mientras perfeccionamos la experiencia!</p>
        </div>
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
                <button type="submit" class="alert-button">Enviar Alerta</button>
            </form>
            <div class="notifications">
                <label><input type="checkbox" id="enable-notifications"> Activar notificaciones (sonido/vibración)</label>
            </div>
            <div class="history-controls">
                <button id="show-history-btn" class="history-button">Ver Historial</button>
                <label for="history-start">Desde:</label>
                <input type="date" id="history-start" disabled>
                <label for="history-end">Hasta:</label>
                <input type="date" id="history-end" disabled>
            </div>
            <button id="logout-btn" class="auth-button" style="display: none;">Cerrar Sesión</button>
        </section>
        <section class="auth-form" style="display: none;">
            <h2>Registro / Inicio de Sesión</h2>
            <form id="register-form">
                <label for="email">Correo:</label>
                <input type="email" id="email" name="email" required>
                <label for="nombre">Nombre:</label>
                <input type="text" id="nombre" name="nombre" required>
                <label for="apellido">Apellido:</label>
                <input type="text" id="apellido" name="apellido" required>
                <label for="password">Contraseña:</label>
                <input type="password" id="password" name="password" required>
                <button type="submit" class="auth-button">Registrarse</button>
                <button type="button" id="login-btn" class="auth-button">Iniciar Sesión</button>
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
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').then(reg => {
                console.log('Service Worker registrado:', reg);
            }).catch(err => {
                console.log('Error al registrar Service Worker:', err);
            });
        }
    </script>
        <!-- === FIREBASE CLOUD MESSAGING === -->
    <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js"></script>

    <script>
      // === TU CONFIGURACIÓN DE FIREBASE ===
      const firebaseConfig = {
        apiKey: "AIzaSyCBP-fPS1HZOnblNKRNInutcwcjL0DpvOw",
        authDomain: "alerta-vecinal-a8bef.firebaseapp.com",
        projectId: "alerta-vecinal-a8bef",
        storageBucket: "alerta-vecinal-a8bef.firebasestorage.app",
        messagingSenderId: "479895936339",
        appId: "1:479895936339:web:e8c1abb4e4d345fb91d5a6"
      };

      firebase.initializeApp(firebaseConfig);
      const messaging = firebase.messaging();
    </script>
    <!-- === FIN FIREBASE === -->

    <script src="script.js?v=1.2"></script>
</body>
    <script src="script.js?v=1.2"></script>
</body>
</html>
