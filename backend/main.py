"""
main.py — Entrypoint FastAPI do SmartZoo Backend

Inicializa o banco de dados, configura CORS e registra os routers.
Execute com:
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import logging

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from routers.cages import router as cages_router
from routers.chat import router as chat_router
from routers.route import router as route_router

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="SmartZoo API",
    description="API REST do sistema SmartZoo — monitoramento inteligente de animais via IoT.",
    version="1.0.0",
)

# CORS — permite qualquer origem (frontend local / totem)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(cages_router)
app.include_router(chat_router)
app.include_router(route_router)


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
@app.on_event("startup")
def on_startup():
    logger.info("Inicializando banco de dados...")
    init_db()
    logger.info("SmartZoo API pronta.")


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/health", tags=["system"])
def health_check():
    return {"status": "ok", "service": "smartzoo-api"}


# ---------------------------------------------------------------------------
# Entry point direto
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
