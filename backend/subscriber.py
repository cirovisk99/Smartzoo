"""
subscriber.py — Loop MQTT subscriber do SmartZoo Backend

Consome tópicos:
  zoo/cage/+/status    → activity_log
  zoo/cage/+/snapshot  → snapshots (JPEG salvo em disco)

Reconexão automática em caso de queda do broker.

Execute com:
    python subscriber.py
"""

from __future__ import annotations

import base64
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone

import paho.mqtt.client as mqtt

# Ajusta o path para importar módulos do backend quando rodando standalone
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import (
    MQTT_BROKER_HOST,
    MQTT_BROKER_PORT,
    MQTT_CLIENT_ID_SUBSCRIBER,
    SNAPSHOTS_DIR,
)
from database import (
    get_zone_label,
    init_db,
    insert_activity,
    insert_snapshot,
    upsert_cage_minimal,
)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tópicos
# ---------------------------------------------------------------------------
TOPIC_STATUS = "zoo/cage/+/status"
TOPIC_SNAPSHOT = "zoo/cage/+/snapshot"


# ---------------------------------------------------------------------------
# Handlers de mensagem
# ---------------------------------------------------------------------------

def _handle_status(cage_id: str, payload: dict) -> None:
    """Processa payload de status e persiste no banco."""
    status = payload.get("status", "inactive")
    activity_level = float(payload.get("activity_level", 0.0))
    animal_count = int(payload.get("animal_count", 0))
    zone = payload.get("zone")  # pode ser None

    # Garantir que a jaula existe
    upsert_cage_minimal(cage_id)

    # Resolver zone_label
    zone_label: str | None = None
    if zone:
        zone_label = get_zone_label(cage_id, zone)

    insert_activity(
        cage_id=cage_id,
        status=status,
        zone=zone,
        zone_label=zone_label,
        activity_level=activity_level,
        animal_count=animal_count,
    )

    logger.info(
        "[STATUS] %s → status=%s activity=%.2f zone=%s zone_label=%s",
        cage_id, status, activity_level, zone, zone_label,
    )


def _handle_snapshot(cage_id: str, image_b64: str) -> None:
    """Decodifica base64, salva JPEG e persiste path no banco."""
    if not image_b64:
        logger.warning("[SNAPSHOT] %s: payload vazio, ignorando.", cage_id)
        return

    os.makedirs(SNAPSHOTS_DIR, exist_ok=True)

    ts = datetime.now(tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"{cage_id}_{ts}.jpg"
    image_path = os.path.abspath(os.path.join(SNAPSHOTS_DIR, filename))

    try:
        image_bytes = base64.b64decode(image_b64)
        with open(image_path, "wb") as f:
            f.write(image_bytes)
    except Exception as exc:
        logger.error("[SNAPSHOT] %s: falha ao salvar imagem: %s", cage_id, exc)
        return

    upsert_cage_minimal(cage_id)
    insert_snapshot(cage_id=cage_id, image_path=image_path)

    logger.info("[SNAPSHOT] %s → salvo em %s (%d bytes)", cage_id, image_path, len(image_bytes))


# ---------------------------------------------------------------------------
# Callbacks MQTT
# ---------------------------------------------------------------------------

def on_connect(client: mqtt.Client, userdata, flags, rc: int) -> None:
    if rc == 0:
        logger.info("Conectado ao broker MQTT %s:%d", MQTT_BROKER_HOST, MQTT_BROKER_PORT)
        client.subscribe([(TOPIC_STATUS, 0), (TOPIC_SNAPSHOT, 0)])
        logger.info("Inscrito em: %s  |  %s", TOPIC_STATUS, TOPIC_SNAPSHOT)
    else:
        logger.error("Falha na conexão MQTT. Código de retorno: %d", rc)


def on_disconnect(client: mqtt.Client, userdata, rc: int) -> None:
    if rc != 0:
        logger.warning("Desconectado inesperadamente do broker (rc=%d). Reconectando...", rc)


def on_message(client: mqtt.Client, userdata, msg: mqtt.MQTTMessage) -> None:
    topic = msg.topic  # ex: "zoo/cage/cage_leao_01/status"
    try:
        parts = topic.split("/")
        # Esperado: ["zoo", "cage", "<cage_id>", "<tipo>"]
        if len(parts) != 4:
            logger.warning("Tópico inesperado: %s", topic)
            return

        cage_id = parts[2]
        msg_type = parts[3]

        if msg_type == "status":
            payload = json.loads(msg.payload.decode("utf-8"))
            _handle_status(cage_id, payload)
        elif msg_type == "snapshot":
            # ESP32 envia base64 puro, sem JSON
            image_b64 = msg.payload.decode("utf-8").strip()
            _handle_snapshot(cage_id, image_b64)
        else:
            logger.debug("Tipo de mensagem desconhecido: %s", msg_type)

    except json.JSONDecodeError as exc:
        logger.error("Payload inválido no tópico %s: %s", topic, exc)
    except Exception as exc:
        logger.exception("Erro ao processar mensagem do tópico %s: %s", topic, exc)


# ---------------------------------------------------------------------------
# Loop principal com reconexão automática
# ---------------------------------------------------------------------------

def run_subscriber() -> None:
    logger.info("Inicializando banco de dados...")
    init_db()

    while True:
        client = mqtt.Client(client_id=MQTT_CLIENT_ID_SUBSCRIBER, clean_session=True)
        client.on_connect = on_connect
        client.on_disconnect = on_disconnect
        client.on_message = on_message

        try:
            logger.info("Conectando ao broker %s:%d...", MQTT_BROKER_HOST, MQTT_BROKER_PORT)
            client.connect(MQTT_BROKER_HOST, MQTT_BROKER_PORT, keepalive=60)
            client.loop_forever()
        except ConnectionRefusedError:
            logger.error(
                "Broker MQTT recusou conexão (%s:%d). Tentando novamente em 5s...",
                MQTT_BROKER_HOST, MQTT_BROKER_PORT,
            )
        except OSError as exc:
            logger.error("Erro de rede: %s. Tentando novamente em 5s...", exc)
        except Exception as exc:
            logger.exception("Erro inesperado no subscriber: %s", exc)
        finally:
            try:
                client.disconnect()
            except Exception:
                pass

        time.sleep(5)


if __name__ == "__main__":
    run_subscriber()
