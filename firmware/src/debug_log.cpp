// Implementação de DebugLog para Arduino/ESP32
// Requerida pelo TFLite Micro (micro_log.cpp chama DebugLog)
#include <Arduino.h>

extern "C" void DebugLog(const char* s) {
    Serial.print(s);
}
