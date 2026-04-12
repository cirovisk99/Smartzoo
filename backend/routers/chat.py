"""
routers/chat.py — Endpoint do chatbot IA.

POST /api/chat   → recebe pergunta, responde com contexto do zoo via Gemini/OpenAI
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from database import get_activity_context_all
from models import ChatRequest, ChatResponse
from services.ai_service import ask_ai

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
def chat(body: ChatRequest):
    """
    Recebe uma pergunta do visitante, monta o contexto atual do zoo
    e chama a IA para gerar uma resposta em linguagem natural.
    """
    try:
        zoo_context = get_activity_context_all()
        answer = ask_ai(message=body.message, zoo_context=zoo_context, voice=body.voice)
        return ChatResponse(response=answer)
    except Exception as exc:
        logger.exception("Erro em POST /api/chat")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
