from flask import Flask, jsonify
from datetime import datetime, timezone
import threading
import serial
import json
import time
import math
import os
import signal
import cv2
import numpy as np
import onnxruntime as ort
import requests


# =========================================================
# UART ESP32
# =========================================================

# ESP32 mengirim dan menerima NDJSON pada 115200 baud. Pastikan TX/RX
# disilang (Pi TX -> ESP32 RX, Pi RX <- ESP32 TX) dan GND disatukan.

SERIAL_PORT = os.environ.get(
    "ECORIVER_SERIAL_PORT",
    "/dev/serial0"
)
SERIAL_BAUD = int(
    os.environ.get(
        "ECORIVER_SERIAL_BAUD",
        "115200"
    )
)
SERIAL_TIMEOUT = float(
    os.environ.get(
        "ECORIVER_SERIAL_TIMEOUT",
        "0.1"
    )
)

try:
    sensor_serial = serial.Serial(
        SERIAL_PORT,
        SERIAL_BAUD,
        timeout=SERIAL_TIMEOUT
    )
except serial.SerialException as error:
    raise RuntimeError(
        f"Tidak dapat membuka port ESP32 {SERIAL_PORT} pada {SERIAL_BAUD} baud. "
        "Periksa kabel, izin port, dan ECORIVER_SERIAL_PORT."
    ) from error

serial_write_lock = threading.Lock()
SERIAL_RX_MAX_BYTES = 32 * 1024
serial_rx_buffer = bytearray()


# =========================================================
# CONFIG
# =========================================================

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_MODEL_PATH = os.path.join(SCRIPT_DIR, "best.onnx")

if not os.path.isfile(DEFAULT_MODEL_PATH):
    model_candidates = [
        os.path.join(SCRIPT_DIR, "device", "best.onnx"),
        os.path.join(os.path.dirname(SCRIPT_DIR), "device", "best.onnx"),
    ]

    for repository_model_path in model_candidates:
        if os.path.isfile(repository_model_path):
            DEFAULT_MODEL_PATH = repository_model_path
            break


MODEL_PATH = os.environ.get(
    "ECORIVER_MODEL_PATH",
    DEFAULT_MODEL_PATH
)

# RiverWatch bridge berjalan lokal di Raspberry Pi.
# Bridge menangani autentikasi dan pengiriman HTTPS ke deployment RiverWatch.
SERVER_URL = "http://127.0.0.1:5050/api/device"


CAMERA_INDEX = int(
    os.environ.get(
        "ECORIVER_CAMERA_INDEX",
        "0"
    )
)

SHOW_PREVIEW = os.environ.get(
    "ECORIVER_SHOW_PREVIEW",
    "0"
).strip().lower() in {"1", "true", "yes", "on"}

AUTONOMOUS_ENABLED = os.environ.get(
    "ECORIVER_AUTONOMOUS",
    "0"
).strip().lower() in {"1", "true", "yes", "on"}

SAFE_IDLE_INTERVAL = max(
    0.5,
    float(
        os.environ.get(
            "ECORIVER_SAFE_IDLE_INTERVAL",
            "2.0"
        )
    )
)

CAMERA_BACKEND = cv2.CAP_V4L2 if os.name == "posix" else cv2.CAP_ANY

LOCAL_BIND_HOST = os.environ.get(
    "ECORIVER_LOCAL_HOST",
    "127.0.0.1"
).strip() or "127.0.0.1"

LOCAL_PORT = int(
    os.environ.get(
        "ECORIVER_LOCAL_PORT",
        "5000"
    )
)

DETECTION_UPLOAD_INTERVAL = max(
    0.2,
    float(
        os.environ.get(
            "ECORIVER_UPLOAD_INTERVAL",
            "1.0"
        )
    )
)

IMAGE_UPLOAD_INTERVAL = max(
    0.5,
    float(
        os.environ.get(
            "ECORIVER_IMAGE_INTERVAL",
            "2.0"
        )
    )
)


# =========================================================
# DATA ESP32
# =========================================================

esp_data = {
    "ldr": 0,
    "water": 0,
    "distance": 999,
    "pump": False,
    "lat": 0.0,
    "lng": 0.0,
    "speed": 0.0,
    "satelit": 0,
    "voltage": 0.0,
    "current": 0.0,
    "power": 0.0,
    "remote": False,
    "gpsFix": False,
    "action": "UNKNOWN",
    "trash": False,
    "confidence": 0.0,
}


# =========================================================
# DIAGNOSTIK KOMPONEN UNTUK RIVERWATCH
# =========================================================

component_health_lock = threading.Lock()

KNOWN_COMPONENTS = {
    "camera",
    "esp32",
    "ina219",
    "ajsn",
    "gps",
    "ldr",
    "waterLevel",
    "servo",
    "l298n",
    "uln2003",
    "led",
    "buzzer",
    "distanceSensor",
    "conveyor",
    "power",
    "thruster",
    "raspberryPi",
}

ESP32_HEALTH_COMPONENTS = KNOWN_COMPONENTS - {"camera", "raspberryPi"}

component_health = {
    "camera": {
        "status": "unknown",
        "detail": "Kamera belum menyelesaikan pemeriksaan awal."
    },
    "esp32": {
        "status": "unknown",
        "detail": "Belum menerima telemetry atau ACK dari ESP32."
    },
    "ina219": {
        "status": "unknown",
        "detail": "Belum ada diagnosis INA219 dari ESP32."
    },
    "ajsn": {
        "status": "unknown",
        "detail": "Belum ada diagnosis AJSN-SR04T dari ESP32."
    },
    "gps": {
        "status": "unknown",
        "detail": "Belum ada diagnosis GPS dari ESP32."
    },
    "ldr": {
        "status": "unknown",
        "detail": "Belum ada diagnosis LDR dari ESP32."
    },
    "waterLevel": {
        "status": "unknown",
        "detail": "Belum ada diagnosis sensor level air dari ESP32."
    },
    "servo": {
        "status": "unknown",
        "detail": "Belum ada diagnosis servo dari ESP32."
    },
    "l298n": {
        "status": "unknown",
        "detail": "Belum ada diagnosis driver L298N dari ESP32."
    },
    "uln2003": {
        "status": "unknown",
        "detail": "Belum ada diagnosis driver ULN2003 dari ESP32."
    },
    "led": {
        "status": "unknown",
        "detail": "Belum ada diagnosis LED dari ESP32."
    },
    "buzzer": {
        "status": "unknown",
        "detail": "Belum ada diagnosis buzzer dari ESP32."
    },
    "distanceSensor": {
        "status": "unknown",
        "detail": "Belum ada pembacaan sensor jarak dari ESP32."
    },
    "conveyor": {
        "status": "unknown",
        "detail": "Belum ada kanal umpan balik motor conveyor."
    },
    "power": {
        "status": "unknown",
        "detail": "Belum ada pembacaan daya dari ESP32."
    },
    "thruster": {
        "status": "unknown",
        "detail": "Belum ada kanal umpan balik thruster."
    },
    "raspberryPi": {
        "status": "ok",
        "detail": "Proses utama EcoRiver aktif."
    },
}

command_sequence = 0
last_esp32_message_at = None
process_started_at = time.monotonic()

ESP32_STARTUP_GRACE_SECONDS = max(
    5.0,
    float(
        os.environ.get(
            "ECORIVER_ESP32_STARTUP_GRACE_SECONDS",
            "15"
        )
    )
)

ESP32_STALE_SECONDS = max(
    5.0,
    float(
        os.environ.get(
            "ECORIVER_ESP32_STALE_SECONDS",
            "8"
        )
    )
)

last_command_sent_at = {}
last_command_sent_value = {}

COMMAND_REPEAT_INTERVAL = 0.25
COMMAND_FAMILY_INTERVAL = 0.08

upload_state_lock = threading.Lock()
last_server_upload_at = 0.0
last_image_upload_at = 0.0


def health_timestamp():

    return (
        datetime.now(timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
    )


def update_component_health(name, status, detail):

    if name not in KNOWN_COMPONENTS:
        return

    if status not in {"ok", "error", "unknown"}:
        return

    detail_text = str(detail).strip()[:240]

    if not detail_text:
        detail_text = "Diagnosis tidak menyertakan alasan."

    with component_health_lock:
        component_health[name] = {
            "status": status,
            "detail": detail_text,
            "checkedAt": health_timestamp(),
        }


def component_health_snapshot():

    with component_health_lock:
        snapshot = {
            name: dict(value)
            for name, value in component_health.items()
        }

    snapshot["raspberryPi"] = {
        "status": "ok",
        "detail": "Proses utama EcoRiver aktif.",
        "checkedAt": health_timestamp(),
    }

    last_message_at = last_esp32_message_at

    if last_message_at is None:

        if time.monotonic() - process_started_at >= ESP32_STARTUP_GRACE_SECONDS:

            snapshot["esp32"] = {
                "status": "error",
                "detail": "Tidak ada telemetry/ACK ESP32 setelah masa tunggu awal.",
                "checkedAt": health_timestamp(),
            }

            stale_checked_at = health_timestamp()

            for name in ESP32_HEALTH_COMPONENTS - {"esp32"}:

                previous = snapshot.get(name, {})

                if previous.get("status") != "error":

                    snapshot[name] = {
                        "status": "unknown",
                        "detail": "ESP32 belum mengirim telemetry; status komponen belum dapat diverifikasi.",
                        "checkedAt": stale_checked_at,
                    }

        elif snapshot.get("esp32", {}).get("status") != "error":

            snapshot["esp32"] = {
                "status": "unknown",
                "detail": "Belum menerima telemetry atau ACK dari ESP32.",
                "checkedAt": health_timestamp(),
            }

    elif time.monotonic() - last_message_at > ESP32_STALE_SECONDS:

        snapshot["esp32"] = {
            "status": "error",
            "detail": (
                "Tidak ada telemetry/ACK dari ESP32 selama lebih dari "
                f"{ESP32_STALE_SECONDS:g} detik."
            ),
            "checkedAt": health_timestamp(),
        }

        stale_checked_at = health_timestamp()

        for name in ESP32_HEALTH_COMPONENTS - {"esp32"}:

            previous = snapshot.get(name, {})

            if previous.get("status") != "error":

                snapshot[name] = {
                    "status": "unknown",
                    "detail": "Tidak ada telemetry terbaru dari ESP32; status komponen belum dapat diverifikasi.",
                    "checkedAt": stale_checked_at,
                }

    return snapshot


def finite_float(value):

    if isinstance(value, bool):
        return None

    try:
        candidate = float(value)
    except (TypeError, ValueError):
        return None

    return candidate if math.isfinite(candidate) else None


def finite_number(value):

    return finite_float(value) is not None


def parse_bool(value):

    if isinstance(value, bool):
        return value

    if isinstance(value, (int, float)) and not isinstance(value, bool):

        numeric = finite_float(value)

        if numeric is not None and numeric in {0.0, 1.0}:
            return bool(numeric)

    if isinstance(value, str):

        normalized = value.strip().lower()

        if normalized in {"1", "true", "yes", "on"}:
            return True

        if normalized in {"0", "false", "no", "off"}:
            return False

    return None


def apply_telemetry(new_data):

    numeric_fields = {
        "ldr": (0, 10_000_000, True, "ldr"),
        "water": (0, 10_000_000, True, "waterLevel"),
        "distance": (0, 100_000, False, "distanceSensor"),
        "lat": (-90, 90, False, "gps"),
        "lng": (-180, 180, False, "gps"),
        "speed": (0, 1_000, False, "gps"),
        "satelit": (0, 200, True, "gps"),
        "voltage": (0, 100, False, "ina219"),
        "current": (-10_000_000, 10_000_000, False, "ina219"),
        "power": (-1_000_000, 1_000_000, False, "power"),
        "confidence": (0, 100, False, None),
    }

    numeric_input = dict(new_data)

    if "distance" not in numeric_input and "jarak" in numeric_input:
        numeric_input["distance"] = numeric_input["jarak"]

    for name, (minimum, maximum, integer, component) in numeric_fields.items():

        if name not in numeric_input:
            continue

        value = finite_float(numeric_input.get(name))

        if value is None or value < minimum or value > maximum:

            if component:

                update_component_health(
                    component,
                    "error",
                    f"Nilai {name} dari ESP32 tidak valid."
                )

            continue

        esp_data[name] = int(round(value)) if integer else value

    bool_fields = {
        "pump": "esp32",
        "remote": "esp32",
        "gpsFix": "gps",
        "trash": None,
    }

    if "pompa" in numeric_input and "pump" not in numeric_input:
        numeric_input["pump"] = numeric_input["pompa"]

    for name, component in bool_fields.items():

        if name not in numeric_input:
            continue

        value = parse_bool(numeric_input.get(name))

        if value is None:

            if component:

                update_component_health(
                    component,
                    "error",
                    f"Nilai {name} dari ESP32 tidak valid."
                )

            continue

        esp_data[name] = value

    action = numeric_input.get("action")

    if isinstance(action, str) and action.strip():
        esp_data["action"] = action.strip()[:64]

    for name in (
        "servo",
        "leftMotor",
        "rightMotor",
        "conveyorRunning",
        "waterLevelPercent"
    ):

        if name not in numeric_input:
            continue

        value = finite_float(numeric_input.get(name))

        if value is not None:
            esp_data[name] = value

    sequence = numeric_input.get("seq")

    if (
        isinstance(sequence, int)
        and not isinstance(sequence, bool)
        and sequence >= 0
    ):
        esp_data["seq"] = sequence


def bounded_value(
    value,
    default,
    minimum,
    maximum,
    integer=False
):

    candidate = finite_float(value)

    if candidate is None or candidate < minimum or candidate > maximum:
        return default

    return int(round(candidate)) if integer else candidate


def telemetry_values():

    action = esp_data.get("action", "UNKNOWN")

    if not isinstance(action, str) or not action.strip():
        action = "UNKNOWN"

    return {
        "ldr": bounded_value(
            esp_data.get("ldr"),
            0,
            0,
            10_000_000,
            True
        ),
        "water": bounded_value(
            esp_data.get("water"),
            0,
            0,
            10_000_000,
            True
        ),
        "distance": bounded_value(
            esp_data.get("distance"),
            999.0,
            0,
            100_000
        ),
        "pump": parse_bool(esp_data.get("pump")) or False,
        "lat": bounded_value(
            esp_data.get("lat"),
            0.0,
            -90,
            90
        ),
        "lng": bounded_value(
            esp_data.get("lng"),
            0.0,
            -180,
            180
        ),
        "speed": bounded_value(
            esp_data.get("speed"),
            0.0,
            0,
            1_000
        ),
        "satelit": bounded_value(
            esp_data.get("satelit"),
            0,
            0,
            200,
            True
        ),
        "voltage": bounded_value(
            esp_data.get("voltage"),
            0.0,
            0,
            100
        ),
        "current": bounded_value(
            esp_data.get("current"),
            0.0,
            -10_000_000,
            10_000_000
        ),
        "power": bounded_value(
            esp_data.get("power"),
            0.0,
            -1_000_000,
            1_000_000
        ),
        "remote": parse_bool(esp_data.get("remote")) or False,
        "action": action.strip()[:64],
        "trash": parse_bool(esp_data.get("trash")) or False,
        "confidence": bounded_value(
            esp_data.get("confidence"),
            0.0,
            0,
            100
        ),
    }


def next_command_sequence():

    global command_sequence

    with component_health_lock:

        command_sequence += 1

        return command_sequence


def command_family(command):

    if command.startswith(("SERVO:", "SET_SERVO")):
        return "servo"

    if command.startswith((
        "FORWARD",
        "BACKWARD",
        "REVERSE",
        "BACK",
        "LEFT",
        "RIGHT",
        "STOP",
        "PATROL",
        "SET_MOTORS",
    )):
        return "motion"

    if command.startswith("CONVEYOR"):
        return "conveyor"

    if command in {"PUMP_ON", "PUMP_OFF"}:
        return "pump"

    if command == "BEEP":
        return "buzzer"

    return command


def merge_component_health(value):

    if not isinstance(value, dict):
        return

    for name, diagnostic in value.items():

        if name not in KNOWN_COMPONENTS:
            continue

        if not isinstance(diagnostic, dict):
            continue

        status = diagnostic.get("status")

        if status not in {"ok", "error", "unknown"}:
            continue

        detail = diagnostic.get("detail")

        if not isinstance(detail, str) or not detail.strip():
            detail = "Diagnosis diterima dari ESP32."

        record = {
            "status": status,
            "detail": detail.strip()[:240],
            "checkedAt": health_timestamp(),
        }

        checked_at = diagnostic.get("checkedAt")

        if isinstance(checked_at, str) and checked_at.strip():

            try:

                parsed_checked_at = datetime.fromisoformat(
                    checked_at.strip().replace("Z", "+00:00")
                )

                if parsed_checked_at.tzinfo is not None:
                    record["checkedAt"] = checked_at.strip()

            except ValueError:
                pass

        with component_health_lock:
            component_health[name] = record


# =========================================================
# FLASK
# =========================================================

app = Flask(__name__)


@app.route("/")
def home():

    return "EcoRiver Server Running"


@app.route("/status")
def status():

    payload = dict(esp_data)
    payload["components"] = component_health_snapshot()

    return jsonify(payload)


@app.route("/control/<cmd>")
def control(cmd):

    command = cmd.upper()

    accepted = kirim(command)

    return jsonify({
        "success": accepted,
        "command": command
    }), (200 if accepted else 503)


# =========================================================
# KIRIM COMMAND KE ESP32
# =========================================================

def kirim(cmd):

    try:

        command = str(cmd).strip().upper()

        if not command:

            update_component_health(
                "esp32",
                "error",
                "Perintah kosong tidak dikirim ke ESP32."
            )

            return False

        now = time.monotonic()
        family = command_family(command)

        with component_health_lock:

            previous_at = last_command_sent_at.get(
                family,
                0.0
            )

            previous_value = last_command_sent_value.get(
                family
            )

            safety_command = command in {
                "STOP",
                "CONVEYOR_OFF",
                "PUMP_OFF"
            }

            repeat_interval = (
                0.08
                if safety_command
                else COMMAND_REPEAT_INTERVAL
            )

            if (
                command == previous_value
                and now - previous_at < repeat_interval
            ):
                return True

            if (
                not safety_command
                and command != previous_value
                and now - previous_at < COMMAND_FAMILY_INTERVAL
            ):
                return True

            last_command_sent_at[family] = now
            last_command_sent_value[family] = command

        command_payload = {
            "type": "command",
            "seq": next_command_sequence(),
            "command": command,
            "issuedAt": health_timestamp(),
        }

        if command.startswith("SERVO:"):

            try:
                command_payload["servo"] = int(
                    command.split(":", 1)[1]
                )

            except (TypeError, ValueError):
                pass

        encoded_command = (
            json.dumps(
                command_payload,
                separators=(",", ":")
            )
            + "\n"
        ).encode()

        with serial_write_lock:

            sensor_serial.write(
                encoded_command
            )

            sensor_serial.flush()

        update_component_health(
            "esp32",
            "unknown",
            "Perintah terkirim; menunggu telemetry atau ACK dari ESP32."
        )

        if (
            command.startswith("SERVO:")
            or command == "SET_SERVO"
        ):

            update_component_health(
                "servo",
                "unknown",
                "Perintah servo terkirim; menunggu ACK dan umpan balik fisik."
            )

        if command.startswith((
            "FORWARD",
            "BACKWARD",
            "REVERSE",
            "BACK",
            "LEFT",
            "RIGHT",
            "STOP",
            "PATROL",
            "SET_MOTORS"
        )):

            update_component_health(
                "l298n",
                "unknown",
                "Perintah L298N terkirim; tanpa sensor arus/encoder gerak fisik belum terbukti."
            )

        if command in {
            "PUMP_ON",
            "PUMP_OFF"
        }:

            update_component_health(
                "esp32",
                "unknown",
                "Perintah pompa terkirim; menunggu telemetry ESP32."
            )

        if command == "BEEP":

            update_component_health(
                "buzzer",
                "unknown",
                "Perintah buzzer terkirim; tanpa loopback audio, output fisik belum dapat diverifikasi."
            )

        if "CONVEYOR" in command:

            update_component_health(
                "uln2003",
                "unknown",
                "Perintah ULN2003 terkirim; tanpa sensor arus/posisi putaran belum terbukti."
            )

        print(
            "SEND JSON :",
            command_payload
        )

        return True

    except Exception as e:

        upper_cmd = str(cmd).upper()

        update_component_health(
            "esp32",
            "error",
            "Perintah tidak dapat ditulis ke UART ESP32."
        )

        if "SERVO" in upper_cmd:

            update_component_health(
                "servo",
                "error",
                "Perintah servo gagal dikirim ke ESP32."
            )

        if upper_cmd in {
            "PUMP_ON",
            "PUMP_OFF"
        }:

            update_component_health(
                "esp32",
                "error",
                "Perintah pompa gagal dikirim ke ESP32."
            )

        if upper_cmd == "BEEP":

            update_component_health(
                "buzzer",
                "error",
                "Perintah buzzer gagal dikirim ke ESP32."
            )

        if "CONVEYOR" in upper_cmd:

            update_component_health(
                "conveyor",
                "error",
                "Perintah conveyor gagal dikirim ke ESP32."
            )

            update_component_health(
                "uln2003",
                "error",
                "Perintah ULN2003 gagal dikirim ke ESP32."
            )

        if upper_cmd in {
            "LEFT",
            "RIGHT",
            "STOP",
            "PATROL",
            "FORWARD_SLOW",
            "BACK",
        } or upper_cmd.startswith((
            "FORWARD",
            "BACKWARD",
            "REVERSE",
            "SET_MOTORS"
        )):

            update_component_health(
                "thruster",
                "error",
                "Perintah gerak gagal dikirim ke ESP32."
            )

            update_component_health(
                "l298n",
                "error",
                "Perintah L298N gagal dikirim ke ESP32."
            )

        print(
            "UART Error :",
            e
        )

        return False


# =========================================================
# BACA DATA SENSOR ESP32
# =========================================================

def read_serial_lines():

    while True:

        waiting = sensor_serial.in_waiting

        if waiting <= 0:
            break

        chunk = sensor_serial.read(waiting)

        if not chunk:
            break

        serial_rx_buffer.extend(chunk)

        if len(serial_rx_buffer) > SERIAL_RX_MAX_BYTES:

            serial_rx_buffer.clear()

            update_component_health(
                "esp32",
                "error",
                "Buffer UART ESP32 penuh; paket parsial dibuang."
            )

            break

    lines = []

    while True:

        newline_index = serial_rx_buffer.find(
            b"\n"
        )

        if newline_index < 0:
            break

        raw_line = bytes(
            serial_rx_buffer[
                :newline_index
            ]
        )

        del serial_rx_buffer[
            :newline_index + 1
        ]

        line = raw_line.decode(
            "utf-8",
            errors="ignore"
        ).strip()

        if line:
            lines.append(line)

    return lines


def baca_sensor():

    global esp_data, last_esp32_message_at

    try:

        for data in read_serial_lines():

            if data.startswith("{"):

                try:

                    new_data = json.loads(data)

                    if not isinstance(
                        new_data,
                        dict
                    ):
                        continue

                    message_type = new_data.get(
                        "type"
                    )

                    device_name = str(
                        new_data.get(
                            "device",
                            ""
                        )
                    ).strip().lower()

                    is_ack = (
                        message_type == "ack"
                    )

                    is_telemetry = (
                        message_type == "telemetry"
                        or (
                            message_type is None
                            and any(
                                key in new_data
                                for key in (
                                    "ldr",
                                    "water",
                                    "distance",
                                    "jarak",
                                    "voltage",
                                    "current",
                                    "power",
                                )
                            )
                        )
                    )

                    # Menerima nama lama sementara agar kompatibel dengan
                    # firmware ESP32 yang belum diperbarui.
                    if device_name and device_name not in {
                        "esp32",
                        "ecoriver-esp32",
                        "ecoriver-esp32"
                    }:
                        continue

                    if not is_ack and not is_telemetry:
                        continue

                    last_esp32_message_at = time.monotonic()

                    if is_ack:

                        merge_component_health(
                            new_data.get(
                                "components"
                            )
                        )

                        if new_data.get(
                            "accepted"
                        ) is False:

                            rejected_command = str(
                                new_data.get(
                                    "command",
                                    ""
                                )
                            ).strip().upper()

                            rejection_reason = str(
                                new_data.get(
                                    "reason",
                                    "Perintah ditolak ESP32."
                                )
                            )

                            if "SERVO" in rejected_command:

                                update_component_health(
                                    "servo",
                                    "error",
                                    rejection_reason
                                )

                            if "CONVEYOR" in rejected_command:

                                update_component_health(
                                    "uln2003",
                                    "error",
                                    rejection_reason
                                )

                                update_component_health(
                                    "conveyor",
                                    "error",
                                    rejection_reason
                                )

                            if rejected_command in {
                                "PUMP_ON",
                                "PUMP_OFF"
                            }:

                                update_component_health(
                                    "esp32",
                                    "error",
                                    rejection_reason
                                )

                            if rejected_command == "BEEP":

                                update_component_health(
                                    "buzzer",
                                    "error",
                                    rejection_reason
                                )

                            if rejected_command.startswith((
                                "FORWARD",
                                "BACKWARD",
                                "REVERSE",
                                "BACK",
                                "LEFT",
                                "RIGHT",
                                "STOP",
                                "PATROL",
                                "SET_MOTORS",
                            )):

                                update_component_health(
                                    "l298n",
                                    "error",
                                    rejection_reason
                                )

                                update_component_health(
                                    "thruster",
                                    "error",
                                    rejection_reason
                                )

                            print(
                                "ESP32 menolak perintah:",
                                new_data.get("command"),
                                new_data.get(
                                    "reason",
                                    "tidak diketahui"
                                )
                            )

                        continue

                    merge_component_health(
                        new_data.get(
                            "components"
                        )
                    )

                    reported_components = new_data.get(
                        "components"
                    )

                    has_reported_component = lambda name: (
                        isinstance(
                            reported_components,
                            dict
                        )
                        and isinstance(
                            reported_components.get(name),
                            dict
                        )
                    )

                    if not has_reported_component("esp32"):

                        update_component_health(
                            "esp32",
                            "ok",
                            "ESP32 mengirim paket JSON melalui UART."
                        )

                    if (
                        "ldr" in new_data
                        and not has_reported_component("ldr")
                    ):

                        ldr_value = new_data.get(
                            "ldr"
                        )

                        ldr_numeric = finite_float(
                            ldr_value
                        )

                        ldr_ok = (
                            ldr_numeric is not None
                            and 0 <= ldr_numeric <= 10_000_000
                        )

                        update_component_health(
                            "ldr",
                            "ok" if ldr_ok else "error",
                            "LDR mengirim nilai ADC terbaru."
                            if ldr_ok
                            else "Nilai LDR dari ESP32 tidak valid."
                        )

                    if (
                        "water" in new_data
                        and not has_reported_component(
                            "waterLevel"
                        )
                    ):

                        water_value = new_data.get(
                            "water"
                        )

                        water_numeric = finite_float(
                            water_value
                        )

                        water_ok = (
                            water_numeric is not None
                            and 0 <= water_numeric <= 10_000_000
                        )

                        update_component_health(
                            "waterLevel",
                            "ok" if water_ok else "error",
                            "Sensor level air mengirim nilai ADC terbaru."
                            if water_ok
                            else "Nilai sensor level air dari ESP32 tidak valid."
                        )

                    if (
                        "gpsFix" in new_data
                        and not has_reported_component("gps")
                    ):

                        gps_fix = parse_bool(
                            new_data.get("gpsFix")
                        )

                        update_component_health(
                            "gps",
                            "ok" if gps_fix is True else "unknown",
                            "GPS memiliki fix koordinat."
                            if gps_fix is True
                            else "GPS belum mendapatkan fix; ini belum membuktikan modul rusak."
                        )

                    apply_telemetry(
                        new_data
                    )

                    if (
                        not has_reported_component(
                            "distanceSensor"
                        )
                        and not has_reported_component(
                            "ajsn"
                        )
                        and (
                            "distance" in new_data
                            or "jarak" in new_data
                        )
                    ):

                        distance_value = finite_float(
                            esp_data.get(
                                "distance"
                            )
                        )

                        if (
                            distance_value is not None
                            and distance_value >= 0
                        ):

                            update_component_health(
                                "distanceSensor",
                                "ok",
                                "Sensor jarak mengirim pembacaan terbaru."
                            )

                        else:

                            update_component_health(
                                "distanceSensor",
                                "error",
                                "Pembacaan sensor jarak tidak valid."
                            )

                    if (
                        not has_reported_component("power")
                        and not has_reported_component("ina219")
                        and all(
                            key in new_data
                            for key in (
                                "voltage",
                                "current",
                                "power"
                            )
                        )
                    ):

                        voltage_value = finite_float(
                            esp_data.get(
                                "voltage"
                            )
                        )

                        current_value = finite_float(
                            esp_data.get(
                                "current"
                            )
                        )

                        power_value = finite_float(
                            esp_data.get(
                                "power"
                            )
                        )

                        power_ok = (
                            voltage_value is not None
                            and voltage_value > 0
                            and current_value is not None
                            and power_value is not None
                        )

                        update_component_health(
                            "power",
                            "ok" if power_ok else "error",
                            (
                                "Sistem daya mengirim pembacaan terbaru."
                                if power_ok
                                else "Pembacaan sistem daya tidak valid."
                            )
                        )

                except json.JSONDecodeError:

                    print(
                        "JSON ESP tidak valid:",
                        data
                    )

    except Exception as e:

        update_component_health(
            "distanceSensor",
            "error",
            "Komunikasi serial dengan ESP32 bermasalah."
        )

        update_component_health(
            "esp32",
            "error",
            "Komunikasi serial dengan ESP32 bermasalah."
        )

        update_component_health(
            "power",
            "error",
            "Telemetri daya tidak dapat dibaca dari ESP32."
        )

        print(
            "Sensor Error :",
            e
        )


def wait_with_sensor_poll(seconds):

    deadline = time.monotonic() + max(
        0.0,
        float(seconds)
    )

    while time.monotonic() < deadline:

        baca_sensor()

        remaining = (
            deadline -
            time.monotonic()
        )

        time.sleep(
            min(
                0.05,
                max(
                    0.0,
                    remaining
                )
            )
        )


def safe_shutdown():

    for command in (
        "STOP",
        "CONVEYOR_OFF",
        "PUMP_OFF"
    ):

        try:

            kirim(
                command
            )

        except Exception as error:

            print(
                "Shutdown command gagal:",
                command,
                error
            )


def handle_shutdown_signal(
    signal_number,
    _frame
):

    print(
        "Sinyal shutdown diterima:",
        signal_number
    )

    raise KeyboardInterrupt


# =========================================================
# UPLOAD DATA KE SERVER
# =========================================================

def upload_server(
    det,
    action
):

    global last_server_upload_at

    now = time.monotonic()

    with upload_state_lock:

        if (
            now -
            last_server_upload_at
            < DETECTION_UPLOAD_INTERVAL
        ):
            return

        last_server_upload_at = now

    try:

        values = telemetry_values()

        data = {
            **values,

            "action": action,

            "trash": det is not None,

            "confidence":
                det["confidence"]
                if det
                else 0,

            "components":
                component_health_snapshot()
        }

        response = requests.post(
            SERVER_URL,
            json=data,
            timeout=2
        )

        response.raise_for_status()

    except Exception as e:

        print(
            "Upload gagal :",
            e
        )


# =========================================================
# UPLOAD GAMBAR
# =========================================================

def upload_image(frame):

    global last_image_upload_at

    now = time.monotonic()

    with upload_state_lock:

        if (
            now -
            last_image_upload_at
            < IMAGE_UPLOAD_INTERVAL
        ):
            return

        last_image_upload_at = now

    try:

        success, img = cv2.imencode(
            ".jpg",
            frame
        )

        if not success:
            return

        response = requests.post(

            SERVER_URL + "/image",

            files={
                "image": (
                    "trash.jpg",
                    img.tobytes(),
                    "image/jpeg"
                )
            },

            timeout=2
        )

        response.raise_for_status()

    except Exception as e:

        print(
            "Upload image gagal:",
            e
        )


# =========================================================
# YOLO DETECTOR
# =========================================================

class TrashDetector:

    def __init__(
        self,
        model_path,
        conf=0.5
    ):

        self.conf = conf

        if not os.path.isfile(model_path):

            raise FileNotFoundError(
                "Model ONNX tidak ditemukan: " +
                str(model_path) +
                ". Salin device/best.onnx ke folder program atau set "
                "ECORIVER_MODEL_PATH."
            )

        self.session = ort.InferenceSession(

            model_path,

            providers=[
                "CPUExecutionProvider"
            ]
        )

        self.input_name = (
            self.session
            .get_inputs()[0]
            .name
        )

        self.input_shape = (
            self.session
            .get_inputs()[0]
            .shape
        )

        self.img_size = (
            int(self.input_shape[2]),
            int(self.input_shape[3])
        )

        print(
            "YOLO input:",
            self.img_size
        )


    def preprocess(
        self,
        frame
    ):

        img = cv2.resize(
            frame,
            self.img_size
        )

        img = cv2.cvtColor(
            img,
            cv2.COLOR_BGR2RGB
        )

        img = (
            img.astype(
                np.float32
            ) / 255.0
        )

        img = np.transpose(
            img,
            (2, 0, 1)
        )

        img = np.expand_dims(
            img,
            0
        )

        return img


    def detect(
        self,
        frame
    ):

        input_tensor = (
            self.preprocess(
                frame
            )
        )

        output = self.session.run(

            None,

            {
                self.input_name:
                input_tensor
            }
        )

        return self.postprocess(
            output,
            frame.shape
        )


    def postprocess(
        self,
        output,
        shape
    ):

        pred = np.squeeze(
            output[0]
        ).T

        if pred.shape[1] <= 4:
            return None

        score = np.max(
            pred[:, 4:],
            axis=1
        )

        mask = (
            score >
            self.conf
        )

        pred = pred[mask]

        if len(pred) == 0:
            return None

        boxes = pred[:, :4].copy()

        conf = np.max(
            pred[:, 4:],
            axis=1
        )

        h, w = shape[:2]

        boxes[:, [0, 2]] *= (
            w /
            self.img_size[0]
        )

        boxes[:, [1, 3]] *= (
            h /
            self.img_size[1]
        )

        idx = np.argmax(
            boxes[:, 2] *
            boxes[:, 3]
        )

        box = boxes[idx]

        return {

            "bbox": box,

            "confidence":
                float(
                    conf[idx]
                ),

            "center_x":
                float(
                    box[0] +
                    box[2] / 2
                ),

            "width":
                float(
                    box[2]
                )
        }


# =========================================================
# ROBOT
# =========================================================

class Robot:

    def __init__(self):

        self.detector = TrashDetector(
            MODEL_PATH
        )

        # -------------------------------------------------
        # USB WEBCAM
        # -------------------------------------------------

        print(
            "Membuka kamera index",
            CAMERA_INDEX,
            "..."
        )

        self.cap = cv2.VideoCapture(
            CAMERA_INDEX,
            CAMERA_BACKEND
        )

        if not self.cap.isOpened():

            update_component_health(
                "camera",
                "error",
                "Webcam /dev/video0 tidak terdeteksi."
            )

            raise RuntimeError(
                "Webcam /dev/video0 tidak terdeteksi!"
            )

        self.camera_healthy = True
        self.last_camera_health_at = time.monotonic()

        update_component_health(
            "camera",
            "ok",
            "Kamera mengirim frame ke pemrosesan AI."
        )

        # -------------------------------------------------
        # RESOLUTION
        # -------------------------------------------------

        self.cap.set(
            cv2.CAP_PROP_FRAME_WIDTH,
            640
        )

        self.cap.set(
            cv2.CAP_PROP_FRAME_HEIGHT,
            480
        )

        # -------------------------------------------------
        # MJPEG
        # -------------------------------------------------

        self.cap.set(
            cv2.CAP_PROP_FOURCC,
            cv2.VideoWriter_fourcc(
                *"MJPG"
            )
        )

        # -------------------------------------------------
        # TARGET 30 FPS
        # -------------------------------------------------

        self.cap.set(
            cv2.CAP_PROP_FPS,
            30
        )

        # -------------------------------------------------
        # BUFFER
        # -------------------------------------------------

        self.cap.set(
            cv2.CAP_PROP_BUFFERSIZE,
            1
        )

        # -------------------------------------------------
        # CAMERA INFO
        # -------------------------------------------------

        try:

            camera_backend = (
                self.cap
                .getBackendName()
            )

        except cv2.error:

            camera_backend = "unknown"

        print(
            "Camera backend:",
            camera_backend
        )

        print(
            "Resolution:",
            int(
                self.cap.get(
                    cv2.CAP_PROP_FRAME_WIDTH
                )
            ),
            "x",
            int(
                self.cap.get(
                    cv2.CAP_PROP_FRAME_HEIGHT
                )
            )
        )

        print(
            "Camera target FPS:",
            self.cap.get(
                cv2.CAP_PROP_FPS
            )
        )

        # -------------------------------------------------
        # ROBOT CONFIG
        # -------------------------------------------------

        self.center_tol = 60
        self.conveyor_distance = 20
        self.last_time = time.time()
        self.fps = 0
        self.last_safe_idle_at = 0.0

        print(
            "Webcam Ready"
        )

        print(
            "Mode kontrol:",
            "otomatis"
            if AUTONOMOUS_ENABLED
            else
            "monitoring aman (aktuator dimatikan)"
        )


    # =====================================================
    # GET FRAME
    # =====================================================

    def get_frame(self):

        ret, frame = (
            self.cap.read()
        )

        if not ret:

            now = time.monotonic()

            if (
                self.camera_healthy
                or now -
                self.last_camera_health_at
                >= 5
            ):

                self.camera_healthy = False
                self.last_camera_health_at = now

                update_component_health(
                    "camera",
                    "error",
                    "Frame kamera tidak dapat dibaca."
                )

            print(
                "Gagal membaca frame webcam"
            )

            return None

        now = time.monotonic()

        if (
            not self.camera_healthy
            or now -
            self.last_camera_health_at
            >= 5
        ):

            self.camera_healthy = True
            self.last_camera_health_at = now

            update_component_health(
                "camera",
                "ok",
                "Kamera mengirim frame ke pemrosesan AI."
            )

        return frame


    # =====================================================
    # DECIDE
    # =====================================================

    def decide(
        self,
        det,
        width
    ):

        if det is None:
            return "FORWARD_SLOW"

        x = det["center_x"]

        offset = (
            x -
            width / 2
        )

        if abs(offset) < self.center_tol:

            return "FORWARD"

        elif offset < 0:

            return "LEFT"

        else:

            return "RIGHT"


    def ensure_safe_idle(self):

        now = time.monotonic()

        if (
            now -
            self.last_safe_idle_at
            < SAFE_IDLE_INTERVAL
        ):
            return

        self.last_safe_idle_at = now

        kirim("STOP")
        kirim("CONVEYOR_OFF")
        kirim("PUMP_OFF")


    # =====================================================
    # DRAW
    # =====================================================

    def draw(
        self,
        frame,
        det,
        action
    ):

        if det:

            x, y, w, h = (
                det["bbox"]
            )

            cv2.rectangle(

                frame,

                (
                    int(x),
                    int(y)
                ),

                (
                    int(x + w),
                    int(y + h)
                ),

                (0, 255, 0),

                2
            )

            cv2.putText(

                frame,

                f"{det['confidence']:.2f}",

                (
                    int(x),
                    int(y) - 10
                ),

                cv2.FONT_HERSHEY_SIMPLEX,

                0.6,

                (0, 255, 0),

                2
            )

        cv2.putText(

            frame,

            action,

            (10, 30),

            cv2.FONT_HERSHEY_SIMPLEX,

            1,

            (0, 255, 255),

            2
        )

        cv2.putText(
            frame,
            f"LDR : {esp_data.get('ldr', 0)}",
            (10, 60),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (255, 255, 255),
            2
        )

        cv2.putText(
            frame,
            f"Water : {esp_data.get('water', 0)}",
            (10, 90),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (255, 255, 255),
            2
        )

        cv2.putText(
            frame,
            f"Distance : {esp_data.get('distance', 0):.1f} cm",
            (10, 120),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (255, 255, 255),
            2
        )

        cv2.putText(
            frame,
            f"Lat : {esp_data.get('lat', 0.0):.6f}",
            (10, 150),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (255, 255, 255),
            2
        )

        cv2.putText(
            frame,
            f"Lng : {esp_data.get('lng', 0.0):.6f}",
            (10, 180),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (255, 255, 255),
            2
        )

        cv2.putText(
            frame,
            f"Speed : {esp_data.get('speed', 0.0):.1f} km/h",
            (10, 210),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (255, 255, 255),
            2
        )

        cv2.putText(
            frame,
            f"Sat : {esp_data.get('satelit', 0)}",
            (10, 240),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (255, 255, 255),
            2
        )

        cv2.putText(
            frame,
            f"FPS : {self.fps:.1f}",
            (10, 270),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 255, 255),
            2
        )

        cv2.putText(
            frame,
            f"Voltage : {esp_data.get('voltage', 0):.2f} V",
            (10, 300),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 255, 255),
            2
        )

        cv2.putText(
            frame,
            f"Current : {esp_data.get('current', 0):.0f} mA",
            (10, 330),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 255, 255),
            2
        )

        cv2.putText(
            frame,
            f"Power : {esp_data.get('power', 0):.2f} W",
            (10, 360),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 255, 255),
            2
        )


# =========================================================
# ROBOT RUN
# =========================================================

    def run(self):

        print(
            "ECORIVER RUNNING"
        )

        while True:

            # ---------------------------------------------
            # BACA ESP32
            # ---------------------------------------------

            baca_sensor()

            # ---------------------------------------------
            # REMOTE MODE
            # ---------------------------------------------

            if esp_data.get(
                "remote",
                False
            ):

                print(
                    "Raspberry Pi power low - Remote Mode"
                )

                kirim(
                    "SERVO:90"
                )

                kirim(
                    "STOP"
                )

                time.sleep(
                    0.1
                )

                continue

            # ---------------------------------------------
            # FRAME
            # ---------------------------------------------

            frame = self.get_frame()

            if frame is None:

                if not AUTONOMOUS_ENABLED:
                    self.ensure_safe_idle()

                time.sleep(
                    0.05
                )

                continue

            # ---------------------------------------------
            # FPS
            # ---------------------------------------------

            now = time.time()

            dt = (
                now -
                self.last_time
            )

            if dt > 0:

                self.fps = (
                    1.0 /
                    dt
                )

            self.last_time = now

            # ---------------------------------------------
            # YOLO
            # ---------------------------------------------

            det = self.detector.detect(
                frame
            )

            # ---------------------------------------------
            # ACTION
            # ---------------------------------------------

            action = self.decide(
                det,
                frame.shape[1]
            )

            if not AUTONOMOUS_ENABLED:

                action = "MONITORING"

            # ---------------------------------------------
            # SERVO
            # ---------------------------------------------

            servo = 90

            if action == "LEFT":

                servo = 45

            elif action == "RIGHT":

                servo = 135

            # ---------------------------------------------
            # DISTANCE
            # ---------------------------------------------

            distance = esp_data.get(
                "distance",
                20
            )

            # ---------------------------------------------
            # UPLOAD
            # ---------------------------------------------

            if det:

                upload_server(
                    det,
                    action
                )

                upload_image(
                    frame
                )

            # ---------------------------------------------
            # ROBOT LOGIC
            # ---------------------------------------------

            if not AUTONOMOUS_ENABLED:

                self.ensure_safe_idle()

            elif det:

                # =========================================
                # SAMPAH DEKAT
                # =========================================

                if distance <= self.conveyor_distance:

                    print(
                        "SAMPAH DEKAT - CONVEYOR"
                    )

                    kirim(
                        "SERVO:" +
                        str(servo)
                    )

                    kirim(
                        "STOP"
                    )

                    kirim(
                        "CONVEYOR_ON"
                    )

                    action = "CONVEYOR"

                    wait_with_sensor_poll(
                        5
                    )

                    kirim(
                        "CONVEYOR_OFF"
                    )

                    kirim(
                        "SERVO:90"
                    )

                    kirim(
                        "FORWARD_SLOW"
                    )

                # =========================================
                # SAMPAH MASIH JAUH
                # =========================================

                else:

                    kirim(
                        "SERVO:" +
                        str(servo)
                    )

                    kirim(
                        action
                    )

            # ---------------------------------------------
            # TIDAK ADA SAMPAH
            # ---------------------------------------------

            else:

                action = "PATROL"

                kirim(
                    "SERVO:90"
                )

                kirim(
                    "FORWARD_SLOW"
                )

            # ---------------------------------------------
            # DISPLAY
            # ---------------------------------------------

            self.draw(
                frame,
                det,
                action
            )

            if SHOW_PREVIEW:

                cv2.imshow(
                    "ECORIVER",
                    frame
                )

                key = (
                    cv2.waitKey(1)
                    & 0xFF
                )

                if key == ord("q"):
                    break

            else:

                time.sleep(
                    0.001
                )

        # -----------------------------------------------
        # CLEANUP
        # -----------------------------------------------

        self.cap.release()

        if SHOW_PREVIEW:
            cv2.destroyAllWindows()


# =========================================================
# MAIN
# =========================================================

if __name__ == "__main__":

    signal.signal(
        signal.SIGTERM,
        handle_shutdown_signal
    )

    signal.signal(
        signal.SIGINT,
        handle_shutdown_signal
    )

    # -----------------------------------------------------
    # FLASK SERVER
    # -----------------------------------------------------

    threading.Thread(

        target=lambda: app.run(

            host=LOCAL_BIND_HOST,

            port=LOCAL_PORT,

            debug=False,

            use_reloader=False,

            threaded=True
        ),

        daemon=True
    ).start()

    # -----------------------------------------------------
    # ROBOT
    # -----------------------------------------------------

    if not AUTONOMOUS_ENABLED:

        safe_shutdown()

    robot = None

    try:

        robot = Robot()

        robot.run()

    except KeyboardInterrupt:

        print(
            "Shutdown diminta; menghentikan semua aktuator..."
        )

    finally:

        safe_shutdown()

        if robot is not None:

            try:
                robot.cap.release()
            except Exception:
                pass

        if SHOW_PREVIEW:

            try:
                cv2.destroyAllWindows()
            except cv2.error:
                pass

        try:
            sensor_serial.close()
        except Exception:
            pass