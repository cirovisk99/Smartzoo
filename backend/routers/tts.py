"""
routers/tts.py — Endpoint de síntese de voz (TTS) via gTTS.

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


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1)


@router.post("/tts")
def synthesize(body: TTSRequest):
    """Converte texto em fala (MP3) usando gTTS."""
    try:
        from gtts import gTTS  # type: ignore

        tts = gTTS(text=body.text, lang='pt', slow=False)
        buf = io.BytesIO()
        tts.write_to_fp(buf)
        buf.seek(0)

        return StreamingResponse(
            buf,
            media_type="audio/mpeg",
            headers={"Cache-Control": "no-cache"},
        )
    except Exception as exc:
        logger.error("Erro no TTS: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
