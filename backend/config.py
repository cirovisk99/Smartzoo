"""
config.py — Configurações centrais do SmartZoo Backend
Carrega variáveis de ambiente via python-dotenv.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# MQTT
MQTT_BROKER_HOST: str = os.getenv("MQTT_BROKER_HOST", "localhost")
MQTT_BROKER_PORT: int = int(os.getenv("MQTT_BROKER_PORT", "1883"))
MQTT_CLIENT_ID_SUBSCRIBER: str = os.getenv("MQTT_CLIENT_ID_SUBSCRIBER", "smartzoo-subscriber")
MQTT_CLIENT_ID_API: str = os.getenv("MQTT_CLIENT_ID_API", "smartzoo-api")

# Banco de dados
DB_PATH: str = os.getenv("DB_PATH", "./smartzoo.db")

# Diretório de snapshots
SNAPSHOTS_DIR: str = os.getenv("SNAPSHOTS_DIR", "./snapshots")

# IA
AI_PROVIDER: str = os.getenv("AI_PROVIDER", "gemini")  # "gemini" | "openai"
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

# Cache de respostas da IA (TTL em segundos)
AI_CACHE_TTL: int = int(os.getenv("AI_CACHE_TTL", "300"))  # 5 minutos

# Timeout de heartbeat: jaulas sem mensagem por mais que isso são marcadas como inactive
CAGE_HEARTBEAT_TIMEOUT: int = int(os.getenv("CAGE_HEARTBEAT_TIMEOUT", "60"))  # segundos
