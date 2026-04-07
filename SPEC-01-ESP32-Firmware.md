# SPEC-01 — Unidade de Captura (Jaula / ESP32-S3)

**Papel:** Engenheiro de Hardware & Firmware
**Módulo:** Edge AI + Pan-Tilt + MQTT Client

---

## 1. Visão Geral

Cada jaula é um nó autônomo baseado no **ESP32-S3 Sense** com câmera OV2640. O dispositivo processa imagens localmente para classificar o status do animal, controla um sistema Pan-Tilt com dois servos para rastrear movimento, e comunica-se com o servidor central via MQTT.

```
[OV2640] → [ESP32-S3] → classifica → publica MQTT
                ↕ PWM
           [Servo Pan] [Servo Tilt]
```

---

## 2. Hardware

| Componente | Qtd. | Função |
|------------|------|--------|
| ESP32-S3 Sense (câmera OV2640) | 1 | Processamento de visão e Wi-Fi |
| Servo MG90S | 2 | Movimentação Pan (horizontal) e Tilt (vertical) |
| Módulo MB102 | 1 | Distribuição e regulação de energia na protoboard |
| Fonte 9V 2A | 1 | Alimentação do sistema |

### Pinagem (referência)

| Pino ESP32-S3 | Componente |
|---------------|------------|
| GPIO 5 | Servo Pan (sinal PWM) |
| GPIO 6 | Servo Tilt (sinal PWM) |
| 3.3V / GND | Via MB102 |

> Os pinos de câmera são internos ao módulo ESP32-S3 Sense.

---

## 3. Requisitos Funcionais

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF01 | Rastrear objetos em movimento com sistema Pan-Tilt (2x Servo MG90S) | Alta |
| RF02 | Processar imagem localmente e classificar status: **Ativo** / **Inativo** | Alta |
| RF03 | Publicar metadados via MQTT: `cage_id`, `status`, `posição`, `timestamp` | Alta |
| RF04 | Capturar e enviar snapshot (JPEG base64) sob demanda ou em intervalo configurável | Média |

---

## 4. Contrato MQTT

### Tópicos Publicados

**`zoo/cage/{cage_id}/status`** — publicado a cada ciclo de leitura

```json
{
  "cage_id": "cage_leao_01",
  "status": "active",
  "activity_level": 0.85,
  "position_pan": 90.0,
  "position_tilt": 45.0,
  "ts": "2024-01-15T14:32:10Z"
}
```

- `status`: `"active"` | `"inactive"`
- `activity_level`: float 0.0–1.0 (intensidade do movimento detectado)
- `position_pan`: graus (0–180)
- `position_tilt`: graus (0–180)

**`zoo/cage/{cage_id}/snapshot`** — publicado sob demanda ou por intervalo

```json
{
  "cage_id": "cage_leao_01",
  "image_base64": "<string JPEG em base64>",
  "ts": "2024-01-15T14:32:10Z"
}
```

### Tópicos Subscritos

**`zoo/cage/{cage_id}/cmd`**

```json
{ "action": "snapshot" }
{ "action": "reboot" }
{ "action": "set_interval", "value": 30 }
```

- `snapshot`: força captura e publicação imediata
- `reboot`: reinicia o dispositivo
- `set_interval`: altera intervalo de publicação (segundos)

---

## 5. Lógica de Firmware

### 5.1 Detecção de Movimento (Frame Differencing)

```
1. Capturar frame_atual
2. Calcular diff pixel-a-pixel com frame_anterior
3. Somar pixels com diff > THRESHOLD_PIXEL
4. Se soma > THRESHOLD_AREA → status = "active", activity_level = soma / total_pixels
5. Senão → status = "inactive", activity_level = soma / total_pixels
6. frame_anterior = frame_atual
```

- `THRESHOLD_PIXEL` (default): `30` (diferença mínima por canal)
- `THRESHOLD_AREA` (default): `5%` dos pixels totais
- Recomendar resolução de processamento: **96x96** ou **160x120** (reduzida para performance)

### 5.2 Rastreamento Pan-Tilt

```
1. Ao detectar movimento, identificar centróide da região ativa
2. Calcular erro entre centróide e centro do frame
3. Aplicar correção proporcional (P-controller simples):
   delta_pan  = Kp * erro_x
   delta_tilt = Kp * erro_y
4. Atualizar posição dos servos (clampear entre 0–180°)
5. Publicar nova posição no próximo ciclo MQTT
```

- `Kp` (default): `0.1`
- Atualização dos servos: máximo a cada **100ms** (evitar vibração)

### 5.3 Configuração de Rede

- Broker MQTT: IP fixo do Raspberry Pi na rede local (configurável via `#define` ou arquivo de config)
- Porta MQTT: `1883`
- Client ID: `esp32_{cage_id}_{MAC_SUFFIX}`
- Keep-alive: `60s`
- Reconexão automática em caso de queda

### 5.4 Intervalo de Publicação

- Default: publicar status a cada **10 segundos**
- Snapshots automáticos: desabilitados por default; ativar via `set_interval`

---

## 6. Requisitos Não-Funcionais

| ID | Requisito | Critério |
|----|-----------|----------|
| RNF01 | Latência MQTT | < 500ms em 95% das mensagens |
| RNF02 | Alimentação estável | MB102 regulando para 3.3V/5V |
| RNF03 | Case protetora | Mínimo IP44 (resistente a respingos) |
| RNF03 | Escalabilidade | Identificação por `cage_id` único no firmware; servidor não precisa ser reconfigurado |

---

## 7. Stack Técnica

- **Linguagem:** MicroPython **ou** C++ (Arduino IDE / PlatformIO)
- **Biblioteca MQTT:** `micropython-umqtt` (MicroPython) ou `PubSubClient` (Arduino)
- **Controle de servo:** PWM nativo do ESP32 (ledc)
- **Câmera:** `esp32-camera` driver (já integrado no ESP32-S3 Sense)

---

## 8. Entregas

- [ ] **E1.1** — Circuito montado e servos respondendo a comandos manuais (sweep teste)
- [ ] **E1.2** — Detecção de movimento funcional com classificação Ativo/Inativo no monitor serial
- [ ] **E1.3** — Publicação de status e snapshots via MQTT (verificado com MQTT Explorer)
- [ ] **E1.4** — Rastreamento Pan-Tilt automático seguindo o centróide do movimento

---

## 9. Dependências com Outros Módulos

| Dependência | Módulo | Detalhe |
|-------------|--------|---------|
| Broker MQTT rodando | SPEC-02 (Backend) | O ESP32 precisa do IP e porta do broker antes de testar RF03 |
| Formato do payload acordado | SPEC-02 (Backend) | Schema JSON desta spec é o contrato — qualquer mudança deve ser alinhada |

---

## 10. Critérios de Aceite

- Pelo menos 1 unidade publicando `zoo/cage/{id}/status` com dados válidos a cada ≤ 10s
- Servos movem corretamente em resposta ao centróide detectado
- Dispositivo reconecta ao MQTT automaticamente após queda de rede
- Comando `snapshot` via MQTT retorna imagem JPEG válida em base64
