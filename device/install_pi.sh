#!/usr/bin/env bash
# Bootstrap EcoRiver software on Raspberry Pi OS 64-bit.
#
# Run from the repository root with:
#   bash device/install_pi.sh
#
# This script intentionally does NOT start the controller, enable systemd, or
# turn on autonomous mode. Fill the local environment file, wire the hardware,
# and complete preflight first.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

required_files=(
  "device/final v3.2.py"
  "device/riverwatch_bridge.py"
  "device/best.onnx"
  "device/requirements-pi.txt"
  "device/riverwatch-bridge.env.example"
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Berkas wajib tidak ditemukan: $PROJECT_ROOT/$file" >&2
    exit 1
  fi
done

machine="$(uname -m)"
case "$machine" in
  aarch64|arm64)
    echo "Raspberry Pi OS 64-bit terdeteksi ($machine)."
    ;;
  *)
    echo "PERINGATAN: arsitektur $machine terdeteksi. ONNX Runtime paling aman di Raspberry Pi OS 64-bit (aarch64)." >&2
    ;;
esac

echo "Memasang paket sistem yang diperlukan..."
sudo apt update
sudo apt install -y python3-venv python3-pip python3-opencv libopenblas-dev libgomp1 v4l-utils

echo "Menyiapkan virtual environment Python..."
python3 -m venv --system-site-packages .venv
.venv/bin/python3 -m pip install --upgrade pip
.venv/bin/python3 -m pip install -r device/requirements-pi.txt

if [[ ! -f device/riverwatch-bridge.env ]]; then
  cp device/riverwatch-bridge.env.example device/riverwatch-bridge.env
  echo
  echo "Template environment dibuat: device/riverwatch-bridge.env"
  echo "Isi RIVERWATCH_ORIGIN dan RIVERWATCH_DEVICE_TOKEN sebelum preflight."
else
  echo "Environment lokal sudah ada; tidak ditimpa."
fi

echo
echo "Pemasangan software EcoRiver selesai. Langkah selanjutnya:"
echo "  1. sudo raspi-config  (Serial login: No, serial hardware: Yes), lalu reboot"
echo "  2. nano device/riverwatch-bridge.env"
echo "  3. source .venv/bin/activate"
echo "  4. set -a; source device/riverwatch-bridge.env; set +a"
echo "  5. python3 device/preflight_pi.py"
echo
echo "ECORIVER_AUTONOMOUS tetap 0 secara default; aktuator tidak akan digerakkan."