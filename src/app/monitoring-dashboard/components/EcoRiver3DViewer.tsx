'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import {
  Camera as CameraIcon,
  CheckCircle2,
  CircleAlert,
  Cog,
  Gauge,
  Info,
  Rotate3d,
  Waves,
  XCircle,
  Zap,
} from 'lucide-react';
import type { EcoRiverComponentHealthMap, EcoRiverDeviceState } from '@/lib/types';
import EcoRiverModelPreview from './EcoRiverModelPreview';

type HealthStatus = 'ok' | 'warning' | 'error';
type MarkerIcon = 'camera' | 'sensor' | 'conveyor' | 'power' | 'thruster';

interface MarkerDefinition {
  id: string;
  label: string;
  detail: string;
  partPattern: RegExp;
  icon: MarkerIcon;
}

interface RuntimeMarker {
  definition: MarkerDefinition;
  anchor: THREE.Object3D;
  normalLocal: THREE.Vector3;
}

const markerDefinitions: MarkerDefinition[] = [
  {
    id: 'camera',
    label: 'Kamera AI',
    detail: 'Kamera model dan deteksi sampah pada perangkat.',
    partPattern: /Cam[_\s]+V2[._\s]?1|SR_P_CamHousing/i,
    icon: 'camera',
  },
  {
    id: 'distance-sensor',
    label: 'Sensor jarak',
    detail: 'Sensor ultrasonik untuk mengukur jarak objek di area conveyor.',
    partPattern: /UltraSonic/i,
    icon: 'sensor',
  },
  {
    id: 'conveyor',
    label: 'Conveyor',
    detail: 'Mekanisme pengangkut sampah pada bagian depan alat.',
    partPattern: /SR_P_Roller|Synchronous Belt/i,
    icon: 'conveyor',
  },
  {
    id: 'power-box',
    label: 'Kotak elektronik',
    detail: 'Ruang elektronik dan catu daya EcoRiver.',
    partPattern: /SR_P_ElectricalBox(?!Cap)/i,
    icon: 'power',
  },
  {
    id: 'thruster',
    label: 'Thruster',
    detail: 'Penggerak bawah air untuk pergerakan perangkat.',
    partPattern: /Underwater[_\s]+Thruster/i,
    icon: 'thruster',
  },
];

function ComponentIcon({ type, size = 14 }: { type: MarkerIcon; size?: number }) {
  if (type === 'camera') return <CameraIcon size={size} aria-hidden="true" />;
  if (type === 'sensor') return <Gauge size={size} aria-hidden="true" />;
  if (type === 'conveyor') return <Cog size={size} aria-hidden="true" />;
  if (type === 'power') return <Zap size={size} aria-hidden="true" />;
  return <Waves size={size} aria-hidden="true" />;
}

const diagnosticKeyByMarker: Record<string, keyof EcoRiverComponentHealthMap> = {
  camera: 'camera',
  'distance-sensor': 'distanceSensor',
  conveyor: 'conveyor',
  'power-box': 'power',
  thruster: 'thruster',
};

const diagnosticFallbackByMarker: Record<string, keyof EcoRiverComponentHealthMap> = {
  'distance-sensor': 'ajsn',
  'power-box': 'ina219',
  conveyor: 'uln2003',
  thruster: 'l298n',
};

interface DiagnosticDefinition {
  key: keyof EcoRiverComponentHealthMap;
  label: string;
  fallbackKey?: keyof EcoRiverComponentHealthMap;
  /**
   * ID of the 3D marker this diagnostic belongs to. Spatial diagnostics are
   * rendered only while their marker is facing the camera; diagnostics that
   * do not have a physical marker (for example GPS/ESP32) remain available as
   * a device-level status summary.
   */
  markerId?: string;
}

// Daftar ini adalah status elektronik/firmware yang dikirim ESP32 dan
// Raspberry Pi. Penanda yang punya pasangan fisik di atas mengikuti sudut
// kamera; komponen sistem tanpa pasangan marker tetap menjadi ringkasan global.
const diagnosticDefinitions: DiagnosticDefinition[] = [
  { key: 'esp32', label: 'ESP32' },
  { key: 'ina219', label: 'INA219', fallbackKey: 'power', markerId: 'power-box' },
  { key: 'ajsn', label: 'AJSN-SR04T', fallbackKey: 'distanceSensor', markerId: 'distance-sensor' },
  { key: 'gps', label: 'GPS' },
  { key: 'ldr', label: 'LDR' },
  { key: 'waterLevel', label: 'Level air' },
  { key: 'servo', label: 'Servo' },
  { key: 'l298n', label: 'L298N', fallbackKey: 'thruster', markerId: 'thruster' },
  { key: 'uln2003', label: 'ULN2003', fallbackKey: 'conveyor', markerId: 'conveyor' },
  { key: 'led', label: 'LED status' },
  { key: 'buzzer', label: 'Buzzer' },
  { key: 'camera', label: 'Kamera AI', markerId: 'camera' },
  { key: 'raspberryPi', label: 'Raspberry Pi' },
];

function reportedDiagnostic(markerId: string, state: EcoRiverDeviceState | null) {
  const key = diagnosticKeyByMarker[markerId];
  if (!key || !state?.componentHealth) return undefined;
  return state.componentHealth[key] ?? state.componentHealth[diagnosticFallbackByMarker[markerId]];
}

function reportedComponentDiagnostic(
  definition: DiagnosticDefinition,
  state: EcoRiverDeviceState | null,
) {
  if (!state?.componentHealth) return undefined;
  return state.componentHealth[definition.key] ??
    (definition.fallbackKey ? state.componentHealth[definition.fallbackKey] : undefined);
}

function diagnosticStatus(health: EcoRiverComponentHealthMap[keyof EcoRiverComponentHealthMap] | undefined): {
  kind: HealthStatus;
  label: string;
} {
  if (health?.status === 'ok') return { kind: 'ok', label: 'Berfungsi' };
  if (health?.status === 'error') return { kind: 'error', label: 'Bermasalah' };
  return { kind: 'warning', label: 'Belum terverifikasi' };
}

function statusFor(markerId: string, state: EcoRiverDeviceState | null): { kind: HealthStatus; label: string } {
  const diagnostic = reportedDiagnostic(markerId, state);
  if (diagnostic?.status === 'ok') return { kind: 'ok', label: 'Berfungsi' };
  if (diagnostic?.status === 'error') return { kind: 'error', label: 'Bermasalah' };
  if (diagnostic?.status === 'unknown') return { kind: 'warning', label: 'Belum terverifikasi' };

  if (!state) return { kind: 'warning', label: 'Telemetri belum tersedia' };

  if (markerId === 'distance-sensor') {
    return Number.isFinite(state.distanceCm) && state.distanceCm >= 0
      ? { kind: 'ok', label: 'Sensor aktif' }
      : { kind: 'error', label: 'Sensor bermasalah' };
  }
  if (markerId === 'power-box') {
    return state.voltageV > 0 && Number.isFinite(state.currentMa) && Number.isFinite(state.powerW)
      ? { kind: 'ok', label: 'Daya terpantau' }
      : { kind: 'error', label: 'Daya bermasalah' };
  }
  // Heartbeat Raspberry Pi alone does not prove that a camera or actuator is
  // healthy. Older payloads stay neutral until the device reports diagnostics.
  return { kind: 'warning', label: 'Diagnostik belum tersedia' };
}

function statusIcon(kind: HealthStatus, size = 14) {
  if (kind === 'ok') return <CheckCircle2 size={size} aria-hidden="true" />;
  if (kind === 'warning') return <CircleAlert size={size} aria-hidden="true" />;
  return <XCircle size={size} aria-hidden="true" />;
}

function statusColor(kind: HealthStatus): string {
  if (kind === 'ok') return 'text-emerald-600 dark:text-emerald-400';
  if (kind === 'warning') return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function markerDescription(markerId: string, state: EcoRiverDeviceState | null): string {
  const diagnostic = reportedDiagnostic(markerId, state);
  if (diagnostic) {
    const checkedAt = diagnostic.checkedAt ? new Date(diagnostic.checkedAt) : null;
    const checkedLabel = checkedAt && Number.isFinite(checkedAt.getTime())
      ? `Diperiksa ${checkedAt.toLocaleString('id-ID')}.`
      : '';
    return [diagnostic.detail, checkedLabel].filter(Boolean).join(' ');
  }
  if (!state) return 'Sumber monitoring ini belum mengirim telemetri komponen.';
  if (markerId === 'camera') return 'Perangkat belum mengirim diagnosis mandiri kamera.';
  if (markerId === 'distance-sensor') return `Pembacaan terakhir ${state.distanceCm.toFixed(1)} cm.`;
  if (markerId === 'conveyor') return `Aksi terakhir: ${state.action}.`;
  if (markerId === 'power-box') return `${state.voltageV.toFixed(2)} V · ${state.currentMa.toFixed(0)} mA · ${state.powerW.toFixed(2)} W.`;
  if (markerId === 'thruster') return `Kecepatan ${state.speedKmh.toFixed(1)} km/jam · aksi ${state.action}.`;
  return 'Diagnosis komponen belum tersedia.';
}

function patternMatchesNode(object: THREE.Object3D, pattern: RegExp): boolean {
  // Reset the cursor so this helper also remains correct if a pattern is
  // changed to a global/sticky regular expression in the future.
  pattern.lastIndex = 0;
  return pattern.test(object.name);
}

function partBounds(model: THREE.Object3D, pattern: RegExp): THREE.Box3 | null {
  const bounds = new THREE.Box3();
  let found = false;
  model.traverse((object) => {
    if (!patternMatchesNode(object, pattern)) return;
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        bounds.expandByObject(child);
        found = true;
      }
    });
  });
  return found && !bounds.isEmpty() ? bounds : null;
}

function disposeModel(model: THREE.Object3D) {
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material.dispose());
  });
}

function ComponentDiagnostics({
  state,
  visibleIds,
}: {
  state: EcoRiverDeviceState | null;
  /** IDs of markers currently facing the camera. Omit in the static fallback. */
  visibleIds?: string[];
}) {
  const hasInteractiveVisibility = visibleIds !== undefined;
  const visibleMarkerSet = new Set(visibleIds ?? []);
  const visibleSpatial = (definition: DiagnosticDefinition) =>
    !hasInteractiveVisibility || !definition.markerId || visibleMarkerSet.has(definition.markerId);
  const availableDefinitions = state?.componentHealth
    ? diagnosticDefinitions.filter(
        (definition) => visibleSpatial(definition) && reportedComponentDiagnostic(definition, state),
      )
    : [];
  const hiddenSpatialDiagnostics = state?.componentHealth
    ? diagnosticDefinitions.some(
        (definition) => definition.markerId && !visibleSpatial(definition) && reportedComponentDiagnostic(definition, state),
      )
    : false;

  return (
    <div className="mt-4 border-t border-border pt-4" aria-label="Diagnostik komponen EcoRiver">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-foreground">Diagnostik komponen</p>
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
            Hasil pemeriksaan mandiri dari ESP32 dan Raspberry Pi.
          </p>
           <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground/70">
             Status komponen yang menempel pada model mengikuti sudut pandang; status sistem tetap tersedia dari semua sudut.
           </p>
        </div>
        <span className="rounded-full border border-border bg-muted/40 px-2 py-1 text-[10px] font-medium text-muted-foreground">
          Hijau = OK · Merah = error · Kuning = belum terverifikasi
        </span>
      </div>

      {!state?.componentHealth ? (
        <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs leading-5 text-muted-foreground">
          Firmware atau bridge belum mengirim diagnostik komponen. Setelah ESP32 terhubung melalui Raspberry Pi, status akan muncul otomatis.
        </p>
      ) : availableDefinitions.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs leading-5 text-muted-foreground">
          {hiddenSpatialDiagnostics
            ? 'Diagnostik komponen berada di sisi belakang model. Putar model untuk menampilkannya.'
            : 'Belum ada hasil diagnostik komponen yang dapat ditampilkan.'}
        </p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {diagnosticDefinitions.map((definition) => {
            if (!visibleSpatial(definition)) return null;
            const health = reportedComponentDiagnostic(definition, state);
            if (!health) return null;
            const status = diagnosticStatus(health);
            const checkedAt = health.checkedAt ? new Date(health.checkedAt) : null;
            const checkedLabel = checkedAt && Number.isFinite(checkedAt.getTime())
              ? checkedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
              : null;
            return (
              <article
                key={definition.key}
                className="min-w-0 rounded-xl border border-border bg-background/35 px-3 py-2.5 transition-colors hover:bg-muted/50"
                title={health.detail}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Cog size={13} aria-hidden="true" />
                    </span>
                    <span className="truncate text-xs font-semibold text-foreground">{definition.label}</span>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold ${statusColor(status.kind)}`}>
                    {statusIcon(status.kind, 12)}
                    <span className="sr-only">{status.label}</span>
                    <span aria-hidden="true">{status.kind === 'ok' ? 'OK' : status.kind === 'error' ? 'Error' : '—'}</span>
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{health.detail ?? status.label}</p>
                {checkedLabel && <p className="mt-1 text-[10px] text-muted-foreground/70">Diperiksa {checkedLabel}</p>}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function EcoRiver3DViewer({
  state,
  connected = Boolean(state),
}: {
  state: EcoRiverDeviceState | null;
  /** The source can be connected even when it only exposes legacy station data. */
  connected?: boolean;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const markerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [markers, setMarkers] = useState<RuntimeMarker[]>([]);
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (loadError) return undefined;

    const mount = mountRef.current;
    if (!mount) return undefined;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    } catch {
      setIsLoading(false);
      setLoadError(true);
      return undefined;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.domElement.className = 'absolute inset-0 h-full w-full touch-none';
    renderer.domElement.setAttribute('aria-label', 'Model 3D EcoRiver yang dapat diputar');
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
    camera.position.set(2.8, 1.8, 3.2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.rotateSpeed = 0.7;
    controls.zoomSpeed = 0.8;
    controls.panSpeed = 0.45;
    controls.enablePan = false;
    controls.minDistance = 0.75;
    controls.maxDistance = 7;
    controls.target.set(0, 0, 0);

    const hemisphere = new THREE.HemisphereLight(0xe6f7ff, 0x07101f, 2.2);
    scene.add(hemisphere);
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.4);
    keyLight.position.set(3.5, 4.5, 4.5);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x4aa8ff, 1.8);
    fillLight.position.set(-4, 1.5, 2);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0x8edcff, 1.5);
    rimLight.position.set(1, -2, -4);
    scene.add(rimLight);

    let modelScene: THREE.Group | null = null;
    let runtimeMarkers: RuntimeMarker[] = [];
    let animationFrame = 0;
    let disposed = false;
    let lastVisibilityUpdate = 0;
    let previousVisibleKey = '';

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(mount);
    window.addEventListener('resize', resize);

    const updateMarkerOverlays = () => {
      if (!modelScene) return;
      modelScene.updateMatrixWorld(true);
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(modelScene.matrixWorld);
      const visible: string[] = [];

      runtimeMarkers.forEach((marker) => {
        const element = markerRefs.current[marker.definition.id];
        if (!element) return;

        const worldPosition = marker.anchor.getWorldPosition(new THREE.Vector3());
        const toCamera = camera.position.clone().sub(worldPosition).normalize();
        const worldNormal = marker.normalLocal.clone().applyMatrix3(normalMatrix).normalize();
        const facingCamera = worldNormal.dot(toCamera) > 0.16;
        const projected = worldPosition.clone().project(camera);
        const insideViewport =
          projected.z > -1 &&
          projected.z < 1 &&
          projected.x > -1.08 &&
          projected.x < 1.08 &&
          projected.y > -1.08 &&
          projected.y < 1.08;
        const isVisible = facingCamera && insideViewport;

        if (isVisible) {
          const x = Math.min(width - 56, Math.max(56, (projected.x * 0.5 + 0.5) * width));
          const y = Math.min(height - 28, Math.max(28, (-projected.y * 0.5 + 0.5) * height));
          element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
          element.style.opacity = '1';
          element.style.visibility = 'visible';
          element.style.pointerEvents = 'auto';
          visible.push(marker.definition.id);
        } else {
          element.style.opacity = '0';
          element.style.visibility = 'hidden';
          element.style.pointerEvents = 'none';
        }
      });

      const now = performance.now();
      const visibleKey = visible.join('|');
      if (now - lastVisibilityUpdate > 120 && visibleKey !== previousVisibleKey) {
        lastVisibilityUpdate = now;
        previousVisibleKey = visibleKey;
        setVisibleIds(visible);
      }
    };

    const animate = () => {
      if (disposed) return;
      controls.update();
      renderer.render(scene, camera);
      updateMarkerOverlays();
      animationFrame = window.requestAnimationFrame(animate);
    };
    animate();

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(
      '/assets/models/ecoriver.glb',
      (gltf) => {
        if (disposed) return;
        const loadedModel = gltf.scene;
        modelScene = loadedModel;
        loadedModel.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(loadedModel);
        const modelCenter = bounds.getCenter(new THREE.Vector3());
        const modelSize = bounds.getSize(new THREE.Vector3());
        const maxDimension = Math.max(modelSize.x, modelSize.y, modelSize.z, 0.001);

        const localModelCenter = loadedModel.worldToLocal(modelCenter.clone());
        const nextMarkers: RuntimeMarker[] = [];
        markerDefinitions.forEach((definition) => {
          const boundsForPart = partBounds(loadedModel, definition.partPattern);
          if (!boundsForPart) return;
          const localPartCenter = loadedModel.worldToLocal(boundsForPart.getCenter(new THREE.Vector3()));
          const normalLocal = localPartCenter.clone().sub(localModelCenter).normalize();
          if (normalLocal.lengthSq() < 0.001) normalLocal.set(0, 1, 0);
          const partSize = boundsForPart.getSize(new THREE.Vector3()).length();
          const offset = Math.max(maxDimension * 0.018, Math.min(maxDimension * 0.06, partSize * 0.12));
          const anchor = new THREE.Object3D();
          anchor.position.copy(localPartCenter).addScaledVector(normalLocal, offset);
          loadedModel.add(anchor);
          nextMarkers.push({ definition, anchor, normalLocal });
        });

        loadedModel.position.sub(localModelCenter);
        loadedModel.scale.setScalar(2.35 / maxDimension);
        scene.add(loadedModel);
        camera.position.set(2.75, 1.65, 3.05);
        camera.lookAt(0, 0, 0);
        controls.target.set(0, 0, 0);
        controls.update();
        runtimeMarkers = nextMarkers;
        setMarkers(nextMarkers);
        setIsLoading(false);
      },
      undefined,
      () => {
        if (disposed) return;
        setIsLoading(false);
        setLoadError(true);
      },
    );

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resize);
      controls.dispose();
      if (modelScene) disposeModel(modelScene);
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, [loadError]);

  if (loadError) {
    return (
      <div className="space-y-3">
        <EcoRiverModelPreview connected={connected} />
        <p className="text-center text-xs text-muted-foreground">
          Viewer 3D tidak tersedia pada browser ini; pratinjau sudut alat tetap ditampilkan.
        </p>
        <div className="rounded-2xl border border-border bg-card px-4 pb-4 shadow-[var(--shadow-soft)] sm:px-5">
          <ComponentDiagnostics state={state} />
        </div>
      </div>
    );
  }

  const visibleMarkers = markers.filter((marker) => visibleIds.includes(marker.definition.id));
  const selectedMarker = visibleMarkers.find((marker) => marker.definition.id === selectedId);

  return (
    <section
      id="device-model"
      className="overflow-hidden rounded-2xl border border-primary/20 bg-card shadow-[var(--shadow-soft)]"
      aria-label="Model 3D interaktif EcoRiver"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Rotate3d size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Model 3D EcoRiver</p>
            <p className="text-xs text-muted-foreground">Seret untuk memutar · cubit atau scroll untuk zoom</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
              connected
                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                : 'border-border bg-muted text-muted-foreground'
            }`}
          >
            {connected ? 'Perangkat terhubung' : 'Menunggu koneksi'}
          </span>
          <button
            type="button"
            onClick={() => setShowHelp((current) => !current)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Tampilkan petunjuk model 3D"
            aria-expanded={showHelp}
          >
            <Info size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      {showHelp && (
        <div className="border-b border-border bg-primary/5 px-4 py-2.5 text-xs leading-5 text-muted-foreground sm:px-5">
          Putar model dengan mouse atau satu jari. Gunakan dua jari/roda mouse untuk memperbesar. Penanda komponen hanya muncul ketika sisi komponen menghadap kamera.
        </div>
      )}

      <div ref={mountRef} className="relative aspect-[16/9] min-h-[300px] overflow-hidden bg-[radial-gradient(circle_at_50%_45%,rgba(37,99,235,0.18),transparent_58%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,8,23,0.99))] sm:min-h-[390px]">
        <div aria-hidden="true" className="bg-grid pointer-events-none absolute inset-0 opacity-45" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-2/3 w-2/3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />

        {markers.map((marker) => {
          const health = statusFor(marker.definition.id, state);
          return (
            <button
              type="button"
              key={marker.definition.id}
              ref={(element) => {
                markerRefs.current[marker.definition.id] = element;
              }}
              onClick={() => setSelectedId(marker.definition.id)}
              className="absolute left-0 top-0 z-20 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full border border-white/15 bg-slate-950/80 px-2.5 py-1.5 text-left text-[11px] font-semibold text-white shadow-lg backdrop-blur transition-[opacity,transform,box-shadow] duration-200 hover:shadow-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              style={{ opacity: 0, visibility: 'hidden', pointerEvents: 'none', willChange: 'transform, opacity' }}
              title={marker.definition.detail}
            >
              <span className="text-primary"><ComponentIcon type={marker.definition.icon} size={13} /></span>
              <span className="truncate">{marker.definition.label}</span>
              <span className={statusColor(health.kind)}>{statusIcon(health.kind, 14)}</span>
            </button>
          );
        })}

        {isLoading && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/25 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/70 px-3 py-2 text-xs text-white/80">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-primary" />
              Memuat model 3D...
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">Komponen terlihat</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              {visibleMarkers.length}/{markers.length}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">Putar model untuk melihat sisi lain</span>
        </div>

        {visibleMarkers.length === 0 ? (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Tidak ada komponen yang menghadap kamera. Putar model untuk menampilkan informasinya.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {visibleMarkers.map((marker) => {
              const health = statusFor(marker.definition.id, state);
              return (
                <button
                  type="button"
                  key={`visible-${marker.definition.id}`}
                  onClick={() => setSelectedId(marker.definition.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    selectedId === marker.definition.id
                      ? 'border-primary/30 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <ComponentIcon type={marker.definition.icon} size={13} />
                  <span>{marker.definition.label}</span>
                  <span className={statusColor(health.kind)}>{statusIcon(health.kind, 13)}</span>
                </button>
              );
            })}
          </div>
        )}

        {selectedMarker && visibleIds.includes(selectedMarker.definition.id) && (
          <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 text-primary"><ComponentIcon type={selectedMarker.definition.icon} size={16} /></span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold text-foreground">{selectedMarker.definition.label}</p>
                  {(() => {
                    const health = statusFor(selectedMarker.definition.id, state);
                    return <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${statusColor(health.kind)}`}>{statusIcon(health.kind, 13)}{health.label}</span>;
                  })()}
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{selectedMarker.definition.detail}</p>
                <p className="mt-1 text-xs leading-5 text-foreground/80">{markerDescription(selectedMarker.definition.id, state)}</p>
              </div>
            </div>
          </div>
        )}

        <ComponentDiagnostics state={state} visibleIds={visibleIds} />
      </div>
    </section>
  );
}
