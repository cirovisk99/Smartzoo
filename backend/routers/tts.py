"""
routers/tts.py — Endpoint de síntese de voz (TTS) via edge-tts.

POST /api/tts  → recebe texto, retorna MP3
"""

from __future__ import annotations

import io
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["tts"])

VOICE = "pt-BR-ThalitaNeural"


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1)


@router.post("/tts")
async def synthesize(body: TTSRequest):
    """Converte texto em fala (MP3) usando edge-tts (Microsoft Neural TTS)."""
    try:
        import edge_tts  # type: ignore

        communicate = edge_tts.Communicate(body.text, VOICE)
        buf = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buf.write(chunk["data"])
        buf.seek(0)

        if buf.getbuffer().nbytes == 0:
            raise RuntimeError("edge-tts não retornou áudio.")

        return StreamingResponse(
            buf,
            media_type="audio/mpeg",
            headers={"Cache-Control": "no-cache"},
        )
    except Exception as exc:
        logger.error("Erro no TTS: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
