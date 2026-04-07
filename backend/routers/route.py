"""
routers/route.py — Endpoint de sugestão de roteiro.

GET /api/route/suggest → retorna roteiro ordenado por atividade esperada
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from models import RouteSuggestion
from services.route_service import get_route_suggestion

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["route"])


@router.get("/route/suggest", response_model=RouteSuggestion)
def suggest_route():
    """
    Retorna roteiro otimizado baseado na probabilidade de atividade
    de cada jaula no horário atual ± 1h (últimos 7 dias).
    """
    try:
        return get_route_suggestion()
    except Exception as exc:
        logger.exception("Erro em GET /api/route/suggest")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
