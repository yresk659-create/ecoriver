"""Local Raspberry Pi bridge for EcoRiver -> RiverWatch.

Run this beside final v3.2.py. The robot posts to the local Flask endpoint, while
this process handles authenticated HTTPS delivery and periodic heartbeat data,
including the nested `components` health map from the ESP32.
"""

from __future__ import annotations

from datetime import datetime, timezone
import logging
import os
import queue
import threading
import time
from typing import Any

from flask import Flask, jsonify, request
import requests


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("riverwatch-bridge")


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Environment variable {name} wajib diisi")
    return value


RIVERWATCH_ORIGIN = required_env("RIVERWATCH_ORIGIN").rstrip("/")
RIVERWATCH_DEVICE_TOKEN = required_env("RIVERWATCH_DEVICE_TOKEN")
RIVERWATCH_DEVICE_ID = os.environ.get("RIVERWATCH_DEVICE_ID", "ecoriver-hardware").strip()
LOCAL_STATUS_URL = os.environ.get("SMART_RIVER_LOCAL_STATUS_URL", "http://127.0.0.1:5000/status").strip()
HEARTBEAT_SECONDS = max(2.0, float(os.environ.get("RIVERWATCH_HEARTBEAT_SECONDS", "5")))
BRIDGE_PORT = int(os.environ.get("RIVERWATCH_BRIDGE_PORT", "5050"))
MAX_IMAGE_BYTES = min(2_000_000, max(100_000, int(os.environ.get("RIVERWATCH_IMAGE_MAX_BYTES", "2000000"))))

TELEMETRY_ENDPOINT = f"{RIVERWATCH_ORIGIN}/api/device"
IMAGE_ENDPOINT = f"{RIVERWATCH_ORIGIN}/api/device/image"

app = Flask(__name__)
outbox: queue.Queue[tuple[str, Any]] = queue.Queue(maxsize=128)
state_lock = threading.Lock()
last_detection_at = 0.0
last_image_at = 0.0
sequence = int(time.time() * 1000)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def next_sequence() -> int:
    global sequence
    with state_lock:
        sequence += 1
        return sequence


def request_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {RIVERWATCH_DEVICE_TOKEN}",
        "X-Smart-River-Source": RIVERWATCH_DEVICE_ID,
    }


def enqueue(kind: str, payload: Any) -> bool:
    try:
        outbox.put_nowait((kind, payload))
        return True
    except queue.Full:
        logger.warning("Antrean penuh; paket %s dilewati", kind)
        return False


def normalized_payload(raw: dict[str, Any], *, heartbeat: bool) -> dict[str, Any]:
    payload = dict(raw)
    if heartbeat:
        # The periodic heartbeat is the normal source of dashboard telemetry
        # when no trash is visible.  Keep the action reported by the ESP32
        # instead of inventing a PATROL state: monitoring-safe mode normally
        # reports STOP, and before the first ESP32 packet the truthful value is
        # UNKNOWN.  A remote device remains clearly identified even if an old
        # firmware did not include an action field yet.
        reported_action = str(payload.get("action") or "").strip().upper()
        payload["action"] = reported_action or (
            "REMOTE" if bool(payload.get("remote")) else "UNKNOWN"
        )
        payload["trash"] = False
        payload["confidence"] = 0
    else:
        action = str(payload.get("action") or "UNKNOWN").strip().upper()
        try:
            if bool(payload.get("trash")) and float(payload.get("distance", 999)) <= 20:
                action = "CONVEYOR"
                payload["action"] = action
        except (TypeError, ValueError):
            pass
        payload["action"] = action

    payload.setdefault("ldr", 0)
    payload.setdefault("water", 0)
    payload.setdefault("distance", 999)
    payload.setdefault("pump", False)
    payload.setdefault("lat", 0.0)
    payload.setdefault("lng", 0.0)
    payload.setdefault("speed", 0.0)
    payload.setdefault("satelit", 0)
    payload.setdefault("voltage", 0.0)
    payload.setdefault("current", 0.0)
    payload.setdefault("power", 0.0)
    payload.setdefault("remote", False)
    payload.setdefault("action", "UNKNOWN")
    payload.setdefault("trash", False)
    payload.setdefault("confidence", 0.0)
    payload["observedAt"] = utc_now()
    payload["sequence"] = next_sequence()
    return payload


@app.get("/health")
def health():
    return jsonify({"ok": True, "queued": outbox.qsize(), "deviceId": RIVERWATCH_DEVICE_ID})


@app.post("/api/device")
def receive_device_telemetry():
    global last_detection_at
    raw = request.get_json(silent=True)
    if not isinstance(raw, dict):
        return jsonify({"error": "JSON perangkat tidak valid"}), 400

    now = time.monotonic()
    detected = bool(raw.get("trash"))
    with state_lock:
        duplicate_detection = detected and now - last_detection_at < 1.0
        if detected and not duplicate_detection:
            last_detection_at = now
    if duplicate_detection:
        return jsonify({"accepted": True, "deduplicated": True}), 202

    accepted = enqueue("telemetry", normalized_payload(raw, heartbeat=False))
    return jsonify({"accepted": accepted}), 202 if accepted else 503


@app.post("/api/device/image")
def receive_device_image():
    global last_image_at
    image = request.files.get("image")
    if image is None or image.mimetype not in {"image/jpeg", "image/png", "image/webp"}:
        return jsonify({"error": "Gambar tidak valid"}), 400
    data = image.read(MAX_IMAGE_BYTES + 1)
    if not data or len(data) > MAX_IMAGE_BYTES:
        return jsonify({"error": "Ukuran gambar tidak diizinkan"}), 413

    now = time.monotonic()
    with state_lock:
        if now - last_image_at < 2.0:
            return jsonify({"accepted": True, "deduplicated": True}), 202
        last_image_at = now
    accepted = enqueue("image", (image.mimetype, data))
    return jsonify({"accepted": accepted}), 202 if accepted else 503


def upload_worker() -> None:
    session = requests.Session()
    while True:
        kind, payload = outbox.get()
        try:
            delivered = False
            for attempt in range(5):
                try:
                    if kind == "telemetry":
                        response = session.post(
                            TELEMETRY_ENDPOINT,
                            json=payload,
                            headers=request_headers(),
                            timeout=8,
                        )
                    else:
                        content_type, data = payload
                        response = session.post(
                            IMAGE_ENDPOINT,
                            files={"image": ("trash.jpg", data, content_type)},
                            headers=request_headers(),
                            timeout=12,
                        )
                    response.raise_for_status()
                    delivered = True
                    break
                except requests.RequestException as exc:
                    delay = min(30, 2 ** attempt)
                    logger.warning("Upload %s gagal (%s); coba lagi dalam %ss", kind, exc, delay)
                    time.sleep(delay)
            if not delivered:
                logger.error("Paket %s gagal dikirim setelah beberapa percobaan", kind)
        finally:
            outbox.task_done()


def heartbeat_worker() -> None:
    session = requests.Session()
    while True:
        started_at = time.monotonic()
        try:
            response = session.get(LOCAL_STATUS_URL, timeout=2)
            response.raise_for_status()
            status = response.json()
            if isinstance(status, dict):
                enqueue("telemetry", normalized_payload(status, heartbeat=True))
        except (requests.RequestException, ValueError) as exc:
            logger.warning("Status lokal EcoRiver belum dapat dibaca: %s", exc)
        elapsed = time.monotonic() - started_at
        time.sleep(max(0.2, HEARTBEAT_SECONDS - elapsed))


if __name__ == "__main__":
    threading.Thread(target=upload_worker, daemon=True, name="riverwatch-upload").start()
    threading.Thread(target=heartbeat_worker, daemon=True, name="riverwatch-heartbeat").start()
    logger.info("Bridge aktif untuk %s -> %s", RIVERWATCH_DEVICE_ID, RIVERWATCH_ORIGIN)
    app.run(host="127.0.0.1", port=BRIDGE_PORT, debug=False, use_reloader=False, threaded=True)
