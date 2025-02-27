#!/bin/bash
echo "Verificando entorno actual..."
node -v  # Confirma que estamos en Node.js
echo "Instalando PHP y Composer..."
apt-get update -y  # Actualiza los paquetes disponibles
apt-get install -y php-cli php-mbstring unzip  # Instala PHP y extensions necesarias
curl -sS https://getcomposer.org/installer -o composer-setup.php
php composer-setup.php --install-dir=/usr/local/bin --filename=composer
rm composer-setup.php
echo "PHP y Composer instalados. Versión de PHP:"
php -v
echo "Instalando dependencias..."
composer install