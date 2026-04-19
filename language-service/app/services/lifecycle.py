# lifecycle.py
# Se comunica con Docker para crear, iniciar y destruir contenedores LSP.
import os
import docker
from app.services import registry

client = docker.from_env()

LANGUAGES = ["python", "cpp", "typescript"]

def create_container(project_id: str, language: str) -> str:
    if language not in LANGUAGES:
        raise ValueError(f"Lenguaje no soportado: {language}. Usa: {LANGUAGES}")

    if registry.exists(project_id):
        raise ValueError(f"El proyecto {project_id} ya tiene un contenedor activo.")

    # Crea la carpeta del proyecto en tu Mac si no existe
    project_path = os.path.expanduser(f"~/projects/{project_id}")
    os.makedirs(project_path, exist_ok=True)

    container = client.containers.run(
        "lsp-server:latest",
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

    container = client.containers.get(entry["container_id"])
    container.remove(force=True)
    registry.remove(project_id)


def get_status(project_id: str) -> dict:
    entry = registry.get(project_id)
    if not entry:
        return {"status": "not_found"}

    container = client.containers.get(entry["container_id"])
    return {
        "project_id": project_id,
        "container_id": entry["container_id"][:12],
        "language": entry["language"],
        "status": container.status
    }