# lifecycle.py
# Se comunica con Docker para crear, iniciar y destruir contenedores LSP.
import logging
import os
import docker
from docker.errors import DockerException, ImageNotFound
from app.services import registry

logger = logging.getLogger(__name__)
_client = None

LANGUAGES = ["python", "cpp", "typescript"]

def _get_client():
    global _client
    if _client is not None:
        return _client
    try:
        _client = docker.from_env()
        return _client
    except PermissionError as e:
        logger.exception(
            "Permiso denegado conectando con Docker (DOCKER_HOST=%r)",
            os.environ.get("DOCKER_HOST"),
        )
        raise RuntimeError(
            "Permiso denegado al acceder a Docker. Asegúrate de que tu usuario tenga "
            "acceso a `/var/run/docker.sock` (p. ej. agregarlo al grupo `docker` con "
            "`sudo usermod -aG docker $USER` y luego cerrar sesión/`newgrp docker`)."
        ) from e
    except (DockerException, PermissionError, OSError) as e:
        logger.exception(
            "Fallo conectando con Docker (DOCKER_HOST=%r)",
            os.environ.get("DOCKER_HOST"),
        )
        raise RuntimeError(
            f"Docker no está disponible o no hay permisos para acceder al daemon. "
            f"({type(e).__name__}: {e})"
        ) from e

def create_container(project_id: str, language: str) -> str:
    if language not in LANGUAGES:
        raise ValueError(f"Lenguaje no soportado: {language}. Usa: {LANGUAGES}")

    if registry.exists(project_id):
        raise ValueError(f"El proyecto {project_id} ya tiene un contenedor activo.")

    # Crea la carpeta del proyecto si no existe
    # Nota: si el servicio corre como otro usuario (p. ej. root/systemd), `~` cambia.
    projects_dir = os.environ.get("PROJECTS_DIR") or os.path.expanduser("~/projects")
    project_path = os.path.join(projects_dir, project_id)
    os.makedirs(project_path, exist_ok=True)

    client = _get_client()
    image = "lsp-server:latest"
    try:
        # Evita que docker-py intente hacer `pull` (puede fallar por credstore) si la imagen no existe.
        client.images.get(image)
    except ImageNotFound as e:
        raise ValueError(
            f"No existe la imagen Docker `{image}`. "
            f"(daemon={getattr(getattr(client, 'api', None), 'base_url', 'unknown')}). "
            "Constrúyela primero con: `cd lsp-container && docker build -t lsp-server:latest .`. "
            "Si `docker images` sí la muestra, probablemente estás usando otro Docker context/daemon: "
            "verifica `docker context show` y el `DOCKER_HOST` con el que arrancas uvicorn."
        ) from e

    container = client.containers.run(
        image,
        detach=True,
        environment={"LANGUAGE": language},
        volumes={
            project_path: {
                "bind": "/workspace",
                "mode": "rw"
            }
        },
        labels={
            "project_id": project_id,
            "language": language
        }
    )

    registry.add(project_id, container.id, language)
    return container.id


def destroy_container(project_id: str):
    entry = registry.get(project_id)
    if not entry:
        raise ValueError(f"No existe contenedor para el proyecto {project_id}.")

    client = _get_client()
    container = client.containers.get(entry["container_id"])
    container.remove(force=True)
    registry.remove(project_id)


def get_status(project_id: str) -> dict:
    entry = registry.get(project_id)
    if not entry:
        return {"status": "not_found"}

    client = _get_client()
    container = client.containers.get(entry["container_id"])
    return {
        "project_id": project_id,
        "container_id": entry["container_id"][:12],
        "language": entry["language"],
        "status": container.status
    }
