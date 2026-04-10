/**
 * SmartZoo — Módulo 3: WiFi + MQTT (sobre Módulo 2)
 *
 * Hardware: ESP32-S3 Sense (XIAO) + cabo USB-C
 *
 * Visão (herdado do Módulo 2):
 *   - Background subtraction adaptativo
 *   - Blob detection em grade 8×8 → contagem de animais
 *   - Localização em grade 3×3 → zona do blob principal
 *
 * Conectividade (Módulo 3):
 *   - WiFi STA com retry automático
 *   - MQTT sobre PubSubClient
 *   - Publica status a cada STATUS_INTERVAL_MS em zoo/cage/{CAGE_ID}/status
 *   - Recebe comandos em zoo/cage/{CAGE_ID}/cmd:
 *       {"action":"snapshot"}         → captura JPEG e publica em .../snapshot
 *       {"action":"reboot"}           → ESP.restart()
 *       {"action":"set_interval","value":30} → muda intervalo de publicação
 *
 * Comandos serial:
 *   's' → snapshot JPEG VGA (serial + MQTT)
 */

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include "esp_camera.h"
#include "mbedtls/base64.h"

// ===========================================================================
// CONFIGURAÇÃO — ajuste antes de compilar
// ===========================================================================
#define WIFI_SSID    "A56 de Ciro"
#define WIFI_PASS    "Senha123"
#define MQTT_BROKER  "10.116.32.161"   // IP do Raspberry Pi (broker Mosquitto)
#define MQTT_PORT    1883
#define CAGE_ID      "cage01"          // Identificador único desta gaiola
// ===========================================================================

// ---------------------------------------------------------------------------
// Pinagem — XIAO ESP32-S3 Sense
// ---------------------------------------------------------------------------
#define PWDN_GPIO_NUM   -1
#define RESET_GPIO_NUM  -1
#define XCLK_GPIO_NUM   10
#define SIOD_GPIO_NUM   40
#define SIOC_GPIO_NUM   39
#define Y9_GPIO_NUM     48
#define Y8_GPIO_NUM     11
#define Y7_GPIO_NUM     12
#define Y6_GPIO_NUM     14
#define Y5_GPIO_NUM     16
#define Y4_GPIO_NUM     18
#define Y3_GPIO_NUM     17
#define Y2_GPIO_NUM     15
#define VSYNC_GPIO_NUM  38
#define HREF_GPIO_NUM   47
#define PCLK_GPIO_NUM   13

// ---------------------------------------------------------------------------
// Dimensões do frame
// ---------------------------------------------------------------------------
constexpr int FRAME_W      = 96;
constexpr int FRAME_H      = 96;
constexpr int FRAME_PIXELS = FRAME_W * FRAME_H;

// ---------------------------------------------------------------------------
// Parâmetros de detecção
// ---------------------------------------------------------------------------
constexpr uint8_t BG_PIXEL_THRESHOLD = 25;    // diff mínimo por pixel para contar
constexpr float   BG_AREA_THRESHOLD  = 0.10f; // 10% dos pixels → presença detectada
constexpr int     BG_ALPHA           = 20;    // velocidade do background adaptativo

// Histerese: evita flickering na transição de estado
constexpr int FRAMES_TO_ACTIVATE   = 2;   // frames positivos seguidos → ACTIVE
constexpr int FRAMES_TO_DEACTIVATE = 10;  // frames negativos seguidos → inactive

// ---------------------------------------------------------------------------
// Contagem — blob detection em grade grosseira 8×8
// ---------------------------------------------------------------------------
constexpr int GRID_COLS   = 8;
constexpr int GRID_ROWS   = 8;
constexpr int CELL_W      = FRAME_W / GRID_COLS;   // 12 px
constexpr int CELL_H      = FRAME_H / GRID_ROWS;   // 12 px
constexpr int CELL_PIXELS = CELL_W * CELL_H;        // 144 px/célula

constexpr int CELL_ACTIVE_THRESHOLD = 15;  // pixels ativos para marcar célula (~10%)
constexpr int MIN_BLOB_CELLS        = 3;   // células mínimas para contar como animal
constexpr int MAX_ANIMALS           = 10;

static bool grid[GRID_ROWS][GRID_COLS];
static bool grid_visited[GRID_ROWS][GRID_COLS];

// ---------------------------------------------------------------------------
// Zonas — grade 3×3 (localização)
// ---------------------------------------------------------------------------
constexpr int ZONE_COLS = 3;
constexpr int ZONE_ROWS = 3;

const char* ZONE_NAMES[ZONE_ROWS][ZONE_COLS] = {
    { "top_left",    "top_center",    "top_right"    },
    { "left",        "center",        "right"        },
    { "bottom_left", "bottom_center", "bottom_right" },
};

// ---------------------------------------------------------------------------
// Estado global — visão
// ---------------------------------------------------------------------------
static uint8_t* background       = nullptr;
static bool     bg_ready         = false;
static int      active_streak    = 0;
static int      inactive_streak  = 0;
static bool     confirmed_active = false;

// Estado global — última detecção (para o payload MQTT)
static float        last_bg_diff    = 0.0f;
static int          last_count      = 0;
static const char*  last_zone       = nullptr;

// ---------------------------------------------------------------------------
// Estado global — MQTT / temporização
// ---------------------------------------------------------------------------
static unsigned long status_interval_ms = 10000UL; // publicar status a cada N ms
static unsigned long last_status_pub_ms = 0;

// Tópicos MQTT (montados no setup com CAGE_ID)
static char topic_status[64];
static char topic_cmd[64];
static char topic_snapshot[64];

// Client ID único: esp32_{CAGE_ID}_{4 últimos hex do MAC}
static char mqtt_client_id[48];

// ---------------------------------------------------------------------------
// Objetos de rede
// ---------------------------------------------------------------------------
static WiFiClient   wifi_client;
static PubSubClient mqtt_client(wifi_client);

// ===========================================================================
// Funções de detecção (herdadas do Módulo 2)
// ===========================================================================

float computeBgDiff(const uint8_t* frame) {
    if (!bg_ready) return 0.0f;
    int changed = 0;
    for (int i = 0; i < FRAME_PIXELS; i++) {
        if (abs((int)frame[i] - (int)background[i]) > BG_PIXEL_THRESHOLD)
            changed++;
    }
    return (float)changed / FRAME_PIXELS;
}

// Constrói grade 8×8, faz flood-fill DFS, retorna nº de animais e zona.
int countAnimals(const uint8_t* frame, const char** primary_zone) {
    *primary_zone = nullptr;
    if (!bg_ready) return 0;

    // 1. Preenche grade
    for (int gr = 0; gr < GRID_ROWS; gr++) {
        for (int gc = 0; gc < GRID_COLS; gc++) {
            int active = 0;
            for (int py = gr * CELL_H; py < (gr + 1) * CELL_H; py++)
                for (int px = gc * CELL_W; px < (gc + 1) * CELL_W; px++)
                    if (abs((int)frame[py * FRAME_W + px] - (int)background[py * FRAME_W + px])
                            > BG_PIXEL_THRESHOLD)
                        active++;
            grid[gr][gc] = (active >= CELL_ACTIVE_THRESHOLD);
        }
    }

    // 2. Flood fill DFS (stack local, 64 células máx)
    memset(grid_visited, 0, sizeof(grid_visited));

    struct GPoint { int8_t r, c; };
    GPoint gstack[GRID_ROWS * GRID_COLS];
    static const int8_t dr[4] = { 1, -1, 0,  0 };
    static const int8_t dc[4] = { 0,  0, 1, -1 };

    int animal_count  = 0;
    int largest_cells = 0;
    int largest_sum_r = GRID_ROWS / 2;
    int largest_sum_c = GRID_COLS / 2;

    for (int r = 0; r < GRID_ROWS; r++) {
        for (int c = 0; c < GRID_COLS; c++) {
            if (!grid[r][c] || grid_visited[r][c]) continue;

            int top = 0, cells = 0, sum_r = 0, sum_c = 0;
            gstack[top++] = { (int8_t)r, (int8_t)c };
            grid_visited[r][c] = true;

            while (top > 0) {
                GPoint p = gstack[--top];
                cells++; sum_r += p.r; sum_c += p.c;
                for (int d = 0; d < 4; d++) {
                    int nr = p.r + dr[d], nc = p.c + dc[d];
                    if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) continue;
                    if (grid[nr][nc] && !grid_visited[nr][nc]) {
                        grid_visited[nr][nc] = true;
                        gstack[top++] = { (int8_t)nr, (int8_t)nc };
                    }
                }
            }

            if (cells >= MIN_BLOB_CELLS) {
                animal_count++;
                if (cells > largest_cells) {
                    largest_cells = cells;
                    largest_sum_r = sum_r / cells;
                    largest_sum_c = sum_c / cells;
                }
            }
        }
    }

    // 3. Converte centróide 8×8 → zona 3×3
    if (animal_count > 0) {
        int zr = (largest_sum_r * ZONE_ROWS) / GRID_ROWS;
        int zc = (largest_sum_c * ZONE_COLS) / GRID_COLS;
        *primary_zone = ZONE_NAMES[constrain(zr, 0, ZONE_ROWS-1)][constrain(zc, 0, ZONE_COLS-1)];
    }

    return min(animal_count, MAX_ANIMALS);
}

void updateBackground(const uint8_t* frame) {
    if (!bg_ready) {
        memcpy(background, frame, FRAME_PIXELS);
        bg_ready = true;
        return;
    }
    for (int i = 0; i < FRAME_PIXELS; i++) {
        int diff = (int)frame[i] - (int)background[i];
        background[i] = (uint8_t)((int)background[i] + diff / BG_ALPHA);
    }
}

// ===========================================================================
// Câmera
// ===========================================================================

bool initCamera() {
    camera_config_t config;
    config.ledc_channel = LEDC_CHANNEL_0; config.ledc_timer = LEDC_TIMER_0;
    config.pin_d0 = Y2_GPIO_NUM; config.pin_d1 = Y3_GPIO_NUM;
    config.pin_d2 = Y4_GPIO_NUM; config.pin_d3 = Y5_GPIO_NUM;
    config.pin_d4 = Y6_GPIO_NUM; config.pin_d5 = Y7_GPIO_NUM;
    config.pin_d6 = Y8_GPIO_NUM; config.pin_d7 = Y9_GPIO_NUM;
    config.pin_xclk     = XCLK_GPIO_NUM; config.pin_pclk  = PCLK_GPIO_NUM;
    config.pin_vsync    = VSYNC_GPIO_NUM; config.pin_href  = HREF_GPIO_NUM;
    config.pin_sccb_sda = SIOD_GPIO_NUM;  config.pin_sccb_scl = SIOC_GPIO_NUM;
    config.pin_pwdn     = PWDN_GPIO_NUM;  config.pin_reset = RESET_GPIO_NUM;
    config.xclk_freq_hz = 20000000;
    config.pixel_format = PIXFORMAT_GRAYSCALE;
    config.frame_size   = FRAMESIZE_96X96;
    config.jpeg_quality = 12;
    config.fb_count     = 1;

    if (esp_camera_init(&config) != ESP_OK) return false;

    sensor_t* s = esp_camera_sensor_get();
    s->set_vflip(s, 1);
    s->set_hmirror(s, 1);
    return true;
}

// ===========================================================================
// Snapshot — captura JPEG VGA, codifica base64, envia serial + MQTT
// ===========================================================================

/**
 * Captura um frame VGA em JPEG, codifica em base64 e:
 *   1. Imprime no Serial (comportamento original do Módulo 2)
 *   2. Publica no tópico zoo/cage/{CAGE_ID}/snapshot via MQTT (Módulo 3)
 *
 * A câmera é desinicializada + reinicializada porque JPEG VGA precisa de
 * configuração diferente do modo grayscale 96×96.
 */
void captureSnapshot() {
    Serial.println("\n[SNAPSHOT] Capturando imagem de referência (VGA JPEG)...");

    esp_camera_deinit();
    delay(150);

    camera_config_t cfg;
    cfg.ledc_channel = LEDC_CHANNEL_0; cfg.ledc_timer = LEDC_TIMER_0;
    cfg.pin_d0 = Y2_GPIO_NUM; cfg.pin_d1 = Y3_GPIO_NUM;
    cfg.pin_d2 = Y4_GPIO_NUM; cfg.pin_d3 = Y5_GPIO_NUM;
    cfg.pin_d4 = Y6_GPIO_NUM; cfg.pin_d5 = Y7_GPIO_NUM;
    cfg.pin_d6 = Y8_GPIO_NUM; cfg.pin_d7 = Y9_GPIO_NUM;
    cfg.pin_xclk     = XCLK_GPIO_NUM; cfg.pin_pclk  = PCLK_GPIO_NUM;
    cfg.pin_vsync    = VSYNC_GPIO_NUM; cfg.pin_href  = HREF_GPIO_NUM;
    cfg.pin_sccb_sda = SIOD_GPIO_NUM;  cfg.pin_sccb_scl = SIOC_GPIO_NUM;
    cfg.pin_pwdn     = PWDN_GPIO_NUM;  cfg.pin_reset = RESET_GPIO_NUM;
    cfg.xclk_freq_hz = 20000000;
    cfg.pixel_format = PIXFORMAT_JPEG;
    cfg.frame_size   = FRAMESIZE_VGA;
    cfg.jpeg_quality = 10;
    cfg.fb_count     = 1;

    if (esp_camera_init(&cfg) != ESP_OK) {
        Serial.println("[SNAPSHOT] ERRO: falha ao reinicializar câmera");
        initCamera();
        return;
    }
    sensor_t* s = esp_camera_sensor_get();
    s->set_vflip(s, 1);
    s->set_hmirror(s, 1);

    // Descarta frames iniciais (auto-exposição se estabilizar)
    for (int i = 0; i < 3; i++) {
        camera_fb_t* fb = esp_camera_fb_get();
        if (fb) esp_camera_fb_return(fb);
        delay(100);
    }

    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) {
        Serial.println("[SNAPSHOT] ERRO: frame vazio");
        esp_camera_deinit();
        delay(100);
        initCamera();
        return;
    }

    // Codifica em base64
    size_t b64_size = ((fb->len + 2) / 3) * 4 + 4;
    unsigned char* b64 = (unsigned char*)ps_malloc(b64_size);
    if (!b64) b64 = (unsigned char*)malloc(b64_size);

    if (b64) {
        size_t olen = 0;
        mbedtls_base64_encode(b64, b64_size, &olen, fb->buf, fb->len);

        // 1. Serial (legado Módulo 2)
        Serial.printf("[SNAPSHOT] %u bytes JPEG → %u chars base64\n", fb->len, (unsigned)olen);
        Serial.println(">>>SNAPSHOT_START<<<");
        Serial.write(b64, olen);
        Serial.println("\n>>>SNAPSHOT_END<<<");
        Serial.println("[SNAPSHOT] Cole em: https://base64.guru/converter/decode/image\n");

        // 2. MQTT — publica no tópico snapshot
        //    PubSubClient tem limite padrão de 256 bytes por mensagem.
        //    Uma imagem VGA pode ter centenas de KB: usamos publish em chunks
        //    via begin/write/end para contornar o limite.
        if (mqtt_client.connected()) {
            Serial.printf("[SNAPSHOT] Publicando %u bytes no MQTT...\n", (unsigned)olen);
            bool ok = mqtt_client.beginPublish(topic_snapshot, olen, false);
            if (ok) {
                // Envia em blocos de 512 bytes para não sobrecarregar o buffer
                const size_t CHUNK = 512;
                size_t sent = 0;
                while (sent < olen) {
                    size_t chunk = min(CHUNK, olen - sent);
                    mqtt_client.write(b64 + sent, chunk);
                    sent += chunk;
                }
                mqtt_client.endPublish();
                Serial.println("[SNAPSHOT] Publicado OK");
            } else {
                Serial.println("[SNAPSHOT] ERRO: beginPublish falhou");
            }
        } else {
            Serial.println("[SNAPSHOT] MQTT desconectado — snapshot apenas no serial");
        }

        free(b64);
    }

    esp_camera_fb_return(fb);
    esp_camera_deinit();
    delay(150);
    initCamera();
}

// ===========================================================================
// WiFi
// ===========================================================================

/**
 * Conecta ao WiFi com retry bloqueante.
 * Exibe progresso no Serial. Reinicia o ESP após 30 tentativas (~15 s).
 */
void connectWiFi() {
    Serial.printf("[WiFi] Conectando a '%s'", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASS);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
        if (++attempts >= 30) {
            Serial.println("\n[WiFi] Timeout — reiniciando...");
            ESP.restart();
        }
    }

    Serial.printf("\n[WiFi] Conectado! IP: %s\n", WiFi.localIP().toString().c_str());
}

// ===========================================================================
// MQTT — callback de mensagens recebidas
// ===========================================================================

/**
 * Chamada pelo PubSubClient ao receber mensagem em tópico subscrito.
 * Trata os comandos JSON no tópico zoo/cage/{CAGE_ID}/cmd.
 */
void mqttCallback(char* topic, byte* payload, unsigned int length) {
    // Copia payload para buffer local com terminador nulo
    char msg[256] = {0};
    size_t copy_len = length < sizeof(msg) - 1 ? length : sizeof(msg) - 1;
    memcpy(msg, payload, copy_len);

    Serial.printf("[MQTT] cmd recebido: %s\n", msg);

    // Detecta ação via busca de string simples (sem ArduinoJson)
    if (strstr(msg, "\"snapshot\"") != nullptr) {
        // {"action":"snapshot"}
        Serial.println("[MQTT] Executando snapshot por comando remoto");
        captureSnapshot();

    } else if (strstr(msg, "\"reboot\"") != nullptr) {
        // {"action":"reboot"}
        Serial.println("[MQTT] Reiniciando por comando remoto...");
        delay(200);
        ESP.restart();

    } else if (strstr(msg, "\"set_interval\"") != nullptr) {
        // {"action":"set_interval","value":30}
        // Extrai o valor após "value":
        const char* val_ptr = strstr(msg, "\"value\"");
        if (val_ptr) {
            val_ptr = strchr(val_ptr, ':');
            if (val_ptr) {
                long new_interval = atol(val_ptr + 1);
                if (new_interval >= 1 && new_interval <= 3600) {
                    status_interval_ms = (unsigned long)new_interval * 1000UL;
                    Serial.printf("[MQTT] Intervalo atualizado: %lu s\n", (unsigned long)new_interval);
                } else {
                    Serial.println("[MQTT] set_interval: valor fora do range [1, 3600]");
                }
            }
        }

    } else {
        Serial.printf("[MQTT] Comando desconhecido: %s\n", msg);
    }
}

// ===========================================================================
// MQTT — conexão e reconexão
// ===========================================================================

/**
 * Tenta conectar/reconectar ao broker MQTT.
 * Não bloqueante: tenta apenas uma vez por chamada.
 * Retorna true se conectou/estava conectado.
 */
bool ensureMqttConnected() {
    if (mqtt_client.connected()) return true;

    Serial.printf("[MQTT] Conectando a %s:%d (id=%s)...\n",
                  MQTT_BROKER, MQTT_PORT, mqtt_client_id);

    if (mqtt_client.connect(mqtt_client_id)) {
        Serial.println("[MQTT] Conectado!");
        mqtt_client.subscribe(topic_cmd);
        Serial.printf("[MQTT] Subscrito em: %s\n", topic_cmd);
        return true;
    }

    Serial.printf("[MQTT] Falha (rc=%d) — tentará novamente no próximo ciclo\n",
                  mqtt_client.state());
    return false;
}

// ===========================================================================
// Publicação de status
// ===========================================================================

/**
 * Monta e publica o payload JSON de status no tópico zoo/cage/{CAGE_ID}/status.
 *
 * Exemplo de payload:
 *   {"cage_id":"cage01","status":"active","activity_level":0.18,
 *    "animal_count":1,"zone":"center","uptime_ms":12345}
 *
 * Nota: usa millis() como timestamp (sem NTP — MVP).
 */
void publishStatus() {
    if (!mqtt_client.connected()) return;

    const char* status_str = confirmed_active ? "active" : "inactive";
    const char* zone_str   = (confirmed_active && last_zone) ? last_zone : "unknown";

    char payload[256];
    snprintf(payload, sizeof(payload),
        "{\"cage_id\":\"%s\","
        "\"status\":\"%s\","
        "\"activity_level\":%.3f,"
        "\"animal_count\":%d,"
        "\"zone\":\"%s\","
        "\"uptime_ms\":%lu}",
        CAGE_ID,
        status_str,
        last_bg_diff,
        last_count,
        zone_str,
        millis()
    );

    bool ok = mqtt_client.publish(topic_status, payload);
    Serial.printf("[MQTT] Status publicado (%s): %s\n", ok ? "OK" : "ERRO", payload);
}

// ===========================================================================
// Setup
// ===========================================================================

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("=== SmartZoo — Módulo 3: WiFi + MQTT ===");

    // -- Câmera --
    Serial.print("[CAM] Inicializando... ");
    if (!initCamera()) {
        Serial.println("ERRO. Reiniciando...");
        delay(3000);
        ESP.restart();
    }
    Serial.println("OK");

    // -- Memória para background --
    background = (uint8_t*)ps_malloc(FRAME_PIXELS);
    if (!background) background = (uint8_t*)malloc(FRAME_PIXELS);
    if (!background) {
        Serial.println("[MEM] ERRO: sem memória. Reiniciando...");
        ESP.restart();
    }

    // -- Monta tópicos MQTT com CAGE_ID --
    snprintf(topic_status,   sizeof(topic_status),   "zoo/cage/%s/status",   CAGE_ID);
    snprintf(topic_cmd,      sizeof(topic_cmd),       "zoo/cage/%s/cmd",      CAGE_ID);
    snprintf(topic_snapshot, sizeof(topic_snapshot),  "zoo/cage/%s/snapshot", CAGE_ID);

    // -- Monta client ID único: esp32_{CAGE_ID}_{4 últimos hex do MAC} --
    uint8_t mac[6];
    WiFi.macAddress(mac);
    snprintf(mqtt_client_id, sizeof(mqtt_client_id),
             "esp32_%s_%02X%02X", CAGE_ID, mac[4], mac[5]);

    // -- WiFi --
    connectWiFi();

    // -- MQTT --
    mqtt_client.setServer(MQTT_BROKER, MQTT_PORT);
    mqtt_client.setCallback(mqttCallback);
    // Aumenta buffer para acomodar payloads maiores (snapshot chunked via begin/write)
    mqtt_client.setBufferSize(512);
    ensureMqttConnected();

    Serial.println("[CAM] Calibrando background — mantenha a cena VAZIA por ~3s...");
    Serial.println("Comandos: 's' → snapshot | MQTT cmd → snapshot / reboot / set_interval");
    Serial.println("──────────────────────────────────────────────────────");
}

// ===========================================================================
// Loop
// ===========================================================================

void loop() {
    // -- Leitura de comando serial --
    if (Serial.available()) {
        char cmd = Serial.read();
        if (cmd == 's' || cmd == 'S') {
            captureSnapshot();  // imprime no serial + publica MQTT
        }
    }

    // -- Manutenção MQTT (keep-alive + reconexão) --
    if (WiFi.status() == WL_CONNECTED) {
        if (!mqtt_client.connected()) {
            // Tenta reconectar; intervalo controlado externamente (chama uma vez por loop)
            ensureMqttConnected();
        }
        mqtt_client.loop();  // processa mensagens recebidas e keep-alive
    }

    // -- Captura e processamento de visão --
    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) { delay(500); return; }
    if (fb->len != (size_t)FRAME_PIXELS) { esp_camera_fb_return(fb); delay(200); return; }

    float bgDiff   = computeBgDiff(fb->buf);
    bool  rawActive = bgDiff >= BG_AREA_THRESHOLD;

    // Histerese
    if (rawActive) { active_streak++; inactive_streak = 0; }
    else           { inactive_streak++; active_streak = 0; }

    if (active_streak   >= FRAMES_TO_ACTIVATE)   confirmed_active = true;
    if (inactive_streak >= FRAMES_TO_DEACTIVATE) confirmed_active = false;

    // Contagem + zona + atualização do background
    const char* zone  = nullptr;
    int         count = 0;
    if (confirmed_active) {
        count = countAnimals(fb->buf, &zone);
    } else {
        updateBackground(fb->buf);
    }

    esp_camera_fb_return(fb);

    // Atualiza estado global (usado pelo publishStatus)
    last_bg_diff = bgDiff;
    last_count   = count;
    last_zone    = zone;

    Serial.printf("%-8s | count: %d | zone: %-14s | bg_diff: %.3f\n",
        confirmed_active ? "ACTIVE" : "inactive",
        count,
        confirmed_active && zone ? zone : "-",
        bgDiff);

    // -- Publicação periódica de status --
    unsigned long now = millis();
    if (now - last_status_pub_ms >= status_interval_ms) {
        last_status_pub_ms = now;
        publishStatus();
    }

    delay(300);
}
