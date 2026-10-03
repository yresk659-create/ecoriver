'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Cable, CheckCircle2, Loader2, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import { AuthProvider, useAuth } from '@/lib/authContext';
import DashboardLayout from '@/components/DashboardLayout';
import Reveal from '@/components/ui/Reveal';
import { isMonitoringApiResponse, type MonitoringApiResponse } from '@/lib/monitoringTypes';
import KPIBentoGrid from './components/KPIBentoGrid';
import WaterLevelChart from './components/WaterLevelChart';
import WaterQualityChart from './components/WaterQualityChart';
import AlertsTable from './components/AlertsTable';
import StationStatusList from './components/StationStatusList';
import AIDetectionFeed from './components/AIDetectionFeed';
import NewLoginModal from './components/NewLoginModal';
import EcoRiverDeviceOverview from './components/EcoRiverDeviceOverview';
import EcoRiverModelPreview from './components/EcoRiverModelPreview';
import DeviceAnalyticsPanel from './components/DeviceAnalyticsPanel';

const EcoRiver3DViewer = dynamic(() => import('./components/EcoRiver3DViewer'), {
  ssr: false,
  loading: () => <EcoRiverModelPreview connected />,
});

function AuthLoading() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center gap-3 text-muted-foreground">
      <Loader2 size={20} className="animate-spin text-primary" />
      <span className="text-sm">Memeriksa sesi Anda...</span>
    </div>
  );
}

type DeviceAccessResolution = 'allowed' | 'denied';

function DeviceAccessResolutionScreen({ resolution }: { resolution: DeviceAccessResolution }) {
  const isAllowed = resolution === 'allowed';
  const Icon = isAllowed ? CheckCircle2 : XCircle;

  return (
    <div className="flex min-h-[100dvh] items-center justify-center p-6" aria-live="polite">
      <div
        className={`resolution-card w-full max-w-md overflow-hidden rounded-2xl border bg-card p-7 pb-0 text-center shadow-[var(--shadow-lifted)] ${
          isAllowed ? 'border-emerald-500/30' : 'border-red-500/30'
        }`}
      >
        <div
          className={`resolution-icon mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
            isAllowed ? 'bg-emerald-500/15' : 'bg-red-500/15'
          }`}
        >
          <Icon size={36} className={isAllowed ? 'text-emerald-400' : 'text-red-400'} aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
          {isAllowed ? 'Perangkat Diizinkan untuk Masuk' : 'Perangkat Tidak Diizinkan untuk Masuk'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {isAllowed ? 'Membuka dashboard akun Anda...' : 'Kembali ke halaman utama...'}
        </p>
        <div className="mt-7 h-0.5 overflow-hidden bg-muted">
          <div className={`resolution-progress h-full ${isAllowed ? 'bg-emerald-400' : 'bg-red-400'}`} />
        </div>
      </div>
    </div>
  );
}

function PendingApprovalScreen({ onCancel }: { onCancel: () => void }) {

  return (
    <div className="flex min-h-[100dvh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-card p-7 text-center shadow-[var(--shadow-lifted)] slide-up">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15">
          <ShieldAlert size={26} className="text-amber-400" />
        </div>
        <h1 className="text-lg font-semibold tracking-[-0.02em] text-foreground">Menunggu persetujuan perangkat</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Pemilik akun telah diberi notifikasi. Halaman ini akan memperbarui status secara otomatis setelah perangkat Anda diizinkan.
        </p>
        <button
          onClick={onCancel}
          className="button-secondary mt-6 px-4 py-2.5 text-sm font-semibold"
        >
          Batalkan login
        </button>
      </div>
    </div>
  );
}

function MonitoringUnavailable({
  isLoading,
  message,
  onRetry,
}: {
  isLoading: boolean;
  message: string | null;
  onRetry: () => void;
}) {
  return (
    <DashboardLayout>
      <div id="dashboard-overview" className="h-full overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto grid min-h-full max-w-6xl items-center gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
          <Reveal>
            <EcoRiverModelPreview />
          </Reveal>
          <Reveal delay={70}>
            <div className="w-full rounded-2xl border border-border bg-card p-6 text-center slide-up">
              {isLoading ? (
                <>
                  <Loader2 size={22} className="mx-auto animate-spin text-primary" />
                  <p className="mt-3 text-sm text-muted-foreground">Memuat data monitoring...</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-red-400">{message ?? 'Data monitoring tidak tersedia.'}</p>
                  <button
                    onClick={onRetry}
                    className="button-primary mt-4 px-4 py-2 text-sm font-semibold"
                  >
                    Coba lagi
                  </button>
                </>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </DashboardLayout>
  );
}

function HardwareNotConnected({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <DashboardLayout>
      <div id="dashboard-overview" className="h-full overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto grid min-h-full max-w-6xl items-center gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
          <Reveal>
            <EcoRiverModelPreview />
          </Reveal>
          <Reveal delay={70}>
            <div className="w-full rounded-2xl border border-border bg-card p-7 text-center shadow-[var(--shadow-soft)] slide-up">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <Cable size={27} className="text-primary" />
              </div>
              <h1 className="mt-4 text-lg font-semibold tracking-[-0.02em] text-foreground">EcoRiver belum terhubung</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Pratinjau alat tetap tersedia. Data monitoring akan muncul setelah perangkat terintegrasi.
              </p>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground/80">{message}</p>
              <button
                onClick={onRetry}
                className="button-primary mt-6 gap-2 px-4 py-2.5 text-sm font-semibold"
              >
                <RefreshCw size={15} />
                Periksa koneksi lagi
              </button>
            </div>
          </Reveal>
        </div>
      </div>
    </DashboardLayout>
  );
}

function DashboardContent() {
  const { user, pendingSession, sessionStatus, isLoading, logout, refreshSession } = useAuth();
  const router = useRouter();
  const [monitoring, setMonitoring] = useState<MonitoringApiResponse | null>(null);
  const [monitoringError, setMonitoringError] = useState<string | null>(null);
  const [isMonitoringLoading, setIsMonitoringLoading] = useState(false);
  const [wasPendingLogin, setWasPendingLogin] = useState(false);

  useEffect(() => {
    if (sessionStatus === 'pending') setWasPendingLogin(true);
  }, [sessionStatus]);

  const accessResolution: DeviceAccessResolution | null =
    !isLoading && wasPendingLogin
      ? user && (sessionStatus === 'allowed' || sessionStatus === 'owner')
        ? 'allowed'
        : !user
          ? 'denied'
          : null
      : null;

  useEffect(() => {
    if (!accessResolution) return;

    const timer = window.setTimeout(() => {
      if (accessResolution === 'allowed') {
        setWasPendingLogin(false);
      } else {
        setWasPendingLogin(false);
        router.replace('/');
      }
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [accessResolution, router]);

  const cancelPendingLogin = useCallback(async () => {
    // This is an intentional cancellation, not an owner denial, so it should
    // return to the landing page immediately without showing the denial state.
    setWasPendingLogin(false);
    await logout();
    router.replace('/');
  }, [logout, router]);

  const loadMonitoring = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!silent) {
      setIsMonitoringLoading(true);
      setMonitoringError(null);
    }
    try {
      const response = await fetch('/api/monitoring', { credentials: 'same-origin' });
      const payload: unknown = await response.json().catch(() => undefined);
      if (response.status === 401) {
        await refreshSession();
        return;
      }
      if (!response.ok || !isMonitoringApiResponse(payload)) {
        const message =
          payload &&
          typeof payload === 'object' &&
          'error' in payload &&
          typeof (payload as { error?: unknown }).error === 'string'
            ? (payload as { error: string }).error
            : 'Data monitoring belum dapat dimuat.';
        setMonitoringError(message);
        return;
      }
      setMonitoring(payload);
    } catch {
      if (!silent) setMonitoringError('Koneksi ke data monitoring gagal. Silakan coba lagi.');
    } finally {
      if (!silent) setIsMonitoringLoading(false);
    }
  }, [refreshSession]);

  useEffect(() => {
    if (!isLoading && !user && !accessResolution) {
      router.replace('/');
    }
  }, [accessResolution, isLoading, router, user]);

  useEffect(() => {
    if (user && sessionStatus !== 'pending') {
      void loadMonitoring();
      const interval = window.setInterval(() => void loadMonitoring({ silent: true }), 5_000);
      return () => window.clearInterval(interval);
    }
  }, [loadMonitoring, sessionStatus, user]);

  if (accessResolution) return <DeviceAccessResolutionScreen resolution={accessResolution} />;
  if (isLoading || !user) return <AuthLoading />;
  if (sessionStatus === 'pending') return <PendingApprovalScreen onCancel={() => void cancelPendingLogin()} />;

  // Keep the device-review modal mounted even when monitoring hardware is not
  // connected yet. Notifications can otherwise update pendingSession without
  // having anywhere to render the review UI.
  const pendingLoginReview =
    user.isOwner && pendingSession ? <NewLoginModal session={pendingSession} /> : null;

  if (!monitoring) {
    return (
      <>
        <MonitoringUnavailable
          isLoading={isMonitoringLoading}
          message={monitoringError}
          onRetry={() => void loadMonitoring()}
        />
        {pendingLoginReview}
      </>
    );
  }
  if (!monitoring.source.connectedToHardware) {
    return (
      <>
        <HardwareNotConnected
          message={monitoring.source.description}
          onRetry={() => void loadMonitoring()}
        />
        {pendingLoginReview}
      </>
    );
  }

  const primaryStation =
    monitoring.sensors.find((station) => station.status === 'Warning') ?? monitoring.sensors[0];
  if (!primaryStation && !monitoring.deviceState) {
    return (
      <>
        <MonitoringUnavailable
          isLoading={false}
          message="Tidak ada station pada data monitoring."
          onRetry={() => void loadMonitoring()}
        />
        {pendingLoginReview}
      </>
    );
  }

  const updatedAt = new Date(monitoring.timestamp).toLocaleString('id-ID');
  const sourceLabel = `${monitoring.source.description} · Terakhir diperbarui: ${updatedAt}`;

  if (monitoring.deviceState) {
    return (
      <DashboardLayout>
        <div id="dashboard-overview" className="mx-auto max-w-screen-2xl space-y-6 px-4 py-6 lg:px-6 xl:px-8 2xl:px-10">
          <Reveal>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-xl font-semibold tracking-[-0.025em] text-foreground">Dashboard monitoring</h1>
                <div className="mt-1 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 pulse-dot" />
                  <span className="text-xs text-muted-foreground">{sourceLabel}</span>
                </div>
              </div>
              <button
                onClick={() => void loadMonitoring()}
                disabled={isMonitoringLoading}
                className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                <RefreshCw size={13} className={isMonitoringLoading ? 'animate-spin' : ''} />
                Perbarui
              </button>
            </div>
          </Reveal>

          <Reveal delay={40}>
            <EcoRiverDeviceOverview
              state={monitoring.deviceState}
              model={
                <EcoRiver3DViewer
                  state={monitoring.deviceState}
                  connected={monitoring.source.connectedToHardware}
                />
              }
            />
          </Reveal>

          <Reveal delay={70}>
            <DeviceAnalyticsPanel state={monitoring.deviceState} />
          </Reveal>

          <Reveal delay={80}>
            <AlertsTable alerts={monitoring.alerts} />
          </Reveal>

          <Reveal delay={90}>
            <div id="detection-feed">
              <AIDetectionFeed detections={monitoring.objectDetections} source={monitoring.source} />
            </div>
          </Reveal>
        </div>
        {pendingLoginReview}
      </DashboardLayout>
    );
  }

  if (!primaryStation) return null;

  return (
    <DashboardLayout>
      <div id="dashboard-overview" className="px-4 lg:px-6 xl:px-8 2xl:px-10 py-6 max-w-screen-2xl mx-auto space-y-6">
        <Reveal>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.025em] text-foreground">Dashboard monitoring</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
              <span className="text-xs text-muted-foreground">{sourceLabel}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadMonitoring()}
              disabled={isMonitoringLoading}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted border border-border rounded-lg hover:text-foreground transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={isMonitoringLoading ? 'animate-spin' : ''} />
              Perbarui
            </button>
          </div>
        </div>
        </Reveal>

        <Reveal delay={30}>
          <EcoRiver3DViewer
            state={monitoring.deviceState}
            connected={monitoring.source.connectedToHardware}
          />
        </Reveal>

        <Reveal delay={40}>
        <div id="monitoring-overview">
          <KPIBentoGrid
            primaryStation={primaryStation}
            allStations={monitoring.sensors}
            alerts={monitoring.alerts}
            detections={monitoring.objectDetections}
          />
        </div>
        </Reveal>

        <Reveal delay={60}>
        <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-2 gap-4">
          <div id="water-level-trend">
            <WaterLevelChart data={monitoring.waterLevel.history} stationName={primaryStation.stationName} />
          </div>
          <WaterQualityChart
            data={monitoring.waterQuality.readings}
            stationName={monitoring.waterQuality.station?.stationName ?? 'Station tidak tersedia'}
          />
        </div>
        </Reveal>

        <Reveal delay={70}>
        <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <AlertsTable alerts={monitoring.alerts} />
          </div>
          <div id="station-status" className="space-y-4">
            <div id="active-devices">
              <StationStatusList stations={monitoring.sensors} />
            </div>
          </div>
        </div>
        </Reveal>

        <Reveal delay={80}>
        <div id="detection-feed">
          <AIDetectionFeed detections={monitoring.objectDetections} source={monitoring.source} />
        </div>
        </Reveal>
      </div>

      {pendingLoginReview}
    </DashboardLayout>
  );
}

export default function MonitoringDashboardPage() {
  return (
    <AuthProvider>
      <DashboardContent />
    </AuthProvider>
  );
}
