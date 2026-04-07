# SPEC-01 — Unidade de Captura (Jaula / ESP32-S3)

**Papel:** Engenheiro de Hardware & Firmware
**Módulo:** Visão Computacional + MQTT Client

---

## 1. Visão Geral

Cada jaula é um nó autônomo baseado no **ESP32-S3 Sense** com câmera OV2640 fixa. O dispositivo processa imagens localmente via background subtraction para detectar presença, contar animais e localizar a zona de atividade. Comunica-se com o servidor central via MQTT. Alimentado via USB-C.

```
[OV2640 fixo] → [ESP32-S3] → background subtraction → publica MQTT
                                    ↓
                            contagem + zona (grade 3×3)
```

---

## 2. Hardware

| Componente | Qtd. | Função |
|------------|------|--------|
| ESP32-S3 Sense (câmera OV2640 integrada) | 1 | Processamento de visão e Wi-Fi |
| Cabo USB-C | 1 | Alimentação e programação |

> Câmera interna ao módulo. Nenhum componente externo necessário.

---

## 3. Requisitos Funcionais

| ID | Requisito | Prioridade | Status |
|----|-----------|------------|--------|
| RF01 | Detectar presença do animal via background subtraction adaptativo | Alta | ✓ Implementado |
| RF02 | Contar número de animais via blob detection em grade 8×8 | Alta | ✓ Implementado |
| RF03 | Localizar zona de atividade principal (grade 3×3) | Alta | ✓ Implementado |
| RF04 | Publicar metadados via MQTT: `cage_id`, `status`, `activity_level`, `animal_count`, `zone`, `ts` | Alta | Módulo 3 |
| RF05 | Capturar e enviar snapshot JPEG base64 sob demanda via MQTT | Média | Módulo 3 |
| RF06 | Capturar snapshot de referência via comando serial para mapear zonas | Média | ✓ Implementado |

> **Nota de design:** TFLite (MobileNet person detection) foi avaliado e descartado para MVP — modelo genérico tem baixa acurácia para animais/poses variadas. Background subtraction é mais robusto para câmera estática em ambiente controlado. Para produção futura com detecção por espécie: treinar modelo customizado no Edge Impulse.

---

## 4. Contrato MQTT

### Tópicos Publicados

**`zoo/cage/{cage_id}/status`** — publicado a cada ciclo de leitura

```json
{
  "cage_id": "cage_leao_01",
  "status": "active",
  "activity_level": 0.187,
  "animal_count": 2,
  "zone": "bottom_left",
  "ts": "2024-01-15T14:32:10Z"
}
```

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `status` | string | `"active"` \| `"inactive"` |
| `activity_level` | float 0–1 | Fração de pixels alterados vs background |
| `animal_count` | int | Blobs com ≥ 3 células ativas na grade 8×8 |
| `zone` | string \| null | Posição do animal principal na grade 3×3; `null` se inativo |

**Valores de `zone`:** `top_left` · `top_center` · `top_right` · `left` · `center` · `right` · `bottom_left` · `bottom_center` · `bottom_right`

**`zoo/cage/{cage_id}/snapshot`** — publicado sob demanda

```json
{
  "cage_id": "cage_leao_01",
  "image_base64": "<JPEG VGA em base64>",
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

---

## 5. Lógica de Firmware

### 5.1 Detecção de Presença (Background Subtraction Adaptativo)

```
1. Capturar frame 96×96 grayscale
2. Comparar pixel a pixel com background
3. Contar pixels com diff > 25
4. activity_level = pixels_alterados / total_pixels
5. rawActive = activity_level > 10%
6. Aplicar histerese:
   - rawActive por ≥ 2 frames consecutivos → confirmed_active = true
   - rawInactive por ≥ 10 frames consecutivos → confirmed_active = false
7. Quando inativo: background += (frame - background) / 20  (aprendizado lento)
```

### 5.2 Contagem e Localização (Blob Detection em Grade 8×8)

```
1. Dividir frame 96×96 em grade 8×8 (células de 12×12px)
2. Célula ativa se ≥ 15 dos 144 pixels diferem do background
3. Flood fill DFS nas 64 células (4-conectividade)
4. Blob = grupo de células conectadas com ≥ 3 células
5. animal_count = número de blobs válidos
6. zone = centróide do maior blob → mapeado para grade 3×3
```

**Por que grade e não pixel a pixel:** objeto em movimento gera diff na posição atual e na anterior (ghost), fragmentando em múltiplos blobs. Células de 12×12px absorvem o ghost naturalmente.

### 5.3 Configuração de Rede

- Broker MQTT: IP fixo do Raspberry Pi (`#define MQTT_BROKER`)
- Porta: `1883`
- Client ID: `esp32_{cage_id}_{MAC_SUFFIX}`
- Keep-alive: `60s` · Reconexão automática

### 5.4 Intervalo de Publicação

- Status: a cada **10 segundos** (default)
- Snapshots automáticos: desabilitados; ativar via `set_interval`

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
- **Câmera:** `espressif/esp32-camera`
- **MQTT:** `PubSubClient` (Módulo 3)
- **Visão:** Background subtraction + blob detection (implementação própria, sem dependência ML)

---

## 8. Entregas

- [x] **E1.1** — Câmera OV2640 inicializando, frames capturados confirmados no serial
- [x] **E1.2** — Detecção, contagem e localização funcionais no monitor serial; snapshot de referência via comando `s`
- [ ] **E1.3** — Publicação de status e snapshots via MQTT (verificado com MQTT Explorer)

---

## 9. Dependências com Outros Módulos

| Dependência | Módulo | Detalhe |
|-------------|--------|---------|
| Broker MQTT rodando | SPEC-02 | ESP32 precisa do IP antes de testar RF04 |
| Schema JSON acordado | SPEC-02 | Payload desta spec é o contrato |
| Tabela `cage_zones` populada | SPEC-02 | Mapeamento zone → descrição por jaula |

---

## 10. Critérios de Aceite

- Unidade publicando `zoo/cage/{id}/status` com dados válidos a cada ≤ 10s
- `animal_count` estável (±1) com cena parada
- Dispositivo reconecta ao MQTT automaticamente após queda de rede
- Comando `snapshot` via MQTT retorna JPEG VGA válido em base64
