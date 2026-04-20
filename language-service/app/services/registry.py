# registry.py
# Mantiene en memoria el registro de todos los contenedores LSP activos.

from datetime import datetime
from typing import Optional, Dict, Any

_registry: dict = {}

def add(project_id: str, container_id: str, language: str, 
        ws_port: int = None, ws_url: str = None, max_clients: int = 4):
    """Registra un contenedor nuevo."""
    _registry[project_id] = {
        "container_id": container_id,
        "language": language,
        "ws_port": ws_port,
        "ws_url": ws_url,
        "max_clients": max_clients,
        "created_at": datetime.utcnow().isoformat()
    }

def get(project_id: str) -> Optional[Dict[str, Any]]:
    """Retorna la info del contenedor de un proyecto, o None si no existe."""
    return _registry.get(project_id)

def remove(project_id: str):
    """Elimina el registro de un proyecto."""
    _registry.pop(project_id, None)

def get_all() -> dict:
    """Retorna todos los contenedores activos."""
    return dict(_registry)

def exists(project_id: str) -> bool:
    """Verifica si un proyecto ya tiene un contenedor activo."""
    return project_id in _registry
