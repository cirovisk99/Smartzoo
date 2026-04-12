"""
models.py — Schemas Pydantic v2 do SmartZoo Backend
"""

from __future__ import annotations
from typing import List, Optional, Any
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Cage / Status
# ---------------------------------------------------------------------------

class CageStatus(BaseModel):
    cage_id: str
    animal_name: str
    species: Optional[str] = None
    status: str
    activity_level: float
    animal_count: Optional[int] = None
    zone: Optional[str] = None
    zone_label: Optional[str] = None
    last_update: str
    location_x: Optional[float] = None
    location_y: Optional[float] = None


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

class HourlyActivity(BaseModel):
    hour: str
    active_ratio: float
    count: int


class CageHistory(BaseModel):
    cage_id: str
    history: List[HourlyActivity]


# ---------------------------------------------------------------------------
# Route suggestion
# ---------------------------------------------------------------------------

class RouteItem(BaseModel):
    order: int
    cage_id: str
    animal_name: str
    expected_activity: float


class RouteSuggestion(BaseModel):
    generated_at: str
    route: List[RouteItem]


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="Pergunta do visitante")
    voice: bool = Field(False, description="Se verdadeiro, usa prompt otimizado para resposta em voz (breve, sem markdown)")


class ChatResponse(BaseModel):
    response: str


# ---------------------------------------------------------------------------
# Command
# ---------------------------------------------------------------------------

class CageCommand(BaseModel):
    action: str = Field(..., description="'snapshot' | 'reboot' | 'set_interval'")
    value: Optional[Any] = None


class CageCommandResponse(BaseModel):
    sent: bool
    topic: str


# ---------------------------------------------------------------------------
# Generic error
# ---------------------------------------------------------------------------

class ErrorResponse(BaseModel):
    detail: str
