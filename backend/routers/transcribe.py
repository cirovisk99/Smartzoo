"""
routers/transcribe.py — Endpoint de transcrição de voz com Vosk.

POST /api/transcribe  → recebe arquivo de áudio, retorna texto transcrito
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

from services.stt_service import transcribe

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["transcribe"])


class TranscribeResponse(BaseModel):
    text: str


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(audio: UploadFile = File(...)):
    """
    Recebe um arquivo de áudio (webm, wav, ogg, etc.) e retorna o texto transcrito.
    """
    try:
        audio_bytes = await audio.read()
        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Arquivo de áudio vazio.")

        text = transcribe(audio_bytes)
        logger.info("Transcrição: '%s'", text)
        return TranscribeResponse(text=text)

    except RuntimeError as exc:
        logger.error("Erro na transcrição: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Erro inesperado na transcrição")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
