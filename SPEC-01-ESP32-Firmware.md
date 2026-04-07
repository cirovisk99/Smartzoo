# SPEC-01 — Unidade de Captura (Jaula / ESP32-S3)

**Papel:** Engenheiro de Hardware & Firmware
**Módulo:** Edge AI + MQTT Client

---

## 1. Visão Geral

Cada jaula é um nó autônomo baseado no **ESP32-S3 Sense** com câmera OV2640 fixa. O dispositivo processa imagens localmente para classificar o status do animal e comunica-se com o servidor central via MQTT. Alimentado via USB-C.

```
[OV2640 fixo] → [ESP32-S3] → classifica → publica MQTT
```

---

## 2. Hardware

| Componente | Qtd. | Função |
|------------|------|--------|
| ESP32-S3 Sense (câmera OV2640 integrada) | 1 | Processamento de visão e Wi-Fi |
| Cabo USB-C | 1 | Alimentação e programação |

> Os pinos de câmera são internos ao módulo ESP32-S3 Sense. Nenhum componente externo adicional necessário.

---

## 3. Requisitos Funcionais

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF01 | Detectar presença do animal via modelo de visão computacional (TFLite, 96x96 INT8) | Alta |
| RF02 | Publicar metadados via MQTT: `cage_id`, `status`, `activity_level`, `timestamp` | Alta |
| RF03 | Capturar e enviar snapshot (JPEG base64) sob demanda ou em intervalo configurável | Média |

> **MVP:** modelo de detecção de pessoa (MobileNet quantizado) como substituto. Para produção, substituir pelo modelo de animal treinado.

---

## 4. Contrato MQTT

### Tópicos Publicados

**`zoo/cage/{cage_id}/status`** — publicado a cada ciclo de leitura

```json
{
  "cage_id": "cage_leao_01",
  "status": "active",
  "activity_level": 0.85,
  "zone": "bottom_left",
  "ts": "2024-01-15T14:32:10Z"
}
```

- `status`: `"active"` | `"inactive"`
- `activity_level`: float 0.0–1.0 (score de confiança do modelo)
- `zone`: posição na grade 3×3 do frame — `"top_left"` | `"top_center"` | `"top_right"` | `"left"` | `"center"` | `"right"` | `"bottom_left"` | `"bottom_center"` | `"bottom_right"` | `null` (quando inativo ou background ainda não calibrado)

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

### 5.1 Detecção de Presença (TFLite Inference)

```
1. Capturar frame 96x96 grayscale
2. Copiar frame para o tensor de entrada do modelo
3. Executar inferência (MobileNet INT8)
4. Ler score de presença (índice 1 do tensor de saída)
5. Se score >= DETECTION_THRESHOLD → status = "active", activity_level = score
6. Senão → status = "inactive", activity_level = score
```

- Modelo: MobileNet quantizado INT8, 96x96 grayscale
- `DETECTION_THRESHOLD` (default): `0.70` (70% de confiança)
- Tensor arena: 100 KB na PSRAM do ESP32-S3
- Taxa: ~3 inferências/segundo
- **MVP:** modelo de pessoa — produção: trocar `g_person_detect_model_data` por modelo de animal

### 5.2 Configuração de Rede

- Broker MQTT: IP fixo do Raspberry Pi na rede local (configurável via `#define`)
- Porta MQTT: `1883`
- Client ID: `esp32_{cage_id}_{MAC_SUFFIX}`
- Keep-alive: `60s`
- Reconexão automática em caso de queda

### 5.3 Intervalo de Publicação

- Default: publicar status a cada **10 segundos**
- Snapshots automáticos: desabilitados por default; ativar via `set_interval`

---

## 6. Requisitos Não-Funcionais

| ID | Requisito | Critério |
|----|-----------|----------|
| RNF01 | Latência MQTT | < 500ms em 95% das mensagens |
| RNF02 | Alimentação | Via USB-C (5V) |
| RNF03 | Case protetora | Mínimo IP44 (resistente a respingos) |
| RNF04 | Escalabilidade | Identificação por `cage_id` único no firmware |

---

## 7. Stack Técnica

- **Linguagem:** C++ (PlatformIO)
- **Biblioteca MQTT:** `PubSubClient`
- **Câmera:** `esp32-camera` driver (já integrado no ESP32-S3 Sense)
- **Inferência:** `tflite-micro-arduino-examples` (TFLite Micro, tensor arena na PSRAM)

---

## 8. Entregas

- [ ] **E1.1** — Câmera inicializando e capturando frames confirmado no monitor serial
- [ ] **E1.2** — Detecção de movimento funcional com classificação Ativo/Inativo no monitor serial
- [ ] **E1.3** — Publicação de status e snapshots via MQTT (verificado com MQTT Explorer)

---

## 9. Dependências com Outros Módulos

| Dependência | Módulo | Detalhe |
|-------------|--------|---------|
| Broker MQTT rodando | SPEC-02 (Backend) | O ESP32 precisa do IP e porta do broker antes de testar RF02 |
| Formato do payload acordado | SPEC-02 (Backend) | Schema JSON desta spec é o contrato — qualquer mudança deve ser alinhada |

---

## 10. Critérios de Aceite

- Pelo menos 1 unidade publicando `zoo/cage/{id}/status` com dados válidos a cada ≤ 10s
- Dispositivo reconecta ao MQTT automaticamente após queda de rede
- Comando `snapshot` via MQTT retorna imagem JPEG válida em base64
