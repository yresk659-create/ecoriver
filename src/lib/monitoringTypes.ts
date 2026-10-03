import type {
  AIDetection,
  RiverAlert,
  SensorReading,
  EcoRiverComponentHealthMap,
  EcoRiverDeviceState,
  WaterLevelDataPoint,
  WaterQualityDataPoint,
} from './types';

const componentHealthKeys: (keyof EcoRiverComponentHealthMap)[] = [
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isComponentHealth(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.status !== 'ok' && value.status !== 'error' && value.status !== 'unknown') return false;
  return (
    (value.detail === undefined || typeof value.detail === 'string') &&
    (value.checkedAt === undefined || typeof value.checkedAt === 'string')
  );
}

function isComponentHealthMap(value: unknown): value is EcoRiverComponentHealthMap | undefined {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return componentHealthKeys.every((key) => value[key] === undefined || isComponentHealth(value[key]));
}

function isEcoRiverDeviceState(value: unknown): value is EcoRiverDeviceState {
  if (!isRecord(value)) return false;
  return (
    value.schemaVersion === 1 &&
    typeof value.deviceId === 'string' &&
    typeof value.observedAt === 'string' &&
    typeof value.receivedAt === 'string' &&
    isFiniteNumber(value.ldr) &&
    isFiniteNumber(value.water) &&
    isFiniteNumber(value.distanceCm) &&
    typeof value.pumpActive === 'boolean' &&
    isFiniteNumber(value.latitude) &&
    isFiniteNumber(value.longitude) &&
    isFiniteNumber(value.speedKmh) &&
    isFiniteNumber(value.satelliteCount) &&
    isFiniteNumber(value.voltageV) &&
    isFiniteNumber(value.currentMa) &&
    isFiniteNumber(value.powerW) &&
    typeof value.remoteMode === 'boolean' &&
    typeof value.action === 'string' &&
    typeof value.trashDetected === 'boolean' &&
    isFiniteNumber(value.detectionConfidence) &&
    isComponentHealthMap(value.componentHealth)
  );
}

export interface MonitoringSourceInfo {
  id: string;
  mode: 'hardware' | 'unavailable';
  connectedToHardware: boolean;
  description: string;
}

export interface MonitoringApiResponse {
  source: MonitoringSourceInfo;
  timestamp: string;
  sensors: SensorReading[];
  alerts: RiverAlert[];
  waterLevel: {
    history: WaterLevelDataPoint[];
  };
  waterQuality: {
    station: Pick<SensorReading, 'stationId' | 'stationName'> | null;
    readings: WaterQualityDataPoint[];
  };
  objectDetections: AIDetection[];
  deviceState: EcoRiverDeviceState | null;
}

export function isMonitoringApiResponse(value: unknown): value is MonitoringApiResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MonitoringApiResponse>;
  const source = candidate.source as Partial<MonitoringSourceInfo> | undefined;
  return (
    !!source &&
    typeof source === 'object' &&
    typeof source.id === 'string' &&
    (source.mode === 'hardware' || source.mode === 'unavailable') &&
    typeof source.connectedToHardware === 'boolean' &&
    typeof source.description === 'string' &&
    typeof candidate.timestamp === 'string' &&
    Array.isArray(candidate.sensors) &&
    Array.isArray(candidate.alerts) &&
    !!candidate.waterLevel &&
    typeof candidate.waterLevel === 'object' &&
    Array.isArray(candidate.waterLevel.history) &&
    !!candidate.waterQuality &&
    typeof candidate.waterQuality === 'object' &&
    Array.isArray(candidate.waterQuality.readings) &&
    Array.isArray(candidate.objectDetections) &&
    (candidate.deviceState === null || isEcoRiverDeviceState(candidate.deviceState))
  );
}
