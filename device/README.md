# Integrasi Raspberry Pi Smart River ke RiverWatch

Bridge ini menghubungkan program `final v3.2.py` dengan API RiverWatch tanpa membuka Flask Raspberry Pi ke internet. Telemetri dan gambar bergerak keluar dari Raspberry Pi menuju RiverWatch melalui HTTPS.

## Firmware ESP32

Sketch siap unggah tersedia di [`esp32_smart_river.ino`](esp32_smart_river/esp32_smart_river.ino).
Sketch ini memakai JSON per baris (NDJSON) dua arah pada UART2: telemetry dan
ACK dikirim ESP32 ke Raspberry Pi, sedangkan command JSON dikirim Pi ke ESP32.
Baud UART Pi mengikuti firmware terbaru, yaitu `115200` (Serial Monitor USB
juga menggunakan `115200`; GPS memiliki UART terpisah pada `9600`). Kecepatan
ini diperlukan agar telemetry diagnostik dan ACK kontrol tidak menumpuk.

Pada Raspberry Pi, `final v3.2.py` memakai `/dev/serial0` dan `115200` baud
secara default. Untuk uji sementara melalui kabel USB ESP32 di Windows, port
`COM3` juga memakai `115200` baud. Jika Anda sengaja memakai `9600`, ubah
`PI_BAUD` pada sketch **dan** `SMART_RIVER_SERIAL_BAUD` pada Pi ke nilai yang
sama, lalu terima latensi kontrol yang lebih tinggi:

```powershell
$env:SMART_RIVER_SERIAL_PORT = "COM3"
$env:SMART_RIVER_SERIAL_BAUD = "115200"
python ".\final v3.2.py"
```

TX dan RX harus disilang, dan GND harus terhubung bersama. Jangan menjalankan
dua program yang membuka port serial yang sama secara bersamaan.

Model deteksi yang dipakai program tersedia di [`best.onnx`](best.onnx). Model
ini berformat Ultralytics/ONNX, berukuran sekitar 11,6 MiB, dan memakai input
416 x 416. Salinan resmi `final v3.2.py` juga tersedia di folder ini, sehingga
keduanya dapat disalin bersama ke Raspberry Pi. Jika script diletakkan di
folder lain, atur `SMART_RIVER_MODEL_PATH` ke lokasi absolut model tersebut.
Jangan mengubah nama file tanpa memperbarui variabel tersebut.

| Raspberry Pi | ESP32 |
| --- | --- |
| GPIO14 / TXD | GPIO16 / `PI_RX` |
| GPIO15 / RXD | GPIO17 / `PI_TX` |
| GND | GND |

Keduanya menggunakan level logika 3,3 V. Jangan hubungkan pin 5 V Raspberry Pi
atau output 5 V sensor langsung ke GPIO ESP32/Raspberry Pi.

Pasang library berikut melalui **Tools → Manage Libraries** di Arduino IDE:

- ArduinoJson 7.x (sketch divalidasi dengan 7.4.3);
- Adafruit INA219;
- TinyGPSPlus; dan
- ESP32Servo.

Profil pin awal pada sketch:

| Fungsi | GPIO ESP32 |
| --- | ---: |
| UART2 ke Raspberry Pi (RX/TX) | 16 / 17 |
| GPS RX/TX | 18 / 19 |
| INA219 SDA/SCL | 21 / 22 |
| AJSN TRIG/ECHO | 5 / 15 |
| LDR / level air (ADC) | 34 / 35 |
| L298N ENA, IN1, IN2 | 27, 25, 14 |
| L298N ENB, IN3, IN4 | 12, 23, 0 |
| Servo | 32 |
| Conveyor/ULN2003 enable | 33 |
| Pompa | 4 |
| LED hijau / LED merah | 26 / 2 |
| Buzzer | 13 |

Pemetaan di atas sudah memisahkan INA219 (I2C SCL GPIO22) dari L298N IN4
(GPIO0). GPIO0 adalah pin strap BOOT, sehingga kabel IN4 tidak boleh menarik
pin tersebut LOW saat reset atau saat upload. Gunakan pull-up sekitar 10 kOhm
ke 3,3 V pada input IN4, pasang pull-down sekitar 10 kOhm pada ENA/ENB bila
modul L298N membuatnya mengambang, dan pastikan ENB/ENA LOW ketika reset.
Jangan menekan tombol BOOT ketika motor dapat aktif. GPIO 0, 2, 5, 12, dan 15 adalah pin strap
boot. Semua ECHO dan output analog yang lebih dari 3,3 V wajib
melalui voltage divider ke level 3,3 V. Motor, pompa, servo, L298N, dan ULN2003
harus memakai catu daya eksternal dengan GND yang disatukan ke GND ESP32.
Jalur conveyor pada pemetaan ini hanya satu GPIO enable; urutan empat fase
stepper ULN2003 membutuhkan tiga jalur tambahan yang belum diberikan.

> **Konfirmasi sebelum menyalakan conveyor:** firmware saat ini memperlakukan
> GPIO33 sebagai enable/relay tunggal. Ini benar bila conveyor Anda memang
> dikendalikan oleh relay atau driver eksternal yang hanya memerlukan satu
> sinyal. Jika modulnya adalah ULN2003 standar dengan input `IN1`–`IN4` untuk
> motor stepper, jangan mengaktifkan conveyor otomatis dulu—kirim empat pin
> wiring aktual agar urutan fase stepper dapat ditambahkan dengan aman.

Contoh telemetry yang dikirim:

```json
{"type":"telemetry","seq":12,"ldr":1234,"water":850,"distance":48.2,"voltage":5.1,"current":210.0,"power":1.07,"components":{"esp32":{"status":"ok","detail":"ESP32 aktif dan firmware Smart River berjalan."},"ina219":{"status":"ok","detail":"INA219 mengirim pembacaan tegangan, arus, dan daya terbaru."},"servo":{"status":"unknown","detail":"Sudut servo diterapkan; servo ini tidak memiliki sensor posisi untuk verifikasi fisik."}}}
```

Contoh command dari Raspberry Pi ke ESP32:

```json
{"type":"command","seq":13,"command":"SET_SERVO","servo":90}
{"type":"command","seq":14,"command":"FORWARD_SLOW"}
```

Setiap command dibalas ACK JSON (`accepted: true/false`). Telemetry tetap
dikirim berkala walaupun tidak ada command.

`ok` berarti pemeriksaan yang tersedia berhasil, `error` berarti pembacaan atau
komunikasi gagal, sedangkan `unknown` berarti hardware tidak menyediakan
umpan balik yang cukup untuk memastikan kondisi fisiknya. Untuk membuat motor,
servo, LED, atau buzzer benar-benar dapat dilaporkan `ok/error` secara fisik,
tambahkan sensor arus, encoder, limit switch, sensor posisi, atau rangkaian
loopback yang sesuai.

## 1. Program controller Raspberry Pi

Salinan `final v3.2.py` yang ada di folder `device/` **sudah** diarahkan ke
bridge lokal berikut dan tidak perlu diedit lagi:

```python
SERVER_URL = "http://127.0.0.1:5050/api/device"
```

Bridge kemudian meneruskan telemetry dan gambar ke RiverWatch melalui HTTPS.
Jika Anda menggunakan salinan script lama dari lokasi lain, pastikan nilainya
sama; endpoint gambar otomatis menggunakan `SERVER_URL + "/image"`.

## 2. Konfigurasi Vercel

Tambahkan environment variable berikut ke project RiverWatch:

```env
SMART_RIVER_MONITORING_URL=
SMART_RIVER_SOURCE_ID=smart-river-hardware
SMART_RIVER_MONITORING_TOKEN=TOKEN_ACAK_YANG_KUAT
SMART_RIVER_DEVICE_STALE_SECONDS=30
SMART_RIVER_IMAGE_MAX_BYTES=2000000
```

`SMART_RIVER_MONITORING_URL` sengaja dikosongkan agar RiverWatch memakai data push yang tersimpan di PostgreSQL. Buat token, misalnya dengan:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Jangan menyimpan token asli di Git.

## 3. Database

Jalankan migration berikut pada database PostgreSQL/Supabase:

```text
db/migrations/20260827000002_device_telemetry.sql
```

Tidak perlu migration tambahan untuk diagnostik; objek `components` disimpan
di kolom `payload` JSONB yang sama.

## 4. Konfigurasi Raspberry Pi

### Berkas yang harus ada di Raspberry Pi

Salin atau clone berkas berikut (sketch `.ino` tetap disimpan untuk ESP32 dan
tidak perlu dijalankan di Pi):

```text
/home/pi/SmartRiver/device/final v3.2.py
/home/pi/SmartRiver/device/riverwatch_bridge.py
/home/pi/SmartRiver/device/best.onnx
/home/pi/SmartRiver/device/requirements-pi.txt
/home/pi/SmartRiver/device/riverwatch-bridge.env
```

Cara yang paling mudah jika repository sudah ada di GitHub:

```bash
cd /home/pi
git clone <URL_REPOSITORY_ANDA> SmartRiver
cd /home/pi/SmartRiver
```

Jika repository private, gunakan URL SSH/token GitHub. Jika tidak ingin
memakai Git, salin lima berkas di atas melalui USB atau `scp` dari Windows:

```powershell
scp ".\device\final v3.2.py" pi@IP_RASPBERRY_PI:/home/pi/SmartRiver/device/
scp ".\device\riverwatch_bridge.py" pi@IP_RASPBERRY_PI:/home/pi/SmartRiver/device/
scp ".\device\best.onnx" pi@IP_RASPBERRY_PI:/home/pi/SmartRiver/device/
scp ".\device\requirements-pi.txt" pi@IP_RASPBERRY_PI:/home/pi/SmartRiver/device/
scp ".\device\riverwatch-bridge.env.example" pi@IP_RASPBERRY_PI:/home/pi/SmartRiver/device/
```

Setelah itu, jalankan langkah berikut di Raspberry Pi OS **64-bit** (arsitektur
`aarch64` disarankan karena model ONNX membutuhkan runtime ARM64):

Cara cepat (script ini tidak menjalankan aktuator atau service):

```bash
cd /home/pi/SmartRiver
bash device/install_pi.sh
```

Atau jalankan pemasangan manual berikut jika Anda ingin melihat setiap paket
yang dipasang:

```bash
uname -m
sudo apt update
sudo apt install -y python3-venv python3-pip python3-opencv libopenblas-dev libgomp1 v4l-utils
cd /home/pi/SmartRiver
python3 -m venv --system-site-packages .venv
source .venv/bin/activate
python3 -m pip install --upgrade pip
python3 -m pip install -r device/requirements-pi.txt
```

Jika `onnxruntime` tidak memiliki wheel untuk arsitektur/versi OS Pi Anda,
jangan menebak paket pengganti: simpan pesan error `pip` dan gunakan Raspberry
Pi OS 64-bit atau runtime ONNX yang sesuai dengan board tersebut.

### UART dan wiring Pi–ESP32

1. Jalankan `sudo raspi-config` → **Interface Options → Serial Port**.
   Jawab **No** untuk login shell serial, **Yes** untuk serial hardware, lalu
   reboot. Ini mencegah `serial-getty` mengambil `/dev/serial0`.
2. Setelah reboot, pastikan `ls -l /dev/serial0` menampilkan device.
3. Hubungkan kabel dengan silang TX/RX berikut. Semua GND harus menyatu dan
   level logika hanya 3,3 V:

   ```text
   Raspberry Pi GPIO14 / TXD  → ESP32 GPIO16 / PI_RX
   Raspberry Pi GPIO15 / RXD  → ESP32 GPIO17 / PI_TX
   Raspberry Pi GND            → ESP32 GND
   ```

   Jangan hubungkan 5 V Pi ke GPIO ESP32. Motor, pompa, servo, L298N, dan
   ULN2003 memakai catu eksternal; GND catu tetap disatukan.

### Environment lokal

Salin template dan isi nilainya:

```bash
cd /home/pi/SmartRiver
cp device/riverwatch-bridge.env.example device/riverwatch-bridge.env
nano device/riverwatch-bridge.env
```

Nilai minimal yang harus benar:

```env
RIVERWATCH_ORIGIN=https://smart-river-lilac.vercel.app
RIVERWATCH_DEVICE_ID=smart-river-hardware
RIVERWATCH_DEVICE_TOKEN=TOKEN_YANG_SAMA_DENGAN_VERCEL
RIVERWATCH_HEARTBEAT_SECONDS=5
RIVERWATCH_BRIDGE_PORT=5050
SMART_RIVER_LOCAL_STATUS_URL=http://127.0.0.1:5000/status
SMART_RIVER_SERIAL_PORT=/dev/serial0
SMART_RIVER_SERIAL_BAUD=115200
SMART_RIVER_SERIAL_TIMEOUT=0.1
SMART_RIVER_MODEL_PATH=/home/pi/SmartRiver/device/best.onnx
SMART_RIVER_CAMERA_INDEX=0
SMART_RIVER_SHOW_PREVIEW=0
SMART_RIVER_AUTONOMOUS=0
```

Gunakan token acak baru yang sama persis di Vercel dan Pi. Token yang pernah
tertulis di chat/log sebaiknya dicabut dan diganti. File `.env` lokal jangan
di-commit atau dikirim ke orang lain.

`SMART_RIVER_AUTONOMOUS=0` adalah default keselamatan: kamera, AI, telemetry,
dan dashboard tetap aktif, tetapi motor, conveyor, serta pompa dipastikan mati.
Setel ke `1` hanya setelah seluruh uji meja berhasil dan alat berada di lokasi
aman. Jangan membuat service otomatis menjalankan aktuator sebelum tahap itu.

### Preflight sebelum menjalankan alat

Setelah environment diisi dan sebelum menjalankan controller, gunakan pemeriksa
yang tersedia. Ia tidak mengirim perintah gerak ke ESP32.

```bash
cd /home/pi/SmartRiver
source .venv/bin/activate
set -a; source device/riverwatch-bridge.env; set +a
python3 device/preflight_pi.py
```

Jika kamera belum dipasang tetapi Anda ingin menguji Pi/UART terlebih dahulu:

```bash
python3 device/preflight_pi.py --skip-camera
```

Semua baris wajib harus berstatus `OK`. Perbaiki setiap `GAGAL` sebelum beralih
ke langkah menjalankan bridge/controller.

### Menjalankan program

Buka dua terminal SSH (atau dua tab). Di **masing-masing** terminal, muat
environment terlebih dahulu.

Terminal 1 — bridge HTTPS:

```bash
cd /home/pi/SmartRiver
source .venv/bin/activate
set -a; source device/riverwatch-bridge.env; set +a
python3 device/riverwatch_bridge.py
```

Terminal 2 — kamera, AI, dan server lokal:

```bash
cd /home/pi/SmartRiver
source .venv/bin/activate
set -a; source device/riverwatch-bridge.env; set +a
python3 "device/final v3.2.py"
```

Bridge boleh dimulai lebih dulu; ia akan menunggu endpoint lokal sampai program
utama aktif. `SMART_RIVER_SHOW_PREVIEW=0` cocok untuk SSH/headless. Ubah ke `1`
hanya jika Pi memiliki desktop/display.

### Menjalankan otomatis setelah reboot (opsional)

Setelah pengujian manual berhasil, unit systemd sudah disediakan di
[`systemd/`](systemd/). Salin dan aktifkan sebagai berikut:

```bash
sudo cp device/systemd/smart-river-controller.service /etc/systemd/system/
sudo cp device/systemd/riverwatch-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now smart-river-controller.service
sudo systemctl enable --now riverwatch-bridge.service
sudo systemctl status smart-river-controller.service --no-pager
sudo systemctl status riverwatch-bridge.service --no-pager
```

Sebelum mengaktifkan service, pastikan lokasi proyek tetap
`/home/pi/SmartRiver`, user Pi bernama `pi`, dan environment file telah diisi.
Jika berbeda, ubah path/user pada dua file `.service`. Untuk melihat log:

```bash
journalctl -u smart-river-controller.service -f
journalctl -u riverwatch-bridge.service -f
```

## 5. Flash ESP32 dan pengujian bertahap

Sebelum menyalakan motor, unggah sketch `esp32_smart_river.ino` dari Arduino
IDE dengan **Board: ESP32 Dev Module**. Pada wiring terbaru, pindahkan kabel
L298N **IN4 ke GPIO0** dan biarkan INA219 **SCL di GPIO22**. GPIO0 dan ENB
GPIO12 adalah pin strap boot:

- pasang pull-up sekitar 10 kOhm pada IN4 (GPIO0) dan pull-down sekitar 10 kOhm
  pada ENA/ENB jika modul mengambang;
- matikan catu motor/pompa saat upload atau reset pertama;
- jangan menekan BOOT ketika driver motor dapat mengaktifkan motor; dan
- bila ESP32 gagal boot setelah kabel dipasang, lepas IN4/ENB sementara,
  pastikan board dapat boot, lalu periksa kembali pull-up/pull-down dan jumper
  L298N (jangan memberi logika 5 V ke GPIO).

Uji dengan urutan aman berikut:

1. ESP32 saja melalui USB; buka Serial Monitor pada `115200`. Pastikan pesan
   `Smart River ESP32 siap` muncul.
2. Hubungkan UART Pi (GPIO14/15) dan jalankan program utama. Periksa bahwa
   `/status` menerima `components` dan nilai sensor.
3. Sambungkan kamera dan uji deteksi dengan motor/pompa tetap tidak bertenaga.
4. Aktifkan catu aktuator eksternal terakhir, satu komponen setiap kali.

Periksa endpoint lokal dari terminal Pi:

```bash
curl http://127.0.0.1:5050/health
curl http://127.0.0.1:5000/status
```

Setelah telemetry pertama diterima, `esp32` dan komponen yang dapat diverifikasi
akan berubah dari `unknown` menjadi `ok`/`error`. Kemudian masuk ke dashboard
RiverWatch. Data diperbarui otomatis setiap lima detik; jika heartbeat berhenti
lebih lama dari batas yang dikonfigurasi, dashboard menandai alat tidak
terhubung.

## Data yang Ditampilkan

RiverWatch menggunakan data nyata yang tersedia pada program alat:

- sensor cahaya/LDR;
- sensor air dalam nilai mentah;
- jarak objek dalam sentimeter;
- status pompa;
- lokasi, kecepatan, dan jumlah satelit GPS;
- tegangan, arus, dan daya;
- mode remote atau otomatis;
- aksi robot;
- deteksi sampah dan confidence; serta
- gambar deteksi terbaru.

Versi `final v3.2.py` dan sketch `esp32_smart_river.ino` yang sudah disiapkan
juga mengirim objek opsional `components` untuk viewer 3D dan kartu diagnostik.
Status `ok` menghasilkan centang hijau, `error` menghasilkan silang merah, dan
`unknown` berarti komponen belum dapat dibuktikan sehat (misalnya aktuator tidak
memiliki sensor arus/encoder atau sensor analog sedang berada di batas ADC).

Nama komponen yang digunakan:

| Kunci JSON | Komponen | Sumber diagnosis |
| --- | --- | --- |
| `esp32` | mikrokontroler ESP32 dan firmware | heartbeat/telemetry ESP32 |
| `ina219` / `power` | monitor tegangan, arus, daya | deteksi I2C + pembacaan valid |
| `ajsn` / `distanceSensor` | AJSN-SR04T | echo ultrasonik valid |
| `gps` | modul GPS | aliran NMEA dan status fix |
| `ldr` | sensor cahaya | pembacaan ADC |
| `waterLevel` | sensor level air | pembacaan ADC |
| `servo` | servo kemudi | hasil attach; posisi fisik belum terukur |
| `l298n` / `thruster` | driver dan motor penggerak | output GPIO; tanpa feedback berstatus `unknown` |
| `uln2003` / `conveyor` | driver dan motor conveyor | output GPIO; tanpa feedback berstatus `unknown` |
| `led` | LED indikator | GPIO terkonfigurasi; tidak ada feedback listrik |
| `buzzer` | buzzer indikator | GPIO terkonfigurasi; tidak ada feedback listrik |
| `camera` | webcam deteksi AI | proses Python di Raspberry Pi |
| `raspberryPi` | proses utama Pi | status proses/bridge |

Perintah yang berhasil ditulis ke UART **bukan** bukti bahwa motor atau servo
benar-benar bergerak. Untuk status fisik `ok`, tambahkan sensor arus, encoder,
limit switch, atau sensor posisi yang sesuai lalu perluas firmware.

Parameter yang tidak diukur alat, seperti pH, TDS, debit, suhu, dan oksigen terlarut, tidak dibuat-buat dan tidak ditampilkan pada mode perangkat ini.
