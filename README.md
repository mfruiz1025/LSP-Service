# USO DEL SERVIDOR DE LENGUAJE (API)

Este servicio expone un API HTTP (FastAPI) que crea y destruye contenedores Docker con el LSP correspondiente (python/cpp/typescript).

## Requisitos
- Python 3.10+
- Docker Engine con acceso al socket
- Node.js 20+ (para construir la imagen)


### Docker (daemon + permisos)

En Linux con systemd:

```
sudo systemctl enable --now docker.socket
sudo systemctl enable --now docker.service
```

Permisos para usar Docker sin `sudo`:

```
sudo usermod -aG docker $USER
newgrp docker  # o cierra sesión y vuelve a entrar
docker ps
```

## 1) Construir la imagen del contenedor LSP

El API usa la imagen local `lsp-server:latest` (no hace pull).

```
cd lsp-container
docker build -t lsp-server:latest .
```

Si `docker images` muestra la imagen pero el API dice que no existe, revisa que estés usando el mismo Docker daemon/context:

```
docker context show
```

## 2) Instalar dependencias del API

```
pip3 install -r require.txt
```

### 3) Configurar Variables de Entorno

Modificar archivo `.env` en `language-service/`:

```bash
PROJECTS_DIR=/home/$USER/projects
WS_PUBLIC_HOST=127.0.0.1
CONTAINER_IDLE_TIMEOUT=300000
MAX_CLIENTS_PER_CONTAINER=4
```

## 4) Arrancar el servidor

```
cd language-service
python3 -m uvicorn app.main:app --reload --port 8000
```

## Peticiones de ejemplo

Crear contenedor LSP:

```
curl -X POST http://127.0.0.1:8000/lsp/proyecto-1 \
  -H "Content-Type: application/json" \
  -d '{"language": "python"}'
```

Consultar estado:

```
curl http://127.0.0.1:8000/lsp/proyecto-1
```

Eliminar contenedor:

```
curl -X DELETE http://127.0.0.1:8000/lsp/proyecto-1
```

## Volumen del proyecto (workspace)

Por defecto se monta `${PROJECTS_DIR:-~/projects}/<project_id>` en el contenedor como `/workspace`.

Si el servicio corre como otro usuario (p. ej. root/systemd), configura `PROJECTS_DIR` para fijar la ruta base:

```
export PROJECTS_DIR=/home/simondm/projects
```

# USO DEL CONTENEDOR DEL LSP (manual)

El propósito de usar el contenedor manualmente es solo para probar su funcionamiento; en operación normal debe ser controlado por el API.

**Python (TCP 2087)**

```
docker run --rm -e LANGUAGE=python -p 2087:2087 lsp-server:latest
```

**C++**

```
docker run --rm -it -e LANGUAGE=cpp lsp-server:latest
```

**Typescript**

```
docker run --rm -it -e LANGUAGE=typescript lsp-server:latest
```

## Pruebas (ps + grep) dentro del contenedor

En otra terminal, obtén el ID del contenedor:

```
docker ps
```

Y valida el proceso según el lenguaje:

**Python**

```
docker exec <ID_CONTENEDOR> bash -lc "ps aux | grep -E '[p]ylsp'"
```

**C++**

```
docker exec <ID_CONTENEDOR> bash -lc "ps aux | grep -E '[c]langd'"
```

**Typescript**

```
docker exec <ID_CONTENEDOR> bash -lc "ps aux | grep -E '[t]ypescript-language-server|[n]ode.*typescript-language-server'"
```

## 📁 Estructura del Proyecto

```
LSP-Service/
├── language-service/           # API FastAPI para gestión de contenedores
│   ├── app/
│   │   ├── main.py            # Punto de entrada de la API
│   │   ├── routers/
│   │   │   └── lsp.py         # Endpoints REST
│   │   └── services/
│   │       ├── lifecycle.py   # Gestión de contenedores Docker
│   │       └── registry.py    # Registro en memoria de contenedores activos
│   └── .env                   # Variables de entorno (WS_PUBLIC_HOST, PROJECTS_DIR)
├── lsp-container/              # Imagen Docker del multiplexor LSP
│   ├── Dockerfile             # Definición de la imagen
│   ├── entrypoint.sh          # Script de entrada
│   ├── package.json           # Dependencias Node.js
│   ├── server.js              # Multiplexor WebSocket → LSP
│   └── config/
│       └── lsp-servers.js     # Configuración de lenguajes soportados
└── tests/                     # Scripts de prueba
    ├── persistent_client.py   # Cliente persistente reutilizable
    ├── test_clients.py        # Script principal de pruebas
    ├── test_single_client.py  # Cliente interactivo manual
    └── test_conect_limits.sh  # Prueba de límites de conexiones
```

## 📡 Endpoints de la API

### Crear Contenedor LSP

```bash
POST /lsp/{project_id}
Content-Type: application/json

{
    "language": "python",     # python | cpp | typescript
    "max_clients": 4          # opcional, default: 4
}
```

**Respuesta:**
```json
{
    "message": "Contenedor LSP creado exitosamente (máx 4 clientes)",
    "project_id": "test-project",
    "container_id": "1c9a1d4353db",
    "language": "python",
    "ws_url": "ws://127.0.0.1:32768",
    "ws_port": 32768,
    "max_clients": 4
}
```

### Consultar Estado

```bash
GET /lsp/{project_id}
```

### Listar Contenedores Activos

```bash
GET /lsp/
```

### Eliminar Contenedor

```bash
DELETE /lsp/{project_id}
```

### Ver Logs del Contenedor

```bash
GET /lsp/{project_id}/logs?tail=100
```

### Limpiar Contenedores Inactivos

```bash
POST /lsp/cleanup?idle_timeout=1800
```
## Monitoreo contenedor

# 1. Ver logs del contenedor (follow mode)
docker logs -f nombre_del_contenedor

# 2. Ver logs con timestamps
docker logs -t nombre_del_contenedor

# 3. Ver últimos N líneas
docker logs --tail 100 nombre_del_contenedor

# 4. Ver logs con detalles adicionales
docker logs --details nombre_del_contenedor

### Recursos

# 5. Estadísticas de CPU/Memoria del contenedor
docker stats nombre_del_contenedor

# 6. Todos los contenedores LSP
docker stats --filter "name=lsp"

# 7. Ver procesos dentro del contenedor
docker exec nombre_del_contenedor ps aux

# 8. Ver procesos LSP específicos
docker exec nombre_del_contenedor ps aux | grep -E "pylsp|clangd|typescript"

## 🧪 Pruebas

### Scripts de Prueba Disponibles

| Script | Propósito |
|--------|-----------|
| `test_single_client.py` | Cliente interactivo para pruebas manuales |
| `test_clients.py` | Script principal con modos `-p` (persistente), `-e` (extra), `-m` (múltiple) |
| `test_conect_limits.sh` | Prueba automatizada de límites de conexiones |

### Ejemplos de Uso

```bash
cd tests/

# Cliente interactivo (modo manual con menú)
python3 test_single_client.py ws://127.0.0.1:32768

# Cliente persistente individual
python3 test_clients.py -p 32768 1

# Probar conexión extra (verificar límite)
python3 test_clients.py -e 32768

# Lanzar múltiples clientes persistentes
python3 test_clients.py -m 32768 4

# Prueba completa de límites
./test_conect_limits.sh 32768 4
```

### Prueba Rápida con cURL

```bash
# Crear contenedor
curl -X POST http://localhost:8000/lsp/test-project \
  -H "Content-Type: application/json" \
  -d '{"language": "python", "max_clients": 4}'

# Conectar vía WebSocket (usar ws_url de la respuesta)
wscat -c ws://127.0.0.1:32768

# Enviar mensajes LSP
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"processId":null,"rootUri":"file:///workspace","capabilities":{}}}
{"jsonrpc":"2.0","method":"initialized","params":{}}
{"jsonrpc":"2.0","method":"textDocument/didOpen","params":{"textDocument":{"uri":"file:///workspace/test.py","languageId":"python","version":1,"text":"import os\nos.path."}}}
{"jsonrpc":"2.0","id":2,"method":"textDocument/completion","params":{"textDocument":{"uri":"file:///workspace/test.py"},"position":{"line":1,"character":8}}}
```


## 🔧 Lenguajes Soportados

| Lenguaje | Servidor LSP | Comando | Puerto |
|----------|-------------|---------|--------|
| Python | `pylsp` | `pylsp` | 3000 |
| C++ | `clangd` | `clangd --compile-commands-dir=/workspace` | 3000 |
| TypeScript | `typescript-language-server` | `typescript-language-server --stdio` | 3000 |

## 📊 Características Principales

- **Multiplexor WebSocket**: Un solo puerto expuesto (3000) maneja hasta 4 clientes concurrentes
- **Instancia LSP compartida**: Todos los clientes comparten el mismo proceso LSP
- **Aislamiento por proyecto**: Un contenedor por `project_id`
- **Mapeo dinámico de puertos**: El host asigna puertos aleatorios automáticamente
- **Limpieza automática**: Contenedores inactivos se detienen tras timeout configurable
- **Traducción de rutas**: Manejo automático de `file:///workspace` ↔ `/workspace`

# TODO
## 1. PROBAR CON ANGULAR
## 2. AUTENTIFICACION CON EL API GATEWAY