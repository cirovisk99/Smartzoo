# SPEC-02 — PS3 Eye como Nó de Jaula Virtual (Raspberry Pi)

**Status:** Planejamento  
**Hardware:** Raspberry Pi (Bookworm) + PS3 Eye Camera (USB)  
**Objetivo:** Rodar um processo Python no Raspberry Pi que emite exatamente os mesmos tópicos MQTT que um ESP32-S3 Sense emite, tornando a PS3 Eye uma "segunda jaula" do sistema.

---

## Contexto

O ESP32-S3 Sense (`cage01`) publica:
- `zoo/cage/{cage_id}/status` — JSON com detecção a cada N segundos
- `zoo/cage/{cage_id}/snapshot` — JPEG base64 sob demanda
- Subscreve `zoo/cage/{cage_id}/cmd` — ações: `snapshot`, `reboot`, `set_interval`

O backend (`subscriber.py`) já consome esses tópicos com wildcard `zoo/cage/+/...` — qualquer `cage_id` novo é aceito automaticamente. O frontend exibe qualquer jaula que aparecer no banco.

**Não é necessário alterar nada no backend, frontend ou broker.** Apenas adicionar o script no Raspberry Pi.

---

## Hardware

### PS3 Eye Camera
- Sensor: OV7725 (640×480 @ 60 fps, 320×240 @ 120 fps)
- Interface: USB 2.0
- Driver Linux: `gspca_ov534` (incluso no kernel desde 3.x — automático no Bookworm)
- Aparece como `/dev/video0` (ou `/dev/video1` se já houver outra câmera)

### Verificação após conectar (no Raspberry Pi)
```bash
# Confirmar que o dispositivo apareceu
ls /dev/video*

# Ver detalhes (opcional)
sudo apt install v4l-utils
v4l2-ctl --list-devices
v4l2-ctl -d /dev/video0 --list-formats-ext
```

---

## Arquitetura do Script

Arquivo: `raspberry/cage_node_ps3eye.py`

```
┌─────────────────────────────────────────┐
│           cage_node_ps3eye.py           │
│                                         │
│  ┌──────────┐   frames   ┌───────────┐  │
│  │ PS3 Eye  │──────────→ │ Detector  │  │
│  │ OpenCV   │  96×96 GS  │ BG Subtr  │  │
│  │ /dev/v0  │            │ Blob Grid │  │
│  └──────────┘            └─────┬─────┘  │
│                                │status  │
│  ┌──────────┐                  ↓        │
│  │ Snapshot │            ┌───────────┐  │
│  │ 640×480  │←──cmd──────│ MQTT Pub  │  │
│  │ JPEG b64 │────────────→ paho-mqtt │  │
│  └──────────┘            └───────────┘  │
└─────────────────────────────────────────┘
              │ publica / subscreve
              ↓
    Mosquitto (localhost:1883)
              │
    zoo/cage/cage02/status
    zoo/cage/cage02/snapshot
    zoo/cage/cage02/cmd
```

---

## Módulos de Implementação

### Módulo A — Setup de Câmera

```python
import cv2

cap = cv2.VideoCapture(CAMERA_INDEX)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
cap.set(cv2.CAP_PROP_FPS, 30)
# Verificar se abriu
assert cap.isOpened(), f"Câmera {CAMERA_INDEX} não encontrada"
```

Para detecção: cada frame é convertido para grayscale e redimensionado para 96×96.

### Módulo B — Detecção (replica ESP32 exatamente)

Parâmetros idênticos ao firmware:

| Parâmetro | Valor | Mesmo que ESP32 |
|-----------|-------|-----------------|
| Frame de detecção | 96×96 grayscale | ✓ |
| `BG_PIXEL_THRESHOLD` | 25 | ✓ |
| `BG_AREA_THRESHOLD` | 0.10 (10%) | ✓ |
| `BG_ALPHA` | 20 (bg += diff/20) | ✓ |
| `FRAMES_TO_ACTIVATE` | 2 | ✓ |
| `FRAMES_TO_DEACTIVATE` | 10 | ✓ |
| Grade de blob | 8×8 (células 12×12px) | ✓ |
| `CELL_ACTIVE_THRESHOLD` | 15 pixels | ✓ |
| `MIN_BLOB_CELLS` | 3 | ✓ |
| Zona | grade 3×3 → string | ✓ |

Algoritmo Python equivalente ao C++:
```python
# Background adaptativo
if bg is None:
    bg = frame.astype(np.float32)
else:
    diff_mask = np.abs(frame.astype(np.int16) - bg.astype(np.int16)) > BG_PIXEL_THRESHOLD
    activity_level = diff_mask.sum() / (96 * 96)

    if not confirmed_active:
        bg += (frame.astype(np.float32) - bg) / BG_ALPHA

# Blob detection via grade 8×8
grid = np.zeros((8, 8), dtype=bool)
for gr in range(8):
    for gc in range(8):
        cell = diff_mask[gr*12:(gr+1)*12, gc*12:(gc+1)*12]
        grid[gr, gc] = cell.sum() >= CELL_ACTIVE_THRESHOLD

# Flood-fill (scipy ou implementação manual)
from scipy import ndimage
labeled, n_blobs = ndimage.label(grid)
animal_count = sum(
    1 for i in range(1, n_blobs + 1)
    if (labeled == i).sum() >= MIN_BLOB_CELLS
)
```

### Módulo C — MQTT Publisher

Payload JSON publicado em `zoo/cage/{cage_id}/status`:
```json
{
  "cage_id": "cage02",
  "status": "active",
  "activity_level": 0.183,
  "animal_count": 1,
  "zone": "center",
  "uptime_ms": 45231
}
```

Snapshot publicado em `zoo/cage/{cage_id}/snapshot`:
```
<base64 puro do JPEG, igual ao ESP32>
```

### Módulo D — Cmd Subscriber

Subscreve `zoo/cage/{cage_id}/cmd`:
```json
{"action":"snapshot"}          → captura frame 640×480 JPEG → publica snapshot
{"action":"set_interval","value":30} → atualiza intervalo de publicação (segundos)
{"action":"reboot"}            → sys.exit(0)  (systemd reinicia)
```

---

## Estrutura de Arquivos

```
raspberry/
├── cage_node_ps3eye.py      ← script principal
└── requirements.txt         ← dependências
```

### `requirements.txt`
```
opencv-python-headless>=4.8
paho-mqtt>=1.6
numpy>=1.24
scipy>=1.11
```

> `opencv-python-headless` (sem GUI) é preferido no Raspberry Pi headless.

---

## Configuração (topo do script)

```python
# ── Ajuste antes de rodar ──────────────────────────────────────────────
CAGE_ID       = "cage02"       # ID único desta jaula
MQTT_BROKER   = "localhost"    # broker Mosquitto local
MQTT_PORT     = 1883
CAMERA_INDEX  = 0              # /dev/video0
STATUS_INTERVAL_S = 10         # publicar status a cada N segundos
# ──────────────────────────────────────────────────────────────────────
```

Ou via argumento de linha de comando:
```bash
python3 cage_node_ps3eye.py --cage-id cage02 --camera 0
```

---

## Instalação no Raspberry Pi

```bash
# 1. Instalar dependências do sistema
sudo apt update
sudo apt install python3-pip python3-venv -y

# 2. Criar ambiente virtual na pasta do projeto
cd ~/SmartZoo/raspberry
python3 -m venv .venv
source .venv/bin/activate

# 3. Instalar dependências Python
pip install -r requirements.txt

# 4. Testar câmera
python3 -c "import cv2; cap=cv2.VideoCapture(0); print(cap.isOpened()); cap.release()"

# 5. Rodar o nó
python3 cage_node_ps3eye.py --cage-id cage02
```

---

## Serviço systemd (para rodar em background permanentemente)

Arquivo: `/etc/systemd/system/smartzoo-cage02.service`

```ini
[Unit]
Description=SmartZoo PS3Eye Cage Node (cage02)
After=network.target mosquitto.service

[Service]
User=pi
WorkingDirectory=/home/pi/SmartZoo/raspberry
ExecStart=/home/pi/SmartZoo/raspberry/.venv/bin/python3 cage_node_ps3eye.py --cage-id cage02
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable smartzoo-cage02
sudo systemctl start smartzoo-cage02
sudo systemctl status smartzoo-cage02
```

---

## Testes (em ordem)

### T1 — Câmera funcionando
```bash
python3 cage_node_ps3eye.py --cage-id cage02
# Esperado: logs "[CAM] OK | [MQTT] Conectado | ACTIVE/inactive | count: N | zone: ..."
```

### T2 — Status chegando no broker
```bash
# Em outro terminal no Raspberry Pi
mosquitto_sub -h localhost -t "zoo/cage/cage02/status"
# Esperado: JSON a cada 10s
```

### T3 — Snapshot via comando
```bash
mosquitto_pub -h localhost -t "zoo/cage/cage02/cmd" -m '{"action":"snapshot"}'
mosquitto_sub -h localhost -t "zoo/cage/cage02/snapshot"
# Esperado: string base64 longa
```

### T4 — Backend reconhece cage02
```bash
# cage02 deve aparecer na tabela cages do banco SQLite
sqlite3 ~/SmartZoo/backend/smartzoo.db "SELECT * FROM cages;"
```

### T5 — Frontend exibe cage02
- Abrir o app → tela de mapa/lista de jaulas → "cage02" deve aparecer
- Entrar na CageDetail de cage02 → ver status e snapshot

---

## Notas Técnicas

- **scipy não disponível?** A detecção de blob pode ser substituída por flood-fill manual (≈30 linhas de Python puro, sem dependência extra).
- **PS3 Eye não reconhecida?** Checar `dmesg | grep -i cam` após conectar USB. Driver `gspca_ov534` deve aparecer.
- **Framerate:** A PS3 Eye suporta 60 fps em 640×480. Para detecção, processar a 10 fps é suficiente (inserir `time.sleep(0.1)` no loop).
- **`uptime_ms`:** Usar `int((time.time() - start_time) * 1000)` — sem NTP necessário, igual ao ESP32 que usa `millis()`.
- **Snapshot chunking não necessário:** Python publica MQTT em um único `publish()`, sem o limite de buffer do PubSubClient. O broker Mosquitto suporta mensagens grandes por padrão.
