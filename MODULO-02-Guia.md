# Módulo 2 — Guia de Upload

> Detecção de Presença com TFLite — MVP com pessoa, produção com animal

---

## O que muda neste módulo

O firmware agora roda um modelo de **machine learning** (MobileNet INT8 quantizado) diretamente no ESP32-S3 para detectar se há alguém na câmera. Nenhuma mudança de hardware — continua só o XIAO + USB-C.

Para MVP testamos com **pessoa**. Na produção, o modelo será trocado por um treinado para o animal da jaula.

---

## Upload do Código

A biblioteca `Arduino_TensorFlowLite` foi originalmente escrita para Arduino Nano 33 BLE (nRF52) e não compila direto no ESP32. O script `scripts/setup_tflite.py` corrige isso automaticamente antes de cada build.

### Passo 1: Primeira compilação (duas etapas)

**1ª vez — baixar dependências:**
Na barra do PlatformIO, clique em **Build** (visto ✓).
A compilação vai **falhar** na primeira vez — isso é esperado. O PlatformIO precisa baixar a biblioteca (~60MB) antes que o script de correção possa rodar.

**2ª vez — build real:**
Clique em **Build** novamente.
Desta vez o script `setup_tflite.py` corrige os arquivos nRF52 e copia os dados do modelo para `src/`. Aguarde `SUCCESS`.

> A partir da segunda vez, o build funciona normalmente com um único clique.

### Passo 2: Upload
Clique na **seta (→) Upload**.

### Passo 3: Monitor Serial
Clique no ícone de **tomada (Serial Monitor)**, selecione **115200** baud.

---

## O que você deve ver

**Inicialização:**
```
=== SmartZoo — Módulo 2: Detecção de Presença ===
Inicializando câmera... OK
Carregando modelo TFLite... OK
Tensor arena: 100 KB na PSRAM
Pronto. Aponte a câmera para uma pessoa...
```

**Sem ninguém na câmera:**
```
Status: inactive  | score: 0.18 (presente) / 0.82 (ausente)
Status: inactive  | score: 0.21 (presente) / 0.79 (ausente)
```

**Com pessoa na câmera:**
```
Status: ACTIVE    | score: 0.87 (presente) / 0.13 (ausente)
Status: ACTIVE    | score: 0.91 (presente) / 0.09 (ausente)
Status: inactive  | score: 0.54 (presente) / 0.46 (ausente)
```

O status muda para `ACTIVE` quando `score >= 0.70` (70% de confiança).

---

## Parâmetro ajustável

| Constante | Valor padrão | Efeito |
|-----------|-------------|--------|
| `DETECTION_THRESHOLD` | `0.70` | Limiar de confiança. Reduzir → mais sensível (mais falsos positivos). Aumentar → mais restrito. |

---

## Possíveis problemas

| Problema | Causa | Solução |
|----------|-------|---------|
| `ERRO: ps_malloc falhou` | PSRAM não está ativa | Verifique se `board_build.arduino.memory_type = qio_opi` está no `platformio.ini` |
| `ERRO: AllocateTensors falhou` | Tensor arena pequeno | Aumente `kTensorArenaSize` para `150 * 1024` |
| Sempre `inactive` com pessoa | Iluminação ruim ou câmera longe | Aproxime-se a menos de 1 metro; melhore a iluminação |
| Compilação falha na 1ª vez | Normal — lib ainda não foi baixada | Clique em Build uma segunda vez |
| `#error "unsupported board"` ainda aparece | Script não rodou ou lib estava em cache | Delete `.pio/libdeps` e recompile duas vezes |
| `person_detect_model_data.h` not found | Script não encontrou o arquivo na lib | Verifique se `examples/person_detection/` existe em `.pio/libdeps/.../Arduino_TensorFlowLite/` |

---

## Como trocar para modelo de animal (produção)

1. Treine ou obtenha um modelo TFLite INT8 96x96 grayscale para o animal
2. Converta para C array: `xxd -i modelo.tflite > animal_model_data.h`
3. No `main.cpp`, troque:
   - `#include "person_detect_model_data.h"` → `#include "animal_model_data.h"`
   - `g_person_detect_model_data` → `g_animal_model_data`
   - Ajuste os índices de saída conforme as classes do novo modelo

---

## Próximo passo

Módulo 3 — WiFi + MQTT Client (publicar status e snapshots para o servidor).
