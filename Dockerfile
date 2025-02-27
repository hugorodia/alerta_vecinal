FROM php:8.2-fpm

RUN apt-get update && apt-get install -y \
    git \
    curl \
    libpng-dev \
    libonig-dev \
    libxml2-dev \
    zip \
    unzip \
    && curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

WORKDIR /var/www/html
COPY . .
RUN composer install --no-dev --optimize-autoloader

# Activa errores para depurar
RUN echo "display_errors = On" >> /usr/local/etc/php/php.ini
RUN echo "display_startup_errors = On" >> /usr/local/etc/php/php.ini
RUN echo "error_reporting = E_ALL" >> /usr/local/etc/php/php.ini

# Usa el puerto asignado por Render
CMD ["sh", "-c", "php -S 0.0.0.0:${PORT:-8000} index.php"]