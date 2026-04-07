# Módulo 2 — Guia de Upload

> Detecção de Presença + Contagem + Localização (Background Subtraction)

**Status: Concluído**

---

## Hardware necessário

- ESP32-S3 Sense (XIAO) + cabo USB-C
- Nenhuma mudança em relação ao Módulo 1

---

## Upload do Código

### Passo 1: Compilar e fazer upload
Na barra do PlatformIO: **Build (✓)** → **Upload (→)**

> Build agora é rápido (~30s) — sem TFLite.

### Passo 2: Monitor Serial (115200 baud)

---

## Calibração inicial

Ao ligar, a câmera precisa capturar o background da **cena vazia** (sem animal).

1. Aponte a câmera para a jaula vazia
2. Aguarde ~3 segundos
3. O background é calibrado automaticamente quando 10 frames consecutivos ficam abaixo do threshold

---

## O que você deve ver

**Cena vazia (calibrando):**
```
inactive | count: 0 | zone: -           | bg_diff: 0.008
inactive | count: 0 | zone: -           | bg_diff: 0.011
```

**1 pessoa/animal detectado:**
```
ACTIVE   | count: 1 | zone: center      | bg_diff: 0.213
ACTIVE   | count: 1 | zone: center      | bg_diff: 0.198
```

**2 pessoas/animais detectados:**
```
ACTIVE   | count: 2 | zone: bottom_left | bg_diff: 0.341
```

**Após sair da cena** (~3s para confirmar inactive):
```
inactive | count: 0 | zone: -           | bg_diff: 0.031
inactive | count: 0 | zone: -           | bg_diff: 0.014
```

---

## Capturar imagem de referência para mapear zonas

Envie `s` pelo monitor serial para receber um JPEG VGA em base64:

```
[SNAPSHOT] Capturando imagem de referência (VGA JPEG)...
[SNAPSHOT] 28432 bytes JPEG → 37912 chars base64
>>>SNAPSHOT_START<<<
/9j/4AAQSkZJRgAB...
>>>SNAPSHOT_END<<<
[SNAPSHOT] Cole em: https://base64.guru/converter/decode/image
```

Com a imagem, mapeie cada célula da grade 3×3 para a descrição real da jaula:

```
top_left    → "próximo à rocha"
top_center  → "sob a sombra da árvore"
top_right   → "perto do bebedouro"
left        → "na área gramada esquerda"
center      → "centro da jaula"
right       → "próximo ao tronco"
bottom_left → "no canto, perto das árvores"
...
```

Esse mapeamento vai para a tabela `cage_zones` do backend (SPEC-02).

---

## Parâmetros ajustáveis no código

| Constante | Valor | Efeito |
|-----------|-------|--------|
| `BG_PIXEL_THRESHOLD` | `25` | Sensibilidade por pixel |
| `BG_AREA_THRESHOLD` | `0.10` | % mínimo de pixels para detectar presença |
| `BG_ALPHA` | `20` | Velocidade de adaptação do background (~20 frames) |
| `FRAMES_TO_ACTIVATE` | `2` | Frames positivos para confirmar ACTIVE |
| `FRAMES_TO_DEACTIVATE` | `10` | Frames negativos para confirmar inactive (~3s) |
| `CELL_ACTIVE_THRESHOLD` | `15` | Pixels ativos por célula 12×12 |
| `MIN_BLOB_CELLS` | `3` | Células mínimas para contar como animal |

---

## Próximo passo

Módulo 3 — WiFi + MQTT Client (publicar status, contagem e snapshots para o servidor).
