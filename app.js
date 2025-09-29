// Stato globale dell'applicazione
const appState = {
    currentPage: 'match-data',
    currentMatch: null,
    currentRoster: [],
    currentSet: 1,
    currentRotation: 'P1',
    currentPhase: 'servizio',
    homeScore: 0,
    awayScore: 0,
    actionsLog: [],
    currentSequence: [],
    setStarted: false,
    selectedPlayer: null,
    selectedEvaluation: null
};

const rotationSequence = ['P1', 'P6', 'P5', 'P4', 'P3', 'P2'];

// Esporta stato su window per compatibilità tra script
window.appState = appState;

// Funzione per caricare la sessione di scouting salvata da set-config.html
window.loadScoutingSession = function(sessionData) {
    try {
        // sessionData contiene matchData + setConfig
        // Mappa nei campi attesi da appState.currentMatch
        const md = sessionData || {};
        const homeAway = (md.location === 'casa' || md.homeAway === 'home') ? 'home' : 'away';
        const myTeamName = (() => {
            // Tenta di leggere il team corrente da teamsModule
            try {
                if (window.teamsModule && typeof window.teamsModule.getCurrentTeam === 'function') {
                    const t = window.teamsModule.getCurrentTeam();
                    if (t && t.name) return t.name;
                }
            } catch(_) {}
            // fallback da localStorage selectedTeamId
            try {
                if (window.teamsModule && typeof window.teamsModule.getTeamById === 'function') {
                    const selId = localStorage.getItem('selectedTeamId');
                    const t = selId ? window.teamsModule.getTeamById(selId) : null;
                    if (t && t.name) return t.name;
                }
            } catch(_) {}
            return md.myTeam || md.teamName || '-';
        })();

        const opponentName = md.opponent || md.opponentTeam || '-';
        const matchType = md.eventType || md.matchType || '-';
        const date = md.matchDate || md.date || new Date().toISOString().slice(0,10);
        const homeTeam = homeAway === 'home' ? myTeamName : opponentName;
        const awayTeam = homeAway === 'home' ? opponentName : myTeamName;

        appState.currentMatch = {
            id: md.id || md.matchId || 'match_' + Date.now(),
            myTeam: myTeamName,
            opponentTeam: opponentName,
            homeTeam,
            awayTeam,
            homeAway,
            matchType,
            date
        };

        // Carica roster dal team selezionato
        let loadedRoster = [];
        try {
            if (window.teamsModule && typeof window.teamsModule.getCurrentTeam === 'function') {
                const team = window.teamsModule.getCurrentTeam();
                if (team && Array.isArray(team.players)) loadedRoster = team.players;
            }
            if (!loadedRoster.length) {
                const selId = localStorage.getItem('selectedTeamId');
                if (selId && window.teamsModule && typeof window.teamsModule.getTeamById === 'function') {
                    const team = window.teamsModule.getTeamById(selId);
                    if (team && Array.isArray(team.players)) loadedRoster = team.players;
                }
            }
            // Fallback addizionale: leggi direttamente dal localStorage se il modulo non ha ancora caricato le squadre
            if (!loadedRoster.length) {
                const selId = localStorage.getItem('selectedTeamId');
                try {
                    const storedTeams = JSON.parse(localStorage.getItem('volleyTeams') || '[]');
                    let team = null;
                    if (selId) {
                        team = storedTeams.find(t => String(t.id) === String(selId));
                    }
                    if (!team && (md.myTeam || md.teamName)) {
                        const targetName = (md.myTeam || md.teamName).toLowerCase();
                        team = storedTeams.find(t => String(t.name || '').toLowerCase() === targetName);
                    }
                    if (team && Array.isArray(team.players)) loadedRoster = team.players;
                } catch(_) {}
            }
        } catch(_) {}
        appState.currentRoster = Array.isArray(loadedRoster) ? loadedRoster : [];

        // Imposta set corrente dalla setConfig della sessione
        if (md.setConfig) {
            appState.currentSet = parseInt(md.setConfig.set || 1);
            appState.currentRotation = md.setConfig.ourRotation || 'P1';
            appState.currentPhase = md.setConfig.phase || 'servizio';
        }

        // Aggiorna UI iniziale
        try { updateMatchSummary(); } catch(_) {}
        try { updateMatchInfo(); } catch(_) {}
        try { updateScoutingUI(); } catch(_) {}
        try { updateCurrentPhaseDisplay(); } catch(_) {}
        try { updateNextFundamental(); } catch(_) {}
        try { renderRosterTable(); } catch(_) {}
        try { updatePlayersGrid(); } catch(_) {}

        // Imposta pagina Start-Scouting attiva all’arrivo
        switchPage('scouting');
    } catch (e) {
        console.error('Errore loadScoutingSession:', e);
    }
};

// Funzioni di navigazione e inizializzazione app
function switchPage(pageId) {
    // Aggiorna stato
    appState.currentPage = pageId;

    // Aggiorna UI - controlla se esistono elementi .page e .nav-btn
    const pages = document.querySelectorAll('.page');
    const navBtns = document.querySelectorAll('.nav-btn');
    
    if (pages.length > 0) {
        pages.forEach(page => page.classList.remove('active'));
    }
    if (navBtns.length > 0) {
        navBtns.forEach(btn => btn.classList.remove('active'));
    }

    const pageElId = (pageId === 'roster') ? 'roster' : pageId;
    const toActivate = document.getElementById(pageElId);
    if (toActivate) toActivate.classList.add('active');

    const navBtn = document.querySelector(`[data-page="${pageId}"]`);
    if (navBtn) navBtn.classList.add('active');
    
    // Per la struttura semplificata di index.html, mostra la sezione scouting
    if (pageId === 'scouting') {
        const scoutingSection = document.getElementById('scouting-section');
        if (scoutingSection) {
            scoutingSection.style.display = 'block';
        }
    }

    // Inizializza/aggiorna la pagina specifica se necessario
    try {
        if (pageId === 'match-data') {
            if (typeof updateMatchInfo === 'function') updateMatchInfo();
        } else if (pageId === 'scouting') {
            if (typeof updateMatchInfo === 'function') updateMatchInfo();
            if (typeof updateScoutingUI === 'function') updateScoutingUI();
            const dlg = document.getElementById('scouting-dialog');
            if (dlg && dlg.open) dlg.close();
        } else if (pageId === 'roster') {
            if (typeof renderRosterTable === 'function') renderRosterTable();
        }
    } catch (e) {
        console.warn('Aggiornamento pagina non riuscito:', e);
    }

    // Adatta layout alla viewport dopo il cambio pagina
    try {
        if (typeof fitActivePageToViewport === 'function') fitActivePageToViewport();
    } catch (_) {}
}

function initializeApp() {
    try {
        // Rimuovi banner di debug se presente (indica che JS è in esecuzione)
        const debugBanner = document.getElementById('debug-banner');
        if (debugBanner) debugBanner.remove();

        // Gestione navigazione
        const navButtons = document.querySelectorAll('.nav-btn');
        navButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const page = btn.dataset.page;
                if (page) switchPage(page);
            });
        });
    
        // Inizializza le pagine necessarie
        if (typeof initializeScoutingPage === 'function') {
            try { initializeScoutingPage(); } catch (e) { console.warn('initializeScoutingPage errore:', e); }
        }
        if (typeof initializeRosterPage === 'function') {
            try { initializeRosterPage(); } catch (e) { console.warn('initializeRosterPage errore:', e); }
        }
        if (typeof initializeMatchDataPage === 'function') {
            try { initializeMatchDataPage(); } catch (e) { console.warn('initializeMatchDataPage errore:', e); }
        }
        
        // Pulsante INIZIA SET rimosso: nessuna inizializzazione necessaria
        
        // Inizializza il pulsante Cambia Squadra
        const backToWelcomeBtn = document.getElementById('backToWelcomeBtn');
        if (backToWelcomeBtn) {
            backToWelcomeBtn.addEventListener('click', () => {
                localStorage.removeItem('currentScoutingSession');
                window.location.replace('welcome.html');
            });
            console.log('Event listener aggiunto al pulsante Cambia Squadra');
        }
    
        // Header mobile overflow menu
        const headerMenuToggle = document.getElementById('headerMenuToggle');
        const headerMenu = document.getElementById('headerMenu');
        const backToWelcomeBtnMobile = document.getElementById('backToWelcomeBtnMobile');
        const signOutBtnMobile = document.getElementById('signOutBtnMobile');
        if (headerMenuToggle && headerMenu) {
            headerMenuToggle.addEventListener('click', () => {
                const isHidden = headerMenu.hasAttribute('hidden');
                if (isHidden) headerMenu.removeAttribute('hidden'); else headerMenu.setAttribute('hidden', '');
                headerMenuToggle.setAttribute('aria-expanded', (!isHidden).toString());
            });
            document.addEventListener('click', (e) => {
                if (!headerMenu.contains(e.target) && e.target !== headerMenuToggle) {
                    headerMenu.setAttribute('hidden', '');
                    headerMenuToggle.setAttribute('aria-expanded', 'false');
                }
            });
        }
        if (backToWelcomeBtnMobile) {
            backToWelcomeBtnMobile.addEventListener('click', () => {
                localStorage.removeItem('currentScoutingSession');
                window.location.replace('welcome.html');
            });
        }
        if (signOutBtnMobile && typeof window.authFunctions !== 'undefined') {
            signOutBtnMobile.addEventListener('click', () => {
                window.authFunctions.signOut();
            });
        }
    
        // Adatta la pagina alla viewport all'avvio e su resize
        try {
            requestAnimationFrame(() => {
                if (typeof fitActivePageToViewport === 'function') fitActivePageToViewport();
            });
            window.addEventListener('resize', () => {
                try { if (typeof fitActivePageToViewport === 'function') fitActivePageToViewport(); } catch (_) {}
            });
        } catch (_) {}
    
        // Attiva pagina iniziale
        switchPage(appState.currentPage || 'match-data');

        // Mostra app e nasconde la schermata di caricamento
        const appRoot = document.getElementById('app');
        if (appRoot) appRoot.style.display = 'block';
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) loadingScreen.style.display = 'none';

        console.log('initializeApp completata');
    } catch (e) {
        console.error('Errore initializeApp:', e);
    }
}

// Avvio automatico dopo il caricamento dello script
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// Variabili per i servizi Firebase (caricate dai file globali)

// Inizializza Firebase quando i moduli sono caricati

// Rende la tabella dei giocatori nella pagina Roster (sezione inferiore)
function renderRosterTable() {
    const tbody = document.getElementById('roster-table-body');
    if (!tbody) return;

    const players = Array.isArray(appState.currentRoster) ? appState.currentRoster : [];
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));

    const valid = players.filter(p => p && (p.number || p.name || p.surname || p.role || p.nickname));
    if (valid.length === 0) {
        tbody.innerHTML = '';
        return;
    }

    tbody.innerHTML = valid.map(p => `
        <tr>
            <td>${esc(p.number)}</td>
            <td>${esc(p.name)}</td>
            <td>${esc(p.surname)}</td>
            <td>${esc(p.role)}</td>
            <td>${esc(p.nickname)}</td>
        </tr>
    `).join('');
}

// === ROSTER PAGE ===
function initializeRosterPage() {
    try {
        const btnCreate = document.getElementById('btn-create-roster');
        const btnList = document.getElementById('btn-list-rosters');
        const btnLoad = document.getElementById('btn-load-roster');

        const openRosterList = () => {
            renderSavedRosters();
            openDialog('roster-list-dialog');
        };

        if (btnList) btnList.addEventListener('click', openRosterList);
        if (btnLoad) btnLoad.addEventListener('click', openRosterList);

        if (btnCreate) {
            btnCreate.addEventListener('click', () => {
                const containerId = 'roster-form-dialog';
                generateRosterFormIn(containerId);

                const nameInput = document.getElementById('roster-name-dialog');
                if (nameInput && !nameInput.value) nameInput.value = 'Roster';

                const btnSave = document.getElementById('save-roster-dialog');
                const btnClear = document.getElementById('clear-roster-dialog');
                const btnImport = document.getElementById('import-roster-dialog');
                const btnExport = document.getElementById('export-roster-dialog');
                const fileInput = document.getElementById('import-roster-file');

                if (btnSave) btnSave.onclick = () => saveCurrentRosterFromDialog(containerId);
                if (btnClear) btnClear.onclick = () => clearRosterIn(containerId);
                if (btnExport) btnExport.onclick = () => exportCurrentRosterToFile();
                if (btnImport && fileInput) {
                    btnImport.onclick = () => fileInput.click();
                    fileInput.onchange = (e) => {
                        const file = (e.target.files || [])[0];
                        if (file) importRosterFromFile(file);
                        e.target.value = '';
                    };
                }

                openDialog('roster-dialog');
            });
        }

        setLoadRosterEnabled(true);
    } catch (e) {
        console.warn('initializeRosterPage errore:', e);
    }
}

function renderSavedRosters() {
    const container = document.getElementById('saved-rosters');
    if (!container) return;
    const list = safeGetSavedRosters();
    if (!list.length) {
        container.innerHTML = '<p style=\'color:#666;\'>Nessun roster salvato</p>';
        return;
    }
    container.innerHTML = list.map(r => {
        const count = Array.isArray(r.players) ? r.players.filter(p => p && (p.number || p.name || p.surname || p.role || p.nickname)).length : 0;
        const dateStr = r.date ? new Date(r.date).toLocaleString() : '';
        return `
            <div class='roster-item'>
              <div class='roster-info'>
                <div class='roster-title'>${escapeHtml(r.name || 'Roster')}</div>
                <div class='roster-details'>${count} giocatori${dateStr ? ' - ' + escapeHtml(dateStr) : ''}</div>
              </div>
              <div class='roster-actions'>
                <button class='btn' data-action='load' data-id='${r.id}'>Carica</button>
                <button class='btn btn-secondary' data-action='delete' data-id='${r.id}'>Elimina</button>
              </div>
            </div>`;
    }).join('');

    container.querySelectorAll("button[data-action='load']").forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const list = safeGetSavedRosters();
            const item = list.find(x => String(x.id) === String(id));
            if (!item) return;
            appState.currentRoster = item.players || [];
            renderRosterTable();
            closeDialog('roster-list-dialog');
        });
    });

    container.querySelectorAll("button[data-action='delete']").forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            let list = safeGetSavedRosters();
            list = list.filter(x => String(x.id) !== String(id));
            localStorage.setItem('savedRosters', JSON.stringify(list));
            renderSavedRosters();
        });
    });
}

function safeGetSavedRosters() {
    try {
        const raw = localStorage.getItem('savedRosters');
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
    } catch (_) { return []; }
}

function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
}

function saveCurrentRosterFromDialog(containerId) {
    updateRosterStateFrom(containerId);
    const rosterName = (document.getElementById('roster-name-dialog') || {}).value?.trim();
    const players = appState.currentRoster || [];
    const hasData = players.some(p => p && (p.number || p.name || p.surname || p.role || p.nickname));
    if (!hasData) { alert('Compila almeno un giocatore prima di salvare'); return; }

    const item = {
        id: Date.now(),
        name: rosterName || 'Roster',
        players: players,
        date: new Date().toISOString()
    };
    const list = safeGetSavedRosters();
    list.unshift(item);
    localStorage.setItem('savedRosters', JSON.stringify(list));

    renderRosterTable();
    setLoadRosterEnabled(true);
    closeDialog('roster-dialog');
}

function generateRosterFormIn(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (container.getAttribute('data-generated') === 'true') return;

    const roles = ['Palleggiatore','Opposto','Schiacciatore','Centrale','Libero'];

    const rows = [];
    for (let i = 0; i < 16; i++) {
        rows.push(`
        <div class='roster-form-row' data-index='${i}' style='display:grid; grid-template-columns: 60px 1fr 1fr 160px 1fr 36px; gap: 8px; align-items:center; margin-bottom:6px;'>
            <input type='text' class='input' placeholder='N°' data-field='number' data-index='${i}' style='text-align:center;' />
            <input type='text' class='input' placeholder='Nome' data-field='name' data-index='${i}' />
            <input type='text' class='input' placeholder='Cognome' data-field='surname' data-index='${i}' />
            <select class='input' data-field='role' data-index='${i}'>
                <option value=''>Ruolo</option>
                ${roles.map(r => `<option value='${r}'>${r}</option>`).join('')}
            </select>
            <input type='text' class='input' placeholder='Nickname' data-field='nickname' data-index='${i}' />
            <button type='button' class='btn btn-secondary clear-row-btn' title='Pulisci riga' aria-label='Pulisci riga' data-index='${i}'>×</button>
        </div>`);
    }
    container.innerHTML = rows.join('');

    container.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('input', () => updateRosterStateFrom(containerId));
        el.addEventListener('change', () => updateRosterStateFrom(containerId));
    });

    container.querySelectorAll('.clear-row-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
            clearPlayerIn(idx, containerId);
        });
    });

    container.setAttribute('data-generated', 'true');
}

function clearPlayerIn(index, containerId) {
    const root = document.getElementById(containerId);
    if (!root) return;
    ['number','name','surname','role','nickname'].forEach(field => {
        const el = root.querySelector(`[data-field="${field}"][data-index="${index}"]`);
        if (el) el.value = '';
    });
    updateRosterStateFrom(containerId);
}

function clearRosterIn(containerId) {
    for (let i = 0; i < 16; i++) clearPlayerIn(i, containerId);
}

// === SCOUTING PAGE ===
function initializeScoutingPage() {
    // Inizializza solo se siamo nella pagina di scouting o se esiste la sezione scouting
    const scoutingPage = document.getElementById('scouting') || document.getElementById('scouting-section');
    if (scoutingPage) {
        const startSetBtn = document.getElementById('start-set');
        const submitActionBtn = document.getElementById('submit-action');
        const actionStringInput = document.getElementById('action-string');
        
        if (startSetBtn) {
            startSetBtn.addEventListener('click', startSet);
        }
        
        if (submitActionBtn) {
            submitActionBtn.addEventListener('click', submitAction);
        }
        
        // Enter key per submit azione
        if (actionStringInput) {
            actionStringInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    submitAction();
                }
            });
        }
        
        // Toggle Log Azioni
        const logToggle = document.getElementById('actions-log-toggle');
        const actionsLogBox = document.getElementById('actions-log');
        if (logToggle && actionsLogBox) {
            logToggle.addEventListener('click', () => {
                const collapsed = actionsLogBox.classList.toggle('is-collapsed');
                logToggle.setAttribute('aria-expanded', (!collapsed).toString());
                const icon = logToggle.querySelector('.toggle-icon');
                if (icon) icon.textContent = collapsed ? '▶' : '▼';
            });
        }
        
        // Fallback: se il roster non è ancora caricato, prova a recuperarlo dal TeamsModule o dal localStorage
        try {
            if (!Array.isArray(appState.currentRoster) || appState.currentRoster.length === 0) {
                let roster = [];
                // 1) prova dal modulo Teams
                if (window.teamsModule && typeof window.teamsModule.getCurrentTeam === 'function') {
                    const team = window.teamsModule.getCurrentTeam();
                    if (team && Array.isArray(team.players)) roster = team.players;
                }
                // 2) fallback: dal localStorage usando selectedTeamId
                if (!roster || roster.length === 0) {
                    const selId = localStorage.getItem('selectedTeamId');
                    const storedTeams = JSON.parse(localStorage.getItem('volleyTeams') || '[]');
                    const team = storedTeams.find(t => String(t.id) === String(selId));
                    if (team && Array.isArray(team.players)) roster = team.players;
                }
                if (Array.isArray(roster) && roster.length > 0) {
                    appState.currentRoster = roster;
                }
            }
        } catch (_) {}

        // Ascolta gli aggiornamenti del modulo Teams per ripopolare la griglia appena disponibili
        try {
            if (window.teamsModule) {
                if (typeof window.teamsModule.onTeamsUpdate === 'function') {
                    window.teamsModule.onTeamsUpdate(() => {
                        try {
                            const t = window.teamsModule.getCurrentTeam?.();
                            if (t && Array.isArray(t.players)) appState.currentRoster = t.players;
                            updatePlayersGrid();
                        } catch (_) {}
                    });
                }
                if (typeof window.teamsModule.onTeamChange === 'function') {
                    window.teamsModule.onTeamChange((team) => {
                        try {
                            if (team && Array.isArray(team.players)) appState.currentRoster = team.players;
                            updatePlayersGrid();
                        } catch (_) {}
                    });
                }
            }
        } catch (_) {}

        // Inizializza interfaccia guidata
        initializeGuidedScouting();

        // Popola subito la griglia giocatori (o mostra un messaggio se il roster non è caricato)
        try { updatePlayersGrid(); } catch (_) {}
    }
}

function openDialog(dialogId) {
    const el = document.getElementById(dialogId);
    if (!el) return;
    const isNative = el.tagName && el.tagName.toLowerCase() === 'dialog';
    if (isNative) {
        try {
            if (typeof el.showModal === 'function') el.showModal();
            else el.setAttribute('open', 'open');
        } catch (e) { el.setAttribute('open', 'open'); }
        return;
    }
    // Gestione custom <div class="dialog">
    el.removeAttribute('hidden');
    el.classList.add('is-open');
    document.body.style.overflow = 'hidden';
}

function closeDialog(dialogId) {
    const el = document.getElementById(dialogId);
    if (!el) return;
    const isNative = el.tagName && el.tagName.toLowerCase() === 'dialog';
    if (isNative) {
        try {
            if (typeof el.close === 'function') el.close();
            else el.removeAttribute('open');
        } catch (e) { el.removeAttribute('open'); }
        return;
    }
    // Gestione custom <div class="dialog">
    el.setAttribute('hidden', '');
    el.classList.remove('is-open');
    // Ripristina lo scroll se nessun altro dialog custom è aperto
    const anyOpen = document.querySelector('.dialog.is-open:not([hidden])');
    if (!anyOpen) document.body.style.overflow = '';
}

function initializeGuidedScouting() {
    // Event listeners per interfaccia guidata
    const backBtn = document.getElementById('back-to-player');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            showScoutingStep('step-player');
        });
    }
    
    // Event listeners per valutazioni (escludi "Err Avv" che ha il suo onclick handler)
    const evalButtons = document.querySelectorAll('.eval-btn');
    evalButtons.forEach(btn => {
        // Salta il pulsante "Err Avv" che ha già il suo onclick handler
        if (btn.textContent.includes('Err Avv')) {
            return;
        }
        
        btn.addEventListener('click', (e) => {
            const evaluation = parseInt(e.currentTarget.dataset.eval || e.currentTarget.textContent.trim()[0]);
            selectEvaluation(evaluation);
            // Avvio automatico della costruzione della quartina: niente più pulsante di conferma
            submitGuidedAction();
        });
    });
    
    // Non aprire automaticamente il dialog; verrà aperto quando l'utente entra nella pagina Scouting
}

function showScoutingStep(stepId) {
    const steps = document.querySelectorAll('.scouting-step');
    if (steps.length > 0) {
        steps.forEach(step => {
            step.classList.remove('active');
        });
    }
    const targetElement = document.getElementById(stepId);
    if (targetElement) {
        targetElement.classList.add('active');
    }
}

function updatePlayersGrid() {
    const container = document.getElementById('players-grid');
    if (!container) return;
    
    if (!appState.currentRoster || appState.currentRoster.length === 0) {
        container.innerHTML = '<p style="color: #666;">Nessun roster caricato. Vai alla sezione Roster per creare un roster.</p>';
        return;
    }
    
    const validPlayers = appState.currentRoster.filter(p => p && (p.number || p.name || p.surname));
    
    if (validPlayers.length === 0) {
        container.innerHTML = '<p style="color: #666;">Nessun giocatore valido nel roster.</p>';
        return;
    }
    
    container.innerHTML = validPlayers.map(player => {
        const displayName = player.nickname || `${player.name} ${player.surname}`.trim() || `Giocatore ${player.number}`;
        const role = player.role || '';
        const roleShort = role ? (role[0] || '').toUpperCase() : '';
        const roleClass = role === 'Palleggiatore' ? 'role-pal'
                        : role === 'Opposto' ? 'role-opp'
                        : role === 'Schiacciatore' ? 'role-sch'
                        : role === 'Centrale' ? 'role-ctr'
                        : role === 'Libero' ? 'role-lib'
                        : '';
        const nickname = player.nickname || `${player.name} ${player.surname}`.trim() || `Giocatore ${player.number}`;
        return `
            <button class="player-btn ${roleClass}" data-role="${role}" data-number="${player.number}" data-name="${nickname}">
                <div class="player-line1">
                    <span class="player-number">${player.number}</span>
                    <span class="player-role">${roleShort}</span>
                </div>
                <div class="player-line2">
                    <span class="player-name">${nickname}</span>
                </div>
            </button>
        `;
    }).join('');
    
    // Aggiungi event listeners
    container.querySelectorAll('.player-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const number = e.currentTarget.dataset.number;
            const name = e.currentTarget.dataset.name;
            // Passo anche il riferimento al bottone per evidenziare la selezione
            selectPlayer(number, name, e.currentTarget);
        });
    });
}

function selectPlayer(number, name, btnEl) {
    appState.selectedPlayer = { number, name };

    // Evidenzia visivamente il giocatore selezionato, sovrascrivendo selezioni precedenti
    const playerButtons = document.querySelectorAll('.player-btn');
    playerButtons.forEach(b => b.classList.remove('selected'));
    if (btnEl) btnEl.classList.add('selected');

    // Persisti il fondamentale calcolato per coerenza tra descrittivo e quartina
    appState.calculatedFundamental = predictNextFundamental();

    // Aggiorna elementi di compatibilità
    const oldElement = document.getElementById('selected-player-info');
    if (oldElement) {
        oldElement.textContent = `${number} - ${name}`;
    }
    const newElement = document.getElementById('selected-player-display');
    if (newElement) {
        const roleShort = (btnEl && btnEl.dataset && btnEl.dataset.role ? (btnEl.dataset.role[0] || '').toUpperCase() : '');
        const nickname = name || '';
        newElement.innerHTML = `
            <div class="player-line1">
                <span class="player-number">${String(number).padStart(2, '0')}</span>
                <span class="player-role">${roleShort}</span>
            </div>
            <div class="player-line2">
                <span class="player-name">${nickname}</span>
            </div>
        `;
    }

    // Aggiorna UI
    updateNextFundamental();

    const summaryBox = document.getElementById('action-summary-box');
    if (summaryBox) {
        summaryBox.style.display = 'block';
    }

    updateActionSummary();

    // Campo descrittivo "parlante" della quartina corrente
    function updateDescriptiveQuartet() {
        const box = document.getElementById('pressed-buttons-box');
        const el = document.getElementById('pressed-buttons-log');
        if (!el) return;
    
        // Caso speciale: Err Avv richiesto come “– Err Avv”
        if (appState.opponentErrorPressed) {
            el.textContent = '– Err Avv';
            if (box) box.style.display = 'block';
            return;
        }
    
        const player = appState.selectedPlayer;
        const fund = appState.calculatedFundamental || predictNextFundamental();
        const evalVal = appState.selectedEvaluation;
    
        if (player && fund) {
            const names = { b: 'Servizio', r: 'Ricezione', a: 'Attacco', d: 'Difesa', m: 'Muro' };
            const nn = String(player.number || '').padStart(2, '0');
            const evalText = (evalVal ? `Val${evalVal}` : 'Val?');
            el.textContent = `${nn} ${names[fund] || fund} ${evalText}`;
            if (box) box.style.display = 'block';
        } else {
            el.textContent = '';
            if (box) box.style.display = 'none';
        }
    }
    
    showScoutingStep('step-action');
}

function selectEvaluation(evaluation) {
    appState.selectedEvaluation = evaluation;
    
    // Evidenzia il pulsante selezionato
    const evalButtons = document.querySelectorAll('.eval-btn');
    evalButtons.forEach(btn => {
        btn.classList.remove('selected');
    });
    
    // Trova il pulsante corretto basandosi sul testo o data attribute
    const selectedBtn = Array.from(evalButtons).find(btn => {
        return btn.textContent.startsWith(evaluation.toString()) || btn.dataset.eval === evaluation.toString();
    });
    
    if (selectedBtn) {
        selectedBtn.classList.add('selected');
        // Registra il testo del pulsante di valutazione premuto (es: "4 - Positivo")
        updateDescriptiveQuartet();
    }
}

function submitGuidedAction() {
    if (!appState.selectedPlayer) {
        alert('Errore: nessun giocatore selezionato');
        return;
    }
    
    if (!appState.selectedEvaluation) {
        alert('Seleziona una valutazione');
        return;
    }
    
    const fundamental = appState.calculatedFundamental || predictNextFundamental();
    const evaluation = appState.selectedEvaluation;
    const quartet = `${appState.selectedPlayer.number.padStart(2, '0')}${fundamental}${evaluation}`;
    appState.currentSequence.push({quartet, playerName: appState.selectedPlayer.name});
    
    updateActionSummary();
    
    const tempResult = determineFinalResult(fundamental, evaluation);
    let isPoint = tempResult === 'home_point' || tempResult === 'away_point';
    
    if (isPoint) {
        const actionString = appState.currentSequence.map(s => s.quartet).join(' ');
        try {
            const result = parseAction(actionString);
            processActionResult(result);
            
            appState.actionsLog.push({
                action: actionString,
                result: result,
                score: `${appState.homeScore}-${appState.awayScore}`,
                guided: true
            });
            
            appState.currentSequence = [];
            updateActionSummary();
        } catch (error) {
            alert(`Errore nell'azione: ${error.message}`);
            appState.currentSequence.pop(); // Rimuovi l'ultima se errore
            return;
        }
    }
    
    // Aggiorna UI
    updateScoutingUI();
    updateActionsLog();
    updateNextFundamental();
    updatePlayersGrid();
    
    // Torna alla selezione giocatore
    showScoutingStep('step-player');
    
    // Reset selezione
    appState.selectedPlayer = null;
    appState.selectedEvaluation = null;
    
    if (isPoint) checkSetEnd();
}

function submitOpponentError() {
    const actionString = 'avv';
    // Imposta flag per mostrare il descrittivo “– Err Avv”
    appState.opponentErrorPressed = true;
    updateDescriptiveQuartet();
    try {
        const result = parseAction(actionString);
        processActionResult(result);
        
        appState.actionsLog.push({
            action: actionString,
            result: result,
            score: `${appState.homeScore}-${appState.awayScore}`,
            guided: true
        });
        
        updateScoutingUI();
        updateActionsLog();
        checkSetEnd();
        updateNextFundamental();
        showScoutingStep('step-player');
        updateActionSummary();
        // Pulisci descrittivo e flag
        appState.selectedPlayer = null;
        appState.selectedEvaluation = null;
        appState.calculatedFundamental = null;
        appState.opponentErrorPressed = false;
        updateDescriptiveQuartet();
    } catch (error) {
        alert(`Errore: ${error.message}`);
        // In caso di errore, azzera il flag per non lasciare il descrittivo attivo
        appState.opponentErrorPressed = false;
        updateDescriptiveQuartet();
    }
}

function updateGamePhase(fundamental, evaluation) {
    const eval = parseInt(evaluation);

    // Logica per cambiare la fase di gioco basata sul risultato dell'azione
    if (fundamental === 'b') { // Servizio
        if (eval === 1) {
            // Errore al servizio = punto avversario, passiamo in ricezione
            appState.currentPhase = 'ricezione';
        } else if (eval === 5) {
            // Ace = punto nostro, rimaniamo al servizio
            appState.currentPhase = 'servizio';
        }
        // Per valutazioni 2,3,4 la fase rimane invariata fino al prossimo punto
    } else if (fundamental === 'r') { // Ricezione
        if (eval === 1) {
            // Errore in ricezione = punto avversario, passiamo al servizio
            appState.currentPhase = 'servizio';
        }
        // Per altre valutazioni continuiamo nella stessa fase
    } else if (fundamental === 'a') { // Attacco
        if (eval === 1) {
            // Errore in attacco = punto avversario
            if (appState.currentPhase === 'servizio') {
                appState.currentPhase = 'ricezione';
            } else {
                appState.currentPhase = 'servizio';
            }
        } else if (eval === 5) {
            // Punto in attacco = nostro punto
            if (appState.currentPhase === 'ricezione') {
                appState.currentPhase = 'servizio';
            } else {
                appState.currentPhase = 'ricezione';
            }
        }
    } else if (fundamental === 'd') { // Difesa
        if (eval === 1) {
            // Errore in difesa = punto avversario
            appState.currentPhase = 'ricezione';
        }
    }

    // Aggiorna il display della fase corrente
    updateCurrentPhaseDisplay();
}

function updateActionsLog() {
    const container = document.getElementById('actions-list');
    if (!container) return;
    
    let displayLogs = appState.actionsLog.slice(-9).reverse();
    
    if (appState.currentSequence.length > 0) {
        const currentString = appState.currentSequence.map(s => s.quartet).join(' ');
        displayLogs.unshift({
            timestamp: 'Corrente',
            action: currentString,
            result: {result: 'continue'},
            guided: true
        });
    }
    
    if (displayLogs.length === 0) {
        container.innerHTML = '<p style="color: #666;">Nessuna azione registrata</p>';
        return;
    }
    
    container.innerHTML = displayLogs.map(log => {
        let resultText = '';
        switch (log.result.result) {
            case 'home_point':
                resultText = '🏐 Punto Casa';
                break;
            case 'away_point':
                resultText = '🏐 Punto Ospiti';
                break;
            default:
                resultText = '↔️ In corso';
        }
        
        const actionDisplay = log.action;
        
        return `
            <div class="action-entry ${log.guided ? 'guided-action' : ''}">
                <strong>${log.timestamp}</strong>: ${actionDisplay}
                <div class="action-result">${resultText}</div>
            </div>
        `;
    }).join('');

    // Aggiorna badge conteggio
    const countBadge = document.getElementById('actions-log-count');
    if (countBadge) countBadge.textContent = String(appState.actionsLog.length);
}

// Utility aggiunte: display fase e predizione/aggiornamento fondamentale
function updateCurrentPhaseDisplay() {
    const phaseElement = document.getElementById('current-phase');
    if (phaseElement) {
        phaseElement.textContent = (appState.currentPhase || '').toUpperCase();
    }
    const phaseElement2 = document.getElementById('current-phase-2');
    if (phaseElement2) {
        phaseElement2.textContent = (appState.currentPhase || '').toLowerCase();
    }
}

function getCurrentActionLogs() {
    if (appState.currentSequence && appState.currentSequence.length > 0) {
        return appState.currentSequence.map(s => ({ action: s.quartet }));
    }
    const logs = appState.actionsLog || [];
    const currentSequence = [];
    for (let i = logs.length - 1; i >= 0; i--) {
        const log = logs[i];
        currentSequence.unshift(log);
        if (log && log.result && (log.result.result === 'home_point' || log.result.result === 'away_point')) {
            break;
        }
    }
    return currentSequence;
}

function predictNextFundamental() {
    const currentActionLogs = getCurrentActionLogs();
    if (currentActionLogs.length > 0) {
        const lastLog = currentActionLogs[currentActionLogs.length - 1];

        // Se il log contiene il risultato del rally precedente, usa quello
        if (lastLog.result && lastLog.result.result) {
            const res = lastLog.result.result;
            if (res === 'home_point') return 'b';   // abbiamo fatto punto: prossimo fondamentale è Servizio
            if (res === 'away_point') return 'r';   // punto avversario: prossimo fondamentale è Ricezione
        }

        // Altrimente siamo nel mezzo di una sequenza: analizza l'ultimo token dell'azione
        const actString = lastLog.action || '';
        const tokens = actString.trim().split(/\s+/);
        const lastPart = tokens[tokens.length - 1] || '';

        // Caso speciale: "avv" (errore avversario) chiude l'azione con punto nostro => prossimo è Servizio
        if (lastPart.toLowerCase() === 'avv') return 'b';

        if (lastPart.length >= 4) {
            const lastFund = lastPart.charAt(2);
            const lastEval = parseInt(lastPart.charAt(3));

            // Se l'azione si chiude con A5, B5, M5 => prossimo fondamentale è Servizio (b)
            if ((lastFund === 'a' || lastFund === 'b' || lastFund === 'm') && lastEval === 5) {
                return 'b';
            }

            // Logica esistente per la predizione durante lo scambio
            if (lastFund === 'd') {
                if (lastEval === 2) return 'd';
                else if (lastEval >= 3 && lastEval <= 5) return 'a';
            } else if (lastFund === 'r') {
                if (lastEval === 2) return 'd';
                else if (lastEval >= 3 && lastEval <= 5) return 'a';
            } else if (lastFund === 'a' || lastFund === 'b') {
                if (lastEval !== 1 && lastEval !== 5) return 'd';
            }
        }
    }
    // Fallback basato sulla fase corrente
    if (appState.currentPhase === 'servizio') return 'b';
    if (appState.currentPhase === 'ricezione') return 'r';
    return 'a';
}

function updateNextFundamental() {
    const fundamental = predictNextFundamental();
    const namesWithCode = { b: 'Servizio (b)', r: 'Ricezione (r)', a: 'Attacco (a)', d: 'Difesa (d)', m: 'Muro (m)' };
    const namesPlain = { b: 'Servizio', r: 'Ricezione', a: 'Attacco', d: 'Difesa', m: 'Muro' };
    const el = document.getElementById('next-fundamental');
    if (el) el.textContent = namesWithCode[fundamental] || 'Sconosciuto';
    const cur = document.getElementById('current-fundamental');
    if (cur) cur.textContent = namesPlain[fundamental] || 'Sconosciuto';
}

function startSet() {
    // Verifica se siamo nella versione semplificata o completa
    const setNumberEl = document.getElementById('current-set');
    const rotationEl = document.getElementById('rotation');
    const phaseEl = document.getElementById('game-phase');
    
    let setNumber, rotation, phase;
    
    if (setNumberEl && rotationEl && phaseEl) {
        // Versione completa - usa i valori dall'interfaccia
        setNumber = parseInt(setNumberEl.value);
        rotation = rotationEl.value;
        phase = phaseEl.value;
    } else {
        // Versione semplificata - usa i dati dalla sessione salvata
        const sessionData = JSON.parse(localStorage.getItem('currentScoutingSession') || '{}');
        if (sessionData.setConfig) {
            setNumber = sessionData.setConfig.set || 1;
            rotation = sessionData.setConfig.ourRotation || 'P1';
            phase = sessionData.setConfig.phase || 'servizio';
        } else {
            // Valori di default se non c'è sessione
            setNumber = 1;
            rotation = 'P1';
            phase = 'servizio';
        }
    }
    
    appState.currentSet = setNumber;
    appState.currentRotation = rotation;
    appState.currentPhase = phase;
    appState.homeScore = 0;
    appState.awayScore = 0;
    appState.actionsLog = [];
    appState.setStarted = true;
    appState.selectedPlayer = null;
    appState.selectedEvaluation = null;
    
    // Inizializza il log dei tasti premuti
    // Reset del descrittivo
    updateDescriptiveQuartet();
    
    // Mostra sezione scouting se esiste (versione completa)
    const scoutingSection = document.getElementById('scouting-section');
    if (scoutingSection) {
        scoutingSection.style.display = 'block';
    }
    
    // Aggiorna UI
    updateMatchInfo();
    updateScoutingUI();
    updateCurrentPhaseDisplay();
    updateNextFundamental();
    updatePlayersGrid();
    
    // Apri l'interfaccia guidata se esiste (versione completa)
    if (typeof showScoutingStep === 'function') {
        showScoutingStep('step-player');
        // niente openDialog: contenuto embedded nella pagina
    }
    
    // Passa alla pagina di scouting
    switchPage('scouting');
    
    console.log('Set avviato con successo:', { setNumber, rotation, phase });
}

function updateMatchSummary() {
    const dateEl = document.getElementById('summary-date');
    const typeEl = document.getElementById('summary-type');
    const teamsEl = document.getElementById('summary-teams');
    if (!dateEl || !typeEl || !teamsEl) return;

    if (appState.currentMatch) {
        const date = appState.currentMatch.date || '-';
        const type = appState.currentMatch.matchType || '-';
        const myTeam = appState.currentMatch.myTeam || appState.currentMatch.homeTeam || '-';
        const opponent = appState.currentMatch.opponentTeam || appState.currentMatch.awayTeam || '-';
        teamsEl.textContent = `${myTeam} vs ${opponent}`;
        dateEl.textContent = date;
        typeEl.textContent = type;
    } else {
        dateEl.textContent = '-';
        typeEl.textContent = '-';
        teamsEl.textContent = '-';
    }
}

function updateMatchInfo() {
    const matchInfoSection = document.getElementById('match-info-section');
    if (!matchInfoSection) return;
    
    if (appState.currentMatch) {
        // Mostra la sezione delle informazioni della partita
        matchInfoSection.style.display = 'block';
        
        // Determina quale squadra è la nostra e quale l'avversaria
        const myTeam = appState.currentMatch.myTeam || appState.currentMatch.homeTeam;
        const opponentTeam = appState.currentMatch.opponentTeam || appState.currentMatch.awayTeam;
        const homeAway = appState.currentMatch.homeAway;
        
        // Aggiorna i dati della partita con indicazione del nostro team
        let homeDisplay = appState.currentMatch.homeTeam;
        let awayDisplay = appState.currentMatch.awayTeam;
        
        // Aggiungi indicatori per il nostro team
        if (homeAway === 'home') {
            homeDisplay += ' (Il mio Team)';
        } else if (homeAway === 'away') {
            awayDisplay += ' (Il mio Team)';
        }
        
        const homeTeamEl = document.getElementById('match-home-team');
        if (homeTeamEl) homeTeamEl.textContent = homeDisplay;
        
        const awayTeamEl = document.getElementById('match-away-team');
        if (awayTeamEl) awayTeamEl.textContent = awayDisplay;
        
        const matchTypeEl = document.getElementById('match-type');
        if (matchTypeEl) matchTypeEl.textContent = appState.currentMatch.matchType;
        
        const matchDateEl = document.getElementById('match-date');
        if (matchDateEl) matchDateEl.textContent = appState.currentMatch.date;
    } else {
        // Nasconde la sezione se non c'è una partita caricata
        matchInfoSection.style.display = 'none';
    }
}

function updateScoutingUI() {
    const homeScoreEl = document.querySelector('.home-score');
    if (homeScoreEl) homeScoreEl.textContent = appState.homeScore;
    
    const awayScoreEl = document.querySelector('.away-score');
    if (awayScoreEl) awayScoreEl.textContent = appState.awayScore;
    
    const rotationEl = document.getElementById('current-rotation');
    if (rotationEl) rotationEl.textContent = appState.currentRotation;
    
    const phaseEl = document.getElementById('current-phase');
    if (phaseEl) phaseEl.textContent = appState.currentPhase;
    
    const setEl = document.getElementById('current-set-display');
    if (setEl) setEl.textContent = `Set ${appState.currentSet}`;
}

function updateActionSummary() {
    const el = document.getElementById('action-summary');
    const box = document.getElementById('action-summary-box');
    if (!el) return;
    const text = (appState.currentSequence && appState.currentSequence.length > 0)
        ? appState.currentSequence.map(s => s.quartet).join(' ')
        : '';
    el.textContent = text;
    if (box) box.style.display = text ? 'block' : 'none';
}

function submitAction() {
    const inputEl = document.getElementById('action-string');
    const actionString = inputEl ? inputEl.value.trim() : '';

    // Se l'input non esiste in questa UI (es. si usa solo la modalità guidata), esci in modo sicuro
    if (!inputEl) {
        console.warn('submitAction chiamata ma #action-string non è presente nel DOM');
        return;
    }
    
    if (!actionString) {
        alert('Inserisci una stringa di azione');
        return;
    }
    
    if (!appState.setStarted) {
        alert('Devi prima iniziare il set');
        return;
    }
    
    try {
        const result = parseAction(actionString);
        processActionResult(result);
        
        // Aggiungi al log
        appState.actionsLog.push({
            action: actionString,
            result: result,
            timestamp: new Date().toLocaleTimeString('it-IT')
        });
        
        // Aggiorna UI
        updateScoutingUI();
        updateActionsLog();
        
        // Pulisci input
        if (inputEl) inputEl.value = '';
        
        // Controlla fine set
        checkSetEnd();
        
    } catch (error) {
        alert(`Errore nella stringa: ${error.message}`);
    }
}

function parseAction(actionString) {
    // Parsing della stringa di azione
    const parts = actionString.split(' ');
    const actions = [];
    let finalResult = null;
    
    for (const part of parts) {
        if (part === 'avv') {
            finalResult = 'home_point';
            break;
        }
        
        if (part.length >= 3) {
            const playerNumber = part.substring(0, 2);
            const fundamental = part.charAt(2);
            const evaluation = parseInt(part.charAt(3));
            
            if (isNaN(evaluation) || evaluation < 1 || evaluation > 5) {
                throw new Error(`Valutazione non valida: ${evaluation}`);
            }
            
            actions.push({
                player: playerNumber,
                fundamental: fundamental,
                evaluation: evaluation
            });
            
            // Determina il risultato basato sull'ultima azione
            if (actions.length === parts.length) {
                finalResult = determineFinalResult(fundamental, evaluation);
            }
        }
    }
    
    return {
        actions: actions,
        result: finalResult
    };
}

function determineFinalResult(fundamental, evaluation) {
    // Logica per determinare il risultato finale
    switch (fundamental) {
        case 'b': // Servizio
        case 'a': // Attacco
        case 'm': // Muro
            if (evaluation === 1) return 'away_point'; // Errore
            if (evaluation === 5) return 'home_point'; // Punto
            return 'continue'; // Continua azione
            
        case 'r': // Ricezione
        case 'd': // Difesa
            if (evaluation === 1) return 'away_point'; // Errore
            return 'continue'; // Continua azione
            
        default:
            return 'continue';
    }
}

function processActionResult(result) {
    if (result.result === 'home_point') {
        appState.homeScore++;
        if (appState.currentPhase === 'ricezione') {
            appState.currentPhase = 'servizio';
            rotateTeam();
        }
    } else if (result.result === 'away_point') {
        appState.awayScore++;
        if (appState.currentPhase === 'servizio') {
            appState.currentPhase = 'ricezione';
        } else {
            appState.currentPhase = 'ricezione';
        }
    }
}

function rotateTeam() {
    const currentIndex = rotationSequence.indexOf(appState.currentRotation);
    const nextIndex = (currentIndex + 1) % rotationSequence.length;
    appState.currentRotation = rotationSequence[nextIndex];
}

// === MATCH DATA PAGE ===
function initializeMatchDataPage() {
    console.log('Initializing Match Data Page');
    const form = document.getElementById('new-match-form');
    if (form && !form.hasAttribute('data-initialized')) {
        form.addEventListener('submit', handleNewMatch);
        form.setAttribute('data-initialized', 'true');
    }
    
    loadMatchesList();

    // Gestione nuovi pulsanti
    const newMatchBtn = document.getElementById('new-match-btn');
    const loadMatchesBtn = document.getElementById('load-matches-btn');
    const newMatchSection = document.getElementById('new-match-section');
    const matchesListSection = document.getElementById('matches-list-section');

    console.log('newMatchBtn:', newMatchBtn);
    console.log('loadMatchesBtn:', loadMatchesBtn);
    console.log('newMatchSection:', newMatchSection);
    console.log('matchesListSection:', matchesListSection);
}

// Funzione loadMatchesList con controllo null - versione aggiornata
function loadMatchesList() {
    console.log('loadMatchesList chiamata - versione aggiornata');
    const container = document.getElementById('matches-list');
    if (!container) {
        console.warn('Elemento matches-list non trovato nella pagina corrente - questo è normale se non siamo nella pagina matches');
        return;
    }
    
    // Qui andrà la logica per caricare e visualizzare le partite
    container.innerHTML = '<p>Lista partite in caricamento... (versione aggiornata)</p>';
}

// Campo descrittivo: elenco dei tasti premuti
function addPressedButton(label) {
    if (!appState.pressedButtons) appState.pressedButtons = [];
    appState.pressedButtons.push(label);
    updatePressedButtonsDisplay();
}

function updatePressedButtonsDisplay() {
    const el = document.getElementById('pressed-buttons-log');
    const box = document.getElementById('pressed-buttons-box');
    if (!el) return;
    el.textContent = (appState.pressedButtons && appState.pressedButtons.length)
        ? appState.pressedButtons.join(' • ')
        : '';
    if (box) box.style.display = (appState.pressedButtons && appState.pressedButtons.length) ? 'block' : 'none';
}
// Campo descrittivo "parlante" della quartina corrente
function updateDescriptiveQuartet() {
    const box = document.getElementById('pressed-buttons-box');
    const el = document.getElementById('pressed-buttons-log');
    if (!el) return;

    // Caso speciale: Err Avv richiesto come "– Err Avv"
    if (appState.opponentErrorPressed) {
        el.textContent = '– Err Avv';
        if (box) box.style.display = 'block';
        return;
    }

    const player = appState.selectedPlayer;
    const fund = appState.calculatedFundamental || predictNextFundamental();
    const evalVal = appState.selectedEvaluation;

    if (player && fund) {
        const names = { b: 'Servizio', r: 'Ricezione', a: 'Attacco', d: 'Difesa', m: 'Muro' };
        const nn = String(player.number || '').padStart(2, '0');
        const evalText = (evalVal ? `Val${evalVal}` : 'Val?');
        el.textContent = `${nn} ${names[fund] || fund} ${evalText}`;
        if (box) box.style.display = 'block';
    } else {
        el.textContent = '';
        if (box) box.style.display = 'none';
    }
}

function checkSetEnd() {
    // Determina i punti target per il set corrente (standard volley: 25 punti, tie-break a 15)
    const targetPoints = (appState.currentSet === 5) ? 15 : 25;
    const home = appState.homeScore;
    const away = appState.awayScore;
    const lead = Math.abs(home - away);

    // Fine set quando una delle squadre raggiunge i punti target con almeno 2 punti di vantaggio
    if ((home >= targetPoints || away >= targetPoints) && lead >= 2) {
        // Segna il set come terminato; l'avvio del prossimo set resta a scelta dell'utente
        appState.setStarted = false;
        console.log(`Set ${appState.currentSet} concluso: ${home}-${away}`);
        return true;
    }
    return false;
}
