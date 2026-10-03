'use client';

import { useCallback, useEffect, useRef } from 'react';

type BotpressWebchatEvent = 'webchat:initialized' | 'webchat:opened' | 'webchat:closed';
type WebchatOpenSource = 'sidebar' | 'launcher' | null;

interface BotpressConversationStarter {
  id: string;
  text: string;
  title: string;
  icon: string;
  enabled: boolean;
}

const INDONESIAN_WEBCHAT_TRANSLATIONS: Record<string, string> = {
  'composer.placeholder': 'Ketik pesan Anda...',
  'composer.sendButton.ariaLabel': 'Kirim pesan',
  'composer.voiceButton.ariaLabel': 'Masukkan pesan dengan suara',
  'composer.fileButton.ariaLabel': 'Unggah file',
  'composer.messageInput.ariaLabel': 'Kolom pesan',
  'composer.emojiButton.ariaLabel': 'Pilih emoji',
  'fileAttachment.uploadError': 'File gagal diunggah',
  'fileAttachment.fallbackExtension': 'File',
  'fileAttachment.removeButton.ariaLabel': 'Hapus file',
  'header.defaultBotName': 'Asisten',
  'header.expandButton.ariaLabel': 'Buka informasi asisten',
  'header.sound.enable': 'Aktifkan suara chat',
  'header.sound.disable': 'Nonaktifkan suara chat',
  'header.menu.ariaLabel': 'Opsi lainnya',
  'header.expand': 'Perbesar jendela',
  'header.collapse': 'Kecilkan jendela',
  'header.mute': 'Bisukan',
  'header.unmute': 'Aktifkan suara',
  'conversationHistory.title': 'Percakapan',
  'conversationHistory.empty': 'Belum ada percakapan.',
  'conversationHistory.newConversation': 'Percakapan baru',
  'conversationHistory.sentAttachment': 'Mengirim lampiran',
  'conversationHistory.showButton.ariaLabel': 'Tampilkan riwayat percakapan',
  'restartConversation.title': 'Mulai percakapan baru',
  'restartConversation.description': 'Percakapan saat ini akan dihapus dan percakapan baru akan dimulai.',
  'restartConversation.confirm': 'Percakapan baru',
  'restartConversation.cancel': 'Batal',
  'restartConversation.button.ariaLabel': 'Mulai ulang percakapan',
  'closeButton.ariaLabel': 'Tutup RiverWatch AI',
  'feedback.title': 'Bantu kami menjadi lebih baik',
  'feedback.description': 'Sampaikan masukan Anda agar kami dapat meningkatkan layanan.',
  'feedback.confirm': 'Kirim masukan',
  'feedback.cancel': 'Batal',
  'feedback.placeholder': 'Ceritakan hal yang perlu kami perbaiki...',
  'error.configuration': 'Terjadi kesalahan konfigurasi',
  'error.bot': 'RiverWatch AI mengalami gangguan',
  'error.network': 'Terjadi gangguan jaringan',
  'error.disconnected': 'Koneksi terputus',
  'error.unexpected': 'Terjadi kesalahan tak terduga',
  'dropdown.placeholder': 'Pilih...',
  'message.status.delivered': 'Terkirim',
  'date.today': 'Hari ini',
  'date.yesterday': 'Kemarin',
  'hitl.passedToTeam': 'Diteruskan ke Team Support',
  'hitl.findingAgent': 'Mencari agen dukungan...',
  'hitl.supportAgent': 'Agen dukungan',
  'hitl.defaultAgentName': 'Agen',
  'hitl.agentJoined': '{name} bergabung dalam percakapan',
  'hitl.agentTransferred': 'Diteruskan kepada {name}',
  'hitl.agentLabel': '{name} · Dukungan',
  'hitl.ticketClosedBy': '{name} menutup tiket',
  'hitl.ticketClosed': 'Tiket ditutup',
  'hitl.waiting.title': 'Menunggu agen dukungan...',
  'hitl.waiting.sub': 'Biasanya memerlukan beberapa menit. Balasan akan muncul di sini.',
  'hitl.waiting.longTitle': 'Masih menunggu — proses lebih lama dari biasanya',
  'hitl.waiting.longSub': 'Anda dapat menutup jendela ini. Balasan akan tetap muncul di sini.',
  'csat.question': 'Bagaimana bantuan dari {name}?',
  'csat.questionGeneric': 'Bagaimana pengalaman Anda?',
  'csat.sub': 'Penilaian bersifat opsional. Anda tetap dapat melanjutkan percakapan.',
  'csat.rate': 'Nilai percakapan ini',
  'csat.commentPlaceholder': 'Tambahkan komentar — opsional',
  'csat.sendComment': 'Kirim komentar',
  'csat.thanks': 'Terima kasih — masukan telah dikirim',
};

interface BotpressWebchatApi {
  open?: () => void;
  close?: () => void;
  on?: (event: BotpressWebchatEvent, handler: () => void) => void | (() => void);
  config?: (options: {
    configuration: {
      botName?: string;
      botDescription?: string;
      botAvatar?: string;
      fabImage?: string;
      footer?: string;
      themeMode?: 'dark' | 'light';
      language?: string;
      translations?: Record<string, string>;
      composerPlaceholder?: string;
      welcomeHeading?: string;
      welcomeSubtitle?: string;
      conversationStartersEnabled?: boolean;
      conversationStarters?: BotpressConversationStarter[];
      email?: {
        title: string;
        link: string;
      };
    };
  }) => void;
}

declare global {
  interface Window {
    botpress?: BotpressWebchatApi;
  }
}

export default function BotpressWebchat() {
  const initializedRef = useRef(false);
  const pendingOpenRef = useRef(false);
  const webchatRenderedOpenRef = useRef(false);
  const openSourceRef = useRef<WebchatOpenSource>(null);

  const setWideMode = useCallback((wide: boolean) => {
    if (wide) {
      document.documentElement.dataset.riverwatchWebchat = 'wide';
      return;
    }

    delete document.documentElement.dataset.riverwatchWebchat;
  }, []);

  const applyRiverWatchBranding = useCallback(() => {
    const conversationAvatarUrl = new URL('/assets/images/riverwatch-ai-bar.png', window.location.origin).toString();
    const launcherLogoUrl = new URL(
      '/assets/images/riverwatch-ai-logo.png',
      window.location.origin
    ).toString();
    const themeMode = document.documentElement.classList.contains('light') ? 'light' : 'dark';
    window.botpress?.config?.({
      configuration: {
        botName: 'RiverWatch AI',
        botDescription: '',
        botAvatar: conversationAvatarUrl,
        fabImage: launcherLogoUrl,
        footer: '',
        themeMode,
        language: 'id',
        translations: INDONESIAN_WEBCHAT_TRANSLATIONS,
        composerPlaceholder: 'Ketik pesan Anda...',
        welcomeHeading: 'Halo, ada yang bisa kami bantu?',
        welcomeSubtitle: 'Pilih topik awal atau tulis pertanyaan Anda dengan kata-kata sendiri.',
        conversationStartersEnabled: true,
        conversationStarters: [
          {
            id: 'how_it_works',
            text: 'Bagaimana cara kerja Smart River?',
            title: 'Cara Kerja',
            icon: 'circle-help',
            enabled: true,
          },
          {
            id: 'contact_support',
            text: 'Saya membutuhkan bantuan langsung dari Team Support Smart River. Tolong arahkan saya untuk menghubungi smartriver.auth@gmail.com melalui email.',
            title: 'Hubungi Dukungan',
            icon: 'message-circle',
            enabled: true,
          },
          {
            id: 'manage_account',
            text: 'Bagaimana cara mengelola akun Smart River?',
            title: 'Kelola Akun',
            icon: 'user',
            enabled: true,
          },
        ],
        email: {
          title: 'Team Support · smartriver.auth@gmail.com',
          link: 'mailto:smartriver.auth@gmail.com?subject=Dukungan%20Smart%20River',
        },
      },
    });
  }, []);

  const openWebchat = useCallback((event?: Event) => {
    if (event instanceof CustomEvent && event.detail?.wide === true) {
      openSourceRef.current = 'sidebar';
      webchatRenderedOpenRef.current = false;
      setWideMode(true);
    }

    const botpress = window.botpress;
    if (initializedRef.current && botpress?.open) {
      pendingOpenRef.current = false;
      botpress.open();
      return;
    }

    pendingOpenRef.current = true;
  }, [setWideMode]);

  const closeWebchat = useCallback(() => {
    pendingOpenRef.current = false;
    webchatRenderedOpenRef.current = false;
    openSourceRef.current = null;
    setWideMode(false);
    window.botpress?.close?.();
  }, [setWideMode]);

  const closeActiveWebchat = useCallback(() => {
    const renderedWebchatIsOpen = Boolean(
      document.querySelector<HTMLElement>('.bpWebchat[data-open="true"]')
    );
    if (openSourceRef.current === null && !renderedWebchatIsOpen) return;
    closeWebchat();
  }, [closeWebchat]);

  useEffect(() => {
    const botpress = window.botpress;
    if (botpress?.open) {
      initializedRef.current = true;
      applyRiverWatchBranding();
    }

    const unsubscribers = [
      botpress?.on?.('webchat:initialized', () => {
        initializedRef.current = true;
        applyRiverWatchBranding();
        if (pendingOpenRef.current) openWebchat();
      }),
      botpress?.on?.('webchat:opened', () => {
        webchatRenderedOpenRef.current = true;
        if (openSourceRef.current !== 'sidebar') {
          openSourceRef.current = 'launcher';
          setWideMode(false);
        }
      }),
      botpress?.on?.('webchat:closed', () => {
        webchatRenderedOpenRef.current = false;
        openSourceRef.current = null;
        setWideMode(false);
      }),
    ];

    const handleOutsidePointer = (event: PointerEvent) => {
      const renderedWebchatIsOpen = Boolean(
        document.querySelector<HTMLElement>('.bpWebchat[data-open="true"]')
      );
      if (openSourceRef.current === null && !renderedWebchatIsOpen) return;

      const clickStayedInWebchat = event.composedPath().some((node) => {
        if (!(node instanceof Element)) return false;
        return Boolean(
          node.closest(
            '.bpWebchat, .bpFabWrapper, .bpFabContainer, .bpProactiveBubbleContainer, #nav-ai-assistant'
          )
        );
      });
      if (clickStayedInWebchat) return;

      closeActiveWebchat();
    };

    const webchatVisibilityObserver = new MutationObserver(() => {
      const renderedWebchatIsOpen = Boolean(
        document.querySelector<HTMLElement>('.bpWebchat[data-open="true"]')
      );

      if (renderedWebchatIsOpen) {
        webchatRenderedOpenRef.current = true;
        if (openSourceRef.current === null) openSourceRef.current = 'launcher';
        return;
      }

      if (
        webchatRenderedOpenRef.current &&
        document.documentElement.dataset.riverwatchWebchat === 'wide'
      ) {
        webchatRenderedOpenRef.current = false;
        openSourceRef.current = null;
        setWideMode(false);
      }
    });
    webchatVisibilityObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-open'],
      childList: true,
      subtree: true,
    });

    const themeObserver = new MutationObserver(() => {
      if (initializedRef.current) applyRiverWatchBranding();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    window.addEventListener('riverwatch:open-assistant', openWebchat);
    window.addEventListener('riverwatch:close-assistant', closeActiveWebchat);
    document.addEventListener('pointerdown', handleOutsidePointer, true);
    if (pendingOpenRef.current && initializedRef.current) openWebchat();

    return () => {
      window.removeEventListener('riverwatch:open-assistant', openWebchat);
      window.removeEventListener('riverwatch:close-assistant', closeActiveWebchat);
      document.removeEventListener('pointerdown', handleOutsidePointer, true);
      themeObserver.disconnect();
      webchatVisibilityObserver.disconnect();
      setWideMode(false);
      for (const unsubscribe of unsubscribers) {
        if (typeof unsubscribe === 'function') unsubscribe();
      }
    };
  }, [applyRiverWatchBranding, closeActiveWebchat, openWebchat, setWideMode]);

  return null;
}
