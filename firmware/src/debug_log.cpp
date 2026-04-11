// debug_log.cpp — implementação de DebugLog para TFLite Micro no ESP32
#include <Arduino.h>

extern "C" void DebugLog(const char* s) {
    Serial.print(s);
}
