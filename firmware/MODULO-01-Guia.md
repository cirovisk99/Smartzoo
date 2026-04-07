# Módulo 1 — Guia de Montagem e Upload

> Servo Sweep Test — ESP32-S3 Sense + MB102 + 2x Servo MG90S

---

## Parte 1 — Instalar o Software

### Passo 1: Instalar o VSCode
Baixe em [code.visualstudio.com](https://code.visualstudio.com) e instale normalmente.

### Passo 2: Instalar a extensão PlatformIO
1. Abra o VSCode
2. Clique no ícone de **Extensões** na barra lateral esquerda (`Ctrl+Shift+X`)
3. Busque por `PlatformIO IDE`
4. Clique em **Install** e aguarde
5. Reinicie o VSCode quando solicitado

### Passo 3: Abrir o projeto
1. **File → Open Folder**
2. Navegue até `Documentos/FIAP/Smartzoo/firmware`
3. Clique em **Select Folder**
4. O PlatformIO reconhece o `platformio.ini` automaticamente

---

## Parte 2 — Montagem Física

### Peças necessárias
- ESP32-S3 Sense (XIAO)
- Módulo MB102
- 2x Servo MG90S
- Capacitor Eletrolítico 1000µF 16V
- Fonte 9V 2A (plug P4)
- Protoboard + Jumpers

---

### Entendendo as peças

**Servo MG90S — 3 fios:**
```
Marrom   → GND   (terra)
Vermelho → VCC   (alimentação 5V)
Laranja  → Sinal (PWM vindo do ESP32)
```

**Módulo MB102 — jumpers:**
Coloque ambos os jumpers na posição **5V**.

**Capacitor 1000µF — tem polaridade:**
```
Perna LONGA  → positivo (+) → rail vermelho (5V)
Perna CURTA  → negativo (-) → rail azul    (GND)
```

**Pino 5V do XIAO ESP32S3:**
```
         USB-C
    ┌─────────────┐
5V  │ ●         ● │  GND
3V3 │ ●         ● │  ...
```
Segundo pino do lado esquerdo (com USB-C voltado para cima).

---

### Diagrama de ligação

```
FONTE 9V 2A
    │
    └──→ MB102 (entrada P4)
              │
        ┌─────┴─────┐
      5V Rail     GND Rail
        │              │
        ├── (+) Capacitor 1000µF ── (-) ┤
        │                               │
        ├── VCC Servo Pan  (vermelho)   │
        ├── VCC Servo Tilt (vermelho)   │
        │                               │
        │   GND Servo Pan  (marrom) ────┤
        │   GND Servo Tilt (marrom) ────┤
        │                               │
        ├──→ Pino 5V  do ESP32-S3       │
              Pino GND do ESP32-S3 ─────┘

ESP32-S3 Sense
        ├── GPIO 5 ──→ Sinal Servo Pan  (laranja)
        └── GPIO 6 ──→ Sinal Servo Tilt (laranja)
```

---

### Passo a passo físico

**Passo 1 — Encaixe o MB102 na protoboard**
Pressione firme até encaixar nos dois lados.

**Passo 2 — Configure os jumpers do MB102**
Coloque ambos na posição **5V**.

**Passo 3 — Conecte o capacitor**
- Perna longa no rail **vermelho** (5V)
- Perna curta no rail **azul** (GND)
- Posicione próximo aos servos

**Passo 4 — Conecte o Servo Pan (GPIO 5)**

| Fio | Destino |
|-----|---------|
| Marrom (GND) | Rail azul (GND) do MB102 |
| Vermelho (VCC) | Rail vermelho (5V) do MB102 |
| Laranja (Sinal) | GPIO 5 do ESP32-S3 |

**Passo 5 — Conecte o Servo Tilt (GPIO 6)**

| Fio | Destino |
|-----|---------|
| Marrom (GND) | Rail azul (GND) do MB102 |
| Vermelho (VCC) | Rail vermelho (5V) do MB102 |
| Laranja (Sinal) | GPIO 6 do ESP32-S3 |

**Passo 6 — Alimente o ESP32-S3 pelo MB102**
- Pino **5V** do ESP32-S3 → rail vermelho (5V) do MB102
- Pino **GND** do ESP32-S3 → rail azul (GND) do MB102

> O ESP32-S3 aceita 5V nesse pino e regula internamente para 3.3V.

---

## Parte 3 — Upload do Código

### Alimentação durante o desenvolvimento

| Fase | Alimentação |
|------|-------------|
| Gravar o código | USB conectado ao computador |
| Testar rodando | MB102 + fonte 9V (sem USB) |

> USB e MB102 podem ficar conectados ao mesmo tempo — o ESP32-S3 lida com isso sem problema. No projeto final (jaula), roda apenas com MB102 + fonte 9V.

### Passo 1: Compilar
Na barra azul do PlatformIO (parte inferior do VSCode), clique no **visto (✓) Build**.
Aguarde `SUCCESS` no terminal.

### Passo 2: Conectar o ESP32-S3 via USB
Conecte o cabo USB-C do ESP32-S3 no computador.

### Passo 3: Fazer o upload
Na barra azul, clique na **seta (→) Upload**.
Aguarde `Leaving... Hard resetting via RTS pin...`.

> Se aparecer erro de porta, pressione e segure o botão **BOOT** do ESP32-S3 enquanto clica em Upload, depois solte.

### Passo 4: Abrir o Monitor Serial
Na barra azul, clique no ícone de **tomada (Serial Monitor)**.
Selecione **115200** baud.

---

## Parte 4 — O que você deve ver

**Monitor serial:**
```
=== SmartZoo — Módulo 1: Servo Sweep ===
Servos centralizados em 90°. Iniciando sweep em 2s...
Pan:   0°  Tilt:   0°
Pan:   1°  Tilt:   1°
...
Pan: 180°  Tilt: 180°
Pan: 179°  Tilt: 179°
...
```

**Fisicamente:**
1. Ambos os servos vão para 90° e pausam 2 segundos
2. Varrem lentamente de 0° até 180°
3. Voltam de 180° até 0°, repetindo indefinidamente

---

## Possíveis problemas e soluções

| Problema | Causa | Solução |
|----------|-------|---------|
| Servo treme muito | Alimentação instável | Verifique polaridade e encaixe do capacitor |
| Servo não se move | GND não compartilhado | Confirme GND do ESP32 ligado ao rail GND do MB102 |
| Servo bate no limite | Pulso fora do range | Ajuste `PULSE_MIN_US` para `600` e `PULSE_MAX_US` para `2400` no `main.cpp` |
| Upload falha | Driver ou modo boot | Segure BOOT no ESP32-S3 durante o upload |
| Nada aparece no serial | Baud rate errado | Confirme 115200 no monitor |

---

## Próximo passo

Módulo 2 — Câmera + Frame Differencing (detecção de movimento).
