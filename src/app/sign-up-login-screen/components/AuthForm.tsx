'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Eye, EyeOff, Loader2, CheckCircle2, AlertCircle,
  User, Mail, Lock, ArrowRight, RotateCcw, Shield,
} from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';
import OTPInput from './OTPInput';
import PasswordStrength from './PasswordStrength';
import { useAuth } from '@/lib/authContext';
import { useRouter } from 'next/navigation';

type AuthTab = 'login' | 'signup';
type AuthStep = 'form' | 'otp' | 'success';

interface LoginFormData {
  nama: string;
  password: string;
}

interface SignupFormData {
  nama: string;
  email: string;
  password: string;
  confirmPassword: string;
}

function CountdownTimer({ seconds, onExpire }: { seconds: number; onExpire: () => void }) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    setRemaining(seconds);
  }, [seconds]);

  useEffect(() => {
    if (remaining <= 0) {
      onExpire();
      return;
    }
    const t = setTimeout(() => setRemaining((p) => p - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, onExpire]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  return (
    <span className={`font-tabular font-semibold ${remaining <= 30 ? 'text-red-400' : 'text-primary'}`}>
      {mm}:{ss}
    </span>
  );
}

export default function AuthForm({ initialTab = 'login' }: { initialTab?: AuthTab }) {
  const [tab, setTab] = useState<AuthTab>(initialTab);
  const [step, setStep] = useState<AuthStep>('form');
  const [tabAnimating, setTabAnimating] = useState(false);
  const [otpValue, setOtpValue] = useState<string[]>(Array(6).fill(''));
  const [otpError, setOtpError] = useState(false);
  const [otpExpired, setOtpExpired] = useState(false);
  const [otpKey, setOtpKey] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [otpDestination, setOtpDestination] = useState('');
  const [otpDuration, setOtpDuration] = useState(5 * 60);
  const [apiError, setApiError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [isOtpVerifying, setIsOtpVerifying] = useState(false);
  const otpVerifyLockRef = useRef(false);
  const router = useRouter();
  const { login, signup, verifyOTP, resendOTP, user, sessionStatus, isLoading } = useAuth();

  const loginForm = useForm<LoginFormData>({ mode: 'onChange' });
  const signupForm = useForm<SignupFormData>({ mode: 'onChange' });

  const watchPassword = signupForm.watch('password', '');
  const watchConfirm = signupForm.watch('confirmPassword', '');

  const hidePassword = () => setShowPassword(false);
  const handlePasswordPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    setShowPassword(true);
  };
  const handlePasswordKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setShowPassword(true);
  };
  const handlePasswordKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    hidePassword();
  };

  const switchTab = (newTab: AuthTab) => {
    if (newTab === tab) return;
    setTabAnimating(true);
    hidePassword();
    otpVerifyLockRef.current = false;
    setIsOtpVerifying(false);
    setTimeout(() => {
      setTab(newTab);
      setStep('form');
      setApiError(null);
      setTabAnimating(false);
    }, 180);
  };

  const beginOtpStep = (destination?: string, expiresAt?: string) => {
    otpVerifyLockRef.current = false;
    setIsOtpVerifying(false);
    setOtpDestination(destination ?? 'email terdaftar Anda');
    setOtpDuration(secondsUntil(expiresAt));
    setStep('otp');
    setOtpValue(Array(6).fill(''));
    setOtpExpired(false);
    setOtpError(false);
    setApiError(null);
    setPendingApproval(false);
    setOtpKey((previous) => previous + 1);
  };

  const handleLoginSubmit = async (data: LoginFormData) => {
    setApiError(null);
    const result = await login(data.nama, data.password);
    if (result.success) {
      beginOtpStep(result.destination, result.expiresAt);
    } else {
      setApiError(result.error ?? 'Login belum dapat diproses.');
    }
  };

  const handleSignupSubmit = async (data: SignupFormData) => {
    setApiError(null);
    const result = await signup(data.nama, data.email, data.password);
    if (result.success) {
      beginOtpStep(result.destination, result.expiresAt);
    } else {
      setApiError(result.error ?? 'Pendaftaran belum dapat diproses.');
    }
  };

  const handleOTPVerify = useCallback(async (codeOverride?: string) => {
    const code = codeOverride ?? otpValue.join('');
    if (isLoading || otpExpired || !/^\d{6}$/.test(code) || otpVerifyLockRef.current) return;

    otpVerifyLockRef.current = true;
    setIsOtpVerifying(true);
    setOtpError(false);
    setApiError(null);

    let verified = false;
    try {
      const result = await verifyOTP(code);
      if (result.success) {
        verified = true;
        setPendingApproval(result.sessionStatus === 'pending');
        setStep('success');
        setTimeout(() => {
          router.push('/monitoring-dashboard');
        }, 1500);
        return;
      }

      setOtpError(true);
      setApiError(result.error ?? 'Kode OTP belum dapat diverifikasi.');
      setOtpValue(Array(6).fill(''));
      setOtpKey((previous) => previous + 1);
    } catch {
      setOtpError(true);
      setApiError('Kode OTP belum dapat diverifikasi. Silakan coba lagi.');
      setOtpValue(Array(6).fill(''));
      setOtpKey((previous) => previous + 1);
    } finally {
      if (!verified) {
        otpVerifyLockRef.current = false;
        setIsOtpVerifying(false);
      }
    }
  }, [isLoading, otpExpired, otpValue, router, verifyOTP]);

  const handleResendOTP = async () => {
    setApiError(null);
    const result = await resendOTP();
    if (result.success) {
      otpVerifyLockRef.current = false;
      setIsOtpVerifying(false);
      setOtpDestination(result.destination ?? otpDestination);
      setOtpDuration(secondsUntil(result.expiresAt));
      setOtpExpired(false);
      setOtpError(false);
      setOtpValue(Array(6).fill(''));
      setOtpKey((previous) => previous + 1);
    } else {
      setOtpError(true);
      setApiError(result.error ?? 'OTP belum dapat dikirim ulang.');
    }
  };

  useEffect(() => {
    if (!isLoading && user && sessionStatus !== 'pending' && step === 'form') {
      router.replace('/monitoring-dashboard');
    }
  }, [isLoading, router, sessionStatus, step, user]);

  const otpBusy = isLoading || isOtpVerifying;

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-x-hidden px-4 py-10 sm:px-6">
      {/* Background */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-primary/5 blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-accent/5 blur-3xl" />

      {/* Page entrance animation wrapper */}
      <div className="relative z-10 w-full max-w-md slide-up">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-3 mb-2">
            <AppLogo size={44} />
            <span className="text-2xl font-semibold tracking-[-0.035em] text-foreground">Smart River</span>
          </div>
          <p className="text-sm text-muted-foreground">RiverWatch Monitoring Platform</p>
        </div>

        {/* Card */}
        <div className="auth-card overflow-hidden rounded-2xl glass">
          {/* Step: Form */}
          {step === 'form' && (
            <>
              {/* Tabs */}
              <div className="flex border-b border-border">
                {(['login', 'signup'] as AuthTab[]).map((t) => (
                  <button
                    key={`tab-${t}`}
                    onClick={() => switchTab(t)}
                    className={`flex-1 py-4 text-sm font-semibold transition-[color,background-color,border-color] duration-200
                      ${tab === t
                        ? 'text-primary border-b-2 border-primary bg-primary/5' :'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                      }
                    `}
                  >
                    {t === 'login' ? 'Masuk' : 'Buat Akun'}
                  </button>
                ))}
              </div>

              {/* Form content with smooth tab switch */}
              <div
                className="p-6 space-y-5"
                style={{
                  opacity: tabAnimating ? 0 : 1,
                  transform: tabAnimating ? 'translateY(8px)' : 'translateY(0)',
                  transition: 'opacity 0.18s ease, transform 0.18s ease',
                }}
              >
                {tab === 'login' ? (
                  <form onSubmit={loginForm.handleSubmit(handleLoginSubmit)} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">
                        Nama
                      </label>
                      <div className="relative">
                        <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Nama lengkap Anda"
                          {...loginForm.register('nama', {
                            required: 'Nama wajib diisi',
                            minLength: { value: 2, message: 'Nama minimal 2 karakter' },
                          })}
                          className={`field-control w-full py-3 pl-10 pr-4 text-sm placeholder:text-muted-foreground
                            ${loginForm.formState.errors.nama ? 'border-red-500 focus:border-red-500' : ''}
                          `}
                        />
                      </div>
                      {loginForm.formState.errors.nama && (
                        <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                          <AlertCircle size={11} />
                          {loginForm.formState.errors.nama.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">
                        Password
                      </label>
                      <div className="relative">
                        <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Masukkan password"
                          {...loginForm.register('password', {
                            required: 'Password wajib diisi',
                            minLength: { value: 6, message: 'Password minimal 6 karakter' },
                          })}
                          className={`field-control w-full py-3 pl-10 pr-12 text-sm placeholder:text-muted-foreground
                            ${loginForm.formState.errors.password ? 'border-red-500 focus:border-red-500' : ''}
                          `}
                        />
                        <button
                          type="button"
                          onPointerDown={handlePasswordPointerDown}
                          onPointerUp={hidePassword}
                          onPointerLeave={hidePassword}
                          onPointerCancel={hidePassword}
                          onKeyDown={handlePasswordKeyDown}
                          onKeyUp={handlePasswordKeyUp}
                          onBlur={hidePassword}
                          className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 touch-none select-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
                          aria-label="Tekan dan tahan untuk menampilkan password"
                          aria-pressed={showPassword}
                          title="Tekan dan tahan untuk melihat password"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      {loginForm.formState.errors.password && (
                        <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                          <AlertCircle size={11} />
                          {loginForm.formState.errors.password.message}
                        </p>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="button-primary group w-full gap-2 py-3 text-sm font-semibold"
                    >
                      {isLoading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <>
                          Masuk
                          <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" />
                        </>
                      )}
                    </button>

                    <p className="text-center text-xs text-muted-foreground">
                      Belum punya akun?{' '}
                      <button
                        type="button"
                        onClick={() => switchTab('signup')}
                        className="text-primary hover:underline font-medium transition-colors duration-200"
                      >
                        Buat Akun
                      </button>
                    </p>
                  </form>
                ) : (
                  <form onSubmit={signupForm.handleSubmit(handleSignupSubmit)} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Nama</label>
                      <div className="relative">
                        <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Nama lengkap"
                          {...signupForm.register('nama', {
                            required: 'Nama wajib diisi',
                            minLength: { value: 2, message: 'Nama minimal 2 karakter' },
                          })}
                          className={`field-control w-full py-3 pl-10 pr-4 text-sm placeholder:text-muted-foreground
                            ${signupForm.formState.errors.nama ? 'border-red-500 focus:border-red-500' : ''}
                          `}
                        />
                      </div>
                      {signupForm.formState.errors.nama && (
                        <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                          <AlertCircle size={11} />
                          {signupForm.formState.errors.nama.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
                      <div className="relative">
                        <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="email"
                          placeholder="Alamat email Anda"
                          {...signupForm.register('email', {
                            required: 'Email wajib diisi',
                            pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Format email tidak valid' },
                          })}
                          className={`field-control w-full py-3 pl-10 pr-4 text-sm placeholder:text-muted-foreground
                            ${signupForm.formState.errors.email ? 'border-red-500 focus:border-red-500' : ''}
                          `}
                        />
                      </div>
                      {signupForm.formState.errors.email && (
                        <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                          <AlertCircle size={11} />
                          {signupForm.formState.errors.email.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
                      <p className="text-xs text-muted-foreground mb-1.5">Minimal 8 karakter dengan huruf kapital dan angka</p>
                      <div className="relative">
                        <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Masukkan password"
                          {...signupForm.register('password', {
                            required: 'Password wajib diisi',
                            minLength: { value: 8, message: 'Password minimal 8 karakter' },
                            pattern: {
                              value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
                              message: 'Harus mengandung huruf kapital, kecil, dan angka',
                            },
                          })}
                          className={`field-control w-full py-3 pl-10 pr-12 text-sm placeholder:text-muted-foreground
                            ${signupForm.formState.errors.password ? 'border-red-500 focus:border-red-500' : ''}
                          `}
                        />
                        <button
                          type="button"
                          onPointerDown={handlePasswordPointerDown}
                          onPointerUp={hidePassword}
                          onPointerLeave={hidePassword}
                          onPointerCancel={hidePassword}
                          onKeyDown={handlePasswordKeyDown}
                          onKeyUp={handlePasswordKeyUp}
                          onBlur={hidePassword}
                          className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 touch-none select-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
                          aria-label="Tekan dan tahan untuk menampilkan password"
                          aria-pressed={showPassword}
                          title="Tekan dan tahan untuk melihat password"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      {signupForm.formState.errors.password && (
                        <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                          <AlertCircle size={11} />
                          {signupForm.formState.errors.password.message}
                        </p>
                      )}
                      <PasswordStrength password={watchPassword} />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Konfirmasi Password</label>
                      <div className="relative">
                        <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="password"
                          placeholder="Ulangi password"
                          {...signupForm.register('confirmPassword', {
                            required: 'Konfirmasi password wajib diisi',
                            validate: (v) => v === watchPassword || 'Password tidak cocok',
                          })}
                          className={`field-control w-full py-3 pl-10 pr-4 text-sm placeholder:text-muted-foreground
                            ${signupForm.formState.errors.confirmPassword ? 'border-red-500 focus:border-red-500' : ''}
                          `}
                        />
                      </div>
                      {signupForm.formState.errors.confirmPassword && (
                        <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                          <AlertCircle size={11} />
                          {signupForm.formState.errors.confirmPassword.message}
                        </p>
                      )}
                      {watchConfirm && watchPassword && watchConfirm === watchPassword && (
                        <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                          <CheckCircle2 size={11} />
                          Password cocok
                        </p>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="button-primary group w-full gap-2 py-3 text-sm font-semibold"
                    >
                      {isLoading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <>
                          Buat Akun
                          <ArrowRight size={16} />
                        </>
                      )}
                    </button>

                    <p className="text-center text-xs text-muted-foreground">
                      Sudah punya akun?{' '}
                      <button
                        type="button"
                        onClick={() => switchTab('login')}
                        className="text-primary hover:underline font-medium transition-colors duration-200"
                      >
                        Masuk
                      </button>
                    </p>
                  </form>
                )}

                {apiError && (
                  <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 fade-in" role="alert">
                    <AlertCircle size={14} className="text-red-400 shrink-0" />
                    <p className="text-xs text-red-400">{apiError}</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Step: OTP */}
          {step === 'otp' && (
            <div className="space-y-6 p-6 slide-up">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto mb-4">
                  <Shield size={24} className="text-primary" />
                </div>
                <h2 className="text-lg font-bold text-foreground">
                  {tab === 'login' ? 'Verifikasi Login' : 'Verifikasi Email'}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Kode OTP telah dikirim ke
                </p>
                <p className="text-sm font-semibold text-primary mt-0.5">
                  {otpDestination || 'email terdaftar Anda'}
                </p>
              </div>

              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleOTPVerify();
                }}
              >
                <OTPInput
                  key={`otp-input-${otpKey}`}
                  value={otpValue}
                  onChange={setOtpValue}
                  onComplete={(code) => void handleOTPVerify(code)}
                  hasError={otpError}
                  disabled={otpBusy}
                />

                <p className="text-center text-xs text-muted-foreground" aria-live="polite">
                  {otpBusy ? 'Memverifikasi kode OTP...' : 'Kode akan diverifikasi setelah 6 angka terisi.'}
                </p>

                {otpError && (
                  <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 fade-in" role="alert">
                    <AlertCircle size={14} className="text-red-400 shrink-0" />
                    <p className="text-xs text-red-400">{apiError ?? 'Kode OTP tidak valid.'}</p>
                  </div>
                )}

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground text-xs">Kode berlaku:</span>
                  {otpExpired ? (
                    <span className="text-xs text-red-400 font-medium">Kode kedaluwarsa</span>
                  ) : (
                    <CountdownTimer
                      key={`timer-${otpKey}`}
                      seconds={otpDuration}
                      onExpire={() => setOtpExpired(true)}
                    />
                  )}
                </div>

                <button
                  type="submit"
                  disabled={otpBusy || otpValue.join('').length < 6 || otpExpired}
                  className="button-primary w-full gap-2 py-3 text-sm font-semibold"
                >
                  {otpBusy ? <Loader2 size={16} className="animate-spin" /> : 'Verifikasi'}
                </button>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('form');
                      setOtpValue(Array(6).fill(''));
                      setOtpError(false);
                      setOtpExpired(false);
                      setApiError(null);
                      otpVerifyLockRef.current = false;
                      setIsOtpVerifying(false);
                    }}
                    disabled={otpBusy}
                    className="text-xs text-muted-foreground transition-[color,transform] duration-200 hover:-translate-x-0.5 hover:text-foreground"
                  >
                    ← Kembali
                  </button>
                  <button
                    type="button"
                    onClick={handleResendOTP}
                    disabled={otpBusy}
                    className="flex items-center gap-1.5 text-xs font-medium text-primary transition-[color,transform] duration-200 hover:text-primary/80 active:scale-95"
                  >
                    <RotateCcw size={12} />
                    Kirim Ulang OTP
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Step: Success */}
          {step === 'success' && (
            <div className="space-y-4 p-8 text-center slide-up" aria-live="polite">
              <div className="w-16 h-16 rounded-2xl bg-green-500/15 flex items-center justify-center mx-auto">
                <CheckCircle2 size={32} className="text-green-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  {pendingApproval
                    ? 'Permintaan Login Dikirim'
                    : tab === 'login'
                      ? 'Login Berhasil!'
                      : 'Akun Berhasil Dibuat!'}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {pendingApproval
                    ? 'Menunggu persetujuan pemilik akun...'
                    : 'Mengalihkan ke dashboard...'}
                </p>
              </div>
              <div className="flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin text-primary" />
                <span className="text-sm text-primary font-medium">
                  {pendingApproval ? 'Memeriksa status perangkat' : 'Memuat dashboard'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          Smart River · Platform monitoring sungai
        </p>
      </div>
    </div>
  );
}

function secondsUntil(expiresAt: string | undefined): number {
  const timestamp = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (!Number.isFinite(timestamp)) return 5 * 60;
  return Math.max(1, Math.min(5 * 60, Math.ceil((timestamp - Date.now()) / 1000)));
}
