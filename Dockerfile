# Usa una imagen oficial de PHP con FPM (FastCGI Process Manager)
FROM php:8.2-fpm

# Instala dependencias del sistema y Composer
RUN apt-get update && apt-get install -y \
    git \
    curl \
    libpng-dev \
    libonig-dev \
    libxml2-dev \
    zip \
    unzip \
    && curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

# Establece el directorio de trabajo
WORKDIR /var/www/html

# Copia los archivos del proyecto
COPY . .

# Instala las dependencias de Composer
RUN composer install --no-dev --optimize-autoloader

# Expone el puerto 8000 (Render lo usará)
EXPOSE 8000

# Comando para iniciar el servidor PHP
CMD ["php", "-S", "0.0.0.0:8000", "index.php"]