# registry.py
# Mantiene en memoria el registro de todos los contenedores LSP activos.
# Estructura: { project_id: { "container_id": str, "language": str } }

_registry: dict = {}

def add(project_id: str, container_id: str, language: str):
    """Registra un contenedor nuevo."""
    _registry[project_id] = {
        "container_id": container_id,
        "language": language
    }

def get(project_id: str) -> dict | None:
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