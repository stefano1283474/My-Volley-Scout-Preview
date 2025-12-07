// Stato globale dell'applicazione
if (!window.appState) { window.appState = {
    currentPage: 'match-data',
    currentMatch: null,
    currentRoster: [],
    currentSet: 1,
    currentRotation: 'P1',
    currentPhase: 'servizio',
    // Fase di inizio del rally corrente: usata per calcolare il primo cambio rotazione correttamente
    rallyStartPhase: 'servizio',
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
    replacePlayerMode: false,
    // Sopprime i prompt di fine set/inizio set durante operazioni automatiche (es. import)
    suppressSetPrompts: false,
    // Filtro per set per ciascuna tabella del "Riepilogo All"
    allSetFilterByFundamental: {
        'Attacco': ['ALL'],
        'Servizio': ['ALL'],
        'Muro': ['ALL'],
        'Ricezione': ['ALL'],
        'Difesa': ['ALL']
    }
}; }
var appState = window.appState;

window.rotationSequence = window.rotationSequence || ['P1', 'P6', 'P5', 'P4', 'P3', 'P2'];
var rotationSequence = window.rotationSequence;

// Normalizza una rotazione in formato coerente "P1".."P6"
function normalizeRotation(rot) {
  if (!rot) return 'P1';
  const s = String(rot).trim().toUpperCase();
  // Rimuove eventuale spazio tra P e numero, e aggiunge prefisso se assente
  const withPrefix = s.startsWith('P') ? s.replace(/^P\s*/,'P') : `P${s}`;
  // Estrae solo il numero 1..6
  const num = withPrefix.replace(/^P\s*/,'').replace(/[^1-6]/g,'');
  const valid = num && ['1','2','3','4','5','6'].includes(num) ? num : '1';
  return `P${valid}`;
}

function cancelAutosave() {
    try {
        if (__autosaveTimerId) {
            clearTimeout(__autosaveTimerId);
            __autosaveTimerId = null;
        }
    } catch (_) {}
}

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
            id: md.id || md.matchId || 'm_' + Date.now(),
            myTeam: myTeamName,
            opponentTeam: opponentName,
            homeTeam,
            awayTeam,
            homeAway,
            matchType,
            date
        };

        // Includi dati per-set se disponibili nella sessione
        try {
            appState.currentMatch.actionsBySet = md.actionsBySet || {};
            appState.currentMatch.scoreHistoryBySet = md.scoreHistoryBySet || {};
            appState.currentMatch.setStateBySet = md.setStateBySet || {};
        } catch(_) {}

        // Carica roster
        let loadedRoster = [];
        try {
            if (Array.isArray(md.roster) && md.roster.length) {
                loadedRoster = md.roster;
            }
            if (!loadedRoster.length) {
                try {
                    const setup = JSON.parse(localStorage.getItem('currentMatchSetup') || '{}');
                    const rr = Array.isArray(setup?.roster) ? setup.roster : [];
                    if (rr.length) loadedRoster = rr;
                } catch(_) {}
            }
            if (!loadedRoster.length && window.teamsModule && typeof window.teamsModule.getCurrentTeam === 'function') {
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
            if (!loadedRoster.length) {
                try {
                    const matchId = md.id || md.matchId || localStorage.getItem('selectedMatchId') || null;
                    const local = JSON.parse(localStorage.getItem('volleyMatches') || '[]');
                    const found = matchId ? local.find(m => String(m.id) === String(matchId)) : null;
                    const rr = found ? (Array.isArray(found.roster) ? found.roster : (Array.isArray(found.players) ? found.players : [])) : [];
                    if (rr.length) loadedRoster = rr;
                } catch(_) {}
            }
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
            if (!Array.isArray(loadedRoster) || !loadedRoster.length) {
                try {
                    const list = JSON.parse(localStorage.getItem('savedRosters') || '[]');
                    let best = null, bestScore = -1;
                    list.forEach(item => {
                        const rr = Array.isArray(item?.roster) ? item.roster : (Array.isArray(item?.players) ? item.players : []);
                        if (Array.isArray(rr) && rr.length) {
                            const s = rr.reduce((acc,p)=> acc + ((p && (p.name||p.surname||p.firstName||p.lastName)) ? 1 : 0), 0);
                            if (s > bestScore) { bestScore = s; best = rr; }
                        }
                    });
                    if (best) loadedRoster = best;
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

        try {
            const hasActions = Array.isArray(appState.actionsLog) && appState.actionsLog.length > 0;
            const hasHistory = Array.isArray(appState.scoreHistory) && appState.scoreHistory.length > 1;
            if (hasActions && !hasHistory) {
                appState.setStarted = true;
                recomputeFromActionsLog();
                try { if (typeof updateSetSidebarColors === 'function') updateSetSidebarColors(); } catch(_) {}
            }
        } catch(_) {}
    } catch (e) {
        console.error('Errore loadScoutingSession:', e);
    }
};

// Funzioni di navigazione e inizializzazione app
function switchPage(pageId) {
    // Aggiorna stato
    appState.currentPage = pageId;
    // Imposta classi di modalità pagina per gestire la visibilità via CSS
    try {
        const body = document.body;
        body.classList.remove('page-scouting','page-report','page-analysis');
        if (pageId === 'scouting') body.classList.add('page-scouting');
        else if (pageId && pageId.startsWith('report')) body.classList.add('page-report');
        else if (pageId === 'analysis') body.classList.add('page-analysis');
    } catch(_) {}

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
    // Sezioni principali
    const scoutingSection = document.getElementById('scouting-section');
    const scoutingDialog = document.getElementById('scouting-dialog');
    const analysisSection = document.getElementById('analysis-section');
    const punteggioSection = document.getElementById('punteggio-section');
    const reportSection = document.getElementById('report-section');
    const reportRiepilogo = document.getElementById('report-riepilogo');
    const reportGioco = document.getElementById('report-gioco');
    const reportAttacco = document.getElementById('report-attacco');
    const reportGiriRice = document.getElementById('report-giri-rice');
    const reportRiepilogoSet = document.getElementById('report-riepilogo-set');
    const reportRiepilogoAll = document.getElementById('match-stats');

    // Nascondi tutto
    if (scoutingSection) scoutingSection.style.display = 'none';
    if (scoutingDialog) scoutingDialog.style.display = 'none';
    if (analysisSection) analysisSection.style.display = 'none';
    if (punteggioSection) punteggioSection.style.display = 'none';
    if (reportSection) reportSection.style.display = 'none';
    if (reportRiepilogo) reportRiepilogo.style.display = 'none';
    if (reportGioco) reportGioco.style.display = 'none';
    if (reportAttacco) reportAttacco.style.display = 'none';
    if (reportGiriRice) reportGiriRice.style.display = 'none';
    if (reportRiepilogoSet) reportRiepilogoSet.style.display = 'none';
    if (reportRiepilogoAll) reportRiepilogoAll.style.display = 'none';

    // Mostra in base alla pagina
    // Mostra la sezione di scouting
    if (pageId === 'scouting') {
        if (scoutingSection) scoutingSection.style.display = 'block';
        // Compatibilità con layout corrente: usa il dialog embedded come "pagina" scouting
        if (!scoutingSection && scoutingDialog) scoutingDialog.style.display = 'block';
    }
    if (pageId === 'analysis' && analysisSection) analysisSection.style.display = 'block';
    if (pageId === 'report' && reportSection) reportSection.style.display = 'block';
    if (pageId === 'report-riepilogo' && reportRiepilogo) reportRiepilogo.style.display = 'block';
    if (pageId === 'report-gioco' && reportGioco) reportGioco.style.display = 'block';
    if (pageId === 'report-attacco' && reportAttacco) reportAttacco.style.display = 'block';
    if (pageId === 'report-giri-rice' && reportGiriRice) reportGiriRice.style.display = 'block';
    if (pageId === 'report-riepilogo-set' && reportRiepilogoSet) reportRiepilogoSet.style.display = 'block';
    if (pageId === 'match-stats' && reportRiepilogoAll) reportRiepilogoAll.style.display = 'block';

    // Inizializza/aggiorna la pagina specifica se necessario
    try {
        if (pageId === 'match-data') {
            if (typeof updateMatchInfo === 'function') updateMatchInfo();
        } else if (pageId === 'scouting') {
            if (typeof updateMatchInfo === 'function') updateMatchInfo();
            if (typeof updateScoutingUI === 'function') updateScoutingUI();
            const dlg = document.getElementById('scouting-dialog');
            if (dlg && dlg.open) dlg.close();
            if (punteggioSection) punteggioSection.style.display = 'block';
        } else if (pageId === 'roster') {
            if (typeof renderRosterTable === 'function') renderRosterTable();
        } else if (pageId === 'analysis') {
            // Inizializzazioni future per la pagina Analisi
            // Placeholder: potremmo aggiornare riepiloghi, grafici, ecc.
    } else if (pageId && pageId.startsWith('report')) {
        // Iniezione contenuti dinamici per i report
        if (pageId === 'report-riepilogo') {
            try { renderReportRiepilogo(); } catch (e) { console.warn('Riepilogo render error:', e); }
        } else if (pageId === 'match-stats') {
            try { renderMatchStats(); } catch (e) { console.warn('Match-Stats render error:', e); }
        }
    }
    } catch (e) {
        console.warn('Aggiornamento pagina non riuscito:', e);
    }

    // Adatta layout alla viewport dopo il cambio pagina
    try {
        if (typeof fitActivePageToViewport === 'function') fitActivePageToViewport();
    } catch (_) {}
}

// =========================
// Report: Riepilogo (KPI)
// =========================
function renderReportRiepilogo() {
    const kpiEl = document.getElementById('riepilogo-kpi');
    const trendEl = document.getElementById('riepilogo-trend');
    const distEl = document.getElementById('riepilogo-distrib');
    const notesEl = document.getElementById('riepilogo-notes');
    if (!kpiEl || !trendEl || !distEl || !notesEl) return;
    // Sorgente dati: partita selezionata scoutizzata
    const currentMatch = appState.currentMatch || getBestLocalMatch();
    const setNum = (typeof appState.currentSet === 'number' && appState.currentSet > 0)
      ? appState.currentSet
      : (currentMatch?.currentSet || 1);
    const actionsBySet = currentMatch?.actionsBySet || {};
    const logs = Array.isArray(actionsBySet[setNum]) ? actionsBySet[setNum] : (Array.isArray(appState.actionsLog) ? appState.actionsLog : []);
    const fundamentalStats = { b: { attempts: 0, eval: [0,0,0,0,0] }, r: { attempts: 0, eval: [0,0,0,0,0] }, a: { attempts: 0, eval: [0,0,0,0,0] }, d: { attempts: 0, eval: [0,0,0,0,0] }, m: { attempts: 0, eval: [0,0,0,0,0] } };
    let totalActions = 0;
    let homePoints = 0;
    let awayPoints = 0;
    const evalDist = [0,0,0,0,0];

    // Ricostruisci punteggio e distribuzioni
    for (const log of logs) {
        const actionString = (log && typeof log.action === 'string') ? log.action : (typeof log === 'string' ? log : null);
        if (!actionString) continue;
        totalActions++;
        const parsed = parseAction(actionString);
        const last = parsed.actions[parsed.actions.length - 1];
        if (last && fundamentalStats[last.fundamental]) {
            fundamentalStats[last.fundamental].attempts++;
            const idx = Math.max(1, Math.min(5, last.evaluation)) - 1;
            fundamentalStats[last.fundamental].eval[idx]++;
            evalDist[idx]++;
        }
        if (parsed.result === 'home_point') homePoints++;
        else if (parsed.result === 'away_point') awayPoints++;
    }

    // KPI Generali
    const fmtPct = (num) => (isFinite(num) ? `${(num*100).toFixed(1)}%` : '—');
    const eff = (f) => {
        const s = fundamentalStats[f];
        if (!s.attempts) return { plus: 0, minus: 0, eff: '—' };
        const plus = s.eval[4]; // 5 = #
        const minus = s.eval[0]; // 1 = errore
        const e = (plus - minus) / s.attempts;
        return { plus, minus, eff: fmtPct(e) };
    };
    const eB = eff('b');
    const eA = eff('a');
    const eM = eff('m');

    kpiEl.innerHTML = `
      <table style="width:100%;border-collapse:collapse;">
        <tr><td>Punti Casa</td><td style="text-align:right;font-weight:600;">${homePoints}</td></tr>
        <tr><td>Punti Ospiti</td><td style="text-align:right;font-weight:600;">${awayPoints}</td></tr>
        <tr><td>Azioni Totali</td><td style="text-align:right;">${totalActions}</td></tr>
        <tr><td>Servizio (#/1 / Eff.)</td><td style="text-align:right;">${eB.plus}/${eB.minus} · ${eB.eff}</td></tr>
        <tr><td>Attacco (#/1 / Eff.)</td><td style="text-align:right;">${eA.plus}/${eA.minus} · ${eA.eff}</td></tr>
        <tr><td>Muro (#/1 / Eff.)</td><td style="text-align:right;">${eM.plus}/${eM.minus} · ${eM.eff}</td></tr>
      </table>
    `;

    // Trend punteggio (semplice lista progressiva)
    const scoreHistoryBySet = currentMatch?.scoreHistoryBySet || {};
    const history = Array.isArray(scoreHistoryBySet[setNum]) && scoreHistoryBySet[setNum].length > 0
      ? scoreHistoryBySet[setNum]
      : (Array.isArray(appState.scoreHistory) && appState.scoreHistory.length > 0 ? appState.scoreHistory : buildScoreHistoryFromLogs(logs));
    trendEl.innerHTML = history.length === 0
      ? '<div style="color:#64748b;">Nessun dato di punteggio</div>'
      : `<div style="display:grid;gap:6px;">${history.map(h => `<div> ${h.homeScore} - ${h.awayScore} <span style="color:#94a3b8">${h.timestamp||''}</span></div>`).join('')}</div>`;

    // Distribuzione valutazioni globali (1..5)
    const symbols = ['=','-','/','+','#'];
    distEl.innerHTML = `
      <table style="width:100%;border-collapse:collapse;">
        ${evalDist.map((cnt, i) => `<tr><td>Valutazione ${i+1} (${symbols[i]})</td><td style="text-align:right;">${cnt}</td></tr>`).join('')}
      </table>
    `;

    // Tabelle per-player per fondamentale (replica foglio Excel "Riepilogo")
    try {
        const perPlayer = aggregateByPlayerAndFundamental(logs);
        const roster = Array.isArray(appState.currentRoster) ? appState.currentRoster : [];
        const tables = buildPerPlayerTablesHTML(perPlayer, roster);
        const teamSummaryHtml = buildTeamSummaryHTML(perPlayer);
        const ids = {
          'Attacco': 'riepilogo-attacco',
          'Servizio': 'riepilogo-battuta',
          'Muro': 'riepilogo-muro',
          'Ricezione': 'riepilogo-ricezione',
          'Difesa': 'riepilogo-difesa'
        };
        Object.entries(tables).forEach(([fund, html]) => {
          const el = document.getElementById(ids[fund]);
          if (el) el.innerHTML = html;
        });
        const teamEl = document.getElementById('riepilogo-squadra');
        if (teamEl) teamEl.innerHTML = teamSummaryHtml;
    } catch (e) {
        console.warn('Render tabelle per-player fallito:', e);
    }

    // Note
    notesEl.innerHTML = `<div style="color:#64748b">Placeholder note: inserire osservazioni, chiavi di lettura del set o della gara.</div>`;
}

// =========================
// Report: Riepilogo All (per-player su tutta la gara)
// =========================
function renderMatchStats() {
    const ids = {
        'Attacco': 'all-attacco',
        'Servizio': 'all-battuta',
        'Muro': 'all-muro',
        'Ricezione': 'all-ricezione',
        'Difesa': 'all-difesa'
    };
    const currentMatch = appState.currentMatch || getBestLocalMatch();
    let actionsBySet = (currentMatch && currentMatch.actionsBySet) ? currentMatch.actionsBySet : {};
    let sessionDataCache = null;
    // Se l'oggetto per-set è vuoto, prova a recuperare dalla sessione corrente o dal match locale migliore
    if (!actionsBySet || Object.keys(actionsBySet).length === 0) {
        try {
            sessionDataCache = JSON.parse(localStorage.getItem('currentScoutingSession') || '{}');
            if (sessionDataCache && sessionDataCache.actionsBySet && Object.keys(sessionDataCache.actionsBySet).length > 0) {
                actionsBySet = sessionDataCache.actionsBySet;
            }
        } catch(_) {}
        if (!actionsBySet || Object.keys(actionsBySet).length === 0) {
            const best = getBestLocalMatch();
            actionsBySet = (best && best.actionsBySet) ? best.actionsBySet : {};
        }
    }
    // Flat list su tutti i set (1..n), ordinando i set numericamente
    let allLogs = Object.keys(actionsBySet || {}).sort((a,b)=>Number(a)-Number(b)).flatMap(k => Array.isArray(actionsBySet[k]) ? actionsBySet[k] : []);
    // Fallback ulteriori: se non ci sono logs per-set, usa 'actions' del match/sessione o quelli in appState
    if (!allLogs || allLogs.length === 0) {
        const fromMatchActions = (currentMatch && Array.isArray(currentMatch.actions)) ? currentMatch.actions : [];
        if (fromMatchActions.length > 0) {
            allLogs = fromMatchActions;
        } else {
            try {
                const sessionData = sessionDataCache || JSON.parse(localStorage.getItem('currentScoutingSession') || '{}');
                if (sessionData && Array.isArray(sessionData.actions) && sessionData.actions.length > 0) {
                    allLogs = sessionData.actions;
                }
            } catch(_) {}
            if (!allLogs || allLogs.length === 0) {
                allLogs = Array.isArray(appState.actionsLog) ? appState.actionsLog : [];
            }
        }
    }
    let roster = Array.isArray(appState.currentRoster) ? appState.currentRoster : [];
    if (!roster || roster.length === 0) {
        try {
            const selectedTeamId = appState?.myTeam?.id || appState?.selectedTeamId || null;
            const teams = JSON.parse(localStorage.getItem('volleyTeams') || '[]');
            const team = teams.find(t => String(t.id) === String(selectedTeamId));
            if (team) {
                const cand = Array.isArray(team.roster) ? team.roster : (Array.isArray(team.players) ? team.players : []);
                if (Array.isArray(cand) && cand.length) roster = cand;
            }
        } catch(_) {}
        if (!roster || roster.length === 0) {
            try {
                const sessionData = sessionDataCache || JSON.parse(localStorage.getItem('currentScoutingSession') || '{}');
                const sr = Array.isArray(sessionData.roster) ? sessionData.roster : [];
                if (sr && sr.length) roster = sr;
            } catch(_) {}
        }
    }

    // Per ogni fondamentale, costruisci tabella in base al filtro set selezionato
    const selectedMap = appState.allSetFilterByFundamental || {};
    ['Attacco','Servizio','Muro','Ricezione','Difesa'].forEach(fund => {
        let selectedSets = selectedMap[fund];
        // Compatibilità: se fosse stringa, trasformala in array
        if (!Array.isArray(selectedSets)) selectedSets = [selectedSets || 'ALL'];

        let logsForFund;
        if (selectedSets.includes('ALL') || selectedSets.length === 0) {
            logsForFund = (allLogs.length ? allLogs : (Array.isArray(appState.actionsLog) ? appState.actionsLog : []));
        } else {
            // Somma i log dei set selezionati
            logsForFund = selectedSets.flatMap(setId => Array.isArray(actionsBySet[setId]) ? actionsBySet[setId] : []);
        }

        const agg = aggregateByPlayerAndFundamental(logsForFund);
        const tables = buildPerPlayerTablesAll(agg, roster);
        const tableHtml = tables[fund];
        const filterHtml = buildSetFilterButtons(fund, selectedSets);

        const elId = ids[fund];
        const el = elId ? document.getElementById(elId) : null;
        if (el) {
            // Mantieni i pulsanti filtro fissi (sticky) e limita lo scroll orizzontale alla tabella
            el.innerHTML = `${filterHtml}<div class="table-scroll">${tableHtml}</div>`;
        } else {
            console.warn('Missing container for', fund);
        }
    });

    const notesEl = document.getElementById('all-notes');
    if (notesEl) notesEl.innerHTML = '<div style="color:#64748b">Dati aggregati su tutti i set della gara.</div>';
}

// Trova una partita locale plausibile se appState.currentMatch manca
function getBestLocalMatch() {
    try {
        const local = JSON.parse(localStorage.getItem('volleyMatches') || '[]');
        if (!Array.isArray(local) || local.length === 0) return null;
        // Preferisci quella in_progress, altrimenti la più recente per updatedAt
        const inProgress = local.filter(m => m && m.status === 'in_progress');
        if (inProgress.length > 0) {
            return inProgress.sort((a,b) => new Date(b.updatedAt||0) - new Date(a.updatedAt||0))[0];
        }
        return local.sort((a,b) => new Date(b.updatedAt||0) - new Date(a.updatedAt||0))[0];
    } catch (_) { return null; }
}

function buildScoreHistoryFromLogs(logs) {
    let h = 0, a = 0;
    const history = [];
    for (const log of logs) {
        const actionString = (log && typeof log.action === 'string') ? log.action : (typeof log === 'string' ? log : null);
        if (!actionString) continue;
        const parsed = parseAction(actionString);
        if (parsed.result === 'home_point') h++;
        else if (parsed.result === 'away_point') a++;
        if (parsed.result === 'home_point' || parsed.result === 'away_point') {
            history.push({ homeScore: h, awayScore: a, timestamp: '' });
        }
    }
    return history;
}

// =========================
// Aggregazione per-player per fondamentale
// =========================
function aggregateByPlayerAndFundamental(logs) {
    // Supporta sia codici fondamentali (a,b,m,r,d) che nomi estesi
    const FUND_MAP = { a: 'Attacco', b: 'Servizio', m: 'Muro', r: 'Ricezione', d: 'Difesa' };
    const fundamentals = ['Attacco', 'Servizio', 'Muro', 'Ricezione', 'Difesa'];
    const agg = {};
    fundamentals.forEach(f => { agg[f] = { teamTotal: {1:0,2:0,3:0,4:0,5:0} }; });

    for (const entry of logs) {
        const actionString = (entry && typeof entry.action === 'string') ? entry.action : (typeof entry === 'string' ? entry : null);
        if (!actionString) continue;
        let parsed;
        try {
            parsed = parseAction(actionString);
        } catch(_) { continue; }
        // Conta TUTTE le azioni del rally, non solo l'ultima
        const acts = Array.isArray(parsed?.actions) ? parsed.actions : [];
        for (const act of acts) {
            const rawFund = act.fundamental; // 'a','b','m','r','d'
            const fund = FUND_MAP[rawFund] || rawFund; // mappa a nome esteso
            if (!fundamentals.includes(fund)) continue;
            // Normalizza numero maglia: rimuove zeri iniziali ("07" -> "7")
            const playerNumberRaw = act.player || act.playerNumber || '';
            const playerNumber = playerNumberRaw !== '' ? String(Number(String(playerNumberRaw).trim())) : '';
            const playerName = act.playerName || '';
            const playerKey = playerNumber ? String(playerNumber) : (playerName || '');
            if (!agg[fund][playerKey]) {
                agg[fund][playerKey] = { name: playerName || playerKey, number: playerNumber || '', counts: {1:0,2:0,3:0,4:0,5:0} };
            }
            const idx = Math.max(1, Math.min(5, Number(act.evaluation || 0)));
            agg[fund][playerKey].counts[idx]++;
            agg[fund].teamTotal[idx]++;
        }
    }
    return agg;
}

function computeEfficacia(fund, counts) {
    const tot = (counts[1]+counts[2]+counts[3]+counts[4]+counts[5]);
    if (!tot) return '0%';
    if (fund === 'Ricezione' || fund === 'Difesa') {
        const val = (counts[4] + counts[5]) / tot;
        return `${(val*100).toFixed(0)}%`;
    }
    // Attacco, Servizio, Muro: Efficacia = (valutazioni positive) / tot
    // Per Attacco, la base Excel usa (# + +) / tot
    // Manteniamo coerenza estesa: per Servizio/Muro consideriamo 5 e 4 come positivi
    const val = (counts[5] + counts[4]) / tot;
    return `${(val*100).toFixed(0)}%`;
}

function computeEfficienzaFund(fund, counts) {
    const tot = (counts[1]+counts[2]+counts[3]+counts[4]+counts[5]);
    if (!tot) return '0%';
    if (fund === 'Ricezione' || fund === 'Difesa') {
        const val = ((counts[4] + counts[3]) - counts[1]) / tot;
        return `${(val*100).toFixed(0)}%`;
    }
    const val = (counts[5] - counts[1]) / tot;
    return `${(val*100).toFixed(0)}%`;
}

function buildHeaderHTML() {
    return `<tr>
      <th style="min-width:48px;">N°</th>
      <th style="max-width:8ch;">Cognome</th>
      <th>1</th><th>2</th><th>3</th><th>4</th><th>5</th>
      <th>Tot</th><th>%</th><th>Efficacia</th><th>Efficienza</th>
    </tr>`;
}

function buildPerPlayerTablesHTML(agg, roster) {
    const playerNameByNumber = {};
    if (Array.isArray(roster)) {
        roster.forEach(p => { if (p?.number) playerNameByNumber[String(p.number)] = p?.name || ''; });
    }
    const tables = {};
    Object.keys(agg).forEach(fund => {
        const teamTotalCounts = agg[fund].teamTotal;
        const teamTotal = teamTotalCounts[1]+teamTotalCounts[2]+teamTotalCounts[3]+teamTotalCounts[4]+teamTotalCounts[5];
        let rows = '';
        Object.entries(agg[fund]).forEach(([key, data]) => {
            if (key === 'teamTotal') return;
            const c = data.counts;
            const tot = c[1]+c[2]+c[3]+c[4]+c[5];
            const share = teamTotal ? `${Math.round((tot/teamTotal)*100)}%` : '0%';
            const name = playerNameByNumber[data.number] || data.name || key;
            rows += `<tr>
              <td>${data.number || ''}</td>
              <td title="${escapeHtml(name)}">${escapeHtml(abbreviateWithDots(name, 8))}</td>
              <td>${c[1]}</td><td>${c[2]}</td><td>${c[3]}</td><td>${c[4]}</td><td>${c[5]}</td>
              <td>${tot}</td>
              <td>${share}</td>
              <td>${computeEfficacia(fund, c)}</td>
              <td>${computeEfficienzaFund(fund, c)}</td>
            </tr>`;
        });
        const footer = `<tr class="total-row" style="font-weight:600;background:#f1f5f9;">
            <td colspan="2">TOTALE</td>
            <td>${teamTotalCounts[1]}</td><td>${teamTotalCounts[2]}</td><td>${teamTotalCounts[3]}</td><td>${teamTotalCounts[4]}</td><td>${teamTotalCounts[5]}</td>
            <td>${teamTotal}</td>
            <td>100%</td>
            <td>${computeEfficacia(fund, teamTotalCounts)}</td>
            <td>${computeEfficienzaFund(fund, teamTotalCounts)}</td>
        </tr>`;
        const pct = (x) => teamTotal ? `${Math.round((x/teamTotal)*100)}%` : '0%';
        const percentFooter = `<tr style="background:#f8fafc;">
            <td colspan="2">% su Tot</td>
            <td>${pct(teamTotalCounts[1])}</td><td>${pct(teamTotalCounts[2])}</td><td>${pct(teamTotalCounts[3])}</td><td>${pct(teamTotalCounts[4])}</td><td>${pct(teamTotalCounts[5])}</td>
            <td>100%</td>
            <td></td><td></td><td></td>
        </tr>`;
        tables[fund] = `<table class="simple-table">${buildHeaderHTML()}${rows}${footer}${percentFooter}</table>`;
    });
    return tables;
}

function buildTeamSummaryHTML(agg) {
    const rows = ['Attacco','Servizio','Ricezione','Difesa','Muro'].map(fund => {
        const counts = (agg[fund]&&agg[fund].teamTotal) ? agg[fund].teamTotal : {1:0,2:0,3:0,4:0,5:0};
        const tot = counts[1]+counts[2]+counts[3]+counts[4]+counts[5];
        return `<tr><td>${fund}</td><td>${tot}</td><td>${computeEfficacia(fund, counts)}</td><td>${computeEfficienzaFund(fund, counts)}</td></tr>`;
    }).join('');
    return `<table class="simple-table">
        <tr><th>Squadra</th><th>Tot</th><th>Efficacia</th><th>Efficienza</th></tr>
        ${rows}
    </table>`;
}

// Header con simboli nel medesimo ordine del foglio Excel
function buildHeaderSymbolsHTML() {
    return `<tr>
      <th style="min-width:48px;">N°</th>
      <th style="max-width:8ch;">Cognome</th>
      <th>#</th><th>+</th><th>\\</th><th>-</th><th>=</th>
      <th>Tot</th><th>%</th><th>Efficacia</th><th>Efficienza</th>
    </tr>`;
}

// Costruisce la barra di selezione set (1..5 e ALL) per una tabella
function buildSetFilterButtons(fund, selectedSets = ['ALL']) {
    const activeSet = new Set((Array.isArray(selectedSets) ? selectedSets : [selectedSets]).map(String));
    const mk = (label) => {
        const isActive = activeSet.has(String(label));
        const cls = `filter-btn` + (isActive ? ' active' : '');
        return `<button class="${cls}" data-set-filter="true" data-fund="${fund}" data-set="${label}">${label}</button>`;
    };
    return `<div class="set-filter">${mk('ALL')}${mk('1')}${mk('2')}${mk('3')}${mk('4')}${mk('5')}</div>`;
}

// Versione All: colonne simboliche e metriche, righe = player
function buildPerPlayerTablesAll(agg, roster) {
    const playerNameByNumber = {};
    const rosterNumbers = [];
    if (Array.isArray(roster)) {
        roster.forEach(p => {
            if (p?.number != null && p?.number !== '') {
                const numStr = normalizeNumberStr(p.number);
                const display = (p.nickname && String(p.nickname).trim()) || (p.surname && String(p.surname).trim()) || (p.name && String(p.name).trim()) || '';
                playerNameByNumber[numStr] = display;
                rosterNumbers.push(numStr);
            }
        });
    }
    const header = buildHeaderSymbolsHTML();
    const tables = {};
    Object.keys(agg).forEach(fund => {
        let rows = '';
        const teamCounts = agg[fund].teamTotal || {1:0,2:0,3:0,4:0,5:0};
        const teamTotal = teamCounts[1]+teamCounts[2]+teamCounts[3]+teamCounts[4]+teamCounts[5];
        // 1) Righe per TUTTO il roster (anche con zero azioni)
        const fundAgg = agg[fund] || {};
        const byNumber = {};
        Object.entries(fundAgg).forEach(([key, data]) => {
            if (key === 'teamTotal') return;
            if (data && data.number) {
                const n = normalizeNumberStr(data.number);
                byNumber[n] = { ...data, number: n };
            }
        });

        const sortedRoster = rosterNumbers.slice().sort((a,b)=>Number(a)-Number(b));
        for (const numStr of sortedRoster) {
            const data = byNumber[numStr] || { number: numStr, name: playerNameByNumber[numStr] || '', counts: {1:0,2:0,3:0,4:0,5:0} };
            const c = data.counts;
            const tot = (c[1]+c[2]+c[3]+c[4]+c[5]);
            const share = teamTotal ? `${Math.round((tot/teamTotal)*100)}%` : '0%';
            const name = playerNameByNumber[numStr] || data.name || '';
            rows += `<tr>
                <td>${formatJersey(numStr)}</td>
                <td title="${escapeHtml(name)}">${escapeHtml(abbreviateWithDots(name, 8))}</td>
                <td>${c[5]}</td><td>${c[4]}</td><td>${c[3]}</td><td>${c[2]}</td><td>${c[1]}</td>
                <td>${tot}</td>
                <td>${share}</td>
                <td>${computeEfficacia(fund, c)}</td>
                <td>${computeEfficienzaFund(fund, c)}</td>
            </tr>`;
        }

        // 2) Eventuali player presenti nei log ma non nel roster (li aggiungo in coda)
        Object.entries(fundAgg).forEach(([key, data]) => {
            if (key === 'teamTotal') return;
            const numStr = normalizeNumberStr(data.number || '');
            if (numStr && rosterNumbers.includes(numStr)) return; // già inserito
            const c = data.counts;
            const tot = (c[1]+c[2]+c[3]+c[4]+c[5]);
            const share = teamTotal ? `${Math.round((tot/teamTotal)*100)}%` : '0%';
            const name = playerNameByNumber[numStr] || data.name || key;
            rows += `<tr>
                <td>${formatJersey(numStr)}</td>
                <td title="${escapeHtml(name)}">${escapeHtml(abbreviateWithDots(name, 8))}</td>
                <td>${c[5]}</td><td>${c[4]}</td><td>${c[3]}</td><td>${c[2]}</td><td>${c[1]}</td>
                <td>${tot}</td>
                <td>${share}</td>
                <td>${computeEfficacia(fund, c)}</td>
                <td>${computeEfficienzaFund(fund, c)}</td>
            </tr>`;
        });
        const footer = `<tr class="total-row" style="font-weight:600;background:#f1f5f9;">
            <td colspan="2">TOTALE</td>
            <td>${teamCounts[5]}</td><td>${teamCounts[4]}</td><td>${teamCounts[3]}</td><td>${teamCounts[2]}</td><td>${teamCounts[1]}</td>
            <td>${teamTotal}</td>
            <td>100%</td>
            <td>${computeEfficacia(fund, teamCounts)}</td>
            <td>${computeEfficienzaFund(fund, teamCounts)}</td>
        </tr>`;
        const pct = (x) => teamTotal ? `${Math.round((x/teamTotal)*100)}%` : '0%';
        const percentFooter = `<tr style="background:#f8fafc;">
            <td colspan="2">% su Tot</td>
            <td>${pct(teamCounts[5])}</td><td>${pct(teamCounts[4])}</td><td>${pct(teamCounts[3])}</td><td>${pct(teamCounts[2])}</td><td>${pct(teamCounts[1])}</td>
            <td>100%</td>
            <td></td><td></td><td></td>
        </tr>`;
        tables[fund] = `<table class="simple-table">${header}${rows}${footer}${percentFooter}</table>`;
    });
    return tables;
}


function initializeApp() {
    try {
        // Rimuovi banner di debug se presente (indica che JS è in esecuzione)
        const debugBanner = document.getElementById('debug-banner');
        if (debugBanner) debugBanner.remove();

        // Fallback: assicura che la sidebar dei set sia popolata
        (function ensureSetSidebarPopulated(){
            try {
                const list = document.getElementById('setToolbar');
                if (!list) return;
                const existing = list.querySelectorAll('.set-item, .set-pill');
                if (existing.length === 0) {
                    const setsCount = (window.appState && window.appState.totalSets) ? Number(window.appState.totalSets) : 6;
                    for (let i = 1; i <= setsCount; i++) {
                        const btn = document.createElement('button');
                        btn.className = 'set-item' + (i === 1 ? ' active' : '');
                        btn.dataset.set = String(i);
                        btn.setAttribute('role','listitem');
                        if (i === 1) btn.setAttribute('aria-current','true');
                        btn.textContent = `Set ${i}`;
                        list.appendChild(btn);
                    }
                }
            } catch(_){ /* noop */ }
        })();

        // Gestione navigazione
        const navButtons = document.querySelectorAll('.nav-btn');
        navButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const page = btn.dataset.page;
                if (page) switchPage(page);
                // Chiudi la sidebar dopo la selezione di una voce (mobile e desktop)
                try {
                    if (typeof window.setSidebarOpen === 'function') {
                        window.setSidebarOpen(false);
                    }
                } catch(_) {}
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
                window.location.replace('matches.html');
            });
            console.log('Event listener aggiunto al pulsante Cambia Squadra');
        }

        // Pulsante Analisi (desktop)
        const analysisBtn = document.getElementById('analysisBtn');
        if (analysisBtn) {
            analysisBtn.addEventListener('click', () => switchPage('analysis'));
        }
        try {
            const rawTeams = localStorage.getItem('volleyTeams');
            const teams = rawTeams ? JSON.parse(rawTeams) : [];
            let changed = false;
            const fixed = teams.map(t => {
                if (!Array.isArray(t.players) || t.players.length === 0) {
                    try {
                        const list = JSON.parse(localStorage.getItem('savedRosters') || '[]');
                        const nameKey = String(t.name||'').toLowerCase();
                        const found = list.find(r => String(r.name||'').toLowerCase() === nameKey);
                        if (found && Array.isArray(found.players) && found.players.length) {
                            changed = true;
                            return { ...t, players: found.players };
                        }
                    } catch(_) {}
                }
                return t;
            });
            if (changed) localStorage.setItem('volleyTeams', JSON.stringify(fixed));
        } catch(_) {}

        // Delegazione click per i pulsanti filtro set (Riepilogo All)
        document.addEventListener('click', (ev) => {
            const t = ev.target;
            if (t && t.matches && t.matches('button[data-set-filter="true"]')) {
                const fund = t.getAttribute('data-fund');
                const set = t.getAttribute('data-set');
                if (fund && set) {
                    if (!appState.allSetFilterByFundamental) appState.allSetFilterByFundamental = {};
                    let selected = appState.allSetFilterByFundamental[fund];
                    if (!Array.isArray(selected)) selected = [selected || 'ALL'];

                    if (set === 'ALL') {
                        selected = ['ALL'];
                    } else {
                        // Rimuovi ALL se presente e toggla il set specifico
                        selected = selected.filter(s => s !== 'ALL');
                        const idx = selected.indexOf(set);
                        if (idx >= 0) {
                            selected.splice(idx, 1);
                        } else {
                            selected.push(set);
                        }
                        // Se nessun set rimane selezionato, ritorna a ALL
                        if (selected.length === 0) selected = ['ALL'];
                    }

                    appState.allSetFilterByFundamental[fund] = selected;
                    try { renderReportRiepilogoAll(); } catch (e) { console.warn('renderReportRiepilogoAll errore:', e); }
                }
            }
        });
    
        // Header mobile overflow menu
        const headerMenuToggle = document.getElementById('headerMenuToggle');
        const headerMenu = document.getElementById('headerMenu');
        const goToMatchesBtnMobile = document.getElementById('goToMatchesBtnMobile');
        const goToTeamsBtnMobile = document.getElementById('goToTeamsBtnMobile');
        const exitToWelcomeBtnMobile = document.getElementById('exitToWelcomeBtnMobile');
        const exportSetsBtnMobile = document.getElementById('exportSetsBtnMobile');
        const signOutBtnMobile = document.getElementById('signOutBtnMobile');
        const saveMatchBtn = document.getElementById('save-match-btn');
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
        // Salva partita (menu voce "Salva") — binding globale
        if (saveMatchBtn) {
            saveMatchBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                    saveMatchBtn.disabled = true;
                    const originalText = saveMatchBtn.textContent;
                    try { saveMatchBtn.textContent = '💾 Salvataggio…'; } catch(_){}
                    cancelAutosave();
                    await saveCurrentMatch();
                    alert('Partita salvata.');
                    try { saveMatchBtn.textContent = originalText || '💾 Salva'; } catch(_){}
                } catch (error) {
                    console.error('Errore nel salvataggio partita:', error);
                    alert('Errore nel salvataggio della partita.');
                } finally {
                    saveMatchBtn.disabled = false;
                    if (headerMenu) headerMenu.setAttribute('hidden', '');
                    if (headerMenuToggle) headerMenuToggle.setAttribute('aria-expanded', 'false');
                }
            });
        }
        if (goToMatchesBtnMobile) {
            goToMatchesBtnMobile.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                    // Salvataggio non bloccante (se fallisce, ignora)
                    try { cancelAutosave(); saveCurrentMatch(); } catch(_){}
                    window.location.href = '/matches.html';
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
                    try { cancelAutosave(); saveCurrentMatch(); } catch(_){}
                    window.location.href = '/my-teams.html';
                } finally {
                    if (headerMenu) headerMenu.setAttribute('hidden', '');
                    if (headerMenuToggle) headerMenuToggle.setAttribute('aria-expanded', 'false');
                }
            });
        }
        // Voce: Esci (torna alla pagina di benvenuto)
        if (exitToWelcomeBtnMobile) {
            exitToWelcomeBtnMobile.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                    try { cancelAutosave(); saveCurrentMatch(); } catch(_){}
                    window.location.href = '/my-teams.html';
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
                    try { cancelAutosave(); await saveCurrentMatch(); } catch(_){ }
                    if (typeof window.exportAllSetsToExcel === 'function') {
                        await window.exportAllSetsToExcel();
                    } else {
                        alert('Funzione di esportazione non disponibile su questa pagina. Apri la pagina principale per esportare.');
                    }
                } finally {
                    if (headerMenu) headerMenu.setAttribute('hidden', '');
                    if (headerMenuToggle) headerMenuToggle.setAttribute('aria-expanded', 'false');
                }
            });
        }
        if (signOutBtnMobile) {
            signOutBtnMobile.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                    try { cancelAutosave(); await saveCurrentMatch(); } catch(_){ }
                    if (typeof window.authFunctions !== 'undefined' && typeof window.authFunctions.signOut === 'function') {
                        await window.authFunctions.signOut();
                    }
                    window.location.href = '/auth-login.html';
                } finally {
                    if (headerMenu) headerMenu.setAttribute('hidden', '');
                    if (headerMenuToggle) headerMenuToggle.setAttribute('aria-expanded', 'false');
                }
            });
        }

        const toggleSetSidebarBtn = document.getElementById('toggleSetSidebar');
        const sidebarMain = document.querySelector('.main.with-sidebar');
        function __getSidebarOpen(){ return !!(sidebarMain && sidebarMain.classList.contains('sidebar-open')); }
        function setSidebarOpen(v){
            if (!sidebarMain) return;
            if (v) sidebarMain.classList.add('sidebar-open'); else sidebarMain.classList.remove('sidebar-open');
            if (toggleSetSidebarBtn) toggleSetSidebarBtn.setAttribute('aria-expanded', v ? 'true' : 'false');
        }
        window.setSidebarOpen = setSidebarOpen;
        if (toggleSetSidebarBtn) {
            toggleSetSidebarBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                setSidebarOpen(!__getSidebarOpen());
            });
        }
        document.addEventListener('click', (e) => {
            const onToggle = !!e.target.closest('#toggleSetSidebar');
            const insideSidebar = !!e.target.closest('.set-sidebar');
            if (__getSidebarOpen() && !onToggle && !insideSidebar) setSidebarOpen(false);
        });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && __getSidebarOpen()) setSidebarOpen(false); });

        try {
            const setList = document.getElementById('setToolbar');
            if (setList) {
                setList.addEventListener('click', (ev) => {
                    const btn = ev.target.closest('.set-item, .set-pill');
                    if (!btn) return;
                    const n = parseInt(btn.dataset.set, 10);
                    if (Number.isInteger(n) && n >= 1 && n <= 6) {
                        try { localStorage.setItem('allowScoutingEntry','1'); } catch(_){}
                        location.href = `scouting.html#/set/${n}`;
                    }
                });
            }
        } catch(_) {}

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

        // Aggiorna colori dei set in sidebar all'avvio
        try { updateSetSidebarColors(); } catch(_) {}

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

        let matchId = sessionData.id;
        if (!matchId) {
            try {
                const sel = localStorage.getItem('selectedMatchId');
                if (sel) matchId = sel;
            } catch(_) {}
            if (!matchId) {
                try { matchId = window.appState?.currentMatch?.id || null; } catch(_) {}
            }
            if (!matchId) {
                console.warn('ID partita mancante, salvataggio ignorato');
                return;
            }
            sessionData.id = matchId;
            try { localStorage.setItem('currentScoutingSession', JSON.stringify(sessionData)); } catch(_) {}
        }

        // Migrazione ID: se esiste selectedMatchId e differisce, allinea la sessione e lo stato
        try {
            const selectedId = localStorage.getItem('selectedMatchId');
            if (selectedId && selectedId !== matchId) {
                matchId = selectedId;
                sessionData.id = selectedId;
                try { if (window.appState?.currentMatch) window.appState.currentMatch.id = selectedId; } catch(_) {}
                try { localStorage.setItem('currentScoutingSession', JSON.stringify(sessionData)); } catch(_) {}
            }
        } catch(_) {}

        const __label = __computeMatchStatusLabel(sessionData);
        const __code = __mapMatchStatusCode(__label);
        const payload = {
            id: matchId,
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
            status: __code,
            statusLabel: __label,
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

        try {
            const userEmail = window.authFunctions?.getCurrentUser?.()?.email || '';
            const userKey = String(userEmail).trim().toLowerCase().replace(/[^a-z0-9]/g,'_');
            if (userKey && (selectedTeamId || currentTeam?.id)) {
                payload.cloudRef = {
                    userKey,
                    teamId: selectedTeamId || currentTeam?.id,
                    matchId: payload.id,
                    path: `users/${userKey}/teams/${selectedTeamId || currentTeam?.id}/matches/${payload.id}`
                };
            }
        } catch(_) {}

        // Notifica inizio salvataggio
        try { window.dispatchEvent(new CustomEvent('save:started')); } catch(_) {}

        // Salvataggio locale
        try {
            const local = JSON.parse(localStorage.getItem('volleyMatches') || '[]');
            const idx = local.findIndex(m => m.id === payload.id);
            if (idx >= 0) local[idx] = payload; else local.unshift(payload);

            // 1) Deduplica PRIMARIA per id partita
            const scoreOf = (m) => {
                try { return Object.keys(m.setStateBySet || {}).length; } catch(_) { return 0; }
            };
            const byId = new Map();
            local.forEach(m => {
                if (!m || !m.id) return;
                const prev = byId.get(m.id);
                if (!prev) { byId.set(m.id, m); return; }
                const prevTs = new Date(prev.updatedAt||prev.createdAt||0).getTime();
                const mTs = new Date(m.updatedAt||m.createdAt||0).getTime();
                const better = (m.id === matchId ? 1 : 0) - (prev.id === matchId ? 1 : 0) || (mTs - prevTs) || (scoreOf(m) - scoreOf(prev));
                if (better > 0) byId.set(m.id, m);
            });
            let merged = Array.from(byId.values());

            // 2) Deduplica SECONDARIA per contenuto se esistono entry senza id coerente
            const keyOf = (m) => {
                const teamIdK = String(m.teamId||'').toLowerCase();
                const my = String(m.myTeam || m.teamName || '').toLowerCase();
                const opp = String(m.opponentTeam || m.opponent || '').toLowerCase();
                const date = String(m.matchDate || m.date || '').slice(0,10);
                const type = String(m.matchType || m.eventType || m.type || '').toLowerCase();
                const ha = String(m.homeAway || m.location || '').toLowerCase();
                return [teamIdK,my,opp,date,type,ha].join('|');
            };
            const byContent = new Map();
            merged.forEach(m => {
                const k = keyOf(m);
                const prev = byContent.get(k);
                if (!prev) { byContent.set(k, m); return; }
                const prevTs = new Date(prev.updatedAt||prev.createdAt||0).getTime();
                const mTs = new Date(m.updatedAt||m.createdAt||0).getTime();
                const better = (m.id === matchId ? 1 : 0) - (prev.id === matchId ? 1 : 0) || (mTs - prevTs) || (scoreOf(m) - scoreOf(prev));
                if (better > 0) byContent.set(k, m);
            });
            const deduped = Array.from(byContent.values());
            localStorage.setItem('volleyMatches', JSON.stringify(deduped));
        } catch (e) { console.warn('Salvataggio locale non riuscito:', e); }

        // Salvataggio su Firestore (se disponibile)
        try {
            if (window.authFunctions?.getCurrentUser && window.firestoreService?.saveMatchTree) {
                const user = window.authFunctions.getCurrentUser();
                if (user) {
                    const teamId = selectedTeamId || currentTeam?.id || null;
                    if (teamId) {
                        await window.firestoreService.saveMatchTree(teamId, payload);
                    }
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

        // Abilita il pulsante "Carica Roster" solo se la funzione esiste
        if (typeof setLoadRosterEnabled === 'function') {
            setLoadRosterEnabled(true);
        }
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

// Normalizza numero maglia in forma canonica senza zeri iniziali
function normalizeNumberStr(v) {
    const s = String(v ?? '').trim();
    if (!s) return '';
    const n = Number(s);
    return Number.isFinite(n) ? String(n) : s;
}

// Formatta il numero maglia per la visualizzazione in due cifre (01, 07, 12)
function formatJersey(n) {
    const s = normalizeNumberStr(n);
    return s ? s.padStart(2, '0') : '';
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
            <input type='text' class='input' placeholder='Nickname' maxlength='6' data-field='nickname' data-index='${i}' />
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
                } else {
                    try {
                        const selId = localStorage.getItem('selectedTeamId');
                        let teamName = '';
                        if (selId && window.teamsModule && typeof window.teamsModule.getTeamById === 'function') {
                            const tm = window.teamsModule.getTeamById(selId);
                            teamName = tm && tm.name ? tm.name : '';
                        }
                        const list = JSON.parse(localStorage.getItem('savedRosters') || '[]');
                        const key = String(teamName||'').toLowerCase();
                        const found = list.find(r => String(r.name||'').toLowerCase() === key);
                        if (found && Array.isArray(found.players) && found.players.length) {
                            appState.currentRoster = found.players;
                        }
                    } catch(_) {}
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

// Ricalcolo completo di punteggio, fase e rotazione partendo dalle azioni loggate
function recomputeFromActionsLog() {
    try {
        // Esegui comunque il ricalcolo: se ci sono azioni o metadati di set, ricostruisci lo stato.
        const actions = Array.isArray(appState.actionsLog) ? appState.actionsLog : [];
        const setNumber = (typeof appState.currentSet === 'number' && appState.currentSet > 0) ? appState.currentSet : 1;
        console.info('Ricalcolo azioni', { setNumber, count: actions.length });
        // Se il flag non è impostato, attivalo quando ci sono azioni (copre riprese di sessione e cancellazioni)
        if (!appState.setStarted && actions.length > 0) {
            appState.setStarted = true;
        }

        // Recupera meta iniziali del set (rotazione/fase) da sessione se disponibili
        let rotation = appState.currentRotation;
        let phase = appState.currentPhase;
        let opponentRotation = null;
        try {
            const sessionData = JSON.parse(localStorage.getItem('currentScoutingSession') || '{}');
            const cfg = sessionData.setConfig || {};
            const sm = sessionData.setMeta && sessionData.setMeta[setNumber];
            if (sm && sm.ourRotation) rotation = String(sm.ourRotation).startsWith('P') ? sm.ourRotation : `P${sm.ourRotation}`;
            else if (cfg.ourRotation) rotation = String(cfg.ourRotation).startsWith('P') ? cfg.ourRotation : `P${cfg.ourRotation}`;
            if (sm && sm.phase) phase = sm.phase; else if (cfg.phase) phase = cfg.phase;
            if (sm && sm.opponentRotation) opponentRotation = sm.opponentRotation;
        } catch(_) {}

        // Reset stato base del set
        appState.homeScore = 0;
        appState.awayScore = 0;
        appState.currentRotation = normalizeRotation(rotation);
        appState.currentPhase = phase;
        appState.rallyStartPhase = appState.currentPhase;

        // Inizializza storico punteggio
        const phaseLabel = (phase === 'ricezione') ? 'Ricezione' : 'Servizio';
        const oppRotLabel = (typeof opponentRotation === 'string' && opponentRotation)
            ? (String(opponentRotation).startsWith('P') ? opponentRotation : `P${opponentRotation}`)
            : null;
        const descr = oppRotLabel
            ? `Set ${setNumber} - ${phaseLabel} ${appState.currentRotation} Vs ${oppRotLabel}`
            : `Set ${setNumber} - ${phaseLabel} ${appState.currentRotation}`;
        appState.scoreHistory = [{ homeScore: 0, awayScore: 0, description: descr, type: 'initial' }];

        // Rigioca tutte le azioni per ricalcolare completamente stato e rotazione
        for (let i = 0; i < actions.length; i++) {
            const log = actions[i];
            const rotationBefore = normalizeRotation(appState.currentRotation);
            try {
                const actionStr = String(log.action || '');
                const parsed = parseAction(actionStr);

                // Prova a ricostruire nome giocatore e tipo azione
                const fromLogName = log && log.result && typeof log.result.playerName === 'string' ? log.result.playerName : null;
                const fromLogType = log && log.result && typeof log.result.actionType === 'string' ? log.result.actionType : null;

                function playerNameFromNumber(num){
                    try {
                        const roster = Array.isArray(appState.currentRoster) ? appState.currentRoster : [];
                        const found = roster.find(p => String(p.number).padStart(2,'0') === String(num).padStart(2,'0'));
                        if (!found) return `Giocatore ${num}`;
                        const name = found.nickname || `${found.name || ''} ${found.surname || ''}`.trim();
                        return name || `Giocatore ${num}`;
                    } catch(_) {
                        return `Giocatore ${num}`;
                    }
                }

                let computedName = 'Azione editata';
                let computedType = (parsed.result === 'home_point' || parsed.result === 'away_point') ? 'Punto' : 'Azione';

                // Se il log originale porta già meta, usali
                if (fromLogName) computedName = fromLogName;
                if (fromLogType) computedType = fromLogType;
                // Altrimenti inferisci dal contenuto della stringa di azione
                if (!fromLogName || !fromLogType){
                    const hasAvv = actionStr.split(' ').some(t => t === 'avv');
                    const last = (parsed.actions && parsed.actions.length > 0) ? parsed.actions[parsed.actions.length - 1] : null;
                    if (parsed.result === 'home_point'){
                        if (hasAvv){
                            computedName = 'Avversario';
                            computedType = 'Errore';
                        } else if (last){
                            computedName = playerNameFromNumber(last.player);
                            computedType = 'Punto';
                        }
                    } else if (parsed.result === 'away_point'){
                        if (last){
                            computedName = playerNameFromNumber(last.player);
                            computedType = 'Errore';
                        }
                    }
                }

                const result = {
                    actions: parsed.actions,
                    result: parsed.result,
                    playerName: computedName,
                    actionType: computedType
                };
                log.rotation = rotationBefore;
                log.phase = appState.rallyStartPhase;
                processActionResult(result);
                log.score = String(appState.homeScore||0) + '-' + String(appState.awayScore||0);
            } catch (e) {
                console.warn('Errore di parsing nel ricalcolo azione', i + 1, e);
            }
        }

        // Aggiorna UI coerente
        updateMatchInfo();
        updateScoutingUI();
        updateActionsLog();
        updateCurrentPhaseDisplay();
        updateNextFundamental();
        updateScoreHistoryDisplay();
        scheduleAutosave(600);
    } catch (err) {
        console.error('Errore nel ricalcolo da actionsLog:', err);
    }
}

// Esponi la funzione per uso da altri script
window.recomputeFromActionsLog = recomputeFromActionsLog;

// Re-inizializza il set corrente: pulizia stato, UI e persistenza
function resetCurrentSet() {
    const setNum = (typeof appState.currentSet === 'number' && appState.currentSet > 0) ? appState.currentSet : 1;

    // 1) Stato base
    appState.homeScore = 0;
    appState.awayScore = 0;
    appState.currentPhase = '';
    appState.currentRotation = '';
    appState.rallyStartPhase = '';
    appState.actionsLog = [];
    appState.currentSequence = [];
    appState.selectedPlayer = null;
    appState.selectedEvaluation = null;
    appState.overrideFundamental = null;
    appState.calculatedFundamental = null;
    appState.nextFundamentalPreview = null;
    appState.justClosedAction = false;
    appState.setStarted = false;

    // 2) Inizializza storico punteggio (visualizzazione di inizio set)
    appState.scoreHistory = [{
        homeScore: 0,
        awayScore: 0,
        description: `Set ${setNum} - Inizio set`,
        type: 'initial'
    }];

    // 3) Persistenza per-set: svuota dati del set corrente
    try {
        const sessionData = JSON.parse(localStorage.getItem('currentScoutingSession') || '{}');
        // Assicurati delle strutture
        sessionData.actionsBySet = sessionData.actionsBySet || {};
        sessionData.scoreHistoryBySet = sessionData.scoreHistoryBySet || {};
        sessionData.setStateBySet = sessionData.setStateBySet || {};
        // Aggiorna con stato vuoto
        sessionData.actionsBySet[setNum] = [];
        sessionData.scoreHistoryBySet[setNum] = appState.scoreHistory;
        sessionData.setStateBySet[setNum] = {
            homeScore: 0,
            awayScore: 0,
            currentPhase: '',
            currentRotation: ''
        };
        localStorage.setItem('currentScoutingSession', JSON.stringify(sessionData));
    } catch(e) {
        console.warn('Persistenza reset set non riuscita:', e);
    }

    // 4) Aggiorna UI
    updateMatchInfo();
    updateScoutingUI();
    updateActionsLog();
    updateCurrentPhaseDisplay();
    updateNextFundamental();
    updateScoreHistoryDisplay();

    // 5) Avvia verifica set configurazione (apri dialog meta set, se disponibile)
    try {
        if (typeof window.openSetMetaDialog === 'function') {
            window.openSetMetaDialog(setNum);
        }
    } catch(_) {}
}

// Esponi utility di reset
window.resetCurrentSet = resetCurrentSet;

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

    // Long-press su "SERVIZIO" per resettare il set corrente
    const curFund = document.getElementById('current-fundamental');
    if (curFund) {
        try {
            addLongPressListener(curFund, 2000, () => {
                const ok = confirm('Resettare set?');
                if (!ok) return;
                try { resetCurrentSet(); } catch (e) { console.warn('Reset set fallito:', e); }
            });
        } catch(_) {}
    }
    
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
            role: (function(r){
                const s = String(r||'').trim().toUpperCase();
                if (s === 'P' || s.startsWith('PAL')) return 'Palleggiatore';
                if (s === 'O' || s.startsWith('OPP')) return 'Opposto';
                if (s === 'S' || s.startsWith('SCH')) return 'Schiacciatore';
                if (s === 'M' || s.startsWith('MAR')) return 'Schiacciatore';
                if (s === 'C' || s.startsWith('CEN')) return 'Centrale';
                if (s === 'L' || s.startsWith('LIB')) return 'Libero';
                return '';
            })(p.role)
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

    container.querySelectorAll('.opponent-error-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            submitOpponentError();
        });
    });
    container.querySelectorAll('.muro-override-btn').forEach(btn => {
        const isFirstQuartet = !(appState.currentSequence && appState.currentSequence.length);
        const nextFundamental = appState.calculatedFundamental || predictNextFundamental();
        const shouldDisable = isFirstQuartet && (nextFundamental === 'b' || nextFundamental === 'r');
        if (shouldDisable) {
            try { btn.setAttribute('disabled', 'true'); } catch(_){ }
            try { btn.classList.add('disabled'); } catch(_){ }
            try { btn.title = 'Muro non disponibile all\'inizio'; } catch(_){ }
            btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
        } else {
            btn.addEventListener('click', () => { activateMuroOverride(); });
        }
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
                    guided: true,
                    rotation: normalizeRotation(appState.currentRotation)
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
    // Memorizza la fase d'inizio rally alla prima selezione della sequenza
    if (appState.currentSequence.length === 0) {
        appState.rallyStartPhase = appState.currentPhase;
    }

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
    if (!appState.currentSequence || appState.currentSequence.length === 0) {
        const f0 = String(fundamental).toLowerCase();
        if (f0 !== 'b' && f0 !== 'r') {
            window.__quartetStartAction = function(val){
                if (val === 'avv') { try { submitOpponentError(); } catch(_) {} return; }
                try {
                    appState.overrideFundamental = val;
                    appState.calculatedFundamental = val;
                    const evaluation = appState.selectedEvaluation;
                    const quartet = `${appState.selectedPlayer.number.padStart(2, '0')}${val}${evaluation}`;
                    appState.currentSequence.push({quartet, playerName: appState.selectedPlayer.name});
                    updateActionSummary();
                    const tempResult = determineFinalResult(val, evaluation);
                    const closes = tempResult === 'home_point' || tempResult === 'away_point';
                    if (closes) {
                        const actionString = appState.currentSequence.map(s => s.quartet).join(' ');
                        const result = parseAction(actionString);
                        result.playerName = appState.selectedPlayer.name;
                        result.actionType = appState.selectedEvaluation === 5 ? 'Punto' : 'Errore';
                        processActionResult(result);
                        appState.actionsLog.push({
                            action: actionString,
                            result: result,
                            score: `${appState.homeScore}-${appState.awayScore}`,
                            guided: true,
                            rotation: normalizeRotation(appState.currentRotation)
                        });
                        appState.currentSequence = [];
                        updateActionSummary();
                        const selectedPlayerText = document.getElementById('selected-player-text');
                        const selectedEvaluationText = document.getElementById('selected-evaluation-text');
                        if (selectedPlayerText) { selectedPlayerText.textContent = '-'; }
                        if (selectedEvaluationText) { selectedEvaluationText.textContent = '-'; }
                        appState.justClosedAction = true;
                        appState.nextFundamentalPreview = null;
                        updateDescriptiveQuartet();
                    }
                    updateScoutingUI();
                    updateActionsLog();
                    updateNextFundamental();
                    updatePlayersGrid();
                    showScoutingStep('step-player');
                    appState.selectedPlayer = null;
                    appState.selectedEvaluation = null;
                    appState.overrideFundamental = null;
                    appState.calculatedFundamental = null;
                    if (closes) checkSetEnd();
                } catch (error) {
                    alert(`Errore nell'azione: ${error.message}`);
                    appState.currentSequence.pop();
                }
            };
            try { if (typeof window.openQuartetStartDialog === 'function') window.openQuartetStartDialog(); } catch(_) {}
            return;
        }
    }
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
                guided: true,
                rotation: normalizeRotation(appState.currentRotation)
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
                    guided: true,
                    rotation: normalizeRotation(appState.currentRotation)
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

    const total = appState.actionsLog.length;
    const baseIndexStart = Math.max(total - 9, 0);
    let lastLogs = appState.actionsLog.slice(-9);
    let displayLogs = lastLogs.map((log, idx) => ({ log, rowNumber: baseIndexStart + idx + 1 })).reverse();

    if (appState.currentSequence.length > 0) {
        const currentString = appState.currentSequence.map(s => s.quartet).join(' ');
        displayLogs.unshift({
            log: {
                timestamp: 'Corrente',
                action: currentString,
                result: {result: 'continue'},
                guided: true,
                rotation: normalizeRotation(appState.currentRotation)
            },
            rowNumber: 'Corr.'
        });
    }

    if (displayLogs.length === 0) {
        container.innerHTML = '<p style="color: #666;">Nessuna azione registrata</p>';
        return;
    }

    container.innerHTML = displayLogs.map(entry => {
        const log = entry.log;
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
        const rotText = log.rotation ? ` ${log.rotation}` : '';
        const rowLabel = typeof entry.rowNumber === 'number' ? `${entry.rowNumber})` : `${entry.rowNumber})`;

        return `
            <div class="action-entry ${log.guided ? 'guided-action' : ''}">
                <strong>${rowLabel}${rotText}</strong> ${actionDisplay}
                <div class="action-result">${resultText} <span style="color:#666; margin-left:8px;">${log.timestamp || ''}</span></div>
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
    appState.currentRotation = normalizeRotation(rotation);
    appState.currentPhase = phase;
    // Imposta la fase di inizio del rally per il primo cambio rotazione
    appState.rallyStartPhase = appState.currentPhase;
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
            if (st.currentRotation) appState.currentRotation = normalizeRotation(st.currentRotation);
            // Prepara la fase di inizio del prossimo rally dopo ripristino
            appState.rallyStartPhase = appState.currentPhase;
            appState.setStarted = true;
            restored = true;
        }
    } catch(_) {}

    if (!restored) {
        appState.homeScore = 0;
        appState.awayScore = 0;
        appState.actionsLog = [];
        // Azzera la progressione/sequenza dell'azione corrente
        appState.currentSequence = [];
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

    try {
        const hasActions = Array.isArray(appState.actionsLog) && appState.actionsLog.length > 0;
        const hasHistory = Array.isArray(appState.scoreHistory) && appState.scoreHistory.length > 1;
        if (hasActions && !hasHistory) {
            recomputeFromActionsLog();
        }
    } catch(_) {}
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
    if (rotationEl) rotationEl.textContent = normalizeRotation(appState.currentRotation);
    
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
        const m = actionString.match(/^\s*(avv|\d{2}[bramdBRAMD]\d)/);
        if (m) {
            const token = m[1] || m[0];
            if (!/^avv$/i.test(token)) {
                const f0 = token.charAt(2).toLowerCase();
                if (appState.currentSequence && appState.currentSequence.length === 0 && f0 !== 'b' && f0 !== 'r') {
                    window.__quartetStartAction = function(val){
                        if (val === 'avv') { try { submitOpponentError(); } catch(_) {} return; }
                        const fixedFirst = token.substring(0,2) + val + token.charAt(3);
                        let fixedAction = '';
                        if (actionString.includes(' ')) {
                            const parts = actionString.trim().split(/\s+/);
                            parts[0] = fixedFirst;
                            fixedAction = parts.join(' ');
                        } else {
                            fixedAction = fixedFirst + actionString.slice(token.length);
                        }
                        try {
                            const result = parseAction(fixedAction);
                            result.playerName = 'Azione manuale';
                            result.actionType = result.result === 'home_point' || result.result === 'away_point' ? 'Punto' : 'Azione';
                            processActionResult(result);
                            appState.actionsLog.push({
                                action: fixedAction,
                                result: result,
                                timestamp: new Date().toLocaleTimeString('it-IT'),
                                rotation: normalizeRotation(appState.currentRotation)
                            });
                            updateScoutingUI();
                            updateActionsLog();
                            if (inputEl) inputEl.value = '';
                            checkSetEnd();
                        } catch (error) {
                            alert(`Errore nella stringa: ${error.message}`);
                        }
                    };
                    try { if (typeof window.openQuartetStartDialog === 'function') window.openQuartetStartDialog(); } catch(_) {}
                    return;
                }
            }
        }
    } catch(_) {}
    
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
            timestamp: new Date().toLocaleTimeString('it-IT'),
            rotation: normalizeRotation(appState.currentRotation)
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
    const raw = String(actionString || '').trim();
    const tokens = [];
    if (!raw) return { actions: [], result: 'continue' };

    if (raw.includes(' ')) {
        raw.split(' ').forEach(t => { const s = t.trim(); if (s) tokens.push(s); });
    } else {
        let i = 0;
        while (i < raw.length) {
            const rest = raw.slice(i);
            if (/^avv/i.test(rest)) { tokens.push('avv'); i += 3; continue; }
            const m = rest.match(/^\d{2}[bramdBRAMD]\d/);
            if (m) { tokens.push(m[0]); i += m[0].length; continue; }
            break;
        }
    }

    const actions = [];
    let finalResult = 'continue';
    for (let idx = 0; idx < tokens.length; idx++) {
        const part = tokens[idx];
        if (/^avv$/i.test(part)) { finalResult = 'home_point'; continue; }
        if (part.length >= 4) {
            const playerNumber = part.substring(0, 2);
            const fundamental = part.charAt(2).toLowerCase();
            const evaluation = parseInt(part.charAt(3), 10);
            if (isNaN(evaluation) || evaluation < 1 || evaluation > 5) throw new Error('Valutazione non valida');
            actions.push({ player: playerNumber, fundamental, evaluation });
            const isLastQuartet = (idx === tokens.length - 1) || (idx === tokens.length - 2 && /^avv$/i.test(tokens[tokens.length - 1]));
            if (isLastQuartet) finalResult = determineFinalResult(fundamental, evaluation);
        }
    }

    return { actions, result: finalResult };
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
    // Usa la fase di INIZIO RALLY per determinare rotazione al primo cambio
    const startedInReception = (appState.rallyStartPhase === 'ricezione');
    if (result.result === 'home_point') {
        appState.homeScore++;
        
        // Aggiungi al storico punteggio
        addToScoreHistory('home', result.playerName, result.actionType);
        
        // Il punto nostro porta sempre a SERVIZIO
        // La rotazione avanza SOLO se il rally era iniziato in RICEZIONE
        appState.currentPhase = 'servizio';
        if (startedInReception) rotateTeam();
    } else if (result.result === 'away_point') {
        appState.awayScore++;
        
        // Aggiungi al storico punteggio
        addToScoreHistory('away', result.playerName, result.actionType);
        
        // Punto avversario → si va in RICEZIONE, senza cambiare rotazione
        appState.currentPhase = 'ricezione';
    }
    
    // Imposta la fase di inizio del prossimo rally
    appState.rallyStartPhase = appState.currentPhase;

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
    
    reversedHistory.forEach((item, idx) => {
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
            
            // Long-press sulla riga più recente (idx === 0) per eliminare l'ultima azione
            if (idx === 0) {
                addLongPressListener(historyElement, 1000, () => {
                    try {
                        if (!Array.isArray(appState.actionsLog) || appState.actionsLog.length === 0) return;
                        const ok = confirm('Eliminare questa riga?');
                        if (!ok) return;
                        // Rimuove l'ultima azione scoutizzata e ricalcola tutto
                        appState.actionsLog.pop();
                        recomputeFromActionsLog();
                        scheduleAutosave(600);
                    } catch (e) {
                        console.warn('Eliminazione ultima riga fallita:', e);
                    }
                });
            }
        }
        
        historyContainer.appendChild(historyElement);
    });

    // Aggiorna i colori dei pulsanti set in sidebar in base allo stato
    try { if (typeof updateSetSidebarColors === 'function') updateSetSidebarColors(); } catch(_) {}
}

// Utilità: listener per long-press
function addLongPressListener(el, holdMs, onTrigger) {
    let timerId = null;
    const start = () => {
        if (timerId) clearTimeout(timerId);
        timerId = setTimeout(() => {
            timerId = null;
            try { onTrigger(); } catch(_) {}
        }, holdMs || 1000);
        // Effetto visivo leggero
        el.style.opacity = '0.85';
    };
    const cancel = () => {
        if (timerId) { clearTimeout(timerId); timerId = null; }
        el.style.opacity = '';
    };
    el.addEventListener('mousedown', start);
    el.addEventListener('touchstart', start, { passive: true });
    ['mouseup','mouseleave','touchend','touchcancel'].forEach(evt => el.addEventListener(evt, cancel));
}

window.openActionsDialog = function(){
    try {
        var dlg = document.getElementById('actions-dialog');
        var logs = Array.isArray(appState.actionsLog) ? appState.actionsLog : [];
        if (!dlg) {
            dlg = document.createElement('div');
            dlg.id = 'actions-dialog';
            dlg.className = 'dialog is-open';
            dlg.style.position = 'fixed';
            dlg.style.inset = '0';
            dlg.style.background = 'rgba(0,0,0,0.35)';
            dlg.style.zIndex = '1002';
            dlg.style.display = 'flex';
            dlg.style.alignItems = 'center';
            dlg.style.justifyContent = 'center';
            var panel = document.createElement('div');
            panel.className = 'dialog-panel';
            panel.style.maxWidth = '640px';
            panel.style.width = 'min(640px, calc(100% - 16px))';
            panel.style.margin = '0 12px';
            panel.style.background = '#fff';
            panel.style.borderRadius = '12px';
            panel.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)';
            panel.style.display = 'flex';
            panel.style.flexDirection = 'column';
            panel.style.maxHeight = '80vh';
            panel.style.overflow = 'hidden';
            var header = document.createElement('div');
            header.className = 'dialog-header';
            header.style.display = 'flex';
            header.style.alignItems = 'center';
            header.style.justifyContent = 'space-between';
            header.style.padding = '12px 16px';
            header.style.position = 'sticky';
            header.style.top = '0';
            header.style.background = '#fff';
            header.style.zIndex = '1';
            var title = document.createElement('div');
            title.style.display = 'flex';
            title.style.alignItems = 'center';
            title.style.gap = '8px';
            var h3 = document.createElement('h3');
            h3.textContent = 'Progr. Azioni';
            h3.style.margin = '0';
            var total = document.createElement('span');
            total.id = 'actions-total';
            total.style.color = '#64748b';
            title.appendChild(h3);
            title.appendChild(total);
            var close = document.createElement('button');
            close.type = 'button';
            close.textContent = 'Chiudi';
            close.className = '';
            close.addEventListener('click', function(){ try{ dlg.remove(); document.body.style.overflow=''; }catch(_){} });
            try{ close.style.background='#fff'; close.style.color='#0d6efd'; close.style.border='1px solid #0d6efd'; close.style.borderRadius='10px'; close.style.padding='6px 10px'; close.style.fontWeight='600'; }catch(_){}
            header.appendChild(title);
            header.appendChild(close);
            var body = document.createElement('div');
            body.className = 'dialog-body';
            body.style.padding = '8px 12px';
            body.style.flex = '1 1 auto';
            body.style.overflowY = 'auto';
            var list = document.createElement('div');
            list.id = 'actions-list-container';
            list.style.minHeight = '0';
            body.appendChild(list);
            var footer = document.createElement('div');
            footer.className = 'dialog-footer';
            footer.style.display = 'flex';
            footer.style.flexWrap = 'wrap';
            footer.style.justifyContent = 'flex-end';
            footer.style.gap = '8px';
            footer.style.padding = '10px 12px';
            footer.style.position = 'sticky';
            footer.style.bottom = '0';
            footer.style.background = '#fff';
            var cancelBtn = document.createElement('button');
            cancelBtn.className = '';
            cancelBtn.textContent = 'Annulla';
            cancelBtn.addEventListener('click', function(){ try{ dlg.remove(); }catch(_){} });
            try{ cancelBtn.style.background='#fff'; cancelBtn.style.color='#0d6efd'; cancelBtn.style.border='1px solid #0d6efd'; cancelBtn.style.borderRadius='10px'; cancelBtn.style.padding='6px 10px'; cancelBtn.style.fontWeight='600'; }catch(_){}
            var saveBtn = document.createElement('button');
            saveBtn.className = '';
            saveBtn.textContent = 'Salva';
            saveBtn.addEventListener('click', function(){ try{ recomputeFromActionsLog(); dlg.remove(); }catch(_){} });
            try{ saveBtn.style.background='#fff'; saveBtn.style.color='#0d6efd'; saveBtn.style.border='1px solid #0d6efd'; saveBtn.style.borderRadius='10px'; saveBtn.style.padding='6px 10px'; saveBtn.style.fontWeight='600'; }catch(_){}
            footer.appendChild(cancelBtn);
            footer.appendChild(saveBtn);
            panel.appendChild(header);
            panel.appendChild(body);
            panel.appendChild(footer);
            dlg.appendChild(panel);
            dlg.addEventListener('click', function(e){ if (e.target === dlg) { try{ dlg.remove(); document.body.style.overflow=''; }catch(_){} } });
            document.addEventListener('keydown', function onKey(e){ if (e.key === 'Escape'){ try{ dlg.remove(); document.body.style.overflow=''; }catch(_){} document.removeEventListener('keydown', onKey); } });
            document.body.appendChild(dlg);
            try{ document.body.style.overflow='hidden'; }catch(_){ }
        }
        var totalEl = document.getElementById('actions-total');
        if (totalEl) totalEl.textContent = 'Totale azioni: ' + String(logs.length);
        var container = document.getElementById('actions-list-container');
        if (container) {
            container.innerHTML = '';
            if (!logs.length) {
                var empty = document.createElement('div');
                empty.style.padding = '8px';
                empty.textContent = 'Nessuna azione';
                container.appendChild(empty);
            } else {
                logs.forEach(function(item, idx){
                    var card = document.createElement('div');
                    card.style.display = 'grid';
                    card.style.gridTemplateColumns = 'max-content 1fr max-content';
                    card.style.alignItems = 'center';
                    card.style.gap = '8px';
                    card.style.border = '1px solid #e9ecef';
                    card.style.borderRadius = '10px';
                    card.style.padding = '8px 10px';
                    card.style.marginBottom = '8px';
                    card.style.cursor = 'pointer';
                    var meta = document.createElement('div');
                    var score = String(item.score || '0-0');
                    var phase = String(item.phase || appState.currentPhase || '');
                    var rot = String(item.rotation || '');
                    var phaseAbbr = (phase === 'servizio') ? 'S' : (phase === 'ricezione' ? 'R' : phase);
                    meta.textContent = score + ' • ' + phaseAbbr + ' ' + rot;
                    meta.style.fontWeight = '600';
                    meta.style.color = '#0d6efd';
                    var actionText = document.createElement('div');
                    actionText.textContent = String(item.action || '');
                    actionText.style.fontFamily = 'monospace';
                    actionText.style.whiteSpace = 'nowrap';
                    actionText.style.overflowX = 'auto';
                    actionText.style.display = 'block';
                    actionText.style.width = '100%';
                    var actions = document.createElement('div');
                    actions.style.display = 'flex';
                    actions.style.gap = '8px';
                    var editBtn = document.createElement('button');
                    editBtn.type = 'button';
                    editBtn.className = '';
                    editBtn.textContent = '✎';
                    editBtn.addEventListener('click', function(ev){ ev.stopPropagation(); window.openActionEditor(idx); });
                    try{
                        editBtn.style.background='transparent';
                        editBtn.style.color='#0d6efd';
                        editBtn.style.border='none';
                        editBtn.style.borderRadius='999px';
                        editBtn.style.padding='4px 8px';
                        editBtn.style.fontWeight='600';
                        editBtn.style.minWidth='40px';
                        editBtn.style.display='inline-flex';
                        editBtn.style.alignItems='center';
                        editBtn.style.justifyContent='center';
                        editBtn.style.outline='none';
                        editBtn.style.boxShadow='none';
                        editBtn.style.webkitAppearance='none';
                        editBtn.style.MozAppearance='none';
                        editBtn.style.appearance='none';
                    }catch(_){ }
                    var delBtn = document.createElement('button');
                    delBtn.type = 'button';
                    delBtn.className = '';
                    delBtn.textContent = '🗑';
                    delBtn.addEventListener('click', function(ev){ ev.stopPropagation(); try { appState.actionsLog.splice(idx, 1); recomputeFromActionsLog(); openActionsDialog(); } catch(_){} });
                    try{
                        delBtn.style.background='transparent';
                        delBtn.style.color='#0d6efd';
                        delBtn.style.border='none';
                        delBtn.style.borderRadius='999px';
                        delBtn.style.padding='4px 8px';
                        delBtn.style.fontWeight='600';
                        delBtn.style.minWidth='40px';
                        delBtn.style.display='inline-flex';
                        delBtn.style.alignItems='center';
                        delBtn.style.justifyContent='center';
                        delBtn.style.outline='none';
                        delBtn.style.boxShadow='none';
                        delBtn.style.webkitAppearance='none';
                        delBtn.style.MozAppearance='none';
                        delBtn.style.appearance='none';
                    }catch(_){ }
                    actions.appendChild(editBtn);
                    actions.appendChild(delBtn);
                    card.appendChild(meta);
                    card.appendChild(actionText);
                    card.appendChild(actions);
                    card.addEventListener('click', function(){ window.openActionViewer(idx); });
                    container.appendChild(card);
                });
            }
        }
    } catch(_) {}
};

window.openActionViewer = function(index){
    try {
        var logs = Array.isArray(appState.actionsLog) ? appState.actionsLog : [];
        var item = logs[index] || {};
        var dlg = document.getElementById('action-viewer-dialog');
        if (!dlg) {
            dlg = document.createElement('div');
            dlg.id = 'action-viewer-dialog';
            dlg.className = 'dialog is-open';
            dlg.style.position = 'fixed';
            dlg.style.inset = '0';
            dlg.style.background = 'rgba(0,0,0,0.35)';
            dlg.style.zIndex = '1003';
            dlg.style.display = 'flex';
            dlg.style.alignItems = 'center';
            dlg.style.justifyContent = 'center';
            dlg.style.display = 'flex';
            dlg.style.alignItems = 'center';
            dlg.style.justifyContent = 'center';
            var panel = document.createElement('div');
            panel.className = 'dialog-panel';
            panel.style.maxWidth = '700px';
            panel.style.width = 'min(700px, calc(100% - 16px))';
            panel.style.margin = '0 12px';
            panel.style.background = '#fff';
            panel.style.borderRadius = '12px';
            panel.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)';
            panel.style.display = 'flex';
            panel.style.flexDirection = 'column';
            panel.style.maxHeight = '80vh';
            panel.style.overflow = 'hidden';
            var header = document.createElement('div');
            header.className = 'dialog-header';
            header.style.display = 'flex';
            header.style.alignItems = 'center';
            header.style.justifyContent = 'space-between';
            header.style.padding = '12px 16px';
            header.style.position = 'sticky';
            header.style.top = '0';
            header.style.background = '#fff';
            header.style.zIndex = '1';
            var h3 = document.createElement('h3');
            h3.textContent = 'Dettaglio Azione';
            h3.style.margin = '0';
            var close = document.createElement('button');
            close.type = 'button';
            close.textContent = 'Chiudi';
            close.addEventListener('click', function(){ try{ dlg.remove(); document.body.style.overflow=''; }catch(_){} });
            try{ close.style.background='#fff'; close.style.color='#0d6efd'; close.style.border='1px solid #0d6efd'; close.style.borderRadius='10px'; close.style.padding='6px 10px'; close.style.fontWeight='600'; }catch(_){}
            header.appendChild(h3);
            header.appendChild(close);
            var body = document.createElement('div');
            body.className = 'dialog-body';
            body.style.padding = '12px 16px';
            body.style.flex = '1 1 auto';
            body.style.overflowX = 'auto';
            body.style.whiteSpace = 'nowrap';
            var meta = document.createElement('div');
            var score = String(item.score || '0-0');
            var phase = String(item.phase || appState.currentPhase || '');
            var rot = String(item.rotation || '');
            var phaseAbbr = (phase === 'servizio') ? 'S' : (phase === 'ricezione' ? 'R' : phase);
            meta.textContent = score + ' • ' + phaseAbbr + ' ' + rot + '  '; // extra spacing before action
            meta.style.fontWeight = '700';
            meta.style.color = '#0d6efd';
            var action = document.createElement('span');
            action.textContent = String(item.action || '');
            action.style.fontFamily = 'monospace';
            action.style.whiteSpace = 'nowrap';
            body.appendChild(meta);
            body.appendChild(action);
            var footer = document.createElement('div');
            footer.className = 'dialog-footer';
            footer.style.display = 'flex';
            footer.style.justifyContent = 'flex-end';
            footer.style.gap = '8px';
            footer.style.padding = '10px 12px';
            footer.style.position = 'sticky';
            footer.style.bottom = '0';
            footer.style.background = '#fff';
            var close2 = document.createElement('button');
            close2.type = 'button';
            close2.textContent = 'Chiudi';
            close2.addEventListener('click', function(){ try{ dlg.remove(); }catch(_){} });
            try{ close2.style.background='#fff'; close2.style.color='#0d6efd'; close2.style.border='1px solid #0d6efd'; close2.style.borderRadius='10px'; close2.style.padding='6px 10px'; close2.style.fontWeight='600'; }catch(_){}
            footer.appendChild(close2);
            panel.appendChild(header);
            panel.appendChild(body);
            panel.appendChild(footer);
            dlg.appendChild(panel);
            dlg.addEventListener('click', function(e){ if (e.target === dlg) { try{ dlg.remove(); document.body.style.overflow=''; }catch(_){} } });
            document.addEventListener('keydown', function onKey(e){ if (e.key === 'Escape'){ try{ dlg.remove(); document.body.style.overflow=''; }catch(_){} document.removeEventListener('keydown', onKey); } });
            document.body.appendChild(dlg);
            try{ document.body.style.overflow='hidden'; }catch(_){ }
        } else {
            // if dialog exists, just update contents
            var body = dlg.querySelector('.dialog-body');
            if (body) {
                body.innerHTML = '';
                body.style.overflowX = 'auto';
                body.style.whiteSpace = 'nowrap';
                var meta = document.createElement('div');
                var score = String(item.score || '0-0');
                var phase = String(item.phase || appState.currentPhase || '');
                var rot = String(item.rotation || '');
                var phaseAbbr = (phase === 'servizio') ? 'S' : (phase === 'ricezione' ? 'R' : phase);
                meta.textContent = score + ' • ' + phaseAbbr + ' ' + rot + '  ';
                meta.style.fontWeight = '700';
                meta.style.color = '#0d6efd';
                var action = document.createElement('span');
                action.textContent = String(item.action || '');
                action.style.fontFamily = 'monospace';
                action.style.whiteSpace = 'nowrap';
                body.appendChild(meta);
                body.appendChild(action);
            }
        }
    } catch(_){}
};

window.openActionEditor = function(index){
    try {
        var logs = Array.isArray(appState.actionsLog) ? appState.actionsLog : [];
        var item = logs[index] || {};
        var actionStr = String(item.action || '');
        var parsed = parseAction(actionStr);
        var hasAvv = /(^|\s)avv(\s|$)/i.test(actionStr);
        var dlg = document.getElementById('action-editor-dialog');
        if (!dlg) {
            dlg = document.createElement('div');
            dlg.id = 'action-editor-dialog';
            dlg.className = 'dialog is-open';
            dlg.style.position = 'fixed';
            dlg.style.inset = '0';
            dlg.style.background = 'rgba(0,0,0,0.35)';
            dlg.style.zIndex = '1003';
            var panel = document.createElement('div');
            panel.className = 'dialog-panel';
            panel.style.maxWidth = '700px';
            panel.style.width = 'min(700px, calc(100% - 16px))';
            panel.style.margin = '0 12px';
            panel.style.background = '#fff';
            panel.style.borderRadius = '12px';
            panel.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)';
            panel.style.display = 'flex';
            panel.style.flexDirection = 'column';
            panel.style.maxHeight = '80vh';
            panel.style.overflow = 'hidden';
            var header = document.createElement('div');
            header.className = 'dialog-header';
            header.style.display = 'flex';
            header.style.alignItems = 'center';
            header.style.justifyContent = 'space-between';
            header.style.padding = '12px 16px';
            header.style.position = 'sticky';
            header.style.top = '0';
            header.style.background = '#fff';
            header.style.zIndex = '1';
            var h3 = document.createElement('h3');
            h3.textContent = 'Editor Quartine';
            h3.style.margin = '0';
            header.appendChild(h3);
            var headerActions = document.createElement('div');
            headerActions.style.display = 'flex';
            headerActions.style.gap = '8px';
            var cancelIcon = document.createElement('button');
            cancelIcon.type = 'button';
            cancelIcon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M18 6L6 18" stroke="#0d6efd" stroke-width="2" stroke-linecap="round"/><path d="M6 6L18 18" stroke="#0d6efd" stroke-width="2" stroke-linecap="round"/></svg>';
            cancelIcon.title = 'Annulla';
            cancelIcon.setAttribute('aria-label','Annulla');
            cancelIcon.addEventListener('click', function(){ try{ dlg.remove(); document.body.style.overflow=''; }catch(_){} });
            try{
                cancelIcon.style.background='#fff';
                cancelIcon.style.color='#0d6efd';
                cancelIcon.style.border='1px solid #e9ecef';
                cancelIcon.style.borderRadius='8px';
                cancelIcon.style.padding='6px';
                cancelIcon.style.fontWeight='700';
                cancelIcon.style.display='inline-flex';
                cancelIcon.style.alignItems='center';
                cancelIcon.style.justifyContent='center';
                cancelIcon.style.outline='none';
                cancelIcon.style.boxShadow='none';
                cancelIcon.style.webkitAppearance='none';
                cancelIcon.style.MozAppearance='none';
                cancelIcon.style.appearance='none';
            }catch(_){ }
            var confirmIcon = document.createElement('button');
            confirmIcon.type = 'button';
            confirmIcon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke="#0d6efd" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            confirmIcon.title = 'Conferma';
            confirmIcon.setAttribute('aria-label','Conferma');
            confirmIcon.addEventListener('click', function(){
                try {
                    var rowEls = Array.from(rows.querySelectorAll('.quartine-row'));
                    var parts = [];
                    var invalid = false;
                    rowEls.forEach(function(r, i){
                        if (r.classList.contains('avv-row')) return;
                        var numEl = r.querySelector('.q-player');
                        var fundEl = r.querySelector('.q-fund');
                        var evalEl = r.querySelector('.q-eval');
                        var num = numEl.value;
                        var fund = fundEl.value;
                        var evalv = evalEl.value;
                        var ok = (num && fund && evalv);
                        try{
                            numEl.style.borderColor = ok ? '' : '#ef4444';
                            fundEl.style.borderColor = ok ? '' : '#ef4444';
                            evalEl.style.borderColor = ok ? '' : '#ef4444';
                        }catch(_){}
                        if (!ok) { invalid = true; return; }
                        if (i === 0 && fund !== 'b' && fund !== 'r') fund = 'b';
                        var token = String(num).padStart(2,'0') + fund + String(evalv);
                        parts.push(token);
                    });
                    if (invalid) { try{ alert('Compila tutti i campi prima di confermare.'); }catch(_){} return; }
                    if (hasAvv) parts.push('avv');
                    var updated = parts.join(' ');
                    if (logs[index]) logs[index].action = updated;
                    recomputeFromActionsLog();
                    try { dlg.remove(); } catch(_){}
                    openActionsDialog();
                } catch(_){}
            });
            try{
                confirmIcon.style.background='#fff';
                confirmIcon.style.color='#0d6efd';
                confirmIcon.style.border='1px solid #e9ecef';
                confirmIcon.style.borderRadius='8px';
                confirmIcon.style.padding='6px';
                confirmIcon.style.fontWeight='700';
                confirmIcon.style.display='inline-flex';
                confirmIcon.style.alignItems='center';
                confirmIcon.style.justifyContent='center';
                confirmIcon.style.outline='none';
                confirmIcon.style.boxShadow='none';
                confirmIcon.style.webkitAppearance='none';
                confirmIcon.style.MozAppearance='none';
                confirmIcon.style.appearance='none';
            }catch(_){ }
            headerActions.appendChild(cancelIcon);
            headerActions.appendChild(confirmIcon);
            header.appendChild(headerActions);
            var body = document.createElement('div');
            body.className = 'dialog-body';
            body.style.padding = '8px 12px';
            body.style.flex = '1 1 auto';
            body.style.overflowY = 'auto';
            var rows = document.createElement('div');
            rows.id = 'quartine-editor-rows';
            body.appendChild(rows);
            var footer = document.createElement('div');
            footer.className = 'dialog-footer';
            footer.style.display = 'flex';
            footer.style.flexWrap = 'wrap';
            footer.style.justifyContent = 'space-between';
            footer.style.gap = '8px';
            footer.style.padding = '10px 12px';
            footer.style.position = 'sticky';
            footer.style.bottom = '0';
            footer.style.background = '#fff';
            var left = document.createElement('div');
            var avvBtn = document.createElement('button');
            avvBtn.type = 'button';
            avvBtn.className = '';
            avvBtn.textContent = hasAvv ? 'Rimuovi avv' : 'Aggiungi avv';
            avvBtn.addEventListener('click', function(){
                hasAvv = !hasAvv;
                avvBtn.textContent = hasAvv ? 'Rimuovi avv' : 'Aggiungi avv';
                if (hasAvv) { appendAvvRow(); ensureAvvRowPosition(); } else { var r = rowsEl.querySelector('.avv-row'); if (r) r.remove(); }
            });
            try{ avvBtn.style.background='#fff'; avvBtn.style.color='#0d6efd'; avvBtn.style.border='1px solid #0d6efd'; avvBtn.style.borderRadius='10px'; avvBtn.style.padding='6px 10px'; avvBtn.style.fontWeight='600'; }catch(_){ }
            left.appendChild(avvBtn);
            footer.appendChild(left);
            panel.appendChild(header);
            panel.appendChild(body);
            panel.appendChild(footer);
            dlg.appendChild(panel);
            dlg.addEventListener('click', function(e){ if (e.target === dlg) { try{ dlg.remove(); document.body.style.overflow=''; }catch(_){} } });
            document.addEventListener('keydown', function onKey(e){ if (e.key === 'Escape'){ try{ dlg.remove(); document.body.style.overflow=''; }catch(_){} document.removeEventListener('keydown', onKey); } });
            document.body.appendChild(dlg);
            try{ document.body.style.overflow='hidden'; }catch(_){ }
        }
        var rowsEl = document.getElementById('quartine-editor-rows');
        if (rowsEl) {
            rowsEl.innerHTML = '';
            var roster = Array.isArray(appState.currentRoster) ? appState.currentRoster : [];
            var options = [];
            if (roster.length) {
                roster.forEach(function(p){
                    var label = String(p.number).padStart(2,'0') + ' - ' + String(p.nickname || ((p.name||'') + ' ' + (p.surname||''))).trim();
                    options.push({ value: String(p.number).padStart(2,'0'), label: label });
                });
            } else {
                for (var n=1;n<=20;n++){ options.push({ value: String(n).padStart(2,'0'), label: String(n).padStart(2,'0') }); }
            }
            var evalOptions = [
                { value: '1', label: '1' },
                { value: '2', label: '2' },
                { value: '3', label: '3' },
                { value: '4', label: '4' },
                { value: '5', label: '5' }
            ];
            var fundsAll = ['b','r','a','d','m'];
            function refreshFundOptions(){
                try {
                    var allRows = Array.from(rowsEl.querySelectorAll('.quartine-row'));
                    allRows.forEach(function(r, i){
                        var selFund = r.querySelector('.q-fund');
                        var current = selFund ? String(selFund.value) : '';
                        var allowed = (i === 0) ? ['b','r'] : fundsAll;
                        if (selFund) {
                            selFund.innerHTML = '';
                            var ph = document.createElement('option'); ph.value = ''; ph.textContent = 'Seleziona'; ph.disabled = true; selFund.appendChild(ph);
                            allowed.forEach(function(f){
                                var o = document.createElement('option'); o.value = f; o.textContent = f; selFund.appendChild(o);
                            });
                            if (allowed.includes(current)) selFund.value = current; else if (current === '') selFund.value = ''; else selFund.value = allowed[0];
                        }
                    });
                } catch(_){ }
            }

            function appendAvvRow(){
                var existing = rowsEl.querySelector('.avv-row');
                if (existing) return existing;
                var row = document.createElement('div');
                row.className = 'quartine-row avv-row';
                row.style.display = 'grid';
                row.style.gridTemplateColumns = 'max-content';
                row.style.gap = '8px';
                row.style.alignItems = 'center';
                row.style.marginBottom = '8px';
                var avvField = document.createElement('select');
                avvField.className = 'form-select q-avv';
                avvField.style.minWidth = '80px';
                var opt = document.createElement('option'); opt.value = 'avv'; opt.textContent = 'avv'; avvField.appendChild(opt);
                avvField.value = 'avv';
                avvField.disabled = true;
                row.appendChild(avvField);
                rowsEl.appendChild(row);
                return row;
            }

            function ensureAvvRowPosition(){
                var avv = rowsEl.querySelector('.avv-row');
                if (avv) rowsEl.appendChild(avv);
            }

            function appendRow(q, idx){
                var row = document.createElement('div');
                row.className = 'quartine-row';
                row.style.display = 'grid';
                row.style.gridTemplateColumns = 'max-content max-content max-content max-content';
                row.style.gap = '8px';
                row.style.alignItems = 'center';
                row.style.marginBottom = '8px';
                var selNum = document.createElement('select');
                selNum.className = 'form-select q-player';
                selNum.style.width = 'auto';
                selNum.style.minWidth = '140px';
                selNum.style.whiteSpace = 'nowrap';
                var phNum = document.createElement('option'); phNum.value = ''; phNum.textContent = 'Seleziona'; phNum.disabled = true; selNum.appendChild(phNum);
                options.forEach(function(opt){
                    var o = document.createElement('option'); o.value = opt.value; o.textContent = opt.label; selNum.appendChild(o);
                });
                selNum.value = q && q.player ? String(q.player) : '';
                var selFund = document.createElement('select');
                selFund.className = 'form-select q-fund';
                selFund.style.width = '3ch';
                selFund.style.minWidth = '40px';
                selFund.style.whiteSpace = 'nowrap';
                var funds = (idx===0) ? ['b','r'] : fundsAll;
                var phFund = document.createElement('option'); phFund.value = ''; phFund.textContent = 'Seleziona'; phFund.disabled = true; selFund.appendChild(phFund);
                funds.forEach(function(f){ var o = document.createElement('option'); o.value = f; o.textContent = f; selFund.appendChild(o); });
                selFund.value = q && q.fundamental ? String(q.fundamental) : '';
                var selEval = document.createElement('select');
                selEval.className = 'form-select q-eval';
                selEval.style.width = '4ch';
                selEval.style.minWidth = '48px';
                selEval.style.whiteSpace = 'nowrap';
                var phEval = document.createElement('option'); phEval.value = ''; phEval.textContent = 'Seleziona'; phEval.disabled = true; selEval.appendChild(phEval);
                evalOptions.forEach(function(ev){ var o = document.createElement('option'); o.value = ev.value; o.textContent = ev.label; selEval.appendChild(o); });
                selEval.value = q && q.evaluation ? String(q.evaluation) : '';
                var actions = document.createElement('div');
                actions.style.display = 'flex';
                actions.style.gap = '6px';
                var addBtn = document.createElement('button');
                addBtn.type = 'button';
                addBtn.className = '';
                addBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 5v14" stroke="#0d6efd" stroke-width="2" stroke-linecap="round"/><path d="M5 12h14" stroke="#0d6efd" stroke-width="2" stroke-linecap="round"/></svg>';
                try{
                    addBtn.style.background='#fff';
                    addBtn.style.color='#0d6efd';
                    addBtn.style.border='1px solid #e9ecef';
                    addBtn.style.borderRadius='8px';
                    addBtn.style.padding='6px';
                    addBtn.style.display='inline-flex';
                    addBtn.style.alignItems='center';
                    addBtn.style.justifyContent='center';
                }catch(_){ }
                addBtn.title = 'Aggiungi quartina';
                addBtn.addEventListener('click', function(){
                    try {
                        var newRow = appendRow({ player: '', fundamental: '', evaluation: '' }, (rowsEl.querySelectorAll('.quartine-row').length));
                        rowsEl.insertBefore(newRow, row.nextSibling);
                        refreshFundOptions();
                        ensureAvvRowPosition();
                    } catch(_){ }
                });
                var delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = '';
                delBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 6h18" stroke="#0d6efd" stroke-width="2" stroke-linecap="round"/><path d="M8 6v-2h8v2" stroke="#0d6efd" stroke-width="2" stroke-linecap="round"/><path d="M19 6l-1 14H6L5 6" stroke="#0d6efd" stroke-width="2" stroke-linecap="round"/><path d="M10 11v6" stroke="#0d6efd" stroke-width="2" stroke-linecap="round"/><path d="M14 11v6" stroke="#0d6efd" stroke-width="2" stroke-linecap="round"/></svg>';
                try{
                    delBtn.style.background='#fff';
                    delBtn.style.color='#0d6efd';
                    delBtn.style.border='1px solid #e9ecef';
                    delBtn.style.borderRadius='8px';
                    delBtn.style.padding='6px';
                    delBtn.style.display='inline-flex';
                    delBtn.style.alignItems='center';
                    delBtn.style.justifyContent='center';
                }catch(_){ }
                delBtn.title = 'Elimina quartina';
                delBtn.addEventListener('click', function(){
                    try {
                        var count = rowsEl.querySelectorAll('.quartine-row').length;
                        if (count <= 1) return; // almeno una quartina
                        row.remove();
                        refreshFundOptions();
                        ensureAvvRowPosition();
                    } catch(_){ }
                });
                actions.appendChild(addBtn);
                actions.appendChild(delBtn);
                row.appendChild(selNum);
                row.appendChild(selFund);
                row.appendChild(selEval);
                row.appendChild(actions);
                rowsEl.appendChild(row);
                return row;
            }
            var rowsData = Array.isArray(parsed.actions) ? parsed.actions : [];
            if (!rowsData.length) rowsData = [{ player:'01', fundamental:'b', evaluation:3 }];
            rowsData.forEach(function(q, idx){ appendRow(q, idx); });
            refreshFundOptions();
            if (hasAvv) { appendAvvRow(); ensureAvvRowPosition(); }
        }
    } catch(_) {}
};

// Calcolo stato dei set e aggiornamento colori nella sidebar
function __getSetMetaPresence(setNum){
    try {
        const session = JSON.parse(localStorage.getItem('currentScoutingSession')||'{}');
        const cfg = session.setConfig || {};
        const sm = session.setMeta && session.setMeta[setNum];
        if (Number(setNum) === 1) {
            const hasGlobal = !!(cfg.ourRotation && cfg.phase);
            const hasMeta = !!(sm && sm.ourRotation && sm.phase);
            return hasGlobal || hasMeta;
        }
        return !!(sm && sm.ourRotation && sm.phase);
    } catch(_) { return false; }
}

function __getSetDataSnapshot(setNum){
    let actions = [];
    let home = 0, away = 0;
    let started = false;
    try {
        const session = JSON.parse(localStorage.getItem('currentScoutingSession')||'{}');
        const abSet = session.actionsBySet || {};
        const stBySet = session.setStateBySet || {};
        const shBySet = session.scoreHistoryBySet || {};
        const sumBySet = session.setSummary || {};
        if (Number(setNum) === Number(appState.currentSet)) {
            actions = Array.isArray(appState.actionsLog) ? appState.actionsLog : [];
            home = Number(appState.homeScore||0);
            away = Number(appState.awayScore||0);
            started = !!appState.setStarted;
            // Fallback: se il set corrente non ha dati in appState (es. pagina report), usa i dati della sessione
            if ((!actions || actions.length === 0) && (!home && !away)) {
                actions = Array.isArray(abSet[setNum]) ? abSet[setNum] : [];
                const st = stBySet[setNum] || {};
                const arr = Array.isArray(shBySet[setNum]) ? shBySet[setNum] : [];
                const last = arr.length ? arr[arr.length - 1] : null;
                if (last && (typeof last.homeScore === 'number' || typeof last.awayScore === 'number')) {
                    home = Number(last.homeScore||0);
                    away = Number(last.awayScore||0);
                } else {
                    const sum = sumBySet[setNum] || {};
                    if (typeof sum.home === 'number' || typeof sum.away === 'number') {
                        home = Number(sum.home||0);
                        away = Number(sum.away||0);
                    } else if (typeof st.homeScore === 'number' || typeof st.awayScore === 'number') {
                        home = Number(st.homeScore||0);
                        away = Number(st.awayScore||0);
                    }
                }
                started = !!st.setStarted;
            }
        } else {
            actions = Array.isArray(abSet[setNum]) ? abSet[setNum] : [];
            const st = stBySet[setNum] || {};
            const arr = Array.isArray(shBySet[setNum]) ? shBySet[setNum] : [];
            const last = arr.length ? arr[arr.length - 1] : null;
            if (last && (typeof last.homeScore === 'number' || typeof last.awayScore === 'number')) {
                home = Number(last.homeScore||0);
                away = Number(last.awayScore||0);
            } else {
                const sum = sumBySet[setNum] || {};
                if (typeof sum.home === 'number' || typeof sum.away === 'number') {
                    home = Number(sum.home||0);
                    away = Number(sum.away||0);
                } else if (typeof st.homeScore === 'number' || typeof st.awayScore === 'number') {
                    home = Number(st.homeScore||0);
                    away = Number(st.awayScore||0);
                }
            }
            started = !!st.setStarted;
        }
    } catch(_) {}
    return { actions, home, away, started };
}

function __isSetCompleted(setNum, home, away){
    const isSetFive = Number(setNum) === 5;
    const minScore = isSetFive ? 15 : 25;
    if ((home >= minScore || away >= minScore) && Math.abs(home - away) >= 2) {
        return true;
    }
    return false;
}

function __computeSetStatus(setNum){
    const hasMeta = __getSetMetaPresence(setNum);
    const snap = __getSetDataSnapshot(setNum);
    const hasQuartine = Array.isArray(snap.actions) && snap.actions.length > 0;
    const completed = __isSetCompleted(setNum, snap.home, snap.away);
    if (completed) return 'completed';
    if (hasQuartine || snap.started || hasMeta) return 'partial';
    return 'none';
}

function updateSetSidebarColors(){
    try {
        const list = document.getElementById('setToolbar');
        if (!list) return;
        const items = list.querySelectorAll('.set-item');
        items.forEach(btn => {
            const ds = btn.dataset && btn.dataset.set;
            const n = Number.parseInt(ds, 10);
            if (!Number.isInteger(n)) return;
            btn.classList.remove('status-completed','status-partial');
            const status = __computeSetStatus(n);
            if (status === 'completed') btn.classList.add('status-completed');
            else if (status === 'partial') btn.classList.add('status-partial');
        });
    } catch(e) {
        console.warn('updateSetSidebarColors fallita:', e);
    }
}

// Espone per altri script
window.updateSetSidebarColors = updateSetSidebarColors;

function __getSetDataSnapshotFromSession(session, setNum){
    let actions = [];
    let home = 0, away = 0;
    let started = false;
    try {
        const abSet = session.actionsBySet || {};
        const stBySet = session.setStateBySet || {};
        const shBySet = session.scoreHistoryBySet || {};
        const sumBySet = session.setSummary || {};
        actions = Array.isArray(abSet[setNum]) ? abSet[setNum] : [];
        const st = stBySet[setNum] || {};
        const arr = Array.isArray(shBySet[setNum]) ? shBySet[setNum] : [];
        const last = arr.length ? arr[arr.length - 1] : null;
        if (last && (typeof last.homeScore === 'number' || typeof last.awayScore === 'number')) {
            home = Number(last.homeScore||0);
            away = Number(last.awayScore||0);
        } else {
            const sum = sumBySet[setNum] || {};
            if (typeof sum.home === 'number' || typeof sum.away === 'number') {
                home = Number(sum.home||0);
                away = Number(sum.away||0);
            } else if (typeof st.homeScore === 'number' || typeof st.awayScore === 'number') {
                home = Number(st.homeScore||0);
                away = Number(st.awayScore||0);
            }
        }
        started = !!st.setStarted;
    } catch(_) {}
    return { actions, home, away, started };
}

function __isSetCompletedFromScores(setNum, home, away){
    const isSetFive = Number(setNum) === 5;
    const minScore = isSetFive ? 15 : 25;
    if ((home >= minScore || away >= minScore) && Math.abs(home - away) >= 2) {
        return true;
    }
    return false;
}

function __computeSetStatusFromSession(session, setNum){
    const hasMeta = __getSetMetaPresence(setNum);
    const snap = __getSetDataSnapshotFromSession(session, setNum);
    const hasQuartine = Array.isArray(snap.actions) && snap.actions.length > 0;
    const completed = __isSetCompletedFromScores(setNum, snap.home, snap.away);
    if (completed) return 'completed';
    if (hasQuartine || snap.started || hasMeta) return 'partial';
    return 'none';
}

function __computeMatchStatusLabel(session){
    let completed = 0;
    let partial = false;
    for (let i = 1; i <= 6; i++) {
        const s = __computeSetStatusFromSession(session, i);
        if (s === 'completed') completed++;
        else if (s === 'partial') partial = true;
    }
    if (completed >= 3) return 'Ultimato';
    if (partial) return 'parziale';
    return 'inizializzato';
}

function __mapMatchStatusCode(label){
    if (label === 'Ultimato') return 'completed';
    if (label === 'parziale') return 'in_progress';
    return 'initialized';
}

function checkSetEnd() {
    // Evita prompt durante import/ricostruzioni automatiche
    if (appState.suppressSetPrompts) {
        return;
    }
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
        try {
            if (typeof window.openEndSetDialog === 'function') {
                window.openEndSetDialog(appState.currentSet, setWinner, homeScore, awayScore);
            }
        } catch(_) {}
    }
}

function openEndSetDialog(setNumber, winner, homeScore, awayScore){
    var dlg = document.getElementById('end-set-dialog');
    if (!dlg) {
        dlg = document.createElement('div');
        dlg.id = 'end-set-dialog';
        dlg.className = 'dialog is-open';
        var panel = document.createElement('div');
        panel.className = 'dialog-panel';
        panel.style.maxWidth = '420px';
        panel.style.width = '92%';
        panel.style.border = '1px solid #e5e7eb';
        panel.style.borderRadius = '12px';
        panel.style.background = '#fff';
        var header = document.createElement('div');
        header.className = 'dialog-header';
        header.style.display = 'grid';
        header.style.gridTemplateColumns = '1fr auto';
        header.style.alignItems = 'center';
        header.style.columnGap = '8px';
        header.style.padding = '10px 12px';
        var h3 = document.createElement('h3');
        h3.textContent = 'Set ' + String(setNumber) + ' concluso';
        var close = document.createElement('button');
        close.type = 'button';
        close.textContent = '✕';
        close.addEventListener('click', function(){ closeDialog('end-set-dialog'); });
        header.appendChild(h3);
        header.appendChild(close);
        var body = document.createElement('div');
        body.className = 'dialog-body';
        body.style.padding = '12px 16px';
        var p = document.createElement('p');
        var winLabel = winner === 'home' ? 'Vittoria' : 'Sconfitta';
        p.textContent = winLabel + ' ' + String(homeScore) + ' - ' + String(awayScore);
        body.appendChild(p);
        var footer = document.createElement('div');
        footer.className = 'dialog-footer';
        footer.style.display = 'flex';
        footer.style.justifyContent = 'flex-end';
        footer.style.gap = '8px';
        var btnClose = document.createElement('button');
        btnClose.type = 'button';
        btnClose.textContent = 'Chiudi';
        btnClose.className = 'btn';
        try{ btnClose.style.background='#fff'; btnClose.style.color='#0d6efd'; btnClose.style.border='1px solid #0d6efd'; btnClose.style.borderRadius='10px'; btnClose.style.padding='6px 10px'; btnClose.style.fontWeight='600'; }catch(_){ }
        btnClose.addEventListener('click', function(){ closeDialog('end-set-dialog'); });
        var nextSetNum = Math.min(6, Number(setNumber) + 1);
        var btnNext = document.createElement('button');
        btnNext.type = 'button';
        btnNext.textContent = (setNumber >= 6) ? 'Vai a Report' : ('Passa al Set ' + String(nextSetNum));
        btnNext.className = 'btn';
        try{ btnNext.style.background='#fff'; btnNext.style.color='#0d6efd'; btnNext.style.border='1px solid #0d6efd'; btnNext.style.borderRadius='10px'; btnNext.style.padding='6px 10px'; btnNext.style.fontWeight='600'; }catch(_){ }
        btnNext.addEventListener('click', function(){
            if (setNumber >= 6) { try { window.location.href = '/match-stats.html'; } catch(_) {} closeDialog('end-set-dialog'); return; }
            appState.currentSet = nextSetNum;
            try { updateSetSidebarColors(); } catch(_) {}
            try { resetCurrentSet(); } catch(_) {}
            try { openSetMetaDialog(nextSetNum); } catch(_) {}
            closeDialog('end-set-dialog');
        });
        footer.appendChild(btnClose);
        footer.appendChild(btnNext);
        panel.appendChild(header);
        panel.appendChild(body);
        panel.appendChild(footer);
        dlg.appendChild(panel);
        document.body.appendChild(dlg);
    } else {
        var body = dlg.querySelector('.dialog-body');
        var p = body ? body.querySelector('p') : null;
        if (p) {
            var winLabel = winner === 'home' ? 'Vittoria' : 'Sconfitta';
            p.textContent = winLabel + ' ' + String(homeScore) + ' - ' + String(awayScore);
        }
        var h3 = dlg.querySelector('.dialog-header h3');
        if (h3) h3.textContent = 'Set ' + String(setNumber) + ' concluso';
        var btnNext = dlg.querySelector('.dialog-footer .btn:last-child');
        if (btnNext) {
            var nextSetNum = Math.min(6, Number(setNumber) + 1);
            btnNext.textContent = (setNumber >= 6) ? 'Vai a Report' : ('Passa al Set ' + String(nextSetNum));
            btnNext.onclick = function(){
                if (setNumber >= 6) { try { window.location.href = '/match-stats.html'; } catch(_) {} closeDialog('end-set-dialog'); return; }
                appState.currentSet = nextSetNum;
                try { updateSetSidebarColors(); } catch(_) {}
                try { resetCurrentSet(); } catch(_) {}
                try { openSetMetaDialog(nextSetNum); } catch(_) {}
                closeDialog('end-set-dialog');
            };
        }
    }
    openDialog('end-set-dialog');
}

function openSetMetaDialog(setNumber){
    var dlg = document.getElementById('set-meta-dialog');
    if (!dlg) {
        dlg = document.createElement('div');
        dlg.id = 'set-meta-dialog';
        dlg.className = 'dialog is-open';
        var panel = document.createElement('div');
        panel.className = 'dialog-panel';
        panel.style.maxWidth = '460px';
        panel.style.width = '92%';
        panel.style.border = '1px solid #e5e7eb';
        panel.style.borderRadius = '12px';
        panel.style.background = '#fff';
        var header = document.createElement('div');
        header.className = 'dialog-header';
        header.style.display = 'grid';
        header.style.gridTemplateColumns = '1fr auto';
        header.style.alignItems = 'center';
        header.style.columnGap = '8px';
        header.style.padding = '10px 12px';
        var h3 = document.createElement('h3');
        h3.textContent = 'Dati Set ' + String(setNumber);
        var close = document.createElement('button');
        close.type = 'button';
        close.textContent = '✕';
        close.addEventListener('click', function(){ closeDialog('set-meta-dialog'); });
        header.appendChild(h3);
        header.appendChild(close);
        var body = document.createElement('div');
        body.className = 'dialog-body';
        body.style.padding = '12px 16px';
        var rowPhase = document.createElement('div');
        rowPhase.style.display = 'grid';
        rowPhase.style.gridTemplateColumns = '1fr 1fr';
        rowPhase.style.gap = '8px';
        var labelPhase = document.createElement('label');
        labelPhase.textContent = 'Fase';
        var selPhase = document.createElement('select');
        selPhase.id = 'set-meta-phase';
        ['servizio','ricezione'].forEach(function(v){ var o=document.createElement('option'); o.value=v; o.textContent=v.charAt(0).toUpperCase()+v.slice(1); selPhase.appendChild(o); });
        var labelRot = document.createElement('label');
        labelRot.textContent = 'Rotazione Ns.';
        var selRot = document.createElement('select');
        selRot.id = 'set-meta-our-rotation';
        ['P1','P2','P3','P4','P5','P6'].forEach(function(v){ var o=document.createElement('option'); o.value=v; o.textContent=v; selRot.appendChild(o); });
        var labelOpp = document.createElement('label');
        labelOpp.textContent = 'Rotazione Avv. (opz.)';
        var selOpp = document.createElement('select');
        selOpp.id = 'set-meta-opponent-rotation';
        var empty = document.createElement('option'); empty.value=''; empty.textContent='—'; selOpp.appendChild(empty);
        ['P1','P2','P3','P4','P5','P6'].forEach(function(v){ var o=document.createElement('option'); o.value=v; o.textContent=v; selOpp.appendChild(o); });
        rowPhase.appendChild(labelPhase);
        rowPhase.appendChild(selPhase);
        var rowRot = document.createElement('div');
        rowRot.style.display = 'grid';
        rowRot.style.gridTemplateColumns = '1fr 1fr';
        rowRot.style.gap = '8px';
        rowRot.appendChild(labelRot);
        rowRot.appendChild(selRot);
        var rowOpp = document.createElement('div');
        rowOpp.style.display = 'grid';
        rowOpp.style.gridTemplateColumns = '1fr 1fr';
        rowOpp.style.gap = '8px';
        rowOpp.appendChild(labelOpp);
        rowOpp.appendChild(selOpp);
        body.appendChild(rowPhase);
        body.appendChild(rowRot);
        body.appendChild(rowOpp);
        var footer = document.createElement('div');
        footer.className = 'dialog-footer';
        footer.style.display = 'flex';
        footer.style.justifyContent = 'flex-end';
        footer.style.gap = '8px';
        var btnCancel = document.createElement('button');
        btnCancel.type = 'button';
        btnCancel.textContent = 'Annulla';
        btnCancel.className = 'btn';
        try{ btnCancel.style.background='#fff'; btnCancel.style.color='#0d6efd'; btnCancel.style.border='1px solid #0d6efd'; btnCancel.style.borderRadius='10px'; btnCancel.style.padding='6px 10px'; btnCancel.style.fontWeight='600'; }catch(_){ }
        btnCancel.addEventListener('click', function(){ closeDialog('set-meta-dialog'); });
        var btnStart = document.createElement('button');
        btnStart.type = 'button';
        btnStart.textContent = 'Avvia Set';
        btnStart.className = 'btn';
        try{ btnStart.style.background='#fff'; btnStart.style.color='#0d6efd'; btnStart.style.border='1px solid #0d6efd'; btnStart.style.borderRadius='10px'; btnStart.style.padding='6px 10px'; btnStart.style.fontWeight='600'; }catch(_){ }
        btnStart.addEventListener('click', function(){
            var phase = selPhase.value || 'servizio';
            var ourRot = selRot.value || 'P1';
            var oppRot = selOpp.value || '';
            try {
                var sessionData = JSON.parse(localStorage.getItem('currentScoutingSession')||'{}');
                sessionData.setMeta = sessionData.setMeta || {};
                sessionData.setMeta[setNumber] = { ourRotation: ourRot, phase: phase, opponentRotation: oppRot || null };
                localStorage.setItem('currentScoutingSession', JSON.stringify(sessionData));
            } catch(_){ }
            try { appState.currentSet = setNumber; } catch(_){ }
            try { startSet(); } catch(_){ }
            try { updateSetSidebarColors(); } catch(_){ }
            try {
                var list = document.getElementById('setToolbar');
                if (list) {
                    list.querySelectorAll('.set-item').forEach(function(b){ b.classList.remove('active'); b.removeAttribute('aria-current'); });
                    var btn = list.querySelector('.set-item[data-set="'+ String(setNumber) +'"]');
                    if (btn) { btn.classList.add('active'); btn.setAttribute('aria-current','true'); }
                }
            } catch(_){ }
            closeDialog('set-meta-dialog');
        });
        footer.appendChild(btnCancel);
        footer.appendChild(btnStart);
        panel.appendChild(header);
        panel.appendChild(body);
        panel.appendChild(footer);
        dlg.appendChild(panel);
        document.body.appendChild(dlg);
    }
    try {
        var sessionData = JSON.parse(localStorage.getItem('currentScoutingSession')||'{}');
        var sm = sessionData.setMeta && sessionData.setMeta[setNumber];
        var phase = sm && sm.phase ? sm.phase : (sessionData.setConfig && sessionData.setConfig.phase ? sessionData.setConfig.phase : 'servizio');
        var ourRot = sm && sm.ourRotation ? sm.ourRotation : (sessionData.setConfig && sessionData.setConfig.ourRotation ? String(sessionData.setConfig.ourRotation).startsWith('P') ? sessionData.setConfig.ourRotation : 'P'+sessionData.setConfig.ourRotation : 'P1');
        var oppRot = sm && sm.opponentRotation ? sm.opponentRotation : (sessionData.setConfig && sessionData.setConfig.opponentRotation ? sessionData.setConfig.opponentRotation : '');
        var phaseSel = dlg.querySelector('#set-meta-phase');
        var ourSel = dlg.querySelector('#set-meta-our-rotation');
        var oppSel = dlg.querySelector('#set-meta-opponent-rotation');
        if (phaseSel) phaseSel.value = phase;
        if (ourSel) ourSel.value = ourRot;
        if (oppSel) oppSel.value = oppRot || '';
        var titleEl = dlg.querySelector('.dialog-header h3');
        if (titleEl) titleEl.textContent = 'Dati Set ' + String(setNumber);
    } catch(_){ }
    openDialog('set-meta-dialog');
}

window.openEndSetDialog = openEndSetDialog;
window.openSetMetaDialog = openSetMetaDialog;

function rotateTeam() {
    // Usa rotazione normalizzata per garantire l'indice corretto
    const current = normalizeRotation(appState.currentRotation);
    let currentIndex = rotationSequence.indexOf(current);
    if (currentIndex === -1) {
        // Se non trovata, fallback sicuro a P1
        currentIndex = 0;
    }
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

    // Stato iniziale set: nessuna azione e nessuna selezione
    try {
        const isInitial = !!(
            appState.setStarted && (!Array.isArray(appState.actionsLog) || appState.actionsLog.length === 0) &&
            (!Array.isArray(appState.currentSequence) || appState.currentSequence.length === 0) &&
            Array.isArray(appState.scoreHistory) && appState.scoreHistory.length === 1 && appState.scoreHistory[0]?.type === 'initial' &&
            !player && !evalVal
        );
        if (isInitial) {
            const setNum = (typeof appState.currentSet === 'number') ? appState.currentSet : 1;
            const rotRaw = String(appState.currentRotation || 'P1');
            const rotNorm = rotRaw.startsWith('P') ? rotRaw : `P${rotRaw}`;
            const html = `
                <span class="token token-fundamental">SET ${setNum} - ${rotNorm}</span>
                <span class="token token-player token-placeholder"></span>
                <span class="token token-eval token-placeholder"></span>
            `;
            el.classList.remove('multiline');
            el.innerHTML = html;
            if (box) box.style.display = 'block';
            // In stato iniziale niente modalità sostituzione
            try {
                const selectedInfo = document.getElementById('selected-info');
                if (selectedInfo) selectedInfo.classList.remove('replace-mode');
            } catch(_) {}
            return;
        }
    } catch(_) {}

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
        const isFirstQuartet = !(appState.currentSequence && appState.currentSequence.length);
        const nextFundamental = appState.calculatedFundamental || predictNextFundamental();
        if (isFirstQuartet && (nextFundamental === 'b' || nextFundamental === 'r')) {
            try { alert('Muro non disponibile all\'inizio dell\'azione'); } catch(_){ }
            return;
        }
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
try {
  window.appBuild = { version: '4.3.1', commit: '' };
  function renderAppVersion(){
    try {
      var els = document.querySelectorAll('.app-version');
      var v = (window.appBuild && window.appBuild.version) ? String(window.appBuild.version) : '';
      var c = (window.appBuild && window.appBuild.commit) ? String(window.appBuild.commit) : '';
      var text = 'MyVolleyScout Vers. ' + v + (c ? (' (' + c + ')') : '');
      els.forEach(function(el){ el.textContent = text; });
    } catch(_){}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderAppVersion);
  } else {
    renderAppVersion();
  }
} catch(_){}
                try{ confirmBtn.style.background='#fff'; confirmBtn.style.color='#0d6efd'; confirmBtn.style.border='1px solid #0d6efd'; confirmBtn.style.borderRadius='10px'; confirmBtn.style.padding='6px 10px'; confirmBtn.style.fontWeight='600'; }catch(_){}
                try{
                    addBtn.style.background='transparent';
                    addBtn.style.color='#0d6efd';
                    addBtn.style.border='none';
                    addBtn.style.borderRadius='999px';
                    addBtn.style.padding='4px 8px';
                    addBtn.style.fontWeight='600';
                    addBtn.style.minWidth='40px';
                    addBtn.style.display='inline-flex';
                    addBtn.style.alignItems='center';
                    addBtn.style.justifyContent='center';
                    addBtn.style.outline='none';
                    addBtn.style.boxShadow='none';
                    addBtn.style.webkitAppearance='none';
                    addBtn.style.MozAppearance='none';
                    addBtn.style.appearance='none';
                }catch(_){ }
                try{
                    delBtn.style.background='transparent';
                    delBtn.style.color='#0d6efd';
                    delBtn.style.border='none';
                    delBtn.style.borderRadius='999px';
                    delBtn.style.padding='4px 8px';
                    delBtn.style.fontWeight='600';
                    delBtn.style.minWidth='40px';
                    delBtn.style.display='inline-flex';
                    delBtn.style.alignItems='center';
                    delBtn.style.justifyContent='center';
                    delBtn.style.outline='none';
                    delBtn.style.boxShadow='none';
                    delBtn.style.webkitAppearance='none';
                    delBtn.style.MozAppearance='none';
                    delBtn.style.appearance='none';
                }catch(_){ }
