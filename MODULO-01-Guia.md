# Módulo 1 — Guia de Montagem e Upload

> Camera Init Test — ESP32-S3 Sense via USB-C

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

## Parte 2 — Hardware Necessário

### Peças necessárias
- ESP32-S3 Sense (XIAO) — câmera OV2640 já integrada no módulo
- Cabo USB-C

É só isso. Sem servos, sem protoboard, sem fonte externa.

---

## Parte 3 — Upload do Código

### Passo 1: Compilar
Na barra azul do PlatformIO (parte inferior do VSCode), clique no **visto (✓) Build**.
Aguarde `SUCCESS` no terminal.

### Passo 2: Conectar o ESP32-S3 via USB-C
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

**Monitor serial (sucesso):**
```
=== SmartZoo — Módulo 1: Camera Init ===
Inicializando câmera OV2640...
Câmera OK! Resolução: 96x96
Capturando frame 1... OK (tamanho: 4096 bytes)
Capturando frame 2... OK (tamanho: 4102 bytes)
Capturando frame 3... OK (tamanho: 4089 bytes)
...
```

**Monitor serial (falha):**
```
=== SmartZoo — Módulo 1: Camera Init ===
Inicializando câmera OV2640...
ERRO: Câmera falhou (código: 0x105)
Reiniciando em 3s...
```

---

## Possíveis problemas e soluções

| Problema | Causa | Solução |
|----------|-------|---------|
| `ERRO: Câmera falhou` | Módulo com defeito ou cabo solto | Tente pressionar o módulo da câmera com cuidado; verifique se o conector flat está encaixado |
| Upload falha | Driver ou modo boot | Segure BOOT no ESP32-S3 durante o upload |
| Nada aparece no serial | Baud rate errado | Confirme 115200 no monitor |
| Frames com tamanho 0 | Câmera inicializou mas não captura | Adicione `delay(500)` após `esp_camera_init()` no código |

---

## Próximo passo

Módulo 2 — Câmera + Frame Differencing (detecção de movimento).
