# Migración a Oracle Cloud — Paso a paso

## 1. Crear cuenta en Oracle Cloud

1. Vaya a https://cloud.oracle.com y haga clic en "Start for free"
2. Complete el registro con sus datos
3. Ingrese la tarjeta (no se cobra, solo verificación)
4. Espere la confirmación por email (puede tardar minutos u horas)

## 2. Crear la VM (instancia Always Free)

1. Entre al dashboard de Oracle Cloud
2. Vaya a Compute → Instances → Create Instance
3. Configurar:
   - **Name**: evolution-server
   - **Image**: Canonical Ubuntu 22.04 (o 24.04)
   - **Shape**: Ampere A1 Flex (gratis)
     - OCPUs: 4
     - Memory: 24 GB
   - **Networking**: Create new VCN y subnet público
     - Marque "Assign a public IPv4 address"
   - **SSH keys**: Generate keypair y DESCARGUE la private key (.key)
4. Haga clic en "Create"
5. Espere a que el estado cambie a "Running" (2-3 minutos)
6. Anote la **IP pública** de la instancia

## 3. Abrir puertos en Oracle

1. Vaya a Networking → Virtual Cloud Networks → [su VCN] → Security Lists
2. Haga clic en "Add Ingress Rules":
   - Source CIDR: 0.0.0.0/0
   - IP Protocol: TCP
   - Destination Port: 8080
   - Haga clic en Add
3. Repita para puerto 443 (HTTPS) y 80 (HTTP)

## 4. Conectarse por SSH

Desde su computadora (usando la private key descargada):

```bash
ssh -i descarga.key ubuntu@IP_PUBLICA
```

## 5. Instalar Docker y Docker Compose

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose
sudo usermod -aG docker $USER
newgrp docker
```

## 6. Crear el docker-compose

```bash
mkdir -p ~/evolution && cd ~/evolution
nano docker-compose.yml
```

Pegue el contenido de `oracle/docker-compose.yml` (cambiando SERVER_URL por la IP pública).

## 7. Levantar Evolution API

```bash
docker-compose up -d
```

Verificar que está corriendo:
```bash
docker-compose ps
docker-compose logs -f evolution-api
```

## 8. Configurar HTTPS con Nginx + Let's Encrypt

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Crear config de Nginx:
```bash
sudo nano /etc/nginx/sites-available/evolution
```

Pegar:
```
server {
    listen 80;
    server_name IP_PUBLICA; # o dominio si tiene

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/evolution /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Si tiene dominio:
```bash
sudo certbot --nginx -d su-dominio.com
```

## 9. Verificar que Evolution API responde

```bash
curl http://localhost:8080
```

Desde el navegador: http://IP_PUBLICA:8080

## 10. Cambiar la URL en Sekunet

1. Entre al panel admin de Sekunet
2. Vaya a Configuración → Evolution API
3. Cambie la URL a: http://IP_PUBLICA:8080 (o https://su-dominio.com)
4. Guarde

## 11. Escanear QR de WhatsApp

1. En el panel admin, haga clic en "Obtener QR"
2. Escanee con el teléfono (WhatsApp → Dispositivos vinculados)
3. Listo

## Notas

- La BD de Neon ya no se usa — PostgreSQL local en Oracle la reemplaza
- Las instancias anteriores de WhatsApp se pierden (hay que escanear QR nuevo)
- La VM es gratis para siempre (Always Free tier)
- Si Oracle reinicia la VM, Docker la levanta sola (restart: always)
