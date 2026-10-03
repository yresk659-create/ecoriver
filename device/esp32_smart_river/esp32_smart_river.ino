/*
 * EcoRiver - ESP32 controller
 *
 * Komunikasi dengan Raspberry Pi menggunakan JSON per baris (NDJSON) melalui
 * UART2. ESP32 mengirim telemetry secara berkala dan menerima command JSON dari
 * Raspberry Pi. Command teks lama (mis. "LEFT" atau "SERVO:90") juga diterima
 * agar proses migrasi firmware tidak memerlukan perubahan sekaligus.
 *
 * PERINGATAN WIRING
 * - Semua GPIO ESP32 hanya 3.3 V. Pasang voltage divider pada ECHO AJSN-SR04T
 *   bila modul mengeluarkan 5 V.
 * - Output analog LDR dan sensor level air juga tidak boleh melebihi 3.3 V;
 *   gunakan pembagi tegangan bila modul diberi catu 5 V.
 * - MG996S, motor L298N, dan ULN2003 harus memakai catu daya eksternal yang
 *   sesuai. Satukan GND catu daya dengan GND ESP32.
 * - INA219 memakai I2C (SDA/SCL 21/22 pada ESP32 Dev Module).
 * - Pin di bawah mengikuti pemetaan wiring EcoRiver yang diberikan setelah
 *   perbaikan: INA219 tetap memakai I2C 21/22, sedangkan L298N IN4 dipindah
 *   ke GPIO0. GPIO0 adalah pin strap BOOT; jangan biarkan rangkaian L298N
 *   menariknya LOW ketika ESP32 sedang reset atau masuk mode upload.
 * - GPIO 0, 2, 5, 12, dan 15 adalah pin strap boot; jangan biarkan modul eksternal
 *   menariknya ke level yang salah saat reset.
 */

#include <Arduino.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_INA219.h>
#include <TinyGPSPlus.h>
#include <ESP32Servo.h>

// ---------------------------------------------------------------------------
// Pin map - ESP32 Dev Module / WROOM-32
// EDIT bagian ini agar sesuai wiring EcoRiver sebelum perangkat diberi daya.
// ---------------------------------------------------------------------------

namespace Pins {
constexpr int PI_RX = 16;       // ESP32 RX2 <- Raspberry Pi TX
constexpr int PI_TX = 17;       // ESP32 TX2 -> Raspberry Pi RX
// 115200 keeps the full diagnostic JSON and control ACKs responsive. GPS has
// its own UART and remains at 9600 below.
constexpr uint32_t PI_BAUD = 115200;

constexpr int GPS_RX = 18;      // GPS TX -> ESP32 RX1
constexpr int GPS_TX = 19;      // GPS RX <- ESP32 TX (opsional)
constexpr uint32_t GPS_BAUD = 9600;

constexpr int I2C_SDA = 21;
constexpr int I2C_SCL = 22;

constexpr int AJSN_TRIG = 5;
constexpr int AJSN_ECHO = 15;   // gunakan divider jika ECHO = 5 V
constexpr int LDR = 34;         // ADC input-only
constexpr int WATER_LEVEL = 35; // ADC input-only

// L298N: dua channel untuk dua thruster/motor. IN4 dipindah ke GPIO0 agar
// GPIO22 dapat dipakai khusus sebagai I2C SCL INA219.
constexpr int L298_EN_A = 27;
constexpr int L298_IN1 = 25;
constexpr int L298_IN2 = 14;
constexpr int L298_EN_B = 12;
constexpr int L298_IN3 = 23;
constexpr int L298_IN4 = 0;

// Prevent an accidental bus fight if a future pin edit reintroduces an I2C /
// L298N overlap. With the corrected wiring above this evaluates to false.
constexpr bool INA219_L298_PIN_CONFLICT =
    I2C_SDA == L298_EN_A || I2C_SDA == L298_IN1 || I2C_SDA == L298_IN2 ||
    I2C_SDA == L298_EN_B || I2C_SDA == L298_IN3 || I2C_SDA == L298_IN4 ||
    I2C_SCL == L298_EN_A || I2C_SCL == L298_IN1 || I2C_SCL == L298_IN2 ||
    I2C_SCL == L298_EN_B || I2C_SCL == L298_IN3 || I2C_SCL == L298_IN4;

constexpr int SERVO = 32;

// Wiring yang diberikan hanya menyediakan satu jalur kontrol conveyor.
// Perlakukan sebagai enable/relay ULN2003; urutan empat fase stepper tidak
// dapat dikendalikan tanpa tiga jalur ULN tambahan.
constexpr int CONVEYOR = 33;

constexpr int LED_GREEN = 26;
constexpr int LED_RED = 2;
constexpr int PUMP = 4;
constexpr int BUZZER = 13;
}  // namespace Pins

// Telemetry membawa peta diagnosis lengkap (~2 KB). Pada UART 115200 paket
// selesai dikirim dalam waktu singkat sehingga dashboard dan kontrol tetap
// responsif tanpa antrean serial.
constexpr uint32_t TELEMETRY_INTERVAL_MS = 1000;
constexpr uint32_t SENSOR_INTERVAL_MS = 250;
constexpr uint32_t COMMAND_TIMEOUT_MS = 15000;
// The telemetry packet contains a diagnostic detail for every component.  It
// is commonly several kilobytes long, so the receive buffer must not truncate
// a valid JSON line before ArduinoJson can parse it.  Keep a little headroom
// beyond the 8 KiB telemetry document capacity.
constexpr size_t JSON_LINE_MAX = 8190;
// GPS perlu waktu untuk mulai mengirim NMEA dan mendapatkan fix.  Ketiadaan
// fix tidak langsung dianggap rusak karena dapat disebabkan posisi indoor atau
// cuaca; modul yang mengirim data tetapi belum fix akan berstatus `unknown`.
constexpr uint32_t GPS_DIAGNOSTIC_GRACE_MS = 10000;
constexpr uint32_t GPS_NO_DATA_ERROR_MS = 15000;
constexpr int SERVO_MIN_ANGLE = 0;
constexpr int SERVO_MAX_ANGLE = 180;
constexpr int WATER_ALERT_RAW = 3500;
constexpr float OBJECT_ALERT_DISTANCE_CM = 20.0f;

HardwareSerial PiSerial(2);
HardwareSerial GpsSerial(1);
Adafruit_INA219 ina219;
TinyGPSPlus gps;
Servo steeringServo;

enum class ComponentStatus : uint8_t {
  Ok,
  Error,
  Unknown,
};

struct ComponentHealth {
  ComponentStatus status = ComponentStatus::Unknown;
  String detail = "Belum ada diagnosis.";
};

struct RuntimeState {
  uint32_t sequence = 0;
  uint32_t lastCommandSequence = 0;
  unsigned long lastCommandAt = 0;
  unsigned long lastSensorAt = 0;
  unsigned long lastTelemetryAt = 0;

  String action = "BOOT";
  bool remote = false;
  bool pump = false;
  bool trash = false;
  float confidence = 0.0f;
  int servoAngle = 90;
  int leftMotor = 0;
  int rightMotor = 0;
  bool conveyorRunning = false;

  int ldr = 0;
  int water = 0;
  float distanceCm = 999.0f;
  float voltage = 0.0f;
  float current = 0.0f;
  float power = 0.0f;
  double latitude = 0.0;
  double longitude = 0.0;
  double speedKmh = 0.0;
  uint32_t satellites = 0;
  bool gpsFix = false;
  bool distanceValid = false;
  bool inaReady = false;
  bool powerValid = false;
};

RuntimeState state;
ComponentHealth esp32Health;
ComponentHealth ina219Health;
ComponentHealth ajsnHealth;
ComponentHealth gpsHealth;
ComponentHealth ldrHealth;
ComponentHealth waterLevelHealth;
ComponentHealth servoHealth;
ComponentHealth l298nHealth;
ComponentHealth uln2003Health;
ComponentHealth ledHealth;
ComponentHealth buzzerHealth;
ComponentHealth distanceHealth;
ComponentHealth powerHealth;
ComponentHealth conveyorHealth;
ComponentHealth thrusterHealth;

String piLineBuffer;
String usbLineBuffer;
unsigned long lastIndicatorAt = 0;
unsigned long lastBeepAt = 0;
bool indicatorLedState = false;
bool servoAttached = false;
bool outputsConfigured = false;
bool conveyorOutputConfigured = false;
unsigned long gpsStartedAt = 0;
unsigned long lastGpsByteAt = 0;
uint32_t gpsBytesSeen = 0;

const char* statusName(ComponentStatus status) {
  switch (status) {
    case ComponentStatus::Ok:
      return "ok";
    case ComponentStatus::Error:
      return "error";
    default:
      return "unknown";
  }
}

void setHealth(ComponentHealth& health, ComponentStatus status, const String& detail) {
  health.status = status;
  health.detail = detail;
}

void writeHealth(JsonObject parent, const char* name, const ComponentHealth& health) {
  JsonObject item = parent[name].to<JsonObject>();
  item["status"] = statusName(health.status);
  item["detail"] = health.detail;
}

void writeAllComponentHealth(JsonObject components) {
  // Kamera dan Raspberry Pi didiagnosis oleh proses Python di Raspberry Pi.
  // Keduanya sengaja tidak ditulis di sini agar status lokal tidak menimpa
  // hasil diagnosis kamera/Pi yang lebih akurat.
  writeHealth(components, "esp32", esp32Health);
  writeHealth(components, "ina219", ina219Health);
  writeHealth(components, "ajsn", ajsnHealth);
  writeHealth(components, "gps", gpsHealth);
  writeHealth(components, "ldr", ldrHealth);
  writeHealth(components, "waterLevel", waterLevelHealth);
  writeHealth(components, "servo", servoHealth);
  writeHealth(components, "l298n", l298nHealth);
  writeHealth(components, "uln2003", uln2003Health);
  writeHealth(components, "led", ledHealth);
  writeHealth(components, "buzzer", buzzerHealth);

  // Nama alias ini dipertahankan agar dashboard dan bridge lama tetap dapat
  // menampilkan status sensor/aktuator yang sama.
  writeHealth(components, "distanceSensor", distanceHealth);
  writeHealth(components, "power", powerHealth);
  writeHealth(components, "conveyor", conveyorHealth);
  writeHealth(components, "thruster", thrusterHealth);
}

void writeCommandHealth(JsonObject components, const String& command) {
  writeHealth(components, "esp32", esp32Health);

  String normalized = command;
  normalized.toUpperCase();
  if (normalized.startsWith("SERVO:") || normalized == "SET_SERVO") {
    writeHealth(components, "servo", servoHealth);
  }
  if (normalized == "FORWARD" || normalized == "FORWARD_SLOW" ||
      normalized == "BACKWARD" || normalized == "REVERSE" || normalized == "BACK" ||
      normalized == "LEFT" || normalized == "RIGHT" ||
      normalized == "STOP" || normalized == "PATROL" ||
      normalized == "SET_MOTORS") {
    writeHealth(components, "l298n", l298nHealth);
    writeHealth(components, "thruster", thrusterHealth);
  }
  if (normalized == "CONVEYOR_ON" || normalized == "CONVEYOR_OFF") {
    writeHealth(components, "uln2003", uln2003Health);
    writeHealth(components, "conveyor", conveyorHealth);
  }
}

template <typename T>
void sendJson(Stream& stream, const T& document) {
  serializeJson(document, stream);
  stream.println();
}

void sendAck(uint32_t requestSequence, const String& command, bool accepted, const String& reason) {
  // ACK dibuat ringkas karena Raspberry Pi dapat mengirim command berkala.
  // Telemetry satu kali per detik membawa seluruh peta diagnostik.
  // ArduinoJson 7 grows JsonDocument on the heap. Avoid placing a large
  // temporary document on the ESP32 loop-task stack.
  JsonDocument document;
  document["type"] = "ack";
  document["seq"] = requestSequence;
  document["command"] = command;
  document["accepted"] = accepted;
  if (reason.length() > 0) document["reason"] = reason;

  JsonObject components = document["components"].to<JsonObject>();
  writeCommandHealth(components, command);

  sendJson(PiSerial, document);
  // Mirror ACK ke USB untuk debugging di Serial Monitor.
  sendJson(Serial, document);
}

void setMotor(int enablePin, int inA, int inB, int speed) {
  speed = constrain(speed, -255, 255);

  if (speed > 0) {
    digitalWrite(inA, HIGH);
    digitalWrite(inB, LOW);
  } else if (speed < 0) {
    digitalWrite(inA, LOW);
    digitalWrite(inB, HIGH);
  } else {
    digitalWrite(inA, LOW);
    digitalWrite(inB, LOW);
  }

  analogWrite(enablePin, abs(speed));
}

void setThrusters(int leftSpeed, int rightSpeed) {
  state.leftMotor = constrain(leftSpeed, -255, 255);
  state.rightMotor = constrain(rightSpeed, -255, 255);

  setMotor(Pins::L298_EN_A, Pins::L298_IN1, Pins::L298_IN2, state.leftMotor);
  setMotor(Pins::L298_EN_B, Pins::L298_IN3, Pins::L298_IN4, state.rightMotor);

  if (outputsConfigured) {
    setHealth(l298nHealth, ComponentStatus::Unknown,
              "Output L298N diterapkan; tanpa sensor arus atau encoder, gerak fisik belum dapat diverifikasi.");
    setHealth(thrusterHealth, ComponentStatus::Unknown,
              "Perintah thruster diterima; tanpa sensor umpan balik, gerak fisik belum dapat diverifikasi.");
  }
}

void stopThrusters() {
  setThrusters(0, 0);
}

void setConveyorOutputs(uint8_t pattern) {
  // The supplied wiring exposes one conveyor control line (GPIO33), not the
  // four phase inputs of a stepper. Keep the API byte-shaped for compatibility
  // with existing command handling, but drive it as a simple enable signal.
  if (conveyorOutputConfigured) digitalWrite(Pins::CONVEYOR, pattern ? HIGH : LOW);
}

void stopConveyor() {
  state.conveyorRunning = false;
  setConveyorOutputs(0);
  if (conveyorOutputConfigured) {
    setHealth(uln2003Health, ComponentStatus::Unknown,
              "Output ULN2003 dihentikan; tanpa sensor arus/posisi, kondisi motor belum dapat diverifikasi.");
    setHealth(conveyorHealth, ComponentStatus::Unknown,
              "Conveyor berhenti; tanpa sensor umpan balik, kondisi mekanis belum dapat diverifikasi.");
  }
}

void startConveyor() {
  state.conveyorRunning = true;
  setConveyorOutputs(1);
  setHealth(uln2003Health, ComponentStatus::Unknown,
            "Perintah ULN2003 diterima melalui jalur enable; tanpa sensor arus/posisi, putaran motor belum dapat diverifikasi.");
  setHealth(conveyorHealth, ComponentStatus::Unknown,
            "Perintah diterima; belum ada umpan balik motor conveyor.");
}

void updateConveyor() {
  // No step sequence can be generated from the single GPIO33 control line.
  // Keep the output latched until CONVEYOR_OFF or the safety watchdog.
}

void setPump(bool enabled) {
  state.pump = enabled;
  if (outputsConfigured) digitalWrite(Pins::PUMP, enabled ? HIGH : LOW);
}

void setServoAngle(int angle) {
  state.servoAngle = constrain(angle, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE);
  if (!servoAttached) {
    setHealth(servoHealth, ComponentStatus::Error,
              "Servo tidak berhasil di-attach pada GPIO yang dikonfigurasi.");
    return;
  }
  steeringServo.write(state.servoAngle);
  setHealth(servoHealth, ComponentStatus::Unknown,
            "Sudut servo diterapkan; servo ini tidak memiliki sensor posisi untuk verifikasi fisik.");
}

bool applyCommand(String command, JsonDocument& document, String& reason) {
  command.trim();
  command.toUpperCase();
  if (command.length() == 0) {
    reason = "Perintah kosong.";
    return false;
  }

  state.action = command;

  if (command.startsWith("SERVO:")) {
    const int separator = command.indexOf(':');
    const int angle = command.substring(separator + 1).toInt();
    setServoAngle(angle);
    return true;
  }

  if (command == "FORWARD" || command == "PATROL") {
    setThrusters(220, 220);
    state.action = command;
    setHealth(thrusterHealth, ComponentStatus::Unknown,
              "Perintah gerak diterima; belum ada sensor umpan balik thruster.");
    return true;
  }
  if (command == "FORWARD_SLOW") {
    setThrusters(135, 135);
    state.action = command;
    setHealth(thrusterHealth, ComponentStatus::Unknown,
              "Perintah gerak diterima; belum ada sensor umpan balik thruster.");
    return true;
  }
  if (command == "BACKWARD" || command == "REVERSE" || command == "BACK") {
    setThrusters(-170, -170);
    state.action = command;
    setHealth(thrusterHealth, ComponentStatus::Unknown,
              "Perintah mundur diterima; belum ada sensor umpan balik thruster.");
    return true;
  }
  if (command == "LEFT") {
    setThrusters(70, 210);
    state.action = command;
    setHealth(thrusterHealth, ComponentStatus::Unknown,
              "Perintah belok kiri diterima; belum ada sensor umpan balik thruster.");
    return true;
  }
  if (command == "RIGHT") {
    setThrusters(210, 70);
    state.action = command;
    setHealth(thrusterHealth, ComponentStatus::Unknown,
              "Perintah belok kanan diterima; belum ada sensor umpan balik thruster.");
    return true;
  }
  if (command == "STOP") {
    stopThrusters();
    state.action = command;
    return true;
  }
  if (command == "CONVEYOR_ON") {
    startConveyor();
    return true;
  }
  if (command == "CONVEYOR_OFF") {
    stopConveyor();
    state.action = command;
    return true;
  }
  if (command == "REMOTE_ON") {
    state.remote = true;
    stopThrusters();
    stopConveyor();
    setPump(false);
    state.action = "REMOTE";
    return true;
  }
  if (command == "REMOTE_OFF" || command == "AUTO") {
    state.remote = false;
    state.action = "AUTO";
    return true;
  }
  if (command == "PUMP_ON" || command == "PUMP_OFF") {
    setPump(command == "PUMP_ON");
    return true;
  }
  if (command == "BEEP") {
    tone(Pins::BUZZER, 2500, 200);
    return true;
  }
  if (command == "SET_MOTORS") {
    const int left = document["leftMotor"] | 0;
    const int right = document["rightMotor"] | 0;
    setThrusters(left, right);
    setHealth(thrusterHealth, ComponentStatus::Unknown,
              "Kecepatan motor diterapkan; belum ada sensor umpan balik thruster.");
    return true;
  }
  if (command == "SET_SERVO") {
    setServoAngle(document["servo"] | 90);
    return true;
  }

  reason = "Perintah tidak dikenal.";
  return false;
}

void processLine(String line) {
  line.trim();
  if (line.length() == 0) return;

  JsonDocument document;
  DeserializationError error = deserializeJson(document, line);
  uint32_t requestSequence = 0;
  String command;

  if (!error) {
    requestSequence = document["seq"] | 0U;
    if (document["command"].is<const char*>()) {
      command = document["command"].as<const char*>();
    } else if (document["cmd"].is<const char*>()) {
      command = document["cmd"].as<const char*>();
    }
  } else {
    // Kompatibilitas dengan firmware Raspberry Pi lama yang mengirim teks.
    command = line;
  }

  if (command.length() == 0) return;

  String reason;
  const bool accepted = applyCommand(command, document, reason);
  // Hanya command yang benar-benar diterapkan yang memperpanjang watchdog.
  // Paket JSON rusak/tidak dikenal tidak boleh menahan SAFE_STOP.
  if (accepted) state.lastCommandAt = millis();
  state.lastCommandSequence = requestSequence;
  sendAck(requestSequence, command, accepted, reason);
}

void pollJsonStream(Stream& stream, String& buffer) {
  while (stream.available() > 0) {
    const char character = static_cast<char>(stream.read());
    if (character == '\n') {
      processLine(buffer);
      buffer = "";
      continue;
    }
    if (character == '\r') continue;
    if (buffer.length() < JSON_LINE_MAX) {
      buffer += character;
    } else {
      // Discard an overlong/malformed line rather than retaining a partial
      // command that could be applied after a later newline.
      buffer = "";
    }
  }
}

float readDistanceCm(bool& valid) {
  digitalWrite(Pins::AJSN_TRIG, LOW);
  delayMicroseconds(3);
  digitalWrite(Pins::AJSN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(Pins::AJSN_TRIG, LOW);

  const unsigned long duration = pulseIn(Pins::AJSN_ECHO, HIGH, 30000UL);
  if (duration == 0) {
    valid = false;
    return 999.0f;
  }

  const float distance = static_cast<float>(duration) * 0.0343f / 2.0f;
  valid = distance >= 2.0f && distance <= 600.0f;
  return valid ? distance : 999.0f;
}

void readGps() {
  while (GpsSerial.available() > 0) {
    gps.encode(static_cast<char>(GpsSerial.read()));
    ++gpsBytesSeen;
    lastGpsByteAt = millis();
  }

  const unsigned long now = millis();
  const bool gpsStreamRecent = gpsBytesSeen > 0 &&
                               now - lastGpsByteAt <= GPS_NO_DATA_ERROR_MS;
  // TinyGPSPlus keeps the last fix marked valid after the receiver stops
  // transmitting.  Expose `gpsFix` only while both the NMEA stream and the
  // fix itself are fresh, so the dashboard cannot mistake stale coordinates
  // for a live position.
  const bool fixRecent = gps.location.isValid() &&
                         gps.location.age() <= GPS_NO_DATA_ERROR_MS;
  state.gpsFix = fixRecent && gpsStreamRecent;
  if (state.gpsFix) {
    state.latitude = gps.location.lat();
    state.longitude = gps.location.lng();
  }
  state.speedKmh = gps.speed.isValid() ? gps.speed.kmph() : 0.0;
  state.satellites = gps.satellites.isValid() ? gps.satellites.value() : 0;

  if (state.gpsFix && gpsStreamRecent) {
    setHealth(gpsHealth, ComponentStatus::Ok,
              "GPS mengirim koordinat valid dan mendapatkan fix.");
  } else if (gpsBytesSeen > 0 && !gpsStreamRecent) {
    setHealth(gpsHealth, ComponentStatus::Error,
              "Data NMEA GPS berhenti; periksa kabel dan catu daya modul GPS.");
  } else if (gpsBytesSeen > 0) {
    setHealth(gpsHealth, ComponentStatus::Unknown,
              "GPS mengirim data, tetapi belum mendapatkan fix satelit.");
  } else if (now - gpsStartedAt >= GPS_NO_DATA_ERROR_MS) {
    setHealth(gpsHealth, ComponentStatus::Error,
              "Tidak ada data NMEA dari GPS; periksa kabel TX, GND, catu daya, dan baud rate.");
  } else if (now - gpsStartedAt >= GPS_DIAGNOSTIC_GRACE_MS) {
    setHealth(gpsHealth, ComponentStatus::Unknown,
              "Menunggu data NMEA pertama dari GPS.");
  }
}

void updateAnalogHealth(int rawValue, ComponentHealth& health, const char* label) {
  if (rawValue < 0 || rawValue > 4095) {
    setHealth(health, ComponentStatus::Error,
              String(label) + " menghasilkan nilai ADC di luar rentang ESP32.");
    return;
  }

  // Nilai tepat di rail ADC dapat berarti kondisi nyata (gelap/air penuh),
  // tetapi juga dapat terjadi karena kabel putus atau short. Tanpa resistor
  // diagnostik, tampilkan sebagai unknown agar website tidak mengklaim sensor
  // sehat secara keliru.
  if (rawValue == 0 || rawValue >= 4095) {
    setHealth(health, ComponentStatus::Unknown,
              String(label) + " membaca batas ADC; kabel/saturasi belum dapat dibedakan tanpa rangkaian diagnostik.");
    return;
  }

  setHealth(health, ComponentStatus::Ok,
            String(label) + " mengirim pembacaan ADC terbaru.");
}

void readSensors() {
  state.ldr = analogRead(Pins::LDR);
  state.water = analogRead(Pins::WATER_LEVEL);
  state.distanceCm = readDistanceCm(state.distanceValid);

  updateAnalogHealth(state.ldr, ldrHealth, "LDR");
  updateAnalogHealth(state.water, waterLevelHealth, "Sensor level air");

  if (state.distanceValid) {
    setHealth(distanceHealth, ComponentStatus::Ok,
              "Sensor jarak mengirim pembacaan terbaru.");
    setHealth(ajsnHealth, ComponentStatus::Ok,
              "AJSN-SR04T mengirim echo dan pembacaan jarak terbaru.");
  } else {
    setHealth(distanceHealth, ComponentStatus::Error,
              "Sensor jarak tidak mengirim echo yang valid.");
    setHealth(ajsnHealth, ComponentStatus::Error,
              "AJSN-SR04T tidak mengirim echo yang valid atau berada di luar rentang ukur.");
  }

  if constexpr (Pins::INA219_L298_PIN_CONFLICT) {
    // A shared I2C/L298N GPIO would corrupt both the bus and motor direction.
    // Report the conflict and leave INA219 values neutral until the physical
    // wiring is corrected.
    state.inaReady = false;
    state.voltage = 0.0f;
    state.current = 0.0f;
    state.power = 0.0f;
    state.powerValid = false;
    setHealth(powerHealth, ComponentStatus::Error,
              "INA219 dinonaktifkan: GPIO I2C bertabrakan dengan pin L298N. Perbaiki wiring terlebih dahulu.");
    setHealth(ina219Health, ComponentStatus::Error,
              "Konflik pin: jalur I2C dan L298N memakai GPIO yang sama.");
  } else {
    // Probe the I2C address on every sensor cycle. `begin()` only checks the
    // device at boot; without this probe a disconnected INA219 could remain
    // reported as healthy forever, and a module reconnected later could never
    // recover. Re-run begin() when the device comes back so its calibration is
    // restored.
    Wire.beginTransmission(0x40);
    const bool inaPresent = Wire.endTransmission() == 0;
    if (!inaPresent) {
      state.inaReady = false;
    } else if (!state.inaReady) {
      state.inaReady = ina219.begin();
    }

    if (state.inaReady) {
      state.voltage = ina219.getBusVoltage_V();
      state.current = ina219.getCurrent_mA();
      state.power = state.voltage * state.current / 1000.0f;
      // A zero-volt bus is a valid electrical reading when the monitored load
      // is unpowered. It must not make the INA219 itself appear broken.
      state.powerValid = isfinite(state.voltage) && state.voltage >= 0.0f &&
                         isfinite(state.current) && isfinite(state.power);
    } else {
      state.voltage = 0.0f;
      state.current = 0.0f;
      state.power = 0.0f;
      state.powerValid = false;
    }

    const bool busPowered = state.powerValid && state.voltage > 0.0f;
    setHealth(powerHealth,
              state.powerValid
                  ? (busPowered ? ComponentStatus::Ok : ComponentStatus::Unknown)
                  : ComponentStatus::Error,
              state.powerValid
                  ? (busPowered
                         ? "INA219 mengirim pembacaan daya terbaru."
                         : "INA219 terdeteksi, tetapi bus yang dipantau sedang 0 V.")
                  : "INA219 tidak tersedia atau pembacaan daya tidak valid.");
    setHealth(ina219Health, state.powerValid ? ComponentStatus::Ok : ComponentStatus::Error,
              state.powerValid
                  ? "INA219 mengirim pembacaan tegangan, arus, dan daya terbaru."
                  : "INA219 tidak tersedia atau pembacaan tegangan/arus tidak valid.");
  }
  readGps();
}

void sendTelemetry() {
  // Semua komponen (termasuk alias kompatibilitas) membawa status dan detail;
  // sisakan ruang agar serializeJson tidak terpotong ketika seluruh peta hadir.
  // The complete diagnostic map is several kilobytes. Keeping this document
  // off the loop-task stack prevents a telemetry cycle from exhausting it.
  JsonDocument document;
  document["type"] = "telemetry";
  document["schemaVersion"] = 1;
  document["device"] = "esp32";
  document["seq"] = ++state.sequence;
  document["ldr"] = state.ldr;
  document["water"] = state.water;
  document["waterLevelPercent"] = (static_cast<float>(state.water) / 4095.0f) * 100.0f;
  document["distance"] = state.distanceCm;
  document["jarak"] = state.distanceCm;
  document["pump"] = state.pump;
  document["pompa"] = state.pump;
  document["lat"] = state.latitude;
  document["lng"] = state.longitude;
  document["speed"] = state.speedKmh;
  document["satelit"] = state.satellites;
  document["gpsFix"] = state.gpsFix;
  document["voltage"] = state.voltage;
  document["current"] = state.current;
  document["power"] = state.power;
  document["remote"] = state.remote;
  document["action"] = state.action;
  document["trash"] = state.trash;
  document["confidence"] = state.confidence;
  document["servo"] = state.servoAngle;
  document["leftMotor"] = state.leftMotor;
  document["rightMotor"] = state.rightMotor;
  document["conveyorRunning"] = state.conveyorRunning;

  JsonObject components = document["components"].to<JsonObject>();
  writeAllComponentHealth(components);

  sendJson(PiSerial, document);
  // Aktifkan output USB agar telemetry bisa diperiksa lewat Serial Monitor.
  sendJson(Serial, document);
}

void updateIndicators() {
  const unsigned long now = millis();
  const bool hasError = esp32Health.status == ComponentStatus::Error ||
                        ina219Health.status == ComponentStatus::Error ||
                        ajsnHealth.status == ComponentStatus::Error ||
                        gpsHealth.status == ComponentStatus::Error ||
                        ldrHealth.status == ComponentStatus::Error ||
                        waterLevelHealth.status == ComponentStatus::Error ||
                        servoHealth.status == ComponentStatus::Error ||
                        l298nHealth.status == ComponentStatus::Error ||
                        uln2003Health.status == ComponentStatus::Error ||
                        distanceHealth.status == ComponentStatus::Error ||
                        powerHealth.status == ComponentStatus::Error ||
                        thrusterHealth.status == ComponentStatus::Error ||
                        conveyorHealth.status == ComponentStatus::Error;
  const unsigned long interval = hasError ? 180UL : 700UL;

  if (hasError) {
    if (now - lastIndicatorAt >= interval) {
      lastIndicatorAt = now;
      indicatorLedState = !indicatorLedState;
      digitalWrite(Pins::LED_RED, indicatorLedState ? HIGH : LOW);
      digitalWrite(Pins::LED_GREEN, LOW);
    }
  } else {
    // A steady green light means the firmware loop is healthy. The red LED is
    // kept off until a component reports an error.
    indicatorLedState = true;
    digitalWrite(Pins::LED_GREEN, HIGH);
    digitalWrite(Pins::LED_RED, LOW);
  }

  const bool alert = state.water >= WATER_ALERT_RAW ||
                     (state.distanceValid && state.distanceCm <= OBJECT_ALERT_DISTANCE_CM);
  if (alert && now - lastBeepAt >= 5000UL) {
    lastBeepAt = now;
    tone(Pins::BUZZER, 2200, 120);
  }
}

void setupPins() {
  pinMode(Pins::AJSN_TRIG, OUTPUT);
  pinMode(Pins::AJSN_ECHO, INPUT);
  pinMode(Pins::LDR, INPUT);
  pinMode(Pins::WATER_LEVEL, INPUT);
  pinMode(Pins::L298_EN_A, OUTPUT);
  digitalWrite(Pins::L298_EN_A, LOW);
  pinMode(Pins::L298_IN1, OUTPUT);
  pinMode(Pins::L298_IN2, OUTPUT);
  // GPIO0 is sampled by the ROM bootloader. Give the L298N direction input a
  // pull-up first, hold the enable line LOW, then take ownership as an output
  // so the motor cannot be enabled while the ESP32 is starting.
  pinMode(Pins::L298_IN4, INPUT_PULLUP);
  pinMode(Pins::L298_EN_B, OUTPUT);
  digitalWrite(Pins::L298_EN_B, LOW);
  pinMode(Pins::L298_IN3, OUTPUT);
  pinMode(Pins::L298_IN4, OUTPUT);
  digitalWrite(Pins::L298_IN4, LOW);
  pinMode(Pins::CONVEYOR, OUTPUT);
  pinMode(Pins::PUMP, OUTPUT);
  pinMode(Pins::LED_GREEN, OUTPUT);
  pinMode(Pins::LED_RED, OUTPUT);
  pinMode(Pins::BUZZER, OUTPUT);

  analogReadResolution(12);
  analogSetPinAttenuation(Pins::LDR, ADC_11db);
  analogSetPinAttenuation(Pins::WATER_LEVEL, ADC_11db);

  stopThrusters();
  stopConveyor();
  digitalWrite(Pins::CONVEYOR, LOW);
  digitalWrite(Pins::PUMP, LOW);
  digitalWrite(Pins::LED_GREEN, LOW);
  digitalWrite(Pins::LED_RED, LOW);
}

void setup() {
  Serial.begin(115200);
  delay(150);

  setupPins();
  outputsConfigured = true;
  conveyorOutputConfigured = true;
  if constexpr (Pins::L298_IN4 == 0) {
    Serial.println(F("PERINGATAN: L298N IN4 memakai GPIO0 (BOOT); pastikan pull-up 10k dan ENB LOW saat reset."));
  }
  PiSerial.begin(Pins::PI_BAUD, SERIAL_8N1, Pins::PI_RX, Pins::PI_TX);
  GpsSerial.begin(Pins::GPS_BAUD, SERIAL_8N1, Pins::GPS_RX, Pins::GPS_TX);
  gpsStartedAt = millis();

  if constexpr (Pins::INA219_L298_PIN_CONFLICT) {
    Serial.println(F("PERINGATAN: jalur I2C dan L298N berbagi GPIO; INA219 dinonaktifkan."));
    state.inaReady = false;
    setHealth(powerHealth, ComponentStatus::Error,
              "INA219 dinonaktifkan karena konflik GPIO dengan L298N.");
    setHealth(ina219Health, ComponentStatus::Error,
              "Pindahkan kabel I2C SCL atau L298N IN4, lalu ubah konstanta Pins.");
  } else {
    Wire.begin(Pins::I2C_SDA, Pins::I2C_SCL);
    state.inaReady = ina219.begin();
    if (!state.inaReady) {
      setHealth(powerHealth, ComponentStatus::Error,
                "INA219 tidak ditemukan pada alamat I2C default 0x40.");
      setHealth(ina219Health, ComponentStatus::Error,
                "INA219 tidak ditemukan pada alamat I2C default 0x40.");
    } else {
      setHealth(ina219Health, ComponentStatus::Unknown,
                "INA219 terdeteksi; menunggu pembacaan pertama.");
      setHealth(powerHealth, ComponentStatus::Unknown,
                "INA219 terdeteksi; menunggu pembacaan daya pertama.");
    }
  }

  steeringServo.setPeriodHertz(50);
  // ESP32Servo::attach() returns the PWM channel number, not a boolean.  A
  // successful first attach commonly returns channel 0, which evaluates to
  // false if assigned directly to `servoAttached`.
  steeringServo.attach(Pins::SERVO, 500, 2500);
  servoAttached = steeringServo.attached();
  if (servoAttached) {
    setHealth(servoHealth, ComponentStatus::Unknown,
              "Servo terpasang pada GPIO; tidak ada sensor posisi untuk verifikasi fisik.");
  } else {
    setHealth(servoHealth, ComponentStatus::Error,
              "Servo gagal di-attach pada GPIO yang dikonfigurasi.");
  }
  setServoAngle(90);

  state.lastCommandAt = millis();
  state.lastSensorAt = millis() - SENSOR_INTERVAL_MS;
  state.lastTelemetryAt = millis() - TELEMETRY_INTERVAL_MS;
  setHealth(esp32Health, ComponentStatus::Ok,
            "ESP32 aktif dan firmware EcoRiver berjalan.");
  setHealth(ajsnHealth, ComponentStatus::Unknown,
            "Menunggu echo pertama dari AJSN-SR04T.");
  setHealth(ldrHealth, ComponentStatus::Unknown,
            "Menunggu pembacaan ADC pertama dari LDR.");
  setHealth(waterLevelHealth, ComponentStatus::Unknown,
            "Menunggu pembacaan ADC pertama dari sensor level air.");
  setHealth(gpsHealth, ComponentStatus::Unknown,
            "Menunggu data NMEA pertama dari GPS.");
  setHealth(l298nHealth, ComponentStatus::Unknown,
            "GPIO L298N dikonfigurasi; tanpa sensor arus/encoder, gerak motor belum dapat diverifikasi.");
  setHealth(uln2003Health, ComponentStatus::Unknown,
            "GPIO ULN2003 dikonfigurasi; tanpa sensor arus/posisi, putaran motor belum dapat diverifikasi.");
  setHealth(ledHealth, ComponentStatus::Unknown,
            "GPIO LED dikonfigurasi; output LED tidak memiliki umpan balik listrik.");
  setHealth(buzzerHealth, ComponentStatus::Unknown,
            "GPIO buzzer dikonfigurasi; output buzzer tidak memiliki umpan balik listrik.");
  setHealth(conveyorHealth, ComponentStatus::Unknown,
            "Belum ada kanal umpan balik motor conveyor.");
  setHealth(thrusterHealth, ComponentStatus::Unknown,
            "Belum ada kanal umpan balik thruster.");

  Serial.println(F("EcoRiver ESP32 siap; UART Raspberry Pi = 115200 baud"));
}

void loop() {
  pollJsonStream(PiSerial, piLineBuffer);
  pollJsonStream(Serial, usbLineBuffer);
  readGps();

  const unsigned long now = millis();
  if (now - state.lastSensorAt >= SENSOR_INTERVAL_MS) {
    state.lastSensorAt = now;
    readSensors();
  }

  if (now - state.lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
    state.lastTelemetryAt = now;
    sendTelemetry();
  }

  if (state.lastCommandAt > 0 && now - state.lastCommandAt > COMMAND_TIMEOUT_MS) {
    // The watchdog must also turn off a pump that was enabled by a command;
    // otherwise a lost UART link could leave the pump running indefinitely
    // even when the thrusters and conveyor are already stopped.
    if (state.leftMotor != 0 || state.rightMotor != 0 || state.conveyorRunning ||
        state.pump) {
      stopThrusters();
      stopConveyor();
      setPump(false);
      state.action = "SAFE_STOP";
    }
  }

  updateConveyor();
  updateIndicators();
  delay(2);
}
