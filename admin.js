class AdminManager {
    constructor() {
        this.currentUser = null;
        this.currentContext = null;
        this.authResolved = false;
        this.currentView = 'users';
        this._allUsers = [];
        this._usersSearchTimer = null;
        this._teamOwnerEmail = '';
        this._teamOwnerUid = '';
        window._adminManager = this;
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
            if (!contextRes?.success) { this.showAccessDenied(); return; }
            this.currentContext = contextRes.context || null;
            if (String(this.currentContext?.role || '').toLowerCase() !== 'admin') {
                this.showAccessDenied();
                return;
            }
            this.showAdminPanel();
            this.setActiveView(this.currentView || 'users');
            await Promise.all([
                this.loadUsersList(),
                this.loadUpgradeRequests(),
                this.loadUsageData()
            ]);
        } catch (_) {
            this.showAccessDenied();
        }
    }

    setupEventListeners() {
        // Form buttons
        const setRoleBtn = document.getElementById('setRoleBtn');
        const checkRoleBtn = document.getElementById('checkRoleBtn');
        const backBtn = document.getElementById('backBtn');
        const refreshUsersBtn = document.getElementById('refreshUsersBtn');
        const refreshRequestsBtn = document.getElementById('refreshRequestsBtn');
        const refreshUsageBtn = document.getElementById('refreshUsageBtn');
        const loadTeamsBtn = document.getElementById('loadTeamsBtn');
        const refreshTeamsBtn = document.getElementById('refreshTeamsBtn');
        const usersSearchInput = document.getElementById('usersSearchInput');

        if (setRoleBtn) setRoleBtn.addEventListener('click', () => this.setUserAccessFromForm());
        if (checkRoleBtn) checkRoleBtn.addEventListener('click', () => this.checkCurrentRole());
        if (backBtn) backBtn.addEventListener('click', () => this.goBack());
        if (refreshUsersBtn) refreshUsersBtn.addEventListener('click', async () => { await this.loadUsersList(); });
        if (refreshRequestsBtn) refreshRequestsBtn.addEventListener('click', async () => { await this.loadUpgradeRequests(); });
        if (refreshUsageBtn) refreshUsageBtn.addEventListener('click', async () => { await this.loadUsageData(); });
        if (loadTeamsBtn) loadTeamsBtn.addEventListener('click', () => this.loadTeamsForOwner());
        if (refreshTeamsBtn) refreshTeamsBtn.addEventListener('click', () => this.loadTeamsForOwner());

        // Live search
        if (usersSearchInput) {
            usersSearchInput.addEventListener('input', () => {
                clearTimeout(this._usersSearchTimer);
                this._usersSearchTimer = setTimeout(() => this.renderFilteredUsers(usersSearchInput.value), 180);
            });
        }

        // Sidebar nav
        const sidebarNav = document.getElementById('adminSidebarNav');
        if (sidebarNav) {
            sidebarNav.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-admin-view]');
                if (!btn) return;
                this.setActiveView(String(btn.getAttribute('data-admin-view') || '').trim().toLowerCase());
            });
        }

        // Users list delegate (save button)
        const usersList = document.getElementById('usersList');
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
                btn.disabled = true;
                btn.textContent = '...';
                await this.saveUserAccess(email, payload);
                btn.disabled = false;
                btn.textContent = 'Salva';
            });
        }

        // Requests delegate (approve/reject)
        const upgradeRequestsList = document.getElementById('upgradeRequestsList');
        if (upgradeRequestsList) {
            upgradeRequestsList.addEventListener('click', async (e) => {
                const btn = e.target.closest('[data-admin-action="request-action"]');
                if (!btn) return;
                const action = String(btn.getAttribute('data-action') || '').trim().toLowerCase();
                const path = String(btn.getAttribute('data-path') || '').trim();
                if (!path || (action !== 'approve' && action !== 'reject')) return;
                btn.disabled = true;
                await this.resolveUpgradeRequest(path, action);
            });
        }
    }

    // ── Helpers ──────────────────────────────────────────────

    normalizePackageName(value) {
        const v = String(value || '').trim().toLowerCase();
        if (v === 'promax' || v === 'pro-max' || v === 'pro max' || v === 'pro_max') return 'ProMax';
        if (v === 'pro') return 'Pro';
        return 'Base';
    }

    formatDateTime(value) {
        try {
            if (!value) return '—';
            const d = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
            if (!d || isNaN(d.getTime())) return '—';
            return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch (_) { return '—'; }
    }

    formatDate(value) {
        try {
            if (!value) return '—';
            const d = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
            if (!d || isNaN(d.getTime())) return '—';
            return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch (_) { return '—'; }
    }

    packageChip(pkg) {
        const p = this.normalizePackageName(pkg);
        if (p === 'ProMax') return `<span class="chip chip-blue">ProMax</span>`;
        if (p === 'Pro') return `<span class="chip chip-green">Pro</span>`;
        return `<span class="chip chip-gray">Base</span>`;
    }

    roleChip(role) {
        if (String(role).toLowerCase() === 'admin') return `<span class="chip chip-amber">admin</span>`;
        return `<span class="chip chip-gray">user</span>`;
    }

    enabledChip(enabled) {
        return enabled ? `<span class="chip chip-green">✓ Abilitato</span>` : `<span class="chip chip-red">✗ Disabilitato</span>`;
    }

    // ── Navigation ──────────────────────────────────────────

    setActiveView(view) {
        const next = String(view || 'users').trim().toLowerCase();
        this.currentView = next;

        // Sidebar nav buttons
        Array.from(document.querySelectorAll('#adminSidebarNav [data-admin-view]')).forEach(el => {
            el.classList.toggle('is-active', el.getAttribute('data-admin-view') === next);
        });

        // Content views
        const viewMap = {
            users: 'adminViewUsers',
            requests: 'adminViewRequests',
            analytics: 'adminViewAnalytics',
            teams: 'adminViewTeams'
        };
        Object.entries(viewMap).forEach(([key, id]) => {
            const el = document.getElementById(id);
            if (el) el.classList.toggle('is-active', key === next);
        });

        // Scroll to top of main
        const main = document.getElementById('adminMainContent');
        if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ── Save / Check user ────────────────────────────────────

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
            if (resultDiv) { resultDiv.textContent = 'Inserisci un\'email valida'; resultDiv.className = 'result-msg error'; }
            return;
        }
        try {
            const res = await firestoreService.updateUserAppAccess(email, payload);
            if (res?.success) {
                if (resultDiv) { resultDiv.textContent = `✓ Accesso aggiornato per ${email}`; resultDiv.className = 'result-msg success'; }
                if (clearEmailField) { const f = document.getElementById('userEmail'); if (f) f.value = ''; }
                await this.loadUsersList();
                await this.loadUpgradeRequests();
                try { window.dispatchEvent(new CustomEvent('mvs-user-context-refresh')); } catch (_) {}
            } else {
                if (resultDiv) { resultDiv.textContent = String(res?.error || 'Errore aggiornamento utente'); resultDiv.className = 'result-msg error'; }
            }
        } catch (error) {
            if (resultDiv) { resultDiv.textContent = `Errore: ${error.message}`; resultDiv.className = 'result-msg error'; }
        }
    }

    async checkCurrentRole() {
        const resultDiv = document.getElementById('currentRole');
        try {
            const res = await firestoreService.getUserAppContext('mvs');
            if (!res?.success) {
                if (resultDiv) { resultDiv.textContent = String(res?.error || 'Errore lettura profilo'); resultDiv.className = 'result-msg error'; }
                return;
            }
            const ctx = res.context || {};
            const msg = `Ruolo: ${ctx.role || 'user'} · Pacchetto: ${ctx.pacchetto || 'Base'} · Abilitato: ${ctx.enabled !== false ? 'sì' : 'no'}`;
            if (resultDiv) { resultDiv.textContent = msg; resultDiv.className = 'result-msg info'; }
        } catch (error) {
            if (resultDiv) { resultDiv.textContent = `Errore: ${error.message}`; resultDiv.className = 'result-msg error'; }
        }
    }

    // ── Users list ───────────────────────────────────────────

    renderUsersTable(users) {
        if (!users.length) return `<div class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-text">Nessun utente trovato</div></div>`;
        const rows = users.map((u) => {
            const email = String(u.email || '').trim();
            const role = String(u.role || 'user').toLowerCase() === 'admin' ? 'admin' : 'user';
            const pacchetto = this.normalizePackageName(u.pacchetto || 'Base');
            const enabled = u.enabled !== false;
            const created = this.formatDate(u.createdAt);
            return `<tr data-email="${email}">
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${email}">${email}</td>
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
                        <option value="true" ${enabled?'selected':''}>Abilitato</option>
                        <option value="false" ${!enabled?'selected':''}>Disabilitato</option>
                    </select>
                </td>
                <td style="white-space:nowrap;">${created}</td>
                <td><button type="button" class="btn btn-primary btn-sm" data-admin-action="save-user">Salva</button></td>
            </tr>`;
        }).join('');
        return `<table class="data-table">
            <thead><tr>
                <th>Email</th><th>Ruolo</th><th>Pacchetto</th><th>Stato</th><th>Creato il</th><th>Azione</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
    }

    async loadUsersList() {
        const usersListDiv = document.getElementById('usersList');
        if (!usersListDiv) return;
        usersListDiv.innerHTML = '<div class="loading-row">Caricamento...</div>';
        try {
            const res = await firestoreService.listUsersForAdmin(300);
            if (!res?.success) {
                usersListDiv.innerHTML = `<div class="empty-state"><div class="empty-state-text">${String(res?.error || 'Errore nel caricamento lista utenti')}</div></div>`;
                return;
            }
            const users = Array.isArray(res.users) ? res.users : [];
            this._allUsers = users;
            this.updateUsersStats(users);
            usersListDiv.innerHTML = this.renderUsersTable(users);
        } catch (error) {
            usersListDiv.innerHTML = `<div class="empty-state"><div class="empty-state-text">Errore: ${error.message}</div></div>`;
        }
    }

    renderFilteredUsers(query) {
        const usersListDiv = document.getElementById('usersList');
        if (!usersListDiv) return;
        const q = String(query || '').trim().toLowerCase();
        const filtered = q ? this._allUsers.filter(u => String(u.email || '').toLowerCase().includes(q)) : this._allUsers;
        usersListDiv.innerHTML = this.renderUsersTable(filtered);
    }

    updateUsersStats(users) {
        const total = users.length;
        const enabled = users.filter(u => u.enabled !== false).length;
        const disabled = total - enabled;
        const admins = users.filter(u => String(u.role || '').toLowerCase() === 'admin').length;
        const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
        el('statTotalUsers', total);
        el('statEnabledUsers', enabled);
        el('statDisabledUsers', disabled);
        el('statAdminUsers', admins);
    }

    // ── Requests ─────────────────────────────────────────────

    renderUpgradeRequestsTable(requests) {
        if (!requests.length) return `<div class="empty-state"><div class="empty-state-icon">🎉</div><div class="empty-state-text">Nessuna richiesta in attesa</div></div>`;
        const rows = requests.map((r) => {
            const email = String(r.userEmail || '').trim();
            const fromPkg = this.normalizePackageName(r.currentPackage || 'Base');
            const toPkg = this.normalizePackageName(r.targetPackage || 'Pro');
            const created = this.formatDateTime(r.createdAt);
            const path = String(r.path || '').trim();
            return `<tr>
                <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${email}">${email}</td>
                <td>${this.packageChip(fromPkg)}</td>
                <td>
                    <span style="color:#94a3b8;margin:0 4px;">→</span>
                    ${this.packageChip(toPkg)}
                </td>
                <td style="white-space:nowrap;">${created}</td>
                <td>
                    <div class="table-actions">
                        <button type="button" class="btn btn-success btn-sm" data-admin-action="request-action" data-action="approve" data-path="${path}">
                            ✓ Approva
                        </button>
                        <button type="button" class="btn btn-danger btn-sm" data-admin-action="request-action" data-action="reject" data-path="${path}">
                            ✗ Rifiuta
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
        return `<table class="data-table">
            <thead><tr>
                <th>Email</th><th>Pacchetto attuale</th><th>Upgrade richiesto</th><th>Data richiesta</th><th>Azione</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
    }

    async loadUpgradeRequests() {
        const wrap = document.getElementById('upgradeRequestsList');
        if (!wrap) return;
        wrap.innerHTML = '<div class="loading-row">Caricamento...</div>';
        try {
            const res = await firestoreService.listPackageUpgradeRequestsForAdmin('pending');
            if (!res?.success) {
                wrap.innerHTML = `<div class="empty-state"><div class="empty-state-text">${String(res?.error || 'Errore nel caricamento richieste')}</div></div>`;
                return;
            }
            const requests = Array.isArray(res.requests) ? res.requests : [];
            // Update sidebar badge
            const count = requests.length;
            const sidebarBadge = document.getElementById('sidebarRequestsBadge');
            if (sidebarBadge) { sidebarBadge.textContent = count; sidebarBadge.style.display = count > 0 ? '' : 'none'; }
            wrap.innerHTML = this.renderUpgradeRequestsTable(requests);
        } catch (error) {
            wrap.innerHTML = `<div class="empty-state"><div class="empty-state-text">Errore: ${error.message}</div></div>`;
        }
    }

    async resolveUpgradeRequest(requestPath, action) {
        try {
            const res = await firestoreService.resolvePackageUpgradeRequest(requestPath, action);
            if (res?.success) {
                await this.loadUsersList();
                await this.loadUpgradeRequests();
            } else {
                alert(String(res?.error || 'Operazione non riuscita'));
            }
        } catch (error) {
            alert(`Errore: ${error.message}`);
        }
    }

    // ── Analytics / Usage ─────────────────────────────────────

    renderUsageTable(users) {
        if (!users.length) return `<div class="empty-state"><div class="empty-state-text">Nessun dato disponibile</div></div>`;
        const rows = users.map((u) => {
            const email = String(u.email || '').trim();
            const role = String(u.role || 'user').toLowerCase();
            const pacchetto = this.normalizePackageName(u.pacchetto || 'Base');
            const stats = (u.stats && typeof u.stats === 'object') ? u.stats : {};
            const usage = (u.usage && typeof u.usage === 'object') ? u.usage : {};
            const totalMatches = Number(stats.totalMatches || usage.totalMatches || 0) || 0;
            const totalRosters = Number(stats.totalRosters || usage.totalRosters || 0) || 0;
            const lastMatchDate = this.formatDate(stats.lastMatchDate || usage.lastMatchDate || null);
            const updatedAt = this.formatDate(u.updatedAt || null);
            return `<tr>
                <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${email}">${email}</td>
                <td>${this.roleChip(role)}</td>
                <td>${this.packageChip(pacchetto)}</td>
                <td style="text-align:center;font-weight:700;color:${totalMatches>0?'#2563eb':'#94a3b8'}">${totalMatches}</td>
                <td style="text-align:center;font-weight:700;color:${totalRosters>0?'#16a34a':'#94a3b8'}">${totalRosters}</td>
                <td style="white-space:nowrap;">${lastMatchDate}</td>
                <td style="white-space:nowrap;">${updatedAt}</td>
            </tr>`;
        }).join('');
        return `<table class="data-table">
            <thead><tr>
                <th>Email</th><th>Ruolo</th><th>Pacchetto</th><th style="text-align:center;">Partite</th><th style="text-align:center;">Roster</th><th>Ultima partita</th><th>Ultimo update</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
    }

    updateAnalyticsStats(users) {
        let totalMatches = 0, totalRosters = 0, activeUsers = 0, proUsers = 0;
        const packageCounts = { Base: 0, Pro: 0, ProMax: 0 };
        users.forEach(u => {
            const stats = u.stats || u.usage || {};
            const m = Number(stats.totalMatches || 0);
            const r = Number(stats.totalRosters || 0);
            totalMatches += m;
            totalRosters += r;
            if (m > 0 || r > 0) activeUsers++;
            const pkg = this.normalizePackageName(u.pacchetto || 'Base');
            packageCounts[pkg] = (packageCounts[pkg] || 0) + 1;
            if (pkg === 'Pro' || pkg === 'ProMax') proUsers++;
        });
        const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
        el('statTotalMatches', totalMatches);
        el('statTotalRosters', totalRosters);
        el('statActiveUsers', activeUsers);
        el('statProUsers', proUsers);

        // Package distribution chips
        const distEl = document.getElementById('packageDistribution');
        if (distEl) {
            const total = users.length || 1;
            distEl.innerHTML = Object.entries(packageCounts).map(([pkg, count]) => {
                const pct = Math.round((count / total) * 100);
                const chipClass = pkg === 'ProMax' ? 'chip-blue' : pkg === 'Pro' ? 'chip-green' : 'chip-gray';
                return `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;flex:1;min-width:120px;">
                    <span class="chip ${chipClass}">${pkg}</span>
                    <span style="font-size:22px;font-weight:800;color:#0f172a;">${count}</span>
                    <span style="font-size:12px;color:#64748b;margin-left:auto;">${pct}%</span>
                </div>`;
            }).join('');
        }
    }

    async loadUsageData() {
        const wrap = document.getElementById('usageDataList');
        if (!wrap) return;
        wrap.innerHTML = '<div class="loading-row">Caricamento...</div>';
        try {
            const res = await firestoreService.listUsersForAdmin(400);
            if (!res?.success) {
                wrap.innerHTML = `<div class="empty-state"><div class="empty-state-text">${String(res?.error || 'Errore nel caricamento dati utilizzo')}</div></div>`;
                return;
            }
            const users = Array.isArray(res.users) ? res.users : [];
            this.updateAnalyticsStats(users);
            wrap.innerHTML = this.renderUsageTable(users);
        } catch (error) {
            wrap.innerHTML = `<div class="empty-state"><div class="empty-state-text">Errore: ${error.message}</div></div>`;
        }
    }

    // ── Team sharing ──────────────────────────────────────────

    async loadTeamsForOwner() {
        const emailInput = document.getElementById('teamOwnerEmail');
        const resultDiv = document.getElementById('teamLookupResult');
        const container = document.getElementById('teamsContainer');
        const listDiv = document.getElementById('teamsAccessList');
        const titleDiv = document.getElementById('teamsContainerTitle');

        const email = String(emailInput?.value || '').trim();
        if (!email) {
            if (resultDiv) { resultDiv.textContent = 'Inserisci un\'email valida'; resultDiv.className = 'result-msg error'; }
            return;
        }

        if (resultDiv) { resultDiv.textContent = 'Ricerca in corso...'; resultDiv.className = 'result-msg info'; }
        if (container) container.style.display = 'none';

        try {
            // Find user uid from email via users list
            const usersRes = await firestoreService.listUsersForAdmin(400);
            const users = Array.isArray(usersRes?.users) ? usersRes.users : [];
            const found = users.find(u => String(u.email || '').toLowerCase() === email.toLowerCase());

            if (!found) {
                if (resultDiv) { resultDiv.textContent = `Nessun utente trovato con email: ${email}`; resultDiv.className = 'result-msg error'; }
                return;
            }

            const uid = String(found.uid || found.id || '').trim();
            if (!uid) {
                if (resultDiv) { resultDiv.textContent = 'Impossibile determinare UID utente'; resultDiv.className = 'result-msg error'; }
                return;
            }

            this._teamOwnerEmail = email;
            this._teamOwnerUid = uid;

            // Load teams for this user
            const teamsRes = await firestoreService.getTeamsForAdmin ?
                await firestoreService.getTeamsForAdmin(uid) :
                await this._loadTeamsAdminFallback(uid, email);

            if (!teamsRes?.success) {
                if (resultDiv) { resultDiv.textContent = String(teamsRes?.error || 'Impossibile caricare i team'); resultDiv.className = 'result-msg error'; }
                return;
            }

            const teams = Array.isArray(teamsRes.teams) ? teamsRes.teams : [];
            if (resultDiv) { resultDiv.textContent = `✓ Trovati ${teams.length} team per ${email}`; resultDiv.className = 'result-msg success'; }
            if (container) container.style.display = '';
            if (titleDiv) titleDiv.textContent = `Team di ${email} (${teams.length})`;
            if (listDiv) listDiv.innerHTML = this.renderTeamsAccess(teams);

        } catch (error) {
            if (resultDiv) { resultDiv.textContent = `Errore: ${error.message}`; resultDiv.className = 'result-msg error'; }
        }
    }

    async _loadTeamsAdminFallback(uid, email) {
        try {
            // Try to access teams via firestore directly
            const db = firebase.firestore();
            const teamsSnap = await db.collection('users').doc(uid).collection('teams').get();
            const teams = [];
            for (const doc of teamsSnap.docs) {
                const data = doc.data() || {};
                // Load observer accesses
                let observers = [];
                try {
                    const accessSnap = await db.collection('users').doc(uid).collection('teams').doc(doc.id).collection('user_access').get();
                    accessSnap.forEach(ad => {
                        const ad_data = ad.data() || {};
                        if (ad_data.userEmail !== email) {
                            observers.push({
                                email: String(ad_data.userEmail || ad.id || '').trim(),
                                role: String(ad_data.role || 'observer').trim(),
                                active: ad_data.active !== false,
                                accessCount: Number(ad_data.accessCount || 0),
                                lastAccessAt: ad_data.lastAccessAt || null
                            });
                        }
                    });
                } catch (_) {}
                teams.push({
                    id: doc.id,
                    name: String(data.name || data.teamName || doc.id || '').trim(),
                    observers
                });
            }
            return { success: true, teams };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    renderTeamsAccess(teams) {
        if (!teams.length) return `<div class="empty-state"><div class="empty-state-icon">🏐</div><div class="empty-state-text">Nessun team trovato</div></div>`;
        return teams.map(team => {
            const observers = Array.isArray(team.observers) ? team.observers : [];
            const observerRows = observers.length ? observers.map(obs => {
                const active = obs.active !== false;
                return `<tr>
                    <td style="padding-left:24px;color:#64748b;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="margin-right:4px;vertical-align:middle;"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                        ${obs.email}
                    </td>
                    <td><span class="chip ${active ? 'chip-green' : 'chip-red'}">${active ? 'Attivo' : 'Sospeso'}</span></td>
                    <td style="text-align:center;">${obs.accessCount || 0}</td>
                    <td>${this.formatDate(obs.lastAccessAt)}</td>
                </tr>`;
            }).join('') : `<tr><td colspan="4" style="padding:8px 24px;color:#94a3b8;font-size:13px;">Nessun observer</td></tr>`;

            return `<div style="margin-bottom:14px;">
                <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#f8fafc;border-radius:10px 10px 0 0;border:1px solid #e5e7eb;border-bottom:none;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="color:#2563eb;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="2"/></svg>
                    <span style="font-weight:700;color:#0f172a;font-size:14px;">${team.name || team.id}</span>
                    <span style="margin-left:auto;" class="chip chip-gray">${observers.length} observer</span>
                </div>
                <div class="table-wrap" style="border-radius:0 0 10px 10px;border-top:none;">
                    <table class="data-table" style="min-width:400px;">
                        <thead><tr><th>Observer</th><th>Stato</th><th style="text-align:center;">Accessi</th><th>Ultimo accesso</th></tr></thead>
                        <tbody>${observerRows}</tbody>
                    </table>
                </div>
            </div>`;
        }).join('');
    }

    // ── Panel visibility ──────────────────────────────────────

    showAdminPanel() {
        const c = document.getElementById('adminContent');
        const e = document.getElementById('adminError');
        if (c) c.style.display = 'flex';
        if (e) e.style.display = 'none';
        // Colora il bottone account per indicare ruolo admin
        const accountBtn = document.getElementById('accountBtn');
        if (accountBtn) accountBtn.classList.add('is-admin');
        // Populate account info
        try {
            const emailEl = document.getElementById('accountEmail');
            if (emailEl && this.currentUser?.email) emailEl.textContent = this.currentUser.email;
            const logoutBtn = document.getElementById('accountLogout');
            if (logoutBtn) logoutBtn.addEventListener('click', async () => {
                try { await authFunctions.signOut(); } catch (_) {}
                window.location.href = '/auth-login.html';
            });
        } catch (_) {}
    }

    showAccessDenied() {
        const c = document.getElementById('adminContent');
        const e = document.getElementById('adminError');
        if (c) c.style.display = 'none';
        if (e) e.style.display = 'block';
    }

    goBack() {
        window.location.href = '/my-teams.html';
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { new AdminManager(); });
} else {
    new AdminManager();
}
