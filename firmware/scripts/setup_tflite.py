"""
setup_tflite.py — roda antes da compilação (extra_scripts pre:)

Patches aplicados na Arduino_TensorFlowLite para compatibilidade com ESP32:

  1. peripherals/*.cpp  → stubs vazios (código nRF52/Mbed OS)
  2. peripherals/peripherals.h → stub com MicrosecondsCounter() via micros()
     (micro_time.cpp do TFLite core chama essa função)
  3. compatibility.h  → operator delete deve ser public para placement new
     funcionar no GCC do ESP32-S3
  4. Copia person_detect_model_data.h/.cc de examples/ para src/
"""

Import("env")  # noqa: F821

import os
import shutil

BOARD   = "seeed_xiao_esp32s3"
LIBDEPS = os.path.join(".pio", "libdeps", BOARD)
LIB     = os.path.join(LIBDEPS, "Arduino_TensorFlowLite")
SRC     = "src"

peripherals_dir = os.path.join(LIB, "src", "peripherals")

if not os.path.isdir(peripherals_dir):
    print("[setup_tflite] AVISO: lib ainda não baixada — rode Build novamente após o download.")
else:
    # ── 1. Stub todos os .cpp de peripherals/ ─────────────────────────────────
    for fname in os.listdir(peripherals_dir):
        if fname.endswith(".cpp"):
            fpath = os.path.join(peripherals_dir, fname)
            with open(fpath, "w", encoding="utf-8") as f:
                f.write("// Stub ESP32\n")
            print(f"[setup_tflite] Stubbed: {fname}")

    # ── 2. Reescreve peripherals.h com MicrosecondsCounter() para micros() ────
    # micro_time.cpp do TFLite core chama peripherals::MicrosecondsCounter()
    peripherals_h = os.path.join(peripherals_dir, "peripherals.h")
    peripherals_h_content = """\
#pragma once
// Stub ESP32 — peripherals.h
// micro_time.cpp depende de MicrosecondsCounter(); implementado via micros().
#include <Arduino.h>
namespace peripherals {
  inline uint32_t MicrosecondsCounter() { return static_cast<uint32_t>(micros()); }
}
"""
    with open(peripherals_h, "w", encoding="utf-8") as f:
        f.write(peripherals_h_content)
    print("[setup_tflite] Reescrito: peripherals.h (com MicrosecondsCounter)")

    # Stub os demais .h (i2c_arduino.h, i2s_nrf52840.h, etc.)
    for fname in os.listdir(peripherals_dir):
        if fname.endswith(".h") and fname != "peripherals.h":
            fpath = os.path.join(peripherals_dir, fname)
            with open(fpath, "w", encoding="utf-8") as f:
                f.write(f"#pragma once\n// Stub ESP32 — {fname}\n")
            print(f"[setup_tflite] Stubbed: {fname}")

    # ── 3. Patch compatibility.h — operator delete precisa ser public ─────────
    # placement new no GCC do ESP32 exige que operator delete seja acessível.
    compat_h = os.path.join(
        LIB, "src", "tensorflow", "lite", "micro", "compatibility.h"
    )
    if os.path.exists(compat_h):
        with open(compat_h, "r", encoding="utf-8") as f:
            content = f.read()
        if "void operator delete(void* p) {}" in content and "public: void operator delete" not in content:
            content = content.replace(
                "void operator delete(void* p) {}",
                "public: void operator delete(void* p) {}"
            )
            with open(compat_h, "w", encoding="utf-8") as f:
                f.write(content)
            print("[setup_tflite] Patched: compatibility.h (operator delete public)")

    # ── 4. Patch micro_time.cpp — usa micros() diretamente sem peripherals ───
    micro_time_cpp = os.path.join(
        LIB, "src", "tensorflow", "lite", "micro", "micro_time.cpp"
    )
    if os.path.exists(micro_time_cpp):
        with open(micro_time_cpp, "w", encoding="utf-8") as f:
            f.write(
                '#include "tensorflow/lite/micro/micro_time.h"\n'
                "#include <Arduino.h>\n"
                "namespace tflite {\n"
                "uint32_t GetCurrentTimeTicks() {\n"
                "  return static_cast<uint32_t>(micros());\n"
                "}\n"
                "}  // namespace tflite\n"
            )
        print("[setup_tflite] Patched: micro_time.cpp (micros() direto)")

    # ── 5. Copia dados do modelo para src/ ────────────────────────────────────
    model_src = os.path.join(LIB, "examples", "person_detection")
    for fname in ["person_detect_model_data.h", "person_detect_model_data.cpp"]:
        src_path = os.path.join(model_src, fname)
        dst_path = os.path.join(SRC, fname)
        if os.path.exists(dst_path):
            continue
        if os.path.exists(src_path):
            shutil.copy(src_path, dst_path)
            print(f"[setup_tflite] Copiado: {fname} → src/")
        else:
            print(f"[setup_tflite] AVISO: {src_path} não encontrado.")
