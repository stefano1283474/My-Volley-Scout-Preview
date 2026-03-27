class AdminManager {
    constructor() {
        this.currentUser = null;
        this.currentContext = null;
        this.authResolved = false;
        this.currentView = 'users';
        this.initializeAdmin();
    }

    async initializeAdmin() {
        if (typeof authFunctions === 'undefined' || typeof firestoreService === 'undefined') {
            setTimeout(() => this.initializeAdmin(), 120);
            return;
        }
        this.setupEventListeners();
        this.bindAuthListener();
        await this.checkAdminAccess();
    }

    bindAuthListener() {
        try {
            if (this.__authListenerBound) return;
            this.__authListenerBound = true;
            if (typeof authFunctions.onAuthStateChanged === 'function') {
                authFunctions.onAuthStateChanged(async () => {
                    this.authResolved = true;
                    await this.checkAdminAccess();
                });
            }
        } catch (_) {}
    }

    async checkAdminAccess() {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) {
                if (!this.authResolved) return;
                this.showAccessDenied();
                return;
            }
            this.currentUser = user;
            const contextRes = await firestoreService.getUserAppContext('mvs');
            if (!contextRes?.success) {
                this.showAccessDenied();
                return;
            }
            this.currentContext = contextRes.context || null;
            if (String(this.currentContext?.role || '').toLowerCase() !== 'admin') {
                this.showAccessDenied();
                return;
            }
            this.showAdminPanel();
            this.setActiveView(this.currentView || 'users');
            await this.loadUsersList();
            await this.loadUpgradeRequests();
            await this.loadUsageData();
        } catch (_) {
            this.showAccessDenied();
        }
    }

    setupEventListeners() {
        const setRoleBtn = document.getElementById('setRoleBtn');
        const checkRoleBtn = document.getElementById('checkRoleBtn');
        const backBtn = document.getElementById('backBtn');
        const backToAppBtn = document.getElementById('backToAppBtn');
        const refreshUsersBtn = document.getElementById('refreshUsersBtn');
        const refreshRequestsBtn = document.getElementById('refreshRequestsBtn');
        const refreshUsageBtn = document.getElementById('refreshUsageBtn');
        const usersList = document.getElementById('usersList');
        const upgradeRequestsList = document.getElementById('upgradeRequestsList');
        const adminSidebarNav = document.getElementById('adminSidebarNav');
        const adminSidebar = document.querySelector('.admin-sidebar');
        const adminSidebarToggle = document.getElementById('adminSidebarToggle');
        const adminSidebarBackdrop = document.getElementById('adminSidebarBackdrop');
        if (setRoleBtn) setRoleBtn.addEventListener('click', () => this.setUserAccessFromForm());
        if (checkRoleBtn) checkRoleBtn.addEventListener('click', () => this.checkCurrentRole());
        if (backBtn) backBtn.addEventListener('click', () => this.goBack());
        if (backToAppBtn) backToAppBtn.addEventListener('click', () => this.goBack());
        if (refreshUsersBtn) refreshUsersBtn.addEventListener('click', async () => { await this.loadUsersList(); });
        if (refreshRequestsBtn) refreshRequestsBtn.addEventListener('click', async () => { await this.loadUpgradeRequests(); });
        if (refreshUsageBtn) refreshUsageBtn.addEventListener('click', async () => { await this.loadUsageData(); });
        if (adminSidebarToggle && adminSidebar && adminSidebarBackdrop) {
            adminSidebarToggle.addEventListener('click', () => this.setSidebarOpen(true));
            adminSidebarBackdrop.addEventListener('click', () => this.setSidebarOpen(false));
            window.addEventListener('resize', () => {
                if (window.innerWidth > 980) this.setSidebarOpen(false);
            });
        }
        if (adminSidebarNav) {
            adminSidebarNav.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-admin-view]');
                if (!btn) return;
                const view = String(btn.getAttribute('data-admin-view') || '').trim().toLowerCase();
                if (!view) return;
                this.setActiveView(view);
                this.setSidebarOpen(false);
            });
        }
        if (usersList) {
            usersList.addEventListener('click', async (e) => {
                const btn = e.target.closest('[data-admin-action="save-user"]');
                if (!btn) return;
                const row = btn.closest('tr[data-email]');
                if (!row) return;
                const email = String(row.getAttribute('data-email') || '').trim();
                const roleEl = row.querySelector('select[data-field="role"]');
                const packageEl = row.querySelector('select[data-field="pacchetto"]');
                const enabledEl = row.querySelector('select[data-field="enabled"]');
                const payload = {
                    role: roleEl ? roleEl.value : 'user',
                    pacchetto: packageEl ? packageEl.value : 'Base',
                    enabled: enabledEl ? String(enabledEl.value) === 'true' : true
                };
                await this.saveUserAccess(email, payload);
            });
        }
        if (upgradeRequestsList) {
            upgradeRequestsList.addEventListener('click', async (e) => {
                const btn = e.target.closest('[data-admin-action="request-action"]');
                if (!btn) return;
                const action = String(btn.getAttribute('data-action') || '').trim().toLowerCase();
                const path = String(btn.getAttribute('data-path') || '').trim();
                if (!path || (action !== 'approve' && action !== 'reject')) return;
                await this.resolveUpgradeRequest(path, action);
            });
        }
    }

    normalizePackageName(value) {
        const v = String(value || '').trim().toLowerCase();
        if (v === 'promax' || v === 'pro-max' || v === 'pro max' || v === 'pro_max') return 'ProMax';
        if (v === 'pro') return 'Pro';
        return 'Base';
    }

    async setUserAccessFromForm() {
        const email = String(document.getElementById('userEmail')?.value || '').trim();
        const role = String(document.getElementById('userRole')?.value || 'user').trim().toLowerCase();
        const pacchetto = this.normalizePackageName(document.getElementById('userPackage')?.value || 'Base');
        const enabled = String(document.getElementById('userEnabled')?.value || 'true') === 'true';
        await this.saveUserAccess(email, { role, pacchetto, enabled }, true);
    }

    async saveUserAccess(email, payload, clearEmailField = false) {
        const resultDiv = document.getElementById('roleResult');
        if (!email) {
            if (resultDiv) {
                resultDiv.textContent = 'Inserisci un\'email valida';
                resultDiv.className = 'result-message error';
            }
            return;
        }
        try {
            const res = await firestoreService.updateUserAppAccess(email, payload);
            if (res?.success) {
                if (resultDiv) {
                    resultDiv.textContent = `Accesso aggiornato per ${email}`;
                    resultDiv.className = 'result-message success';
                }
                if (clearEmailField) {
                    const f = document.getElementById('userEmail');
                    if (f) f.value = '';
                }
                await this.loadUsersList();
                await this.loadUpgradeRequests();
                try { window.dispatchEvent(new CustomEvent('mvs-user-context-refresh')); } catch (_) {}
            } else {
                if (resultDiv) {
                    resultDiv.textContent = String(res?.error || 'Errore aggiornamento utente');
                    resultDiv.className = 'result-message error';
                }
            }
        } catch (error) {
            if (resultDiv) {
                resultDiv.textContent = `Errore: ${error.message}`;
                resultDiv.className = 'result-message error';
            }
        }
    }

    async checkCurrentRole() {
        const resultDiv = document.getElementById('currentRole');
        try {
            const res = await firestoreService.getUserAppContext('mvs');
            if (!res?.success) {
                if (resultDiv) {
                    resultDiv.textContent = String(res?.error || 'Errore lettura profilo');
                    resultDiv.className = 'result-message error';
                }
                return;
            }
            const ctx = res.context || {};
            const msg = `Ruolo: ${ctx.role || 'user'} · Pacchetto: ${ctx.pacchetto || 'Base'} · Enabled: ${ctx.enabled !== false ? 'si' : 'no'}`;
            if (resultDiv) {
                resultDiv.textContent = msg;
                resultDiv.className = 'result-message info';
            }
        } catch (error) {
            if (resultDiv) {
                resultDiv.textContent = `Errore: ${error.message}`;
                resultDiv.className = 'result-message error';
            }
        }
    }

    setActiveView(view) {
        const next = String(view || 'users').trim().toLowerCase();
        this.currentView = next;
        const links = Array.from(document.querySelectorAll('#adminSidebarNav [data-admin-view]'));
        links.forEach((el) => {
            const v = String(el.getAttribute('data-admin-view') || '').trim().toLowerCase();
            el.classList.toggle('is-active', v === next);
        });
        const views = [
            { key: 'users', id: 'adminViewUsers' },
            { key: 'requests', id: 'adminViewRequests' },
            { key: 'usage', id: 'adminViewUsage' }
        ];
        views.forEach((item) => {
            const section = document.getElementById(item.id);
            if (!section) return;
            section.classList.toggle('is-active', item.key === next);
        });
    }

    setSidebarOpen(open) {
        const sidebar = document.querySelector('.admin-sidebar');
        const backdrop = document.getElementById('adminSidebarBackdrop');
        if (!sidebar || !backdrop) return;
        const isOpen = !!open;
        sidebar.classList.toggle('is-open', isOpen);
        backdrop.classList.toggle('is-open', isOpen);
    }

    formatDateTime(value) {
        try {
            if (!value) return 'N/A';
            const dateObj = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
            if (!dateObj || Number.isNaN(dateObj.getTime())) return 'N/A';
            return dateObj.toLocaleString('it-IT');
        } catch (_) {
            return 'N/A';
        }
    }

    renderUsersTable(users) {
        const rows = (Array.isArray(users) ? users : []).map((u) => {
            const email = String(u.email || '').trim();
            const role = String(u.role || 'user').toLowerCase() === 'admin' ? 'admin' : 'user';
            const pacchetto = this.normalizePackageName(u.pacchetto || 'Base');
            const enabled = u.enabled !== false;
            const created = this.formatDateTime(u.createdAt);
            return `<tr data-email="${email}">
                <td>${email}</td>
                <td>
                    <select data-field="role">
                        <option value="user" ${role==='user'?'selected':''}>user</option>
                        <option value="admin" ${role==='admin'?'selected':''}>admin</option>
                    </select>
                </td>
                <td>
                    <select data-field="pacchetto">
                        <option value="Base" ${pacchetto==='Base'?'selected':''}>Base</option>
                        <option value="Pro" ${pacchetto==='Pro'?'selected':''}>Pro</option>
                        <option value="ProMax" ${pacchetto==='ProMax'?'selected':''}>ProMax</option>
                    </select>
                </td>
                <td>
                    <select data-field="enabled">
                        <option value="true" ${enabled?'selected':''}>true</option>
                        <option value="false" ${!enabled?'selected':''}>false</option>
                    </select>
                </td>
                <td>${created}</td>
                <td><button type="button" class="btn btn-secondary" data-admin-action="save-user">Salva</button></td>
            </tr>`;
        }).join('');
        return `<table class="users-table"><thead><tr><th>Email</th><th>Role</th><th>Pacchetto</th><th>Enabled</th><th>Creato il</th><th>Azione</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    async loadUsersList() {
        const usersListDiv = document.getElementById('usersList');
        if (!usersListDiv) return;
        usersListDiv.innerHTML = '<p>Caricamento...</p>';
        try {
            const res = await firestoreService.listUsersForAdmin(300);
            if (!res?.success) {
                usersListDiv.innerHTML = `<p>${String(res?.error || 'Errore nel caricamento lista utenti')}</p>`;
                return;
            }
            const users = Array.isArray(res.users) ? res.users : [];
            if (!users.length) {
                usersListDiv.innerHTML = '<p>Nessun utente trovato</p>';
                return;
            }
            usersListDiv.innerHTML = this.renderUsersTable(users);
        } catch (error) {
            usersListDiv.innerHTML = `<p>Errore: ${error.message}</p>`;
        }
    }

    renderUpgradeRequestsTable(requests) {
        const rows = (Array.isArray(requests) ? requests : []).map((r) => {
            const email = String(r.userEmail || '').trim();
            const fromPkg = this.normalizePackageName(r.currentPackage || 'Base');
            const toPkg = this.normalizePackageName(r.targetPackage || 'Pro');
            const created = this.formatDateTime(r.createdAt);
            const path = String(r.path || '').trim();
            return `<tr>
                <td>${email}</td>
                <td>${fromPkg}</td>
                <td>${toPkg}</td>
                <td>${created}</td>
                <td style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button type="button" class="btn btn-secondary" data-admin-action="request-action" data-action="approve" data-path="${path}">Approva</button>
                    <button type="button" class="btn btn-secondary" data-admin-action="request-action" data-action="reject" data-path="${path}">Rifiuta</button>
                </td>
            </tr>`;
        }).join('');
        return `<table class="users-table"><thead><tr><th>Email</th><th>Pacchetto attuale</th><th>Upgrade richiesto</th><th>Data richiesta</th><th>Azione</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    async loadUpgradeRequests() {
        const wrap = document.getElementById('upgradeRequestsList');
        if (!wrap) return;
        wrap.innerHTML = '<p>Caricamento...</p>';
        try {
            const res = await firestoreService.listPackageUpgradeRequestsForAdmin('pending');
            if (!res?.success) {
                wrap.innerHTML = `<p>${String(res?.error || 'Errore nel caricamento richieste')}</p>`;
                return;
            }
            const requests = Array.isArray(res.requests) ? res.requests : [];
            if (!requests.length) {
                wrap.innerHTML = '<p>Nessuna richiesta pending</p>';
                return;
            }
            wrap.innerHTML = this.renderUpgradeRequestsTable(requests);
        } catch (error) {
            wrap.innerHTML = `<p>Errore: ${error.message}</p>`;
        }
    }

    renderUsageTable(users) {
        const rows = (Array.isArray(users) ? users : []).map((u) => {
            const email = String(u.email || '').trim();
            const role = String(u.role || 'user').toLowerCase();
            const pacchetto = this.normalizePackageName(u.pacchetto || 'Base');
            const stats = (u.stats && typeof u.stats === 'object') ? u.stats : {};
            const usage = (u.usage && typeof u.usage === 'object') ? u.usage : {};
            const totalMatches = Number(stats.totalMatches || usage.totalMatches || 0) || 0;
            const totalRosters = Number(stats.totalRosters || usage.totalRosters || 0) || 0;
            const lastMatchDate = this.formatDateTime(stats.lastMatchDate || usage.lastMatchDate || null);
            const updatedAt = this.formatDateTime(u.updatedAt || null);
            return `<tr>
                <td>${email}</td>
                <td>${role}</td>
                <td>${pacchetto}</td>
                <td>${totalMatches}</td>
                <td>${totalRosters}</td>
                <td>${lastMatchDate}</td>
                <td>${updatedAt}</td>
            </tr>`;
        }).join('');
        return `<table class="users-table"><thead><tr><th>Email</th><th>Role</th><th>Pacchetto</th><th>Match</th><th>Roster</th><th>Ultima gara</th><th>Ultimo update</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    async loadUsageData() {
        const wrap = document.getElementById('usageDataList');
        if (!wrap) return;
        wrap.innerHTML = '<p>Caricamento...</p>';
        try {
            const res = await firestoreService.listUsersForAdmin(400);
            if (!res?.success) {
                wrap.innerHTML = `<p>${String(res?.error || 'Errore nel caricamento dati utilizzo')}</p>`;
                return;
            }
            const users = Array.isArray(res.users) ? res.users : [];
            if (!users.length) {
                wrap.innerHTML = '<p>Nessun dato disponibile</p>';
                return;
            }
            wrap.innerHTML = this.renderUsageTable(users);
        } catch (error) {
            wrap.innerHTML = `<p>Errore: ${error.message}</p>`;
        }
    }

    async resolveUpgradeRequest(requestPath, action) {
        const roleResult = document.getElementById('roleResult');
        try {
            const res = await firestoreService.resolvePackageUpgradeRequest(requestPath, action);
            if (res?.success) {
                if (roleResult) {
                    roleResult.textContent = action === 'approve' ? 'Richiesta approvata' : 'Richiesta rifiutata';
                    roleResult.className = 'result-message success';
                }
                await this.loadUsersList();
                await this.loadUpgradeRequests();
            } else {
                if (roleResult) {
                    roleResult.textContent = String(res?.error || 'Operazione non riuscita');
                    roleResult.className = 'result-message error';
                }
            }
        } catch (error) {
            if (roleResult) {
                roleResult.textContent = `Errore: ${error.message}`;
                roleResult.className = 'result-message error';
            }
        }
    }

    showAdminPanel() {
        const c = document.getElementById('adminContent');
        const e = document.getElementById('adminError');
        if (c) c.style.display = 'block';
        if (e) e.style.display = 'none';
    }

    showAccessDenied() {
        const c = document.getElementById('adminContent');
        const e = document.getElementById('adminError');
        if (c) c.style.display = 'none';
        if (e) e.style.display = 'block';
    }

    goBack() {
        if (String(this.currentContext?.role || '').toLowerCase() === 'admin') {
            window.location.href = '/admin.html';
            return;
        }
        window.location.href = '/my-teams.html';
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { new AdminManager(); });
} else {
    new AdminManager();
}
