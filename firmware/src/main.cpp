/**
 * SmartZoo — Módulo 2: Detecção de Presença + Localização
 *
 * Hardware: ESP32-S3 Sense (XIAO) + cabo USB-C
 *
 * Detecção — sinal dual:
 *   1. TFLite (MobileNet INT8) — reconhece pessoa/animal explicitamente
 *   2. Background subtraction   — detecta qualquer presença grande no frame
 *   → ACTIVE se qualquer um dos dois sinais disparar
 *
 * O modelo TFLite foi treinado para pessoas em pé/distantes; a subtração
 * de background garante detecção confiável para MVPs (pessoa sentada,
 * animal parado, qualquer ângulo).
 *
 * Localização: grade 3×3, zona com maior diff vs background.
 * Backend mapeia zona → descrição em linguagem natural por jaula.
 */

#include <Arduino.h>
#include "esp_camera.h"
#include "mbedtls/base64.h"
#include "tensorflow/lite/micro/micro_interpreter.h"
#include "tensorflow/lite/micro/micro_mutable_op_resolver.h"
#include "tensorflow/lite/schema/schema_generated.h"
#include "person_detect_model_data.h"

// ---------------------------------------------------------------------------
// Pinagem da câmera — XIAO ESP32-S3 Sense
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
constexpr int FRAME_PIXELS = FRAME_W * FRAME_H;  // 9216

// ---------------------------------------------------------------------------
// TFLite — limiar reduzido para cobrir poses não ideais
// ---------------------------------------------------------------------------
constexpr int   kNotPersonIndex     = 0;
constexpr int   kPersonIndex        = 1;
constexpr float TFLITE_THRESHOLD    = 0.40f;

constexpr int kTensorArenaSize = 100 * 1024;
static uint8_t* tensor_arena = nullptr;

namespace {
    const tflite::Model*       tfl_model    = nullptr;
    tflite::MicroInterpreter*  interpreter  = nullptr;
    TfLiteTensor*              input_tensor = nullptr;
}

// ---------------------------------------------------------------------------
// Background subtraction — detecta qualquer presença grande
// Mais confiável que TFLite para poses variadas / animais
// ---------------------------------------------------------------------------
constexpr uint8_t BG_PIXEL_THRESHOLD = 25;    // diff mínimo por pixel
constexpr float   BG_AREA_THRESHOLD  = 0.07f; // 7% dos pixels alterados → ativo

static uint8_t* background    = nullptr;
static bool     bg_ready      = false;
static int      inactive_count = 0;
constexpr int   BG_UPDATE_AFTER = 10; // frames inativo antes de atualizar background

// ---------------------------------------------------------------------------
// Localização — grade 3×3
// ---------------------------------------------------------------------------
constexpr int ZONE_COLS = 3;
constexpr int ZONE_ROWS = 3;
constexpr int ZONE_W    = FRAME_W / ZONE_COLS;  // 32 px
constexpr int ZONE_H    = FRAME_H / ZONE_ROWS;  // 32 px

constexpr uint8_t ZONE_PIXEL_THRESHOLD = 20;
constexpr int     ZONE_MIN_SCORE       = 300;

const char* ZONE_NAMES[ZONE_ROWS][ZONE_COLS] = {
    { "top_left",    "top_center",    "top_right"    },
    { "left",        "center",        "right"        },
    { "bottom_left", "bottom_center", "bottom_right" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
inline float scoreToFloat(int8_t score) {
    return (static_cast<float>(score) + 128.0f) / 255.0f;
}

// Retorna fração de pixels que difere do background
float computeBgDiff(const uint8_t* frame) {
    if (!bg_ready) return 0.0f;
    int changed = 0;
    for (int i = 0; i < FRAME_PIXELS; i++) {
        if (abs((int)frame[i] - (int)background[i]) > BG_PIXEL_THRESHOLD)
            changed++;
    }
    return (float)changed / FRAME_PIXELS;
}

// Retorna nome da zona com maior atividade vs background
const char* detectZone(const uint8_t* frame) {
    if (!bg_ready) return nullptr;

    int best_score = ZONE_MIN_SCORE - 1;
    int best_row = -1, best_col = -1;

    for (int row = 0; row < ZONE_ROWS; row++) {
        for (int col = 0; col < ZONE_COLS; col++) {
            int score = 0;
            for (int y = row * ZONE_H; y < (row + 1) * ZONE_H; y++) {
                for (int x = col * ZONE_W; x < (col + 1) * ZONE_W; x++) {
                    int diff = abs((int)frame[y * FRAME_W + x] - (int)background[y * FRAME_W + x]);
                    if (diff > ZONE_PIXEL_THRESHOLD) score += diff;
                }
            }
            if (score > best_score) { best_score = score; best_row = row; best_col = col; }
        }
    }
    if (best_row < 0) return nullptr;
    return ZONE_NAMES[best_row][best_col];
}

// Forward declaration
bool initCamera();

// ---------------------------------------------------------------------------
// Snapshot — captura JPEG em VGA e imprime como base64 no serial
// Use: envie 's' pelo monitor serial. Cole o resultado em base64.guru
// ---------------------------------------------------------------------------
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
    cfg.pin_xclk = XCLK_GPIO_NUM; cfg.pin_pclk = PCLK_GPIO_NUM;
    cfg.pin_vsync = VSYNC_GPIO_NUM; cfg.pin_href = HREF_GPIO_NUM;
    cfg.pin_sccb_sda = SIOD_GPIO_NUM; cfg.pin_sccb_scl = SIOC_GPIO_NUM;
    cfg.pin_pwdn = PWDN_GPIO_NUM; cfg.pin_reset = RESET_GPIO_NUM;
    cfg.xclk_freq_hz = 20000000;
    cfg.pixel_format = PIXFORMAT_JPEG;
    cfg.frame_size   = FRAMESIZE_VGA;   // 640×480
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

    // Descarta 3 frames para o sensor estabilizar
    for (int i = 0; i < 3; i++) {
        camera_fb_t* fb = esp_camera_fb_get();
        if (fb) esp_camera_fb_return(fb);
        delay(100);
    }

    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) {
        Serial.println("[SNAPSHOT] ERRO: frame vazio");
        esp_camera_deinit(); delay(100); initCamera();
        return;
    }

    // Aloca buffer base64 na PSRAM (4/3 do JPEG + padding)
    size_t b64_size = ((fb->len + 2) / 3) * 4 + 4;
    unsigned char* b64 = (unsigned char*)ps_malloc(b64_size);
    if (!b64) b64 = (unsigned char*)malloc(b64_size);

    if (!b64) {
        Serial.println("[SNAPSHOT] ERRO: sem memória para base64");
    } else {
        size_t olen = 0;
        mbedtls_base64_encode(b64, b64_size, &olen, fb->buf, fb->len);

        Serial.printf("[SNAPSHOT] JPEG: %u bytes → base64: %u chars\n", fb->len, olen);
        Serial.println(">>>SNAPSHOT_START<<<");
        Serial.write(b64, olen);
        Serial.println();
        Serial.println(">>>SNAPSHOT_END<<<");
        Serial.println("[SNAPSHOT] Cole o conteúdo acima em https://base64.guru/converter/decode/image");
        free(b64);
    }

    esp_camera_fb_return(fb);
    esp_camera_deinit();
    delay(150);
    initCamera();

    Serial.println("[SNAPSHOT] Câmera restaurada. Detecção retomada.\n");
}

// ---------------------------------------------------------------------------
// Inicialização da câmera
// ---------------------------------------------------------------------------
bool initCamera() {
    camera_config_t config;
    config.ledc_channel = LEDC_CHANNEL_0;
    config.ledc_timer   = LEDC_TIMER_0;
    config.pin_d0 = Y2_GPIO_NUM; config.pin_d1 = Y3_GPIO_NUM;
    config.pin_d2 = Y4_GPIO_NUM; config.pin_d3 = Y5_GPIO_NUM;
    config.pin_d4 = Y6_GPIO_NUM; config.pin_d5 = Y7_GPIO_NUM;
    config.pin_d6 = Y8_GPIO_NUM; config.pin_d7 = Y9_GPIO_NUM;
    config.pin_xclk     = XCLK_GPIO_NUM;
    config.pin_pclk     = PCLK_GPIO_NUM;
    config.pin_vsync    = VSYNC_GPIO_NUM;
    config.pin_href     = HREF_GPIO_NUM;
    config.pin_sccb_sda = SIOD_GPIO_NUM;
    config.pin_sccb_scl = SIOC_GPIO_NUM;
    config.pin_pwdn     = PWDN_GPIO_NUM;
    config.pin_reset    = RESET_GPIO_NUM;
    config.xclk_freq_hz = 20000000;
    config.pixel_format = PIXFORMAT_GRAYSCALE;
    config.frame_size   = FRAMESIZE_96X96;
    config.jpeg_quality = 12;
    config.fb_count     = 1;
    if (esp_camera_init(&config) != ESP_OK) return false;

    // OV2640 no XIAO ESP32-S3 é montada invertida — rotaciona 180°
    sensor_t* s = esp_camera_sensor_get();
    s->set_vflip(s, 1);
    s->set_hmirror(s, 1);
    return true;
}

// ---------------------------------------------------------------------------
// Inicialização do modelo TFLite
// ---------------------------------------------------------------------------
bool initModel() {
    tensor_arena = (uint8_t*)ps_malloc(kTensorArenaSize);
    if (!tensor_arena) tensor_arena = (uint8_t*)malloc(kTensorArenaSize);
    if (!tensor_arena) { Serial.println("ERRO: sem memória para tensor arena"); return false; }

    tfl_model = tflite::GetModel(g_person_detect_model_data);
    if (tfl_model->version() != TFLITE_SCHEMA_VERSION) {
        Serial.println("ERRO: versão do modelo incompatível"); return false;
    }

    static tflite::MicroMutableOpResolver<5> resolver;
    resolver.AddConv2D();
    resolver.AddDepthwiseConv2D();
    resolver.AddReshape();
    resolver.AddSoftmax();
    resolver.AddAveragePool2D();

    static tflite::MicroInterpreter static_interpreter(
        tfl_model, resolver, tensor_arena, kTensorArenaSize);
    interpreter = &static_interpreter;

    if (interpreter->AllocateTensors() != kTfLiteOk) {
        Serial.println("ERRO: AllocateTensors falhou"); return false;
    }
    input_tensor = interpreter->input(0);
    return true;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("=== SmartZoo — Módulo 2: Detecção + Localização ===");

    Serial.print("Câmera... ");
    if (!initCamera()) { Serial.println("ERRO. Reiniciando..."); delay(3000); ESP.restart(); }
    Serial.println("OK");

    Serial.print("Modelo TFLite... ");
    if (!initModel()) { Serial.println("ERRO. Reiniciando..."); delay(3000); ESP.restart(); }
    Serial.println("OK");

    background = (uint8_t*)ps_malloc(FRAME_PIXELS);
    if (!background) background = (uint8_t*)malloc(FRAME_PIXELS);
    if (!background) { Serial.println("ERRO: sem memória para background"); ESP.restart(); }

    Serial.println("\nCalibração: mantenha a cena VAZIA por ~3s para calibrar o background.");
    Serial.println("Pronto.\n");
    Serial.println("Modo de detecção: DUAL (TFLite + Background Subtraction)");
    Serial.println("Comando: envie 's' para capturar snapshot de referência (VGA JPEG)");
    Serial.println("─────────────────────────────────────────────────────────");
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
void loop() {
    // Comando serial: 's' → captura snapshot de referência
    if (Serial.available()) {
        char cmd = Serial.read();
        if (cmd == 's' || cmd == 'S') captureSnapshot();
    }

    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) { Serial.println("ERRO: falha ao capturar frame"); delay(500); return; }

    if (fb->len != (size_t)FRAME_PIXELS) {
        esp_camera_fb_return(fb); delay(200); return;
    }

    // ── Sinal 1: TFLite — normalização INT8 [-128,127] ───────────────────────
    for (size_t i = 0; i < fb->len; i++) {
        input_tensor->data.int8[i] = (int8_t)((int)fb->buf[i] - 128);
    }
    interpreter->Invoke();
    TfLiteTensor* output = interpreter->output(0);
    float tfliteScore   = scoreToFloat(output->data.int8[kPersonIndex]);
    bool  tfliteActive  = tfliteScore >= TFLITE_THRESHOLD;

    // ── Sinal 2: Background subtraction ──────────────────────────────────────
    float bgDiff   = computeBgDiff(fb->buf);
    bool  bgActive = bg_ready && (bgDiff >= BG_AREA_THRESHOLD);

    // ── Decisão final: ativo se qualquer sinal disparar ───────────────────────
    bool  active        = tfliteActive || bgActive;
    float activityLevel = (tfliteScore > bgDiff) ? tfliteScore : bgDiff;

    // ── Localização ───────────────────────────────────────────────────────────
    const char* zone = nullptr;
    if (active) {
        zone = detectZone(fb->buf);
        inactive_count = 0;
    } else {
        inactive_count++;
        if (inactive_count >= BG_UPDATE_AFTER) {
            memcpy(background, fb->buf, FRAME_PIXELS);
            bg_ready = true;
            inactive_count = 0;
        }
    }

    esp_camera_fb_return(fb);

    // ── Log serial ────────────────────────────────────────────────────────────
    Serial.printf("%-8s | zone: %-14s | tflite: %.2f [%s] | bg_diff: %.2f [%s]\n",
        active   ? "ACTIVE" : "inactive",
        active && zone ? zone : "-",
        tfliteScore, tfliteActive ? "✓" : " ",
        bgDiff,      bgActive     ? "✓" : " ");

    delay(300);
}
