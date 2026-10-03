'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { AuthState, Notification, Session, SessionStatus, User } from './types';

type OtpPurpose = 'login' | 'signup';
type ActiveSessionStatus = Extract<SessionStatus, 'owner' | 'allowed' | 'pending'>;

interface AuthActionResult {
  success: boolean;
  error?: string;
  requireOTP?: boolean;
  destination?: string;
  expiresAt?: string;
  sessionStatus?: ActiveSessionStatus;
}

interface AuthContextType {
  user: User | null;
  authState: AuthState;
  sessionStatus: ActiveSessionStatus | null;
  sessions: Session[];
  pendingSession: Session | null;
  notifications: Notification[];
  login: (nama: string, password: string) => Promise<AuthActionResult>;
  signup: (nama: string, email: string, password: string) => Promise<AuthActionResult>;
  verifyOTP: (otp: string) => Promise<AuthActionResult>;
  resendOTP: () => Promise<AuthActionResult>;
  logout: () => Promise<void>;
  allowSession: (sessionId: string) => Promise<AuthActionResult>;
  blockSession: (sessionId: string) => Promise<AuthActionResult>;
  dismissPendingSession: () => void;
  openPendingSession: (sessionId: string) => Promise<void>;
  markNotificationAsRead: (notificationId: string) => Promise<void>;
  refreshSession: () => Promise<void>;
  isLoading: boolean;
}

interface ApiPayload {
  error?: unknown;
  user?: unknown;
  sessionStatus?: unknown;
  sessions?: unknown;
  session?: unknown;
  notifications?: unknown;
  notification?: unknown;
  destination?: unknown;
  expiresAt?: unknown;
}

const AuthContext = createContext<AuthContextType | null>(null);

function errorFrom(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    typeof (payload as { error?: unknown }).error === 'string'
  ) {
    return (payload as { error: string }).error;
  }
  return fallback;
}

async function responsePayload(response: Response): Promise<ApiPayload> {
  try {
    return (await response.json()) as ApiPayload;
  } catch {
    return {};
  }
}

function isUser(value: unknown): value is User {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<User>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.nama === 'string' &&
    typeof candidate.email === 'string' &&
    typeof candidate.isOwner === 'boolean' &&
    typeof candidate.currentDevice === 'string'
  );
}

function isSessionStatus(value: unknown): value is ActiveSessionStatus {
  return value === 'owner' || value === 'allowed' || value === 'pending';
}

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Session>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.userId === 'string' &&
    typeof candidate.deviceName === 'string' &&
    typeof candidate.browser === 'string' &&
    typeof candidate.os === 'string' &&
    typeof candidate.status === 'string'
  );
}

function isNotification(value: unknown): value is Notification {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Notification>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.timestamp === 'string' &&
    typeof candidate.read === 'boolean'
  );
}

function responseString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

const requestOptions: RequestInit = { credentials: 'same-origin' };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authState, setAuthState] = useState<AuthState>('logged_out');
  const [sessionStatus, setSessionStatus] = useState<ActiveSessionStatus | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [pendingSession, setPendingSession] = useState<Session | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [otpTarget, setOtpTarget] = useState<OtpPurpose | null>(null);
  const dismissedPendingSessionIds = useRef<Set<string>>(new Set());

  // Remove the legacy session key from earlier frontend builds. Real
  // sessions are server-side and represented only by HttpOnly cookies.
  useEffect(() => {
    window.localStorage.removeItem('smartriver_session');
  }, []);

  const clearLocalAuthState = useCallback(() => {
    setUser(null);
    setAuthState('logged_out');
    setSessionStatus(null);
    setSessions([]);
    setPendingSession(null);
    setNotifications([]);
    dismissedPendingSessionIds.current.clear();
  }, []);

  const fetchSessions = useCallback(async (): Promise<Session[]> => {
    try {
      const response = await fetch('/api/auth/sessions', requestOptions);
      const payload = await responsePayload(response);
      if (!response.ok || !Array.isArray(payload.sessions)) {
        setSessions([]);
        setPendingSession(null);
        return [];
      }

      const nextSessions = payload.sessions.filter(isSession);
      const activePendingIds = new Set(
        nextSessions
          .filter((session) => session.status === 'pending' && !session.isCurrentDevice)
          .map((session) => session.id)
      );
      for (const sessionId of dismissedPendingSessionIds.current) {
        if (!activePendingIds.has(sessionId)) dismissedPendingSessionIds.current.delete(sessionId);
      }
      setSessions(nextSessions);
      setPendingSession((current) => {
        if (
          current &&
          activePendingIds.has(current.id) &&
          !dismissedPendingSessionIds.current.has(current.id)
        ) {
          return current;
        }
        return (
          nextSessions.find(
            (session) =>
              session.status === 'pending' &&
              !session.isCurrentDevice &&
              !dismissedPendingSessionIds.current.has(session.id)
          ) ?? null
        );
      });
      return nextSessions;
    } catch {
      setSessions([]);
      setPendingSession(null);
      return [];
    }
  }, []);

  const fetchNotifications = useCallback(async (): Promise<Notification[]> => {
    try {
      const response = await fetch('/api/notifications', requestOptions);
      const payload = await responsePayload(response);
      if (!response.ok || !Array.isArray(payload.notifications)) {
        setNotifications([]);
        return [];
      }
      const nextNotifications = payload.notifications.filter(isNotification);
      setNotifications(nextNotifications);
      return nextNotifications;
    } catch {
      setNotifications([]);
      return [];
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me', requestOptions);
      const payload = await responsePayload(response);
      if (!response.ok || !isUser(payload.user)) {
        clearLocalAuthState();
        return;
      }

      const nextStatus = isSessionStatus(payload.sessionStatus) ? payload.sessionStatus : 'allowed';
      setUser(payload.user);
      setSessionStatus(nextStatus);
      setAuthState(nextStatus === 'pending' ? 'pending_login_approval' : 'logged_in');
      if (nextStatus !== 'pending' && payload.user.isOwner) {
        await Promise.all([fetchSessions(), fetchNotifications()]);
      } else if (nextStatus !== 'pending') {
        await fetchNotifications();
        setSessions([]);
        setPendingSession(null);
      } else {
        setSessions([]);
        setPendingSession(null);
        setNotifications([]);
      }
    } catch {
      clearLocalAuthState();
    }
  }, [clearLocalAuthState, fetchNotifications, fetchSessions]);

  useEffect(() => {
    let active = true;
    void refreshSession().finally(() => {
      if (active) setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [refreshSession]);

  // A newly logged-in device receives a pending cookie, while the owner needs
  // fresh device requests/notifications. Both are cookie-backed and only poll
  // a small auth endpoint; neither stores a token in the browser.
  useEffect(() => {
    if (sessionStatus !== 'pending' && sessionStatus !== 'owner') return;
    const interval = window.setInterval(() => {
      void refreshSession();
    }, sessionStatus === 'pending' ? 10_000 : 15_000);
    return () => window.clearInterval(interval);
  }, [refreshSession, sessionStatus]);

  const login = useCallback(async (nama: string, password: string): Promise<AuthActionResult> => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        ...requestOptions,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nama, password }),
      });
      const payload = await responsePayload(response);
      if (!response.ok) {
        return { success: false, error: errorFrom(payload, 'Login belum dapat diproses.') };
      }

      setOtpTarget('login');
      setAuthState('otp_required');
      return {
        success: true,
        requireOTP: true,
        destination: responseString(payload.destination),
        expiresAt: responseString(payload.expiresAt),
      };
    } catch {
      return { success: false, error: 'Koneksi ke server gagal. Silakan coba lagi.' };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signup = useCallback(
    async (nama: string, email: string, password: string): Promise<AuthActionResult> => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/auth/signup', {
          ...requestOptions,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nama, email, password }),
        });
        const payload = await responsePayload(response);
        if (!response.ok) {
          return { success: false, error: errorFrom(payload, 'Pendaftaran belum dapat diproses.') };
        }

        setOtpTarget('signup');
        setAuthState('otp_required');
        return {
          success: true,
          requireOTP: true,
          destination: responseString(payload.destination),
          expiresAt: responseString(payload.expiresAt),
        };
      } catch {
        return { success: false, error: 'Koneksi ke server gagal. Silakan coba lagi.' };
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const verifyOTP = useCallback(
    async (otp: string): Promise<AuthActionResult> => {
      if (!otpTarget) {
        return { success: false, error: 'Sesi OTP tidak ditemukan. Mulai kembali proses masuk atau daftar.' };
      }

      setIsLoading(true);
      try {
        const response = await fetch('/api/auth/verify-otp', {
          ...requestOptions,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: otp, purpose: otpTarget }),
        });
        const payload = await responsePayload(response);
        if (!response.ok || !isUser(payload.user)) {
          return { success: false, error: errorFrom(payload, 'Kode OTP belum dapat diverifikasi.') };
        }

        const nextStatus = isSessionStatus(payload.sessionStatus) ? payload.sessionStatus : 'allowed';
        setUser(payload.user);
        setSessionStatus(nextStatus);
        setAuthState(nextStatus === 'pending' ? 'pending_login_approval' : 'logged_in');
        setOtpTarget(null);
        if (nextStatus !== 'pending' && payload.user.isOwner) {
          await Promise.all([fetchSessions(), fetchNotifications()]);
        } else if (nextStatus !== 'pending') {
          await fetchNotifications();
          setSessions([]);
          setPendingSession(null);
        } else {
          setSessions([]);
          setPendingSession(null);
          setNotifications([]);
        }
        return { success: true, sessionStatus: nextStatus };
      } catch {
        return { success: false, error: 'Koneksi ke server gagal. Silakan coba lagi.' };
      } finally {
        setIsLoading(false);
      }
    },
    [fetchNotifications, fetchSessions, otpTarget]
  );

  const resendOTP = useCallback(async (): Promise<AuthActionResult> => {
    if (!otpTarget) {
      return { success: false, error: 'Sesi OTP tidak ditemukan. Mulai kembali proses masuk atau daftar.' };
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/resend-otp', {
        ...requestOptions,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose: otpTarget }),
      });
      const payload = await responsePayload(response);
      if (!response.ok) {
        return { success: false, error: errorFrom(payload, 'OTP belum dapat dikirim ulang.') };
      }
      return {
        success: true,
        destination: responseString(payload.destination),
        expiresAt: responseString(payload.expiresAt),
      };
    } catch {
      return { success: false, error: 'Koneksi ke server gagal. Silakan coba lagi.' };
    } finally {
      setIsLoading(false);
    }
  }, [otpTarget]);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await fetch('/api/auth/logout', { ...requestOptions, method: 'POST' });
    } catch {
      // The local view is still cleared: a later request cannot use stale UI state.
    } finally {
      clearLocalAuthState();
      setOtpTarget(null);
      setIsLoading(false);
    }
  }, [clearLocalAuthState]);

  const updateSession = useCallback(
    async (sessionId: string, action: 'allow' | 'revoke'): Promise<AuthActionResult> => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/auth/sessions/${encodeURIComponent(sessionId)}/${action}`, {
          ...requestOptions,
          method: 'POST',
        });
        const payload = await responsePayload(response);
        if (!response.ok || !isSession(payload.session)) {
          return { success: false, error: errorFrom(payload, 'Session perangkat belum dapat diperbarui.') };
        }
        await Promise.all([fetchSessions(), fetchNotifications()]);
        return { success: true };
      } catch {
        return { success: false, error: 'Koneksi ke server gagal. Silakan coba lagi.' };
      } finally {
        setIsLoading(false);
      }
    },
    [fetchNotifications, fetchSessions]
  );

  const allowSession = useCallback(
    (sessionId: string) => updateSession(sessionId, 'allow'),
    [updateSession]
  );
  const blockSession = useCallback(
    (sessionId: string) => updateSession(sessionId, 'revoke'),
    [updateSession]
  );
  const dismissPendingSession = useCallback(() => {
    setPendingSession((current) => {
      if (current) dismissedPendingSessionIds.current.add(current.id);
      return null;
    });
  }, []);
  const openPendingSession = useCallback(
    async (sessionId: string) => {
      let target = sessions.find(
        (session) => session.id === sessionId && session.status === 'pending' && !session.isCurrentDevice
      );
      // Notifications can outlive the in-memory session list. Refresh first so
      // a previously read/ignored notification remains actionable until the
      // associated login request has actually been resolved.
      if (!target) {
        const refreshedSessions = await fetchSessions();
        target = refreshedSessions.find(
          (session) => session.id === sessionId && session.status === 'pending' && !session.isCurrentDevice
        );
      }
      if (!target) return;

      // A read notification can still represent an unresolved device request.
      // Clicking it must explicitly reopen that request, even when another
      // pending device was previously dismissed or selected.
      dismissedPendingSessionIds.current.delete(sessionId);
      setPendingSession(target);
    },
    [fetchSessions, sessions]
  );

  const markNotificationAsRead = useCallback(async (notificationId: string) => {
    try {
      const response = await fetch(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
        ...requestOptions,
        method: 'POST',
      });
      const payload = await responsePayload(response);
      if (!response.ok || !isNotification(payload.notification)) return;
      const updatedNotification = payload.notification;
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === updatedNotification.id ? updatedNotification : notification
        )
      );
    } catch {
      // A failed read marker does not invalidate the authenticated session.
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        authState,
        sessionStatus,
        sessions,
        pendingSession,
        notifications,
        login,
        signup,
        verifyOTP,
        resendOTP,
        logout,
        allowSession,
        blockSession,
        dismissPendingSession,
        openPendingSession,
        markNotificationAsRead,
        refreshSession,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
