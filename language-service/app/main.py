from dotenv import load_dotenv
from fastapi import FastAPI
from app.routers import lsp
import os

# Cargar variables del archivo .env
load_dotenv()

# Ahora puedes acceder a ellas
PROJECTS_DIR = os.getenv("PROJECTS_DIR", os.path.expanduser("~/projects"))
WS_PUBLIC_HOST = os.getenv("WS_PUBLIC_HOST", "127.0.0.1")

app = FastAPI(title="LSP Management Service")

app.include_router(lsp.router)

@app.get("/health")
def health():
    return {"status": "ok"}