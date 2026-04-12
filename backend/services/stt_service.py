"""
stt_service.py — Transcrição de áudio via Gemini API (pt-BR).
"""

from __future__ import annotations

import logging
import os
import subprocess
import tempfile

from config import GEMINI_API_KEY, GEMINI_MODEL

logger = logging.getLogger(__name__)


def transcribe(audio_bytes: bytes) -> str:
    """
    Recebe bytes de áudio (qualquer formato suportado pelo ffmpeg),
    converte para MP3 e envia ao Gemini para transcrição.
    Retorna o texto transcrito.
    """
    from google import genai  # type: ignore
    from google.genai import types  # type: ignore

    # Converte para MP3 via ffmpeg (Gemini suporta mp3 nativamente)
    with tempfile.NamedTemporaryFile(suffix='.input', delete=False) as f:
        f.write(audio_bytes)
        input_path = f.name

    output_path = input_path + '.mp3'

    try:
        subprocess.run(
            [
                'ffmpeg', '-i', input_path,
                '-ar', '16000', '-ac', '1',
                '-b:a', '64k',
                output_path,
                '-y', '-loglevel', 'error',
            ],
            check=True,
        )

        with open(output_path, 'rb') as f:
            mp3_bytes = f.read()

        client = genai.Client(api_key=GEMINI_API_KEY)
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[
                types.Part.from_bytes(data=mp3_bytes, mime_type='audio/mp3'),
                (
                    "Transcreva este áudio em português do Brasil. "
                    "Retorne apenas o texto transcrito, sem pontuação excessiva, "
                    "sem explicações e sem aspas."
                ),
            ],
        )

        text = response.text.strip() if response.text else ''
        logger.info("Transcrição Gemini: '%s'", text)
        return text

    except subprocess.CalledProcessError as exc:
        logger.error("ffmpeg falhou: %s", exc)
        raise RuntimeError("Erro ao converter áudio.") from exc
    except Exception as exc:
        logger.error("Erro na transcrição Gemini: %s", exc)
        raise RuntimeError("Erro na transcrição.") from exc
    finally:
        if os.path.exists(input_path):
            os.unlink(input_path)
        if os.path.exists(output_path):
            os.unlink(output_path)
