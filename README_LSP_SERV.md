# USO DEL SERVIDOR DE LENGUAJE (API)

Este servicio expone un API HTTP (FastAPI) que crea y destruye contenedores Docker con el LSP correspondiente (python/cpp/typescript).

## Requisitos

- Python 3
- Docker Engine (daemon corriendo) y acceso al socket de Docker

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

## 3) Arrancar el servidor

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
