# lsp.py
# Define los endpoints HTTP que expone el servicio.

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional
from app.services import lifecycle

router = APIRouter(prefix="/lsp", tags=["lsp"])

class CreateRequest(BaseModel):
    language: str = Field(..., description="Lenguaje de programación (python, cpp, typescript)")
    max_clients: Optional[int] = Field(4, ge=1, le=10, description="Número máximo de clientes concurrentes")

class CreateResponse(BaseModel):
    message: str
    project_id: str
    container_id: str
    language: str
    ws_url: str
    ws_port: int
    max_clients: int

class StatusResponse(BaseModel):
    project_id: str
    container_id: Optional[str] = None
    language: Optional[str] = None
    status: str
    ws_url: Optional[str] = None
    ws_port: Optional[int] = None
    max_clients: Optional[int] = None
    active_connections: Optional[int] = None
    created_at: Optional[str] = None

@router.post("/{project_id}", response_model=CreateResponse)
def create_lsp(project_id: str, body: CreateRequest):
    """
    Crea un contenedor LSP multiplexor para el proyecto.
    
    El contenedor expone un WebSocket en `ws_url` que puede ser usado por hasta
    `max_clients` clientes concurrentes que compartirán la misma instancia del LSP.
    """
    try:
        container_info = lifecycle.create_container(
            project_id, 
            body.language,
            max_clients=body.max_clients
        )
        
        return {
            "message": f"Contenedor LSP creado exitosamente (máx {body.max_clients} clientes)",
            "project_id": project_id,
            "container_id": container_info["container_id"][:12],
            "language": body.language,
            "ws_url": container_info["ws_url"],
            "ws_port": container_info["ws_port"],
            "max_clients": body.max_clients
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.delete("/{project_id}")
def destroy_lsp(project_id: str):
    """Destruye el contenedor LSP de un proyecto."""
    try:
        deleted = lifecycle.destroy_container(project_id)
        if not deleted:
            raise HTTPException(status_code=404, detail=f"No existe contenedor para {project_id}")
        
        return {
            "message": "Contenedor eliminado exitosamente",
            "project_id": project_id
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/{project_id}", response_model=StatusResponse)
def get_status(project_id: str):
    """Retorna el estado detallado del contenedor LSP de un proyecto."""
    try:
        return lifecycle.get_status(project_id)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/{project_id}/logs")
def get_logs(project_id: str, tail: int = Query(100, description="Número de líneas de log a retornar")):
    """Obtiene los logs del contenedor para debugging."""
    try:
        logs = lifecycle.get_container_logs(project_id, tail=tail)
        return {"project_id": project_id, "logs": logs}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/")
def list_all():
    """Lista todos los contenedores activos con su información detallada."""
    from app.services.registry import get_all
    
    containers = get_all()
    
    # Enriquecer con estado actual
    detailed_list = []
    for project_id in containers:
        try:
            status = lifecycle.get_status(project_id)
            detailed_list.append(status)
        except Exception as e:
            detailed_list.append({
                "project_id": project_id,
                "status": "error",
                "error": str(e)
            })
    
    return {
        "total": len(detailed_list),
        "containers": detailed_list
    }


@router.post("/cleanup")
def cleanup_inactive(idle_timeout: int = Query(1800, description="Timeout de inactividad en segundos")):
    """
    Limpia contenedores inactivos.
    Útil para liberar recursos automáticamente.
    """
    cleaned = lifecycle.cleanup_inactive_containers(idle_timeout)
    return {
        "message": f"Limpieza completada",
        "containers_cleaned": cleaned
    }