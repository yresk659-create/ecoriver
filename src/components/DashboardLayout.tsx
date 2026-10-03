'use client';
import React, { useState, useEffect, useRef } from 'react';
import AppLogo from '@/components/ui/AppLogo';
import { LayoutDashboard, Activity, Map, Cpu, MonitorSpeaker, Camera, Brain, BarChart3, Bell, Bot, Tablet, Settings, LogOut, ChevronLeft, ChevronRight, SunMoon, Menu, X } from 'lucide-react';
import { useAuth } from '@/lib/authContext';

type SidebarAction = 'notifications' | 'assistant' | 'settings';

interface SidebarItem {
  id: string;
  label: string;
  icon: React.ElementType;
  target?: string | string[];
  action?: SidebarAction;
}

const navItems: SidebarItem[] = [
  { id: 'nav-dashboard', label: 'Dashboard', icon: LayoutDashboard, target: 'dashboard-overview' },
  { id: 'nav-monitoring', label: 'Monitoring', icon: Activity, target: 'monitoring-overview' },
  { id: 'nav-map', label: 'Peta', icon: Map, target: ['device-location', 'station-status'] },
  { id: 'nav-sensors', label: 'Sensor', icon: Cpu, target: ['sensor-metrics', 'monitoring-overview', 'station-status'] },
  { id: 'nav-devices', label: 'Perangkat', icon: MonitorSpeaker, target: 'device-model' },
  { id: 'nav-cameras', label: 'Kamera', icon: Camera, target: 'detection-feed' },
  { id: 'nav-ai-detection', label: 'Deteksi AI', icon: Brain, target: 'detection-feed' },
  { id: 'nav-analytics', label: 'Analitik', icon: BarChart3, target: ['analytics-overview', 'water-level-trend'] },
  { id: 'nav-notifications', label: 'Notifikasi', icon: Bell, action: 'notifications' },
  { id: 'nav-ai-assistant', label: 'Asisten AI', icon: Bot, action: 'assistant' },
  { id: 'nav-active-devices', label: 'Perangkat Aktif', icon: Tablet, target: 'active-devices' },
];

const bottomItems: SidebarItem[] = [
  { id: 'nav-settings', label: 'Tema', icon: Settings, action: 'settings' },
];

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileVisible, setMobileVisible] = useState(false);
  const [darkMode, setDarkMode] = useState(() =>
    typeof document === 'undefined' ? true : document.documentElement.classList.contains('dark')
  );
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifVisible, setNotifVisible] = useState(false);
  const [activeNav, setActiveNav] = useState('nav-dashboard');
  const [navIndicatorDuration, setNavIndicatorDuration] = useState(300);
  const { user, logout, notifications, markNotificationAsRead, openPendingSession } = useAuth();

  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const activeNavIndex = navItems.findIndex((item) => item.id === activeNav);

  const toggleDark = () => {
    setDarkMode((currentMode) => {
      const nextMode = !currentMode;
      document.documentElement.classList.toggle('dark', nextMode);
      document.documentElement.classList.toggle('light', !nextMode);
      return nextMode;
    });
  };

  // Smooth mobile sidebar open/close
  const openMobileSidebar = () => {
    setMobileOpen(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setMobileVisible(true)));
  };
  const closeMobileSidebar = () => {
    setMobileVisible(false);
    setTimeout(() => setMobileOpen(false), 300);
  };

  // Smooth notification open/close
  const toggleNotif = () => {
    if (!notifOpen) {
      setNotifOpen(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setNotifVisible(true)));
    } else {
      setNotifVisible(false);
      setTimeout(() => setNotifOpen(false), 250);
    }
  };

  const openNotifications = () => {
    if (notifOpen) return;
    setNotifOpen(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setNotifVisible(true)));
  };

  const closeAssistant = () => {
    window.dispatchEvent(new Event('riverwatch:close-assistant'));
  };

  const handleSidebarAction = (item: SidebarItem) => {
    const nextNavIndex = navItems.findIndex((navItem) => navItem.id === item.id);
    if (activeNavIndex >= 0 && nextNavIndex >= 0) {
      const travelledItems = Math.abs(nextNavIndex - activeNavIndex);
      setNavIndicatorDuration(Math.min(900, 260 + Math.max(0, travelledItems - 1) * 105));
    } else {
      setNavIndicatorDuration(300);
    }

    setActiveNav(item.id);

    if (item.action !== 'assistant') closeAssistant();

    if (item.action === 'notifications') {
      openNotifications();
    } else if (item.action === 'assistant') {
      window.dispatchEvent(
        new CustomEvent('riverwatch:open-assistant', {
          detail: { wide: true },
        })
      );
    } else if (item.action === 'settings') {
      toggleDark();
    } else if (item.target) {
      const targetIds = Array.isArray(item.target) ? item.target : [item.target];
      const target = targetIds
        .map((targetId) => document.getElementById(targetId))
        .find((element): element is HTMLElement => element !== null);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (mobileOpen) closeMobileSidebar();
  };

  // Close notif on outside click
  const notifRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifVisible(false);
        setTimeout(() => setNotifOpen(false), 250);
      }
    };
    if (notifOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [notifOpen]);

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className={`flex items-center ${collapsed ? 'justify-center px-2' : 'px-4'} py-4 border-b border-border`}>
        <div className="flex items-center gap-2 min-w-0">
          <AppLogo size={32} />
          {!collapsed && (
            <div className="min-w-0">
              <span className="font-bold text-sm text-foreground block leading-tight">Smart River</span>
              <span className="text-xs text-muted-foreground leading-tight">Monitoring perangkat</span>
            </div>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="px-3 py-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">Monitoring</p>
        </div>
      )}

      <nav className="relative flex-1 space-y-0.5 overflow-y-auto px-2 py-1 scrollbar-hide">
        <span
          aria-hidden="true"
          className={`sidebar-active-indicator pointer-events-none absolute left-2 right-2 top-1 h-10 will-change-transform rounded-lg border transition-[transform,opacity] ease-[cubic-bezier(0.4,0,0.2,1)] ${
            activeNavIndex >= 0 ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            transform: `translate3d(0, ${Math.max(activeNavIndex, 0) * 42}px, 0)`,
            transitionDuration: `${navIndicatorDuration}ms`,
          }}
        />
        {navItems.map((item) => {
          const NavIcon = item.icon;
          const isActive = activeNav === item.id;
          const badge = item.id === 'nav-notifications' ? unreadCount : undefined;
          return (
            <button
              type="button"
              key={item.id}
              onClick={() => handleSidebarAction(item)}
              title={collapsed ? item.label : undefined}
              className={`group relative z-10 flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left transition-colors duration-300 ease-out
                ${isActive
                  ? 'sidebar-nav-active' : 'text-foreground hover:bg-white/[0.035]'
                }
                ${collapsed ? 'justify-center' : ''}
              `}
              aria-current={isActive ? 'page' : undefined}
            >
              <NavIcon size={18} className="relative z-10 shrink-0 transition-[color,transform] duration-300 group-hover:scale-105" />
              {!collapsed && (
                <span className="relative z-10 truncate text-sm font-medium transition-colors duration-300">{item.label}</span>
              )}
              {!collapsed && badge && badge > 0 && (
                <span className="relative z-10 ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                   {badge}
                </span>
              )}
              {collapsed && badge && badge > 0 && (
                <span className="absolute right-1 top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                   {badge}
                </span>
              )}
              {collapsed && (
                <div className="pointer-events-none absolute left-full z-50 ml-2 translate-x-1 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground opacity-0 shadow-lg transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100">
                  {item.label}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="px-3 py-1">
          <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Akun</p>
        </div>
      )}

      <div className="px-2 py-1 space-y-0.5">
        {bottomItems.map((item) => {
          const BotIcon = item.icon;
          const isActive = activeNav === item.id;
          return (
            <button
              type="button"
              key={item.id}
              onClick={() => handleSidebarAction(item)}
              title={collapsed ? item.label : undefined}
              className={`group relative isolate flex h-10 w-full items-center gap-3 overflow-hidden rounded-lg px-3 text-left transition-colors duration-300 ease-out
                ${isActive ? 'sidebar-nav-active' : 'text-muted-foreground hover:bg-white/[0.035] hover:text-foreground'}
                ${collapsed ? 'justify-center' : ''}
              `}
              aria-current={isActive ? 'page' : undefined}
            >
              <span
                aria-hidden="true"
                className={`sidebar-active-indicator pointer-events-none absolute inset-0 -z-10 rounded-lg border transition-[opacity,transform] duration-300 ease-out ${
                  isActive ? 'scale-100 opacity-100' : 'scale-[0.96] opacity-0'
                }`}
              />
              <BotIcon
                size={18}
                className="shrink-0 transition-[color,transform] duration-300 group-hover:scale-105"
              />
              {!collapsed && <span className="text-sm font-medium transition-colors duration-300">{item.label}</span>}
              {collapsed && (
                <div className="pointer-events-none absolute left-full z-50 ml-2 translate-x-1 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground opacity-0 shadow-lg transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100">
                  {item.label}
                </div>
              )}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => {
            closeAssistant();
            void logout();
          }}
          title={collapsed ? 'Logout' : undefined}
          className={`group relative flex h-10 w-full items-center gap-3 rounded-lg px-3 transition-[color,background-color,transform] duration-200
            text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:translate-x-0.5
            ${collapsed ? 'justify-center' : ''}
          `}
        >
          <LogOut size={18} className="shrink-0 transition-transform duration-200 group-hover:scale-105" />
          {!collapsed && <span className="text-sm font-medium">Logout</span>}
          {collapsed && (
            <div className="pointer-events-none absolute left-full z-50 ml-2 translate-x-1 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground opacity-0 shadow-lg transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100">
              Logout
            </div>
          )}
        </button>
      </div>

    </div>
  );

  return (
    <div className="app-shell flex h-[100dvh] overflow-hidden">
      {/* Desktop Sidebar */}
      <aside
        className={`app-sidebar relative z-30 hidden shrink-0 flex-col border-r border-border lg:flex
          ${collapsed ? 'w-16' : 'w-60'}
        `}
        style={{ transition: 'width 300ms cubic-bezier(0.16,1,0.3,1)' }}
      >
        {renderSidebarContent()}
        <button
          type="button"
          onClick={() => setCollapsed((p) => !p)}
          className="icon-button absolute -right-3.5 top-20 z-40 h-7 w-7 rounded-full shadow-md"
          aria-label={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
        >
          <span
            style={{
              display: 'inline-flex',
              transition: 'transform 350ms cubic-bezier(0.4,0,0.2,1)',
              transform: collapsed ? 'rotate(0deg)' : 'rotate(0deg)',
            }}
          >
            {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
          </span>
        </button>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            style={{
              opacity: mobileVisible ? 1 : 0,
              transition: 'opacity 300ms ease',
            }}
            onClick={closeMobileSidebar}
          />
          <aside
            className="app-sidebar relative z-10 flex h-full w-64 flex-col border-r border-border"
            aria-label="Navigasi dashboard"
            style={{
              transform: mobileVisible ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 300ms cubic-bezier(0.4,0,0.2,1)',
            }}
          >
            <button
              type="button"
              onClick={closeMobileSidebar}
              className="icon-button absolute right-3 top-3 h-10 w-10 border-transparent bg-transparent"
              aria-label="Tutup sidebar"
            >
              <X size={20} />
            </button>
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="app-topbar z-20 flex h-16 shrink-0 items-center gap-4 border-b border-border px-4 lg:px-6">
          <button
            type="button"
            onClick={openMobileSidebar}
            className="icon-button h-10 w-10 lg:hidden"
            aria-label="Buka sidebar"
          >
            <Menu size={20} />
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="hidden h-1.5 w-1.5 rounded-full bg-primary sm:block" />
            <p className="truncate text-xs font-medium text-muted-foreground sm:text-sm">Workspace monitoring</p>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={toggleDark}
              className="theme-toggle-button icon-button h-10 w-10"
              aria-label={darkMode ? 'Gunakan tema terang' : 'Gunakan tema gelap'}
            >
              <SunMoon
                size={17}
                aria-hidden="true"
                className={`transition-transform duration-300 ease-out ${darkMode ? 'rotate-0' : 'rotate-180'}`}
              />
            </button>

            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={toggleNotif}
                className="icon-button relative h-10 w-10"
                aria-label={`Buka notifikasi${unreadCount > 0 ? `, ${unreadCount} belum dibaca` : ''}`}
                aria-expanded={notifOpen}
              >
                <Bell size={16} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-xs font-bold rounded-full flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div
                  className="fixed inset-x-4 top-[4.5rem] z-50 overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-lifted)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80"
                  role="dialog"
                  aria-label="Notifikasi akun"
                  style={{
                    opacity: notifVisible ? 1 : 0,
                    transform: notifVisible ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.97)',
                    transition: 'opacity 0.25s cubic-bezier(0.4,0,0.2,1), transform 0.25s cubic-bezier(0.4,0,0.2,1)',
                    transformOrigin: 'top right',
                  }}
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <span className="text-sm font-semibold text-foreground">Notifikasi</span>
                    <span className="text-xs text-primary font-medium">{unreadCount} belum dibaca</span>
                  </div>
                  <div className="max-h-80 overflow-y-auto scrollbar-hide">
                    {notifications.length === 0 && (
                      <p className="px-4 py-5 text-center text-xs text-muted-foreground">Belum ada notifikasi.</p>
                    )}
                    {notifications.map((n) => (
                      <button
                        type="button"
                        onClick={() => {
                          if (n.actionRequired && n.sessionId) {
                            void openPendingSession(n.sessionId);
                            setNotifVisible(false);
                            window.setTimeout(() => setNotifOpen(false), 250);
                          }
                          if (!n.read) void markNotificationAsRead(n.id);
                        }}
                        key={`notif-${n.id}`}
                        className={`block w-full px-4 py-3 border-b border-border last:border-0 text-left hover:bg-muted/50 transition-colors duration-150
                          ${!n.read ? 'bg-primary/5' : ''}
                        `}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${!n.read ? 'bg-primary' : 'bg-muted-foreground'}`} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{n.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.message}</p>
                            {n.actionRequired && (
                              <p className="mt-1 text-xs font-medium text-primary">Klik untuk meninjau perangkat</p>
                            )}
                            <p className="text-xs text-muted-foreground/60 mt-1">{n.timestamp}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pl-2 border-l border-border">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-primary text-xs font-bold">
                  {user?.nama?.charAt(0)?.toUpperCase() ?? '?'}
                </span>
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-semibold text-foreground leading-tight">{user?.nama ?? 'Pengguna'}</p>
                <p className="text-xs text-primary leading-tight">{user?.isOwner ? 'Owner' : 'User'}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
