# SPEC-02 — Servidor Central (Raspberry Pi)

**Papel:** Engenheiro de Backend & Dados
**Módulo:** Broker MQTT + API REST + Banco de Dados + IA

---

## 1. Visão Geral

O Raspberry Pi atua como hub central do sistema: recebe dados de todas as jaulas via MQTT, persiste o histórico em SQLite, expõe uma API REST para a interface do totem e integra um chatbot de IA com contexto do zoo.

```
[ESP32 (N jaulas)] → MQTT (1883) → [Mosquitto]
                                        ↓
                                  [Subscriber Python]
                                        ↓
                                   [SQLite DB]
                                        ↓
                              [FastAPI REST :8000]
                                        ↓
                              [Totem / Interface]
```

---

## 2. Requisitos Funcionais

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF05 | Hospedar Broker MQTT (Mosquitto) para receber dados de N jaulas | Alta |
| RF06 | Armazenar histórico de atividades em SQLite | Alta |
| RF07 | Expor API REST (FastAPI) para a interface e comandos | Alta |
| RF08 | Integrar API de IA (Gemini / OpenAI) com contexto do zoo para responder perguntas | Alta |
| RF09 | Gerar sugestão de roteiro baseada na probabilidade de atividade por horário | Média |

---

## 3. Infraestrutura

### 3.1 Broker MQTT — Mosquitto

- Instalação: `sudo apt install mosquitto mosquitto-clients`
- Porta: **1883** (sem TLS para rede local)
- Config mínima (`/etc/mosquitto/mosquitto.conf`):
  ```
  listener 1883
  allow_anonymous true
  ```
- Habilitar no boot: `sudo systemctl enable mosquitto`

### 3.2 Estrutura de Pastas

```
smartzoo-backend/
├── main.py              # Entrypoint FastAPI
├── subscriber.py        # Loop MQTT subscriber (processo separado)
├── database.py          # Conexão e queries SQLite
├── routers/
│   ├── cages.py         # /api/status, /api/cage/{id}/...
│   ├── chat.py          # /api/chat
│   └── route.py         # /api/route/suggest
├── services/
│   ├── ai_service.py    # Integração Gemini/OpenAI
│   └── route_service.py # Lógica de sugestão de roteiro
├── models.py            # Schemas Pydantic
└── smartzoo.db          # Banco SQLite (gerado automaticamente)
```

---

## 4. Schema do Banco de Dados (SQLite)

```sql
CREATE TABLE cages (
    id          TEXT PRIMARY KEY,   -- ex: "cage_leao_01"
    animal_name TEXT NOT NULL,
    species     TEXT,
    location_x  REAL,              -- coordenada X no mapa (0.0–1.0 normalizado)
    location_y  REAL               -- coordenada Y no mapa (0.0–1.0 normalizado)
);

CREATE TABLE cage_zones (
    cage_id     TEXT REFERENCES cages(id),
    zone_key    TEXT NOT NULL,          -- ex: "bottom_left"
    description TEXT NOT NULL,         -- ex: "próximo às árvores"
    PRIMARY KEY (cage_id, zone_key)
);

CREATE TABLE activity_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    cage_id      TEXT REFERENCES cages(id),
    status       TEXT CHECK(status IN ('active', 'inactive')),
    zone         TEXT,                  -- grade 3x3: top_left…bottom_right | NULL
    zone_label   TEXT,                  -- descrição legível, gerada no insert
    activity_level REAL,
    timestamp    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    cage_id     TEXT REFERENCES cages(id),
    image_path  TEXT,              -- caminho local do arquivo JPEG salvo
    timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Índices recomendados:**
```sql
CREATE INDEX idx_activity_cage_ts ON activity_log(cage_id, timestamp);
CREATE INDEX idx_snapshots_cage_ts ON snapshots(cage_id, timestamp);
```

---

## 5. Subscriber MQTT

Processo Python independente que consome os tópicos das jaulas e persiste no banco.

**Tópicos subscritos:**
```
zoo/cage/+/status     → parseia JSON → INSERT em activity_log
zoo/cage/+/snapshot   → salva JPEG em disco → INSERT em snapshots
```

**Comportamento:**
- Ao receber `zoo/cage/{cage_id}/status`:
  1. Buscar descrição da zona em `cage_zones` onde `cage_id` e `zone_key = payload.zone`
  2. `zone_label` = descrição encontrada, ou `null` se zona não mapeada
  3. Inserir em `activity_log` com `zone`, `zone_label` e `activity_level`
  4. Se `cage_id` não existir em `cages`, criar registro mínimo com `animal_name = cage_id`
- Ao receber `zoo/cage/{cage_id}/snapshot`: decodificar base64, salvar em `./snapshots/{cage_id}_{ts}.jpg`, inserir path em `snapshots`
- Reconectar automaticamente ao broker em caso de queda

**Exemplo de `cage_zones` para a jaula do leão:**
```sql
INSERT INTO cage_zones VALUES
  ('cage_leao_01', 'top_left',       'no alto à esquerda, perto da rocha'),
  ('cage_leao_01', 'top_center',     'no alto ao centro, sob a sombra'),
  ('cage_leao_01', 'top_right',      'no alto à direita, próximo ao bebedouro'),
  ('cage_leao_01', 'left',           'à esquerda, na área gramada'),
  ('cage_leao_01', 'center',         'no centro da jaula'),
  ('cage_leao_01', 'right',          'à direita, próximo ao tronco'),
  ('cage_leao_01', 'bottom_left',    'no canto esquerdo, próximo às árvores'),
  ('cage_leao_01', 'bottom_center',  'na parte inferior, ao centro'),
  ('cage_leao_01', 'bottom_right',   'no canto direito, próximo à cerca');
```

**Frase gerada pela IA (ex.):** *"O leão está ativo no canto esquerdo, próximo às árvores"*
— A IA recebe `animal_name` + `zone_label` e monta a frase em linguagem natural.

---

## 6. API REST — Endpoints

**Base URL:** `http://{raspberry_ip}:8000`

### `GET /api/status`
Retorna status atual de todas as jaulas (última entrada de cada uma).

**Response 200:**
```json
[
  {
    "cage_id": "cage_leao_01",
    "animal_name": "Leão",
    "status": "active",
    "activity_level": 0.85,
    "zone": "bottom_left",
    "zone_label": "no canto esquerdo, próximo às árvores",
    "last_update": "2024-01-15T14:32:10Z",
    "location_x": 0.3,
    "location_y": 0.5
  }
]
```

---

### `GET /api/cage/{id}/history`
Histórico de atividade das últimas 24h, agrupado por hora.

**Response 200:**
```json
{
  "cage_id": "cage_leao_01",
  "history": [
    { "hour": "2024-01-15T14:00:00Z", "active_ratio": 0.72, "count": 36 }
  ]
}
```

---

### `POST /api/chat`
Envia pergunta ao chatbot com contexto do zoo.

**Request body:**
```json
{ "question": "Quando o leão costuma estar mais ativo?" }
```

**Response 200:**
```json
{ "answer": "O leão tende a ser mais ativo entre 8h e 10h da manhã, com activity_level médio de 0.78 nesse período." }
```

---

### `GET /api/route/suggest`
Retorna roteiro otimizado baseado na probabilidade de atividade no horário atual ± 1h.

**Response 200:**
```json
{
  "generated_at": "2024-01-15T14:32:10Z",
  "route": [
    { "order": 1, "cage_id": "cage_leao_01", "animal_name": "Leão", "expected_activity": 0.80 },
    { "order": 2, "cage_id": "cage_girafa_01", "animal_name": "Girafa", "expected_activity": 0.65 }
  ]
}
```

---

### `POST /api/cage/{id}/cmd`
Envia comando para uma jaula via MQTT.

**Request body:**
```json
{ "action": "snapshot" }
{ "action": "reboot" }
{ "action": "set_interval", "value": 30 }
```

**Response 200:**
```json
{ "sent": true, "topic": "zoo/cage/cage_leao_01/cmd" }
```

---

### `GET /api/cage/{id}/snapshot`
Retorna a última imagem capturada da jaula.

**Response 200:** imagem JPEG (`Content-Type: image/jpeg`)
**Response 404:** se não houver snapshot

---

## 7. Integração de IA (Chatbot)

**Provider:** Gemini 1.5 Flash **ou** OpenAI GPT-4o-mini (configurável via variável de ambiente)

### Prompt de Sistema

```
Você é o guia virtual do SmartZoo. Responda perguntas sobre os animais do zoo
de forma educativa e amigável para visitantes de todas as idades.

Contexto atual do zoo:
{context_json}

Use os dados de atividade histórica para enriquecer suas respostas quando relevante.
Responda em português. Seja conciso (máximo 3 parágrafos).
```

O `{context_json}` deve incluir: lista de animais com espécie, status atual e horários de pico de atividade (extraídos do banco).

### Cache de Respostas
- Implementar cache simples em memória (dict Python) com TTL de **5 minutos**
- Chave: hash da pergunta normalizada (lowercase, sem pontuação)
- Fallback: se API de IA falhar ou quota estourar, retornar resposta genérica pré-definida

---

## 8. Lógica de Sugestão de Roteiro

```
1. Obter hora atual H
2. Para cada jaula, calcular activity_ratio médio no banco
   WHERE hour(timestamp) BETWEEN H-1 AND H+1
   nos últimos 7 dias
3. Ordenar jaulas por activity_ratio DESC
4. Retornar lista ordenada como roteiro sugerido
```

---

## 9. Requisitos Não-Funcionais

| ID | Requisito | Critério |
|----|-----------|----------|
| RNF01 | Latência API | Endpoints de status e história < 200ms |
| RNF05 | Disponibilidade | Processo em execução contínua (systemd service) |
| RNF04 | Temperatura RPi | Monitorar e alertar se > 80°C |

### Serviços systemd (recomendado)

```ini
# /etc/systemd/system/smartzoo-api.service
[Service]
ExecStart=/usr/bin/python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
WorkingDirectory=/home/pi/smartzoo-backend
Restart=always
```

```ini
# /etc/systemd/system/smartzoo-subscriber.service
[Service]
ExecStart=/usr/bin/python3 subscriber.py
WorkingDirectory=/home/pi/smartzoo-backend
Restart=always
```

---

## 10. Stack Técnica

| Componente | Tecnologia |
|------------|------------|
| API REST | Python 3.11 + FastAPI + Uvicorn |
| Banco de dados | SQLite (via `aiosqlite` ou `sqlite3`) |
| Broker MQTT | Mosquitto 2.x |
| Cliente MQTT | `paho-mqtt` |
| IA | `google-generativeai` (Gemini) ou `openai` SDK |
| Validação | Pydantic v2 |

**`requirements.txt`:**
```
fastapi
uvicorn[standard]
paho-mqtt
google-generativeai
openai
pydantic
aiosqlite
```

---

## 11. Variáveis de Ambiente

```env
GEMINI_API_KEY=...
OPENAI_API_KEY=...      # alternativa
AI_PROVIDER=gemini      # "gemini" | "openai"
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883
DB_PATH=./smartzoo.db
SNAPSHOTS_DIR=./snapshots
```

---

## 12. Entregas

- [ ] **E2.1** — Broker Mosquitto operacional, recebendo mensagens do ESP32 (verificado com `mosquitto_sub`)
- [ ] **E2.2** — Subscriber salvando dados no SQLite (verificado com query direta)
- [ ] **E2.3** — API REST documentada e funcional em todos os endpoints (Swagger em `/docs`)
- [ ] **E2.4** — Chatbot respondendo perguntas contextuais sobre os animais
- [ ] **E2.5** — Endpoint `/api/route/suggest` retornando roteiro ordenado

---

## 13. Dependências com Outros Módulos

| Dependência | Módulo | Detalhe |
|-------------|--------|---------|
| Formato do payload MQTT | SPEC-01 (ESP32) | Subscriber espera o schema JSON definido na SPEC-01 |
| Endpoints e schemas de resposta | SPEC-03 (Frontend) | Frontend consome esta API — mudanças devem ser comunicadas |
| IP do Raspberry Pi na rede | SPEC-01 e SPEC-03 | Definir IP fixo ou via hostname `smartzoo.local` (mDNS) |
