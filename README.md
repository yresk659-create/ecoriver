# Smart River & RiverWatch

Proyek ini menggabungkan **Smart River**, alat fisik untuk membantu membersihkan sungai, dengan **RiverWatch**, sistem pemantauan yang membantu pengguna melihat kondisi dan aktivitas alat melalui website.

## Smart River

**Smart River adalah alat pembersih sungai** yang dirancang untuk membantu menangani sampah di aliran sungai. Alat ini menjadi bagian utama yang bekerja secara langsung di lapangan.

Selain menjalankan proses pembersihan, Smart River dapat dilengkapi dengan sensor, kamera, dan komponen kontrol untuk menghasilkan informasi mengenai kondisi sungai serta status operasional alat. Data tersebut kemudian dapat dikirimkan ke RiverWatch agar pengguna tidak perlu selalu berada di lokasi untuk memantau alat.

## RiverWatch

**RiverWatch adalah sistem perangkat dan website untuk memonitor Smart River.** RiverWatch berfungsi sebagai penghubung antara alat yang berada di sungai dan pengguna yang ingin melihat kondisinya dari jarak jauh.

Melalui dashboard RiverWatch, pengguna dapat meninjau informasi seperti:

- status koneksi dan operasional Smart River;
- pembacaan sensor yang terpasang pada alat;
- informasi kamera dan hasil deteksi;
- peringatan atau kejadian penting;
- riwayat serta analitik data pemantauan; dan
- penjelasan informasi melalui RiverWatch AI.

RiverWatch hanya menampilkan data nyata setelah perangkat monitoring terhubung dengan Smart River dan sumber datanya telah dikonfigurasi. Website tidak menggunakan data demo sebagai pengganti data alat.

## Cara Smart River dan RiverWatch Bekerja Bersama

```text
Smart River di sungai
        ↓
Sensor, kamera, dan alat sistem kontrol alat
        ↓
Perangkat/gateway RiverWatch
        ↓
Server dan penyimpanan data
        ↓
Website RiverWatch
        ↓
Dashboard monitoring pengguna
```

Smart River melakukan pekerjaan fisik di sungai, sedangkan RiverWatch menerima, menyimpan, dan menyajikan informasi dari alat tersebut. Dengan pembagian ini, pengguna dapat memantau Smart River melalui satu dashboard yang ringkas tanpa mengganggu pekerjaan alat di lapangan.

## RiverWatch AI

RiverWatch AI adalah asisten di dalam website RiverWatch. Asisten ini membantu pengguna memahami Smart River, fungsi dashboard, arti parameter sensor, peringatan, dan informasi pemantauan lainnya. Bahasa jawaban menyesuaikan bahasa yang digunakan pengguna.

RiverWatch AI tidak menggantikan data dari perangkat. Jawaban terkait kondisi alat harus mengacu pada data nyata yang telah diterima RiverWatch.

## Teknologi Website

Website RiverWatch dikembangkan menggunakan:

- Next.js 15;
- React 19;
- TypeScript;
- Tailwind CSS;
- PostgreSQL; dan
- Botpress untuk RiverWatch AI.

## Menjalankan Website Secara Lokal

1. Pasang dependensi:

   ```bash
   npm install
   ```

2. Salin konfigurasi dari `.env.example` ke `.env`, lalu isi nilai yang diperlukan.

3. Jalankan development server:

   ```bash
   npm run dev
   ```

4. Buka `http://localhost:4028`.

## Integrasi Alat

Program alat berjalan pada Raspberry Pi, membaca telemetri ESP32 melalui UART
115200, dan menjalankan deteksi sampah dari kamera menggunakan model ONNX.
Integrasi utama menggunakan bridge lokal agar Raspberry Pi dapat mengirim data
keluar melalui HTTPS tanpa mengekspos Flask atau alamat jaringan lokal ke internet.

Model deteksi YOLO/ONNX untuk Raspberry Pi disimpan di
[`device/best.onnx`](device/best.onnx). Program `final v3.2.py` membaca model
di samping file Python (atau `device/best.onnx` ketika script dijalankan dari
root repository) secara default; lokasi lain dapat diberikan melalui
`SMART_RIVER_MODEL_PATH`.
Model ini berjalan di Raspberry Pi, bukan di-flash ke ESP32.

Untuk keselamatan saat instalasi awal, program Raspberry Pi berjalan dalam mode
monitoring aman (`SMART_RIVER_AUTONOMOUS=0`) secara default: kamera, AI, dan
telemetry tetap aktif tetapi aktuator dimatikan. Aktifkan mode otomatis hanya
setelah pengujian hardware selesai; panduan lengkap ada di
[`device/README.md`](device/README.md).

Alur data nyata:

```text
ESP32 dan kamera
        ↓
final v3.2.py pada Raspberry Pi
        ↓
RiverWatch bridge lokal
        ↓ HTTPS + Bearer token
POST /api/device dan /api/device/image
        ↓
PostgreSQL
        ↓
Dashboard RiverWatch
```

Konfigurasi server tersedia melalui variabel berikut:

```env
SMART_RIVER_MONITORING_URL=
SMART_RIVER_MONITORING_TOKEN=token-perangkat-yang-kuat
SMART_RIVER_SOURCE_ID=smart-river-hardware
SMART_RIVER_DEVICE_STALE_SECONDS=30
SMART_RIVER_IMAGE_MAX_BYTES=2000000
```

Biarkan `SMART_RIVER_MONITORING_URL` kosong untuk mode push. Terapkan migration `db/migrations/20260827000002_device_telemetry.sql`, kemudian ikuti panduan Raspberry Pi di [`device/README.md`](device/README.md). Sketch ESP32 tersedia di [`device/esp32_smart_river/esp32_smart_river.ino`](device/esp32_smart_river/esp32_smart_river.ino). Token dan kredensial asli tidak boleh disimpan di repositori.

Pemetaan GPIO ESP32 yang mengikuti wiring terbaru, baud UART Raspberry Pi
(`115200`), serta catatan pin strap GPIO0 dijelaskan di
[`device/README.md`](device/README.md). INA219 memakai GPIO22 khusus; L298N IN4
sudah dipindahkan ke GPIO0, yang memerlukan pull-up dan perhatian saat boot.

Dashboard menampilkan hanya parameter yang benar-benar tersedia dari alat: LDR, sensor air mentah, jarak objek, pompa, GPS, daya, mode robot, aksi, deteksi sampah, confidence, dan gambar terbaru. Parameter yang tidak diukur perangkat tidak diisi menggunakan angka demo.

### Model Smart River di dashboard

Dashboard menampilkan pratinjau visual tiga sudut dari model Smart River pada
`public/assets/images/smart-river/` ketika perangkat belum terhubung. Setelah
telemetri tersedia, bagian **Perangkat** memuat viewer WebGL interaktif dari
`public/assets/models/smart-river.glb`. Model dapat diputar dengan mouse atau
sentuhan dan diperbesar dengan roda/pinch; penanda komponen hanya ditampilkan
ketika sisi komponen menghadap kamera. Jika WebGL tidak tersedia, viewer otomatis
kembali ke pratinjau PNG.

Penanda dan kartu diagnostik membaca objek opsional `components` dari telemetri
alat: hijau untuk `ok`, merah untuk `error`, dan kuning untuk
`unknown`/diagnosis yang belum dapat dibuktikan. Sketch ESP32 mengirim status
`esp32`, `ina219`, `ajsn`, `gps`, `ldr`, `waterLevel`, `servo`, `l298n`,
`uln2003`, `led`, dan `buzzer`; Raspberry Pi menambahkan `camera` dan
`raspberryPi`. Alias operasional `distanceSensor`, `power`, `conveyor`, dan
`thruster` tetap dikirim agar firmware lama kompatibel. Perintah UART yang
berhasil diterima tidak otomatis dianggap sebagai bukti motor/servo bergerak
tanpa sensor arus, encoder, atau sensor posisi.

File `SR_MainAssembly.stp` adalah sumber CAD dan tidak dimuat langsung ke
browser. GLB yang ada di repositori merupakan hasil konversi dan optimasi satu
kali dari assembly tersebut (decoder Meshopt dimuat secara lazy hanya pada
dashboard perangkat yang terhubung).
