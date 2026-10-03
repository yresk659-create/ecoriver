#!/usr/bin/env python3
"""Preflight pemeriksaan Smart River pada Raspberry Pi.

Jalankan setelah environment file dimuat dan sebelum menyalakan service:

    set -a; source device/riverwatch-bridge.env; set +a
    python3 device/preflight_pi.py

Script ini tidak mengirim command ke ESP32. Ia hanya memeriksa dependensi,
model ONNX, akses UART, konfigurasi, dan (kecuali --skip-camera) USB camera.
"""

from __future__ import annotations

import argparse
import importlib
import os
from pathlib import Path
import platform
import sys
from typing import Any
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
CHECK_MARK = "OK"
WARN_MARK = "PERINGATAN"
ERROR_MARK = "GAGAL"
errors: list[str] = []
warnings: list[str] = []


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def report(mark: str, message: str) -> None:
    print(f"[{mark}] {message}")


def failure(message: str) -> None:
    errors.append(message)
    report(ERROR_MARK, message)


def warning(message: str) -> None:
    warnings.append(message)
    report(WARN_MARK, message)


def required_env(name: str) -> str | None:
    value = env(name)
    placeholder = value.lower()
    if not value or placeholder.startswith(("ganti-", "token_acak", "replace-", "example")):
        failure(f"{name} belum diisi dengan nilai asli.")
        return None
    report(CHECK_MARK, f"{name} tersedia.")
    return value


def check_import(module_name: str, label: str) -> Any | None:
    try:
        module = importlib.import_module(module_name)
    except Exception as error:  # ImportError is not the only possible failure on ARM.
        failure(f"{label} tidak dapat diimpor: {error}")
        return None
    report(CHECK_MARK, f"{label} dapat diimpor.")
    return module


def check_origin(origin: str | None) -> None:
    if not origin:
        return
    parsed = urlparse(origin)
    if parsed.scheme != "https" or not parsed.netloc:
        failure("RIVERWATCH_ORIGIN harus berupa URL HTTPS publik, misalnya https://smart-river-lilac.vercel.app")
        return
    report(CHECK_MARK, "RIVERWATCH_ORIGIN memakai HTTPS.")


def check_model(ort_module: Any | None) -> None:
    configured = env("SMART_RIVER_MODEL_PATH", str(ROOT / "best.onnx"))
    model_path = Path(configured).expanduser()
    if not model_path.is_file():
        failure(f"Model ONNX tidak ditemukan: {model_path}")
        return
    if model_path.stat().st_size < 1_000_000:
        failure(f"Ukuran model terlalu kecil/korup: {model_path}")
        return
    report(CHECK_MARK, f"Model ONNX ditemukan ({model_path.stat().st_size / 1024 / 1024:.1f} MiB).")
    if ort_module is None:
        return
    try:
        session = ort_module.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
        input_info = session.get_inputs()[0]
        report(CHECK_MARK, f"Model ONNX dapat dibuka; input {input_info.name} {input_info.shape}.")
    except Exception as error:
        failure(f"Model ONNX tidak dapat dibuka oleh onnxruntime: {error}")


def check_serial(serial_module: Any | None) -> None:
    port = env("SMART_RIVER_SERIAL_PORT", "/dev/serial0")
    baud_text = env("SMART_RIVER_SERIAL_BAUD", "115200")
    try:
        baud = int(baud_text)
        if baud <= 0:
            raise ValueError
    except ValueError:
        failure(f"SMART_RIVER_SERIAL_BAUD tidak valid: {baud_text}")
        return
    if not Path(port).exists():
        failure(f"Port UART tidak ditemukan: {port}. Aktifkan serial hardware di raspi-config.")
        return
    if serial_module is None:
        return
    try:
        connection = serial_module.Serial(port, baud, timeout=0.1)
        connection.close()
        report(CHECK_MARK, f"UART {port} dapat dibuka pada {baud} baud.")
    except Exception as error:
        failure(f"UART {port} tidak dapat dibuka: {error}")


def check_camera(cv2_module: Any | None, skip: bool) -> None:
    if skip:
        warning("Pemeriksaan kamera dilewati (--skip-camera).")
        return
    if cv2_module is None:
        return
    index_text = env("SMART_RIVER_CAMERA_INDEX", "0")
    try:
        index = int(index_text)
    except ValueError:
        failure(f"SMART_RIVER_CAMERA_INDEX tidak valid: {index_text}")
        return
    backend = cv2_module.CAP_V4L2 if os.name == "posix" else cv2_module.CAP_ANY
    camera = cv2_module.VideoCapture(index, backend)
    try:
        if not camera.isOpened():
            failure(f"Kamera index {index} tidak dapat dibuka. Periksa USB atau SMART_RIVER_CAMERA_INDEX.")
            return
        readable, _frame = camera.read()
        if not readable:
            failure(f"Kamera index {index} terbuka tetapi frame tidak dapat dibaca.")
            return
        report(CHECK_MARK, f"Kamera index {index} mengirim frame.")
    finally:
        camera.release()


def main() -> int:
    parser = argparse.ArgumentParser(description="Pemeriksaan deployment Raspberry Pi Smart River")
    parser.add_argument("--skip-camera", action="store_true", help="Jangan membuka kamera pada pemeriksaan ini")
    args = parser.parse_args()

    report(CHECK_MARK, f"Python {platform.python_version()} pada {platform.machine()}.")
    if sys.maxsize <= 2**32:
        warning("Python/OS 32-bit terdeteksi; Raspberry Pi OS 64-bit lebih disarankan untuk onnxruntime.")

    origin = required_env("RIVERWATCH_ORIGIN")
    token = required_env("RIVERWATCH_DEVICE_TOKEN")
    required_env("RIVERWATCH_DEVICE_ID")
    check_origin(origin)
    if token is not None and len(token) < 32:
        warning("RIVERWATCH_DEVICE_TOKEN lebih pendek dari 32 karakter; gunakan token acak 32 byte/64 hex.")

    flask_module = check_import("flask", "Flask")
    requests_module = check_import("requests", "requests")
    serial_module = check_import("serial", "pyserial")
    numpy_module = check_import("numpy", "numpy")
    cv2_module = check_import("cv2", "OpenCV")
    ort_module = check_import("onnxruntime", "onnxruntime")
    # Referenced so linters understand these imports are deliberately checked.
    _ = flask_module, requests_module, numpy_module

    check_model(ort_module)
    check_serial(serial_module)
    check_camera(cv2_module, args.skip_camera)

    autonomous = env("SMART_RIVER_AUTONOMOUS", "0").lower() in {"1", "true", "yes", "on"}
    if autonomous:
        warning("SMART_RIVER_AUTONOMOUS=1: aktuator dapat bergerak saat controller berjalan.")
    else:
        report(CHECK_MARK, "Mode aman aktif: SMART_RIVER_AUTONOMOUS=0.")

    if errors:
        print(f"\nPreflight gagal: {len(errors)} masalah perlu diperbaiki.")
        return 1
    if warnings:
        print(f"\nPreflight lulus dengan {len(warnings)} peringatan.")
    else:
        print("\nPreflight lulus. Aman untuk menjalankan bridge dan controller dalam mode monitoring.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
