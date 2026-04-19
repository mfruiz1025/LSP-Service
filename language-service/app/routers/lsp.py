# lsp.py
# Define los endpoints HTTP que expone el servicio.

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services import lifecycle

router = APIRouter(prefix="/lsp", tags=["lsp"])

class CreateRequest(BaseModel):
    language: str

@router.post("/{project_id}")
def create_lsp(project_id: str, body: CreateRequest):
    """Crea un contenedor LSP para el proyecto."""
    try:
        container_id = lifecycle.create_container(project_id, body.language)
        return {
            "message": "Contenedor creado exitosamente",
            "project_id": project_id,
            "container_id": container_id[:12],
            "language": body.language
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{project_id}")
def destroy_lsp(project_id: str):
    """Destruye el contenedor LSP de un proyecto."""
    try:
        lifecycle.destroy_container(project_id)
        return {
            "message": "Contenedor eliminado exitosamente",
            "project_id": project_id
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{project_id}")
def get_status(project_id: str):
    """Retorna el estado del contenedor LSP de un proyecto."""
    return lifecycle.get_status(project_id)


@router.get("/")
def list_all():
    """Lista todos los contenedores activos."""
    from app.services.registry import get_all
    return get_all()