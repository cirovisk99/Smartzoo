"""
ai_service.py — Integração com Gemini (google-generativeai) ou OpenAI.
Inclui cache em memória com TTL de 5 minutos.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from typing import Dict, Tuple

from config import (
    AI_CACHE_TTL,
    AI_PROVIDER,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    OPENAI_API_KEY,
    OPENAI_MODEL,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Cache simples em memória  {chave: (resposta, timestamp)}
# ---------------------------------------------------------------------------
_cache: Dict[str, Tuple[str, float]] = {}


def _cache_key(text: str) -> str:
    """Normaliza a pergunta e retorna um hash SHA-256 curto."""
    normalized = re.sub(r"[^\w\s]", "", text.lower().strip())
    normalized = re.sub(r"\s+", " ", normalized)
    return hashlib.sha256(normalized.encode()).hexdigest()[:16]


def _get_cached(key: str) -> str | None:
    if key in _cache:
        response, ts = _cache[key]
        if time.time() - ts < AI_CACHE_TTL:
            logger.debug("Cache hit para chave %s", key)
            return response
        del _cache[key]
    return None


def _set_cache(key: str, response: str) -> None:
    _cache[key] = (response, time.time())


# ---------------------------------------------------------------------------
# Prompt de sistema
# ---------------------------------------------------------------------------

SYSTEM_PROMPT_TEMPLATE = """Você é o guia virtual do SmartZoo. Responda perguntas sobre os animais do zoo \
de forma educativa e amigável para visitantes de todas as idades.

Contexto atual do zoo:
{context_json}

Use os dados de atividade histórica para enriquecer suas respostas quando relevante.
Responda em português. Seja conciso (máximo 3 parágrafos)."""

VOICE_SYSTEM_PROMPT_TEMPLATE = """Você é o guia virtual do SmartZoo. Sua resposta será lida em voz alta \
para visitantes, então siga estas regras:
- Responda em no máximo 2 frases curtas e diretas
- Use linguagem natural e coloquial, adequada para todas as idades
- Não use listas, asteriscos, hashtags, markdown ou qualquer formatação especial
- Se o visitante perguntar sobre animais ativos, mencione nome e localização (zona/setor)
- Se perguntar sobre um animal específico, mencione se está ativo ou dormindo agora

Contexto atual do zoo (animais, status e localização):
{context_json}

Responda em português do Brasil."""

FALLBACK_RESPONSE = (
    "Desculpe, nosso guia virtual está temporariamente indisponível. "
    "Mas posso dizer que nosso zoo tem animais incríveis esperando por você! "
    "Consulte nosso totem para ver o status ao vivo de cada jaula."
)


def _build_context(zoo_context: list) -> str:
    """Serializa o contexto do zoo para inserção no prompt."""
    return json.dumps(zoo_context, ensure_ascii=False, indent=2)


# ---------------------------------------------------------------------------
# Providers
# ---------------------------------------------------------------------------

def _call_gemini(system_prompt: str, user_message: str) -> str:
    try:
        from google import genai  # type: ignore

        client = genai.Client(api_key=GEMINI_API_KEY)
        full_prompt = f"{system_prompt}\n\nPergunta do visitante: {user_message}"
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=full_prompt,
        )
        return response.text.strip()
    except Exception as exc:
        logger.error("Erro ao chamar Gemini API: %s", exc)
        raise


def _call_openai(system_prompt: str, user_message: str) -> str:
    try:
        from openai import OpenAI  # type: ignore

        client = OpenAI(api_key=OPENAI_API_KEY)
        completion = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
        )
        return completion.choices[0].message.content.strip()
    except Exception as exc:
        logger.error("Erro ao chamar OpenAI API: %s", exc)
        raise


# ---------------------------------------------------------------------------
# Função pública
# ---------------------------------------------------------------------------

def ask_ai(message: str, zoo_context: list, voice: bool = False) -> str:
    """
    Envia uma pergunta ao provedor de IA configurado,
    com contexto do zoo. Usa cache e fallback automático.
    Quando voice=True, usa prompt otimizado para respostas curtas sem markdown.
    """
    cache_key = _cache_key(message + ("_v" if voice else ""))

    # Verificar cache
    cached = _get_cached(cache_key)
    if cached:
        return cached

    # Verificar configuração da API
    if AI_PROVIDER == "gemini" and not GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY não configurada. Retornando fallback.")
        return FALLBACK_RESPONSE

    if AI_PROVIDER == "openai" and not OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY não configurada. Retornando fallback.")
        return FALLBACK_RESPONSE

    context_json = _build_context(zoo_context)
    template = VOICE_SYSTEM_PROMPT_TEMPLATE if voice else SYSTEM_PROMPT_TEMPLATE
    system_prompt = template.format(context_json=context_json)

    try:
        if AI_PROVIDER == "openai":
            response = _call_openai(system_prompt, message)
        else:
            response = _call_gemini(system_prompt, message)

        _set_cache(cache_key, response)
        return response

    except Exception:
        logger.warning("Falha na API de IA. Retornando resposta de fallback.")
        return FALLBACK_RESPONSE
