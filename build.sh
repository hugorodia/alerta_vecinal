#!/bin/bash
echo "Verificando entorno..."
php -v  # Muestra la versión de PHP
which composer  # Busca la ubicación de Composer
if [ -f /usr/local/bin/composer ]; then
    echo "Composer encontrado en /usr/local/bin/composer"
    /usr/local/bin/composer install
else
    echo "Composer no encontrado, instalándolo..."
    php -r "copy('https://getcomposer.org/installer', 'composer-setup.php');"
    php composer-setup.php --install-dir=/usr/local/bin --filename=composer
    php -r "unlink('composer-setup.php');"
    composer install
fi