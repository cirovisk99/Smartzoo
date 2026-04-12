"""
stt_service.py — Transcrição de áudio local com Vosk (offline, pt-BR).
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import tempfile
import wave

logger = logging.getLogger(__name__)

MODEL_PATH = os.path.join(os.path.dirname(__file__), '..', 'vosk-model-pt')
SAMPLE_RATE = 16000

_model = None


def _get_model():
    global _model
    if _model is None:
        if not os.path.isdir(MODEL_PATH):
            raise RuntimeError(
                f"Modelo Vosk não encontrado em: {MODEL_PATH}\n"
                "Execute no Pi:\n"
                "  cd ~/Smartzoo/backend\n"
                "  wget https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.zip\n"
                "  unzip vosk-model-small-pt-0.3.zip\n"
                "  mv vosk-model-small-pt-0.3 vosk-model-pt"
            )
        from vosk import Model  # type: ignore
        logger.info("Carregando modelo Vosk de: %s", MODEL_PATH)
        _model = Model(MODEL_PATH)
        logger.info("Modelo Vosk carregado.")
    return _model


def transcribe(audio_bytes: bytes) -> str:
    """
    Recebe bytes de áudio (qualquer formato suportado pelo ffmpeg),
    converte para WAV 16kHz mono e transcreve com Vosk.
    Retorna o texto transcrito (pode ser vazio se não entendeu nada).
    """
    from vosk import KaldiRecognizer  # type: ignore

    model = _get_model()

    # Salva áudio recebido em arquivo temporário
    with tempfile.NamedTemporaryFile(suffix='.audio', delete=False) as f:
        f.write(audio_bytes)
        input_path = f.name

    output_path = input_path + '.wav'

    try:
        # Converte para WAV 16kHz mono via ffmpeg
        subprocess.run(
            [
                'ffmpeg', '-i', input_path,
                '-ar', str(SAMPLE_RATE),
                '-ac', '1',
                '-f', 'wav',
                output_path,
                '-y', '-loglevel', 'error',
            ],
            check=True,
        )

        # Transcreve com Vosk
        with wave.open(output_path, 'rb') as wf:
            rec = KaldiRecognizer(model, wf.getframerate())
            text_parts = []

            while True:
                data = wf.readframes(4000)
                if not data:
                    break
                if rec.AcceptWaveform(data):
                    result = json.loads(rec.Result())
                    part = result.get('text', '').strip()
                    if part:
                        text_parts.append(part)

            final = json.loads(rec.FinalResult())
            part = final.get('text', '').strip()
            if part:
                text_parts.append(part)

        return ' '.join(text_parts)

    except subprocess.CalledProcessError as exc:
        logger.error("ffmpeg falhou ao converter áudio: %s", exc)
        raise RuntimeError("Erro ao converter áudio.") from exc
    finally:
        if os.path.exists(input_path):
            os.unlink(input_path)
        if os.path.exists(output_path):
            os.unlink(output_path)
