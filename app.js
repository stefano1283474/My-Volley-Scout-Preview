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
    selectedEvaluation: null,
    scoreHistory: [], // Storico progressivo dei punti
    multiLineLayout: false, // Layout "a riga multipla" per la progressione
    // Blocco temporaneo e auto-chiusura azione
    autoClosePending: false,
    autoCloseTimerId: null,
    autoClosePayload: null,
    // Flag per pulire le pillole dopo chiusura azione
    justClosedAction: false,
    // Modalità sostituzione giocatore dalla pillola "Hai Selezionato"
    replacePlayerMode: false
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
            // Preferisci meta per set se disponibile
            const sm = (md.setMeta && md.setMeta[appState.currentSet]) ? md.setMeta[appState.currentSet] : null;
            const __rotCfg = md.setConfig.ourRotation;
            appState.currentRotation = (sm && sm.ourRotation) ? sm.ourRotation : ((__rotCfg && String(__rotCfg).startsWith('P')) ? __rotCfg : (__rotCfg ? `P${__rotCfg}` : 'P1'));
            appState.currentPhase = (sm && sm.phase) ? sm.phase : (md.setConfig.phase || 'servizio');
        }

        // Reidrata punteggio, storico e azioni se presenti (ripresa sessione)
        try {
            if (md.score && typeof md.score.home === 'number' && typeof md.score.away === 'number') {
                appState.homeScore = md.score.home;
                appState.awayScore = md.score.away;
            }
            // Preferisci storico punteggio per set se presente
            const cs = appState.currentSet;
            if (md.scoreHistoryBySet && Array.isArray(md.scoreHistoryBySet[cs])) {
                appState.scoreHistory = md.scoreHistoryBySet[cs] || [];
            } else if (Array.isArray(md.scoreHistory) && md.scoreHistory.length > 0) {
                appState.scoreHistory = md.scoreHistory;
            }
            // Preferisci azioni per set se disponibili
            if (md.actionsBySet && Array.isArray(md.actionsBySet[appState.currentSet])) {
                appState.actionsLog = md.actionsBySet[appState.currentSet] || [];
            } else if (Array.isArray(md.actions) && md.actions.length > 0) {
                appState.actionsLog = md.actions;
            }
            // Punteggio da stato sintetico del set o dall'ultimo elemento dello storico
            try {
                const setState = md.setStateBySet && md.setStateBySet[cs];
                if (setState) {
                    if (typeof setState.homeScore === 'number') appState.homeScore = setState.homeScore;
                    if (typeof setState.awayScore === 'number') appState.awayScore = setState.awayScore;
                    if (setState.currentPhase) appState.currentPhase = setState.currentPhase;
                    if (setState.currentRotation) appState.currentRotation = setState.currentRotation;
                } else if (Array.isArray(appState.scoreHistory) && appState.scoreHistory.length > 0) {
                    const last = appState.scoreHistory[appState.scoreHistory.length - 1];
                    if (last && typeof last.homeScore === 'number' && typeof last.awayScore === 'number') {
                        appState.homeScore = last.homeScore;
                        appState.awayScore = last.awayScore;
                    }
                }
            } catch(_) {}
            // Contrassegna come set avviato quando si riprende
            if (md.status === 'in_progress' || (appState.actionsLog && appState.actionsLog.length)) {
                appState.setStarted = true;
            }
        } catch(_) {}

        // Aggiorna UI iniziale
        try { updateMatchSummary(); } catch(_) {}
        try { updateMatchInfo(); } catch(_) {}
        try { updateScoutingUI(); } catch(_) {}
        try { updateCurrentPhaseDisplay(); } catch(_) {}
        try { updateNextFundamental(); } catch(_) {}
        try { renderRosterTable(); } catch(_) {}
        try { updatePlayersGrid(); } catch(_) {}
        try { updateActionsLog(); } catch(_) {}
        try { updateScoreHistoryDisplay(); } catch(_) {}

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
    
    // Per la struttura semplificata di index.html, mostra la sezione corretta
    const scoutingSection = document.getElementById('scouting-section');
    const analysisSection = document.getElementById('analysis-section');
    if (scoutingSection) scoutingSection.style.display = (pageId === 'scouting') ? 'block' : 'none';
    if (analysisSection) analysisSection.style.display = (pageId === 'analysis') ? 'block' : 'none';

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
        } else if (pageId === 'analysis') {
            // Inizializzazioni future per la pagina Analisi
            // Placeholder: potremmo aggiornare riepiloghi, grafici, ecc.
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

        // Pulsante Analisi (desktop)
        const analysisBtn = document.getElementById('analysisBtn');
        if (analysisBtn) {
            analysisBtn.addEventListener('click', () => switchPage('analysis'));
        }
    
        // Header mobile overflow menu
        const headerMenuToggle = document.getElementById('headerMenuToggle');
        const headerMenu = document.getElementById('headerMenu');
        const goToMatchesBtnMobile = document.getElementById('goToMatchesBtnMobile');
        const goToTeamsBtnMobile = document.getElementById('goToTeamsBtnMobile');
        const exitToWelcomeBtnMobile = document.getElementById('exitToWelcomeBtnMobile');
        const exportSetsBtnMobile = document.getElementById('exportSetsBtnMobile');
        const signOutBtnMobile = document.getElementById('signOutBtnMobile');
        if (headerMenuToggle && headerMenu) {
            headerMenuToggle.addEventListener('click', () => {
                const isHidden = headerMenu.hasAttribute('hidden');
                if (isHidden) headerMenu.removeAttribute('hidden'); else headerMenu.setAttribute('hidden', '');
                headerMenuToggle.setAttribute('aria-expanded', (!isHidden).toString());
            });
            document.addEventListener('click', (e) => {
                const onToggle = !!e.target.closest('#headerMenuToggle');
                if (!headerMenu.contains(e.target) && !onToggle) {
                    headerMenu.setAttribute('hidden', '');
                    headerMenuToggle.setAttribute('aria-expanded', 'false');
                }
            });
            // Chiudi con ESC
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !headerMenu.hasAttribute('hidden')) {
                    headerMenu.setAttribute('hidden', '');
                    headerMenuToggle.setAttribute('aria-expanded', 'false');
                    headerMenuToggle.focus();
                }
            });
        }
        if (goToMatchesBtnMobile) {
            goToMatchesBtnMobile.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                    // Salvataggio non bloccante (se fallisce, ignora)
                    try { saveCurrentMatch(); } catch(_){}
                    window.location.href = 'matches.html';
                } finally {
                    if (headerMenu) headerMenu.setAttribute('hidden', '');
                    if (headerMenuToggle) headerMenuToggle.setAttribute('aria-expanded', 'false');
                }
            });
        }
        if (goToTeamsBtnMobile) {
            goToTeamsBtnMobile.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                    // Salvataggio non bloccante (se fallisce, ignora)
                    try { saveCurrentMatch(); } catch(_){}
                    window.location.href = 'welcome.html';
                } finally {
                    if (headerMenu) headerMenu.setAttribute('hidden', '');
                    if (headerMenuToggle) headerMenuToggle.setAttribute('aria-expanded', 'false');
                }
            });
        }
        // Nuova voce: Esci (torna a Welcome.html)
        if (exitToWelcomeBtnMobile) {
            exitToWelcomeBtnMobile.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                    // Salvataggio non bloccante del match corrente
                    try { saveCurrentMatch(); } catch(_){}
                    window.location.href = 'welcome.html';
                } finally {
                    if (headerMenu) headerMenu.setAttribute('hidden', '');
                    if (headerMenuToggle) headerMenuToggle.setAttribute('aria-expanded', 'false');
                }
            });
        }
        if (exportSetsBtnMobile) {
            exportSetsBtnMobile.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                    // Salvataggio non bloccante del set corrente
                    try { await saveCurrentMatch(); } catch(_){}
                    if (typeof window.exportAllSetsToExcel === 'function') {
                        await window.exportAllSetsToExcel();
                    }
                } finally {
                    if (headerMenu) headerMenu.setAttribute('hidden', '');
                    if (headerMenuToggle) headerMenuToggle.setAttribute('aria-expanded', 'false');
                }
            });
        }
        if (signOutBtnMobile && typeof window.authFunctions !== 'undefined') {
            signOutBtnMobile.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                    // Salvataggio non bloccante (se fallisce, ignora)
                    try { await saveCurrentMatch(); } catch(_){}
                    await window.authFunctions.signOut();
                } finally {
                    if (headerMenu) headerMenu.setAttribute('hidden', '');
                    if (headerMenuToggle) headerMenuToggle.setAttribute('aria-expanded', 'false');
                }
            });
        }

        // Toggle layout "a riga multipla" nella sezione selezionato
        try {
            const layoutToggle = document.getElementById('multi-line-toggle');
            if (layoutToggle) {
                layoutToggle.checked = !!appState.multiLineLayout;
                layoutToggle.addEventListener('change', () => {
                    appState.multiLineLayout = layoutToggle.checked;
                    updateDescriptiveQuartet();
                });
            }
        } catch (_) {}

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

// Gestione autosave
let __autosaveTimerId = null;
function scheduleAutosave(delayMs = 1500) {
    try {
        if (__autosaveTimerId) clearTimeout(__autosaveTimerId);
        __autosaveTimerId = setTimeout(async () => {
            try {
                await saveCurrentMatch();
            } catch (e) {
                console.warn('Autosave fallito:', e);
            }
        }, delayMs);
    } catch (e) {
        console.warn('scheduleAutosave errore:', e);
    }
}

// Salva la sessione corrente (locale e cloud, se disponibile)
async function saveCurrentMatch() {
    try {
        const sessionRaw = localStorage.getItem('currentScoutingSession');
        if (!sessionRaw) return;
        let sessionData = {};
        try { sessionData = JSON.parse(sessionRaw); } catch(_) {}

        const currentTeam = window.teamsModule?.getCurrentTeam?.();
        const selectedTeamId = localStorage.getItem('selectedTeamId') || sessionData.teamId;
        const actions = (window.appState && Array.isArray(window.appState.actionsLog)) ? window.appState.actionsLog : [];
        const scoreHistory = (window.appState && Array.isArray(window.appState.scoreHistory)) ? window.appState.scoreHistory : [];

        // Aggiorna actionsBySet con le azioni del set corrente
        try {
            const currentSetNum = (window.appState && window.appState.currentSet) ? window.appState.currentSet : 1;
            // Azioni per set
            sessionData.actionsBySet = sessionData.actionsBySet || {};
            sessionData.actionsBySet[currentSetNum] = actions;
            // Storico punteggio per set
            sessionData.scoreHistoryBySet = sessionData.scoreHistoryBySet || {};
            sessionData.scoreHistoryBySet[currentSetNum] = scoreHistory;
            // Stato sintetico del set (punteggio, fase, rotazione)
            sessionData.setStateBySet = sessionData.setStateBySet || {};
            sessionData.setStateBySet[currentSetNum] = {
                homeScore: (window.appState && typeof window.appState.homeScore === 'number') ? window.appState.homeScore : 0,
                awayScore: (window.appState && typeof window.appState.awayScore === 'number') ? window.appState.awayScore : 0,
                currentPhase: (window.appState && window.appState.currentPhase) ? window.appState.currentPhase : 'servizio',
                currentRotation: (window.appState && window.appState.currentRotation) ? window.appState.currentRotation : 'P1',
                setStarted: !!(window.appState && window.appState.setStarted)
            };
            // Persisti subito la sessione aggiornata
            localStorage.setItem('currentScoutingSession', JSON.stringify(sessionData));
        } catch (e) { console.warn('Aggiornamento dati per set fallito:', e); }

        const payload = {
            id: sessionData.id || ('match_' + Date.now()),
            teamId: selectedTeamId || null,
            myTeam: currentTeam?.name || null,
            opponentTeam: sessionData.opponent || sessionData.opponentTeam || 'Sconosciuta',
            matchDate: sessionData.matchDate || new Date().toISOString().slice(0,10),
            eventType: sessionData.eventType || 'partita',
            location: sessionData.location || 'casa',
            venue: sessionData.venue || '',
            description: sessionData.description || '',
            setConfig: sessionData.setConfig || {},
            sessionStartTime: sessionData.startTime || null,
            scoutingEndTime: new Date().toISOString(),
            status: 'in_progress',
            score: {
                home: (window.appState && typeof window.appState.homeScore === 'number') ? window.appState.homeScore : 0,
                away: (window.appState && typeof window.appState.awayScore === 'number') ? window.appState.awayScore : 0
            },
            scoreHistory,
            actions,
            actionsBySet: sessionData.actionsBySet || {},
            scoreHistoryBySet: sessionData.scoreHistoryBySet || {},
            setStateBySet: sessionData.setStateBySet || {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Notifica inizio salvataggio
        try { window.dispatchEvent(new CustomEvent('save:started')); } catch(_) {}

        // Salvataggio locale
        try {
            const local = JSON.parse(localStorage.getItem('volleyMatches') || '[]');
            const idx = local.findIndex(m => m.id === payload.id);
            if (idx >= 0) local[idx] = payload; else local.unshift(payload);
            localStorage.setItem('volleyMatches', JSON.stringify(local));
        } catch (e) { console.warn('Salvataggio locale non riuscito:', e); }

        // Salvataggio su Firestore (se disponibile)
        try {
            if (window.authFunctions?.getCurrentUser && window.firestoreFunctions?.saveMatch) {
                const user = window.authFunctions.getCurrentUser();
                if (user) {
                    await window.firestoreFunctions.saveMatch(payload);
                }
            }
        } catch (e) { console.warn('Salvataggio su Firestore non riuscito:', e); }

        // Notifica completamento salvataggio
        try { window.dispatchEvent(new CustomEvent('save:completed', { detail: { ok: true } })); } catch(_) {}
    } catch (error) {
        console.warn('saveCurrentMatch errore:', error);
        try { window.dispatchEvent(new CustomEvent('save:completed', { detail: { ok: false, error } })); } catch(_) {}
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
    
    // Event listeners per valutazioni
    const evalButtons = document.querySelectorAll('.eval-btn');
    evalButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Blocca durante timer di auto-chiusura
            if (appState.autoClosePending) return;
            const evaluation = parseInt(e.currentTarget.dataset.eval || e.currentTarget.textContent.trim()[0]);
            // Seleziona/aggiorna la valutazione: l'ultima pressione vince
            selectEvaluation(evaluation);
            // Non sottomettere immediatamente: la chiusura avviene alla prossima pressione di un player
            // Se un giocatore è già selezionato, resta in attesa di conferma implicita (nuovo click player)
            updateDescriptiveQuartet();
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
    
    const validPlayers = appState.currentRoster
        .filter(p => p && (p.number || p.name || p.surname))
        .map(p => ({
            number: p.number ?? '',
            name: (p.nickname || `${p.name || ''} ${p.surname || ''}`.trim() || `Giocatore ${p.number}`),
            role: p.role || ''
        }));

    const byRole = {
        Palleggiatore: [],
        Libero: [],
        Schiacciatore: [],
        Centrale: [],
        Opposto: []
    };

    // Distribuisci i giocatori per ruolo e ordina per numero crescente
    validPlayers.forEach(p => {
        if (byRole[p.role] && byRole[p.role].length >= 0) byRole[p.role].push(p);
    });
    Object.keys(byRole).forEach(r => {
        byRole[r].sort((a, b) => {
            const na = parseInt(a.number, 10); const nb = parseInt(b.number, 10);
            if (isNaN(na) && isNaN(nb)) return (a.name || '').localeCompare(b.name || '');
            if (isNaN(na)) return 1; if (isNaN(nb)) return -1; return na - nb;
        });
    });

    function roleClassFor(role){
        return role === 'Palleggiatore' ? 'role-pal'
             : role === 'Opposto' ? 'role-opp'
             : role === 'Schiacciatore' ? 'role-sch'
             : role === 'Centrale' ? 'role-ctr'
             : role === 'Libero' ? 'role-lib'
             : '';
    }
    function shortRole(role){
        return role ? (role[0] || '').toUpperCase() : '';
    }
    function renderBtn(p){
        const rc = roleClassFor(p.role);
        const sr = shortRole(p.role);
        const num = String(p.number || '').trim();
        const nm = String(p.name || '').trim();
        return `
            <button class="player-btn ${rc}" data-role="${p.role}" data-number="${num}" data-name="${nm}">
                <div class="player-line1">
                    <span class="player-name">${nm}</span>
                </div>
                <div class="player-line2">
                    <span class="player-number">${num}</span>
                </div>
            </button>
        `;
    }
    function renderEmpty(){
        return `
            <button class="player-btn empty" disabled aria-disabled="true">
                <div class="player-line1"><span class="player-number">&nbsp;</span></div>
                <div class="player-line2"><span class="player-name">&nbsp;</span></div>
            </button>
        `;
    }

    // Layout richiesto: 4 tasti per riga
    const row1 = [];
    row1.push(...byRole.Palleggiatore.slice(0,2));
    row1.push(...byRole.Libero.slice(0,2));
    while (row1.length < 4) row1.push(null);

    const row2 = byRole.Schiacciatore.slice(0,4);
    while (row2.length < 4) row2.push(null);
    const row3 = byRole.Centrale.slice(0,4);
    while (row3.length < 4) row3.push(null);
    // Quarta riga: Ordine specifico richiesto
    // Col1: Errore Avvers. | Col2: secondo Opposto (se presente) | Col3: primo Opposto | Col4: MURO
    const row4 = [];
    const opps = byRole.Opposto.slice(0,2);
    const firstOpp = opps[0] || null;
    const secondOpp = opps[1] || null;
    row4.push({ __type: 'opponent-error' });
    row4.push(secondOpp);
    row4.push(firstOpp);
    row4.push({ __type: 'muro-override' });
    while (row4.length < 4) row4.push(null);

    // Rende tutte le righe (4x4 = 16 tasti)
    const ordered = [row1, row2, row3, row4].flat();
    container.innerHTML = ordered.map(p => {
        if (!p) return renderEmpty();
        if (p.__type === 'cancel-button') {
            return `
                <button class="player-btn cancel-replace-btn" type="button" title="ANNULLA">
                    <div class="player-line1" aria-hidden="true" style="display:none;"><span class="player-number">&nbsp;</span></div>
                    <div class="player-line2"><span class="player-name">ANNULLA</span></div>
                </button>
            `;
        }
        if (p.__type === 'opponent-error') {
            return `
                <button class="player-btn opponent-error-btn" type="button" title="Errore Avversari">
                    <div class="player-line1"><span class="player-name">ERRORE</span></div>
                    <div class="player-line2"><span class="player-name">AVVERS.</span></div>
                </button>
            `;
        }
        if (p.__type === 'muro-override') {
            return `
                <button class="player-btn muro-override-btn" type="button" title="Muro">
                    <div class="player-line1" aria-hidden="true" style="display:none;"><span class="player-number">&nbsp;</span></div>
                    <div class="player-line2"><span class="player-name">MURO</span></div>
                </button>
            `;
        }
        return renderBtn(p);
    }).join('');
    
    // Aggiungi event listeners
    container.querySelectorAll('.player-btn').forEach(btn => {
        // Escludi tasti speciali (ANNULLA) dal selettore giocatore
        if (btn.classList.contains('cancel-replace-btn')) return; // annulla sostituzione
        btn.addEventListener('click', (e) => {
            const number = e.currentTarget.dataset.number;
            const name = e.currentTarget.dataset.name;
            // Passo anche il riferimento al bottone per evidenziare la selezione
            selectPlayer(number, name, e.currentTarget);
        });
    });

    // Listener per pulsanti speciali
    // Errore Avversario
    container.querySelectorAll('.opponent-error-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            submitOpponentError();
        });
    });
    // MURO override
    container.querySelectorAll('.muro-override-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            activateMuroOverride();
        });
    });

}

function selectPlayer(number, name, btnEl) {
    // Se siamo in modalità sostituzione, aggiorna solo il giocatore corrente
    // senza chiudere l'azione e senza alterare la valutazione selezionata
    if (appState.replacePlayerMode) {
        const target = appState.replaceTarget || { kind: 'current', index: null };
        if (target.kind === 'sequence' && Number.isInteger(target.index) && appState.currentSequence[target.index]) {
            // Sostituisci il player nella riga della sequenza selezionata
            const item = appState.currentSequence[target.index];
            const q = String(item.quartet || '');
            const f = q.charAt(2);
            const e = q.charAt(3);
            const nn = String(number).padStart(2, '0');
            item.quartet = `${nn}${f}${e}`;
            item.playerName = name;

            appState.replacePlayerMode = false;
            appState.replaceTarget = null;
            appState.justClosedAction = false;

            updateActionSummary();
            updateDescriptiveQuartet();
            updatePlayersGrid();
            showScoutingStep('step-action');
            return;
        } else {
            // Sostituzione della riga corrente (player selezionato)
            appState.selectedPlayer = { number, name };
            appState.replacePlayerMode = false;
            appState.replaceTarget = null;
            appState.justClosedAction = false;

            // Evidenzia visivamente il nuovo giocatore
            const playerButtons = document.querySelectorAll('.player-btn');
            playerButtons.forEach(b => b.classList.remove('selected'));
            if (btnEl) btnEl.classList.add('selected');

            // Mantieni (o ricalcola) il fondamentale corrente
            appState.calculatedFundamental = appState.overrideFundamental || predictNextFundamental();

            // Aggiorna UI minima
            updateEvaluationButtonTexts();
            updateNextFundamental();
            updateDescriptiveQuartet();
            updatePlayersGrid(); // ripristina MURO al posto di ANNULLA

            showScoutingStep('step-action');
            return;
        }
    }
    // Se durante il countdown di auto-chiusura viene premuto un player,
    // interrompi il timer e torna al flusso normale (chiusura su click player)
    if (appState.autoClosePending) {
        try {
            if (appState.autoCloseTimerId) {
                clearTimeout(appState.autoCloseTimerId);
                appState.autoCloseTimerId = null;
            }
        } catch (_) {}
        appState.autoClosePending = false;
        appState.autoClosePayload = null;
        // Stoppa anche l'animazione di countdown sui bottoni valutazione
        try {
            document.querySelectorAll('.eval-btn').forEach(btn => {
                btn.classList.remove('timer-pending');
                btn.style.removeProperty('--pulse-duration');
            });
        } catch(_) {}
    }

    // Se esiste già una selezione (player + valutazione), chiudi l'azione precedente
    const prevPlayer = appState.selectedPlayer;
    const hadEvaluation = appState.selectedEvaluation != null;
    if (prevPlayer && hadEvaluation && !appState.autoClosePending) {
        try {
            const fundamental = appState.calculatedFundamental || predictNextFundamental();
            const evaluation = appState.selectedEvaluation;
            const quartet = `${String(prevPlayer.number).padStart(2, '0')}${fundamental}${evaluation}`;
            appState.currentSequence.push({ quartet, playerName: prevPlayer.name });

            updateActionSummary();

            const tempResult = determineFinalResult(fundamental, evaluation);
            const isPoint = tempResult === 'home_point' || tempResult === 'away_point';
            if (isPoint) {
                const actionString = appState.currentSequence.map(s => s.quartet).join(' ');
                const result = parseAction(actionString);
                result.playerName = prevPlayer.name;
                result.actionType = evaluation === 5 ? 'Punto' : 'Errore';
                processActionResult(result);

                appState.actionsLog.push({
                    action: actionString,
                    result: result,
                    score: `${appState.homeScore}-${appState.awayScore}`,
                    guided: true
                });

                appState.currentSequence = [];
                updateActionSummary();
            }
        } catch (error) {
            alert(`Errore nell'azione: ${error.message}`);
        }

        // Dopo la chiusura, azzera la valutazione selezionata
        appState.selectedEvaluation = null;
        // Rimuovi evidenza dai bottoni valutazione
        const evaluationButtons = document.querySelectorAll('.eval-btn');
        evaluationButtons.forEach(btn => btn.classList.remove('selected'));
        // Segna chiusura azione per svuotare le pillole e aggiorna descrittivo/fondamentale
        appState.justClosedAction = true;
        updateDescriptiveQuartet();
        updateNextFundamental();
    }

    // Imposta il nuovo giocatore selezionato
    appState.selectedPlayer = { number, name };
    // Nuova selezione: non siamo più in stato appena chiuso
    appState.justClosedAction = false;

    // Evidenzia visualmente il giocatore selezionato, sovrascrivendo selezioni precedenti
    const playerButtons = document.querySelectorAll('.player-btn');
    playerButtons.forEach(b => b.classList.remove('selected'));
    if (btnEl) btnEl.classList.add('selected');

    // Mantieni l'override (es. MURO) se presente; altrimenti calcola il fondamentale
    appState.calculatedFundamental = appState.overrideFundamental || predictNextFundamental();

    // Aggiorna i testi dei pulsanti di valutazione quando viene selezionato un giocatore
    updateEvaluationButtonTexts();

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

    // Aggiorna le informazioni del giocatore selezionato nella sezione fondamentale
    const selectedPlayerText = document.getElementById('selected-player-text');
    if (selectedPlayerText) {
        selectedPlayerText.textContent = `${number} - ${name}`;
    }

    // Non azzerare la valutazione al cambio giocatore: verrà chiusa alla prossima azione se presente

    // Aggiorna UI
    updateNextFundamental();

    const summaryBox = document.getElementById('action-summary-box');
    if (summaryBox) {
        summaryBox.style.display = 'block';
    }

    updateActionSummary();

    // Aggiorna il campo descrittivo dinamico
    updateDescriptiveQuartet();
    
    showScoutingStep('step-action');
}

// Funzione per aggiornare i testi dei pulsanti di valutazione in base al fondamentale
function updateEvaluationButtonTexts() {
    // Mappatura fissa con simboli
    const mapping = {
        1: '=',
        2: '-',
        3: '/',
        4: '+',
        5: '#'
    };
    for (let i = 1; i <= 5; i++) {
        const btn = document.querySelector(`.eval-btn[data-eval="${i}"]`);
        if (btn) btn.textContent = mapping[i];
    }
}

function selectEvaluation(evaluation) {
    // Se è in corso un timer di auto-chiusura, consenti cambio valutazione:
    // - Se la nuova valutazione NON chiude l'azione, interrompi il timer
    // - Se la nuova valutazione chiude l'azione, riavvia il timer con il nuovo payload
    try {
        if (appState.autoClosePending) {
            const f = appState.calculatedFundamental || predictNextFundamental();
            const resType = determineFinalResult(f, evaluation);
            const closes = resType === 'home_point' || resType === 'away_point';
            // Ferma il timer corrente
            if (appState.autoCloseTimerId) {
                clearTimeout(appState.autoCloseTimerId);
                appState.autoCloseTimerId = null;
            }
            if (!closes) {
                // Non più terminale: annulla la chiusura automatica
                appState.autoClosePending = false;
                appState.autoClosePayload = null;
                // Rimuovi evidenza timer dai pulsanti
                document.querySelectorAll('.eval-btn').forEach(btn => {
                    btn.classList.remove('timer-pending');
                    btn.style.removeProperty('--pulse-duration');
                });
            } else {
                // Terminale: riavvia con il nuovo evaluation
                appState.autoClosePending = true;
                appState.autoClosePayload = {
                    player: appState.selectedPlayer,
                    evaluation,
                    fundamental: f
                };
                appState.autoCloseTimerId = setTimeout(() => {
                    performAutoCloseAfterTimeout();
                }, 3000);
                // Aggiorna evidenza timer sul pulsante corrispondente
                document.querySelectorAll('.eval-btn').forEach(btn => {
                    btn.classList.remove('timer-pending');
                    btn.style.removeProperty('--pulse-duration');
                });
                const pendingBtn = document.querySelector(`.eval-btn[data-eval="${evaluation}"]`);
                if (pendingBtn) {
                    pendingBtn.classList.add('timer-pending');
                    pendingBtn.style.setProperty('--pulse-duration', '1s');
                }
            }
        }
    } catch (_) {}

    // Inizia nuova selezione valutazione: riattiva pillole
    appState.justClosedAction = false;
    appState.selectedEvaluation = evaluation;
    // Persisti una preview del prossimo fondamentale determinato dalla valutazione
    try {
        appState.nextFundamentalPreview = predictNextFundamental();
    } catch (_) {
        appState.nextFundamentalPreview = null;
    }
    
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

    // Aggiorna le informazioni della valutazione selezionata nella sezione fondamentale
    const selectedEvaluationText = document.getElementById('selected-evaluation-text');
    if (selectedEvaluationText) {
        const evalNames = {
            1: '1 - Errore',
            2: '2 - Negativo', 
            3: '3 - Neutro',
            4: '4 - Positivo',
            5: '5 - Punto'
        };
        selectedEvaluationText.textContent = `${evalNames[evaluation] || evaluation}`;
    }

    // Aggiorna live fase e fondamentale previsto in base alla valutazione corrente
    try {
        const currentFundamental = appState.calculatedFundamental || appState.overrideFundamental || predictNextFundamental();
        // Aggiorna la fase di gioco in modo reattivo (senza chiusura dell'azione)
        updateGamePhase(currentFundamental, evaluation);
        // Aggiorna subito il banner e l'etichetta "Elenco player per" con il fondamentale previsto successivo
        updateNextFundamental();
    } catch (err) {
        console.warn('Aggiornamento live fondamentale/phase fallito:', err);
    }

    // Se la valutazione decreta la fine dell'azione, avvia timer 3s e blocca ulteriori pressioni
    maybeStartAutoCloseTimer(evaluation);
}

// Avvia timer di auto-chiusura per valutazioni terminali (esito punto)
function maybeStartAutoCloseTimer(evaluation) {
    try {
        if (!appState.selectedPlayer) return; // serve il giocatore per chiudere l'azione
        const fundamental = appState.calculatedFundamental || predictNextFundamental();
        const resultType = determineFinalResult(fundamental, evaluation);
        const isPoint = resultType === 'home_point' || resultType === 'away_point';
        if (!isPoint) return;

        // Imposta payload per chiusura automatica
        appState.autoClosePending = true;
        appState.autoClosePayload = {
            player: appState.selectedPlayer,
            evaluation,
            fundamental
        };

        // Avvia timer 3 secondi
        if (appState.autoCloseTimerId) clearTimeout(appState.autoCloseTimerId);
        appState.autoCloseTimerId = setTimeout(() => {
            performAutoCloseAfterTimeout();
        }, 3000);

        // Evidenzia il pulsante selezionato come "timer in corso"
        document.querySelectorAll('.eval-btn').forEach(btn => {
            btn.classList.remove('timer-pending');
            btn.style.removeProperty('--pulse-duration');
        });
        const pendingBtn = document.querySelector(`.eval-btn[data-eval="${evaluation}"]`);
        if (pendingBtn) {
            pendingBtn.classList.add('timer-pending');
            // 1 pulsazione per secondo, sincronizzata al countdown 3s
            pendingBtn.style.setProperty('--pulse-duration', '1s');
        }
    } catch (err) {
        console.warn('Errore avvio auto-chiusura:', err);
    }
}

// Esegue la chiusura azione al termine del timer e avanza al fondamentale successivo
function performAutoCloseAfterTimeout() {
    const payload = appState.autoClosePayload;
    // Ripristina interazioni
    document.querySelectorAll('.eval-btn').forEach(btn => {
        btn.disabled = false;
        // Rimuovi evidenza timer e durata specifica
        btn.classList.remove('timer-pending');
        btn.style.removeProperty('--pulse-duration');
    });
    document.querySelectorAll('.player-btn').forEach(btn => btn.disabled = false);
    // Rimuovi evidenza timer
    document.querySelectorAll('.eval-btn').forEach(btn => btn.classList.remove('timer-pending'));
    appState.autoClosePending = false;
    appState.autoClosePayload = null;
    if (appState.autoCloseTimerId) {
        clearTimeout(appState.autoCloseTimerId);
        appState.autoCloseTimerId = null;
    }

    if (!payload) return;

    // Esegui chiusura utilizzando l'API esistente
    const prevSelectedPlayer = appState.selectedPlayer;
    const prevSelectedEvaluation = appState.selectedEvaluation;
    const prevCalculatedFundamental = appState.calculatedFundamental;

    appState.selectedPlayer = payload.player;
    appState.selectedEvaluation = payload.evaluation;
    appState.calculatedFundamental = payload.fundamental;

    // Usa il flusso di sottomissione guidata per coerenza UI/logiche
    submitGuidedAction();

    // Non ripristinare selezioni precedenti: dopo la chiusura si torna alla selezione giocatore
    try {
        updateNextFundamental();
    } catch(_) {}
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
            
            // Aggiungi informazioni del giocatore al risultato
            result.playerName = appState.selectedPlayer.name;
            result.actionType = appState.selectedEvaluation === 5 ? 'Punto' : 'Errore';
            
            processActionResult(result);
            
            appState.actionsLog.push({
                action: actionString,
                result: result,
                score: `${appState.homeScore}-${appState.awayScore}`,
                guided: true
            });
            
            appState.currentSequence = [];
            updateActionSummary();
            
            // Pulisci le informazioni di giocatore e valutazione quando viene assegnato un punto
            const selectedPlayerText = document.getElementById('selected-player-text');
            const selectedEvaluationText = document.getElementById('selected-evaluation-text');
            if (selectedPlayerText) {
                selectedPlayerText.textContent = '-';
            }
            if (selectedEvaluationText) {
                selectedEvaluationText.textContent = '-';
            }
            // Segna chiusura azione e svuota le pillole
            appState.justClosedAction = true;
            // Reset della preview del prossimo fondamentale dopo la chiusura
            appState.nextFundamentalPreview = null;
            updateDescriptiveQuartet();
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
    // L'override (es. MURO) vale solo per la quartina appena chiusa
    appState.overrideFundamental = null;
    appState.calculatedFundamental = null;

    if (isPoint) checkSetEnd();
}

function submitOpponentError() {
    // Se non c'è ancora una quartina registrata e NON c'è selezione,
    // consenti comunque l'errore avversario: verrà registrato come "avv".
    // Se invece c'è già selezione (giocatore+valutazione), chiudi quella quartina
    // prima di aggiungere l'"avv" come esito immediato.
    if (!appState.currentSequence || appState.currentSequence.length === 0) {
        if (appState.selectedPlayer && appState.selectedEvaluation) {
            const fundamental = appState.calculatedFundamental || predictNextFundamental();
            const quartet = `${appState.selectedPlayer.number.padStart(2, '0')}${fundamental}${appState.selectedEvaluation}`;
            appState.currentSequence.push({quartet, playerName: appState.selectedPlayer.name});
            updateActionSummary();
        }
        // Nessun vincolo: se non c'è selezione, prosegui comunque
    }

    // Se è attivo il countdown di auto-chiusura (es. dopo "5 - Punto"),
    // prima chiudi immediatamente l'azione pendente (usando il payload salvato),
    // poi registra "Errore Avversario" come azione successiva.
    if (appState.autoClosePending && appState.autoClosePayload) {
        try {
            if (appState.autoCloseTimerId) {
                clearTimeout(appState.autoCloseTimerId);
                appState.autoCloseTimerId = null;
            }
        } catch (_) {}
        // Chiudi immediatamente l'azione pendente
        try { performAutoCloseAfterTimeout(); } catch (_) {}
    }
    // Costruisci la stringa d'azione: se esiste una sequenza corrente,
    // aggiungi "avv" come quartina speciale nella stessa azione; altrimenti usa solo "avv".
    const baseString = appState.currentSequence.map(s => s.quartet).join(' ');
    const actionString = baseString ? `${baseString} avv` : 'avv';
    // Imposta flag per mostrare il descrittivo "– Err Avv"
    appState.opponentErrorPressed = true;
    updateDescriptiveQuartet();

    // Aggiorna le informazioni della valutazione nella sezione fondamentale
    const selectedEvaluationText = document.getElementById('selected-evaluation-text');
    if (selectedEvaluationText) {
        selectedEvaluationText.textContent = 'Errore avversario';
    }

    try {
        const result = parseAction(actionString);

        // Aggiungi informazioni per l'errore avversario
        result.playerName = 'Avversario';
        result.actionType = 'Errore';

        processActionResult(result);

        appState.actionsLog.push({
            action: actionString,
            result: result,
            score: `${appState.homeScore}-${appState.awayScore}`,
            guided: true
        });

        // L'azione è conclusa: svuota la sequenza corrente e aggiorna il riepilogo
        appState.currentSequence = [];
        updateActionSummary();

        // Pulisci descrittivo e flag
        appState.selectedPlayer = null;
        appState.selectedEvaluation = null;
        appState.calculatedFundamental = null;
        appState.opponentErrorPressed = false;
        // Segna chiusura azione ed azzera pillole
        appState.justClosedAction = true;
        // Reset della preview del prossimo fondamentale dopo la chiusura
        appState.nextFundamentalPreview = null;
        updateDescriptiveQuartet();

        // Reset delle informazioni nella sezione fondamentale
        const selectedPlayerText = document.getElementById('selected-player-text');
        const selectedEvaluationTextReset = document.getElementById('selected-evaluation-text');
        if (selectedPlayerText) selectedPlayerText.textContent = '-';
        if (selectedEvaluationTextReset) selectedEvaluationTextReset.textContent = '-';

        // Aggiorna UI e stato match
        updateScoutingUI();
        updateActionsLog();
        updateNextFundamental();
        showScoutingStep('step-player');
        checkSetEnd();

    } catch (error) {
        alert(`Errore: ${error.message}`);
        // In caso di errore, azzera il flag per non lasciare il descrittivo attivo
        appState.opponentErrorPressed = false;
        updateDescriptiveQuartet();
    }
}

function updateGamePhase(fundamental, evaluation) {
    const evalValue = parseInt(evaluation);

    // Logica per cambiare la fase di gioco basata sul risultato dell'azione
    if (fundamental === 'b') { // Servizio
        if (evalValue === 1) {
            // Errore al servizio = punto avversario, passiamo in ricezione
            appState.currentPhase = 'ricezione';
        } else if (evalValue === 5) {
            // Ace = punto nostro, rimaniamo al servizio
            appState.currentPhase = 'servizio';
        }
        // Per valutazioni 2,3,4 la fase rimane invariata fino al prossimo punto
    } else if (fundamental === 'r') { // Ricezione
        if (evalValue === 1) {
            // Errore in ricezione = punto avversario, passiamo al servizio
            appState.currentPhase = 'servizio';
        }
        // Per altre valutazioni continuiamo nella stessa fase
    } else if (fundamental === 'a') { // Attacco
        if (evalValue === 1) {
            // Errore in attacco = punto avversario
            if (appState.currentPhase === 'servizio') {
                appState.currentPhase = 'ricezione';
            } else {
                appState.currentPhase = 'servizio';
            }
        } else if (evalValue === 5) {
            // Punto in attacco = nostro punto
            if (appState.currentPhase === 'ricezione') {
                appState.currentPhase = 'servizio';
            } else {
                appState.currentPhase = 'ricezione';
            }
        }
    } else if (fundamental === 'd') { // Difesa
        if (evalValue === 1) {
            // Errore in difesa = punto avversario
            appState.currentPhase = 'ricezione';
        }
    } else if (fundamental === 'm') { // Muro
        // m1 = punto avversario → prossima ripresa in ricezione
        // m5 = punto nostro → prossima ripresa in servizio
        if (evalValue === 1) {
            appState.currentPhase = 'ricezione';
        } else if (evalValue === 5) {
            appState.currentPhase = 'servizio';
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

    // Pianifica autosave dopo aggiornamento log
    try { scheduleAutosave(1500); } catch(_) {}
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
    // 1) Se esiste una valutazione in corso, prevedi il prossimo fondamentale LIVE
    try {
        const pendingEval = appState.selectedEvaluation;
        const pendingFund = appState.calculatedFundamental;
        if (pendingFund && pendingEval) {
            const e = parseInt(pendingEval, 10);
            const f = String(pendingFund);
            // Usa la stessa logica del risultato finale per decidere il prossimo fondamentale
            const res = determineFinalResult(f, e);
            if (res === 'home_point') {
                return 'b'; // nostro punto → prossimo è servizio
            }
            if (res === 'away_point') {
                return 'r'; // punto avversario → prossimo è ricezione
            }
            // Azione che continua: regole transitorie
            if (f === 'm') {
                // MURO: dopo valutazioni 2/3/4 si passa a DIFESA; 1 → RICEZIONE; 5 → SERVIZIO
                if (e === 1) return 'r';
                if (e === 5) return 'b';
                if (e === 2 || e === 3 || e === 4) return 'd';
            }
            if (f === 'r') {
                if (e === 2) return 'd';
                if (e === 3 || e === 4 || e === 5) return 'a';
            } else if (f === 'd') {
                if (e === 2) return 'd';
                if (e === 3 || e === 4 || e === 5) return 'a';
            } else if (f === 'a' || f === 'b') {
                if (e !== 1 && e !== 5) return 'd';
            }
        }
        // Caso speciale: tasto Err Avv mostrato live
        if (appState.opponentErrorPressed) {
            return 'b';
        }
    } catch(_) {}

    // 2) Altrimenti usa lo storico delle azioni concluse
    const currentActionLogs = getCurrentActionLogs();
    if (currentActionLogs.length > 0) {
        const lastLog = currentActionLogs[currentActionLogs.length - 1];
        const act = lastLog.action || '';
        
        // Regola speciale: se l'azione termina con A5, B5, M5 o Avv, il prossimo fondamentale è Servizio (b)
        if (act.includes('avv') || act.endsWith('a5') || act.endsWith('b5') || act.endsWith('m5')) {
            return 'b';
        }
        
        // Estrai il quartetto finale dall'azione (es: "02b3 09m1" → usa "09m1")
        const parts = act.trim().split(/\s+/);
        const lastQuartet = parts.length ? parts[parts.length - 1] : '';
        const lastFund = lastQuartet.charAt(2);
        const lastEval = parseInt(lastQuartet.charAt(3), 10);
        // Combinazione specifica richiesta: Muro + 1 → Ricezione
        if (lastFund === 'm') {
            if (lastEval === 1) return 'r';
            if (lastEval === 5) return 'b';
            if (lastEval === 2 || lastEval === 3 || lastEval === 4) return 'd';
        }
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
    if (appState.currentPhase === 'servizio') return 'b';
    if (appState.currentPhase === 'ricezione') return 'r';
    return 'a';
}

function updateNextFundamental() {
    // Se l'azione è appena stata chiusa (es. allo scadere del timer),
    // ignora override/preview e mostra direttamente il fondamentale previsto successivo
    const fundamental = appState.justClosedAction
        ? predictNextFundamental()
        : (appState.nextFundamentalPreview || appState.overrideFundamental || appState.calculatedFundamental || predictNextFundamental());
    const namesWithCode = { b: 'Servizio (b)', r: 'Ricezione (r)', a: 'Attacco (a)', d: 'Difesa (d)', m: 'Muro (m)' };
    const namesPlain = { b: 'Servizio', r: 'Ricezione', a: 'Attacco', d: 'Difesa', m: 'Muro' };
    const el = document.getElementById('next-fundamental');
    if (el) {
        const rotationRaw = (window.appState?.currentRotation) ? String(window.appState.currentRotation) : '';
        const rotationNorm = rotationRaw
            ? rotationRaw.toUpperCase().startsWith('P')
                ? rotationRaw.toUpperCase()
                : `P${rotationRaw}`.toUpperCase()
            : '';
        // Header dinamico: "SET X AZIONE IN P#:" (oppure "SET X AZIONE:")
        const setNum = (window.appState?.currentSet) ? window.appState.currentSet : 1;
        const prefix = `SET ${setNum} `;
        el.textContent = rotationNorm ? `${prefix}AZIONE IN ${rotationNorm}:` : `${prefix}AZIONE:`;
    }
    const cur = document.getElementById('current-fundamental');
    if (cur) {
        const name = namesPlain[fundamental] || 'Sconosciuto';
        // Mostra solo il fondamentale per esteso (maiuscolo) accanto a "Elenco player:"
        cur.textContent = `${name.toUpperCase()}`;
    }
    
    // Aggiorna i testi dei pulsanti di valutazione quando cambia il fondamentale
    updateEvaluationButtonTexts();
    // Aggiorna il campo "SELEZIONATO:" con il nuovo fondamentale/rotazione
    updateDescriptiveQuartet();
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
        const cfg = sessionData.setConfig || {};
        // Preferisci il numero di set presente nello stato se disponibile
        // altrimenti usa quello configurato in sessione o 1
        setNumber = (typeof appState.currentSet === 'number' && appState.currentSet > 0)
            ? appState.currentSet
            : (cfg.set || 1);
        // Preferisci meta per set se presente
        const sm = sessionData.setMeta && sessionData.setMeta[setNumber];
        const __rotCfg2 = cfg.ourRotation;
        const hasMetaForSet = !!(sm && sm.ourRotation && sm.phase);
        const hasGlobalCfgValid = !!(__rotCfg2 && cfg.phase);

        // Se non abbiamo configurazione valida, apri il dialog di setup set e interrompi
        if (!hasMetaForSet && (!hasGlobalCfgValid || setNumber !== 1)) {
            if (typeof window.openSetMetaDialog === 'function') {
                try { window.openSetMetaDialog(setNumber); } catch(_) {}
            }
            // Aggiorna il display set corrente se presente, ma non proseguire
            return;
        }

        rotation = hasMetaForSet
            ? sm.ourRotation
            : ((__rotCfg2 && String(__rotCfg2).startsWith('P')) ? __rotCfg2 : (__rotCfg2 ? `P${__rotCfg2}` : 'P1'));
        phase = hasMetaForSet ? sm.phase : (cfg.phase || 'servizio');
        // Opponent rotation opzionale (usata nel testo descrittivo iniziale)
        var opponentRotation = hasMetaForSet
            ? (sm.opponentRotation || null)
            : (cfg.opponentRotation || null);
    }
    
    appState.currentSet = setNumber;
    appState.currentRotation = rotation;
    appState.currentPhase = phase;
    // Reidrata dati del set se esistono in sessione
    let restored = false;
    try {
        const sessionData = JSON.parse(localStorage.getItem('currentScoutingSession') || '{}');
        const shBySet = sessionData.scoreHistoryBySet || {};
        const abSet = sessionData.actionsBySet || {};
        const stBySet = sessionData.setStateBySet || {};
        if (Array.isArray(shBySet[setNumber]) || Array.isArray(abSet[setNumber]) || stBySet[setNumber]) {
            appState.actionsLog = abSet[setNumber] || [];
            appState.scoreHistory = shBySet[setNumber] || [];
            const st = stBySet[setNumber] || {};
            if (Array.isArray(appState.scoreHistory) && appState.scoreHistory.length > 0) {
                const last = appState.scoreHistory[appState.scoreHistory.length - 1];
                appState.homeScore = (typeof st.homeScore === 'number') ? st.homeScore : (last?.homeScore ?? 0);
                appState.awayScore = (typeof st.awayScore === 'number') ? st.awayScore : (last?.awayScore ?? 0);
            } else {
                appState.homeScore = (typeof st.homeScore === 'number') ? st.homeScore : 0;
                appState.awayScore = (typeof st.awayScore === 'number') ? st.awayScore : 0;
            }
            if (st.currentPhase) appState.currentPhase = st.currentPhase;
            if (st.currentRotation) appState.currentRotation = st.currentRotation;
            appState.setStarted = true;
            restored = true;
        }
    } catch(_) {}

    if (!restored) {
        appState.homeScore = 0;
        appState.awayScore = 0;
        appState.actionsLog = [];
        appState.setStarted = true;
        // Inizializza lo storico punteggio con l'entry iniziale
        const phaseLabel = (phase === 'ricezione') ? 'Ricezione' : 'Servizio';
        const oppRotLabel = (typeof opponentRotation === 'string' && opponentRotation)
            ? (String(opponentRotation).startsWith('P') ? opponentRotation : `P${opponentRotation}`)
            : null;
        const descr = oppRotLabel
            ? `Set ${setNumber} - ${phaseLabel} ${rotation} Vs ${oppRotLabel}`
            : `Set ${setNumber} - ${phaseLabel} ${rotation}`;
        appState.scoreHistory = [{
            homeScore: 0,
            awayScore: 0,
            description: descr,
            type: 'initial'
        }];
    }
    appState.selectedPlayer = null;
    appState.selectedEvaluation = null;
    
    // Reset del descrittivo
    
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
    updateScoreHistoryDisplay(); // Aggiorna anche lo storico punteggio
    // Persisti subito l'inizializzazione del nuovo set
    scheduleAutosave(250);
    
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

function abbreviateWithDots(name, maxLen = 16) {
    const n = String(name || '').trim();
    if (!n) return '-';
    if (n.length <= maxLen) return n;
    return n.slice(0, Math.max(0, maxLen - 3)) + '...';
}

function updateScoutingUI() {
    // Aggiorna punteggi esistenti
    const homeScoreEl = document.querySelector('.home-score');
    if (homeScoreEl) homeScoreEl.textContent = appState.homeScore;
    
    const awayScoreEl = document.querySelector('.away-score');
    if (awayScoreEl) awayScoreEl.textContent = appState.awayScore;
    
    // Aggiorna nuovi elementi punteggio
    const scoreHomeEl = document.getElementById('score-home');
    if (scoreHomeEl) scoreHomeEl.textContent = appState.homeScore;
    
    const scoreAwayEl = document.getElementById('score-away');
    if (scoreAwayEl) scoreAwayEl.textContent = appState.awayScore;

    // Aggiorna nomi squadre nella testata punteggio (mia squadra + avversaria)
    const myTeamName = appState?.currentMatch?.myTeam || appState?.currentMatch?.homeTeam || '';
    // Mostra solo il nome della società per la mia squadra (rimuove eventuale "Nome Squadra - Nome Società")
    const partsMy = String(myTeamName).split(' - ');
    const myClubOnly = partsMy.length >= 2 ? partsMy.slice(1).join(' - ') : myTeamName;
    const opponentName = appState?.currentMatch?.opponentTeam || appState?.currentMatch?.awayTeam || '';
    const scoreTeamMyEl = document.getElementById('score-team-my');
    if (scoreTeamMyEl) scoreTeamMyEl.textContent = abbreviateWithDots(myClubOnly || '-', 16);
    const scoreTeamOppEl = document.getElementById('score-team-opponent');
    if (scoreTeamOppEl) scoreTeamOppEl.textContent = abbreviateWithDots(opponentName || '-', 16);
    
    const rotationEl = document.getElementById('current-rotation');
    if (rotationEl) rotationEl.textContent = appState.currentRotation;
    
    const phaseEl = document.getElementById('current-phase');
    if (phaseEl) phaseEl.textContent = appState.currentPhase;
    
    const setEl = document.getElementById('current-set-display');
    if (setEl) setEl.textContent = appState.currentSet;
    
    // Aggiorna sequenza azione corrente
    updateCurrentActionSequence();
}

function updateCurrentActionSequence() {
    const sequenceEl = document.getElementById('current-action-sequence');
    if (!sequenceEl) return;
    
    if (appState.currentSequence && appState.currentSequence.length > 0) {
        // Mostra la sequenza corrente con evidenziazione dell'ultimo elemento
        const sequenceHTML = appState.currentSequence.map((item, index) => {
            const isLast = index === appState.currentSequence.length - 1;
            const className = isLast ? 'sequence-item current' : 'sequence-item';
            return `<span class="${className}">${item.quartet}</span>`;
        }).join('');
        
        sequenceEl.innerHTML = sequenceHTML;
    } else {
        // Mostra placeholder quando non c'è sequenza
        sequenceEl.innerHTML = '<span class="sequence-placeholder">Nessuna azione in corso</span>';
    }
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
        
        // Per le azioni manuali, non abbiamo informazioni specifiche del giocatore
        result.playerName = 'Azione manuale';
        result.actionType = result.result === 'home_point' || result.result === 'away_point' ? 'Punto' : 'Azione';
        
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
        
        // Aggiungi al storico punteggio
        addToScoreHistory('home', result.playerName, result.actionType);
        
        if (appState.currentPhase === 'ricezione') {
            appState.currentPhase = 'servizio';
            rotateTeam();
        }
    } else if (result.result === 'away_point') {
        appState.awayScore++;
        
        // Aggiungi al storico punteggio
        addToScoreHistory('away', result.playerName, result.actionType);
        
        if (appState.currentPhase === 'servizio') {
            appState.currentPhase = 'ricezione';
        } else {
            appState.currentPhase = 'ricezione';
        }
    }
    
    // Aggiorna la visualizzazione dello storico
    updateScoreHistoryDisplay();
}

// Funzione per aggiungere un elemento allo storico punteggio
function addToScoreHistory(team, playerName, actionType) {
    const historyItem = {
        homeScore: appState.homeScore,
        awayScore: appState.awayScore,
        team: team,
        playerName: playerName || 'Sconosciuto',
        actionType: actionType || 'Punto',
        timestamp: new Date().toLocaleTimeString()
    };
    
    appState.scoreHistory.push(historyItem);
}

// Funzione per aggiornare la visualizzazione dello storico punteggio
function updateScoreHistoryDisplay() {
    const historyContainer = document.getElementById('score-history');
    if (!historyContainer) return;
    
    // Pulisci il contenitore
    historyContainer.innerHTML = '';
    
    // Aggiungi gli elementi dello storico in ordine cronologico inverso (più recenti in alto)
    // Creiamo una copia dell'array e la invertiamo per non modificare l'originale
    const reversedHistory = [...appState.scoreHistory].reverse();
    
    reversedHistory.forEach(item => {
        const historyElement = document.createElement('div');
        
        if (item.type === 'initial') {
            historyElement.className = 'score-history-item initial';
            
            const scoreText = document.createElement('span');
            scoreText.className = 'score-text';
            scoreText.textContent = `${item.homeScore} - ${item.awayScore}`;
            
            const description = document.createElement('span');
            description.className = 'score-description';
            description.textContent = item.description;
            
            historyElement.appendChild(scoreText);
            historyElement.appendChild(description);
        } else {
            historyElement.className = `score-history-item ${item.team === 'home' ? 'point-home' : 'point-away'}`;

            const scoreText = document.createElement('span');
            scoreText.className = 'score-text';
            scoreText.textContent = `${item.homeScore} - ${item.awayScore}`;

            const description = document.createElement('span');
            description.className = 'score-description';

            if (item.team === 'home') {
                // Caso speciale: errore avversario premuto dalla sezione Player
                if ((item.actionType === 'Errore') && (String(item.playerName).toLowerCase() === 'avversario')) {
                    description.textContent = 'Errore Avversario';
                } else {
                    description.textContent = `Punto di ${item.playerName}`;
                }
            } else {
                description.textContent = `Errore di ${item.playerName}`;
            }

            historyElement.appendChild(scoreText);
            historyElement.appendChild(description);
        }
        
        historyContainer.appendChild(historyElement);
    });
}

function checkSetEnd() {
    const homeScore = appState.homeScore;
    const awayScore = appState.awayScore;
    
    // Regole standard della pallavolo:
    // - Set vinto a 25 punti con almeno 2 punti di vantaggio
    // - Set al 5° (tie-break) vinto a 15 punti con almeno 2 punti di vantaggio
    const isSetFive = appState.currentSet === 5;
    const winningScore = isSetFive ? 15 : 25;
    const minScore = isSetFive ? 15 : 25;
    
    let setWinner = null;
    
    // Controlla se una squadra ha vinto
    if (homeScore >= minScore && homeScore - awayScore >= 2) {
        setWinner = 'home';
    } else if (awayScore >= minScore && awayScore - homeScore >= 2) {
        setWinner = 'away';
    }
    
    if (setWinner) {
        const winnerName = setWinner === 'home' ? 'La nostra squadra' : 'Squadra avversaria';
        const finalScore = `${homeScore}-${awayScore}`;
        
        // Mostra messaggio di fine set
        setTimeout(() => {
            alert(`🏆 Set ${appState.currentSet} terminato!\n${winnerName} ha vinto ${finalScore}`);
            
            // Chiedi se iniziare il prossimo set
            if (appState.currentSet < 5) {
                const nextSet = confirm(`Vuoi iniziare il Set ${appState.currentSet + 1}?`);
                if (nextSet) {
                    // Persisti lo stato del set appena concluso
                    try { saveCurrentMatch(); } catch(_) {}

                    // Pulisci eventuale timer/animazione pendente
                    try {
                        if (appState.autoClosePending && appState.autoCloseTimerId) {
                            clearTimeout(appState.autoCloseTimerId);
                            appState.autoClosePending = false;
                            appState.autoCloseTimerId = null;
                            appState.autoClosePayload = null;
                        }
                        document.querySelectorAll('.eval-btn.timer-pending').forEach(btn => {
                            btn.classList.remove('timer-pending');
                            btn.style.removeProperty('--pulse-duration');
                        });
                    } catch(_) {}

                    // Incrementa il set e avvia tramite startSet per separare lo storico
                    appState.currentSet++;
                    startSet();
                }
            } else {
                alert('🎉 Partita terminata!');
            }
        }, 100);
    }
}

function rotateTeam() {
    const currentIndex = rotationSequence.indexOf(appState.currentRotation);
    const nextIndex = (currentIndex + 1) % rotationSequence.length;
    appState.currentRotation = rotationSequence[nextIndex];
    // Aggiorna UI coerentemente dopo la rotazione
    updateNextFundamental();
    updateDescriptiveQuartet();
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

    // Se l'azione è appena stata chiusa, svuota le pillole
    if (appState.justClosedAction) {
        el.innerHTML = '';
        if (box) box.style.display = 'none';
        return;
    }

    // Caso speciale: Err Avv richiesto come pillola dedicata
    if (appState.opponentErrorPressed) {
        const htmlErr = `<span class="token token-eval eval-6">Errore avversario</span>`;
        el.innerHTML = htmlErr;
        if (box) box.style.display = 'block';
        return;
    }

    const player = appState.selectedPlayer;
    // Se presente, usa l'override (MURO) come fondamentale corrente
    const fundamentalCode = appState.calculatedFundamental || appState.overrideFundamental || predictNextFundamental();
    const evalVal = appState.selectedEvaluation;

    // La rotazione ora è mostrata nella riga di intestazione (next-fundamental)

    // Sigle richieste per il riquadro selezionato
    const fundamentalAbbr = { b: 'SERV', r: 'RICE', a: 'ATT', d: 'DIF', m: 'MURO' };
    const fundamentalUpper = fundamentalAbbr[fundamentalCode] || '';

    const evalNames = {
        1: 'ERRORE',
        2: 'NEGATIVO',
        3: 'NEUTRO',
        4: 'POSITIVO',
        5: 'PUNTO'
    };
    const evalText = evalVal ? (evalNames[evalVal] || String(evalVal)) : '';

    // Layout multi‑linea: mostra la progressione dell'azione corrente
    if (appState.multiLineLayout) {
        const seq = Array.isArray(appState.currentSequence) ? appState.currentSequence.slice() : [];
        // Calcola la quartina provvisoria (se disponibile) per prevenire duplicati
        const provisionalQuartet = (player && evalVal)
            ? `${String(player.number || '').padStart(2, '0')}${fundamentalCode}${evalVal}`
            : null;

        // Aggiungi la riga corrente (provvisoria):
        // - se c'è un player selezionato
        // - oppure se è stata selezionata una valutazione (mostra solo fondamentale + valutazione)
        const lines = [];
        if (player) {
            const nn = String(player.number || '').padStart(2, '0');
            const nameUpper = String(player.name || '').toUpperCase();
            const evalToken = evalText;
            const fTok = (typeof escapeHtml === 'function') ? escapeHtml(fundamentalUpper) : fundamentalUpper;
            const pTok = (typeof escapeHtml === 'function') ? escapeHtml([nn, nameUpper].filter(Boolean).join(' ')) : [nn, nameUpper].filter(Boolean).join(' ');
            const eTok = (typeof escapeHtml === 'function') ? escapeHtml(evalToken) : evalToken;
            const evalSpan = evalToken
                ? `<span class="token token-eval eval-${evalVal}">${eTok}</span>`
                : `<span class="token token-eval token-placeholder"></span>`;
            const playerCell = (appState.replacePlayerMode && appState.replaceTarget && appState.replaceTarget.kind === 'current')
                ? `<span class="token token-cancel" onclick="cancelReplacePlayerMode()" title="Annulla sostituzione">ANNULLA</span>`
                : `<span class="token token-player" data-row-kind="current">${pTok}</span>`;
            lines.push(`<div class="multi-line-item"><span class="token token-fundamental">${fTok}</span>${playerCell}${evalSpan}</div>`);
        } else if (evalVal) {
            // Nessun player ancora: mostra fondamentale previsto + valutazione selezionata
            const fTok = (typeof escapeHtml === 'function') ? escapeHtml(fundamentalUpper) : fundamentalUpper;
            const evalToken = evalText;
            const eTok = (typeof escapeHtml === 'function') ? escapeHtml(evalToken) : evalToken;
            const evalSpan = evalToken
                ? `<span class="token token-eval eval-${evalVal}">${eTok}</span>`
                : `<span class="token token-eval token-placeholder"></span>`;
            lines.push(`<div class="multi-line-item"><span class="token token-fundamental">${fTok}</span><span class="token token-player token-placeholder"></span>${evalSpan}</div>`);
        }

        // Aggiungi le righe della sequenza (più recente in alto)
        for (let i = seq.length - 1; i >= 0; i--) {
            const item = seq[i];
            const q = String(item.quartet || '');
            const nn = q.substring(0, 2);
            const f = q.charAt(2);
            const e = parseInt(q.charAt(3), 10);
            const fUpper = fundamentalAbbr[f] || '';
            const evalNames = {
                1: 'ERRORE',
                2: 'NEGATIVO',
                3: 'NEUTRO',
                4: 'POSITIVO',
                5: 'PUNTO'
            };
            const evalTextLine = evalNames[e] || '';
            const nameUpper = String(item.playerName || '').toUpperCase();
            const fTok = (typeof escapeHtml === 'function') ? escapeHtml(fUpper) : fUpper;
            const pTok = (typeof escapeHtml === 'function') ? escapeHtml([nn, nameUpper].filter(Boolean).join(' ')) : [nn, nameUpper].filter(Boolean).join(' ');
            const eTok = (typeof escapeHtml === 'function') ? escapeHtml(evalTextLine) : evalTextLine;
            // Evita duplicare l'ultima riga se coincide con la riga provvisoria
            if (provisionalQuartet && i === seq.length - 1 && q === provisionalQuartet) {
                continue;
            }
            const playerCell = (appState.replacePlayerMode && appState.replaceTarget && appState.replaceTarget.kind === 'sequence' && appState.replaceTarget.index === i)
                ? `<span class="token token-cancel" onclick="cancelReplacePlayerMode()" title="Annulla sostituzione">ANNULLA</span>`
                : `<span class="token token-player" data-row-kind="sequence" data-row-index="${i}">${pTok}</span>`;
            lines.push(`<div class="multi-line-item"><span class="token token-fundamental">${fTok}</span>${playerCell}${evalTextLine ? `<span class="token token-eval eval-${e}">${eTok}</span>` : ''}</div>`);
        }

        el.classList.add('multiline');
        el.innerHTML = lines.join('');
        if (box) box.style.display = lines.length ? 'block' : 'none';
        // Rende cliccabili TUTTE le pillole player visibili per avviare la sostituzione
        try {
            const playerSpans = el.querySelectorAll('.token-player');
            playerSpans.forEach(span => {
                if (span.classList.contains('token-placeholder')) return;
                span.style.cursor = 'pointer';
                span.title = 'Cambia giocatore della quartina';
                span.addEventListener('click', enterReplacePlayerModeFromSpan);
            });
        } catch(_) {}
        return;
    }

    // Layout a riga singola: tre colonne
    if (player) {
        const nn = String(player.number || '').padStart(2, '0');
        const nameUpper = String(player.name || '').toUpperCase();
        const fundamentalToken = fundamentalUpper;
        const playerToken = [nn, nameUpper].filter(Boolean).join(' ');
        const evalToken = evalText;
        const fTok = (typeof escapeHtml === 'function') ? escapeHtml(fundamentalToken) : fundamentalToken;
        const pTok = (typeof escapeHtml === 'function') ? escapeHtml(playerToken) : playerToken;
        const eTok = (typeof escapeHtml === 'function') ? escapeHtml(evalToken) : evalToken;
        const evalSpan = evalToken
            ? `<span class="token token-eval eval-${evalVal}">${eTok}</span>`
            : `<span class="token token-eval token-placeholder"></span>`;
        const playerCell = (appState.replacePlayerMode && appState.replaceTarget && appState.replaceTarget.kind === 'current')
            ? `<span class="token token-cancel" onclick="cancelReplacePlayerMode()" title="Annulla sostituzione">ANNULLA</span>`
            : `<span class="token token-player" data-row-kind="current">${pTok}</span>`;
        const html = `
            <span class="token token-fundamental">${fTok}</span>
            ${playerCell}
            ${evalSpan}
        `;
        el.classList.remove('multiline');
        el.innerHTML = html;
        if (box) box.style.display = 'block';
    } else if (evalVal) {
        // Nessun player selezionato: mostra fondamentale previsto + placeholder giocatore + valutazione
        const fundamentalToken = fundamentalUpper;
        const evalToken = evalText;
        const fTok = (typeof escapeHtml === 'function') ? escapeHtml(fundamentalToken) : fundamentalToken;
        const eTok = (typeof escapeHtml === 'function') ? escapeHtml(evalToken) : evalToken;
        const evalSpan = evalToken
            ? `<span class="token token-eval eval-${evalVal}">${eTok}</span>`
            : `<span class="token token-eval token-placeholder"></span>`;
        const html = `
            <span class="token token-fundamental">${fTok}</span>
            <span class="token token-player token-placeholder"></span>
            ${evalSpan}
        `;
        el.classList.remove('multiline');
        el.innerHTML = html;
        if (box) box.style.display = 'block';
    } else {
        // Nessun player e nessuna valutazione: mostra solo la pillola del fondamentale
        const fundamentalToken = fundamentalUpper;
        const fTok = (typeof escapeHtml === 'function') ? escapeHtml(fundamentalToken) : fundamentalToken;
        const html = `
            <span class="token token-fundamental">${fTok}</span>
        `;
        el.classList.remove('multiline');
        el.innerHTML = html;
        if (box) box.style.display = 'block';
    }

    // In layout a riga singola, rende cliccabile la pillola player (se presente)
    try {
        const playerSpans = el.querySelectorAll('.token-player');
        playerSpans.forEach(span => {
            if (span.classList.contains('token-placeholder')) return;
            span.style.cursor = 'pointer';
            span.title = 'Cambia giocatore della quartina';
            span.addEventListener('click', enterReplacePlayerModeFromSpan);
        });
    } catch(_) {}

    // Applica/rompe l'evidenza grafica in modalità sostituzione
    try {
        const selectedInfo = document.getElementById('selected-info');
        if (selectedInfo) {
            if (appState.replacePlayerMode) selectedInfo.classList.add('replace-mode');
            else selectedInfo.classList.remove('replace-mode');
        }
    } catch(_) {}
}

// Entra in modalità sostituzione giocatore dalla pillola "Hai Selezionato"
function enterReplacePlayerMode(){
    return enterReplacePlayerModeFor('current', null, null);
}

function enterReplacePlayerModeFromSpan(e){
    const span = e.currentTarget;
    const kind = span.dataset.rowKind || span.getAttribute('data-row-kind') || 'current';
    const indexStr = span.dataset.rowIndex || span.getAttribute('data-row-index');
    const idx = indexStr != null ? parseInt(indexStr, 10) : null;
    enterReplacePlayerModeFor(kind, idx, span);
}

function enterReplacePlayerModeFor(kind, idx, spanEl){
    appState.replacePlayerMode = true;
    appState.replaceTarget = { kind: (kind || 'current'), index: idx };
    // Evidenza grafica: container + pillola target
    try {
        const selectedInfo = document.getElementById('selected-info');
        if (selectedInfo) selectedInfo.classList.add('replace-mode');
        selectedInfo?.querySelectorAll('.token-player.replace-target').forEach(s => s.classList.remove('replace-target'));
        if (spanEl) spanEl.classList.add('replace-target');
    } catch(_) {}
    // Aggiorna il riquadro selezionato per mostrare ANNULLA al posto della pillola player
    try { updateDescriptiveQuartet(); } catch(_) {}
    // Focus sulla selezione del giocatore
    try { showScoutingStep('step-player'); } catch(_) {}
}

// Esce dalla modalità sostituzione senza cambiare il giocatore
function cancelReplacePlayerMode(){
    appState.replacePlayerMode = false;
    appState.replaceTarget = null;
    // Aggiorna la UI per ripristinare la pillola player nel riquadro selezionato
    try { updateDescriptiveQuartet(); } catch(_) {}
    // Rimuove la classe di evidenza
    try {
        const selectedInfo = document.getElementById('selected-info');
        if (selectedInfo) selectedInfo.classList.remove('replace-mode');
        selectedInfo?.querySelectorAll('.token-player.replace-target').forEach(s => s.classList.remove('replace-target'));
    } catch(_) {}
}

// Attiva l'override MURO per la singola azione corrente
function activateMuroOverride() {
    try {
        // Se era in corso un timer di auto-chiusura, interrompilo e rimuovi l'animazione
        if (appState.autoClosePending) {
            if (appState.autoCloseTimerId) {
                clearTimeout(appState.autoCloseTimerId);
                appState.autoCloseTimerId = null;
            }
            appState.autoClosePending = false;
            appState.autoClosePayload = null;
            document.querySelectorAll('.eval-btn').forEach(btn => {
                btn.classList.remove('timer-pending');
                btn.style.removeProperty('--pulse-duration');
            });
        }
        appState.overrideFundamental = 'm';
        appState.calculatedFundamental = 'm';
        // Puliamo eventuale preview precedente per evitare che sovrascriva il banner
        appState.nextFundamentalPreview = null;
        // Aggiorna banner e descrizione corrente
        updateNextFundamental();
        updateDescriptiveQuartet();
        // Porta alla selezione del giocatore (ordine: MURO → Player → Valutazione)
        showScoutingStep('step-player');
    } catch (_) {}
}
