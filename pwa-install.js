/**
 * pwa-install.js — My Volley Scout
 * Gestisce:
 *  1. Registrazione Service Worker
 *  2. Banner installazione Android (beforeinstallprompt)
 *  3. Istruzioni installazione iOS Safari (Add to Home Screen)
 *  4. Rilevamento stato "già installata" (standalone mode)
 */

(function () {
    'use strict';

    // ─── Costanti ─────────────────────────────────────────────────────────────
    var LS_DISMISSED_KEY = 'pwa_install_dismissed';
    var LS_INSTALLED_KEY = 'pwa_installed';
    var DISMISS_DAYS = 14; // giorni prima di riproporre il banner dopo dismiss
    var BANNER_ID = 'mvs-pwa-install-banner';
    var _deferredPrompt = null;

    // ─── 1. Registrazione Service Worker ──────────────────────────────────────
    function registerSW() {
        if (!('serviceWorker' in navigator)) return;
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('/sw.js', { scope: '/' })
                .then(function (reg) {
                    // Controlla aggiornamenti ogni 60 minuti
                    setInterval(function () { reg.update(); }, 60 * 60 * 1000);
                })
                .catch(function (err) {
                    console.warn('[PWA] Service Worker non registrato:', err);
                });
        });
    }

    // ─── 2. Rilevamento dispositivo ───────────────────────────────────────────
    function isIOS() {
        return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    function isInStandaloneMode() {
        return window.navigator.standalone === true ||
            window.matchMedia('(display-mode: standalone)').matches ||
            document.referrer.includes('android-app://');
    }

    function isAndroid() {
        return /android/i.test(navigator.userAgent);
    }

    function isMobileBrowser() {
        return isIOS() || isAndroid() || /mobile/i.test(navigator.userAgent);
    }

    // ─── 3. Logica dismiss ────────────────────────────────────────────────────
    function isDismissed() {
        try {
            var val = localStorage.getItem(LS_DISMISSED_KEY);
            if (!val) return false;
            var ts = parseInt(val, 10);
            var days = (Date.now() - ts) / (1000 * 60 * 60 * 24);
            return days < DISMISS_DAYS;
        } catch (_) { return false; }
    }

    function setDismissed() {
        try { localStorage.setItem(LS_DISMISSED_KEY, String(Date.now())); } catch (_) {}
    }

    function isAlreadyInstalled() {
        try { return localStorage.getItem(LS_INSTALLED_KEY) === '1'; } catch (_) { return false; }
    }

    function setInstalled() {
        try { localStorage.setItem(LS_INSTALLED_KEY, '1'); } catch (_) {}
    }

    // ─── 4. Banner ────────────────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById('mvs-pwa-styles')) return;
        var style = document.createElement('style');
        style.id = 'mvs-pwa-styles';
        style.textContent = [
            '#' + BANNER_ID + ' {',
            '  position: fixed;',
            '  bottom: 0; left: 0; right: 0;',
            '  z-index: 99999;',
            '  background: #1e40af;',
            '  color: #fff;',
            '  padding: 12px 16px 12px 14px;',
            '  display: flex;',
            '  align-items: center;',
            '  gap: 10px;',
            '  box-shadow: 0 -2px 16px rgba(0,0,0,0.22);',
            '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
            '  font-size: 13px;',
            '  animation: mvsPwaSlideUp 0.35s ease;',
            '}',
            '@keyframes mvsPwaSlideUp {',
            '  from { transform: translateY(100%); opacity: 0; }',
            '  to   { transform: translateY(0);    opacity: 1; }',
            '}',
            '#' + BANNER_ID + ' .mvs-pwa-icon {',
            '  width: 44px; height: 44px;',
            '  border-radius: 10px;',
            '  flex-shrink: 0;',
            '  background: #fff;',
            '  padding: 2px;',
            '  object-fit: contain;',
            '}',
            '#' + BANNER_ID + ' .mvs-pwa-text {',
            '  flex: 1;',
            '  min-width: 0;',
            '}',
            '#' + BANNER_ID + ' .mvs-pwa-title {',
            '  font-weight: 700;',
            '  font-size: 14px;',
            '  margin-bottom: 2px;',
            '}',
            '#' + BANNER_ID + ' .mvs-pwa-subtitle {',
            '  font-size: 11.5px;',
            '  opacity: 0.85;',
            '  line-height: 1.4;',
            '}',
            '#' + BANNER_ID + ' .mvs-pwa-arrow {',
            '  font-size: 22px;',
            '  flex-shrink: 0;',
            '  opacity: 0.9;',
            '  animation: mvsPwaBounce 1.2s ease-in-out infinite;',
            '}',
            '@keyframes mvsPwaBounce {',
            '  0%, 100% { transform: translateY(0); }',
            '  50% { transform: translateY(-4px); }',
            '}',
            '#' + BANNER_ID + ' .mvs-pwa-btn-install {',
            '  background: #fff;',
            '  color: #1e40af;',
            '  border: none;',
            '  border-radius: 8px;',
            '  padding: 8px 14px;',
            '  font-weight: 700;',
            '  font-size: 13px;',
            '  cursor: pointer;',
            '  flex-shrink: 0;',
            '  white-space: nowrap;',
            '}',
            '#' + BANNER_ID + ' .mvs-pwa-btn-dismiss {',
            '  background: transparent;',
            '  color: rgba(255,255,255,0.7);',
            '  border: none;',
            '  font-size: 20px;',
            '  cursor: pointer;',
            '  padding: 0 2px;',
            '  flex-shrink: 0;',
            '  line-height: 1;',
            '}',
            '/* iOS share icon freccia */',
            '#' + BANNER_ID + ' .mvs-ios-share {',
            '  display: inline-block;',
            '  width: 20px; height: 20px;',
            '  background: url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'white\'%3E%3Cpath d=\'M12 2l-4 4h3v7h2V6h3L12 2zm-6 9v9h12v-9h-2v7H8v-7H6z\'/%3E%3C/svg%3E") center/contain no-repeat;',
            '  vertical-align: middle;',
            '  margin: 0 2px;',
            '}',
        ].join('\n');
        document.head.appendChild(style);
    }

    function removeBanner() {
        var el = document.getElementById(BANNER_ID);
        if (el) {
            el.style.animation = 'none';
            el.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            el.style.transform = 'translateY(100%)';
            el.style.opacity = '0';
            setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
        }
    }

    function showAndroidBanner() {
        if (document.getElementById(BANNER_ID)) return;
        injectStyles();

        var banner = document.createElement('div');
        banner.id = BANNER_ID;
        banner.innerHTML = [
            '<img class="mvs-pwa-icon" src="/LOGO_APP.png" alt="MyVolleyScout">',
            '<div class="mvs-pwa-text">',
            '  <div class="mvs-pwa-title">Installa MyVolleyScout</div>',
            '  <div class="mvs-pwa-subtitle">Aggiungila alla schermata home per usarla come app nativa</div>',
            '</div>',
            '<button type="button" class="mvs-pwa-btn-install" id="mvs-pwa-install-btn">Installa</button>',
            '<button type="button" class="mvs-pwa-btn-dismiss" id="mvs-pwa-dismiss-btn" title="Non ora">&#10005;</button>',
        ].join('');
        document.body.appendChild(banner);

        document.getElementById('mvs-pwa-install-btn').addEventListener('click', function () {
            if (!_deferredPrompt) return;
            _deferredPrompt.prompt();
            _deferredPrompt.userChoice.then(function (choice) {
                if (choice.outcome === 'accepted') {
                    setInstalled();
                }
                _deferredPrompt = null;
                removeBanner();
            });
        });

        document.getElementById('mvs-pwa-dismiss-btn').addEventListener('click', function () {
            setDismissed();
            removeBanner();
        });
    }

    function showIOSBanner() {
        if (document.getElementById(BANNER_ID)) return;
        injectStyles();

        var banner = document.createElement('div');
        banner.id = BANNER_ID;
        banner.innerHTML = [
            '<img class="mvs-pwa-icon" src="/LOGO_APP.png" alt="MyVolleyScout">',
            '<div class="mvs-pwa-text">',
            '  <div class="mvs-pwa-title">Installa MyVolleyScout</div>',
            '  <div class="mvs-pwa-subtitle">Tocca <strong>Condividi</strong> \uD83D\uDCE4 in basso, poi <strong>\u201CAggiungi alla schermata Home\u201D</strong></div>',
            '</div>',
            '<span class="mvs-pwa-arrow">&#x2B07;&#xFE0F;</span>',
            '<button type="button" class="mvs-pwa-btn-dismiss" id="mvs-pwa-dismiss-btn" title="Non ora">&#10005;</button>',
        ].join('');
        document.body.appendChild(banner);

        document.getElementById('mvs-pwa-dismiss-btn').addEventListener('click', function () {
            setDismissed();
            removeBanner();
        });
    }

    // ─── 5. Orchestrazione principale ─────────────────────────────────────────
    function init() {
        // Registra SW per tutti
        registerSW();

        // Non mostrare banner se già installata in standalone
        if (isInStandaloneMode()) {
            setInstalled();
            return;
        }

        // Non mostrare se già installata o dismiss recente
        if (isAlreadyInstalled() || isDismissed()) return;

        // ── Android: intercetta l'evento nativo ──
        window.addEventListener('beforeinstallprompt', function (e) {
            e.preventDefault();
            _deferredPrompt = e;
            // Mostra il banner dopo 3 secondi per non disturbare subito
            setTimeout(function () {
                if (!isInStandaloneMode()) showAndroidBanner();
            }, 3000);
        });

        // ── Rilevamento installazione completata (Android) ──
        window.addEventListener('appinstalled', function () {
            setInstalled();
            removeBanner();
        });

        // ── iOS Safari: mostra istruzioni manuali ──
        if (isIOS() && !isInStandaloneMode()) {
            // Mostra le istruzioni dopo 4 secondi
            setTimeout(function () {
                if (!isDismissed() && !isAlreadyInstalled() && !isInStandaloneMode()) {
                    showIOSBanner();
                }
            }, 4000);
        }
    }

    // Avvia quando il DOM è pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
