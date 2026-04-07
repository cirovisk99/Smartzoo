/**
 * SmartZoo — Módulo 2: Detecção + Contagem + Localização
 *
 * Hardware: ESP32-S3 Sense (XIAO) + cabo USB-C
 *
 * Detecção: background subtraction adaptativo
 * Contagem: blob detection (flood fill DFS) — cada região conectada = 1 animal
 * Localização: grade 3×3 — zona do blob principal
 *
 * Comandos serial:
 *   's' → snapshot JPEG VGA para mapear zonas
 */

#include <Arduino.h>
#include "esp_camera.h"
#include "mbedtls/base64.h"

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
                                               // (~20 frames para absorver mudança)

// Histerese: evita flickering na transição de estado
constexpr int FRAMES_TO_ACTIVATE   = 2;   // frames positivos seguidos → ACTIVE
constexpr int FRAMES_TO_DEACTIVATE = 10;  // frames negativos seguidos → inactive

// ---------------------------------------------------------------------------
// Contagem — blob detection em grade grosseira 8×8
//
// Por que grade e não pixel a pixel?
// Em movimento, o diff ativa pixels na posição ATUAL e na ANTERIOR (ghost),
// fragmentando uma pessoa em vários blobs. Trabalhar em células de 12×12px
// funde naturalmente ghost + corpo em um blob conectado.
// ---------------------------------------------------------------------------
constexpr int GRID_COLS = 8;
constexpr int GRID_ROWS = 8;
constexpr int CELL_W    = FRAME_W / GRID_COLS;   // 12 px
constexpr int CELL_H    = FRAME_H / GRID_ROWS;   // 12 px
constexpr int CELL_PIXELS = CELL_W * CELL_H;      // 144 px/célula

constexpr int CELL_ACTIVE_THRESHOLD = 15;  // pixels ativos para marcar célula (~10%)
constexpr int MIN_BLOB_CELLS        = 3;   // células mínimas para contar como animal
constexpr int MAX_ANIMALS           = 10;

static bool grid[GRID_ROWS][GRID_COLS];
static bool grid_visited[GRID_ROWS][GRID_COLS];

// ---------------------------------------------------------------------------
// Zonas — grade 3×3 (para localização, mantida separada da contagem)
// ---------------------------------------------------------------------------
constexpr int ZONE_COLS = 3;
constexpr int ZONE_ROWS = 3;

const char* ZONE_NAMES[ZONE_ROWS][ZONE_COLS] = {
    { "top_left",    "top_center",    "top_right"    },
    { "left",        "center",        "right"        },
    { "bottom_left", "bottom_center", "bottom_right" },
};

// ---------------------------------------------------------------------------
// Estado global
// ---------------------------------------------------------------------------
static uint8_t* background      = nullptr;
static bool     bg_ready        = false;
static int      active_streak   = 0;
static int      inactive_streak = 0;
static bool     confirmed_active = false;

// ---------------------------------------------------------------------------
// Funções de detecção
// ---------------------------------------------------------------------------
float computeBgDiff(const uint8_t* frame) {
    if (!bg_ready) return 0.0f;
    int changed = 0;
    for (int i = 0; i < FRAME_PIXELS; i++) {
        if (abs((int)frame[i] - (int)background[i]) > BG_PIXEL_THRESHOLD)
            changed++;
    }
    return (float)changed / FRAME_PIXELS;
}

// Constrói a grade de células ativas e conta blobs conectados.
// Retorna número de animais e preenche primary_zone com o centróide do maior blob.
int countAnimals(const uint8_t* frame, const char** primary_zone) {
    *primary_zone = nullptr;
    if (!bg_ready) return 0;

    // 1. Preenche grade: célula ativa se >= CELL_ACTIVE_THRESHOLD pixels diferem
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

    // 2. Flood fill DFS na grade (64 células — stack local no stack frame)
    memset(grid_visited, 0, sizeof(grid_visited));

    struct GPoint { int8_t r, c; };
    GPoint gstack[GRID_ROWS * GRID_COLS];  // max 64 entradas
    static const int8_t dr[4] = { 1, -1, 0,  0 };
    static const int8_t dc[4] = { 0,  0, 1, -1 };

    int  animal_count  = 0;
    int  largest_cells = 0;
    int  largest_sum_r = GRID_ROWS / 2;
    int  largest_sum_c = GRID_COLS / 2;

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

    // 3. Zona: converte centróide do grid 8×8 para zona 3×3
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
    // Fusão lenta: bg = bg + (frame - bg) / BG_ALPHA
    for (int i = 0; i < FRAME_PIXELS; i++) {
        int diff = (int)frame[i] - (int)background[i];
        background[i] = (uint8_t)((int)background[i] + diff / BG_ALPHA);
    }
}

// ---------------------------------------------------------------------------
// Câmera
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Snapshot — envia JPEG VGA como base64 pelo serial
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
        initCamera(); return;
    }
    sensor_t* s = esp_camera_sensor_get();
    s->set_vflip(s, 1); s->set_hmirror(s, 1);

    for (int i = 0; i < 3; i++) {
        camera_fb_t* fb = esp_camera_fb_get();
        if (fb) esp_camera_fb_return(fb);
        delay(100);
    }

    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) {
        Serial.println("[SNAPSHOT] ERRO: frame vazio");
        esp_camera_deinit(); delay(100); initCamera(); return;
    }

    size_t b64_size = ((fb->len + 2) / 3) * 4 + 4;
    unsigned char* b64 = (unsigned char*)ps_malloc(b64_size);
    if (!b64) b64 = (unsigned char*)malloc(b64_size);

    if (b64) {
        size_t olen = 0;
        mbedtls_base64_encode(b64, b64_size, &olen, fb->buf, fb->len);
        Serial.printf("[SNAPSHOT] %u bytes JPEG → %u chars base64\n", fb->len, olen);
        Serial.println(">>>SNAPSHOT_START<<<");
        Serial.write(b64, olen);
        Serial.println("\n>>>SNAPSHOT_END<<<");
        Serial.println("[SNAPSHOT] Cole em: https://base64.guru/converter/decode/image\n");
        free(b64);
    }

    esp_camera_fb_return(fb);
    esp_camera_deinit();
    delay(150);
    initCamera();
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

    background = (uint8_t*)ps_malloc(FRAME_PIXELS);
    if (!background) background = (uint8_t*)malloc(FRAME_PIXELS);
    if (!background) { Serial.println("ERRO: sem memória. Reiniciando..."); ESP.restart(); }

    Serial.println("Calibrando background — mantenha a cena VAZIA por ~3s...");
    Serial.println("Comando: 's' → snapshot de referência");
    Serial.println("──────────────────────────────────────────────────────");
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
void loop() {
    if (Serial.available()) {
        char cmd = Serial.read();
        if (cmd == 's' || cmd == 'S') captureSnapshot();
    }

    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) { delay(500); return; }
    if (fb->len != (size_t)FRAME_PIXELS) { esp_camera_fb_return(fb); delay(200); return; }

    float bgDiff  = computeBgDiff(fb->buf);
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

    Serial.printf("%-8s | count: %d | zone: %-14s | bg_diff: %.3f\n",
        confirmed_active ? "ACTIVE" : "inactive",
        count,
        confirmed_active && zone ? zone : "-",
        bgDiff);

    delay(300);
}
