from fastapi import FastAPI
from app.routers import lsp

app = FastAPI(title="LSP Management Service")

app.include_router(lsp.router)

@app.get("/health")
def health():
    return {"status": "ok"}