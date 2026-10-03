export type RiverStatus = 'Normal' | 'Watch' | 'Warning' | 'Critical';
export type SensorStatus = 'Online' | 'Offline' | 'Warning';
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type SessionStatus = 'owner' | 'allowed' | 'pending' | 'blocked' | 'revoked';
export type AuthState =
  | 'logged_out' |'logged_in' |'otp_required' |'pending_login_approval' |'active' |'blocked';

export interface User {
  id: string;
  nama: string;
  email: string;
  role: 'owner' | 'operator' | 'viewer';
  isOwner: boolean;
  createdAt: string;
  currentDevice: string;
}

export interface Session {
  id: string;
  userId: string;
  deviceName: string;
  browser: string;
  os: string;
  location: string;
  status: SessionStatus;
  lastActive: string;
  isCurrentDevice: boolean;
}

export interface SensorReading {
  stationId: string;
  stationName: string;
  waterLevel: number;
  flowRate: number;
  temperature: number;
  humidity: number;
  pH: number;
  tds: number;
  turbidity: number;
  dissolvedOxygen: number;
  rainfall: number;
  battery: number;
  status: RiverStatus;
  lastUpdated: string;
  sensorStatus: SensorStatus;
}

export interface RiverAlert {
  id: string;
  stationId: string;
  stationName: string;
  type: string;
  message: string;
  severity: AlertSeverity;
  timestamp: string;
  acknowledged: boolean;
}

export interface AIDetection {
  id: string;
  cameraId: string;
  cameraName: string;
  objectType: string;
  confidence: number;
  timestamp: string;
  location: string;
  imageUrl?: string;
}

/**
 * Health reported by an individual Smart River component.
 *
 * This is optional because older firmware/bridge payloads only contain the
 * device-level telemetry fields below.  `unknown` is intentionally different
 * from `error`: it means the component has not supplied a diagnostic result.
 */
export type SmartRiverComponentStatus = 'ok' | 'error' | 'unknown';

export interface SmartRiverComponentHealth {
  status: SmartRiverComponentStatus;
  detail?: string;
  checkedAt?: string;
}

/**
 * Known component identifiers sent by the Raspberry Pi bridge in the wire
 * `components` object.  Every entry is optional so a device can report only
 * the diagnostics it actually supports.
 */
export interface SmartRiverComponentHealthMap {
  camera?: SmartRiverComponentHealth;
  esp32?: SmartRiverComponentHealth;
  ina219?: SmartRiverComponentHealth;
  ajsn?: SmartRiverComponentHealth;
  gps?: SmartRiverComponentHealth;
  ldr?: SmartRiverComponentHealth;
  waterLevel?: SmartRiverComponentHealth;
  servo?: SmartRiverComponentHealth;
  l298n?: SmartRiverComponentHealth;
  uln2003?: SmartRiverComponentHealth;
  led?: SmartRiverComponentHealth;
  buzzer?: SmartRiverComponentHealth;
  distanceSensor?: SmartRiverComponentHealth;
  conveyor?: SmartRiverComponentHealth;
  power?: SmartRiverComponentHealth;
  thruster?: SmartRiverComponentHealth;
  raspberryPi?: SmartRiverComponentHealth;
}

export interface SmartRiverDeviceState {
  schemaVersion: 1;
  deviceId: string;
  observedAt: string;
  receivedAt: string;
  ldr: number;
  water: number;
  distanceCm: number;
  pumpActive: boolean;
  latitude: number;
  longitude: number;
  speedKmh: number;
  satelliteCount: number;
  voltageV: number;
  currentMa: number;
  powerW: number;
  remoteMode: boolean;
  action: string;
  trashDetected: boolean;
  detectionConfidence: number;
  /** Normalized form of the optional wire-level `components` diagnostics. */
  componentHealth?: SmartRiverComponentHealthMap;
}

export interface Notification {
  id: string;
  type: 'new_login' | 'login_allowed' | 'device_logout' | 'alert' | 'system';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  sessionId?: string;
  actionRequired?: boolean;
  deviceInfo?: string;
  location?: string;
}

export interface WaterLevelDataPoint {
  time: string;
  level: number;
  rainfall: number;
}

export interface WaterQualityDataPoint {
  parameter: string;
  value: number;
  max: number;
  unit: string;
  status: RiverStatus;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: string[];
  confidence?: number;
}
