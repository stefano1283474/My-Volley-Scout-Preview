// Gestore delle connessioni Firebase per ridurre errori
class FirebaseConnectionManager {
    constructor() {
        this.isOnline = navigator.onLine;
        this.retryAttempts = 0;
        this.maxRetries = 3;
        this.retryDelay = 1000;
        this.connectionErrors = new Set();
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Monitora lo stato della connessione
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.retryAttempts = 0;
            console.log('Connessione ripristinata');
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            console.log('Connessione persa');
        });
    }
    
    // Verifica se possiamo tentare operazioni Firestore
    canAttemptFirestoreOperation() {
        if (!this.isOnline) {
            console.warn('Operazione Firestore saltata: offline');
            return false;
        }
        
        if (!window.authFunctions || typeof window.authFunctions.getCurrentUser !== 'function' || !window.authFunctions.getCurrentUser()) {
            console.warn('Operazione Firestore saltata: utente non autenticato');
            return false;
        }
        
        if (this.retryAttempts >= this.maxRetries) {
            console.warn('Operazione Firestore saltata: troppi tentativi falliti');
            return false;
        }
        
        return true;
    }
    
    // Wrapper per operazioni Firestore con gestione errori
    async executeFirestoreOperation(operation, operationName = 'Operazione Firestore') {
        if (!this.canAttemptFirestoreOperation()) {
            return { success: false, error: 'Operazione non consentita' };
        }
        
        try {
            const result = await operation();
            this.retryAttempts = 0; // Reset su successo
            this.connectionErrors.delete(operationName);
            return result;
        } catch (error) {
            this.retryAttempts++;
            this.connectionErrors.add(operationName);
            
            console.error(`Errore in ${operationName}:`, error);
            
            // Se è un errore di rete, non ritentare immediatamente
            if (error.code === 'unavailable' || error.message.includes('net::ERR_ABORTED')) {
                console.warn(`Errore di rete in ${operationName}, operazione saltata`);
                return { success: false, error: 'Errore di rete' };
            }
            
            // Ritenta dopo un delay se non abbiamo superato il limite
            if (this.retryAttempts < this.maxRetries) {
                console.log(`Ritento ${operationName} tra ${this.retryDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                return this.executeFirestoreOperation(operation, operationName);
            }
            
            return { success: false, error: error.message };
        }
    }
    
    // Ottieni statistiche degli errori
    getErrorStats() {
        return {
            isOnline: this.isOnline,
            retryAttempts: this.retryAttempts,
            activeErrors: Array.from(this.connectionErrors),
            canOperate: this.canAttemptFirestoreOperation()
        };
    }
    
    // Reset degli errori
    resetErrors() {
        this.retryAttempts = 0;
        this.connectionErrors.clear();
        console.log('Errori di connessione resettati');
    }
}

// Istanza globale del gestore connessioni
const connectionManager = new FirebaseConnectionManager();

// Esponi globalmente
window.connectionManager = connectionManager;

// Funzione di utilità per operazioni Firestore sicure
window.safeFirestoreOperation = async (operation, operationName) => {
    return await connectionManager.executeFirestoreOperation(operation, operationName);
};

console.log('Connection Manager inizializzato');

(function () {
    window.MVS_APP_VERSION = '17.6.10';
    window.appBuild = window.appBuild || { version: '', commit: '' };
    window.appBuild.version = String(window.MVS_APP_VERSION || '');
    let deferredInstallPrompt = null;
    function isLocalhost() {
        const h = String(window.location?.hostname || '').toLowerCase();
        return h === 'localhost' || h === '127.0.0.1';
    }
    function isIosDevice() {
        const ua = String(navigator.userAgent || '').toLowerCase();
        const iPhoneOrIPad = /iphone|ipad|ipod/.test(ua);
        const iPadDesktopUa = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
        return iPhoneOrIPad || iPadDesktopUa;
    }
    function isStandaloneMode() {
        try {
            const standaloneIOS = window.navigator && window.navigator.standalone === true;
            const standaloneMedia = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
            return !!(standaloneIOS || standaloneMedia);
        } catch (_) { return false; }
    }
    function getInstallContext() {
        return {
            canPrompt: !!deferredInstallPrompt,
            isIOS: isIosDevice(),
            isStandalone: isStandaloneMode(),
            isLocal: isLocalhost()
        };
    }
    function getInstallMessage() {
        const ctx = getInstallContext();
        if (ctx.isStandalone) return 'App già installata su questo dispositivo';
        if (ctx.canPrompt) return 'Installazione disponibile';
        if (ctx.isIOS) return 'Su iPhone/iPad: Safari → Condividi → Aggiungi a Home';
        return 'Installazione non disponibile ora. Apri da browser supportato e connessione sicura HTTPS.';
    }
    async function promptInstall() {
        const ctx = getInstallContext();
        if (ctx.isStandalone) return { success: true, installed: true, reason: 'already-installed' };
        if (deferredInstallPrompt) {
            const promptRef = deferredInstallPrompt;
            deferredInstallPrompt = null;
            try { window.dispatchEvent(new CustomEvent('mvs-install-state')); } catch (_) {}
            await promptRef.prompt();
            const choice = await promptRef.userChoice;
            return { success: true, installed: choice?.outcome === 'accepted', outcome: choice?.outcome || '' };
        }
        if (ctx.isIOS) {
            return { success: false, installed: false, reason: 'ios-manual', message: getInstallMessage() };
        }
        return { success: false, installed: false, reason: 'not-available', message: getInstallMessage() };
    }
    window.pwaInstall = Object.assign(window.pwaInstall || {}, {
        getContext: getInstallContext,
        getMessage: getInstallMessage,
        prompt: promptInstall
    });
    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredInstallPrompt = event;
        try { window.dispatchEvent(new CustomEvent('mvs-install-state')); } catch (_) {}
    });
    window.addEventListener('appinstalled', () => {
        deferredInstallPrompt = null;
        try { window.dispatchEvent(new CustomEvent('mvs-install-state')); } catch (_) {}
    });
    if ('serviceWorker' in navigator) {
        const isSecure = window.isSecureContext || isLocalhost();
        if (isSecure) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').catch(() => {});
            });
        }
    }
    function ensureDialogCss() {
        try {
            if (document.getElementById('mvs-dialog-style')) return;
            const style = document.createElement('style');
            style.id = 'mvs-dialog-style';
            style.textContent = `
            .mvs-dialog-overlay{position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:10080;display:flex;align-items:center;justify-content:center;padding:16px;}
            .mvs-dialog-card{width:min(520px,94vw);background:#fff;border:1px solid #e5e7eb;border-radius:14px;box-shadow:0 18px 40px rgba(2,6,23,.35);padding:14px;}
            .mvs-dialog-title{font-size:1rem;font-weight:700;color:#0f172a;margin-bottom:8px;}
            .mvs-dialog-message{font-size:.95rem;line-height:1.4;color:#334155;white-space:pre-wrap;}
            .mvs-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px;}
            .mvs-dialog-btn{border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:10px;padding:8px 14px;font-size:.92rem;font-weight:600;cursor:pointer;}
            .mvs-dialog-btn:hover{background:#f8fafc;}
            .mvs-dialog-btn-primary{background:#2563eb;color:#fff;border-color:#2563eb;}
            .mvs-dialog-btn-primary:hover{background:#1d4ed8;}
            .mvs-dialog-btn-danger{background:#dc2626;color:#fff;border-color:#dc2626;}
            .mvs-dialog-btn-danger:hover{background:#b91c1c;}`;
            document.head.appendChild(style);
        } catch (_) {}
    }
    function closeDialog(overlay) {
        try { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (_) {}
    }
    function openDialog(options) {
        return new Promise((resolve) => {
            try {
                ensureDialogCss();
                const opts = options || {};
                const overlay = document.createElement('div');
                overlay.className = 'mvs-dialog-overlay';
                const card = document.createElement('div');
                card.className = 'mvs-dialog-card';
                const title = document.createElement('div');
                title.className = 'mvs-dialog-title';
                title.textContent = String(opts.title || 'Conferma');
                const msg = document.createElement('div');
                msg.className = 'mvs-dialog-message';
                msg.textContent = String(opts.message || '');
                const actions = document.createElement('div');
                actions.className = 'mvs-dialog-actions';
                const cancelBtn = document.createElement('button');
                cancelBtn.type = 'button';
                cancelBtn.className = 'mvs-dialog-btn';
                cancelBtn.textContent = String(opts.cancelText || 'Annulla');
                const okBtn = document.createElement('button');
                okBtn.type = 'button';
                okBtn.className = 'mvs-dialog-btn mvs-dialog-btn-primary';
                if (opts.variant === 'danger') okBtn.className = 'mvs-dialog-btn mvs-dialog-btn-danger';
                okBtn.textContent = String(opts.okText || 'Conferma');
                if (opts.onlyOk) cancelBtn.style.display = 'none';
                actions.appendChild(cancelBtn);
                actions.appendChild(okBtn);
                card.appendChild(title);
                card.appendChild(msg);
                card.appendChild(actions);
                overlay.appendChild(card);
                const finish = (v) => {
                    closeDialog(overlay);
                    resolve(!!v);
                };
                cancelBtn.addEventListener('click', () => finish(false));
                okBtn.addEventListener('click', () => finish(true));
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) finish(false);
                });
                const onKey = (e) => {
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        finish(false);
                    } else if (e.key === 'Enter') {
                        e.preventDefault();
                        finish(true);
                    }
                };
                overlay.addEventListener('keydown', onKey);
                document.body.appendChild(overlay);
                okBtn.focus();
            } catch (_) {
                resolve(false);
            }
        });
    }
    window.mvsDialog = Object.assign(window.mvsDialog || {}, {
        confirm: async (message, opts) => openDialog(Object.assign({}, opts || {}, { message: String(message || ''), onlyOk: false })),
        alert: async (message, opts) => openDialog(Object.assign({}, opts || {}, { message: String(message || ''), onlyOk: true, okText: (opts && opts.okText) || 'OK' }))
    });
    function renderVersion() {
        const nodes = document.querySelectorAll('.app-version');
        if (!nodes || !nodes.length) return;
        const text = 'MyVolleyScout Vers. ' + String(window.MVS_APP_VERSION || '');
        nodes.forEach((el) => {
            el.textContent = text;
        });
    }
    function ensureMenuCss() {
        try {
            if (document.getElementById('mvs-menu-unified-style')) return;
            const s = document.createElement('style');
            s.id = 'mvs-menu-unified-style';
            s.textContent = `
            .top-account-menu, .account-dropdown{
                border:1px solid #e5e7eb !important;
                border-radius:14px !important;
                box-shadow:0 10px 24px rgba(15,23,42,0.14) !important;
                padding:8px !important;
                min-width:240px !important;
                max-width:min(92vw,360px) !important;
                background:#fff !important;
            }
            .top-account-menu .menu-title, .account-dropdown .menu-title{
                font-size:12px !important;
                color:#64748b !important;
                font-weight:700 !important;
                text-transform:uppercase !important;
                letter-spacing:.04em !important;
                padding:6px 10px !important;
            }
            .top-account-menu .menu-divider, .account-dropdown .menu-divider{
                height:1px !important;
                background:#e5e7eb !important;
                margin:6px 0 !important;
            }
            .top-account-menu .menu-item, .account-dropdown .menu-item{
                width:100% !important;
                border:none !important;
                background:transparent !important;
                border-radius:10px !important;
                padding:9px 10px !important;
                color:#0f172a !important;
                font-size:16px !important;
                line-height:1.15 !important;
            }
            .top-account-menu .menu-item:hover, .account-dropdown .menu-item:hover{
                background:#f1f5ff !important;
            }
            .top-account-menu .menu-item-muted, .account-dropdown .menu-item-muted{
                color:#334155 !important;
                font-weight:600 !important;
                cursor:default !important;
                background:transparent !important;
            }
            .top-account-menu .menu-footer-version, .account-dropdown .menu-footer-version{
                color:#64748b !important;
                font-weight:600 !important;
            }`;
            document.head.appendChild(s);
        } catch (_) {}
    }
    function normalizeMenuLabelById(el) {
        try {
            if (!el || !el.id) return;
            const map = {
                goToTeamsBtn: 'Vai a Elenco Squadre',
                goToTeamsBtnMobile: 'Vai a Elenco Squadre',
                goToMatchesBtn: 'Vai a Elenco Partite',
                goToMatchesBtnMobile: 'Vai a Elenco Partite',
                goToSettingsBtn: 'Impostazioni',
                installAppBtn: 'Installa app',
                hydrateDataBtn: 'Aggiorna Locale da Cloud',
                syncDataBtn: 'Aggiorna Cloud da Locale',
                purgeAllBtn: 'Pulisci dati locali',
                accountLogout: 'Logout',
                signOutBtnMobile: 'Logout',
                exitToWelcomeBtnMobile: 'Esci',
                importAllMatchesBtn: 'Importa partite',
                deleteAllMatchesBtn: 'Elimina gare',
                exportAllMatchesBtn: 'Esporta tutte le gare',
                exportSetsBtnMobile: 'Esporta Partita (Xls)',
                saveMatchMetaBtn: 'Salva'
            };
            const next = map[el.id];
            if (next) el.textContent = next;
        } catch (_) {}
    }
    function unifySingleUserMenu(menu) {
        try {
            if (!menu) return;
            menu.classList.add('top-account-menu');
            menu.classList.remove('account-dropdown');
            const entries = Array.from(menu.children || []);
            if (!entries.length) return;
            const byId = new Map();
            entries.forEach((el) => {
                if (el && el.id) byId.set(el.id, el);
            });
            const isLegacySettingsNode = (el) => {
                try {
                    if (!el) return false;
                    const txt = String(el.textContent || '').trim().toLowerCase();
                    if (el.id && /settings/i.test(el.id)) return true;
                    if (el.hasAttribute && /settings\.html/.test(String(el.getAttribute('data-mvs-route') || ''))) return true;
                    if (el.matches && el.matches('label') && el.querySelector('input[type="checkbox"]')) return true;
                    if (!el.id && (txt === 'impostazioni' || txt.includes('salvataggi automatici') || txt.includes('pulisci i progressivi'))) return true;
                    return false;
                } catch (_) { return false; }
            };
            const extract = (idList) => {
                const out = [];
                idList.forEach((id) => {
                    const el = byId.get(id);
                    if (el) out.push(el);
                });
                return out;
            };
            const emailNode = byId.get('accountEmail') || null;
            if (emailNode) emailNode.classList.add('menu-item', 'menu-item-muted');
            const quickSaveNodes = extract(['save-match-btn']);
            const navNodes = extract(['goToTeamsBtn', 'goToTeamsBtnMobile', 'goToMatchesBtn', 'goToMatchesBtnMobile']);
            const actionNodes = extract(['installAppBtn', 'exportSetsBtnMobile', 'importAllMatchesBtn', 'deleteAllMatchesBtn', 'exportAllMatchesBtn', 'hydrateDataBtn', 'syncDataBtn', 'purgeAllBtn']);
            const sessionNodes = extract(['exitToWelcomeBtnMobile', 'accountLogout', 'signOutBtnMobile']);
            const settingsNodes = entries.filter((el) => isLegacySettingsNode(el));
            const settingsEntry = (() => {
                const existing = byId.get('goToSettingsBtn');
                if (existing) return existing;
                const legacy = settingsNodes.find((el) => el && el.tagName === 'BUTTON');
                if (legacy) {
                    legacy.id = 'goToSettingsBtn';
                    legacy.setAttribute('data-mvs-route', '/settings.html');
                    return legacy;
                }
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.id = 'goToSettingsBtn';
                btn.className = 'menu-item';
                btn.setAttribute('data-mvs-route', '/settings.html');
                btn.textContent = 'Impostazioni';
                return btn;
            })();
            const footerExisting = entries.find((el) => el && el.classList && el.classList.contains('app-version')) || null;
            const picked = new Set([emailNode, ...quickSaveNodes, ...navNodes, ...actionNodes, ...settingsNodes, ...sessionNodes, settingsEntry, footerExisting].filter(Boolean));
            const leftovers = entries.filter((el) => !picked.has(el));
            const appendTitle = (txt) => {
                const t = document.createElement('div');
                t.className = 'menu-title';
                t.textContent = txt;
                menu.appendChild(t);
            };
            const appendDivider = () => {
                const d = document.createElement('div');
                d.className = 'menu-divider';
                menu.appendChild(d);
            };
            menu.innerHTML = '';
            if (emailNode) menu.appendChild(emailNode);
            quickSaveNodes.forEach((el) => menu.appendChild(el));
            if (navNodes.length) {
                appendDivider();
                appendTitle('Navigazione');
                navNodes.forEach((el) => menu.appendChild(el));
            }
            if (actionNodes.length) {
                appendDivider();
                appendTitle('Azioni');
                actionNodes.forEach((el) => menu.appendChild(el));
            }
            appendDivider();
            appendTitle('Impostazioni');
            menu.appendChild(settingsEntry);
            if (sessionNodes.length) {
                appendDivider();
                appendTitle('Sessione');
                sessionNodes.forEach((el) => menu.appendChild(el));
            }
            leftovers.forEach((el) => {
                if (!el) return;
                if (el.classList && (el.classList.contains('menu-title') || el.classList.contains('menu-divider'))) return;
                if (isLegacySettingsNode(el)) return;
                menu.appendChild(el);
            });
            let footer = footerExisting;
            if (!footer) {
                footer = document.createElement('div');
                footer.className = 'menu-item app-version menu-item-muted menu-footer-version';
                footer.textContent = 'MyVolleyScout Vers. ' + String(window.MVS_APP_VERSION || '');
            }
            footer.classList.add('menu-footer-version');
            appendDivider();
            menu.appendChild(footer);
            Array.from(menu.querySelectorAll('.menu-item')).forEach(normalizeMenuLabelById);
        } catch (_) {}
    }
    function unifyUserMenus() {
        try {
            ensureMenuCss();
            const menus = Array.from(document.querySelectorAll('#headerMenu, #accountMenu'));
            menus.forEach(unifySingleUserMenu);
            menus.forEach((menu) => {
                try {
                    if (menu.dataset.mvsUnifiedRoutesBound === '1') return;
                    menu.dataset.mvsUnifiedRoutesBound = '1';
                    menu.addEventListener('click', (e) => {
                        const target = e.target.closest('[data-mvs-route]');
                        if (!target) return;
                        e.preventDefault();
                        e.stopPropagation();
                        const route = String(target.getAttribute('data-mvs-route') || '').trim();
                        if (!route) return;
                        window.location.href = route;
                    });
                } catch (_) {}
            });
        } catch (_) {}
    }
    window.updateAppVersionDisplay = renderVersion;
    window.unifyUserMenus = unifyUserMenus;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            renderVersion();
            unifyUserMenus();
        });
    } else {
        renderVersion();
        unifyUserMenus();
    }
    window.addEventListener('mvs-install-state', () => {
        try { unifyUserMenus(); } catch (_) {}
    });
})();
