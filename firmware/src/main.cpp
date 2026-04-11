/**
 * SmartZoo — Módulo 4: Person Detection via TFLite Micro
 *
 * Hardware: ESP32-S3 Sense (XIAO)
 *
 * Detecção:
 *   - TensorFlow Lite Micro (person_detect_model — MobileNet quantizado)
 *   - Input: 96×96 grayscale, int8
 *   - Output: [no_person_score, person_score]
 *   - Threshold: PERSON_THRESHOLD → status "active"
 *
 * Conectividade:
 *   - WiFi STA com retry automático
 *   - MQTT via PubSubClient
 *   - Publica zoo/cage/{CAGE_ID}/status a cada STATUS_INTERVAL_MS
 *   - Recebe comandos em zoo/cage/{CAGE_ID}/cmd:
 *       {"action":"snapshot"}              → captura JPEG e publica .../snapshot
 *       {"action":"reboot"}                → ESP.restart()
 *       {"action":"set_interval","value":N} → muda intervalo (segundos)
 */

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include "esp_camera.h"
#include "img_converters.h"
#include "mbedtls/base64.h"

// TFLite Micro
#include <TensorFlowLite.h>
#include "tensorflow/lite/micro/all_ops_resolver.h"
#include "tensorflow/lite/micro/micro_interpreter.h"
#include "tensorflow/lite/schema/schema_generated.h"
#include "person_detect_model_data.h"

// ===========================================================================
// CONFIGURAÇÃO
// ===========================================================================
#define MQTT_PORT  1883
#define CAGE_ID    "cage01"

struct NetworkConfig {
    const char* ssid;
    const char* password;
    const char* broker;
};

static const NetworkConfig NETWORKS[] = {
    { "Ciro_Yamauchi-2.4GHz", "Flok1alequinho", "192.168.0.100" },
    { "A56 de Ciro",          "Senha123",        "10.116.32.100" },
};
static const int NETWORK_COUNT = sizeof(NETWORKS) / sizeof(NETWORKS[0]);
static const char* active_broker = nullptr;

// ===========================================================================
// Pinagem — XIAO ESP32-S3 Sense
// ===========================================================================
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

// ===========================================================================
// Parâmetros de detecção
// ===========================================================================
constexpr int FRAME_W      = 96;
constexpr int FRAME_H      = 96;
constexpr int FRAME_PIXELS = FRAME_W * FRAME_H;

// Confiança mínima para considerar pessoa detectada
constexpr float PERSON_THRESHOLD = 0.60f;

// Histerese: evita flickering
constexpr int FRAMES_TO_ACTIVATE   = 2;
constexpr int FRAMES_TO_DEACTIVATE = 5;

// ===========================================================================
// TFLite
// ===========================================================================
constexpr int kTensorArenaSize = 100 * 1024;  // 100 KB
static uint8_t* tensor_arena   = nullptr;

static tflite::AllOpsResolver        tflite_resolver;
static tflite::MicroInterpreter*     interpreter  = nullptr;
static TfLiteTensor*                 input_tensor = nullptr;

// ===========================================================================
// Estado global
// ===========================================================================
static int   active_streak    = 0;
static int   inactive_streak  = 0;
static bool  confirmed_active = false;
static float last_person_score = 0.0f;

static unsigned long status_interval_ms = 10000UL;
static unsigned long last_status_pub_ms = 0;

static char topic_status[64];
static char topic_cmd[64];
static char topic_snapshot[64];
static char mqtt_client_id[48];

static WiFiClient   wifi_client;
static PubSubClient mqtt_client(wifi_client);

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
    // Fixa exposição para evitar que variações de brilho afetem a inferência
    s->set_exposure_ctrl(s, 0);
    s->set_gain_ctrl(s, 0);
    s->set_aec2(s, 0);
    return true;
}

// ===========================================================================
// TFLite — inicialização e inferência
// ===========================================================================

bool initTFLite() {
    tensor_arena = (uint8_t*)ps_malloc(kTensorArenaSize);
    if (!tensor_arena) tensor_arena = (uint8_t*)malloc(kTensorArenaSize);
    if (!tensor_arena) return false;

    const tflite::Model* model = tflite::GetModel(g_person_detect_model_data);
    if (model->version() != TFLITE_SCHEMA_VERSION) {
        Serial.printf("[TFLite] Schema mismatch: modelo=%u, runtime=%u\n",
                      model->version(), TFLITE_SCHEMA_VERSION);
        return false;
    }

    static tflite::MicroInterpreter static_interpreter(
        model, tflite_resolver, tensor_arena, kTensorArenaSize);
    interpreter = &static_interpreter;

    if (interpreter->AllocateTensors() != kTfLiteOk) {
        Serial.println("[TFLite] AllocateTensors falhou");
        return false;
    }

    input_tensor = interpreter->input(0);
    Serial.printf("[TFLite] OK — arena=%d bytes, input=%dx%dx%d\n",
                  kTensorArenaSize,
                  input_tensor->dims->data[1],
                  input_tensor->dims->data[2],
                  input_tensor->dims->data[3]);
    return true;
}

/**
 * Copia frame 96×96 grayscale para o tensor de entrada e executa inferência.
 * Retorna probabilidade de pessoa (0.0–1.0).
 */
float runInference(const uint8_t* frame) {
    // Converte uint8 [0,255] → int8 [-128,127] conforme quantização do modelo
    for (int i = 0; i < FRAME_PIXELS; i++) {
        input_tensor->data.int8[i] = (int8_t)((int)frame[i] - 128);
    }

    if (interpreter->Invoke() != kTfLiteOk) return 0.0f;

    TfLiteTensor* output = interpreter->output(0);
    // output[0] = no_person, output[1] = person (int8 quantizado)
    float scale     = output->params.scale;
    int   zero_pt   = output->params.zero_point;
    float person_prob = ((int)output->data.int8[1] - zero_pt) * scale;
    return constrain(person_prob, 0.0f, 1.0f);
}

// ===========================================================================
// Snapshot
// ===========================================================================

void captureSnapshot() {
    Serial.println("\n[SNAPSHOT] Capturando imagem VGA...");

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
    cfg.jpeg_quality = 12;
    cfg.fb_count     = 1;

    if (esp_camera_init(&cfg) != ESP_OK) {
        Serial.println("[SNAPSHOT] ERRO: falha ao reinicializar câmera");
        initCamera();
        return;
    }
    sensor_t* s = esp_camera_sensor_get();
    s->set_vflip(s, 1);
    s->set_hmirror(s, 1);

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

    size_t b64_size = ((fb->len + 2) / 3) * 4 + 4;
    unsigned char* b64 = (unsigned char*)ps_malloc(b64_size);
    if (!b64) b64 = (unsigned char*)malloc(b64_size);

    if (b64) {
        size_t olen = 0;
        mbedtls_base64_encode(b64, b64_size, &olen, fb->buf, fb->len);

        if (mqtt_client.connected()) {
            bool ok = mqtt_client.beginPublish(topic_snapshot, olen, false);
            if (ok) {
                const size_t CHUNK = 512;
                size_t sent = 0;
                while (sent < olen) {
                    size_t chunk = min(CHUNK, olen - sent);
                    mqtt_client.write(b64 + sent, chunk);
                    sent += chunk;
                }
                mqtt_client.endPublish();
                Serial.printf("[SNAPSHOT] Publicado OK (%u bytes b64)\n", (unsigned)olen);
            }
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

void connectWiFi() {
    WiFi.mode(WIFI_STA);
    for (int n = 0; n < NETWORK_COUNT; n++) {
        Serial.printf("[WiFi] Tentando '%s'", NETWORKS[n].ssid);
        WiFi.begin(NETWORKS[n].ssid, NETWORKS[n].password);
        for (int i = 0; i < 20; i++) {
            delay(500);
            Serial.print(".");
            if (WiFi.status() == WL_CONNECTED) {
                active_broker = NETWORKS[n].broker;
                Serial.printf("\n[WiFi] Conectado! IP: %s | broker: %s\n",
                              WiFi.localIP().toString().c_str(), active_broker);
                return;
            }
        }
        Serial.println("\n[WiFi] Sem resposta, tentando próxima rede...");
        WiFi.disconnect();
        delay(500);
    }
    Serial.println("[WiFi] Nenhuma rede disponível — reiniciando...");
    ESP.restart();
}

// ===========================================================================
// MQTT
// ===========================================================================

void mqttCallback(char* topic, byte* payload, unsigned int length) {
    char msg[256] = {0};
    size_t copy_len = length < sizeof(msg) - 1 ? length : sizeof(msg) - 1;
    memcpy(msg, payload, copy_len);
    Serial.printf("[MQTT] cmd: %s\n", msg);

    if (strstr(msg, "\"snapshot\"")) {
        captureSnapshot();
    } else if (strstr(msg, "\"reboot\"")) {
        delay(200);
        ESP.restart();
    } else if (strstr(msg, "\"set_interval\"")) {
        const char* val_ptr = strstr(msg, "\"value\"");
        if (val_ptr) {
            val_ptr = strchr(val_ptr, ':');
            if (val_ptr) {
                long v = atol(val_ptr + 1);
                if (v >= 1 && v <= 3600) {
                    status_interval_ms = (unsigned long)v * 1000UL;
                    Serial.printf("[MQTT] Intervalo: %lu s\n", (unsigned long)v);
                }
            }
        }
    }
}

bool ensureMqttConnected() {
    if (mqtt_client.connected()) return true;
    Serial.printf("[MQTT] Conectando a %s:%d...\n", active_broker, MQTT_PORT);
    if (mqtt_client.connect(mqtt_client_id)) {
        mqtt_client.subscribe(topic_cmd);
        Serial.println("[MQTT] Conectado!");
        return true;
    }
    Serial.printf("[MQTT] Falha (rc=%d)\n", mqtt_client.state());
    return false;
}

void publishStatus() {
    if (!mqtt_client.connected()) return;

    const char* status_str = confirmed_active ? "active" : "inactive";
    char payload[256];
    snprintf(payload, sizeof(payload),
        "{\"cage_id\":\"%s\","
        "\"status\":\"%s\","
        "\"activity_level\":%.3f,"
        "\"animal_count\":%d,"
        "\"zone\":\"unknown\","
        "\"uptime_ms\":%lu}",
        CAGE_ID,
        status_str,
        last_person_score,
        confirmed_active ? 1 : 0,
        millis()
    );

    bool ok = mqtt_client.publish(topic_status, payload);
    Serial.printf("[MQTT] Status (%s): %s\n", ok ? "OK" : "ERRO", payload);
}

// ===========================================================================
// Setup
// ===========================================================================

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("=== SmartZoo — Módulo 4: TFLite Person Detection ===");

    Serial.print("[CAM] Inicializando... ");
    if (!initCamera()) {
        Serial.println("ERRO. Reiniciando...");
        delay(3000);
        ESP.restart();
    }
    Serial.println("OK");

    Serial.print("[TFLite] Inicializando... ");
    if (!initTFLite()) {
        Serial.println("ERRO. Reiniciando...");
        delay(3000);
        ESP.restart();
    }

    snprintf(topic_status,   sizeof(topic_status),   "zoo/cage/%s/status",   CAGE_ID);
    snprintf(topic_cmd,      sizeof(topic_cmd),       "zoo/cage/%s/cmd",      CAGE_ID);
    snprintf(topic_snapshot, sizeof(topic_snapshot),  "zoo/cage/%s/snapshot", CAGE_ID);

    uint8_t mac[6];
    WiFi.macAddress(mac);
    snprintf(mqtt_client_id, sizeof(mqtt_client_id),
             "esp32_%s_%02X%02X", CAGE_ID, mac[4], mac[5]);

    connectWiFi();

    mqtt_client.setServer(active_broker, MQTT_PORT);
    mqtt_client.setCallback(mqttCallback);
    mqtt_client.setBufferSize(512);
    ensureMqttConnected();

    Serial.println("──────────────────────────────────────────────────────");
}

// ===========================================================================
// Loop
// ===========================================================================

void loop() {
    if (Serial.available()) {
        char cmd = Serial.read();
        if (cmd == 's' || cmd == 'S') captureSnapshot();
    }

    if (WiFi.status() == WL_CONNECTED) {
        if (!mqtt_client.connected()) ensureMqttConnected();
        mqtt_client.loop();
    }

    // Captura frame 96×96 grayscale
    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) { delay(500); return; }
    if (fb->len != (size_t)FRAME_PIXELS) { esp_camera_fb_return(fb); delay(200); return; }

    // Inferência TFLite
    float person_score = runInference(fb->buf);
    esp_camera_fb_return(fb);

    bool raw_active = person_score >= PERSON_THRESHOLD;

    // Histerese
    if (raw_active) { active_streak++; inactive_streak = 0; }
    else            { inactive_streak++; active_streak = 0; }

    if (active_streak   >= FRAMES_TO_ACTIVATE)   confirmed_active = true;
    if (inactive_streak >= FRAMES_TO_DEACTIVATE) confirmed_active = false;

    last_person_score = person_score;

    Serial.printf("%-8s | score: %.3f | threshold: %.2f\n",
        confirmed_active ? "ACTIVE" : "inactive",
        person_score,
        PERSON_THRESHOLD);

    // Publicação periódica
    unsigned long now = millis();
    if (now - last_status_pub_ms >= status_interval_ms) {
        last_status_pub_ms = now;
        publishStatus();
    }

    delay(200);
}
