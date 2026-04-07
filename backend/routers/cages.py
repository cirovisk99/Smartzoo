"""
routers/cages.py — Endpoints relacionados às jaulas.

GET  /api/status                   → status atual de todas as jaulas
GET  /api/cage/{id}/history        → histórico 24h agrupado por hora
GET  /api/cage/{id}/snapshot       → retorna última imagem (JPEG)
POST /api/cage/{id}/cmd            → publica comando via MQTT
"""

from __future__ import annotations

import json
import logging
import os

import paho.mqtt.publish as mqtt_publish
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from config import MQTT_BROKER_HOST, MQTT_BROKER_PORT
from database import (
    get_cage_history_24h,
    get_latest_snapshot,
    get_latest_status_all,
)
from models import CageCommand, CageCommandResponse, CageHistory, CageStatus, HourlyActivity

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["cages"])


# ---------------------------------------------------------------------------
# GET /api/status
# ---------------------------------------------------------------------------

@router.get("/status", response_model=list[CageStatus])
def get_all_status():
    """Retorna o status mais recente de todas as jaulas."""
    try:
        rows = get_latest_status_all()
        return [CageStatus(**row) for row in rows]
    except Exception as exc:
        logger.exception("Erro em GET /api/status")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# GET /api/cage/{id}/history
# ---------------------------------------------------------------------------

@router.get("/cage/{cage_id}/history", response_model=CageHistory)
def get_cage_history(cage_id: str):
    """Histórico de atividade das últimas 24h, agrupado por hora."""
    try:
        rows = get_cage_history_24h(cage_id)
        history = [
            HourlyActivity(
                hour=row["hour"],
                active_ratio=round(float(row["active_ratio"]), 4),
                count=int(row["count"]),
            )
            for row in rows
        ]
        return CageHistory(cage_id=cage_id, history=history)
    except Exception as exc:
        logger.exception("Erro em GET /api/cage/%s/history", cage_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# GET /api/cage/{id}/snapshot
# ---------------------------------------------------------------------------

@router.get("/cage/{cage_id}/snapshot")
def get_cage_snapshot(cage_id: str):
    """Retorna a imagem JPEG mais recente da jaula."""
    try:
        snap = get_latest_snapshot(cage_id)
        if not snap:
            raise HTTPException(status_code=404, detail="Nenhum snapshot disponível para esta jaula.")

        image_path = snap["image_path"]
        if not os.path.isfile(image_path):
            raise HTTPException(
                status_code=404,
                detail=f"Arquivo de imagem não encontrado: {image_path}",
            )

        return FileResponse(image_path, media_type="image/jpeg")
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Erro em GET /api/cage/%s/snapshot", cage_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# POST /api/cage/{id}/cmd
# ---------------------------------------------------------------------------

@router.post("/cage/{cage_id}/cmd", response_model=CageCommandResponse)
def send_cage_command(cage_id: str, body: CageCommand):
    """Publica um comando no tópico MQTT da jaula."""
    topic = f"zoo/cage/{cage_id}/cmd"
    payload = {"action": body.action}
    if body.value is not None:
        payload["value"] = body.value

    try:
        mqtt_publish.single(
            topic=topic,
            payload=json.dumps(payload),
            hostname=MQTT_BROKER_HOST,
            port=MQTT_BROKER_PORT,
        )
        logger.info("Comando publicado → %s : %s", topic, payload)
        return CageCommandResponse(sent=True, topic=topic)
    except Exception as exc:
        logger.exception("Erro ao publicar comando MQTT para %s", cage_id)
        raise HTTPException(status_code=500, detail=f"Falha ao enviar comando MQTT: {exc}") from exc
