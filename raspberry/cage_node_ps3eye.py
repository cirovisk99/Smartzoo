"""
cage_node_ps3eye.py — Nó de jaula virtual para Raspberry Pi + PS3 Eye

Detecta pessoas com YOLOv8n e publica status MQTT no mesmo formato
que o ESP32-S3 Sense, tornando a PS3 Eye uma segunda jaula do sistema.

Tópicos:
  Publica:   zoo/cage/{cage_id}/status    → JSON de status a cada N segundos
             zoo/cage/{cage_id}/snapshot  → JPEG base64 sob demanda
  Subscreve: zoo/cage/{cage_id}/cmd       → snapshot / reboot / set_interval

Uso:
    python3 cage_node_ps3eye.py [--cage-id cage02] [--camera 0]
"""

from __future__ import annotations

import argparse
import base64
import json
import logging
import sys
import time
from datetime import datetime

import cv2
import numpy as np
import paho.mqtt.client as mqtt
from ultralytics import YOLO

# ---------------------------------------------------------------------------
# Configuração padrão (pode ser sobrescrita por argumento de linha de comando)
# ---------------------------------------------------------------------------
DEFAULT_CAGE_ID        = "cage02"
DEFAULT_MQTT_BROKER    = "localhost"
DEFAULT_MQTT_PORT      = 1883
DEFAULT_CAMERA_INDEX   = 0
DEFAULT_STATUS_INTERVAL_S = 10

# Detecção
PERSON_CLASS_ID   = 0        # classe "person" no COCO (YOLOv8)
PERSON_THRESHOLD  = 0.50     # confiança mínima para considerar pessoa
FRAMES_TO_ACTIVATE   = 2    # frames consecutivos positivos → active
FRAMES_TO_DEACTIVATE = 5    # frames consecutivos negativos → inactive

# Mapa de zona 3×3 (coluna × linha → nome)
ZONE_NAMES = [
    ["top_left",    "top_center",    "top_right"   ],
    ["left",        "center",        "right"       ],
    ["bottom_left", "bottom_center", "bottom_right"],
]

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Detecção de zona a partir da bounding box
# ---------------------------------------------------------------------------

def box_to_zone(box_xyxy, frame_w: int, frame_h: int) -> str:
    """Converte bounding box (x1,y1,x2,y2) para nome de zona 3×3."""
    x1, y1, x2, y2 = box_xyxy
    cx = (x1 + x2) / 2.0 / frame_w
    cy = (y1 + y2) / 2.0 / frame_h
    col = min(int(cx * 3), 2)
    row = min(int(cy * 3), 2)
    return ZONE_NAMES[row][col]


# ---------------------------------------------------------------------------
# Nó principal
# ---------------------------------------------------------------------------

class CageNode:
    def __init__(self, cage_id: str, broker: str, port: int, camera_index: int,
                 status_interval_s: int):
        self.cage_id         = cage_id
        self.broker          = broker
        self.port            = port
        self.camera_index    = camera_index
        self.status_interval = status_interval_s

        self.topic_status   = f"zoo/cage/{cage_id}/status"
        self.topic_snapshot = f"zoo/cage/{cage_id}/snapshot"
        self.topic_cmd      = f"zoo/cage/{cage_id}/cmd"

        # Estado de detecção
        self.confirmed_active = False
        self.active_streak    = 0
        self.inactive_streak  = 0
        self.last_person_score = 0.0
        self.last_zone         = "unknown"
        self.last_person_count = 0

        self.start_time        = time.time()
        self.last_status_pub   = 0.0
        self.last_snapshot_pub = 0.0
        self.snapshot_interval = 30  # segundos

        # MQTT
        self.mqtt_client = mqtt.Client(client_id=f"ps3eye_{cage_id}", clean_session=True)
        self.mqtt_client.on_connect    = self._on_connect
        self.mqtt_client.on_disconnect = self._on_disconnect
        self.mqtt_client.on_message    = self._on_message

        # Câmera e modelo (inicializados em run())
        self.cap   = None
        self.model = None

    # -----------------------------------------------------------------------
    # MQTT callbacks
    # -----------------------------------------------------------------------

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            logger.info("[MQTT] Conectado ao broker %s:%d", self.broker, self.port)
            client.subscribe(self.topic_cmd)
        else:
            logger.error("[MQTT] Falha na conexão (rc=%d)", rc)

    def _on_disconnect(self, client, userdata, rc):
        if rc != 0:
            logger.warning("[MQTT] Desconectado inesperadamente (rc=%d)", rc)

    def _on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
            action  = payload.get("action")
            logger.info("[MQTT] cmd recebido: %s", payload)

            if action == "snapshot":
                self._publish_snapshot()
            elif action == "reboot":
                logger.info("[MQTT] Reiniciando por comando remoto...")
                sys.exit(0)
            elif action == "set_interval":
                value = int(payload.get("value", self.status_interval))
                if 1 <= value <= 3600:
                    self.status_interval = value
                    logger.info("[MQTT] Intervalo de status atualizado: %d s", value)
            elif action == "set_snapshot_interval":
                value = int(payload.get("value", self.snapshot_interval))
                if 1 <= value <= 3600:
                    self.snapshot_interval = value
                    logger.info("[MQTT] Intervalo de snapshot atualizado: %d s", value)
        except Exception as exc:
            logger.error("[MQTT] Erro ao processar cmd: %s", exc)

    # -----------------------------------------------------------------------
    # Snapshot
    # -----------------------------------------------------------------------

    def _publish_snapshot(self):
        if self.cap is None or not self.cap.isOpened():
            return
        ret, frame = self.cap.read()
        if not ret:
            logger.warning("[SNAPSHOT] Frame vazio")
            return

        ret, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if not ret:
            return

        b64 = base64.b64encode(jpeg.tobytes()).decode("ascii")
        self.mqtt_client.publish(self.topic_snapshot, b64)
        logger.info("[SNAPSHOT] Publicado (%d bytes b64)", len(b64))

    # -----------------------------------------------------------------------
    # Status
    # -----------------------------------------------------------------------

    def _publish_status(self):
        uptime_ms = int((time.time() - self.start_time) * 1000)
        payload = {
            "cage_id":        self.cage_id,
            "status":         "active" if self.confirmed_active else "inactive",
            "activity_level": round(self.last_person_score, 3),
            "animal_count":   self.last_person_count,
            "zone":           self.last_zone if self.confirmed_active else "unknown",
            "uptime_ms":      uptime_ms,
        }
        self.mqtt_client.publish(self.topic_status, json.dumps(payload))
        logger.info("[STATUS] %s", payload)

    # -----------------------------------------------------------------------
    # Loop principal
    # -----------------------------------------------------------------------

    def run(self):
        # Câmera
        logger.info("[CAM] Abrindo câmera %d...", self.camera_index)
        self.cap = cv2.VideoCapture(self.camera_index)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        self.cap.set(cv2.CAP_PROP_FPS, 30)
        if not self.cap.isOpened():
            logger.error("[CAM] ERRO: câmera %d não encontrada", self.camera_index)
            sys.exit(1)
        logger.info("[CAM] OK — %dx%d",
                    int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
                    int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT)))

        # Modelo YOLOv8n
        logger.info("[YOLO] Carregando YOLOv8n...")
        self.model = YOLO("yolov8n.pt")
        logger.info("[YOLO] OK")

        # MQTT
        logger.info("[MQTT] Conectando a %s:%d...", self.broker, self.port)
        self.mqtt_client.connect(self.broker, self.port, keepalive=60)
        self.mqtt_client.loop_start()

        frame_w = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        frame_h = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        logger.info("=== SmartZoo cage_node iniciado — cage_id=%s ===", self.cage_id)

        try:
            while True:
                ret, frame = self.cap.read()
                if not ret:
                    logger.warning("[CAM] Frame vazio, aguardando...")
                    time.sleep(0.5)
                    continue

                # Inferência YOLOv8n — filtra somente classe "person"
                results = self.model(frame, classes=[PERSON_CLASS_ID],
                                     conf=PERSON_THRESHOLD, verbose=False)
                detections = results[0].boxes

                person_count = len(detections)
                best_score   = 0.0
                best_zone    = "unknown"

                if person_count > 0:
                    # Maior confiança entre as detecções
                    scores = detections.conf.cpu().numpy()
                    best_score = float(scores.max())

                    # Zona da detecção com maior confiança
                    best_idx  = int(scores.argmax())
                    best_box  = detections.xyxy[best_idx].cpu().numpy()
                    best_zone = box_to_zone(best_box, frame_w, frame_h)

                raw_active = person_count > 0

                # Histerese
                if raw_active:
                    self.active_streak   += 1
                    self.inactive_streak  = 0
                else:
                    self.inactive_streak += 1
                    self.active_streak    = 0

                if self.active_streak   >= FRAMES_TO_ACTIVATE:
                    self.confirmed_active = True
                if self.inactive_streak >= FRAMES_TO_DEACTIVATE:
                    self.confirmed_active = False

                self.last_person_score = best_score
                self.last_person_count = person_count if self.confirmed_active else 0
                self.last_zone         = best_zone

                print(
                    f"{'ACTIVE  ' if self.confirmed_active else 'inactive'} | "
                    f"count: {person_count} | "
                    f"score: {best_score:.3f} | "
                    f"zone: {best_zone:<14}",
                    flush=True,
                )

                # Publicação periódica de status e snapshot
                now = time.time()
                if now - self.last_status_pub >= self.status_interval:
                    self.last_status_pub = now
                    self._publish_status()

                if now - self.last_snapshot_pub >= self.snapshot_interval:
                    self.last_snapshot_pub = now
                    self._publish_snapshot()

                time.sleep(0.1)  # ~10 fps

        except KeyboardInterrupt:
            logger.info("Interrompido pelo usuário.")
        finally:
            self.cap.release()
            self.mqtt_client.loop_stop()
            self.mqtt_client.disconnect()


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

def parse_args():
    p = argparse.ArgumentParser(description="SmartZoo PS3 Eye cage node")
    p.add_argument("--cage-id",  default=DEFAULT_CAGE_ID,
                   help="ID único da jaula (padrão: %(default)s)")
    p.add_argument("--broker",   default=DEFAULT_MQTT_BROKER,
                   help="Host do broker MQTT (padrão: %(default)s)")
    p.add_argument("--port",     type=int, default=DEFAULT_MQTT_PORT,
                   help="Porta MQTT (padrão: %(default)s)")
    p.add_argument("--camera",   type=int, default=DEFAULT_CAMERA_INDEX,
                   help="Índice da câmera (padrão: %(default)s)")
    p.add_argument("--interval", type=int, default=DEFAULT_STATUS_INTERVAL_S,
                   help="Intervalo de publicação em segundos (padrão: %(default)s)")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    node = CageNode(
        cage_id        = args.cage_id,
        broker         = args.broker,
        port           = args.port,
        camera_index   = args.camera,
        status_interval_s = args.interval,
    )
    node.run()
