// ... (código previo sin cambios hasta el registro) ...

    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const nombre = document.getElementById('nombre').value;
            const apellido = document.getElementById('apellido').value;
            const password = document.getElementById('password').value;
            try {
                const response = await fetch('functions.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'register', email, nombre, apellido, password })
                });
                const result = await response.json();
                if (result.success) {
                    alert(result.message); // "Registro exitoso. Revisa tu correo para verificar tu cuenta."
                    document.getElementById('email').value = '';
                    document.getElementById('nombre').value = '';
                    document.getElementById('apellido').value = '';
                    document.getElementById('password').value = '';
                } else {
                    alert("Error al registrar: " + result.error);
                }
            } catch (error) {
                console.error("Error al registrar:", error);
                alert("Ocurrió un error al registrar.");
            }
        });

        document.getElementById('login-btn').addEventListener('click', async () => {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            try {
                const response = await fetch('functions.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'login', email, password })
                });
                const result = await response.json();
                if (result.success) {
                    localStorage.setItem('user_id', result.user_id);
                    location.reload();
                } else {
                    alert("Error al iniciar sesión: " + result.error);
                }
            } catch (error) {
                console.error("Error al iniciar sesión:", error);
                alert("Ocurrió un error al iniciar sesión.");
            }
        });
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('user_id');
            location.reload();
        });
    }

    const form = document.getElementById('send-alert-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const tipo = document.getElementById('alert-type').value;
            const radio = parseInt(document.getElementById('alert-radius').value, 10);
            if (!userMarker) {
                alert("No se ha detectado tu ubicación. Por favor, habilita la geolocación.");
                return;
            }
            const latitud = userMarker.getLatLng().lat;
            const longitud = userMarker.getLatLng().lng;
            await sendAlert(tipo, latitud, longitud, radio);
        });
    }

    // ... (resto del código sin cambios) ...