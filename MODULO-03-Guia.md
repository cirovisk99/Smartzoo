# SmartZoo — Módulo 3: WiFi + MQTT

## O que este módulo faz

Adiciona conectividade ao firmware do Módulo 2 (detecção + localização):

- Conecta o ESP32-S3 ao WiFi e ao broker MQTT (Mosquitto no Raspberry Pi)
- Publica telemetria de status a cada 10 s (configurável)
- Recebe comandos remotos: snapshot, reboot, set_interval
- Mantém todo o funcionamento offline dos Módulos 1 e 2

---

## Pré-requisitos

| Item | Observação |
|------|-----------|
| Módulos 1 e 2 funcionando | Câmera + detecção operacionais |
| Raspberry Pi na rede local | Com Mosquitto instalado e rodando |
| IP fixo (ou reservado por DHCP) para o Raspberry Pi | Anote o IP — você vai precisar |
| MQTT Explorer instalado no seu PC | Download em https://mqtt-explorer.com |
| Rede WiFi 2.4 GHz | O ESP32 não suporta 5 GHz |

### Verificar se o Mosquitto está rodando no Raspberry Pi

```bash
# No terminal do Raspberry Pi:
sudo systemctl status mosquitto
# Deve aparecer "active (running)"

# Se não estiver rodando:
sudo apt install mosquitto mosquitto-clients -y
sudo systemctl enable mosquitto
sudo systemctl start mosquitto

# Descobrir o IP do Raspberry Pi:
hostname -I
```

Por padrão o Mosquitto aceita conexões na porta 1883 sem autenticação.  
Se o seu broker exigir usuário/senha, adicione `mqtt_client.connect(id, user, pass)` em `ensureMqttConnected()`.

---

## Configuração dos #define

Abra `firmware/src/main.cpp` e ajuste o bloco de configuração no topo:

```cpp
#define WIFI_SSID    "SEU_WIFI_AQUI"       // Nome da rede WiFi (case-sensitive)
#define WIFI_PASS    "SUA_SENHA_AQUI"      // Senha do WiFi
#define MQTT_BROKER  "192.168.1.100"       // IP do Raspberry Pi
#define MQTT_PORT    1883                  // Porta padrão MQTT
#define CAGE_ID      "cage01"             // ID único desta gaiola (sem espaços)
```

Regras para o `CAGE_ID`:
- Use apenas letras minúsculas, números e underscore
- Deve ser único por gaiola (cage01, cage02, ...)
- Aparece em todos os tópicos MQTT: `zoo/cage/cage01/...`

---

## Compilar e gravar

```bash
# Na pasta raiz do firmware:
cd firmware
pio run --target upload

# Monitorar serial:
pio device monitor --baud 115200
```

Saída esperada no serial ao iniciar:

```
=== SmartZoo — Módulo 3: WiFi + MQTT ===
[CAM] Inicializando... OK
[WiFi] Conectando a 'MinhaRede'......
[WiFi] Conectado! IP: 192.168.1.55
[MQTT] Conectando a 192.168.1.100:1883 (id=esp32_cage01_A3F2)...
[MQTT] Conectado!
[MQTT] Subscrito em: zoo/cage/cage01/cmd
[CAM] Calibrando background — mantenha a cena VAZIA por ~3s...
inactive | count: 0 | zone: -              | bg_diff: 0.001
inactive | count: 0 | zone: -              | bg_diff: 0.002
...
[MQTT] Status publicado (OK): {"cage_id":"cage01","status":"inactive",...}
```

---

## Tópicos MQTT

| Tópico | Direção | Conteúdo |
|--------|---------|----------|
| `zoo/cage/{CAGE_ID}/status` | ESP → Broker | Telemetria de status (JSON) |
| `zoo/cage/{CAGE_ID}/cmd` | Broker → ESP | Comandos remotos (JSON) |
| `zoo/cage/{CAGE_ID}/snapshot` | ESP → Broker | Imagem JPEG em base64 |

### Payload de status (publicado a cada N segundos)

```json
{
  "cage_id": "cage01",
  "status": "active",
  "activity_level": 0.183,
  "animal_count": 1,
  "zone": "center",
  "uptime_ms": 45320
}
```

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `cage_id` | string | ID da gaiola (igual ao `#define CAGE_ID`) |
| `status` | string | `"active"` ou `"inactive"` |
| `activity_level` | float | Fração de pixels alterados (0.0 – 1.0) |
| `animal_count` | int | Número de animais detectados (0 se inativo) |
| `zone` | string | Zona do animal principal (grade 3×3) ou `"unknown"` |
| `uptime_ms` | int | Tempo desde o boot em milissegundos (substitui timestamp NTP no MVP) |

Zonas possíveis: `top_left`, `top_center`, `top_right`, `left`, `center`, `right`, `bottom_left`, `bottom_center`, `bottom_right`

---

## Verificando no MQTT Explorer

1. Abra o MQTT Explorer
2. Clique em **+** para nova conexão
3. Preencha:
   - **Host**: IP do Raspberry Pi (ex.: `192.168.1.100`)
   - **Port**: `1883`
   - **Protocol**: `mqtt://`
4. Clique em **Connect**
5. No painel esquerdo expanda: `zoo` → `cage` → `cage01`

O que observar:

- **status** — atualiza a cada 10 s com o JSON de telemetria
- **snapshot** — aparece quando um snapshot é capturado (string base64 longa)
- **cmd** — tópico de entrada; você vai publicar aqui

Para visualizar o payload formatado, clique no tópico e selecione a aba **Value** no painel direito.

---

## Enviando comandos pelo MQTT Explorer

No MQTT Explorer, use o campo de publicação (painel inferior ou botão **Publish**):

- **Topic**: `zoo/cage/cage01/cmd`
- **Payload**: JSON abaixo
- **QoS**: 0
- Clique em **Publish**

### Comando: snapshot

```json
{"action":"snapshot"}
```

O ESP captura um frame VGA JPEG, codifica em base64 e publica em `zoo/cage/cage01/snapshot`.  
Para visualizar a imagem:
1. Copie o valor do tópico `snapshot` no MQTT Explorer
2. Cole em https://base64.guru/converter/decode/image
3. Clique em **Decode**

### Comando: reboot

```json
{"action":"reboot"}
```

O ESP reinicia imediatamente. Após ~5 s reconecta ao WiFi e ao MQTT.

### Comando: set_interval

```json
{"action":"set_interval","value":30}
```

Altera o intervalo de publicação de status para 30 segundos.  
Valor mínimo: 1 s | Valor máximo: 3600 s (1 hora).  
O novo intervalo é aplicado imediatamente sem reiniciar o ESP.

---

## Reconexão automática

O firmware trata desconexões sem travar:

- **WiFi cai**: o `loop()` verifica `WiFi.status()` a cada ciclo; quando o WiFi reconectar (geralmente automático pelo driver), o MQTT reconecta na próxima iteração
- **MQTT cai**: `ensureMqttConnected()` é chamada a cada ciclo quando detecta desconexão; tenta uma reconexão por vez (sem bloquear)
- **Broker reinicia**: mesmo tratamento do item acima

---

## Solução de problemas

| Sintoma | Causa provável | Ação |
|---------|---------------|------|
| Serial trava em `Conectando a 'MinhaRede'......` | SSID/senha errada ou rede 5 GHz | Verifique os `#define`; use rede 2.4 GHz |
| `[MQTT] Falha (rc=-2)` | Broker inacessível | Confirme o IP e que o Mosquitto está rodando |
| `[MQTT] Falha (rc=5)` | Autenticação exigida | Configure usuário/senha no `connect()` |
| Snapshot muito lento | Normal — VGA JPEG + base64 + MQTT chunked | Aguarde; pode levar 2-5 s |
| Nenhuma mensagem em `status` | MQTT desconectado ou intervalo muito longo | Verifique serial; envie `set_interval` com valor menor |
| `[SNAPSHOT] ERRO: beginPublish falhou` | Buffer MQTT cheio | O `setBufferSize(512)` deve resolver; se persistir, aumente para 1024 |

---

## Próximo passo: Módulo 4 — Integração

O Módulo 4 implementa o backend no Raspberry Pi que:

- Recebe as mensagens MQTT do ESP32
- Persiste os dados em banco (SQLite ou InfluxDB)
- Expõe API REST para o dashboard
- Envia alertas (e-mail / Telegram) ao detectar comportamento anômalo

Pré-requisito: ter o Módulo 3 publicando dados estáveis em `zoo/cage/+/status` antes de iniciar o Módulo 4.
