import 'server-only';

import { z } from 'zod';
import type {
  AIDetection,
  RiverAlert,
  SensorReading,
  SmartRiverComponentHealthMap,
  SmartRiverDeviceState,
  WaterLevelDataPoint,
  WaterQualityDataPoint,
} from '@/lib/types';
import {
  configuredDeviceId,
  deviceStaleAfterMs,
  normalizeDeviceTelemetry,
  readStoredDeviceMonitoring,
} from './device-monitoring';

type HardwareMode = 'hardware' | 'unavailable';

export interface MonitoringDataSource {
  id: string;
  mode: HardwareMode;
  connectedToHardware: boolean;
  description: string;
}

export interface MonitoringRepositoryResult<T> {
  source: MonitoringDataSource;
  timestamp: string;
  data: T;
}

export interface MonitoringDevice {
  id: string;
  stationId: string;
  stationName: string;
  sensorStatus: SensorReading['sensorStatus'];
  riverStatus: SensorReading['status'];
  battery: number;
  lastUpdated: string;
}

export interface MonitoringCamera {
  id: string;
  name: string;
  locations: string[];
  detectionCount: number;
  lastDetectionAt?: string;
  detectedObjectTypes: string[];
  connectivity: 'online' | 'offline' | 'unknown';
}

export interface WaterLevelRecord {
  stationId: string;
  stationName: string;
  waterLevel: number | null;
  sensorStatus: SensorReading['sensorStatus'];
  lastUpdated: string;
  unavailableReason?: string;
}

export interface WaterLevelReport {
  records: WaterLevelRecord[];
  history: WaterLevelDataPoint[];
}

export interface WaterQualityReport {
  station: Pick<SensorReading, 'stationId' | 'stationName'> | null;
  readings: WaterQualityDataPoint[];
}

export interface CurrentMonitoringData {
  sensors: SensorReading[];
  devices: MonitoringDevice[];
  cameras: MonitoringCamera[];
  alerts: RiverAlert[];
  waterLevel: WaterLevelReport;
  waterQuality: WaterQualityReport;
  objectDetections: AIDetection[];
  deviceState: SmartRiverDeviceState | null;
}

export interface AssistantResponse {
  answer: string;
  sources: string[];
  timestamp: string;
}

const assistantHistoryEntrySchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const assistantRequestSchema = z
  .object({
    message: z.string().trim().min(1, 'Pesan tidak boleh kosong.').max(1_000, 'Pesan maksimal 1000 karakter.'),
    history: z.array(assistantHistoryEntrySchema).max(12, 'Riwayat percakapan terlalu panjang.').optional(),
  })
  .strict();

export class AssistantServiceError extends Error {
  constructor(
    public readonly kind: 'configuration' | 'unavailable',
    message: string
  ) {
    super(message);
    this.name = 'AssistantServiceError';
  }
}

const riverStatuses = new Set<SensorReading['status']>(['Normal', 'Watch', 'Warning', 'Critical']);
const sensorStatuses = new Set<SensorReading['sensorStatus']>(['Online', 'Offline', 'Warning']);
const alertSeverities = new Set<RiverAlert['severity']>(['info', 'warning', 'critical']);

function nonEmptyEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (
    !value ||
    /^(your-|replace-|dummy|example|placeholder)/i.test(value) ||
    /^(token[_-]?acak|ganti[-_]dengan|alamat[-_]gateway[-_]anda)/i.test(value)
  ) return undefined;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

const componentHealthKeys: (keyof SmartRiverComponentHealthMap)[] = [
  'camera',
  'esp32',
  'ina219',
  'ajsn',
  'gps',
  'ldr',
  'waterLevel',
  'servo',
  'l298n',
  'uln2003',
  'led',
  'buzzer',
  'distanceSensor',
  'conveyor',
  'power',
  'thruster',
  'raspberryPi',
];

/** Keep pull integrations as defensive as the push API. */
function parseComponentHealth(value: unknown): SmartRiverComponentHealthMap | undefined {
  if (!isRecord(value)) return undefined;
  const parsed: SmartRiverComponentHealthMap = {};
  for (const key of componentHealthKeys) {
    const item = value[key];
    if (!isRecord(item)) continue;
    const status = asString(item.status);
    if (status !== 'ok' && status !== 'error' && status !== 'unknown') continue;
    const detail = asString(item.detail);
    const checkedAt = asString(item.checkedAt);
    parsed[key] = {
      status,
      ...(detail ? { detail: detail.slice(0, 240) } : {}),
      ...(checkedAt ? { checkedAt } : {}),
    };
  }
  return Object.keys(parsed).length > 0 ? parsed : undefined;
}

function pullTelemetryAliases(value: Record<string, unknown>, deviceId: string): Record<string, unknown> {
  const pick = (...keys: string[]): unknown => {
    for (const key of keys) {
      if (value[key] !== undefined) return value[key];
    }
    return undefined;
  };
  const components = pick('components', 'componentHealth');
  return {
    ldr: pick('ldr') ?? 0,
    water: pick('water', 'waterLevel', 'waterLevelRaw') ?? 0,
    distance: pick('distance', 'jarak', 'distanceCm') ?? 999,
    pump: pick('pump', 'pompa', 'pumpActive') ?? false,
    lat: pick('lat', 'latitude') ?? 0,
    lng: pick('lng', 'longitude') ?? 0,
    speed: pick('speed', 'speedKmh') ?? 0,
    satelit: pick('satelit', 'satellites', 'satelliteCount') ?? 0,
    voltage: pick('voltage', 'voltageV') ?? 0,
    current: pick('current', 'currentMa') ?? 0,
    power: pick('power', 'powerW') ?? 0,
    remote: pick('remote', 'remoteMode') ?? false,
    action: pick('action') ?? 'UNKNOWN',
    trash: pick('trash', 'trashDetected') ?? false,
    confidence: pick('confidence', 'detectionConfidence') ?? 0,
    ...(components !== undefined ? { components } : {}),
    ...(pick('observedAt') !== undefined ? { observedAt: pick('observedAt') } : {}),
    ...(pick('sequence', 'seq') !== undefined ? { sequence: pick('sequence', 'seq') } : {}),
    deviceId,
  };
}

function parsePullDeviceState(value: unknown, deviceId: string): SmartRiverDeviceState | null {
  if (!isRecord(value)) return null;
  const stateCandidate = isRecord(value.deviceState) ? value.deviceState : value;

  // A canonical state is already in the format persisted by the push API.
  if (
    stateCandidate.schemaVersion === 1 &&
    asString(stateCandidate.deviceId) &&
    asString(stateCandidate.observedAt) &&
    asString(stateCandidate.receivedAt) &&
    asNumber(stateCandidate.distanceCm) !== undefined &&
    typeof stateCandidate.pumpActive === 'boolean' &&
    typeof stateCandidate.remoteMode === 'boolean' &&
    typeof stateCandidate.trashDetected === 'boolean'
  ) {
    const componentHealth = parseComponentHealth(stateCandidate.componentHealth ?? stateCandidate.components);
    return {
      schemaVersion: 1,
      deviceId: asString(stateCandidate.deviceId) ?? deviceId,
      observedAt: asString(stateCandidate.observedAt)!,
      receivedAt: asString(stateCandidate.receivedAt)!,
      ldr: asNumber(stateCandidate.ldr) ?? 0,
      water: asNumber(stateCandidate.water) ?? 0,
      distanceCm: asNumber(stateCandidate.distanceCm) ?? 999,
      pumpActive: stateCandidate.pumpActive,
      latitude: asNumber(stateCandidate.latitude) ?? 0,
      longitude: asNumber(stateCandidate.longitude) ?? 0,
      speedKmh: asNumber(stateCandidate.speedKmh) ?? 0,
      satelliteCount: asNumber(stateCandidate.satelliteCount) ?? 0,
      voltageV: asNumber(stateCandidate.voltageV) ?? 0,
      currentMa: asNumber(stateCandidate.currentMa) ?? 0,
      powerW: asNumber(stateCandidate.powerW) ?? 0,
      remoteMode: stateCandidate.remoteMode,
      action: asString(stateCandidate.action) ?? 'UNKNOWN',
      trashDetected: stateCandidate.trashDetected,
      detectionConfidence: asNumber(stateCandidate.detectionConfidence) ?? 0,
      ...(componentHealth ? { componentHealth } : {}),
    };
  }

  const hasWireTelemetry = [
    'ldr',
    'water',
    'waterLevel',
    'distance',
    'jarak',
    'voltage',
    'current',
    'power',
    'gpsFix',
    'components',
    'componentHealth',
  ].some((key) => value[key] !== undefined);
  if (!hasWireTelemetry) return null;

  // Pull endpoints commonly expose the same wire names as the ESP32/Pi
  // bridge. Reuse the push normalizer so aliases and numeric bounds stay in
  // sync across both integration modes.
  try {
    return normalizeDeviceTelemetry(pullTelemetryAliases(value, deviceId), deviceId).state;
  } catch {
    return null;
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function unavailableSource(description: string): MonitoringDataSource {
  return {
    id: 'smart-river-not-connected',
    mode: 'unavailable',
    connectedToHardware: false,
    description,
  };
}

function hardwareSource(description = 'Data diterima dari integrasi perangkat Smart River.'): MonitoringDataSource {
  return {
    id: nonEmptyEnv('SMART_RIVER_SOURCE_ID') ?? 'smart-river-hardware',
    mode: 'hardware',
    connectedToHardware: true,
    description,
  };
}

/**
 * A Raspberry Pi bridge can continue answering its local `/status` endpoint
 * while the ESP32 UART has gone silent.  In that case the bridge marks the
 * ESP32 heartbeat as `error`; treating the snapshot as connected would keep
 * showing stale sensor values indefinitely because each bridge heartbeat gets
 * a fresh `receivedAt` timestamp.  Only an explicit error is considered a
 * disconnected device here.  Missing diagnostics remain compatible with
 * older integrations and are checked by the normal age-based stale window.
 */
function deviceHeartbeatFailed(state: SmartRiverDeviceState): boolean {
  const esp32Status = state.componentHealth?.esp32?.status;
  const raspberryPiStatus = state.componentHealth?.raspberryPi?.status;
  return esp32Status === 'error' || raspberryPiStatus === 'error';
}

function result<T>(source: MonitoringDataSource, data: T): MonitoringRepositoryResult<T> {
  return { source, timestamp: new Date().toISOString(), data };
}

function resultAt<T>(
  source: MonitoringDataSource,
  data: T,
  timestamp: string | undefined,
): MonitoringRepositoryResult<T> {
  return { source, timestamp: timestamp ?? new Date().toISOString(), data };
}

function emptyMonitoring(): CurrentMonitoringData {
  return {
    sensors: [],
    devices: [],
    cameras: [],
    alerts: [],
    waterLevel: { records: [], history: [] },
    waterQuality: { station: null, readings: [] },
    objectDetections: [],
    deviceState: null,
  };
}

function parseSensor(value: unknown): SensorReading | null {
  if (!isRecord(value)) return null;
  const stationId = asString(value.stationId);
  const stationName = asString(value.stationName);
  const waterLevel = asNumber(value.waterLevel);
  const flowRate = asNumber(value.flowRate);
  const temperature = asNumber(value.temperature);
  const humidity = asNumber(value.humidity);
  const pH = asNumber(value.pH);
  const tds = asNumber(value.tds);
  const turbidity = asNumber(value.turbidity);
  const dissolvedOxygen = asNumber(value.dissolvedOxygen);
  const rainfall = asNumber(value.rainfall);
  const battery = asNumber(value.battery);
  const status = asString(value.status);
  const sensorStatus = asString(value.sensorStatus);
  const lastUpdated = asString(value.lastUpdated);

  if (
    !stationId ||
    !stationName ||
    waterLevel === undefined ||
    flowRate === undefined ||
    temperature === undefined ||
    humidity === undefined ||
    pH === undefined ||
    tds === undefined ||
    turbidity === undefined ||
    dissolvedOxygen === undefined ||
    rainfall === undefined ||
    battery === undefined ||
    !status ||
    !riverStatuses.has(status as SensorReading['status']) ||
    !sensorStatus ||
    !sensorStatuses.has(sensorStatus as SensorReading['sensorStatus']) ||
    !lastUpdated
  ) {
    return null;
  }

  return {
    stationId,
    stationName,
    waterLevel,
    flowRate,
    temperature,
    humidity,
    pH,
    tds,
    turbidity,
    dissolvedOxygen,
    rainfall,
    battery,
    status: status as SensorReading['status'],
    sensorStatus: sensorStatus as SensorReading['sensorStatus'],
    lastUpdated,
  };
}

function parseAlert(value: unknown): RiverAlert | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const stationId = asString(value.stationId);
  const stationName = asString(value.stationName);
  const type = asString(value.type);
  const message = asString(value.message);
  const severity = asString(value.severity);
  const timestamp = asString(value.timestamp);
  if (
    !id ||
    !stationId ||
    !stationName ||
    !type ||
    !message ||
    !severity ||
    !alertSeverities.has(severity as RiverAlert['severity']) ||
    !timestamp ||
    typeof value.acknowledged !== 'boolean'
  ) {
    return null;
  }
  return {
    id,
    stationId,
    stationName,
    type,
    message,
    severity: severity as RiverAlert['severity'],
    timestamp,
    acknowledged: value.acknowledged,
  };
}

function parseDetection(value: unknown): AIDetection | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const cameraId = asString(value.cameraId);
  const cameraName = asString(value.cameraName);
  const objectType = asString(value.objectType);
  const confidence = asNumber(value.confidence);
  const timestamp = asString(value.timestamp);
  const location = asString(value.location);
  if (!id || !cameraId || !cameraName || !objectType || confidence === undefined || !timestamp || !location) {
    return null;
  }
  const imageUrl = asString(value.imageUrl);
  return { id, cameraId, cameraName, objectType, confidence, timestamp, location, ...(imageUrl ? { imageUrl } : {}) };
}

function parseWaterLevelPoint(value: unknown): WaterLevelDataPoint | null {
  if (!isRecord(value)) return null;
  const time = asString(value.time);
  const level = asNumber(value.level);
  const rainfall = asNumber(value.rainfall);
  return time && level !== undefined && rainfall !== undefined ? { time, level, rainfall } : null;
}

function parseQualityPoint(value: unknown): WaterQualityDataPoint | null {
  if (!isRecord(value)) return null;
  const parameter = asString(value.parameter);
  const valueNumber = asNumber(value.value);
  const max = asNumber(value.max);
  const unit = asString(value.unit);
  const status = asString(value.status);
  if (
    !parameter ||
    valueNumber === undefined ||
    max === undefined ||
    unit === undefined ||
    !status ||
    !riverStatuses.has(status as SensorReading['status'])
  ) {
    return null;
  }
  return { parameter, value: valueNumber, max, unit, status: status as SensorReading['status'] };
}

function parseCamera(value: unknown): MonitoringCamera | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const name = asString(value.name);
  const detectionCount = asNumber(value.detectionCount);
  const connectivity = asString(value.connectivity);
  const locations = Array.isArray(value.locations)
    ? value.locations.map(asString).filter((location): location is string => Boolean(location))
    : [];
  const detectedObjectTypes = Array.isArray(value.detectedObjectTypes)
    ? value.detectedObjectTypes.map(asString).filter((objectType): objectType is string => Boolean(objectType))
    : [];
  if (
    !id ||
    !name ||
    detectionCount === undefined ||
    (connectivity !== 'online' && connectivity !== 'offline' && connectivity !== 'unknown')
  ) {
    return null;
  }
  const lastDetectionAt = asString(value.lastDetectionAt);
  return {
    id,
    name,
    locations,
    detectionCount,
    detectedObjectTypes,
    connectivity,
    ...(lastDetectionAt ? { lastDetectionAt } : {}),
  };
}

function toDevices(sensors: SensorReading[]): MonitoringDevice[] {
  return sensors.map((sensor) => ({
    id: sensor.stationId,
    stationId: sensor.stationId,
    stationName: sensor.stationName,
    sensorStatus: sensor.sensorStatus,
    riverStatus: sensor.status,
    battery: sensor.battery,
    lastUpdated: sensor.lastUpdated,
  }));
}

function camerasFromDetections(detections: AIDetection[]): MonitoringCamera[] {
  const grouped = new Map<string, AIDetection[]>();
  for (const detection of detections) {
    const current = grouped.get(detection.cameraId) ?? [];
    current.push(detection);
    grouped.set(detection.cameraId, current);
  }
  return [...grouped.entries()].map(([id, records]) => ({
    id,
    name: records[0]?.cameraName ?? id,
    locations: unique(records.map((record) => record.location)),
    detectionCount: records.length,
    lastDetectionAt: records.map((record) => record.timestamp).sort().at(-1),
    detectedObjectTypes: unique(records.map((record) => record.objectType)),
    connectivity: 'unknown',
  }));
}

function waterLevelRecords(sensors: SensorReading[]): WaterLevelRecord[] {
  return sensors.map((sensor) => ({
    stationId: sensor.stationId,
    stationName: sensor.stationName,
    waterLevel: sensor.sensorStatus === 'Offline' ? null : sensor.waterLevel,
    sensorStatus: sensor.sensorStatus,
    lastUpdated: sensor.lastUpdated,
    ...(sensor.sensorStatus === 'Offline' ? { unavailableReason: 'Perangkat sensor tidak mengirim pembacaan.' } : {}),
  }));
}

function parseHardwarePayload(value: unknown): CurrentMonitoringData | null {
  const root = isRecord(value) && isRecord(value.data) ? value.data : value;
  if (!isRecord(root)) return null;

  const deviceId = nonEmptyEnv('SMART_RIVER_SOURCE_ID') ?? 'smart-river-hardware';
  const deviceState = parsePullDeviceState(root, deviceId);
  // Legacy pull integrations expose station arrays, while a Pi/ESP32 status
  // endpoint may expose only a device telemetry object. Accept either shape,
  // but reject unrelated JSON instead of claiming a hardware connection.
  if (!Array.isArray(root.sensors) && !deviceState) return null;

  const sensors = Array.isArray(root.sensors)
    ? root.sensors.map(parseSensor).filter((sensor): sensor is SensorReading => sensor !== null)
    : [];
  const alerts = Array.isArray(root.alerts)
    ? root.alerts.map(parseAlert).filter((alert): alert is RiverAlert => alert !== null)
    : [];
  const objectDetections = Array.isArray(root.objectDetections)
    ? root.objectDetections.map(parseDetection).filter((detection): detection is AIDetection => detection !== null)
    : [];
  const waterLevel = isRecord(root.waterLevel) && Array.isArray(root.waterLevel.history)
    ? { records: waterLevelRecords(sensors), history: root.waterLevel.history.map(parseWaterLevelPoint).filter((point): point is WaterLevelDataPoint => point !== null) }
    : { records: waterLevelRecords(sensors), history: [] };
  const stationValue = isRecord(root.waterQuality) ? root.waterQuality.station : null;
  const stationId = isRecord(stationValue) ? asString(stationValue.stationId) : undefined;
  const stationName = isRecord(stationValue) ? asString(stationValue.stationName) : undefined;
  const station = stationId && stationName ? { stationId, stationName } : null;
  const waterQuality = isRecord(root.waterQuality) && Array.isArray(root.waterQuality.readings)
    ? {
        station,
        readings: root.waterQuality.readings
          .map(parseQualityPoint)
          .filter((point): point is WaterQualityDataPoint => point !== null),
      }
    : { station: null, readings: [] };
  const cameras = Array.isArray(root.cameras)
    ? root.cameras.map(parseCamera).filter((camera): camera is MonitoringCamera => camera !== null)
    : camerasFromDetections(objectDetections);

  return {
    sensors,
    devices: toDevices(sensors),
    cameras,
    alerts,
    waterLevel,
    waterQuality,
    objectDetections,
    deviceState,
  };
}

function deviceAlerts(state: SmartRiverDeviceState): RiverAlert[] {
  if (!state.remoteMode) return [];
  return [
    {
      id: `${state.deviceId}-remote-${state.observedAt}`,
      stationId: state.deviceId,
      stationName: 'Smart River',
      type: 'Mode perangkat',
      message: 'Perangkat melaporkan mode remote/power rendah dan menghentikan operasi otomatis.',
      severity: 'warning',
      timestamp: state.observedAt,
      acknowledged: false,
    },
  ];
}

async function fetchStoredHardwareMonitoring(): Promise<MonitoringRepositoryResult<CurrentMonitoringData>> {
  try {
    const deviceId = configuredDeviceId();
    const stored = await readStoredDeviceMonitoring(deviceId);
    if (!stored) {
      return result(
        unavailableSource('Belum ada telemetri yang diterima dari perangkat Smart River.'),
        emptyMonitoring()
      );
    }

    const receivedAt = new Date(stored.state.receivedAt);
    if (
      !Number.isFinite(receivedAt.getTime()) ||
      Date.now() - receivedAt.getTime() > deviceStaleAfterMs() ||
      deviceHeartbeatFailed(stored.state)
    ) {
      return result(
        unavailableSource(
          deviceHeartbeatFailed(stored.state)
            ? 'ESP32 tidak mengirim telemetry terbaru. Periksa koneksi UART dan catu daya perangkat Smart River.'
            : `Perangkat Smart River tidak mengirim heartbeat terbaru. Data terakhir diterima ${stored.state.receivedAt}.`,
        ),
        emptyMonitoring()
      );
    }

    const cameras: MonitoringCamera[] = [
      {
        id: `${deviceId}-camera`,
        name: 'Kamera Smart River',
        locations:
          stored.state.latitude !== 0 || stored.state.longitude !== 0
            ? [`${stored.state.latitude.toFixed(6)}, ${stored.state.longitude.toFixed(6)}`]
            : ['Smart River'],
        detectionCount: stored.detections.length,
        ...(stored.detections[0]?.timestamp ? { lastDetectionAt: stored.detections[0].timestamp } : {}),
        detectedObjectTypes: stored.detections.length ? ['Sampah'] : [],
        connectivity: 'online',
      },
    ];

    return {
      source: hardwareSource('Telemetri langsung diterima dari Raspberry Pi Smart River.'),
      // The source timestamp must describe the device sample, not the time
      // this request happened.  This keeps the dashboard/assistant context
      // and freshness label aligned with the actual telemetry.
      timestamp: stored.state.receivedAt,
      data: {
        sensors: [],
        devices: [],
        cameras,
        alerts: deviceAlerts(stored.state),
        waterLevel: { records: [], history: [] },
        waterQuality: { station: null, readings: [] },
        objectDetections: stored.detections,
        deviceState: stored.state,
      },
    };
  } catch {
    return result(
      unavailableSource('Penyimpanan telemetri Smart River belum siap. Terapkan migrasi database perangkat dan periksa konfigurasinya.'),
      emptyMonitoring()
    );
  }
}

async function fetchHardwareMonitoring(): Promise<MonitoringRepositoryResult<CurrentMonitoringData>> {
  const url = nonEmptyEnv('SMART_RIVER_MONITORING_URL');
  if (!url) {
    return fetchStoredHardwareMonitoring();
  }

  try {
    const endpoint = new URL(url);
    if (endpoint.protocol !== 'https:' && endpoint.protocol !== 'http:') throw new Error('Invalid protocol');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const token = nonEmptyEnv('SMART_RIVER_MONITORING_TOKEN');
      const response = await fetch(endpoint, {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Hardware integration returned ${response.status}`);
      const payload: unknown = await response.json();
      const data = parseHardwarePayload(payload);
      if (!data) throw new Error('Invalid hardware payload');
      if (data.deviceState && deviceHeartbeatFailed(data.deviceState)) {
        return result(
          unavailableSource('ESP32 tidak mengirim telemetry terbaru. Periksa koneksi UART dan catu daya perangkat Smart River.'),
          emptyMonitoring(),
        );
      }
      return resultAt(hardwareSource(), data, data.deviceState?.receivedAt);
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return result(
      unavailableSource('Integrasi Smart River belum dapat dihubungi. Periksa koneksi perangkat dan konfigurasi integrasi.'),
      emptyMonitoring()
    );
  }
}

export async function getCurrentMonitoring(): Promise<MonitoringRepositoryResult<CurrentMonitoringData>> {
  return fetchHardwareMonitoring();
}

export async function getSensors(): Promise<MonitoringRepositoryResult<SensorReading[]>> {
  const monitoring = await fetchHardwareMonitoring();
  return result(monitoring.source, monitoring.data.sensors);
}

export async function getDevices(): Promise<MonitoringRepositoryResult<MonitoringDevice[]>> {
  const monitoring = await fetchHardwareMonitoring();
  return result(monitoring.source, monitoring.data.devices);
}

export async function getOfflineDevices(): Promise<MonitoringRepositoryResult<MonitoringDevice[]>> {
  const monitoring = await fetchHardwareMonitoring();
  return result(monitoring.source, monitoring.data.devices.filter((device) => device.sensorStatus === 'Offline'));
}

export async function getCameras(): Promise<MonitoringRepositoryResult<MonitoringCamera[]>> {
  const monitoring = await fetchHardwareMonitoring();
  return result(monitoring.source, monitoring.data.cameras);
}

export async function getAlerts(): Promise<MonitoringRepositoryResult<RiverAlert[]>> {
  const monitoring = await fetchHardwareMonitoring();
  return result(monitoring.source, monitoring.data.alerts);
}

export async function getWaterLevel(): Promise<MonitoringRepositoryResult<WaterLevelReport>> {
  const monitoring = await fetchHardwareMonitoring();
  return result(monitoring.source, monitoring.data.waterLevel);
}

export async function getWaterQuality(): Promise<MonitoringRepositoryResult<WaterQualityReport>> {
  const monitoring = await fetchHardwareMonitoring();
  return result(monitoring.source, monitoring.data.waterQuality);
}

function compactHardwareContext(monitoring: MonitoringRepositoryResult<CurrentMonitoringData>): string {
  if (!monitoring.source.connectedToHardware) {
    return 'Tidak ada perangkat Smart River yang sedang terhubung. Jangan mengklaim mengetahui kondisi sungai, sensor, kamera, atau alert saat ini.';
  }

  const context = {
    timestamp: monitoring.timestamp,
    sensors: monitoring.data.sensors,
    alerts: monitoring.data.alerts,
    waterLevel: monitoring.data.waterLevel,
    waterQuality: monitoring.data.waterQuality,
    objectDetections: monitoring.data.objectDetections,
    deviceState: monitoring.data.deviceState,
  };
  return `Snapshot perangkat Smart River yang dapat dipakai sebagai konteks (waktu ${monitoring.timestamp}):\n${JSON.stringify(context).slice(0, 14_000)}`;
}

function conversationText(history: z.infer<typeof assistantHistoryEntrySchema>[] | undefined): string {
  if (!history?.length) return '';
  return history.map((entry) => `${entry.role === 'assistant' ? 'Asisten' : 'Pengguna'}: ${entry.content}`).join('\n');
}

function extractResponseText(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const direct = asString(payload.output_text);
  if (direct) return direct;
  if (!Array.isArray(payload.output)) return null;

  const parts: string[] = [];
  for (const item of payload.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (isRecord(content) && content.type === 'output_text') {
        const text = asString(content.text);
        if (text) parts.push(text);
      }
    }
  }
  return parts.join('\n').trim() || null;
}

export async function answerAssistantQuestion(
  request: z.infer<typeof assistantRequestSchema>
): Promise<AssistantResponse> {
  const apiKey = nonEmptyEnv('OPENAI_API_KEY');
  if (!apiKey) {
    throw new AssistantServiceError(
      'configuration',
      'AI umum belum dikonfigurasi. Tambahkan OPENAI_API_KEY pada server untuk mengaktifkannya.'
    );
  }

  const monitoring = await getCurrentMonitoring();
  const history = conversationText(request.history);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: nonEmptyEnv('OPENAI_MODEL') ?? 'gpt-5.4-mini',
        store: false,
        max_output_tokens: 1_000,
        instructions: [
          'Anda adalah RiverWatch AI, asisten umum yang membantu, jelas, dan aman.',
          'Jawab dalam bahasa pengguna; gunakan Bahasa Indonesia bila tidak jelas.',
          'Anda boleh menjawab pertanyaan umum, bukan hanya pertanyaan monitoring.',
          'Jangan mengarang data perangkat, status real-time, atau sumber. Bila konteks perangkat tidak tersedia, nyatakan keterbatasan itu hanya saat pertanyaan membutuhkan data tersebut.',
          compactHardwareContext(monitoring),
        ].join('\n\n'),
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: `${history ? `Riwayat percakapan:\n${history}\n\n` : ''}Pertanyaan terbaru pengguna:\n${request.message}`,
              },
            ],
          },
        ],
      }),
    });
    if (!response.ok) {
      throw new AssistantServiceError('unavailable', 'Layanan AI belum dapat merespons. Silakan coba lagi.');
    }

    const payload: unknown = await response.json();
    const answer = extractResponseText(payload);
    if (!answer) {
      throw new AssistantServiceError('unavailable', 'Layanan AI belum menghasilkan jawaban. Silakan coba lagi.');
    }
    return {
      answer,
      sources: monitoring.source.connectedToHardware ? [monitoring.source.id] : [],
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof AssistantServiceError) throw error;
    throw new AssistantServiceError('unavailable', 'Layanan AI belum dapat dihubungi. Silakan coba lagi.');
  } finally {
    clearTimeout(timeout);
  }
}
