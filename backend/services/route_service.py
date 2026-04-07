"""
route_service.py — Lógica de sugestão de roteiro para visitantes.

Algoritmo:
  1. Obter hora atual H
  2. Para cada jaula, calcular active_ratio médio no banco
     WHERE hour(timestamp) BETWEEN H-1 AND H+1 (nos últimos 7 dias)
  3. Ordenar jaulas por active_ratio DESC
  4. Retornar lista ordenada como roteiro sugerido
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List

from database import get_route_activity_by_hour_window
from models import RouteItem, RouteSuggestion

logger = logging.getLogger(__name__)


def get_route_suggestion() -> RouteSuggestion:
    """
    Gera um roteiro sugerido ordenado por probabilidade de atividade
    no horário atual ± 1h.
    """
    now = datetime.now(tz=timezone.utc)
    current_hour = now.hour

    rows = get_route_activity_by_hour_window(current_hour)

    route: List[RouteItem] = []
    for idx, row in enumerate(rows, start=1):
        route.append(
            RouteItem(
                order=idx,
                cage_id=row["cage_id"],
                animal_name=row["animal_name"],
                expected_activity=round(float(row["expected_activity"]), 3),
            )
        )

    return RouteSuggestion(
        generated_at=now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        route=route,
    )
