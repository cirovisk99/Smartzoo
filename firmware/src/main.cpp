/**
 * SmartZoo — Módulo 1: Servo Sweep Test
 *
 * Hardware:
 *   ESP32-S3 Sense + MB102 + 2x Servo MG90S + Capacitor 1000µF 16V
 *
 * Pinagem:
 *   GPIO 5 → Servo Pan  (horizontal)
 *   GPIO 6 → Servo Tilt (vertical)
 *
 * Alimentação dos servos: rail 5V do MB102 (NÃO pelo ESP32-S3).
 * GND MB102 compartilhado com GND do ESP32-S3.
 * Capacitor 1000µF no rail 5V/GND do MB102, próximo aos servos.
 *
 * Teste: ambos os servos varrem 0° → 180° → 0° continuamente.
 *        Monitor serial exibe posição atual a cada passo.
 */

#include <Arduino.h>

// ---------------------------------------------------------------------------
// Configuração de pinos
// ---------------------------------------------------------------------------
constexpr int PIN_PAN  = 5;
constexpr int PIN_TILT = 6;

// ---------------------------------------------------------------------------
// Configuração LEDC (PWM para servos)
// Servos MG90S: sinal 50 Hz, pulso entre 500µs (0°) e 2500µs (180°)
// ---------------------------------------------------------------------------
constexpr int    LEDC_FREQ       = 50;    // Hz
constexpr int    LEDC_RESOLUTION = 16;   // bits → 0–65535
constexpr int    LEDC_CH_PAN    = 0;
constexpr int    LEDC_CH_TILT   = 1;

// Período do ciclo PWM em µs: 1_000_000 / 50 Hz = 20 000 µs
// Duty para 1 contagem = 20 000 µs / 65 535 counts ≈ 0,305 µs/count
constexpr float  US_PER_COUNT   = 20000.0f / 65535.0f;

constexpr int PULSE_MIN_US  = 500;   // µs → 0°
constexpr int PULSE_MAX_US  = 2500;  // µs → 180°

// ---------------------------------------------------------------------------
// Parâmetros do sweep
// ---------------------------------------------------------------------------
constexpr int   SWEEP_STEP_DEG  = 1;    // graus por passo
constexpr int   SWEEP_DELAY_MS  = 15;   // ms entre passos (velocidade)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
uint32_t degreesToDuty(float degrees) {
    float pulse_us = PULSE_MIN_US + (degrees / 180.0f) * (PULSE_MAX_US - PULSE_MIN_US);
    return static_cast<uint32_t>(pulse_us / US_PER_COUNT);
}

void servoWrite(int channel, float degrees) {
    degrees = constrain(degrees, 0.0f, 180.0f);
    ledcWrite(channel, degreesToDuty(degrees));
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
void setup() {
    Serial.begin(115200);
    delay(1000);  // aguarda USB CDC estabilizar
    Serial.println("=== SmartZoo — Módulo 1: Servo Sweep ===");

    // Configura canais LEDC
    ledcSetup(LEDC_CH_PAN,  LEDC_FREQ, LEDC_RESOLUTION);
    ledcSetup(LEDC_CH_TILT, LEDC_FREQ, LEDC_RESOLUTION);

    // Associa pinos aos canais
    ledcAttachPin(PIN_PAN,  LEDC_CH_PAN);
    ledcAttachPin(PIN_TILT, LEDC_CH_TILT);

    // Posição inicial: centro (90°)
    servoWrite(LEDC_CH_PAN,  90.0f);
    servoWrite(LEDC_CH_TILT, 90.0f);
    Serial.println("Servos centralizados em 90°. Iniciando sweep em 2s...");
    delay(2000);
}

// ---------------------------------------------------------------------------
// Loop — sweep contínuo 0° → 180° → 0°
// ---------------------------------------------------------------------------
void loop() {
    // 0° → 180°
    for (int deg = 0; deg <= 180; deg += SWEEP_STEP_DEG) {
        servoWrite(LEDC_CH_PAN,  static_cast<float>(deg));
        servoWrite(LEDC_CH_TILT, static_cast<float>(deg));
        Serial.printf("Pan: %3d°  Tilt: %3d°\n", deg, deg);
        delay(SWEEP_DELAY_MS);
    }

    delay(500);

    // 180° → 0°
    for (int deg = 180; deg >= 0; deg -= SWEEP_STEP_DEG) {
        servoWrite(LEDC_CH_PAN,  static_cast<float>(deg));
        servoWrite(LEDC_CH_TILT, static_cast<float>(deg));
        Serial.printf("Pan: %3d°  Tilt: %3d°\n", deg, deg);
        delay(SWEEP_DELAY_MS);
    }

    delay(500);
}
