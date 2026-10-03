import React from 'react';
import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import AmbientPointer from '@/components/ui/AmbientPointer';
import BotpressWebchat from '@/components/BotpressWebchat';
import '../styles/tailwind.css';

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'EcoRiver — Platform Monitoring Sungai',
  description:
    'Kenali EcoRiver dan pantau kondisi sungai, status perangkat, pembacaan sensor, serta peringatan melalui satu dashboard.',
  icons: {
    icon: [{ url: '/favicon.ico', type: 'image/x-icon' }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* The app router root layout applies this font stylesheet to every route. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200..800&display=swap"
        />
        {/* Botpress requires both Webchat embed scripts in the document head. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://cdn.botpress.cloud/webchat/v5.0/inject.js" />
        <script
          src="https://files.bpcontent.cloud/2026/08/26/11/20260826110131-1N35Z0ZX.js"
          defer
        />
      </head>
      <body>
        <div className="site-content">{children}</div>
        <AmbientPointer />
        <BotpressWebchat />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--card)',
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
            },
          }}
        />

        <script type="module" async src="https://static.rocket.new/rocket-web.js?_cfg=https%3A%2F%2Fsmartriver9806back.builtwithrocket.new&_be=https%3A%2F%2Fappanalytics.rocket.new&_v=0.1.20" />
        <script type="module" defer src="https://static.rocket.new/rocket-shot.js?v=0.0.2" />
      </body>
    </html>
  );
}
