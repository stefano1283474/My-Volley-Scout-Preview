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
    multiLineLayout: true, // Layout "a riga multipla" per la progressione
    editRowsMode: false,
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
    allowUninitializedSet: null,
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

let __lastSavedCoreSignature = null;

function __stableStringify(value) {
    try {
        const seen = new WeakSet();
        const normalize = (v) => {
            if (v === null || v === undefined) return v;
            if (typeof v !== 'object') return v;
            if (seen.has(v)) return null;
            seen.add(v);
            if (Array.isArray(v)) return v.map(normalize);
            const out = {};
            Object.keys(v).sort().forEach((k) => {
                out[k] = normalize(v[k]);
            });
            return out;
        };
        return JSON.stringify(normalize(value));
    } catch (_) {
        try { return JSON.stringify(value); } catch (_) { return ''; }
    }
}

function __coreSignatureFromPayload(payload) {
    try {
        if (!payload || typeof payload !== 'object') return null;
        const core = Object.assign({}, payload);
        delete core.createdAt;
        delete core.updatedAt;
        delete core.scoutingEndTime;
        delete core.cloudRef;
        return __stableStringify(core);
    } catch (_) {
        return null;
    }
}

const __PARTIAL_SAVES_KEY = 'mvsPartialSaves';
const __APP_SETTINGS_KEY = 'appSettings';
const __setStatusCache = {};

function __readAppSettings() {
    try {
        const raw = localStorage.getItem(__APP_SETTINGS_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (_) {
        return {};
    }
}

function __isAutoSaveCleanupEnabled() {
    const settings = __readAppSettings();
    return settings.autoSaveCleanupOnSetCompleted !== false;
}

function __readPartialSavesMap() {
    try {
        const raw = localStorage.getItem(__PARTIAL_SAVES_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (_) {
        return {};
    }
}

function __writePartialSavesMap(map) {
    try {
        localStorage.setItem(__PARTIAL_SAVES_KEY, JSON.stringify(map || {}));
    } catch (_) {}
}

async function __askConfirm(message, options) {
    try {
        if (window.mvsDialog?.confirm) {
            return await window.mvsDialog.confirm(String(message || ''), options || {});
        }
    } catch (_) {}
    try { return window.confirm(String(message || '')); } catch (_) { return true; }
}

async function __showAlert(message, options) {
    try {
        if (window.mvsDialog?.alert) {
            await window.mvsDialog.alert(String(message || ''), options || {});
            return;
        }
    } catch (_) {}
    try { window.alert(String(message || '')); } catch (_) {}
}

function __appendPartialSaveSnapshot(payload) {
    try {
        if (!payload || typeof payload !== 'object') return;
        const matchId = String(payload.id || '').trim();
        if (!matchId) return;
        const map = __readPartialSavesMap();
        const list = Array.isArray(map[matchId]) ? map[matchId] : [];
        const signature = __coreSignatureFromPayload(payload);
        const last = list[0];
        if (last && signature && last.signature === signature) return;
        const now = new Date().toISOString();
        const score = payload.score || {
            home: (window.appState && typeof window.appState.homeScore === 'number') ? window.appState.homeScore : 0,
            away: (window.appState && typeof window.appState.awayScore === 'number') ? window.appState.awayScore : 0
        };
        const entry = {
            id: 'ps_' + Date.now() + '_' + Math.floor(Math.random() * 1000000),
            matchId,
            createdAt: now,
            setNumber: (window.appState && window.appState.currentSet) ? window.appState.currentSet : 1,
            score,
            signature,
            payload
        };
        list.unshift(entry);
        if (list.length > 30) list.length = 30;
        map[matchId] = list;
        __writePartialSavesMap(map);
    } catch (_) {}
}

function __cleanupPartialSavesForSet(matchId, setNum) {
    try {
        const key = String(matchId || '').trim();
        if (!key) return false;
        const target = Number(setNum);
        if (!Number.isFinite(target)) return false;
        const map = __readPartialSavesMap();
        const list = Array.isArray(map[key]) ? map[key] : [];
        if (!list.length) return false;
        const next = list.filter(entry => Number(entry?.setNumber) !== target);
        if (next.length === list.length) return false;
        if (next.length) map[key] = next; else delete map[key];
        __writePartialSavesMap(map);
        return true;
    } catch (_) {
        return false;
    }
}

function __cleanupAllPartialSavesForMatch(matchId) {
    try {
        const key = String(matchId || '').trim();
        if (!key) return false;
        const map = __readPartialSavesMap();
        if (!Object.prototype.hasOwnProperty.call(map, key)) return false;
        delete map[key];
        __writePartialSavesMap(map);
        return true;
    } catch (_) {
        return false;
    }
}

function __normalizeRosterPlayer(player) {
    const p = (player && typeof player === 'object') ? player : {};
    const pick = (keys) => {
        for (const k of keys) {
            const v = p[k];
            if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
        }
        return '';
    };
    return {
        number: pick(['number', 'numero', 'num', 'jersey', 'jerseyNumber', 'maglia']),
        name: pick(['name', 'nome', 'firstName', 'nomi']),
        surname: pick(['surname', 'cognome', 'lastName', 'cognomi']),
        nickname: pick(['nickname', 'soprannome', 'nick']),
        role: pick(['role', 'ruolo', 'position', 'posizione']).toUpperCase()
    };
}

function __enrichRosterForPersistence(primaryRoster, fallbackRoster) {
    const primary = Array.isArray(primaryRoster) ? primaryRoster : [];
    const fallback = Array.isArray(fallbackRoster) ? fallbackRoster : [];
    // Se il roster primario è vuoto, usa il fallback come base
    const effective = primary.length > 0 ? primary : fallback;
    if (!effective.length) return [];
    const byNum = new Map();
    const byNick = new Map();
    // Se usiamo il primary, arricchisci con dati dal fallback; altrimenti il fallback è già la base
    const enrichSource = primary.length > 0 ? fallback : [];
    enrichSource.map(__normalizeRosterPlayer).forEach((p) => {
        const n = String(p.number || '').replace(/^0+/, '').trim();
        if (n && !byNum.has(n)) byNum.set(n, p);
        const nick = String(p.nickname || '').trim().toLowerCase();
        if (nick && !byNick.has(nick)) byNick.set(nick, p);
    });
    return effective.map((raw) => {
        const p = __normalizeRosterPlayer(raw);
        const n = String(p.number || '').replace(/^0+/, '').trim();
        const nick = String(p.nickname || '').trim().toLowerCase();
        const f = (n && byNum.get(n)) || (nick && byNick.get(nick)) || null;
        return {
            number: p.number || f?.number || '',
            name: p.name || f?.name || '',
            surname: p.surname || f?.surname || '',
            nickname: p.nickname || f?.nickname || '',
            role: p.role || f?.role || ''
        };
    }).filter((p) => p.number || p.name || p.surname || p.nickname || p.role);
}

function __repairHistoricalMatchRostersLocal() {
    // Cloud-only: la riparazione dei roster storici viene gestita direttamente in Firestore
    // Non si accede più a localStorage per i dati permanenti delle partite
    try {
        const teamFallback = (() => {
            try {
                const t = window.teamsModule?.getCurrentTeam?.();
                const arr = Array.isArray(t?.players) ? t.players : [];
                return Array.isArray(arr) ? arr : [];
            } catch(_) { return []; }
        })();
        try {
            const sessRaw = localStorage.getItem('currentScoutingSession');
            const sess = sessRaw ? JSON.parse(sessRaw) : null;
            if (sess && Array.isArray(sess.roster) && sess.roster.length) {
                const fixed = __enrichRosterForPersistence(sess.roster, teamFallback);
                if (JSON.stringify(fixed) !== JSON.stringify(sess.roster)) {
                    sess.roster = fixed;
                    localStorage.setItem('currentScoutingSession', JSON.stringify(sess));
                }
            }
        } catch(_) {}
        return { updated: 0 };
    } catch (_) {
        return { updated: 0 };
    }
}

window.repairHistoricalMatchRosters = __repairHistoricalMatchRostersLocal;

async function __repairHistoricalMatchRostersCloud() {
    try {
        const user = window.authFunctions?.getCurrentUser?.();
        if (!user) return { updated: 0 };
        const team = window.teamsModule?.getCurrentTeam?.();
        const teamId = team?.id != null ? String(team.id) : (localStorage.getItem('selectedTeamId') || '');
        if (!teamId) return { updated: 0 };
        const runKey = `mvsRosterRepairRun:${teamId}`;
        try {
            if (sessionStorage.getItem(runKey) === '1') return { updated: 0 };
            sessionStorage.setItem(runKey, '1');
        } catch(_) {}
        if (!window.firestoreService?.loadTeamMatches || !window.firestoreService?.saveMatchTree) return { updated: 0 };
        const fallbackRoster = Array.isArray(team?.players) ? team.players : [];
        const loaded = await window.firestoreService.loadTeamMatches(teamId);
        const rows = Array.isArray(loaded?.matches) ? loaded.matches : (Array.isArray(loaded?.documents) ? loaded.documents : []);
        if (!rows.length) return { updated: 0 };
        let updated = 0;
        for (const match of rows) {
            const roster = Array.isArray(match?.roster) ? match.roster : (Array.isArray(match?.players) ? match.players : []);
            if (!roster.length) continue;
            const fixed = __enrichRosterForPersistence(roster, fallbackRoster);
            if (JSON.stringify(fixed) === JSON.stringify(roster)) continue;
            const payload = Object.assign({}, match, { roster: fixed, players: fixed, updatedAt: new Date().toISOString() });
            const res = await window.firestoreService.saveMatchTree(teamId, payload);
            if (res?.success) updated++;
        }
        return { updated };
    } catch (_) {
        return { updated: 0 };
    }
}

function __showRosterRepairToast(localUpdated, cloudUpdated) {
    try {
        const settings = __readAppSettings();
        if (settings.showRosterRepairToast === false) return;
        const localCount = Number(localUpdated || 0);
        const cloudCount = Number(cloudUpdated || 0);
        const total = localCount + cloudCount;
        if (total <= 0) return;
        const existing = document.getElementById('mvsRosterRepairToast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.id = 'mvsRosterRepairToast';
        toast.style.position = 'fixed';
        toast.style.right = '12px';
        toast.style.bottom = '12px';
        toast.style.zIndex = '10060';
        toast.style.background = '#0f172a';
        toast.style.color = '#fff';
        toast.style.borderRadius = '10px';
        toast.style.padding = '10px 12px';
        toast.style.fontSize = '12px';
        toast.style.fontWeight = '600';
        toast.style.boxShadow = '0 10px 24px rgba(15,23,42,0.35)';
        toast.textContent = `Riparazione roster completata • Locale: ${localCount} • Cloud: ${cloudCount}`;
        document.body.appendChild(toast);
        setTimeout(() => { try { toast.remove(); } catch(_) {} }, 4500);
    } catch (_) {}
}

function __getCurrentMatchIdForCleanup() {
    try {
        const raw = localStorage.getItem('currentScoutingSession');
        if (raw) {
            const session = JSON.parse(raw);
            if (session && session.id) return String(session.id);
        }
    } catch (_) {}
    try {
        const sel = localStorage.getItem('selectedMatchId');
        if (sel) return String(sel);
    } catch (_) {}
    try {
        const id = window.appState?.currentMatch?.id;
        if (id) return String(id);
    } catch (_) {}
    return null;
}

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

function __normalizeIndexedMapToArray(value) {
    try {
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
            const s = value.trim();
            if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('{') && s.endsWith('}'))) {
                try {
                    const parsed = JSON.parse(s);
                    return __normalizeIndexedMapToArray(parsed);
                } catch (_) {
                    return value;
                }
            }
            return value;
        }
        if (!value || typeof value !== 'object') return value;
        const keys = Object.keys(value);
        const idx = keys.filter(k => /^\d+$/.test(String(k))).sort((a, b) => Number(a) - Number(b));
        if (!idx.length) return value;
        return idx.map(k => value[k]);
    } catch (_) {
        return value;
    }
}

function __normalizePerSetCollections(map) {
    try {
        if (!map || typeof map !== 'object') return {};
        const out = {};
        Object.keys(map).forEach((k) => {
            const v = map[k];
            const nv = __normalizeIndexedMapToArray(v);
            out[k] = nv;
        });
        return out;
    } catch (_) {
        return map || {};
    }
}

function cancelAutosave() {
    try {
        if (__autosaveTimerId) {
            clearTimeout(__autosaveTimerId);
            __autosaveTimerId = null;
        }
    } catch (_) {}
}

// --- Dirty-flag autosave (pattern da ReNew) ---
let __scoutingAutosaveDirty = false;
function __markScoutingAutosaveDirty() {
    __scoutingAutosaveDirty = true;
}
function __scheduleScoutingAutosave(delayMs = 1200) {
    try {
        if (!__scoutingAutosaveDirty) return;
        __scoutingAutosaveDirty = false;
        scheduleAutosave(delayMs, { reason: 'scouting-edit' });
    } catch(_) {}
}
// --- Fine dirty-flag autosave ---

function __persistCurrentSequenceQuick() {
    try {
        const raw = localStorage.getItem('currentScoutingSession');
        if (!raw) return;
        const sd = JSON.parse(raw);
        const cs = (window.appState && window.appState.currentSet) ? window.appState.currentSet : 1;
        sd.currentSequenceBySet = sd.currentSequenceBySet || {};
        sd.currentSequenceBySet[cs] = (window.appState && Array.isArray(window.appState.currentSequence)) ? window.appState.currentSequence : [];
        localStorage.setItem('currentScoutingSession', JSON.stringify(sd));
    } catch(_) {}
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
            // fallback da matchId (formato "TEAM NAME_timestamp")
            try {
                const _mid = String(md.id || md.matchId || '');
                const _ux = _mid.lastIndexOf('_');
                if (_ux > 0) { const _n = _mid.substring(0, _ux); if (_n && _n !== '-') return _n; }
            } catch(_) {}
            // fallback da vpa_owner_team in localStorage
            try {
                const _vpa = localStorage.getItem('vpa_owner_team');
                if (_vpa) return _vpa;
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
            md.actionsBySet = __normalizePerSetCollections(md.actionsBySet || {});
            md.scoreHistoryBySet = __normalizePerSetCollections(md.scoreHistoryBySet || {});
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
            // Cloud-only: nessun fallback da volleyMatches/volleyTeams localStorage
            // Il roster viene caricato da teamsModule (già tentato sopra) o dalla sessione di scouting
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
        // Persisti il roster nella sessione localStorage se trovato da fallback ma assente nella sessione
        try {
            if (appState.currentRoster.length > 0 && (!Array.isArray(md.roster) || md.roster.length === 0)) {
                md.roster = appState.currentRoster;
                try { localStorage.setItem('currentScoutingSession', JSON.stringify(md)); } catch(_) {}
            }
        } catch(_) {}
        try {
            const rosterMissing = !Array.isArray(appState.currentRoster) || appState.currentRoster.length === 0;
            const teamId = String(localStorage.getItem('selectedTeamId') || md?.teamId || '').trim();
            const selectedMatchId = String(localStorage.getItem('selectedMatchId') || '').trim();
            const sessionMatchId = String((md && (md.id || md.matchId)) || '').trim();
            const sessionMismatch = !!(selectedMatchId && sessionMatchId && selectedMatchId !== sessionMatchId);
            const matchId = String((selectedMatchId && (!sessionMatchId || sessionMismatch)) ? selectedMatchId : (sessionMatchId || selectedMatchId || '')).trim();

            const hasAnyDetails = (() => {
                try {
                    const a = md.actionsBySet && typeof md.actionsBySet === 'object' ? Object.keys(md.actionsBySet || {}).length : 0;
                    const sm = md.setMeta && typeof md.setMeta === 'object' ? Object.keys(md.setMeta || {}).length : 0;
                    const ss = md.setStateBySet && typeof md.setStateBySet === 'object' ? Object.keys(md.setStateBySet || {}).length : 0;
                    const sum = md.setSummary && typeof md.setSummary === 'object' ? Object.keys(md.setSummary || {}).length : 0;
                    const sh = md.scoreHistoryBySet && typeof md.scoreHistoryBySet === 'object' ? Object.keys(md.scoreHistoryBySet || {}).length : 0;
                    return (a + sm + ss + sum + sh) > 0;
                } catch (_) {
                    return false;
                }
            })();

            const hasProgressWithoutActions = (() => {
                try {
                    const progressed = new Set();
                    const sum = (md && md.setSummary && typeof md.setSummary === 'object') ? md.setSummary : {};
                    const st = (md && md.setStateBySet && typeof md.setStateBySet === 'object') ? md.setStateBySet : {};
                    for (let i = 1; i <= 6; i++) {
                        const s = sum[i] || {};
                        const si = st[i] || {};
                        const h = (s.home != null) ? Number(s.home || 0) : Number(si.homeScore || 0);
                        const a = (s.away != null) ? Number(s.away || 0) : Number(si.awayScore || 0);
                        if ((h > 0) || (a > 0)) progressed.add(String(i));
                    }
                    if (!progressed.size) return false;
                    const ab = (md && md.actionsBySet && typeof md.actionsBySet === 'object') ? md.actionsBySet : {};
                    for (const k of progressed) {
                        const v = __normalizeIndexedMapToArray(ab[k]);
                        if (Array.isArray(v) && v.length) return false;
                    }
                    return true;
                } catch (_) {
                    return false;
                }
            })();

            // Check aggiuntivo: se ci sono setMeta ma le azioni sono vuote per quei set → dati corrotti, serve idratazione
            const hasMetaWithoutActions = (() => {
                try {
                    const sm = (md && md.setMeta && typeof md.setMeta === 'object') ? md.setMeta : {};
                    const ab = (md && md.actionsBySet && typeof md.actionsBySet === 'object') ? md.actionsBySet : {};
                    const metaKeys = Object.keys(sm);
                    if (!metaKeys.length) return false;
                    for (const k of metaKeys) {
                        const acts = __normalizeIndexedMapToArray(ab[k]);
                        if (!Array.isArray(acts) || acts.length === 0) return true;
                    }
                    return false;
                } catch(_) { return false; }
            })();
            const needsHydration = (rosterMissing || sessionMismatch || !hasAnyDetails || hasProgressWithoutActions || hasMetaWithoutActions);
            const isAuthed = (window.authModule?.isAuthenticated?.() === true) || !!(window.authFunctions?.getCurrentUser?.());
            const role = (() => { try { return String(localStorage.getItem('selectedTeamRole') || '').trim(); } catch(_) { return ''; } })();
            const ownerId = (() => { try { return String(localStorage.getItem('selectedTeamOwner') || '').trim(); } catch(_) { return ''; } })();
            const sharedOwner = (() => { try { const raw = localStorage.getItem('selectedSharedTeamMeta'); const meta = raw ? JSON.parse(raw) : null; return String(meta?.owner || '').trim(); } catch(_) { return ''; } })();
            const ownerResolved = String(ownerId || sharedOwner || '').trim();
            const currentEmail = (() => { try { return String(window.authFunctions?.getCurrentUser?.()?.email || '').trim(); } catch(_) { return ''; } })();
            const shouldUseOwner = role === 'observer' || (!!ownerResolved && !!currentEmail && ownerResolved !== currentEmail);
            const canFirestore = !!(isAuthed && (window.firestoreService?.getMatchData || window.firestoreService?.getMatchDataByOwner));
            if (needsHydration && !window.__mvsHydratingMatchFromFirestore) {
                window.__mvsHydratingMatchFromFirestore = true;
                (async function(){
                    try {
                        if (!matchId || !teamId || !isAuthed) return;
                        let res = null;
                        if (shouldUseOwner && ownerResolved && window.firestoreService?.getMatchDataByOwner) {
                            res = await window.firestoreService.getMatchDataByOwner(ownerResolved, teamId, matchId);
                        } else if (window.firestoreService?.getMatchData) {
                            res = await window.firestoreService.getMatchData(teamId, matchId);
                        } else {
                            return;
                        }
                        if (!res?.success) return;
                        const next = Object.assign({}, md);
                        if (Array.isArray(res.roster) && res.roster.length) next.roster = res.roster;
                        if (res.details) {
                            const cloudActionsBySet = __normalizePerSetCollections(res.details.actionsBySet || {});
                            const localActionsBySet = __normalizePerSetCollections(next.actionsBySet || {});
                            Object.keys(cloudActionsBySet || {}).forEach((k) => {
                                const c = cloudActionsBySet[k];
                                const l = localActionsBySet[k];
                                if (!Array.isArray(l) || l.length === 0) localActionsBySet[k] = c;
                                else if (Array.isArray(c) && c.length > l.length) localActionsBySet[k] = c;
                            });
                            next.actionsBySet = localActionsBySet || {};

                            const cloudScoreHistoryBySet = __normalizePerSetCollections(res.details.scoreHistoryBySet || {});
                            const localScoreHistoryBySet = __normalizePerSetCollections(next.scoreHistoryBySet || {});
                            Object.keys(cloudScoreHistoryBySet || {}).forEach((k) => {
                                const c = cloudScoreHistoryBySet[k];
                                const l = localScoreHistoryBySet[k];
                                if (!Array.isArray(l) || l.length === 0) localScoreHistoryBySet[k] = c;
                                else if (Array.isArray(c) && c.length > l.length) localScoreHistoryBySet[k] = c;
                            });
                            next.scoreHistoryBySet = localScoreHistoryBySet || {};

                            next.setMeta = (next.setMeta && typeof next.setMeta === 'object') ? next.setMeta : {};
                            const cloudSetMeta = (res.details.setMeta && typeof res.details.setMeta === 'object') ? res.details.setMeta : {};
                            Object.keys(cloudSetMeta).forEach((k) => {
                                if (!next.setMeta[k]) next.setMeta[k] = cloudSetMeta[k];
                            });

                            next.setStateBySet = (next.setStateBySet && typeof next.setStateBySet === 'object') ? next.setStateBySet : {};
                            const cloudSetState = (res.details.setStateBySet && typeof res.details.setStateBySet === 'object') ? res.details.setStateBySet : {};
                            Object.keys(cloudSetState).forEach((k) => {
                                const localSt = next.setStateBySet[k];
                                const cloudSt = cloudSetState[k];
                                if (!localSt) { next.setStateBySet[k] = cloudSt; return; }
                                // Cloud vince se ha score più alti (il locale potrebbe avere 0:0 da reset)
                                const localTotal = Number(localSt.homeScore||0) + Number(localSt.awayScore||0);
                                const cloudTotal = Number(cloudSt.homeScore||0) + Number(cloudSt.awayScore||0);
                                if (cloudTotal > localTotal) next.setStateBySet[k] = cloudSt;
                            });

                            next.setSummary = (next.setSummary && typeof next.setSummary === 'object') ? next.setSummary : {};
                            const cloudSetSummary = (res.details.setSummary && typeof res.details.setSummary === 'object') ? res.details.setSummary : {};
                            Object.keys(cloudSetSummary).forEach((k) => {
                                if (!next.setSummary[k]) next.setSummary[k] = cloudSetSummary[k];
                            });
                        }
                        try { localStorage.setItem('currentScoutingSession', JSON.stringify(next)); } catch(_) {}
                        // Aggiorna direttamente appState.currentMatch con i dati idratati
                        try {
                            if (window.appState?.currentMatch) {
                                window.appState.currentMatch.actionsBySet = next.actionsBySet || {};
                                window.appState.currentMatch.scoreHistoryBySet = next.scoreHistoryBySet || {};
                                window.appState.currentMatch.setStateBySet = next.setStateBySet || {};
                                window.appState.currentMatch.setSummary = next.setSummary || {};
                            }
                            // Aggiorna roster se mancante
                            if (Array.isArray(next.roster) && next.roster.length && (!Array.isArray(window.appState?.currentRoster) || !window.appState.currentRoster.length)) {
                                window.appState.currentRoster = next.roster;
                            }
                        } catch(_) {}
                        // Ripristina dati del set corrente direttamente in appState e aggiorna UI
                        try {
                            const _curSet = window.appState?.currentSet || 1;
                            const _hActs = Array.isArray(next.actionsBySet?.[_curSet]) ? next.actionsBySet[_curSet] : [];
                            const _hHist = Array.isArray(next.scoreHistoryBySet?.[_curSet]) ? next.scoreHistoryBySet[_curSet] : [];
                            const _hState = next.setStateBySet?.[_curSet] || {};
                            const _hHome = Number(_hState.homeScore || 0);
                            const _hAway = Number(_hState.awayScore || 0);
                            const _hasData = (_hActs.length > 0 || _hHist.length > 0 || _hHome > 0 || _hAway > 0);
                            if (_hasData) {
                                window.appState.actionsLog = _hActs;
                                window.appState.scoreHistory = _hHist;
                                window.appState.homeScore = _hHome;
                                window.appState.awayScore = _hAway;
                                if (_hState.currentPhase) window.appState.currentPhase = _hState.currentPhase;
                                if (_hState.currentRotation) window.appState.currentRotation = (typeof normalizeRotation === 'function') ? normalizeRotation(_hState.currentRotation) : _hState.currentRotation;
                                window.appState.setStarted = true;
                                // Aggiorna UI
                                try { if (typeof updateMatchInfo === 'function') updateMatchInfo(); } catch(_) {}
                                try { if (typeof updateScoutingUI === 'function') updateScoutingUI(); } catch(_) {}
                                try { if (typeof updateCurrentPhaseDisplay === 'function') updateCurrentPhaseDisplay(); } catch(_) {}
                                try { if (typeof updatePlayersGrid === 'function') updatePlayersGrid(); } catch(_) {}
                                try { if (typeof updateScoreHistoryDisplay === 'function') updateScoreHistoryDisplay(); } catch(_) {}
                                try { if (typeof updateSetSidebarColors === 'function') updateSetSidebarColors(); } catch(_) {}
                                try { if (typeof renderRosterTable === 'function') renderRosterTable(); } catch(_) {}
                            }
                        } catch(_) {}
                        return;
                    } catch(_) {} finally {
                        try { window.__mvsHydratingMatchFromFirestore = false; } catch(_) {}
                    }
                })();
            }
        } catch(_) {}

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
            if (md.actionsBySet) {
                const perSet = md.actionsBySet[appState.currentSet];
                const normalized = __normalizeIndexedMapToArray(perSet);
                if (normalized !== perSet) md.actionsBySet[appState.currentSet] = normalized;
                if (Array.isArray(md.actionsBySet[appState.currentSet])) {
                    appState.actionsLog = md.actionsBySet[appState.currentSet] || [];
                }
            } else if (Array.isArray(md.actions) && md.actions.length > 0) {
                appState.actionsLog = md.actions;
            }
            // Punteggio da stato sintetico del set o dall'ultimo elemento dello storico
            try {
                const setState = md.setStateBySet && md.setStateBySet[cs];
                const ssHome = setState ? Number(setState.homeScore || 0) : 0;
                const ssAway = setState ? Number(setState.awayScore || 0) : 0;
                if (setState && (ssHome > 0 || ssAway > 0)) {
                    appState.homeScore = ssHome;
                    appState.awayScore = ssAway;
                    if (setState.currentPhase) appState.currentPhase = setState.currentPhase;
                    if (setState.currentRotation) appState.currentRotation = setState.currentRotation;
                } else if (Array.isArray(appState.scoreHistory) && appState.scoreHistory.length > 0) {
                    const last = appState.scoreHistory[appState.scoreHistory.length - 1];
                    if (last && typeof last.homeScore === 'number' && typeof last.awayScore === 'number') {
                        appState.homeScore = last.homeScore;
                        appState.awayScore = last.awayScore;
                    }
                } else if (setState) {
                    // Fallback: setStateBySet con zero (set appena iniziato)
                    appState.homeScore = ssHome;
                    appState.awayScore = ssAway;
                    if (setState.currentPhase) appState.currentPhase = setState.currentPhase;
                    if (setState.currentRotation) appState.currentRotation = setState.currentRotation;
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
                try { if (typeof updateSetSidebarColors === 'function') updateSetSidebarColors(); } catch (_) {}
            }
        } catch(_) {}

        try { localStorage.setItem('currentScoutingSession', JSON.stringify(md)); } catch (_) {}
        try { __lastSavedCoreSignature = __getCurrentCoreSignature(); } catch(_) {}
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

let __lastHandledSetHash = null;
function __parseSetFromHash() {
    try {
        const h = String(location.hash || '');
        const m = h.match(/^#\/set\/(\d+)\s*$/);
        const n = m ? parseInt(m[1], 10) : NaN;
        if (Number.isInteger(n) && n >= 1 && n <= 6) return n;
    } catch (_) {}
    return null;
}

function __getActiveSetNumber() {
    try {
        const n = (window.appState && Number.isInteger(window.appState.currentSet)) ? window.appState.currentSet : null;
        if (Number.isInteger(n) && n >= 1 && n <= 6) return n;
    } catch (_) {}
    return 1;
}

function __getActionsLogForSet(setNumber) {
    const logs = (window.appState && Array.isArray(window.appState.actionsLog)) ? window.appState.actionsLog : [];
    const hasTagged = logs.some(l => l && typeof l === 'object' && l.setNumber != null);
    if (!hasTagged) return logs;
    const sn = Number(setNumber);
    return logs.filter(l => l && typeof l === 'object' && Number(l.setNumber) === sn);
}

function __removeLastActionForSet(setNumber) {
    if (!window.appState || !Array.isArray(window.appState.actionsLog) || window.appState.actionsLog.length === 0) return;
    const logs = window.appState.actionsLog;
    const hasTagged = logs.some(l => l && typeof l === 'object' && l.setNumber != null);
    if (!hasTagged) {
        logs.pop();
        return;
    }
    const sn = Number(setNumber);
    for (let i = logs.length - 1; i >= 0; i--) {
        const l = logs[i];
        if (l && typeof l === 'object' && Number(l.setNumber) === sn) {
            logs.splice(i, 1);
            return;
        }
    }
}

function __setActiveSetButton(setNumber) {
    try {
        const list = document.getElementById('setToolbar');
        if (!list) return;
        list.querySelectorAll('.set-item').forEach(function (b) {
            if (b && b.dataset && b.dataset.set) {
                b.classList.remove('active');
                b.removeAttribute('aria-current');
            }
        });
        const btn = list.querySelector('.set-item[data-set="' + String(setNumber) + '"]');
        if (btn) {
            btn.classList.add('active');
            btn.setAttribute('aria-current', 'true');
        }
    } catch (_) {}
}

function __persistSetNumberToSession(setNumber) {
    try {
        const sessionData = JSON.parse(localStorage.getItem('currentScoutingSession') || '{}');
        sessionData.setConfig = sessionData.setConfig || {};
        sessionData.setConfig.set = setNumber;
        localStorage.setItem('currentScoutingSession', JSON.stringify(sessionData));
    } catch (_) {}
}

function goToSet(setNumber, options) {
    const n = parseInt(setNumber, 10);
    if (!Number.isInteger(n) || n < 1 || n > 6) return;
    const opts = options || {};
    const updateHash = opts.updateHash !== false;
    const allowUninitialized = !!opts.allowUninitialized;

    try {
        const isCompleted = (typeof __computeSetStatus === 'function') ? (__computeSetStatus(n) === 'completed') : false;
        if (!allowUninitialized && !isCompleted && !__getSetMetaPresence(n) && typeof window.openSetMetaDialog === 'function') {
            window.openSetMetaDialog(n, {
                onSkip: function(){
                    try { goToSet(n, { updateHash, allowUninitialized: true }); } catch(_) {}
                }
            });
            return;
        }
    } catch (_) {}

    try { saveCurrentMatch(); } catch (_) {}
    try { __markScoutingAutosaveDirty(); __scheduleScoutingAutosave(0); } catch (_) {}

    try { appState.currentSet = n; } catch (_) {}
    try { __persistSetNumberToSession(n); } catch (_) {}
    try { __setActiveSetButton(n); } catch (_) {}
    if (allowUninitialized) {
        try { appState.allowUninitializedSet = n; } catch(_) {}
    }

    if (updateHash) {
        const desired = '#/set/' + String(n);
        __lastHandledSetHash = desired;
        if (location.hash !== desired) location.hash = desired;
    }

    try {
        const hasScoutingUI = !!document.getElementById('players-grid');
        if (hasScoutingUI && typeof startSet === 'function') startSet();
    } catch (_) {}

    try { if (typeof updateSetSidebarColors === 'function') updateSetSidebarColors(); } catch (_) {}
}

window.goToSet = goToSet;

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
    const logs = Array.isArray(actionsBySet[setNum]) ? actionsBySet[setNum] : [];
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
      : buildScoreHistoryFromLogs(logs);
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
    function normalizePerSetKeyingToOneBased(map) {
        try {
            if (!map || typeof map !== 'object') return map;
            const keys = Object.keys(map);
            if (!keys.includes('0') || keys.includes('1')) return map;
            const nums = keys.map(k => Number(k)).filter(n => Number.isFinite(n));
            if (!nums.length) return map;
            const min = Math.min.apply(null, nums);
            const max = Math.max.apply(null, nums);
            if (min !== 0 || max > 5) return map;
            const out = {};
            keys.forEach((k) => {
                const n = Number(k);
                if (Number.isFinite(n)) out[String(n + 1)] = map[k];
                else out[k] = map[k];
            });
            return out;
        } catch (_) {
            return map;
        }
    }

    function mergePerSetPreferLonger(a, b) {
        const aa = (a && typeof a === 'object') ? a : {};
        const bb = (b && typeof b === 'object') ? b : {};
        const out = Object.assign({}, aa);
        const keys = new Set([].concat(Object.keys(aa), Object.keys(bb)));
        keys.forEach((k) => {
            const av = aa[k];
            const bv = bb[k];
            const aArr = Array.isArray(av) ? av : null;
            const bArr = Array.isArray(bv) ? bv : null;
            if (aArr && bArr) out[k] = (bArr.length > aArr.length) ? bv : av;
            else if (!aArr && bArr) out[k] = bv;
            else if (av !== undefined) out[k] = av;
            else if (bv !== undefined) out[k] = bv;
        });
        return out;
    }

    try {
        const selectedMatchId = (() => { try { return String(localStorage.getItem('selectedMatchId') || '').trim(); } catch (_) { return ''; } })();
        const effectiveMatchId = selectedMatchId || String(currentMatch?.id || '').trim();
        // Cloud-only: non si legge più da volleyMatches localStorage
        let storedMatch = null;
        const candidates = [];
        if (currentMatch) candidates.push(currentMatch);
        if (sessionDataCache) candidates.push(sessionDataCache);
        if (storedMatch) candidates.push(storedMatch);

        const summarySource = storedMatch || currentMatch || sessionDataCache || {};
        const _mr1228 = (summarySource.description || '').toLowerCase();
        const opponent = (_mr1228 === 'andata' ? '(A) ' : _mr1228 === 'ritorno' ? '(R) ' : '') + (summarySource.opponent || summarySource.opponentTeam || '');
        const rawDate = summarySource.matchDate || summarySource.date || summarySource.createdAt || '';
        const type = summarySource.matchType || summarySource.eventType || summarySource.type || 'partita';
        const formatItalianDate = (raw) => {
            const s = String(raw || '').trim();
            if (!s) return '';
            if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10).split('-').reverse().join('/');
            const d = new Date(s);
            if (Number.isFinite(d.getTime())) {
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                return [dd, mm, yyyy].join('/');
            }
            return s;
        };
        const oppEl = document.getElementById('ms-opponent');
        const dateEl = document.getElementById('ms-date');
        const typeEl = document.getElementById('ms-type');
        if (oppEl) oppEl.textContent = opponent || '-';
        if (dateEl) dateEl.textContent = rawDate ? formatItalianDate(rawDate) : '-';
        if (typeEl) typeEl.textContent = String(type || 'partita');
        const titleEl = document.getElementById('matchStatsTitle');
        if (titleEl) {
            const homeAwayRaw = summarySource.homeAway || summarySource.location || '';
            const homeAway = (homeAwayRaw === 'casa') ? 'home' : (homeAwayRaw === 'trasferta' ? 'away' : homeAwayRaw);
            const setSummary = summarySource.setSummary || summarySource.details?.setSummary || {};
            const setStateBySet = summarySource.setStateBySet || summarySource.details?.setStateBySet || {};
            const getSetScore = (i) => {
                const s = setSummary[i] || {};
                const st = setStateBySet[i] || {};
                const my = (s.home != null) ? Number(s.home || 0) : Number(st.homeScore || 0);
                const opp = (s.away != null) ? Number(s.away || 0) : Number(st.awayScore || 0);
                return { my, opp };
            };
            let mySets = 0;
            let oppSets = 0;
            for (let i = 1; i <= 6; i++) {
                const sc = getSetScore(i);
                if (!sc || (!(sc.my || 0) && !(sc.opp || 0))) continue;
                if (sc.my > sc.opp) mySets++;
                else if (sc.opp > sc.my) oppSets++;
            }
            const rawOutcome = String(summarySource.matchOutcome || summarySource.outcome || '').trim();
            let outcomeLabel = rawOutcome;
            if (!outcomeLabel && (mySets + oppSets) > 0) {
                outcomeLabel = mySets > oppSets ? 'Vinto' : (mySets < oppSets ? 'Perso' : 'Pari');
            }
            let resultLabel = '';
            if ((mySets + oppSets) > 0) {
                resultLabel = homeAway === 'away' ? `${oppSets}${mySets}` : `${mySets}${oppSets}`;
            } else {
                const rawResult = String(summarySource.finalResult || summarySource.scoreText || '').trim();
                if (rawResult) {
                    const digits = rawResult.replace(/\D/g, '');
                    if (digits.length >= 2) resultLabel = `${digits[0]}${digits[1]}`;
                    else resultLabel = rawResult;
                }
            }
            const parts = ['Match-Stats'];
            if (opponent) parts.push(`Vs ${opponent}`);
            if (outcomeLabel) parts.push(outcomeLabel);
            if (resultLabel) parts.push(resultLabel);
            titleEl.textContent = parts.join(' ').trim();
        }

        let merged = {};
        candidates.forEach((src) => {
            if (!src || typeof src !== 'object') return;
            const raw = src.actionsBySet || src.details?.actionsBySet || {};
            let normalized = __normalizePerSetCollections(raw || {});
            normalized = normalizePerSetKeyingToOneBased(normalized || {});
            merged = mergePerSetPreferLonger(merged, normalized || {});
        });
        if (merged && Object.keys(merged).length) {
            actionsBySet = merged;
            try {
                if (appState.currentMatch) appState.currentMatch.actionsBySet = merged;
            } catch (_) {}
        }
    } catch (_) {}

    const allLogs = Object.keys(actionsBySet || {})
        .sort((a,b)=>Number(a)-Number(b))
        .flatMap((k) => {
            const setNum = Number(k);
            const arr = Array.isArray(actionsBySet[k]) ? actionsBySet[k] : [];
            return arr.map((entry) => {
                if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
                    if (entry.setNumber == null && Number.isFinite(setNum)) return Object.assign({ setNumber: setNum }, entry);
                    return entry;
                }
                if (typeof entry === 'string') {
                    return { action: entry, setNumber: Number.isFinite(setNum) ? setNum : undefined };
                }
                return entry;
            });
        });

    // Lista giocatori: usa "players" della partita
    let roster = [];
    try {
        const matchPlayers = (currentMatch && Array.isArray(currentMatch.players)) ? currentMatch.players : [];
        if (matchPlayers.length) roster = matchPlayers;
    } catch(_) {}
    if (!roster || roster.length === 0) {
        try {
            const sessionData = sessionDataCache || JSON.parse(localStorage.getItem('currentScoutingSession') || '{}');
            const sp = Array.isArray(sessionData.players) ? sessionData.players : [];
            if (sp && sp.length) roster = sp;
        } catch(_) {}
    }
    if (!roster || roster.length === 0) {
        try {
            const matchRoster = (currentMatch && Array.isArray(currentMatch.roster)) ? currentMatch.roster : [];
            if (matchRoster.length) roster = matchRoster;
        } catch(_) {}
    }
    if (!roster || roster.length === 0) {
        try {
            const selectedTeamId =
                (appState?.myTeam?.id != null ? String(appState.myTeam.id) : null) ||
                (appState?.selectedTeamId != null ? String(appState.selectedTeamId) : null) ||
                (() => { try { return String(localStorage.getItem('selectedTeamId') || '').trim() || null; } catch(_) { return null; } })();

            // Cloud-only: si usa teamsModule per i dati del team
            let team = null;
            if (selectedTeamId && window.teamsModule && typeof window.teamsModule.getTeamById === 'function') {
                team = window.teamsModule.getTeamById(selectedTeamId);
            }
            const cand = team && Array.isArray(team.players) ? team.players : [];
            if (cand.length) roster = cand;
        } catch(_) {}
    }
    if (!roster || roster.length === 0) roster = Array.isArray(appState.currentRoster) ? appState.currentRoster : [];

    // Per ogni fondamentale, costruisci tabella in base al filtro set selezionato
    const selectedMap = appState.allSetFilterByFundamental || {};
    const activeFund = appState.matchStatsActiveFund || (() => { try { return localStorage.getItem('matchStatsActiveFund'); } catch(_) { return null; } })() || 'Attacco';
    ['Attacco','Servizio','Muro','Ricezione','Difesa'].forEach(fund => {
        let selectedSets = selectedMap[fund];
        // Compatibilità: se fosse stringa, trasformala in array
        if (!Array.isArray(selectedSets)) selectedSets = [selectedSets || 'ALL'];

        let logsForFund;
        if (selectedSets.includes('ALL') || selectedSets.length === 0) {
            logsForFund = allLogs;
        } else {
            const wanted = new Set(selectedSets.map(String).filter(s => s !== 'ALL'));
            logsForFund = allLogs.filter((entry) => {
                const sn = (entry && typeof entry === 'object') ? entry.setNumber : null;
                if (sn == null) return false;
                return wanted.has(String(sn));
            });
        }

        const agg = aggregateByPlayerAndFundamental(logsForFund);
        const tables = buildPerPlayerTablesAll(agg, roster, logsForFund);
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

    try {
        requestAnimationFrame(() => {
            try {
                document.querySelectorAll('#match-stats .simple-table').forEach((tbl) => {
                    const c1 = tbl.querySelector('tbody tr td:first-child') || tbl.querySelector('thead tr th:first-child') || tbl.querySelector('tr th:first-child') || tbl.querySelector('tr td:first-child');
                    const c2 = tbl.querySelector('tbody tr td:nth-child(2)') || tbl.querySelector('thead tr th:nth-child(2)') || tbl.querySelector('tr th:nth-child(2)') || tbl.querySelector('tr td:nth-child(2)');
                    if (!c1 || !c2) return;
                    const w1 = Math.round(c1.getBoundingClientRect().width);
                    const w2 = Math.round(c2.getBoundingClientRect().width);
                    tbl.style.setProperty('--sticky-left-2', (w1 || 48) + 'px');
                    tbl.style.setProperty('--sticky-left-3', ((w1 || 48) + (w2 || 48)) + 'px');
                });
            } catch (_) {}
        });
    } catch (_) {}

    try {
        document.querySelectorAll('#match-stats .fund-tab').forEach((btn) => {
            const fund = btn.getAttribute('data-fund');
            if (fund === activeFund) btn.classList.add('active');
            else btn.classList.remove('active');
        });
        document.querySelectorAll('#match-stats .report-row[data-fund]').forEach((row) => {
            const fund = row.getAttribute('data-fund');
            row.style.display = (fund === activeFund) ? '' : 'none';
        });
    } catch (_) {}

    const notesEl = document.getElementById('all-notes');
    if (notesEl) notesEl.innerHTML = '<div style="color:#64748b">Dati aggregati su tutti i set della gara.</div>';
}

// Trova una partita locale plausibile se appState.currentMatch manca
function getBestLocalMatch() {
    // Cloud-only: nessun match permanente in localStorage
    // I match vengono caricati esclusivamente da Firestore
    return null;
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

function sanitizeDisplayName(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const cleaned = raw.replace(/\d+/g, '').replace(/\s+/g, ' ').trim();
    return cleaned || raw;
}

function buildHeaderHTML() {
    return `<tr>
      <th style="min-width:48px;">N°</th>
      <th style="max-width:8ch;">Nick</th>
      <th>1</th><th>2</th><th>3</th><th>4</th><th>5</th>
      <th>Tot</th><th>%</th><th>Efficacia</th><th>Efficienza</th>
    </tr>`;
}

function buildPerPlayerTablesHTML(agg, roster) {
    const playerNameByNumber = {};
    if (Array.isArray(roster)) {
        const pick = (obj, keys) => {
            for (const k of keys) {
                const v = obj && obj[k];
                if (v !== undefined && v !== null && String(v).trim() !== '') return v;
            }
            return '';
        };
        roster.forEach(p => {
            const num = pick(p, ['number','numero','num','jersey','maglia']);
            if (num != null && String(num).trim() !== '') {
                const numStr = normalizeNumberStr(num);
                const surname = pick(p, ['surname','cognome','lastName','cognomi']);
                const name = pick(p, ['name','nome','firstName','nomi']);
                const nickname = pick(p, ['nickname','soprannome','nick']);
                const display = nickname || sanitizeDisplayName(nickname) || surname || name || '';
                playerNameByNumber[String(numStr)] = display;
            }
        });
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
      <th>N°</th>
      <th>R</th>
      <th>NICK</th>
      <th>#</th><th>+</th><th>\\</th><th>-</th><th>=</th>
      <th>Tot</th><th>%</th><th>Pos</th><th>Eff</th>
    </tr>`;
}

// Costruisce la barra di selezione set (1..6 e ALL) per una tabella
function buildSetFilterButtons(fund, selectedSets = ['ALL']) {
    const activeSet = new Set((Array.isArray(selectedSets) ? selectedSets : [selectedSets]).map(String));
    const mk = (label) => {
        const isActive = activeSet.has(String(label));
        const cls = `filter-btn` + (isActive ? ' active' : '');
        return `<button class="${cls}" data-set-filter="true" data-fund="${fund}" data-set="${label}">${label}</button>`;
    };
    return `<div class="set-filter">${mk('ALL')}${mk('1')}${mk('2')}${mk('3')}${mk('4')}${mk('5')}${mk('6')}</div>`;
}

// Versione All: colonne simboliche e metriche, righe = player
function buildPerPlayerTablesAll(agg, roster, logs = []) {
    const pick = (obj, keys) => {
        for (const k of keys) {
            const v = obj && obj[k];
            if (v !== undefined && v !== null && String(v).trim() !== '') return v;
        }
        return '';
    };
    const playerNameByNumber = {};
    const playerRoleByNumber = {};
    const rosterNumbers = [];
    if (Array.isArray(roster)) {
        roster.forEach(p => {
            const rawNum = pick(p, ['number','numero','num','jersey','maglia']);
            if (rawNum != null && String(rawNum).trim() !== '') {
                const numStr = normalizeNumberStr(rawNum);
                const surname = pick(p, ['surname','cognome','lastName','cognomi']);
                const name = pick(p, ['name','nome','firstName','nomi']);
                const nickname = pick(p, ['nickname','soprannome','nick']);
                const display = nickname || sanitizeDisplayName(nickname) || surname || name || '';
                playerNameByNumber[numStr] = display;
                const roleRaw = (pick(p, ['role','ruolo','position','posizione']) || '').trim();
                const role = roleRaw ? roleRaw.toUpperCase().slice(0, 1) : '';
                playerRoleByNumber[numStr] = role;
                rosterNumbers.push(numStr);
            }
        });
    }
    const header = buildHeaderSymbolsHTML();
    const tables = {};
    const normalizeCounts = (counts) => ({
        1: Number(counts?.[1] || 0),
        2: Number(counts?.[2] || 0),
        3: Number(counts?.[3] || 0),
        4: Number(counts?.[4] || 0),
        5: Number(counts?.[5] || 0)
    });
    const clampNonNegative = (value) => {
        const num = Number(value || 0);
        return num < 0 ? 0 : num;
    };
    const computeAvvRallyCounts = (items) => {
        let soloAvv = 0;
        let avvAfterTouch = 0;
        (Array.isArray(items) ? items : []).forEach((entry) => {
            const actionString = (entry && typeof entry.action === 'string')
                ? entry.action
                : (typeof entry === 'string' ? entry : '');
            if (!actionString) return;
            let parsed;
            try {
                parsed = parseAction(actionString);
            } catch (_) {
                return;
            }
            const hasAvv = /avv/i.test(actionString);
            if (!hasAvv) return;
            const hasActions = Array.isArray(parsed?.actions) && parsed.actions.length > 0;
            if (hasActions) avvAfterTouch++;
            else soloAvv++;
        });
        return { soloAvv, avvAfterTouch };
    };
    const buildOpponentTotals = (items) => {
        const myAtt = normalizeCounts(agg?.Attacco?.teamTotal);
        const myServ = normalizeCounts(agg?.Servizio?.teamTotal);
        const myDef = normalizeCounts(agg?.Difesa?.teamTotal);
        const myRec = normalizeCounts(agg?.Ricezione?.teamTotal);
        const myMuro = normalizeCounts(agg?.Muro?.teamTotal);
        const { soloAvv, avvAfterTouch } = computeAvvRallyCounts(items);
        const oppAtt2 = clampNonNegative(myDef[4] - myAtt[4] - myServ[4] - myMuro[4]);
        const oppDef45 = clampNonNegative(myAtt[2]);
        const oppRec45 = clampNonNegative(myServ[2]);
        return {
            Attacco: {
                5: clampNonNegative(myDef[1]),
                4: clampNonNegative(myDef[2]),
                3: clampNonNegative(myDef[3]),
                2: oppAtt2,
                1: clampNonNegative(avvAfterTouch)
            },
            Servizio: {
                5: clampNonNegative(myRec[1]),
                4: clampNonNegative(myRec[2]),
                3: clampNonNegative(myRec[3]),
                2: clampNonNegative(myRec[4]),
                1: clampNonNegative(soloAvv)
            },
            Difesa: {
                5: 0,
                4: oppDef45,
                3: clampNonNegative(myAtt[3]),
                2: clampNonNegative(myAtt[4]),
                1: clampNonNegative(myAtt[5])
            },
            Ricezione: {
                5: 0,
                4: oppRec45,
                3: clampNonNegative(myServ[3]),
                2: clampNonNegative(myServ[4]),
                1: clampNonNegative(myServ[5])
            },
            Muro: {
                5: 0,
                4: 0,
                3: 0,
                2: 0,
                1: 0
            }
        };
    };
    const opponentTotals = buildOpponentTotals(logs);
    const buildAggregatesRows = (counts, total) => {
        const c = normalizeCounts(counts);
        const sum345 = c[3] + c[4] + c[5];
        const sum12 = c[1] + c[2];
        const pct = (v) => total ? `${Math.round((v / total) * 100)}%` : '0%';
        return `<tr style="font-weight:600;">
            <td colspan="3"></td>
            <td colspan="3">${pct(sum345)}</td>
            <td colspan="2">${pct(sum12)}</td>
            <td colspan="4"></td>
        </tr>
        <tr>
            <td colspan="3"></td>
            <td colspan="3">${sum345}</td>
            <td colspan="2">${sum12}</td>
            <td colspan="4"></td>
        </tr>`;
    };
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
            const role = playerRoleByNumber[numStr] || '';
            const cog = (() => {
                const n = String(name || '').trim();
                if (!n) return '';
                const first = n.split(/\s+/).filter(Boolean)[0] || '';
                return first.toUpperCase().slice(0, 5);
            })();
            rows += `<tr>
                <td>${formatJersey(numStr)}</td>
                <td>${escapeHtml(role)}</td>
                <td title="${escapeHtml(name)}">${escapeHtml(cog)}</td>
                <td>${c[5]}</td><td>${c[4]}</td><td>${c[3]}</td><td>${c[2]}</td><td>${c[1]}</td>
                <td>${tot}</td>
                <td>${share}</td>
                <td>${computeEfficacia(fund, c)}</td>
                <td>${computeEfficienzaFund(fund, c)}</td>
            </tr>`;
        }

        const footer = `<tr class="total-row" style="font-weight:600;background:#f1f5f9;">
            <td colspan="3">TOTALE</td>
            <td>${teamCounts[5]}</td><td>${teamCounts[4]}</td><td>${teamCounts[3]}</td><td>${teamCounts[2]}</td><td>${teamCounts[1]}</td>
            <td>${teamTotal}</td>
            <td>100%</td>
            <td>${computeEfficacia(fund, teamCounts)}</td>
            <td>${computeEfficienzaFund(fund, teamCounts)}</td>
        </tr>`;
        const pct = (x) => teamTotal ? `${Math.round((x/teamTotal)*100)}%` : '0%';
        const percentFooter = `<tr style="background:#f8fafc;">
            <td colspan="3">% su Tot</td>
            <td>${pct(teamCounts[5])}</td><td>${pct(teamCounts[4])}</td><td>${pct(teamCounts[3])}</td><td>${pct(teamCounts[2])}</td><td>${pct(teamCounts[1])}</td>
            <td>100%</td>
            <td></td><td></td><td></td>
        </tr>`;
        const teamAggRows = (fund === 'Ricezione' || fund === 'Difesa')
            ? buildAggregatesRows(teamCounts, teamTotal)
            : '';
        const oppCountsRaw = opponentTotals?.[fund] || {1:0,2:0,3:0,4:0,5:0};
        const oppCounts = normalizeCounts(oppCountsRaw);
        const oppTotal = oppCounts[1]+oppCounts[2]+oppCounts[3]+oppCounts[4]+oppCounts[5];
        const oppPct = (x) => oppTotal ? `${Math.round((x/oppTotal)*100)}%` : '0%';
        const oppFooter = `<tr class="total-row" style="font-weight:600;background:#eef2ff;">
            <td colspan="3">TOTALE AVV</td>
            <td>${oppCounts[5]}</td><td>${oppCounts[4]}</td><td>${oppCounts[3]}</td><td>${oppCounts[2]}</td><td>${oppCounts[1]}</td>
            <td>${oppTotal}</td>
            <td>100%</td>
            <td>${computeEfficacia(fund, oppCounts)}</td>
            <td>${computeEfficienzaFund(fund, oppCounts)}</td>
        </tr>`;
        const oppPercentFooter = `<tr style="background:#f5f7ff;">
            <td colspan="3">AVV % su Tot</td>
            <td>${oppPct(oppCounts[5])}</td><td>${oppPct(oppCounts[4])}</td><td>${oppPct(oppCounts[3])}</td><td>${oppPct(oppCounts[2])}</td><td>${oppPct(oppCounts[1])}</td>
            <td>100%</td>
            <td></td><td></td><td></td>
        </tr>`;
        const oppAggRows = (fund === 'Ricezione' || fund === 'Difesa')
            ? buildAggregatesRows(oppCounts, oppTotal)
            : '';
        tables[fund] = `<table class="simple-table">${header}${rows}${footer}${percentFooter}${teamAggRows}${oppFooter}${oppPercentFooter}${oppAggRows}</table>`;
    });
    return tables;
}


function initializeApp() {
    try {
        try {
            const settings = __readAppSettings();
            appState.multiLineLayout = true;
        } catch(_) {}
        let __localRosterRepairUpdated = 0;
        try {
            const localRes = __repairHistoricalMatchRostersLocal();
            __localRosterRepairUpdated = Number(localRes?.updated || 0);
        } catch(_) {}
        try {
            Promise.resolve(__repairHistoricalMatchRostersCloud())
                .then((cloudRes) => {
                    const cloudUpdated = Number(cloudRes?.updated || 0);
                    __showRosterRepairToast(__localRosterRepairUpdated, cloudUpdated);
                })
                .catch(() => {
                    __showRosterRepairToast(__localRosterRepairUpdated, 0);
                });
        } catch(_) {
            __showRosterRepairToast(__localRosterRepairUpdated, 0);
        }
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
        // Cloud-only: la riparazione dei team viene gestita in Firestore, rimosso accesso a volleyTeams localStorage

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
                    selected = selected.map(String);

                    if (set === 'ALL') {
                        selected = ['ALL'];
                    } else {
                        const label = String(set);
                        selected = selected.filter(s => s !== 'ALL');
                        const idx = selected.indexOf(label);
                        if (idx >= 0) selected.splice(idx, 1);
                        else selected.push(label);
                        if (selected.length === 0) selected = ['ALL'];
                        else {
                            selected = selected
                                .slice()
                                .sort((a, b) => Number(a) - Number(b))
                                .map(String);
                        }
                    }

                    appState.allSetFilterByFundamental[fund] = selected;
                    try {
                        const hasMatchStatsDom = !!document.getElementById('all-attacco') || !!document.getElementById('all-battuta');
                        const isMatchStatsPath = /\/?match-stats\.html/i.test(String(location?.pathname || ''));
                        if ((hasMatchStatsDom || isMatchStatsPath) && typeof window.renderMatchStats === 'function') {
                            window.renderMatchStats();
                        } else if (typeof window.renderReportRiepilogoAll === 'function') {
                            window.renderReportRiepilogoAll();
                        }
                    } catch (e) {
                        console.warn('Render filtro set errore:', e);
                    }
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
        const accountEmailNode = document.getElementById('accountEmail');
        function resolveMenuAccountEmail() {
            try {
                const e = String(window.authFunctions?.getCurrentUser?.()?.email || '').trim();
                if (e) return e;
            } catch (_) {}
            try {
                const e = String(window.authModule?.getCurrentUser?.()?.email || '').trim();
                if (e) return e;
            } catch (_) {}
            try {
                const e = String(window.auth?.currentUser?.email || '').trim();
                if (e) return e;
            } catch (_) {}
            return '';
        }
        function refreshMenuAccountEmail() {
            if (!accountEmailNode) return;
            const email = resolveMenuAccountEmail();
            accountEmailNode.textContent = email || 'Caricamento...';
        }
        refreshMenuAccountEmail();
        setTimeout(refreshMenuAccountEmail, 600);
        setTimeout(refreshMenuAccountEmail, 1500);
        try {
            if (window.authFunctions?.onAuthStateChanged) {
                window.authFunctions.onAuthStateChanged((user) => {
                    if (!accountEmailNode) return;
                    accountEmailNode.textContent = String(user?.email || '').trim() || 'Non autenticato';
                });
            }
        } catch (_) {}
        if (headerMenuToggle && headerMenu) {
            headerMenuToggle.addEventListener('click', () => {
                const isHidden = headerMenu.hasAttribute('hidden');
                if (isHidden) headerMenu.removeAttribute('hidden'); else headerMenu.setAttribute('hidden', '');
                headerMenuToggle.setAttribute('aria-expanded', (!isHidden).toString());
                refreshMenuAccountEmail();
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
                    let cleanupRequested = false;
                    try {
                        const matchId = String(window.appState?.currentMatch?.id || localStorage.getItem('selectedMatchId') || '').trim();
                        if (matchId) {
                            cleanupRequested = await __askConfirm('Vuoi eliminare i salvataggi automatici pregressi di questa partita?', {
                                title: 'Pulizia autosalvataggi',
                                okText: 'Elimina',
                                cancelText: 'Mantieni',
                                variant: 'danger'
                            });
                        }
                    } catch(_) {}
                    cancelAutosave();
                    const ok = await saveCurrentMatch({ mode: 'manual' });
                    if (ok) {
                        let cleaned = false;
                        try {
                            const matchId = String(window.appState?.currentMatch?.id || localStorage.getItem('selectedMatchId') || '').trim();
                            if (matchId && cleanupRequested) cleaned = __cleanupAllPartialSavesForMatch(matchId);
                        } catch(_) {}
                        await __showAlert(cleaned ? 'Partita salvata. Salvataggi automatici pregressi eliminati.' : 'Partita salvata.', { title: 'Salvataggio completato', okText: 'OK' });
                    }
                    else {
                        const reason = String(window.__mvsLastSaveError || '').trim();
                        const isAuthError = reason.includes('autenticato') || reason.includes('auth');
                        if (isAuthError) {
                            const goLogin = await __askConfirm(
                                `Errore nel salvataggio della partita.\n${reason}\n\nVuoi andare alla pagina di login?`,
                                { title: 'Salvataggio non riuscito', okText: 'Vai al Login', cancelText: 'Rimani qui' }
                            );
                            if (goLogin) {
                                try { window.location.href = '/auth-login.html'; } catch(_) {}
                            }
                        } else {
                            await __showAlert(reason ? (`Errore nel salvataggio della partita.\n${reason}`) : 'Errore nel salvataggio della partita.', { title: 'Salvataggio non riuscito', okText: 'OK' });
                        }
                    }
                    try { saveMatchBtn.textContent = originalText || '💾 Salva'; } catch(_){}
                } catch (error) {
                    console.error('Errore nel salvataggio partita:', error);
                    await __showAlert('Errore nel salvataggio della partita.', { title: 'Salvataggio non riuscito', okText: 'OK' });
                } finally {
                    saveMatchBtn.disabled = false;
                    if (headerMenu) headerMenu.setAttribute('hidden', '');
                    if (headerMenuToggle) headerMenuToggle.setAttribute('aria-expanded', 'false');
                }
            });
        }
        if (goToMatchesBtnMobile) {
            goToMatchesBtnMobile.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                    const ok = await __confirmSaveBeforeExit();
                    if (!ok) return;
                    window.location.href = '/matches.html';
                } finally {
                    if (headerMenu) headerMenu.setAttribute('hidden', '');
                    if (headerMenuToggle) headerMenuToggle.setAttribute('aria-expanded', 'false');
                }
            });
        }
        if (goToTeamsBtnMobile) {
            goToTeamsBtnMobile.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                    const ok = await __confirmSaveBeforeExit();
                    if (!ok) return;
                    window.location.href = '/my-teams.html';
                } finally {
                    if (headerMenu) headerMenu.setAttribute('hidden', '');
                    if (headerMenuToggle) headerMenuToggle.setAttribute('aria-expanded', 'false');
                }
            });
        }
        // Voce: Esci (torna alla pagina di benvenuto)
        if (exitToWelcomeBtnMobile) {
            exitToWelcomeBtnMobile.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                    const ok = await __confirmSaveBeforeExit();
                    if (!ok) return;
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
                        await __showAlert('Funzione di esportazione non disponibile su questa pagina. Apri la pagina principale per esportare.', { title: 'Esportazione', okText: 'OK' });
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
                    const ok = await __confirmSaveBeforeExit();
                    if (!ok) return;
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
                        try {
                            const isScoutingPage = /scouting\.html$/i.test(String(location.pathname || '')) || !!document.getElementById('players-grid');
                            const isInitialized = (typeof __getSetMetaPresence === 'function') ? __getSetMetaPresence(n) : true;
                            const isCompleted = (typeof __computeSetStatus === 'function') ? (__computeSetStatus(n) === 'completed') : false;
                            if (!isInitialized && !isCompleted && typeof window.openSetMetaDialog === 'function') {
                                window.openSetMetaDialog(n);
                                setSidebarOpen(false);
                                return;
                            }
                            if (isScoutingPage && typeof window.goToSet === 'function') {
                                let ok = false;
                                try {
                                    window.goToSet(n);
                                    ok = true;
                                } finally {
                                    if (ok) setSidebarOpen(false);
                                }
                            } else {
                                location.href = `scouting.html#/set/${n}`;
                            }
                        } catch (_) {
                            location.href = `scouting.html#/set/${n}`;
                        }
                    }
                });
            }
        } catch(_) {}

        // Toggle edit mode (multiline sempre attivo)
        try {
            const layoutToggle = document.getElementById('edit-mode-toggle');
            if (layoutToggle) {
                appState.multiLineLayout = true;
                layoutToggle.checked = !!appState.editRowsMode;
                layoutToggle.addEventListener('change', () => {
                    appState.editRowsMode = layoutToggle.checked;
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

        // Gestione routing hash per set (es. scouting.html#/set/2)
        try {
            const applyHashSet = () => {
                try {
                    if (__lastHandledSetHash && String(location.hash || '') === __lastHandledSetHash) {
                        __lastHandledSetHash = null;
                        return;
                    }
                    const n = __parseSetFromHash();
                    if (n && typeof __getSetMetaPresence === 'function' && !__getSetMetaPresence(n) && typeof window.openSetMetaDialog === 'function') {
                        // Non mostrare dialog se il set è completed (punteggio finale raggiunto)
                        const _setStatus = (typeof __computeSetStatus === 'function') ? __computeSetStatus(n) : null;
                        if (_setStatus !== 'completed') {
                            window.openSetMetaDialog(n);
                            return;
                        }
                    }
                    if (n && typeof window.goToSet === 'function') {
                        window.goToSet(n, { updateHash: false });
                    }
                } catch (_) {}
            };
            applyHashSet();
            if (!window.__mvsHashSetListenerAttached) {
                window.__mvsHashSetListenerAttached = true;
                window.addEventListener('hashchange', applyHashSet);
            }
        } catch (_) {}

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
function __isAutosaveDisabled() {
    try { if (window.__mvsDisableAutosave) return true; } catch(_) {}
    try {
        const role = localStorage.getItem('selectedTeamRole');
        if (role === 'observer') {
            const path = String((location && location.pathname) || '');
            if (/match-stats\.html/i.test(path)) return true;
        }
    } catch(_) {}
    return false;
}
function scheduleAutosave(delayMs = 1500, options = {}) {
    try {
        const reason = String(options && options.reason ? options.reason : '').trim().toLowerCase();
        if (reason !== 'scouting-edit') return;
        if (__isAutosaveDisabled()) return;
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
function __buildCurrentSavePayloadSnapshot(opts) {
    try {
        const persistSession = !!(opts && opts.persistSession);
        const sessionRaw = localStorage.getItem('currentScoutingSession');
        let sessionData = {};
        try { if (sessionRaw) sessionData = JSON.parse(sessionRaw); } catch(_) {}

        const currentMatch = window.appState?.currentMatch || {};
        let setupData = {};
        try { setupData = JSON.parse(localStorage.getItem('currentMatchSetup') || '{}') || {}; } catch(_) { setupData = {}; }
        if (!sessionData.id) {
            const selId = localStorage.getItem('selectedMatchId') || '';
            sessionData.id = currentMatch.id || setupData.id || (selId ? selId : null);
        }
        if (!sessionData.opponent && !sessionData.opponentTeam) {
            sessionData.opponentTeam = currentMatch.opponentTeam || currentMatch.awayTeam || setupData.opponentTeam || setupData.opponent || '';
        }
        if (!sessionData.matchDate) {
            sessionData.matchDate = currentMatch.date || setupData.matchDate || setupData.date || '';
        }
        if (!sessionData.eventType) {
            sessionData.eventType = currentMatch.matchType || setupData.eventType || setupData.matchType || '';
        }
        if (!sessionData.location && !sessionData.homeAway) {
            sessionData.location = currentMatch.homeAway ? (currentMatch.homeAway === 'home' ? 'casa' : 'trasferta') : (setupData.location || '');
        }

        const currentTeam = window.teamsModule?.getCurrentTeam?.();
        const selectedTeamId = localStorage.getItem('selectedTeamId') || sessionData.teamId || (currentTeam?.id != null ? String(currentTeam.id) : null);
        const actions = (window.appState && Array.isArray(window.appState.actionsLog)) ? window.appState.actionsLog : [];
        const scoreHistory = (window.appState && Array.isArray(window.appState.scoreHistory)) ? window.appState.scoreHistory : [];

        // Aggiorna actionsBySet con le azioni del set corrente
        try {
            const currentSetNum = (window.appState && window.appState.currentSet) ? window.appState.currentSet : 1;
            // Azioni per set
            sessionData.actionsBySet = __normalizePerSetCollections(sessionData.actionsBySet || (window.appState?.currentMatch?.actionsBySet) || {});
            // Storico punteggio per set
            sessionData.scoreHistoryBySet = __normalizePerSetCollections(sessionData.scoreHistoryBySet || (window.appState?.currentMatch?.scoreHistoryBySet) || {});
            // Stato sintetico del set
            sessionData.setStateBySet = sessionData.setStateBySet || (window.appState?.currentMatch?.setStateBySet) || {};

            // NON sovrascrivere dati del set corrente se:
            // 1) L'idratazione da Firestore è in corso (i dati correnti sono provvisori/vuoti)
            // 2) I dati correnti sono vuoti ma quelli esistenti sono significativi
            const _existingActions = Array.isArray(sessionData.actionsBySet[currentSetNum]) ? sessionData.actionsBySet[currentSetNum] : [];
            const _existingHistory = Array.isArray(sessionData.scoreHistoryBySet[currentSetNum]) ? sessionData.scoreHistoryBySet[currentSetNum] : [];
            const _existingState = sessionData.setStateBySet[currentSetNum] || {};
            const _existingTotal = Number(_existingState.homeScore||0) + Number(_existingState.awayScore||0);
            const _currentTotal = ((window.appState?.homeScore||0) + (window.appState?.awayScore||0));
            const _currentHasData = (actions.length > 0 || scoreHistory.length > 0 || _currentTotal > 0);
            const _existingHasData = (_existingActions.length > 0 || _existingHistory.length > 0 || _existingTotal > 0);
            const _isHydrating = !!window.__mvsHydratingMatchFromFirestore;

            // Se idratazione in corso e dati correnti vuoti → non scrivere (evita di corrompere dati in arrivo dal cloud)
            const _shouldWriteSetData = !_isHydrating && (_currentHasData || !_existingHasData);
            if (_shouldWriteSetData) {
                sessionData.actionsBySet[currentSetNum] = actions;
                sessionData.scoreHistoryBySet[currentSetNum] = scoreHistory;
                sessionData.setStateBySet[currentSetNum] = {
                    homeScore: (window.appState && typeof window.appState.homeScore === 'number') ? window.appState.homeScore : 0,
                    awayScore: (window.appState && typeof window.appState.awayScore === 'number') ? window.appState.awayScore : 0,
                    currentPhase: (window.appState && window.appState.currentPhase) ? window.appState.currentPhase : 'servizio',
                    currentRotation: (window.appState && window.appState.currentRotation) ? window.appState.currentRotation : 'P1',
                    setStarted: !!(window.appState && window.appState.setStarted)
                };
            }
            if (persistSession) {
                try { localStorage.setItem('currentScoutingSession', JSON.stringify(sessionData)); } catch(_) {}
            }
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
                return null;
            }
            sessionData.id = matchId;
            if (persistSession) {
                try { localStorage.setItem('currentScoutingSession', JSON.stringify(sessionData)); } catch(_) {}
            }
        }

        // Migrazione ID: se esiste selectedMatchId e differisce, allinea la sessione e lo stato
        try {
            const selectedId = localStorage.getItem('selectedMatchId');
            if (selectedId && selectedId !== matchId) {
                matchId = selectedId;
                sessionData.id = selectedId;
                try { if (window.appState?.currentMatch) window.appState.currentMatch.id = selectedId; } catch(_) {}
                if (persistSession) {
                    try { localStorage.setItem('currentScoutingSession', JSON.stringify(sessionData)); } catch(_) {}
                }
            }
        } catch(_) {}

        try {
            if (selectedTeamId && !sessionData.teamId) {
                sessionData.teamId = selectedTeamId;
                if (persistSession) {
                    try { localStorage.setItem('currentScoutingSession', JSON.stringify(sessionData)); } catch(_) {}
                }
            }
        } catch(_) {}

        const __label = __computeMatchStatusLabel(sessionData);
        const __code = __mapMatchStatusCode(__label);
        const rosterForSave = (() => {
            const r1 = Array.isArray(sessionData.roster) ? sessionData.roster : null;
            if (r1 && r1.length) return r1;
            const r2 = (window.appState && Array.isArray(window.appState.currentRoster)) ? window.appState.currentRoster : null;
            if (r2 && r2.length) return r2;
            // Fallback: prova dal match corrente (players)
            const r3 = Array.isArray(currentMatch?.players) ? currentMatch.players : (Array.isArray(currentMatch?.roster) ? currentMatch.roster : null);
            if (r3 && r3.length) return r3;
            // Fallback: prova dal setup della partita
            try {
                const setup = JSON.parse(localStorage.getItem('currentMatchSetup') || '{}');
                const r4 = Array.isArray(setup?.roster) ? setup.roster : (Array.isArray(setup?.players) ? setup.players : null);
                if (r4 && r4.length) return r4;
            } catch(_) {}
            // Fallback: prova dal team corrente
            try {
                const team = window.teamsModule?.getCurrentTeam?.();
                const r5 = Array.isArray(team?.players) ? team.players : null;
                if (r5 && r5.length) return r5;
            } catch(_) {}
            return [];
        })();
        const fallbackRoster = (() => {
            const out = [];
            try {
                if (Array.isArray(window.appState?.currentRoster)) out.push(...window.appState.currentRoster);
            } catch(_) {}
            try {
                const setup = JSON.parse(localStorage.getItem('currentMatchSetup') || '{}');
                const arr = Array.isArray(setup?.roster) ? setup.roster : (Array.isArray(setup?.players) ? setup.players : []);
                if (Array.isArray(arr)) out.push(...arr);
            } catch(_) {}
            try {
                const team = window.teamsModule?.getCurrentTeam?.();
                const arr = Array.isArray(team?.players) ? team.players : [];
                if (Array.isArray(arr)) out.push(...arr);
            } catch(_) {}
            return out;
        })();
        const rosterForSaveFixed = __enrichRosterForPersistence(rosterForSave, fallbackRoster);
        return {
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
            setMeta: sessionData.setMeta || {},
            setSummary: sessionData.setSummary || {},
            roster: rosterForSaveFixed,
            sessionStartTime: sessionData.startTime || null,
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
        };
    } catch (error) {
        console.warn('__buildCurrentSavePayloadSnapshot errore:', error);
        return null;
    }
}

function __getCurrentCoreSignature() {
    const snap = __buildCurrentSavePayloadSnapshot();
    return snap ? __coreSignatureFromPayload(snap) : null;
}

function __needsSavePromptOnExit() {
    try {
        // 1) Controllo classico: signature cambiata
        const sig = __getCurrentCoreSignature();
        if (sig) {
            if (!__lastSavedCoreSignature) return true;
            if (sig !== __lastSavedCoreSignature) return true;
        }
        // 2) Se c'è una sessione di scouting attiva, serve il prompt per fare cleanup
        try {
            const session = localStorage.getItem('currentScoutingSession');
            if (session && session !== '{}' && session !== 'null') return true;
        } catch(_) {}
        // 3) Se ci sono partial saves per il match corrente, serve il prompt per fare cleanup
        try {
            const matchId = String(window.appState?.currentMatch?.id || localStorage.getItem('selectedMatchId') || '').trim();
            if (matchId) {
                const map = __readPartialSavesMap();
                if (map && Object.prototype.hasOwnProperty.call(map, matchId)) return true;
            }
        } catch(_) {}
        return false;
    } catch (_) {
        return false;
    }
}

async function __confirmSaveBeforeExit() {
    try {
        const settings = __readAppSettings();
        if (settings.confirmSaveBeforeExit === false) return true;
        if (!__needsSavePromptOnExit()) return true;
        const doSave = await __askConfirm('I dati dell’autosave non coincidono con lo stato attuale. Vuoi eseguire “Salva” prima di uscire?', {
            title: 'Conferma uscita',
            okText: 'Salva ora',
            cancelText: 'Esci senza salvare'
        });
        if (!doSave) {
            // Esci senza salvare: pulisci comunque i dati di autosave/sessione
            try { cancelAutosave(); } catch(_) {}
            try {
                const _matchId = String(window.appState?.currentMatch?.id || localStorage.getItem('selectedMatchId') || '').trim();
                if (_matchId) __cleanupAllPartialSavesForMatch(_matchId);
                localStorage.removeItem('currentScoutingSession');
                localStorage.removeItem('currentMatchSetup');
                localStorage.removeItem('allowScoutingEntry');
            } catch(_) {}
            return true;
        }
        try { cancelAutosave(); } catch(_) {}
        const ok = await saveCurrentMatch({ mode: 'manual' });
        if (ok === false) {
            const reason = String(window.__mvsLastSaveError || '').trim();
            await __showAlert(reason ? (`Salvataggio non riuscito. Rimango nella pagina.\n${reason}`) : 'Salvataggio non riuscito. Rimango nella pagina.', { title: 'Conferma uscita', okText: 'OK' });
            return false;
        }
        // Salvataggio riuscito: pulizia dati autosave della partita corrente
        try {
            const _matchId = String(window.appState?.currentMatch?.id || localStorage.getItem('selectedMatchId') || '').trim();
            if (_matchId) __cleanupAllPartialSavesForMatch(_matchId);
            localStorage.removeItem('currentScoutingSession');
            localStorage.removeItem('currentMatchSetup');
            localStorage.removeItem('allowScoutingEntry');
        } catch(_) {}
        return true;
    } catch (_) {
        return true;
    }
}

function __resolveCurrentUserCompat() {
    try {
        if (typeof authFunctions !== 'undefined' && typeof authFunctions.getCurrentUser === 'function') {
            const user = authFunctions.getCurrentUser();
            if (user) return user;
        }
    } catch (_) {}
    try {
        if (window.authFunctions && typeof window.authFunctions.getCurrentUser === 'function') {
            const user = window.authFunctions.getCurrentUser();
            if (user) return user;
        }
    } catch (_) {}
    try {
        if (window.authModule && typeof window.authModule.getCurrentUser === 'function') {
            const user = window.authModule.getCurrentUser();
            if (user) return user;
        }
    } catch (_) {}
    try {
        if (window.auth && window.auth.currentUser) return window.auth.currentUser;
    } catch (_) {}
    return null;
}

async function __waitForAuthUserReady(maxWaitMs = 5000) {
    const timeoutMs = Math.max(0, Number(maxWaitMs || 0));
    const immediate = __resolveCurrentUserCompat();
    if (immediate) return immediate;
    // Usa onAuthStateChanged per rilevare quando Firebase risolve lo stato auth
    return new Promise((resolve) => {
        let done = false;
        let unsubscribe = null;
        const timer = setTimeout(() => {
            if (done) return;
            done = true;
            try { if (unsubscribe) unsubscribe(); } catch(_) {}
            resolve(__resolveCurrentUserCompat());
        }, timeoutMs);
        try {
            const authSrc = window.auth;
            if (authSrc && typeof authSrc.onAuthStateChanged === 'function') {
                unsubscribe = authSrc.onAuthStateChanged((user) => {
                    if (done) return;
                    done = true;
                    clearTimeout(timer);
                    try { if (unsubscribe) unsubscribe(); } catch(_) {}
                    resolve(user || __resolveCurrentUserCompat());
                });
            } else {
                // Fallback: polling
                const start = Date.now();
                const poll = setInterval(() => {
                    const user = __resolveCurrentUserCompat();
                    if (user || (Date.now() - start) >= timeoutMs) {
                        clearInterval(poll);
                        if (done) return;
                        done = true;
                        clearTimeout(timer);
                        resolve(user);
                    }
                }, 120);
            }
        } catch(_) {
            if (!done) { done = true; clearTimeout(timer); resolve(__resolveCurrentUserCompat()); }
        }
    });
}

function __ensureAuthFunctionsCompat() {
    try {
        if (window.authFunctions && typeof window.authFunctions.getCurrentUser === 'function') return;
        const hasAlternative = !!(
            (window.authModule && typeof window.authModule.getCurrentUser === 'function')
            || window.auth
        );
        if (!hasAlternative) return;
        const compat = (window.authFunctions && typeof window.authFunctions === 'object') ? window.authFunctions : {};
        if (typeof compat.getCurrentUser !== 'function') {
            compat.getCurrentUser = () => __resolveCurrentUserCompat();
        }
        if (typeof compat.signOut !== 'function' && window.auth && typeof window.auth.signOut === 'function') {
            compat.signOut = async () => {
                try {
                    await window.auth.signOut();
                    return { success: true };
                } catch (error) {
                    return { success: false, error: error?.message || String(error) };
                }
            };
        }
        window.authFunctions = compat;
    } catch (_) {}
}

async function saveCurrentMatch(options = {}) {
    try {
        __ensureAuthFunctionsCompat();
        if (__isAutosaveDisabled()) return true;
        const sessionRaw = localStorage.getItem('currentScoutingSession');
        if (!sessionRaw) return true;
        let sessionData = {};
        try { sessionData = JSON.parse(sessionRaw); } catch(_) {}

        const payloadBase = __buildCurrentSavePayloadSnapshot({ persistSession: true });
        if (!payloadBase) return true;
        // Ultimo tentativo: se il roster è vuoto nel payload, prova a recuperarlo da appState o team
        if (!Array.isArray(payloadBase.roster) || payloadBase.roster.length === 0) {
            try {
                const rFallback = Array.isArray(window.appState?.currentRoster) && window.appState.currentRoster.length
                    ? window.appState.currentRoster
                    : (Array.isArray(window.teamsModule?.getCurrentTeam?.()?.players) ? window.teamsModule.getCurrentTeam().players : []);
                if (rFallback.length) payloadBase.roster = rFallback.map(__normalizeRosterPlayer);
            } catch(_) {}
        }
        const payload = Object.assign({}, payloadBase, {
            scoutingEndTime: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        const payloadId = String(payload.id || '').trim();
        if (payloadId) payload.id = payloadId;
        const mode = String(options?.mode || 'autosave').toLowerCase() === 'manual' ? 'manual' : 'autosave';
        try { window.__mvsLastSaveError = ''; } catch(_) {}

        try { __appendPartialSaveSnapshot(payloadBase); } catch(_) {}

        try {
            const userEmail = __resolveCurrentUserCompat()?.email || '';
            const teamIdRef = payload.teamId || (window.teamsModule?.getCurrentTeam?.()?.id != null ? String(window.teamsModule.getCurrentTeam().id) : null);
            if (userEmail && teamIdRef) {
                payload.cloudRef = {
                    userEmail,
                    teamId: teamIdRef,
                    matchId: payload.id,
                    path: `users/${userEmail}/teams/${teamIdRef}/matches/${payload.id}`
                };
            }
        } catch(_) {}

        // Notifica inizio salvataggio
        try { window.dispatchEvent(new CustomEvent('save:started')); } catch(_) {}

        let saveOk = true;
        let saveErrorMessage = '';
        if (mode === 'manual') {
            saveOk = false;
            try {
                const resolvedUser = await __waitForAuthUserReady(5000);
                const _hasAuth = !!resolvedUser;
                const _hasFs   = !!(window.firestoreService);
                console.log('[MVS] saveCurrentMatch – auth:', _hasAuth, '/ firestoreService:', _hasFs);
                if (!_hasFs) {
                    saveErrorMessage = 'Servizi cloud non disponibili (firestoreService). Ricarica la pagina.';
                } else if (!_hasAuth) {
                    // Utente non autenticato: mostra il modal di login se disponibile
                    saveErrorMessage = 'Devi essere autenticato per salvare in cloud.';
                    try {
                        if (window.authModule && typeof window.authModule.requireAuth === 'function') {
                            window.authModule.requireAuth();
                        } else if (typeof showAuthModal === 'function') {
                            showAuthModal('login');
                        }
                    } catch(_) {}
                } else {
                    const user = resolvedUser || __resolveCurrentUserCompat();
                    if (!user) {
                        saveErrorMessage = 'Devi essere autenticato per salvare in cloud.';
                    } else {
                        const currentTeam = window.teamsModule?.getCurrentTeam?.();
                        const fallbackTeamId = (() => { try { return localStorage.getItem('selectedTeamId'); } catch(_) { return null; } })();
                        const teamId = payload.teamId || (currentTeam?.id != null ? String(currentTeam.id) : (fallbackTeamId != null ? String(fallbackTeamId) : null));
                        if (!teamId) {
                            saveErrorMessage = 'Nessuna squadra selezionata.';
                        } else {
                            if (typeof window.firestoreService.saveMatchTree === 'function') {
                                const res = await window.firestoreService.saveMatchTree(teamId, payload);
                                const savedId = String(res?.id || '').trim();
                                if (savedId && savedId !== String(payload.id || '').trim()) {
                                    payload.id = savedId;
                                    try {
                                        const rawSess = localStorage.getItem('currentScoutingSession');
                                        const sess = rawSess ? JSON.parse(rawSess) : null;
                                        if (sess && typeof sess === 'object') {
                                            sess.id = savedId;
                                            localStorage.setItem('currentScoutingSession', JSON.stringify(sess));
                                        }
                                    } catch(_) {}
                                    try { localStorage.setItem('selectedMatchId', savedId); } catch(_) {}
                                    try {
                                        const setupRaw = localStorage.getItem('currentMatchSetup');
                                        const setup = setupRaw ? JSON.parse(setupRaw) : null;
                                        if (setup && typeof setup === 'object') {
                                            setup.id = savedId;
                                            localStorage.setItem('currentMatchSetup', JSON.stringify(setup));
                                        }
                                    } catch(_) {}
                                    try { if (window.appState?.currentMatch) window.appState.currentMatch.id = savedId; } catch(_) {}
                                }
                            }
                            if (typeof window.firestoreService.saveMatchDetailsTree === 'function') {
                                await window.firestoreService.saveMatchDetailsTree(teamId, payload.id, {
                                    actionsBySet: payload.actionsBySet || {},
                                    setMeta: payload.setMeta || {},
                                    setStateBySet: payload.setStateBySet || {},
                                    setSummary: payload.setSummary || {},
                                    scoreHistoryBySet: payload.scoreHistoryBySet || {}
                                });
                            }
                            if (typeof window.firestoreService.saveMatchRosterTree === 'function') {
                                const rr = Array.isArray(payload.roster) ? payload.roster : [];
                                if (rr.length) {
                                    await window.firestoreService.saveMatchRosterTree(teamId, payload.id, rr);
                                }
                            }
                            saveOk = true;
                        }
                    }
                }
            } catch (e) {
                saveErrorMessage = String(e?.message || 'Salvataggio cloud non riuscito');
                console.warn('Salvataggio su Firestore non riuscito:', e);
            }
            if (saveOk) {
                try { __lastSavedCoreSignature = __coreSignatureFromPayload(payload); } catch(_) {}
            } else {
                try { window.__mvsLastSaveError = saveErrorMessage || 'Salvataggio cloud non riuscito.'; } catch(_) {}
            }
        }

        // Notifica completamento salvataggio
        try { window.dispatchEvent(new CustomEvent('save:completed', { detail: { ok: !!saveOk, mode, error: saveOk ? '' : (saveErrorMessage || '') } })); } catch(_) {}
        return !!saveOk;
    } catch (error) {
        console.warn('saveCurrentMatch errore:', error);
        try { window.dispatchEvent(new CustomEvent('save:completed', { detail: { ok: false, error } })); } catch(_) {}
        return false;
    }
}

async function exportAllSetsToExcel(options = {}) {
    const exportOptions = (options && typeof options === 'object') ? options : {};
    try {
        async function ensureXlsxLoaded() {
            if (window.XLSX && window.XLSX.utils && typeof window.XLSX.writeFile === 'function') return window.XLSX;
            try {
                const existing = Array.from(document.querySelectorAll('script')).find(s => String(s.src || '').includes('xlsx.full.min.js'));
                if (existing) {
                    const start = Date.now();
                    while (!(window.XLSX && window.XLSX.utils && typeof window.XLSX.writeFile === 'function')) {
                        if ((Date.now() - start) > 8000) break;
                        await new Promise(r => setTimeout(r, 50));
                    }
                    if (window.XLSX && window.XLSX.utils && typeof window.XLSX.writeFile === 'function') return window.XLSX;
                }
            } catch (_) {}
            await new Promise((resolve, reject) => {
                try {
                    const s = document.createElement('script');
                    s.src = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js';
                    s.async = true;
                    s.onload = () => resolve();
                    s.onerror = () => reject(new Error('Impossibile caricare la libreria XLSX'));
                    document.head.appendChild(s);
                } catch (e) { reject(e); }
            });
            return window.XLSX;
        }

        function safeJsonParse(raw, fallback) {
            try { return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; }
        }

        function setCell(ws, addr, value) {
            if (value === undefined || value === null) return;
            if (typeof value === 'number' && Number.isFinite(value)) ws[addr] = { t: 'n', v: value };
            else ws[addr] = { t: 's', v: String(value) };
        }

        function normalizeRotationToSheet(v) {
            const s = String(v || '').trim();
            if (!s) return '';
            return s.replace(/^P/i, '');
        }

        function pickScoreFromActions(actions) {
            try {
                for (let i = (actions || []).length - 1; i >= 0; i--) {
                    const sc = actions[i] && actions[i].score != null ? String(actions[i].score) : '';
                    const m = sc.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
                    if (m) return { home: Number(m[1]) || 0, away: Number(m[2]) || 0 };
                }
            } catch (_) {}
            return { home: 0, away: 0 };
        }

        function normalizeHomeAwayLabel(match, session) {
            const ha = String(match?.homeAway || '').toLowerCase();
            if (ha === 'away') return 'trasferta';
            if (ha === 'home') return 'casa';
            const loc = String(session?.location || '').toLowerCase();
            if (loc === 'trasferta' || loc === 'away') return 'trasferta';
            return 'casa';
        }

        function normalizeFileSegment(value, maxLen = 48) {
            const raw = String(value || '').trim();
            const noBad = raw.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ');
            const clean = noBad.replace(/\s+/g, ' ').trim();
            return (clean || '').slice(0, maxLen);
        }

        function getTeamLabel(match) {
            let team = match?.myTeam || match?.teamName || '';
            try {
                const t = window.teamsModule?.getCurrentTeam?.();
                if (!team) team = t?.teamName || t?.name || '';
            } catch (_) {}
            return team || 'Squadra';
        }

        function getFallbackMatchNumber(matchId) {
            try {
                const map = safeJsonParse(localStorage.getItem('mvsMatchNumbers'), {});
                const existing = map && map[matchId];
                if (existing) return String(existing).padStart(3, '0').slice(-3);
                let maxNum = 0;
                Object.keys(map || {}).forEach(k => {
                    const n = Number(map[k] || 0);
                    if (n > maxNum) maxNum = n;
                });
                // Cloud-only: non si legge più da volleyMatches per i numeri partita
                const next = maxNum + 1;
                if (map && matchId) {
                    map[matchId] = next;
                    try { localStorage.setItem('mvsMatchNumbers', JSON.stringify(map)); } catch (_) {}
                }
                return String(next).padStart(3, '0').slice(-3);
            } catch (_) {
                return String(1).padStart(3, '0');
            }
        }

        async function getMatchNumberFromOutputDir(dirHandle, matchId) {
            if (!dirHandle || typeof dirHandle.entries !== 'function') {
                return getFallbackMatchNumber(matchId);
            }
            try {
                let maxNum = 0;
                for await (const [name, handle] of dirHandle.entries()) {
                    if (!handle || handle.kind !== 'file') continue;
                    const m = String(name || '').match(/^\s*(\d{3})\b/);
                    if (!m) continue;
                    const n = Number(m[1]);
                    if (Number.isFinite(n) && n > maxNum) maxNum = n;
                }
                return String(maxNum + 1).padStart(3, '0').slice(-3);
            } catch (_) {
                return getFallbackMatchNumber(matchId);
            }
        }

        function abbreviateEventType(value) {
            const raw = String(value || '').trim();
            const v = raw.toLowerCase();
            if (!v) return 'Part';
            if (v.includes('camp')) return 'Camp';
            if (v.includes('pgs')) return 'PGS';
            if (v.includes('cop')) return 'Copp';
            if (v.includes('amic')) return 'Amic';
            return normalizeFileSegment(raw, 8) || 'Part';
        }

        function resolveSetScore(setNum, actionsBySet, setStateBySet, setSummary) {
            const state = setStateBySet && setStateBySet[setNum] ? setStateBySet[setNum] : null;
            let home = state && state.homeScore != null ? Number(state.homeScore) || 0 : 0;
            let away = state && state.awayScore != null ? Number(state.awayScore) || 0 : 0;
            if (!(home || away)) {
                const sum = setSummary && setSummary[setNum] ? setSummary[setNum] : null;
                if (sum) {
                    home = Number(sum.home || 0);
                    away = Number(sum.away || 0);
                }
            }
            if (!(home || away)) {
                const actions = Array.isArray(actionsBySet && actionsBySet[setNum]) ? actionsBySet[setNum] : [];
                const fallback = pickScoreFromActions(actions);
                home = fallback.home;
                away = fallback.away;
            }
            return { home, away };
        }

        function computeWins(match, actionsBySet, setStateBySet, setSummary) {
            let myWins = 0;
            let oppWins = 0;
            for (let i = 1; i <= 6; i++) {
                const sc = resolveSetScore(i, actionsBySet, setStateBySet, setSummary);
                if (!sc.home && !sc.away) continue;
                const myScore = sc.home;
                const oppScore = sc.away;
                if (myScore > oppScore) myWins++;
                else if (oppScore > myScore) oppWins++;
            }
            return { myWins, oppWins };
        }

        async function idbOpen() {
            return new Promise((resolve, reject) => {
                try {
                    const req = indexedDB.open('mvs_fs', 1);
                    req.onupgradeneeded = () => {
                        try { req.result.createObjectStore('handles'); } catch (_) {}
                    };
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                } catch (e) { reject(e); }
            });
        }

        async function idbGetHandle(key) {
            try {
                const db = await idbOpen();
                return await new Promise((resolve, reject) => {
                    const tx = db.transaction('handles', 'readonly');
                    const store = tx.objectStore('handles');
                    const req = store.get(key);
                    req.onsuccess = () => resolve(req.result || null);
                    req.onerror = () => reject(req.error);
                });
            } catch (_) { return null; }
        }

        async function idbSetHandle(key, value) {
            try {
                const db = await idbOpen();
                await new Promise((resolve, reject) => {
                    const tx = db.transaction('handles', 'readwrite');
                    const store = tx.objectStore('handles');
                    const req = store.put(value, key);
                    req.onsuccess = () => resolve();
                    req.onerror = () => reject(req.error);
                });
                return true;
            } catch (_) { return false; }
        }

        async function getScoutDirectoryHandle() {
            if (!window.showDirectoryPicker) return null;
            let handle = await idbGetHandle('scoutDir');
            if (handle) {
                try {
                    const perm = await handle.queryPermission({ mode: 'readwrite' });
                    if (perm === 'granted') return handle;
                    const req = await handle.requestPermission({ mode: 'readwrite' });
                    if (req === 'granted') return handle;
                } catch (_) {}
            }
            try {
                handle = await window.showDirectoryPicker({ id: 'mvsScoutFolder', mode: 'readwrite', startIn: 'documents' });
                if (handle) {
                    try { await idbSetHandle('scoutDir', handle); } catch (_) {}
                    return handle;
                }
            } catch (_) {}
            return null;
        }

        async function saveWorkbookLocal(wbArray, fileName, dirHandle) {
            try {
                const targetDir = dirHandle || await getScoutDirectoryHandle();
                if (!targetDir) return false;
                const fileHandle = await targetDir.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(wbArray);
                await writable.close();
                return true;
            } catch (_) {
                return false;
            }
        }

        const XLSX = await ensureXlsxLoaded();
        if (!XLSX || !XLSX.utils) {
            await __showAlert('Libreria XLSX non disponibile', { title: 'Esportazione', okText: 'OK' });
            return;
        }

        const sessionData = (exportOptions.sessionData && typeof exportOptions.sessionData === 'object')
            ? exportOptions.sessionData
            : safeJsonParse(localStorage.getItem('currentScoutingSession'), {});
        const currentMatch = (window.appState && window.appState.currentMatch) ? window.appState.currentMatch : null;
        const bestLocal = (typeof getBestLocalMatch === 'function') ? getBestLocalMatch() : null;
        const matchOverride = (exportOptions.match && typeof exportOptions.match === 'object') ? exportOptions.match : null;
        const match = matchOverride || currentMatch || bestLocal || sessionData || {};

        const actionsBySet = sessionData.actionsBySet || match.actionsBySet || {};
        const setMeta = sessionData.setMeta || match.setMeta || {};
        const setStateBySet = sessionData.setStateBySet || match.setStateBySet || {};

        function pickRosterList() {
            const candidates = [];
            if (Array.isArray(window.appState?.currentRoster)) candidates.push(window.appState.currentRoster);
            if (Array.isArray(sessionData.roster)) candidates.push(sessionData.roster);
            if (Array.isArray(sessionData.players)) candidates.push(sessionData.players);
            if (Array.isArray(match.roster)) candidates.push(match.roster);
            if (Array.isArray(match.players)) candidates.push(match.players);
            if (Array.isArray(currentMatch?.roster)) candidates.push(currentMatch.roster);
            if (Array.isArray(currentMatch?.players)) candidates.push(currentMatch.players);
            try {
                const setup = safeJsonParse(localStorage.getItem('currentMatchSetup'), {});
                if (Array.isArray(setup?.roster)) candidates.push(setup.roster);
                if (Array.isArray(setup?.players)) candidates.push(setup.players);
            } catch (_) {}
            try {
                const imported = safeJsonParse(localStorage.getItem('importedRoster'), []);
                if (Array.isArray(imported)) candidates.push(imported);
            } catch (_) {}
            for (const list of candidates) {
                if (Array.isArray(list) && list.some(p => p && (p.number || p.name || p.surname || p.nickname || p.role || p.nome || p.cognome || p.soprannome || p.ruolo))) {
                    return list;
                }
            }
            return [];
        }

        let roster = pickRosterList();

        const _mr3064 = (sessionData.description || match.description || '').toLowerCase();
        const opponent = (_mr3064 === 'andata' ? '(A) ' : _mr3064 === 'ritorno' ? '(R) ' : '') + (sessionData.opponent || sessionData.opponentTeam || match.opponentTeam || match.opponent || match.awayTeam || match.opponentName || 'Avversario');
        const matchDate = sessionData.matchDate || match.matchDate || match.date || new Date().toISOString().slice(0, 10);
        const eventType = sessionData.eventType || sessionData.matchType || match.eventType || match.matchType || match.type || 'partita';
        const location = String(sessionData.location || match.location || '').trim().toLowerCase() || normalizeHomeAwayLabel(match, sessionData);
        const description = sessionData.description || match.description || sessionData.notes || match.notes || '';
        const finalResult = match.finalResult || sessionData.finalResult || match.scoreText || sessionData.scoreText || match.punteggio || sessionData.punteggio || '';
        const matchOutcome = match.matchOutcome || sessionData.matchOutcome || match.outcome || sessionData.outcome || match.esito || sessionData.esito || '';

        const wb = XLSX.utils.book_new();

        const wsRoster = {};
        wsRoster['!ref'] = 'A1:K220';
        setCell(wsRoster, 'D1', normalizeFileSegment(getTeamLabel(match), 48));
        setCell(wsRoster, 'B2', 'N°');
        setCell(wsRoster, 'C2', 'COGNOME');
        setCell(wsRoster, 'D2', 'NOME');
        setCell(wsRoster, 'E2', 'SOPRANNOME');
        setCell(wsRoster, 'F2', 'Ruolo');
        const toSheetDate = (raw) => {
            const s = String(raw || '').trim();
            if (!s) return '';
            const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (m) return `${m[3]}/${m[2]}/${m[1]}`;
            const d = new Date(s);
            if (Number.isFinite(d.getTime())) {
                const dd = String(d.getDate()).padStart(2, '0');
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const yyyy = d.getFullYear();
                return `${dd}/${mm}/${yyyy}`;
            }
            return s;
        };
        setCell(wsRoster, 'D20', opponent);
        setCell(wsRoster, 'D21', toSheetDate(matchDate));
        setCell(wsRoster, 'D22', eventType);
        setCell(wsRoster, 'D23', location);
        setCell(wsRoster, 'D24', description);
        setCell(wsRoster, 'D25', finalResult);
        setCell(wsRoster, 'D26', matchOutcome);

        function pickField(obj, keys) {
            for (const k of keys) {
                const v = obj && obj[k];
                if (v !== undefined && v !== null && String(v).trim() !== '') return v;
            }
            return '';
        }

        function normalizeRoleAbbrev(roleValue) {
            const s = String(roleValue || '').trim();
            if (!s) return '';
            const u = s.toUpperCase();
            if (/^[POMCLS]\d+$/.test(u)) return u;
            if (u === 'P' || u.startsWith('PAL')) return 'P';
            if (u === 'O' || u.startsWith('OPP')) return 'O';
            if (u === 'S' || u === 'M' || u.startsWith('SCH') || u.startsWith('MAR')) return 'M';
            if (u === 'C' || u.startsWith('CEN')) return 'C';
            if (u === 'L' || u.startsWith('LIB')) return 'L';
            return u.charAt(0);
        }

        const validPlayersBase = (roster || []).map(p => {
            const number = pickField(p, ['number', 'numero', 'num', 'jersey', 'jerseyNumber', 'maglia']);
            const name = pickField(p, ['name', 'nome', 'firstName', 'nomi']);
            const surname = pickField(p, ['surname', 'cognome', 'lastName', 'cognomi']);
            const nickname = pickField(p, ['nickname', 'nick', 'soprannome']);
            const roleRaw = pickField(p, ['role', 'ruolo', 'position', 'posizione']);
            const role = normalizeRoleAbbrev(roleRaw);
            const roleFixed = /^[POMCLS]\d+$/.test(String(role || '').toUpperCase()) ? String(role).toUpperCase() : '';
            const roleBase = roleFixed ? roleFixed.replace(/\d+$/, '') : String(role || '').toUpperCase();
            return { number, name, surname, nickname, roleFixed, roleBase };
        }).filter(p => p && (p.number || p.name || p.surname || p.nickname || p.roleFixed || p.roleBase));
        const roleTotals = {};
        validPlayersBase.forEach((p) => {
            const base = String(p.roleBase || '').trim().toUpperCase();
            if (!base) return;
            roleTotals[base] = (roleTotals[base] || 0) + 1;
        });
        const roleProgressive = {};
        const validPlayers = validPlayersBase.map((p) => {
            if (p.roleFixed) return Object.assign({}, p, { role: p.roleFixed });
            const base = String(p.roleBase || '').trim().toUpperCase();
            if (!base) return Object.assign({}, p, { role: '' });
            if ((roleTotals[base] || 0) <= 1) return Object.assign({}, p, { role: base });
            const next = (roleProgressive[base] || 0) + 1;
            roleProgressive[base] = next;
            return Object.assign({}, p, { role: `${base}${next}` });
        });
        for (let i = 0; i < validPlayers.length; i++) {
            const p = validPlayers[i] || {};
            const row = 3 + i;
            setCell(wsRoster, 'B' + row, formatJersey(p.number || ''));
            setCell(wsRoster, 'C' + row, p.surname || '');
            setCell(wsRoster, 'D' + row, p.name || '');
            setCell(wsRoster, 'E' + row, p.nickname || '');
            setCell(wsRoster, 'F' + row, p.role || '');
        }
        XLSX.utils.book_append_sheet(wb, wsRoster, 'El. Gioc.');

        for (let setNum = 1; setNum <= 6; setNum++) {
            const ws = {};
            ws['!ref'] = 'A1:K220';

            const meta = setMeta && setMeta[setNum] ? setMeta[setNum] : {};
            const ourRot = meta.ourRotation || meta.ourRot || meta.rotation || '';
            const oppRot = meta.opponentRotation || meta.oppRotation || meta.opponentRot || '';
            setCell(ws, 'A6', normalizeRotationToSheet(oppRot));
            setCell(ws, 'A7', normalizeRotationToSheet(ourRot));

            const actions = Array.isArray(actionsBySet && actionsBySet[setNum]) ? actionsBySet[setNum] : [];
            const state = setStateBySet && setStateBySet[setNum] ? setStateBySet[setNum] : null;
            const fallbackScore = pickScoreFromActions(actions);
            const homeScore = state && state.homeScore != null ? Number(state.homeScore) || 0 : fallbackScore.home;
            const awayScore = state && state.awayScore != null ? Number(state.awayScore) || 0 : fallbackScore.away;
            setCell(ws, 'C12', homeScore);
            setCell(ws, 'E12', awayScore);

            let row = 18;
            for (let i = 0; i < actions.length; i++) {
                const a = actions[i];
                const s = typeof a === 'string' ? a : (a && (a.action || a.actionString || a.text));
                const v = s != null ? String(s).trim() : '';
                if (!v) continue;
                setCell(ws, 'B' + row, v);
                row++;
            }

            XLSX.utils.book_append_sheet(wb, ws, 'Set ' + setNum);
        }

        const matchId = String(match?.id || sessionData?.id || Date.now()).trim();
        const requireDirectoryHandle = exportOptions.requireDirectoryHandle === true;
        const disableWriteFileFallback = exportOptions.disableWriteFileFallback === true;
        const dirHandle = exportOptions.directoryHandle || await getScoutDirectoryHandle();
        if (requireDirectoryHandle && !dirHandle) {
            throw new Error('Cartella di destinazione non disponibile');
        }
        const matchNumber = await getMatchNumberFromOutputDir(dirHandle, matchId);
        const teamLabel = normalizeFileSegment(getTeamLabel(match), 48);
        const eventLabel = abbreviateEventType(eventType);
        const opponentLabel = normalizeFileSegment(opponent, 32) || 'Avversario';
        const wins = computeWins(match, actionsBySet, setStateBySet, match.setSummary || sessionData.setSummary || {});
        const outcomeLabel = (wins.myWins || wins.oppWins) ? (wins.myWins > wins.oppWins ? 'Vinto' : (wins.oppWins > wins.myWins ? 'Perso' : '')) : (matchOutcome || '');
        const resultLabel = (wins.myWins || wins.oppWins) ? (location === 'casa' ? `${wins.myWins}${wins.oppWins}` : `${wins.oppWins}${wins.myWins}`) : String(finalResult || '').replace(/[^\d]/g, '').slice(0, 2);
        const nameParts = [matchNumber, teamLabel, eventLabel, 'Vs', opponentLabel, outcomeLabel, resultLabel].filter(Boolean);
        const fileName = `${nameParts.join(' ')}.xlsx`;
        const wbArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const savedLocal = await saveWorkbookLocal(wbArray, fileName, dirHandle);
        if (!savedLocal) {
            if (disableWriteFileFallback || requireDirectoryHandle) {
                throw new Error('Impossibile salvare automaticamente il file nella cartella selezionata');
            }
            XLSX.writeFile(wb, fileName, { bookType: 'xlsx' });
        }
        try {
            const excelMeta = Object.assign(
                { name: fileName, updatedAt: new Date().toISOString() }
            );
            // Cloud-only: i metadati Excel vengono aggiornati solo nella sessione corrente e in Firestore
            try {
                const sess = safeJsonParse(localStorage.getItem('currentScoutingSession'), {});
                sess.excelFileName = excelMeta.name;
                sess.excelFileUrl = '';
                sess.excelFilePath = '';
                sess.matchNumber = matchNumber;
                localStorage.setItem('currentScoutingSession', JSON.stringify(sess));
            } catch (_) {}
            try {
                const teamId = match?.teamId || window.teamsModule?.getCurrentTeam?.()?.id || localStorage.getItem('selectedTeamId') || null;
                if (teamId && window.firestoreService?.saveMatchTree) {
                    await window.firestoreService.saveMatchTree(teamId, Object.assign({}, match, {
                        id: matchId,
                        matchNumber,
                        excelFileName: excelMeta.name,
                        excelFileUrl: '',
                        excelFilePath: ''
                    }));
                }
            } catch (_) {}
        } catch (_) {}
        return { success: true, fileName, matchId, matchNumber };
    } catch (e) {
        console.error('Errore exportAllSetsToExcel:', e);
        if (!exportOptions.suppressAlert) {
            await __showAlert('Errore durante l\'esportazione della partita', { title: 'Esportazione', okText: 'OK' });
        }
        if (exportOptions.rethrow) throw e;
        return { success: false, error: e };
    }
}

window.exportAllSetsToExcel = exportAllSetsToExcel;

// --- Protezione perdita dati: flush su localStorage prima di chiudere o nascondere la pagina ---
window.addEventListener('beforeunload', function() {
    try {
        var hasActions = window.appState && Array.isArray(window.appState.actionsLog) && window.appState.actionsLog.length > 0;
        var hasSequence = window.appState && Array.isArray(window.appState.currentSequence) && window.appState.currentSequence.length > 0;
        if (!hasActions && !hasSequence) {
            console.log('[MVS] beforeunload: nessun dato da salvare, skip');
            return;
        }
        __buildCurrentSavePayloadSnapshot({ persistSession: true });
        console.log('[MVS] beforeunload: stato salvato in localStorage');
    } catch (err) {
        console.warn('[MVS] beforeunload flush fallito:', err);
    }
});

document.addEventListener('visibilitychange', function() {
    try {
        if (document.visibilityState === 'hidden') {
            var _ha = window.appState && Array.isArray(window.appState.actionsLog) && window.appState.actionsLog.length > 0;
            var _hs = window.appState && Array.isArray(window.appState.currentSequence) && window.appState.currentSequence.length > 0;
            if (!_ha && !_hs) return;
            __buildCurrentSavePayloadSnapshot({ persistSession: true });
            console.log('[MVS] visibilitychange(hidden): stato salvato in localStorage');
        }
    } catch (err) {
        console.warn('[MVS] visibilitychange flush fallito:', err);
    }
});
// --- Fine protezione perdita dati ---

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
    if (!hasData) { __showAlert('Compila almeno un giocatore prima di salvare', { title: 'Roster', okText: 'OK' }); return; }

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
                // Cloud-only: rimosso fallback da volleyTeams localStorage (il roster viene da teamsModule sopra)
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
    try { __mvsLockScroll(); } catch(_) { document.body.style.overflow = 'hidden'; }
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
    if (!anyOpen) {
        try { __mvsUnlockScroll(); } catch(_) { document.body.style.overflow = ''; }
    }
}

function __mvsEnsureScrollLockState() {
    try {
        if (!window.__mvsScrollLock) window.__mvsScrollLock = { count: 0 };
    } catch (_) {}
}

function __mvsLockScroll() {
    try {
        __mvsEnsureScrollLockState();
        const st = window.__mvsScrollLock;
        if ((st.count || 0) === 0) {
            st.scrollY = window.scrollY || window.pageYOffset || 0;
            st.bodyOverflow = document.body.style.overflow;
            st.htmlOverflow = document.documentElement.style.overflow;
            st.bodyPosition = document.body.style.position;
            st.bodyTop = document.body.style.top;
            st.bodyWidth = document.body.style.width;
            document.documentElement.style.overflow = 'hidden';
            document.body.style.overflow = 'hidden';
            document.body.style.position = 'fixed';
            document.body.style.top = `-${st.scrollY}px`;
            document.body.style.width = '100%';
        }
        st.count = (st.count || 0) + 1;
    } catch (_) {}
}

function __mvsUnlockScroll() {
    try {
        __mvsEnsureScrollLockState();
        const st = window.__mvsScrollLock;
        st.count = Math.max(0, (st.count || 0) - 1);
        if (st.count !== 0) return;
        document.body.style.overflow = st.bodyOverflow || '';
        document.documentElement.style.overflow = st.htmlOverflow || '';
        document.body.style.position = st.bodyPosition || '';
        document.body.style.top = st.bodyTop || '';
        document.body.style.width = st.bodyWidth || '';
        const y = Number(st.scrollY || 0) || 0;
        window.scrollTo(0, y);
    } catch (_) {
        try {
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.width = '';
        } catch (_) {}
    }
}

function __mvsForceUnlockScroll() {
    try {
        __mvsEnsureScrollLockState();
        const st = window.__mvsScrollLock;
        st.count = 0;
        document.body.style.overflow = st.bodyOverflow || '';
        document.documentElement.style.overflow = st.htmlOverflow || '';
        document.body.style.position = st.bodyPosition || '';
        document.body.style.top = st.bodyTop || '';
        document.body.style.width = st.bodyWidth || '';
        const y = Number(st.scrollY || 0) || 0;
        window.scrollTo(0, y);
    } catch (_) {
        try {
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.width = '';
        } catch (_) {}
    }
}

function __mvsCloseModalElement(dlg) {
    try { if (dlg && dlg.parentNode) dlg.parentNode.removeChild(dlg); else if (dlg && typeof dlg.remove === 'function') dlg.remove(); } catch (_) {}
    try {
        __mvsUnlockScroll();
        const anyOpen = document.querySelector('.dialog.is-open:not([hidden])');
        const st = window.__mvsScrollLock;
        if (anyOpen && (!st || !st.count)) __mvsLockScroll();
        if (!anyOpen) __mvsForceUnlockScroll();
    } catch (_) { try { __mvsUnlockScroll(); } catch(_){} }
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
                const actionStr = (log && typeof log.action === 'string') ? log.action : (typeof log === 'string' ? log : '');
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
        __markScoutingAutosaveDirty(); __scheduleScoutingAutosave(600);
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
            addLongPressListener(curFund, 2000, async () => {
                const ok = await __askConfirm('Resettare set?', {
                    title: 'Reset set',
                    okText: 'Resetta',
                    cancelText: 'Annulla',
                    variant: 'danger'
                });
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
            name: String(p.name || '').trim(),
            surname: String(p.surname || '').trim(),
            nickname: String(p.nickname || '').trim(),
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
        Opposto: [],
        Altro: []
    };

    // Distribuisci i giocatori per ruolo e ordina per numero crescente
    validPlayers.forEach(p => {
        if (byRole[p.role]) byRole[p.role].push(p);
        else byRole.Altro.push(p);
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
    function cleanedNickname(p){
        let nick = String(p.nickname || '').trim();
        if (!nick) return '';
        const numNorm = normalizeNumberStr(p.number || '');
        const numPad = numNorm ? String(numNorm).padStart(2, '0') : '';
        const esc = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (numNorm) {
            const re = new RegExp(`^${esc(numNorm)}\\s*`, 'i');
            nick = nick.replace(re, '');
        }
        if (numPad) {
            const re2 = new RegExp(`^${esc(numPad)}\\s*`, 'i');
            nick = nick.replace(re2, '');
        }
        return nick.trim();
    }
    function displayNameFor(p){
        const nick = cleanedNickname(p);
        if (nick) return nick;
        const full = `${p.name || ''} ${p.surname || ''}`.trim();
        return full || `Giocatore ${p.number || ''}`.trim();
    }
    function renderBtn(p){
        const rc = roleClassFor(p.role);
        const sr = shortRole(p.role);
        const num = String(p.number || '').trim();
        const nm = String(displayNameFor(p) || '').trim();
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

    const remaining = [
        ...byRole.Schiacciatore,
        ...byRole.Centrale,
        ...byRole.Opposto,
        ...byRole.Palleggiatore.slice(2),
        ...byRole.Libero.slice(2),
        ...byRole.Altro
    ];

    const row2 = remaining.slice(0, 4);
    while (row2.length < 4) row2.push(null);
    const row3 = remaining.slice(4, 8);
    while (row3.length < 4) row3.push(null);
    const row4 = [
        { __type: 'opponent-error' },
        remaining[8] || null,
        remaining[9] || null,
        { __type: 'muro-override' }
    ];

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
        const hasCurrentCompleteQuartet = !!(appState.selectedPlayer && appState.selectedEvaluation != null);
        const shouldDisable = !hasCurrentCompleteQuartet && isFirstQuartet && (nextFundamental === 'b' || nextFundamental === 'r');
        if (shouldDisable) {
            try { btn.setAttribute('disabled', 'true'); } catch(_){ }
            try { btn.classList.add('disabled'); } catch(_){ }
            try { btn.title = 'Muro non disponibile all\'inizio'; } catch(_){ }
            btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
        } else {
            btn.addEventListener('click', () => { activateMuroOverride(); });
        }
    });

    try {
        const selNum = appState.selectedPlayer ? String(appState.selectedPlayer.number || '').trim() : '';
        if (selNum) {
            const selectedBtn = container.querySelector(`.player-btn[data-number="${selNum}"]`);
            if (selectedBtn) selectedBtn.classList.add('selected');
        }
    } catch(_) {}
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
            const nn = String(number).padStart(2, '0');
            item.playerName = name;
            if (q.length >= 4) {
                const f = q.charAt(2);
                const e = q.charAt(3);
                item.quartet = `${nn}${f}${e}`;
            } else {
                __mvsSetSequenceParts(item, { playerNumber: nn });
                __mvsRebuildQuartetFromParts(item);
            }

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
            let fundamental = appState.calculatedFundamental || predictNextFundamental();
            if (appState.currentSequence && appState.currentSequence.length === 0) {
                const f0 = String(fundamental || '').toLowerCase();
                if (f0 !== 'b' && f0 !== 'r') {
                    window.__quartetStartAction = function(val) {
                        if (val === 'avv') {
                            appState.selectedPlayer = null;
                            appState.selectedEvaluation = null;
                            appState.calculatedFundamental = null;
                            appState.overrideFundamental = null;
                            try { submitOpponentError(); } catch(_) {}
                            try { selectPlayer(number, name, btnEl); } catch(_) {}
                            return;
                        }
                        appState.calculatedFundamental = val;
                        appState.overrideFundamental = null;
                        try { selectPlayer(number, name, btnEl); } catch(_) {}
                    };
                    openQuartetStartDialog(f0);
                    return;
                }
            }
            const evaluation = appState.selectedEvaluation;
            const quartet = `${String(prevPlayer.number).padStart(2, '0')}${fundamental}${evaluation}`;
            appState.currentSequence.push({ quartet, playerName: prevPlayer.name });
            appState.overrideFundamental = null;
            appState.calculatedFundamental = null;
            appState.nextFundamentalPreview = null;

            updateActionSummary();

            const tempResult = determineFinalResult(fundamental, evaluation);
            const isPoint = tempResult === 'home_point' || tempResult === 'away_point';
            if (isPoint) {
                const actionString = appState.currentSequence.map(s => String(s?.quartet || '').trim()).filter(Boolean).join(' ');
                const result = parseAction(actionString);
                result.playerName = prevPlayer.name;
                result.actionType = evaluation === 5 ? 'Punto' : 'Errore';
                processActionResult(result);

                appState.actionsLog.push({
                    action: actionString,
                    result: result,
                    setNumber: (appState && appState.currentSet) ? appState.currentSet : 1,
                    score: `${appState.homeScore}-${appState.awayScore}`,
                    guided: true,
                    rotation: normalizeRotation(appState.currentRotation)
                });

                appState.currentSequence = [];
                updateActionSummary();
            }
        } catch (error) {
            __showAlert(`Errore nell'azione: ${error.message}`, { title: 'Scouting', okText: 'OK' });
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
        updatePlayersGrid();
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

function openQuartetStartDialog(invalidFundamental) {
    const phase = String(appState.currentPhase || '').toLowerCase();
    const suggested = phase === 'ricezione' ? 'r' : 'b';
    const invalid = String(invalidFundamental || '').toLowerCase();
    for (let i = 0; i < 3; i++) {
        const input = window.prompt(
            `ERRORE: prima quartina non valida (${invalid}).\nLa prima quartina deve essere:\n- b (servizio)\n- r (ricezione)\n- avv (errore avversario)\n\nInserisci b/r/avv:`,
            suggested
        );
        if (input == null) return;
        const val = String(input || '').trim().toLowerCase();
        if (val === 'b' || val === 'r' || val === 'avv') {
            if (typeof window.__quartetStartAction === 'function') {
                try { window.__quartetStartAction(val); } catch(_) {}
            }
            return;
        }
        __showAlert('Valore non valido. Inserisci b, r oppure avv.', { title: 'Validazione azione', okText: 'OK' });
    }
}

function submitGuidedAction() {
    if (!__ensureSetInitializedForScouting()) return;
    if (!appState.selectedPlayer) {
        __showAlert('Errore: nessun giocatore selezionato', { title: 'Scouting', okText: 'OK' });
        return;
    }
    
    if (!appState.selectedEvaluation) {
        __showAlert('Seleziona una valutazione', { title: 'Scouting', okText: 'OK' });
        return;
    }
    
    const fundamental = appState.calculatedFundamental || predictNextFundamental();
    if (!appState.currentSequence || appState.currentSequence.length === 0) {
        const f0 = String(fundamental || '').toLowerCase();
        if (f0 !== 'b' && f0 !== 'r') {
            window.__quartetStartAction = function(val) {
                if (val === 'avv') {
                    appState.selectedPlayer = null;
                    appState.selectedEvaluation = null;
                    appState.calculatedFundamental = null;
                    appState.overrideFundamental = null;
                    try { submitOpponentError(); } catch(_) {}
                    return;
                }
                appState.calculatedFundamental = val;
                appState.overrideFundamental = null;
                submitGuidedAction();
            };
            openQuartetStartDialog(f0);
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
        const actionString = appState.currentSequence.map(s => String(s?.quartet || '').trim()).filter(Boolean).join(' ');
        try {
            const result = parseAction(actionString);
            
            // Aggiungi informazioni del giocatore al risultato
            result.playerName = appState.selectedPlayer.name;
            result.actionType = appState.selectedEvaluation === 5 ? 'Punto' : 'Errore';
            
            processActionResult(result);
            
            appState.actionsLog.push({
                action: actionString,
                result: result,
                setNumber: (appState && appState.currentSet) ? appState.currentSet : 1,
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
            __showAlert(`Errore nell'azione: ${error.message}`, { title: 'Scouting', okText: 'OK' });
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

}

function submitOpponentError() {
    if (!__ensureSetInitializedForScouting()) return;
    // Se non c'è ancora una quartina registrata e NON c'è selezione,
    // consenti comunque l'errore avversario: verrà registrato come "avv".
    // Se invece c'è già selezione (giocatore+valutazione), chiudi quella quartina
    // prima di aggiungere l'"avv" come esito immediato.
    if (!appState.currentSequence || appState.currentSequence.length === 0) {
        if (appState.selectedPlayer && appState.selectedEvaluation) {
            let fundamental = appState.calculatedFundamental || predictNextFundamental();
            if (!appState.currentSequence || appState.currentSequence.length === 0) {
                const f0 = String(fundamental || '').toLowerCase();
                if (f0 !== 'b' && f0 !== 'r') {
                    window.__quartetStartAction = function(val) {
                        if (val === 'avv') {
                            appState.selectedPlayer = null;
                            appState.selectedEvaluation = null;
                            appState.calculatedFundamental = null;
                            appState.overrideFundamental = null;
                            submitOpponentError();
                            return;
                        }
                        appState.calculatedFundamental = val;
                        appState.overrideFundamental = null;
                        submitOpponentError();
                    };
                    openQuartetStartDialog(f0);
                    return;
                }
            }
            const quartet = `${appState.selectedPlayer.number.padStart(2, '0')}${fundamental}${appState.selectedEvaluation}`;
            appState.currentSequence.push({quartet, playerName: appState.selectedPlayer.name});
            appState.overrideFundamental = null;
            appState.calculatedFundamental = null;
            appState.nextFundamentalPreview = null;
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
    const baseString = appState.currentSequence.map(s => String(s?.quartet || '').trim()).filter(Boolean).join(' ');
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
                    setNumber: (appState && appState.currentSet) ? appState.currentSet : 1,
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

    } catch (error) {
        __showAlert(`Errore: ${error.message}`, { title: 'Scouting', okText: 'OK' });
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

    const logs = __getActionsLogForSet(__getActiveSetNumber());
    const total = logs.length;
    const baseIndexStart = Math.max(total - 9, 0);
    let lastLogs = logs.slice(-9);
    let displayLogs = lastLogs.map((log, idx) => ({ log, rowNumber: baseIndexStart + idx + 1 })).reverse();

    if (appState.currentSequence.length > 0) {
        const currentString = appState.currentSequence.map(s => String(s?.quartet || '').trim()).filter(Boolean).join(' ');
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
    try { __markScoutingAutosaveDirty(); __scheduleScoutingAutosave(1500); } catch(_) {}
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
        // Header dinamico: "SET X IN P#:" (oppure "SET X:")
        const setNum = (window.appState?.currentSet) ? window.appState.currentSet : 1;
        const prefix = `SET ${setNum} `;
        el.textContent = rotationNorm ? `${prefix}IN ${rotationNorm}:` : `${prefix}:`;
        // Pulsante "inverti rotazione" accanto all'header
        try {
            let swapBtn = document.getElementById('rotation-swap-btn');
            if (!swapBtn) {
                swapBtn = document.createElement('button');
                swapBtn.id = 'rotation-swap-btn';
                swapBtn.type = 'button';
                swapBtn.className = 'mvs-toolbar-icon rotation-swap-btn';
                swapBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';
                swapBtn.title = 'Inverti rotazione';
                swapBtn.addEventListener('click', __openRotationSwapDialog);
                // Inserisci nel gruppo .layout-switch insieme a Edit e Reset
                const layoutSwitch = document.querySelector('.layout-switch');
                if (layoutSwitch) {
                    layoutSwitch.insertBefore(swapBtn, layoutSwitch.firstChild);
                } else {
                    el.parentElement.appendChild(swapBtn);
                }
            }
            swapBtn.style.display = rotationNorm ? '' : 'none';
        } catch(_) {}
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
        const allowUninitialized = !!(appState && appState.allowUninitializedSet === setNumber);

        // Se il set è completed, non serve il dialog di configurazione
        const __setCompleted5117 = (typeof __computeSetStatus === 'function') ? (__computeSetStatus(setNumber) === 'completed') : false;
        // Se non abbiamo configurazione valida, apri il dialog di setup set e interrompi
        if (!__setCompleted5117 && !hasMetaForSet && (!hasGlobalCfgValid || setNumber !== 1) && !allowUninitialized) {
            try {
                appState.currentSet = setNumber;
                appState.homeScore = 0;
                appState.awayScore = 0;
                appState.actionsLog = [];
                appState.scoreHistory = [];
                appState.currentSequence = [];
                appState.selectedPlayer = null;
                appState.selectedEvaluation = null;
                appState.currentRotation = null;
                appState.currentPhase = null;
                appState.rallyStartPhase = null;
                appState.setStarted = false;
            } catch (_) {}
            try { if (typeof updateMatchInfo === 'function') updateMatchInfo(); } catch (_) {}
            try { if (typeof updateScoutingUI === 'function') updateScoutingUI(); } catch (_) {}
            try { if (typeof updateNextFundamental === 'function') updateNextFundamental(); } catch (_) {}
            try { if (typeof updatePlayersGrid === 'function') updatePlayersGrid(); } catch (_) {}
            try { if (typeof updateScoreHistoryDisplay === 'function') updateScoreHistoryDisplay(); } catch (_) {}
            if (typeof window.openSetMetaDialog === 'function') {
                try { window.openSetMetaDialog(setNumber); } catch(_) {}
            }
            // Aggiorna il display set corrente se presente, ma non proseguire
            return;
        }

        if (hasMetaForSet) {
            try { appState.allowUninitializedSet = null; } catch(_) {}
        }

        // Per set completed senza meta completa, leggi rotazione/fase da setStateBySet o setMeta parziale
        const __smPartial = sessionData.setMeta && sessionData.setMeta[setNumber];
        const __stState = sessionData.setStateBySet && sessionData.setStateBySet[setNumber];
        const __cmState = appState?.currentMatch?.setStateBySet?.[setNumber];
        rotation = hasMetaForSet
            ? sm.ourRotation
            : (__smPartial?.ourRotation || __stState?.currentRotation || __cmState?.currentRotation ||
               ((__rotCfg2 && String(__rotCfg2).startsWith('P')) ? __rotCfg2 : (__rotCfg2 ? `P${__rotCfg2}` : 'P1')));
        phase = hasMetaForSet
            ? sm.phase
            : (__stState?.currentPhase || __cmState?.currentPhase || cfg.phase || 'servizio');
        // Opponent rotation opzionale (usata nel testo descrittivo iniziale)
        var opponentRotation = hasMetaForSet
            ? (sm.opponentRotation || null)
            : (__smPartial?.opponentRotation || cfg.opponentRotation || null);
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
        const _rawActions = Array.isArray(abSet[setNumber]) ? abSet[setNumber] : [];
        const _rawHistory = Array.isArray(shBySet[setNumber]) ? shBySet[setNumber] : [];
        const _rawState = stBySet[setNumber] || {};
        const _stH = Number(_rawState.homeScore || 0);
        const _stA = Number(_rawState.awayScore || 0);
        // Solo se i dati sono significativi (non vuoti/zero) consideriamo il ripristino riuscito
        const _hasRealData = (_rawActions.length > 0 || _rawHistory.length > 0 || _stH > 0 || _stA > 0);
        if (_hasRealData) {
            appState.actionsLog = _rawActions;
            appState.scoreHistory = _rawHistory;
            if (_rawHistory.length > 0) {
                const last = _rawHistory[_rawHistory.length - 1];
                appState.homeScore = (_stH > 0 || _stA > 0) ? _stH : (last?.homeScore ?? 0);
                appState.awayScore = (_stH > 0 || _stA > 0) ? _stA : (last?.awayScore ?? 0);
            } else {
                appState.homeScore = _stH;
                appState.awayScore = _stA;
            }
            if (_rawState.currentPhase) appState.currentPhase = _rawState.currentPhase;
            if (_rawState.currentRotation) appState.currentRotation = normalizeRotation(_rawState.currentRotation);
            // Prepara la fase di inizio del prossimo rally dopo ripristino
            appState.rallyStartPhase = appState.currentPhase;
            appState.setStarted = true;
            restored = true;
        }
    } catch(_) {}

    // Fallback: se non ripristinato da localStorage, prova da appState.currentMatch (dati cloud/caricati)
    if (!restored) {
        try {
            const cm = appState?.currentMatch || {};
            const cmAb = cm.actionsBySet || {};
            const cmSh = cm.scoreHistoryBySet || {};
            const cmSt = cm.setStateBySet || {};
            const cmActions = Array.isArray(cmAb[setNumber]) ? cmAb[setNumber] : [];
            const cmHistory = Array.isArray(cmSh[setNumber]) ? cmSh[setNumber] : [];
            const cmState = cmSt[setNumber] || {};
            if (cmActions.length || cmHistory.length || (cmState.homeScore > 0 || cmState.awayScore > 0)) {
                appState.actionsLog = cmActions;
                appState.scoreHistory = cmHistory;
                if (cmHistory.length > 0) {
                    const last = cmHistory[cmHistory.length - 1];
                    appState.homeScore = (typeof cmState.homeScore === 'number') ? cmState.homeScore : (last?.homeScore ?? 0);
                    appState.awayScore = (typeof cmState.awayScore === 'number') ? cmState.awayScore : (last?.awayScore ?? 0);
                } else {
                    appState.homeScore = (typeof cmState.homeScore === 'number') ? cmState.homeScore : 0;
                    appState.awayScore = (typeof cmState.awayScore === 'number') ? cmState.awayScore : 0;
                }
                if (cmState.currentPhase) appState.currentPhase = cmState.currentPhase;
                if (cmState.currentRotation) appState.currentRotation = normalizeRotation(cmState.currentRotation);
                appState.rallyStartPhase = appState.currentPhase;
                appState.setStarted = true;
                restored = true;
            }
        } catch(_) {}
    }
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
    // Persisti subito l'inizializzazione del nuovo set, ma NON se dati vuoti con idratazione in corso
    // (evita di sovrascrivere dati cloud con zeri)
    if (restored || !window.__mvsHydratingMatchFromFirestore) {
        __markScoutingAutosaveDirty(); __scheduleScoutingAutosave(restored ? 250 : 1000);
    }
    
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
        const _mr5273 = (appState.currentMatch.description || '').toLowerCase();
        const opponent = (_mr5273 === 'andata' ? '(A) ' : _mr5273 === 'ritorno' ? '(R) ' : '') + (appState.currentMatch.opponentTeam || appState.currentMatch.awayTeam || '-');
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
    // Risolve myTeam con fallback robusti: myTeam → teamsModule → matchId → localStorage
    const _rawMy = appState?.currentMatch?.myTeam;
    let myTeamName = (_rawMy && _rawMy !== '-') ? _rawMy : '';
    if (!myTeamName) myTeamName = (appState?.currentMatch?.homeAway === 'home'
        ? appState?.currentMatch?.homeTeam
        : appState?.currentMatch?.awayTeam) || '';
    if (!myTeamName || myTeamName === '-') {
        try {
            const _t = window.teamsModule?.getCurrentTeam?.();
            if (_t?.name) myTeamName = _t.name;
        } catch(_) {}
    }
    if (!myTeamName || myTeamName === '-') {
        try {
            const _mid = String(appState?.currentMatch?.id || '');
            const _ux = _mid.lastIndexOf('_');
            if (_ux > 0) myTeamName = _mid.substring(0, _ux);
        } catch(_) {}
    }
    if (!myTeamName || myTeamName === '-') {
        try { myTeamName = localStorage.getItem('vpa_owner_team') || ''; } catch(_) {}
    }
    // Mostra solo il nome della società per la mia squadra (rimuove eventuale "Nome Squadra - Nome Società")
    const partsMy = String(myTeamName).split(' - ');
    const myClubOnly = partsMy.length >= 2 ? partsMy.slice(1).join(' - ') : myTeamName;
    const _mr5352 = (appState?.currentMatch?.description || '').toLowerCase();
    const opponentName = (_mr5352 === 'andata' ? '(A) ' : _mr5352 === 'ritorno' ? '(R) ' : '') + (appState?.currentMatch?.opponentTeam || appState?.currentMatch?.awayTeam || '');
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
        ? appState.currentSequence.map(s => String(s?.quartet || '').trim()).filter(Boolean).join(' ')
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
    if (!__ensureSetInitializedForScouting()) return;
    
    if (!actionString) {
        __showAlert('Inserisci una stringa di azione', { title: 'Scouting', okText: 'OK' });
        return;
    }
    
    if (!appState.setStarted) {
        __showAlert('Devi prima iniziare il set', { title: 'Scouting', okText: 'OK' });
        return;
    }
    try {
        const m = actionString.match(/^\s*(avv|\d{2}[bramdBRAMD]\d)/);
        if (m) {
            const token = m[1] || m[0];
            if (!/^avv$/i.test(token)) {
                const f0 = token.charAt(2).toLowerCase();
                if (f0 !== 'b' && f0 !== 'r') {
                    window.__quartetStartAction = function(val) {
                        if (!inputEl) return;
                        if (val === 'avv') {
                            inputEl.value = 'avv';
                            submitAction();
                            return;
                        }
                        const fixedFirst = token.substring(0, 2) + val + token.charAt(3);
                        let fixedAction = '';
                        if (actionString.includes(' ')) {
                            const parts = actionString.trim().split(/\s+/);
                            parts[0] = fixedFirst;
                            fixedAction = parts.join(' ');
                        } else {
                            fixedAction = fixedFirst + actionString.slice(token.length);
                        }
                        inputEl.value = fixedAction;
                        submitAction();
                    };
                    openQuartetStartDialog(f0);
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
            setNumber: (appState && appState.currentSet) ? appState.currentSet : 1,
            rotation: normalizeRotation(appState.currentRotation)
        });
        
        // Aggiorna UI
        updateScoutingUI();
        updateActionsLog();
        
        // Pulisci input
        if (inputEl) inputEl.value = '';
    } catch (error) {
        __showAlert(`Errore nella stringa: ${error.message}`, { title: 'Scouting', okText: 'OK' });
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

function __mvsFundamentalLabel(code) {
    const c = String(code || '').trim().toLowerCase();
    if (c === 'b') return 'Servizio';
    if (c === 'r') return 'Ricezione';
    if (c === 'a') return 'Attacco';
    if (c === 'd') return 'Difesa';
    if (c === 'm') return 'Muro';
    return '';
}

function processActionResult(result) {
    // Usa la fase di INIZIO RALLY per determinare rotazione al primo cambio
    const startedInReception = (appState.rallyStartPhase === 'ricezione');
    if (result.result === 'home_point') {
        appState.homeScore++;
        
        // Aggiungi al storico punteggio
        const lastFundamental = (result && Array.isArray(result.actions) && result.actions.length)
            ? result.actions[result.actions.length - 1].fundamental
            : '';
        addToScoreHistory('home', result.playerName, result.actionType, lastFundamental);
        
        // Il punto nostro porta sempre a SERVIZIO
        // La rotazione avanza SOLO se il rally era iniziato in RICEZIONE
        appState.currentPhase = 'servizio';
        if (startedInReception) rotateTeam();
    } else if (result.result === 'away_point') {
        appState.awayScore++;
        
        // Aggiungi al storico punteggio
        const lastFundamental = (result && Array.isArray(result.actions) && result.actions.length)
            ? result.actions[result.actions.length - 1].fundamental
            : '';
        addToScoreHistory('away', result.playerName, result.actionType, lastFundamental);
        
        // Punto avversario → si va in RICEZIONE, senza cambiare rotazione
        appState.currentPhase = 'ricezione';
    }
    
    // Imposta la fase di inizio del prossimo rally
    appState.rallyStartPhase = appState.currentPhase;

    // Aggiorna la visualizzazione dello storico
    updateScoreHistoryDisplay();
}

// Funzione per aggiungere un elemento allo storico punteggio
function addToScoreHistory(team, playerName, actionType, fundamental) {
    const historyItem = {
        homeScore: appState.homeScore,
        awayScore: appState.awayScore,
        team: team,
        playerName: playerName || 'Sconosciuto',
        actionType: actionType || 'Punto',
        fundamental: fundamental || '',
        timestamp: new Date().toLocaleTimeString(),
        setNumber: __getActiveSetNumber()
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
    const currentSetNum = __getActiveSetNumber();
    const baseHistory = Array.isArray(appState.scoreHistory) ? appState.scoreHistory : [];
    const hasTagged = baseHistory.some(i => i && typeof i === 'object' && i.setNumber != null);
    const reversedHistory = (hasTagged
        ? baseHistory.filter(i => i && typeof i === 'object' && Number(i.setNumber) === Number(currentSetNum))
        : baseHistory
    ).slice().reverse();
    
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
            const fText = __mvsFundamentalLabel(item.fundamental);

            if (item.team === 'home') {
                // Caso speciale: errore avversario premuto dalla sezione Player
                if ((item.actionType === 'Errore') && (String(item.playerName).toLowerCase() === 'avversario')) {
                    description.textContent = 'Errore Avversario';
                } else {
                    description.textContent = `Punto di ${item.playerName}${fText ? ` in ${fText}` : ''}`;
                }
            } else {
                description.textContent = `Errore di ${item.playerName}${fText ? ` in ${fText}` : ''}`;
            }

            historyElement.appendChild(scoreText);
            historyElement.appendChild(description);
            
            // Long-press sulla riga più recente (idx === 0) per eliminare l'ultima azione
            if (idx === 0) {
                addLongPressListener(historyElement, 1000, async () => {
                    try {
                        if (!Array.isArray(appState.actionsLog) || appState.actionsLog.length === 0) return;
                        const ok = await __askConfirm('Eliminare questa riga?', {
                            title: 'Conferma eliminazione',
                            okText: 'Elimina',
                            cancelText: 'Annulla',
                            variant: 'danger'
                        });
                        if (!ok) return;
                        // Rimuove l'ultima azione scoutizzata e ricalcola tutto
                        __removeLastActionForSet(currentSetNum);
                        recomputeFromActionsLog();
                        __markScoutingAutosaveDirty(); __scheduleScoutingAutosave(600);
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

let __mvsPillMenuCleanup = null;
function __mvsHidePillMenu() {
    try { if (typeof __mvsPillMenuCleanup === 'function') __mvsPillMenuCleanup(); } catch(_) {}
    __mvsPillMenuCleanup = null;
    try {
        const el = document.getElementById('pill-context-menu');
        if (el) el.remove();
    } catch(_) {}
}

function __mvsShowPillMenu(anchorEl, items) {
    __mvsHidePillMenu();
    if (!anchorEl) return;
    const menu = document.createElement('div');
    menu.id = 'pill-context-menu';
    menu.className = 'pill-menu';
    (items || []).forEach(it => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = (it && it.className) ? it.className : '';
        if (it && it.danger) btn.classList.add('pill-menu-danger');
        btn.textContent = (it && it.label) ? it.label : '';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            try { if (it && typeof it.onSelect === 'function') it.onSelect(); } catch(_) {}
            __mvsHidePillMenu();
        });
        menu.appendChild(btn);
    });
    document.body.appendChild(menu);

    try {
        const r = anchorEl.getBoundingClientRect();
        const pad = 6;
        const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
        const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
        const mw = menu.offsetWidth || 180;
        const mh = menu.offsetHeight || 240;
        let left = Math.min(Math.max(pad, r.left), vw - mw - pad);
        let top = r.bottom + 6;
        if (top + mh + pad > vh) top = Math.max(pad, r.top - mh - 6);
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
    } catch(_) {}

    const onOutside = (ev) => {
        try {
            const t = ev.target;
            if (!t) return;
            if (menu.contains(t)) return;
            __mvsHidePillMenu();
        } catch(_) {}
    };
    const onKey = (ev) => {
        if (ev.key === 'Escape') __mvsHidePillMenu();
    };
    const onScrollResize = () => __mvsHidePillMenu();

    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize, true);

    __mvsPillMenuCleanup = () => {
        document.removeEventListener('pointerdown', onOutside, true);
        document.removeEventListener('keydown', onKey, true);
        window.removeEventListener('scroll', onScrollResize, true);
        window.removeEventListener('resize', onScrollResize, true);
    };
}

function __mvsSpanTarget(span) {
    const kind = span?.dataset?.rowKind || span?.getAttribute?.('data-row-kind') || 'current';
    const idxStr = span?.dataset?.rowIndex || span?.getAttribute?.('data-row-index');
    const index = idxStr != null ? parseInt(idxStr, 10) : null;
    return { kind, index: Number.isFinite(index) ? index : null };
}

function __mvsGetSequenceParts(item) {
    try {
        if (item && item.__mvsParts && typeof item.__mvsParts === 'object') return item.__mvsParts;
    } catch(_) {}
    const q = String(item?.quartet || '').trim();
    const m = q.match(/^(\d{2})([bramdBRAMD])(\d)$/);
    if (!m) return { playerNumber: '', fundamental: '', evaluation: null };
    const pn = m[1];
    const f = String(m[2] || '').toLowerCase();
    const e = parseInt(m[3], 10);
    return { playerNumber: pn, fundamental: f, evaluation: Number.isFinite(e) ? e : null };
}

function __mvsSetSequenceParts(item, parts) {
    try { item.__mvsParts = { ...(item.__mvsParts || {}), ...(parts || {}) }; } catch(_) {}
}

function __mvsRebuildQuartetFromParts(item) {
    const parts = __mvsGetSequenceParts(item);
    const pn = String(parts.playerNumber || '').trim();
    const f = String(parts.fundamental || '').trim().toLowerCase();
    const e = parts.evaluation != null ? parseInt(parts.evaluation, 10) : null;
    if (pn && f && Number.isFinite(e) && e >= 1 && e <= 5) {
        item.quartet = `${String(pn).padStart(2, '0')}${f}${e}`;
    } else {
        item.quartet = '';
    }
}

function __mvsEvaluationLabel(val, fundamentalCode) {
    const v = parseInt(val, 10);
    if (!Number.isFinite(v)) return '';
    if (v === 5) {
        const f = String(fundamentalCode || '').trim().toLowerCase();
        return (f === 'd' || f === 'r') ? 'PERFETTO' : 'PUNTO';
    }
    if (v === 4) return 'POSITIVO';
    if (v === 3) return 'NEUTRO';
    if (v === 2) return 'NEGATIVO';
    if (v === 1) return 'ERRORE';
    return String(v);
}

function __mvsInsertRowAfterTarget(target) {
    try {
        if (!Array.isArray(appState.currentSequence)) appState.currentSequence = [];
        const blank = { quartet: '', playerName: '' };
        __mvsSetSequenceParts(blank, { playerNumber: '', fundamental: '', evaluation: null });
        const idx = (target && target.kind === 'sequence' && Number.isInteger(target.index))
            ? Math.min(appState.currentSequence.length, target.index + 1)
            : appState.currentSequence.length;
        appState.currentSequence.splice(idx, 0, blank);
        updateActionSummary();
        updateDescriptiveQuartet();
        updateNextFundamental();
        __markScoutingAutosaveDirty(); __scheduleScoutingAutosave(600);
    } catch(_) {}
}

function __mvsClearCurrentScoutRow() {
    try {
        if (appState.autoCloseTimerId) {
            clearTimeout(appState.autoCloseTimerId);
            appState.autoCloseTimerId = null;
        }
    } catch (_) {}
    try {
        appState.autoClosePending = false;
        appState.autoClosePayload = null;
        document.querySelectorAll('.eval-btn').forEach(btn => {
            btn.classList.remove('timer-pending');
            btn.classList.remove('selected');
            btn.style.removeProperty('--pulse-duration');
        });
    } catch(_) {}

    try { appState.selectedPlayer = null; } catch(_) {}
    try { appState.selectedEvaluation = null; } catch(_) {}
    try { appState.overrideFundamental = null; } catch(_) {}
    try { appState.calculatedFundamental = null; } catch(_) {}
    try { appState.nextFundamentalPreview = null; } catch(_) {}
    try { appState.opponentErrorPressed = false; } catch(_) {}
    try { appState.justClosedAction = false; } catch(_) {}
    try {
        if (appState.replacePlayerMode) cancelReplacePlayerMode();
    } catch(_) {}
    try { updateActionSummary(); } catch(_) {}
    try { updateNextFundamental(); } catch(_) {}
    try { updateDescriptiveQuartet(); } catch(_) {}
    try { updatePlayersGrid(); } catch(_) {}
}

function __mvsSetFundamentalForTarget(target, code) {
    const c = String(code || '').toLowerCase();
    if (!['d','a','b','r','m'].includes(c)) return;
    if (target.kind === 'sequence' && Number.isInteger(target.index)) {
        const item = (appState.currentSequence && appState.currentSequence[target.index]) ? appState.currentSequence[target.index] : null;
        if (!item) return;
        const q = String(item.quartet || '');
        if (q.length >= 4) {
            item.quartet = `${q.substring(0, 2)}${c}${q.substring(3, 4)}`;
        } else {
            __mvsSetSequenceParts(item, { fundamental: c });
            __mvsRebuildQuartetFromParts(item);
        }
        try { updateActionSummary(); } catch(_) {}
        try { updateDescriptiveQuartet(); } catch(_) {}
        try { updateNextFundamental(); } catch(_) {}
        return;
    }
    try { appState.calculatedFundamental = c; } catch(_) {}
    try { appState.overrideFundamental = null; } catch(_) {}
    try {
        if (appState.autoClosePending && appState.autoClosePayload) {
            appState.autoClosePayload.fundamental = c;
        }
    } catch(_) {}
    try { updateNextFundamental(); } catch(_) {}
    try { updateDescriptiveQuartet(); } catch(_) {}
    try { updatePlayersGrid(); } catch(_) {}
}

function __mvsSetEvaluationForTarget(target, val) {
    const v = parseInt(val, 10);
    if (!Number.isFinite(v) || v < 1 || v > 5) return;
    if (target.kind === 'sequence' && Number.isInteger(target.index)) {
        const item = (appState.currentSequence && appState.currentSequence[target.index]) ? appState.currentSequence[target.index] : null;
        if (!item) return;
        const q = String(item.quartet || '');
        if (q.length >= 4) {
            item.quartet = `${q.substring(0, 3)}${String(v)}`;
        } else {
            __mvsSetSequenceParts(item, { evaluation: v });
            __mvsRebuildQuartetFromParts(item);
        }
        try { updateActionSummary(); } catch(_) {}
        try { updateDescriptiveQuartet(); } catch(_) {}
        try { updateNextFundamental(); } catch(_) {}
        return;
    }
    try { selectEvaluation(v); } catch(_) {}
}

function __mvsDeleteRowForTarget(target) {
    if (target.kind === 'sequence' && Number.isInteger(target.index)) {
        try {
            if (!Array.isArray(appState.currentSequence)) return;
            if (target.index < 0 || target.index >= appState.currentSequence.length) return;
            appState.currentSequence.splice(target.index, 1);
            if (appState.replacePlayerMode && appState.replaceTarget && appState.replaceTarget.kind === 'sequence') {
                if (appState.replaceTarget.index === target.index) {
                    cancelReplacePlayerMode();
                } else if (Number.isInteger(appState.replaceTarget.index) && appState.replaceTarget.index > target.index) {
                    appState.replaceTarget.index = appState.replaceTarget.index - 1;
                }
            }
        } catch(_) {}
        try { updateActionSummary(); } catch(_) {}
        try { updateDescriptiveQuartet(); } catch(_) {}
        try { updateNextFundamental(); } catch(_) {}
        return;
    }
    __mvsClearCurrentScoutRow();
}

function __mvsOpenFundamentalMenuForSpan(span) {
    const target = __mvsSpanTarget(span);
    __mvsShowPillMenu(span, [
        { label: 'Elimina', danger: true, onSelect: () => __mvsDeleteRowForTarget(target) },
        { label: 'Inserisci', onSelect: () => __mvsInsertRowAfterTarget(target) },
        { label: 'DIF', onSelect: () => __mvsSetFundamentalForTarget(target, 'd') },
        { label: 'ATT', onSelect: () => __mvsSetFundamentalForTarget(target, 'a') },
        { label: 'SERV', onSelect: () => __mvsSetFundamentalForTarget(target, 'b') },
        { label: 'RICE', onSelect: () => __mvsSetFundamentalForTarget(target, 'r') },
        { label: 'MURO', onSelect: () => __mvsSetFundamentalForTarget(target, 'm') }
    ]);
}

function __mvsOpenEvaluationMenuForSpan(span) {
    const target = __mvsSpanTarget(span);
    let fCode = '';
    try {
        if (target.kind === 'sequence' && Number.isInteger(target.index)) {
            const item = (appState.currentSequence && appState.currentSequence[target.index]) ? appState.currentSequence[target.index] : null;
            const parts = __mvsGetSequenceParts(item);
            fCode = String(parts.fundamental || '').trim().toLowerCase();
        } else {
            fCode = String(appState.calculatedFundamental || appState.overrideFundamental || predictNextFundamental() || '').trim().toLowerCase();
        }
    } catch(_) {}
    const label5 = __mvsEvaluationLabel(5, fCode);
    __mvsShowPillMenu(span, [
        { label: label5, className: 'pill-menu-eval eval-5', onSelect: () => __mvsSetEvaluationForTarget(target, 5) },
        { label: 'POSITIVO', className: 'pill-menu-eval eval-4', onSelect: () => __mvsSetEvaluationForTarget(target, 4) },
        { label: 'NEUTRO', className: 'pill-menu-eval eval-3', onSelect: () => __mvsSetEvaluationForTarget(target, 3) },
        { label: 'NEGATIVO', className: 'pill-menu-eval eval-2', onSelect: () => __mvsSetEvaluationForTarget(target, 2) },
        { label: 'ERRORE', className: 'pill-menu-eval eval-1', onSelect: () => __mvsSetEvaluationForTarget(target, 1) }
    ]);
}

function __mvsSetActionsInsertMode(dlg, on) {
    try {
        window.__mvsInsertActionMode = !!on;
        if (dlg) {
            if (on) dlg.classList.add('mvs-actions-insert-mode');
            else dlg.classList.remove('mvs-actions-insert-mode');
        }
    } catch(_) {}
}

function __mvsSelectInsertAfter(idx) {
    try {
        window.__mvsInsertAfterIndex = Number.isInteger(idx) ? idx : null;
        window.__mvsInsertAfterSet = __getActiveSetNumber();
        window.__mvsForceNewActionEditor = true;
        var dlg = document.getElementById('actions-dialog');
        __mvsSetActionsInsertMode(dlg, false);
        window.openActionEditor(null);
    } catch(_) {}
}

function __mvsResolveInsertIndex(setNumber, afterIndex) {
    const logs = (window.appState && Array.isArray(window.appState.actionsLog)) ? window.appState.actionsLog : [];
    if (!logs.length) return 0;
    const hasTagged = logs.some(l => l && typeof l === 'object' && l.setNumber != null);
    if (!hasTagged) {
        if (!Number.isInteger(afterIndex)) return logs.length;
        const idx = Math.max(0, Math.min(logs.length - 1, afterIndex));
        return idx + 1;
    }
    const sn = Number(setNumber);
    let count = -1;
    let lastIdx = -1;
    for (let i = 0; i < logs.length; i++) {
        const l = logs[i];
        if (l && typeof l === 'object' && Number(l.setNumber) === sn) {
            lastIdx = i;
            count++;
            if (Number.isInteger(afterIndex) && count === afterIndex) {
                return i + 1;
            }
        }
    }
    if (lastIdx >= 0) return lastIdx + 1;
    return logs.length;
}

window.openActionsDialog = function(){
    try {
        var dlg = document.getElementById('actions-dialog');
        var logs = __getActionsLogForSet(__getActiveSetNumber());
        if (!dlg) {
            dlg = document.createElement('div');
            dlg.id = 'actions-dialog';
            dlg.className = 'dialog is-open mvs-actions-dialog';
            var panel = document.createElement('div');
            panel.className = 'dialog-content mvs-dialog-content';
            var header = document.createElement('div');
            header.className = 'dialog-header mvs-dialog-header';
            var title = document.createElement('div');
            title.className = 'mvs-dialog-title';
            var h3 = document.createElement('h3');
            h3.textContent = 'Progr. Azioni';
            var total = document.createElement('span');
            total.id = 'actions-total';
            total.className = 'mvs-dialog-subtitle';
            title.appendChild(h3);
            title.appendChild(total);
            var close = document.createElement('button');
            close.type = 'button';
            close.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
            close.className = 'close-btn mvs-close-icon';
            close.title = 'Chiudi';
            close.addEventListener('click', function(){ try{ __mvsCloseModalElement(dlg); }catch(_){} });
            header.appendChild(title);
            header.appendChild(close);
            var body = document.createElement('div');
            body.className = 'dialog-body';
            var list = document.createElement('div');
            list.id = 'actions-list-container';
            list.className = 'mvs-actions-list';
            body.appendChild(list);
            var footer = document.createElement('div');
            footer.className = 'dialog-footer';
            var addBtn = document.createElement('button');
            addBtn.className = 'secondary-btn mvs-actions-add-btn';
            addBtn.textContent = '+';
            addBtn.addEventListener('click', function(){
                try {
                    var currentLogs = __getActionsLogForSet(__getActiveSetNumber());
                    if (!currentLogs.length) {
                        window.__mvsInsertAfterIndex = -1;
                        window.__mvsInsertAfterSet = __getActiveSetNumber();
                        __mvsSetActionsInsertMode(dlg, false);
                        window.openActionEditor(null);
                        return;
                    }
                    __mvsSetActionsInsertMode(dlg, !window.__mvsInsertActionMode);
                } catch(_) {}
            });
            var cancelBtn = document.createElement('button');
            cancelBtn.className = 'secondary-btn';
            cancelBtn.textContent = 'Annulla';
            cancelBtn.addEventListener('click', function(){ try{ __mvsSetActionsInsertMode(dlg, false); __mvsCloseModalElement(dlg); }catch(_){} });
            var saveBtn = document.createElement('button');
            saveBtn.className = 'primary-btn';
            saveBtn.textContent = 'Salva';
            saveBtn.addEventListener('click', function(){ try{ __mvsSetActionsInsertMode(dlg, false); recomputeFromActionsLog(); __mvsCloseModalElement(dlg); }catch(_){} });
            footer.appendChild(addBtn);
            footer.appendChild(cancelBtn);
            footer.appendChild(saveBtn);
            panel.appendChild(header);
            panel.appendChild(body);
            panel.appendChild(footer);
            dlg.appendChild(panel);
            dlg.addEventListener('click', function(e){ if (e.target === dlg) { try{ __mvsSetActionsInsertMode(dlg, false); __mvsCloseModalElement(dlg); }catch(_){} } });
            document.addEventListener('keydown', function onKey(e){ if (e.key === 'Escape'){ try{ __mvsSetActionsInsertMode(dlg, false); __mvsCloseModalElement(dlg); }catch(_){} document.removeEventListener('keydown', onKey); } });
            document.body.appendChild(dlg);
            try{ __mvsLockScroll(); }catch(_){ try{ document.body.style.overflow='hidden'; }catch(_){ } }
        }
        __mvsSetActionsInsertMode(dlg, !!window.__mvsInsertActionMode);
        var totalEl = document.getElementById('actions-total');
        if (totalEl) totalEl.textContent = 'Totale azioni: ' + String(logs.length);
        var container = document.getElementById('actions-list-container');
        if (container) {
            container.innerHTML = '';
            if (!logs.length) {
                var empty = document.createElement('div');
                empty.className = 'mvs-empty';
                empty.textContent = 'Nessuna azione';
                container.appendChild(empty);
            } else {
                var homeScore = 0;
                var awayScore = 0;
                logs.forEach(function(item, idx){
                    var card = document.createElement('div');
                    var rr = String(item && item.result && item.result.result ? item.result.result : '');
                    if (!rr) {
                        try {
                            var parsed = parseAction(String(item && item.action ? item.action : ''));
                            rr = String(parsed && parsed.result ? parsed.result : '');
                        } catch(_) { rr = ''; }
                    }
                    var cls = 'mvs-action-row';
                    if (rr === 'home_point') cls += ' point-home';
                    else if (rr === 'away_point') cls += ' point-away';
                    card.className = cls;
                    var meta = document.createElement('div');
                    if (rr === 'home_point') homeScore += 1;
                    else if (rr === 'away_point') awayScore += 1;
                    var score = String(homeScore) + '-' + String(awayScore);
                    var phase = String(item.phase || appState.currentPhase || '');
                    var rot = String(item.rotation || '');
                    var phaseAbbr = (phase === 'servizio') ? 'S' : (phase === 'ricezione' ? 'R' : phase);
                    meta.textContent = score + ' • ' + phaseAbbr + ' ' + rot;
                    meta.className = 'mvs-action-meta';
                    var actionText = document.createElement('div');
                    actionText.textContent = String(item.action || '');
                    actionText.className = 'mvs-action-str';
                    var actions = document.createElement('div');
                    actions.className = 'mvs-action-actions';
                    var editBtn = document.createElement('button');
                    editBtn.type = 'button';
                    editBtn.className = 'icon-btn mvs-icon-btn';
                    editBtn.setAttribute('aria-label','Modifica quartine');
                    editBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0 0-3L16.5 4.5a2.1 2.1 0 0 0-3 0L3 15v5z" stroke="#0d6efd" stroke-width="2" stroke-linejoin="round"/><path d="M13.5 6.5l4 4" stroke="#0d6efd" stroke-width="2" stroke-linecap="round"/></svg>';
                    editBtn.addEventListener('click', function(ev){
                        ev.stopPropagation();
                        if (window.__mvsInsertActionMode) { __mvsSelectInsertAfter(idx); return; }
                        window.openActionEditor(idx);
                    });
                    var delBtn = document.createElement('button');
                    delBtn.type = 'button';
                    delBtn.className = 'icon-btn mvs-icon-btn';
                    delBtn.setAttribute('aria-label','Elimina azione');
                    delBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 6h18" stroke="#0d6efd" stroke-width="2" stroke-linecap="round"/><path d="M8 6v-2h8v2" stroke="#0d6efd" stroke-width="2" stroke-linecap="round"/><path d="M19 6l-1 14H6L5 6" stroke="#0d6efd" stroke-width="2" stroke-linecap="round"/><path d="M10 11v6" stroke="#0d6efd" stroke-width="2" stroke-linecap="round"/><path d="M14 11v6" stroke="#0d6efd" stroke-width="2" stroke-linecap="round"/></svg>';
                    delBtn.addEventListener('click', function(ev){
                        ev.stopPropagation();
                        if (window.__mvsInsertActionMode) { __mvsSelectInsertAfter(idx); return; }
                        try { appState.actionsLog.splice(idx, 1); recomputeFromActionsLog(); openActionsDialog(); } catch(_){} 
                    });
                    actions.appendChild(editBtn);
                    actions.appendChild(delBtn);
                    card.appendChild(meta);
                    card.appendChild(actionText);
                    card.appendChild(actions);
                    card.addEventListener('click', function(){
                        if (window.__mvsInsertActionMode) { __mvsSelectInsertAfter(idx); return; }
                        window.openActionViewer(idx);
                    });
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
            dlg.className = 'dialog is-open mvs-detail-dialog';
            dlg.style.zIndex = '1003';
            var panel = document.createElement('div');
            panel.className = 'dialog-content mvs-dialog-content';
            var header = document.createElement('div');
            header.className = 'dialog-header mvs-dialog-header';
            var h3 = document.createElement('h3');
            h3.textContent = 'Dettaglio Azione';
            h3.style.margin = '0';
            var close = document.createElement('button');
            close.type = 'button';
            close.className = 'close-btn mvs-close-icon';
            close.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
            close.title = 'Chiudi';
            close.addEventListener('click', function(){ try{ __mvsCloseModalElement(dlg); }catch(_){} });
            header.appendChild(h3);
            header.appendChild(close);
            var body = document.createElement('div');
            body.className = 'dialog-body';
            body.style.overflowX = 'auto';
            body.style.whiteSpace = 'nowrap';
            var meta = document.createElement('div');
            meta.className = 'mvs-action-meta';
            var score = String(item.score || '0-0');
            var phase = String(item.phase || appState.currentPhase || '');
            var rot = String(item.rotation || '');
            var phaseAbbr = (phase === 'servizio') ? 'S' : (phase === 'ricezione' ? 'R' : phase);
            meta.textContent = score + ' • ' + phaseAbbr + ' ' + rot;
            var action = document.createElement('span');
            action.className = 'mvs-action-str';
            action.textContent = String(item.action || '');
            body.appendChild(meta);
            body.appendChild(action);
            var footer = document.createElement('div');
            footer.className = 'dialog-footer';
            var addFull = document.createElement('button');
            addFull.type = 'button';
            addFull.className = 'secondary-btn';
            addFull.textContent = 'Aggiungi intera azione';
            addFull.addEventListener('click', function(){
                try {
                    var rawIdx = dlg && dlg.dataset ? dlg.dataset.actionIndex : null;
                    var idx = rawIdx != null ? parseInt(rawIdx, 10) : NaN;
                    if (!Number.isFinite(idx)) return;
                    window.__mvsInsertAfterIndex = idx;
                    window.__mvsInsertAfterSet = __getActiveSetNumber();
                    window.__mvsForceNewActionEditor = true;
                    __mvsCloseModalElement(dlg);
                    window.openActionEditor(null);
                } catch(_) {}
            });
            footer.appendChild(addFull);
            panel.appendChild(header);
            panel.appendChild(body);
            panel.appendChild(footer);
            dlg.appendChild(panel);
            dlg.addEventListener('click', function(e){ if (e.target === dlg) { try{ __mvsCloseModalElement(dlg); }catch(_){} } });
            document.addEventListener('keydown', function onKey(e){ if (e.key === 'Escape'){ try{ __mvsCloseModalElement(dlg); }catch(_){} document.removeEventListener('keydown', onKey); } });
            document.body.appendChild(dlg);
            try{ __mvsLockScroll(); }catch(_){ try{ document.body.style.overflow='hidden'; }catch(_){ } }
        } else {
            // if dialog exists, just update contents
            var body = dlg.querySelector('.dialog-body');
            if (body) {
                body.innerHTML = '';
                body.style.overflowX = 'auto';
                body.style.whiteSpace = 'nowrap';
                var meta = document.createElement('div');
                meta.className = 'mvs-action-meta';
                var score = String(item.score || '0-0');
                var phase = String(item.phase || appState.currentPhase || '');
                var rot = String(item.rotation || '');
                var phaseAbbr = (phase === 'servizio') ? 'S' : (phase === 'ricezione' ? 'R' : phase);
                meta.textContent = score + ' • ' + phaseAbbr + ' ' + rot;
                var action = document.createElement('span');
                action.className = 'mvs-action-str';
                action.textContent = String(item.action || '');
                body.appendChild(meta);
                body.appendChild(action);
            }
        }
        try { if (dlg) dlg.dataset.actionIndex = String(index); } catch(_) {}
    } catch(_){}
};

window.openActionEditor = function(index){
    try {
        var logs = Array.isArray(appState.actionsLog) ? appState.actionsLog : [];
        var forceNew = !!window.__mvsForceNewActionEditor;
        window.__mvsForceNewActionEditor = false;
        var isNew = forceNew || !Number.isInteger(index) || index < 0;
        var item = (!isNew && logs[index]) ? logs[index] : {};
        var actionStr = String(item.action || '');
        var parsed = parseAction(actionStr);
        var hasAvv = /(^|\s)avv(\s|$)/i.test(actionStr);
        var insertAfterIndex = window.__mvsInsertAfterIndex;
        var insertAfterSet = window.__mvsInsertAfterSet;
        window.__mvsInsertAfterIndex = null;
        window.__mvsInsertAfterSet = null;
        var dlg = document.getElementById('action-editor-dialog');
        if (!dlg) {
            dlg = document.createElement('div');
            dlg.id = 'action-editor-dialog';
            dlg.className = 'dialog is-open mvs-quartine-dialog';
            var panel = document.createElement('div');
            panel.className = 'dialog-content mvs-dialog-content';
            var header = document.createElement('div');
            header.className = 'dialog-header mvs-dialog-header';
            var h3 = document.createElement('h3');
            h3.textContent = 'Editor Azione';
            header.appendChild(h3);
            var close = document.createElement('button');
            close.type = 'button';
            close.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
            close.className = 'close-btn mvs-close-icon';
            close.title = 'Chiudi';
            close.addEventListener('click', function(){ try{ __mvsCloseModalElement(dlg); }catch(_){} });
            header.appendChild(close);
            var body = document.createElement('div');
            body.className = 'dialog-body';
            var rows = document.createElement('div');
            rows.id = 'quartine-editor-rows';
            rows.className = 'mvs-quartine-rows';
            body.appendChild(rows);
            var footer = document.createElement('div');
            footer.className = 'dialog-footer';
            var left = document.createElement('div');
            left.className = 'mvs-dialog-footer-left';
            var avvBtn = document.createElement('button');
            avvBtn.type = 'button';
            avvBtn.className = 'secondary-btn';
            avvBtn.textContent = hasAvv ? 'Rimuovi avv' : 'Aggiungi avv';
            avvBtn.addEventListener('click', function(){
                hasAvv = !hasAvv;
                avvBtn.textContent = hasAvv ? 'Rimuovi avv' : 'Aggiungi avv';
                if (hasAvv) { appendAvvRow(); ensureAvvRowPosition(); } else { var r = rowsEl.querySelector('.avv-row'); if (r) r.remove(); }
            });
            left.appendChild(avvBtn);
            footer.appendChild(left);
            var right = document.createElement('div');
            right.className = 'mvs-dialog-footer-right';
            var cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'secondary-btn';
            cancelBtn.textContent = 'Annulla';
            cancelBtn.addEventListener('click', function(){ try{ __mvsCloseModalElement(dlg); }catch(_){} });
            var saveBtn = document.createElement('button');
            saveBtn.type = 'button';
            saveBtn.className = 'primary-btn';
            saveBtn.textContent = 'Salva';
            saveBtn.addEventListener('click', function(){
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
                    if (invalid) { try{ __showAlert('Compila tutti i campi prima di confermare.', { title: 'Validazione azione', okText: 'OK' }); }catch(_){} return; }
                    if (hasAvv) parts.push('avv');
                    var updated = parts.join(' ');
                    if (!hasAvv) {
                        var lastPart = parts.length ? String(parts[parts.length - 1]) : '';
                        var lastFund = lastPart.length >= 3 ? String(lastPart.charAt(2)).toLowerCase() : '';
                        var lastEval = lastPart.length >= 4 ? parseInt(lastPart.charAt(3), 10) : NaN;
                        var closes = (lastEval === 1) || (lastEval === 5 && (lastFund === 'b' || lastFund === 'a' || lastFund === 'm'));
                        if (!closes) {
                            __showAlert('L’azione deve terminare con 1, Avv, oppure 5 se il fondamentale è Servizio, Attacco o Muro.', { title: 'Validazione azione', okText: 'OK' });
                            return;
                        }
                    }
                    var parsedUpdated = parseAction(updated);
                    if (isNew) {
                        var insertAt = logs.length;
                        if (Number.isInteger(insertAfterIndex)) {
                            insertAt = __mvsResolveInsertIndex(insertAfterSet, insertAfterIndex);
                        }
                        var entry = {
                            action: updated,
                            result: parsedUpdated,
                            timestamp: new Date().toLocaleTimeString('it-IT'),
                            setNumber: Number.isInteger(insertAfterSet) ? insertAfterSet : ((appState && appState.currentSet) ? appState.currentSet : 1),
                            rotation: normalizeRotation(appState.currentRotation)
                        };
                        if (insertAt >= logs.length) logs.push(entry);
                        else logs.splice(insertAt, 0, entry);
                    } else if (logs[index]) {
                        logs[index].action = updated;
                        logs[index].result = parsedUpdated;
                    }
                    recomputeFromActionsLog();
                    try { __mvsCloseModalElement(dlg); } catch(_){}
                    openActionsDialog();
                } catch(_){}
            });
            right.appendChild(cancelBtn);
            right.appendChild(saveBtn);
            footer.appendChild(right);
            panel.appendChild(header);
            panel.appendChild(body);
            panel.appendChild(footer);
            dlg.appendChild(panel);
            dlg.addEventListener('click', function(e){ if (e.target === dlg) { try{ __mvsCloseModalElement(dlg); }catch(_){} } });
            document.addEventListener('keydown', function onKey(e){ if (e.key === 'Escape'){ try{ __mvsCloseModalElement(dlg); }catch(_){} document.removeEventListener('keydown', onKey); } });
            document.body.appendChild(dlg);
            try{ __mvsLockScroll(); }catch(_){ try{ document.body.style.overflow='hidden'; }catch(_){ } }
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
                var avvField = document.createElement('select');
                avvField.className = 'mvs-select q-avv';
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
                var selNum = document.createElement('select');
                selNum.className = 'mvs-select q-player';
                var phNum = document.createElement('option'); phNum.value = ''; phNum.textContent = 'Seleziona'; phNum.disabled = true; selNum.appendChild(phNum);
                options.forEach(function(opt){
                    var o = document.createElement('option'); o.value = opt.value; o.textContent = opt.label; selNum.appendChild(o);
                });
                selNum.value = q && q.player ? String(q.player) : '';
                var selFund = document.createElement('select');
                selFund.className = 'mvs-select q-fund';
                var funds = (idx===0) ? ['b','r'] : fundsAll;
                var phFund = document.createElement('option'); phFund.value = ''; phFund.textContent = 'Seleziona'; phFund.disabled = true; selFund.appendChild(phFund);
                funds.forEach(function(f){ var o = document.createElement('option'); o.value = f; o.textContent = f; selFund.appendChild(o); });
                selFund.value = q && q.fundamental ? String(q.fundamental) : '';
                var selEval = document.createElement('select');
                selEval.className = 'mvs-select q-eval';
                var phEval = document.createElement('option'); phEval.value = ''; phEval.textContent = 'Seleziona'; phEval.disabled = true; selEval.appendChild(phEval);
                evalOptions.forEach(function(ev){ var o = document.createElement('option'); o.value = ev.value; o.textContent = ev.label; selEval.appendChild(o); });
                selEval.value = q && q.evaluation ? String(q.evaluation) : '';
                var actions = document.createElement('div');
                actions.className = 'mvs-quartine-actions';
                var addBtn = document.createElement('button');
                addBtn.type = 'button';
                addBtn.className = 'icon-btn mvs-icon-btn';
                addBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 5v14" stroke="#0d6efd" stroke-width="2" stroke-linecap="round"/><path d="M5 12h14" stroke="#0d6efd" stroke-width="2" stroke-linecap="round"/></svg>';
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
                delBtn.className = 'icon-btn mvs-icon-btn';
                delBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 6h18" stroke="#0d6efd" stroke-width="2" stroke-linecap="round"/><path d="M8 6v-2h8v2" stroke="#0d6efd" stroke-width="2" stroke-linecap="round"/><path d="M19 6l-1 14H6L5 6" stroke="#0d6efd" stroke-width="2" stroke-linecap="round"/><path d="M10 11v6" stroke="#0d6efd" stroke-width="2" stroke-linecap="round"/><path d="M14 11v6" stroke="#0d6efd" stroke-width="2" stroke-linecap="round"/></svg>';
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

function __ensureSetInitializedForScouting(){
    try {
        const setNum = (appState && Number.isInteger(appState.currentSet)) ? appState.currentSet : 1;
        if (__getSetMetaPresence(setNum)) return true;
        // Se il set è completed (punteggio finale raggiunto), non serve il dialog
        if (__computeSetStatus(setNum) === 'completed') return true;
        if (typeof window.openSetMetaDialog === 'function') {
            window.openSetMetaDialog(setNum, {
                onSkip: function(){}
            });
        }
    } catch(_) {}
    return false;
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
    // Fallback: se non ci sono dati da localStorage, leggi da appState.currentMatch (dati cloud)
    if (!home && !away && actions.length === 0) {
        try {
            const cm = appState?.currentMatch || {};
            const cmSh = cm.scoreHistoryBySet || {};
            const cmAb = cm.actionsBySet || {};
            const cmSt = cm.setStateBySet || {};
            const cmActions = Array.isArray(cmAb[setNum]) ? cmAb[setNum] : [];
            const cmArr = Array.isArray(cmSh[setNum]) ? cmSh[setNum] : [];
            const cmLast = cmArr.length ? cmArr[cmArr.length - 1] : null;
            const cmState = cmSt[setNum] || {};
            if (cmActions.length) actions = cmActions;
            if (cmLast && (typeof cmLast.homeScore === 'number' || typeof cmLast.awayScore === 'number')) {
                home = Number(cmLast.homeScore||0);
                away = Number(cmLast.awayScore||0);
            } else if (typeof cmState.homeScore === 'number' || typeof cmState.awayScore === 'number') {
                home = Number(cmState.homeScore||0);
                away = Number(cmState.awayScore||0);
            }
            if (cmActions.length || home || away) started = true;
        } catch(_) {}
    }
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
    const completed = __isSetCompleted(setNum, snap.home, snap.away);
    // Completed ha priorità: se i punteggi dimostrano che il set è concluso, è completed
    if (completed) return 'completed';
    if (!hasMeta && !snap.started && snap.actions.length === 0) return 'none';
    if (hasMeta || snap.started || snap.actions.length > 0) return 'partial';
    return 'none';
}

function updateSetSidebarColors(){
    try {
        const list = document.getElementById('setToolbar');
        if (!list) return;
        const items = list.querySelectorAll('.set-item');
        const matchId = __getCurrentMatchIdForCleanup();
        const allowCleanup = !!matchId && __isAutoSaveCleanupEnabled();
        items.forEach(btn => {
            const ds = btn.dataset && btn.dataset.set;
            const n = Number.parseInt(ds, 10);
            if (!Number.isInteger(n)) return;
            btn.classList.remove('status-completed','status-partial');
            const status = __computeSetStatus(n);
            if (status === 'completed') btn.classList.add('status-completed');
            else if (status === 'partial') btn.classList.add('status-partial');
            if (allowCleanup && status === 'completed') {
                const cacheKey = matchId + ':' + String(n);
                const prev = __setStatusCache[cacheKey];
                if (prev !== 'completed') {
                    __cleanupPartialSavesForSet(matchId, n);
                }
                __setStatusCache[cacheKey] = 'completed';
            } else if (matchId) {
                const cacheKey = matchId + ':' + String(n);
                __setStatusCache[cacheKey] = status;
            }
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
    let hasMeta = false;
    try {
        const cfg = session.setConfig || {};
        const sm = session.setMeta && session.setMeta[setNum];
        if (Number(setNum) === 1) {
            hasMeta = !!((cfg && cfg.ourRotation && cfg.phase) || (sm && sm.ourRotation && sm.phase));
        } else {
            hasMeta = !!(sm && sm.ourRotation && sm.phase);
        }
    } catch (_) { hasMeta = false; }
    const snap = __getSetDataSnapshotFromSession(session, setNum);
    const completed = __isSetCompletedFromScores(setNum, snap.home, snap.away);
    if (!hasMeta) return 'none';
    if (completed) return 'completed';
    return 'partial';
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
                try { openSetMetaDialog(nextSetNum); } catch(_) {}
                closeDialog('end-set-dialog');
            };
        }
    }
    openDialog('end-set-dialog');
}

function openSetMetaDialog(setNumber, options){
    var opts = options || {};
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
        var btnBypass = document.createElement('button');
        btnBypass.type = 'button';
        btnBypass.textContent = 'Non inizializzare set';
        btnBypass.className = 'btn';
        try{ btnBypass.style.background='#fff'; btnBypass.style.color='#dc3545'; btnBypass.style.border='1px solid #dc3545'; btnBypass.style.borderRadius='10px'; btnBypass.style.padding='6px 10px'; btnBypass.style.fontWeight='600'; }catch(_){ }
        btnBypass.addEventListener('click', function(){
            try {
                if (dlg && typeof dlg.__onSkip === 'function') {
                    dlg.__onSkip();
                } else if (typeof goToSet === 'function') {
                    var targetSet = (dlg && dlg.__setNumber) ? dlg.__setNumber : setNumber;
                    goToSet(targetSet, { allowUninitialized: true });
                }
            } catch(_) {}
            closeDialog('set-meta-dialog');
        });
        var btnStart = document.createElement('button');
        btnStart.id = 'set-meta-start-btn';
        btnStart.type = 'button';
        btnStart.textContent = 'Avvia Set';
        btnStart.className = 'btn';
        try{ btnStart.style.background='#fff'; btnStart.style.color='#0d6efd'; btnStart.style.border='1px solid #0d6efd'; btnStart.style.borderRadius='10px'; btnStart.style.padding='6px 10px'; btnStart.style.fontWeight='600'; }catch(_){ }
        btnStart.addEventListener('click', async function(){
            try { btnStart.disabled = true; } catch(_) {}
            var phase = selPhase.value || 'servizio';
            var ourRot = selRot.value || 'P1';
            var oppRot = selOpp.value || '';
            var targetSet = (dlg && dlg.__setNumber) ? dlg.__setNumber : setNumber;
            try {
                if (typeof cancelAutosave === 'function') cancelAutosave();
            } catch(_) {}
            try {
                if (typeof saveCurrentMatch === 'function') {
                    const ok = await saveCurrentMatch();
                    if (ok === false) {
                        try { await __showAlert('Salvataggio automatico non riuscito. Riprova.', { title: 'Salvataggio', okText: 'OK' }); } catch(_) {}
                        try { btnStart.disabled = false; } catch(_) {}
                        return;
                    }
                }
            } catch(_) {
                try { btnStart.disabled = false; } catch(_) {}
                return;
            }
            try {
                var sessionData = JSON.parse(localStorage.getItem('currentScoutingSession')||'{}');
                sessionData.setMeta = sessionData.setMeta || {};
                sessionData.setMeta[targetSet] = { ourRotation: ourRot, phase: phase, opponentRotation: oppRot || null };
                localStorage.setItem('currentScoutingSession', JSON.stringify(sessionData));
            } catch(_){ }
            // Cloud-only: salva dati di inizio set in Firestore — AWAIT
            try {
                var _teamId = sessionData?.teamId || localStorage.getItem('selectedTeamId') || '';
                var _matchId = sessionData?.id || localStorage.getItem('selectedMatchId') || '';
                if (_teamId && _matchId && window.firestoreService && typeof window.firestoreService.saveSetStartTree === 'function') {
                    await window.firestoreService.saveSetStartTree(_teamId, _matchId, targetSet, {
                        phase: phase,
                        rotation: ourRot,
                        opponentRotation: oppRot || null,
                        startTime: new Date().toISOString()
                    });
                    console.log('[MVS] saveSetStartTree set ' + targetSet + ' completato');
                }
            } catch(e) { console.warn('[MVS] saveSetStartTree set ' + targetSet + ' fallito:', e); }
            try { appState.currentSet = targetSet; } catch(_){ }
            try {
                var desired = '#/set/' + String(targetSet);
                __lastHandledSetHash = desired;
                if (location.hash !== desired) location.hash = desired;
            } catch(_){ }
            try { startSet(); } catch(_){ }
            try { updateSetSidebarColors(); } catch(_){ }
            try {
                var list = document.getElementById('setToolbar');
                if (list) {
                    list.querySelectorAll('.set-item').forEach(function(b){ b.classList.remove('active'); b.removeAttribute('aria-current'); });
                    var btn = list.querySelector('.set-item[data-set="'+ String(targetSet) +'"]');
                    if (btn) { btn.classList.add('active'); btn.setAttribute('aria-current','true'); }
                }
            } catch(_){ }
            closeDialog('set-meta-dialog');
        });
        footer.appendChild(btnCancel);
        footer.appendChild(btnBypass);
        footer.appendChild(btnStart);
        panel.appendChild(header);
        panel.appendChild(body);
        panel.appendChild(footer);
        dlg.appendChild(panel);
        document.body.appendChild(dlg);
    }
    try {
        dlg.__onSkip = (typeof opts.onSkip === 'function') ? opts.onSkip : null;
        dlg.__setNumber = setNumber;
    } catch(_) {}
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
        var startBtn = dlg.querySelector('#set-meta-start-btn');
        if (startBtn) startBtn.disabled = false;
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

    const evalText = evalVal ? __mvsEvaluationLabel(evalVal, fundamentalCode) : '';

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
                ? `<span class="token token-eval eval-${evalVal}" data-row-kind="current">${eTok}</span>`
                : `<span class="token token-eval token-placeholder" data-row-kind="current"></span>`;
            const playerCell = (appState.replacePlayerMode && appState.replaceTarget && appState.replaceTarget.kind === 'current')
                ? `<span class="token token-cancel" onclick="cancelReplacePlayerMode()" title="Annulla sostituzione">ANNULLA</span>`
                : `<span class="token token-player" data-row-kind="current">${pTok}</span>`;
            const deleteCell = appState.editRowsMode ? `<button type="button" class="multi-line-delete" data-row-kind="current" aria-label="Elimina riga">×</button>` : '';
            lines.push(`<div class="multi-line-item">${deleteCell}<span class="token token-fundamental" data-row-kind="current">${fTok}</span>${playerCell}${evalSpan}</div>`);
        } else if (evalVal) {
            // Nessun player ancora: mostra fondamentale previsto + valutazione selezionata
            const fTok = (typeof escapeHtml === 'function') ? escapeHtml(fundamentalUpper) : fundamentalUpper;
            const evalToken = evalText;
            const eTok = (typeof escapeHtml === 'function') ? escapeHtml(evalToken) : evalToken;
            const evalSpan = evalToken
                ? `<span class="token token-eval eval-${evalVal}" data-row-kind="current">${eTok}</span>`
                : `<span class="token token-eval token-placeholder" data-row-kind="current"></span>`;
            lines.push(`<div class="multi-line-item"><span class="token token-fundamental" data-row-kind="current">${fTok}</span><span class="token token-player token-placeholder"></span>${evalSpan}</div>`);
        }

        // Aggiungi le righe della sequenza (più recente in alto)
        for (let i = seq.length - 1; i >= 0; i--) {
            const item = seq[i];
            const qNorm = String(item?.quartet || '').trim();
            // Evita duplicare l'ultima riga se coincide con la riga provvisoria
            if (provisionalQuartet && i === seq.length - 1 && qNorm && qNorm === provisionalQuartet) {
                continue;
            }

            const parts = __mvsGetSequenceParts(item);
            const pnRaw = String(parts.playerNumber || '').trim();
            const pn = pnRaw ? String(pnRaw).padStart(2, '0') : '';
            const f = String(parts.fundamental || '').trim().toLowerCase();
            const e = parts.evaluation != null ? parseInt(parts.evaluation, 10) : null;

            const fUpper = f ? (fundamentalAbbr[f] || '') : '';
            const fTok = fUpper ? ((typeof escapeHtml === 'function') ? escapeHtml(fUpper) : fUpper) : '&nbsp;';
            const fCls = `token token-fundamental${fUpper ? '' : ' token-empty'}`;

            const nameUpper = String(item?.playerName || '').toUpperCase();
            const playerText = pn ? [pn, nameUpper].filter(Boolean).join(' ') : '';
            const pTok = playerText ? ((typeof escapeHtml === 'function') ? escapeHtml(playerText) : playerText) : '&nbsp;';
            const pCls = `token token-player${playerText ? '' : ' token-empty'}`;

            const evalTextLine = Number.isFinite(e) ? __mvsEvaluationLabel(e, f) : '';
            const eTok = evalTextLine ? ((typeof escapeHtml === 'function') ? escapeHtml(evalTextLine) : evalTextLine) : '&nbsp;';
            const eCls = evalTextLine ? `token token-eval eval-${e}` : 'token token-eval token-empty';

            const playerCell = (appState.replacePlayerMode && appState.replaceTarget && appState.replaceTarget.kind === 'sequence' && appState.replaceTarget.index === i)
                ? `<span class="token token-cancel" onclick="cancelReplacePlayerMode()" title="Annulla sostituzione">ANNULLA</span>`
                : `<span class="${pCls}" data-row-kind="sequence" data-row-index="${i}">${pTok}</span>`;
            const deleteCell = appState.editRowsMode ? `<button type="button" class="multi-line-delete" data-row-kind="sequence" data-row-index="${i}" aria-label="Elimina riga">×</button>` : '';
            const evalCell = `<span class="${eCls}" data-row-kind="sequence" data-row-index="${i}">${eTok}</span>`;
            lines.push(`<div class="multi-line-item">${deleteCell}<span class="${fCls}" data-row-kind="sequence" data-row-index="${i}">${fTok}</span>${playerCell}${evalCell}</div>`);
        }

        el.classList.add('multiline');
        el.classList.toggle('edit-mode', !!appState.editRowsMode);
        el.innerHTML = lines.join('');
        if (box) box.style.display = lines.length ? 'block' : 'none';
        // Rende cliccabili TUTTE le pillole player visibili per avviare la sostituzione
        try {
            const playerSpans = el.querySelectorAll('.token-player');
            playerSpans.forEach(span => {
                span.style.cursor = 'pointer';
                span.title = 'Cambia giocatore della quartina';
                span.addEventListener('click', enterReplacePlayerModeFromSpan);
                addLongPressListener(span, 650, () => {
                    const kind = span.dataset.rowKind || span.getAttribute('data-row-kind') || 'current';
                    const indexStr = span.dataset.rowIndex || span.getAttribute('data-row-index');
                    const idx = indexStr != null ? parseInt(indexStr, 10) : null;
                    enterReplacePlayerModeFor(kind, Number.isFinite(idx) ? idx : null, span);
                });
            });
            const deleteButtons = el.querySelectorAll('.multi-line-delete');
            deleteButtons.forEach((btn) => {
                btn.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    const kind = btn.getAttribute('data-row-kind') || '';
                    const idxRaw = btn.getAttribute('data-row-index');
                    const idx = idxRaw == null ? null : parseInt(idxRaw, 10);
                    __mvsDeleteActionRow(kind, Number.isFinite(idx) ? idx : null);
                });
            });
        } catch(_) {}
        try {
            const fundSpans = el.querySelectorAll('.token-fundamental');
            fundSpans.forEach(span => {
                span.style.cursor = 'context-menu';
                addLongPressListener(span, 650, () => __mvsOpenFundamentalMenuForSpan(span));
                span.addEventListener('contextmenu', (ev) => { ev.preventDefault(); __mvsOpenFundamentalMenuForSpan(span); });
            });
            const evalSpans = el.querySelectorAll('.token-eval');
            evalSpans.forEach(span => {
                if (span.classList.contains('token-placeholder')) return;
                span.style.cursor = 'context-menu';
                addLongPressListener(span, 650, () => __mvsOpenEvaluationMenuForSpan(span));
                span.addEventListener('contextmenu', (ev) => { ev.preventDefault(); __mvsOpenEvaluationMenuForSpan(span); });
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
            ? `<span class="token token-eval eval-${evalVal}" data-row-kind="current">${eTok}</span>`
            : `<span class="token token-eval token-placeholder" data-row-kind="current"></span>`;
        const playerCell = (appState.replacePlayerMode && appState.replaceTarget && appState.replaceTarget.kind === 'current')
            ? `<span class="token token-cancel" onclick="cancelReplacePlayerMode()" title="Annulla sostituzione">ANNULLA</span>`
            : `<span class="token token-player" data-row-kind="current">${pTok}</span>`;
        const html = `
            <span class="token token-fundamental" data-row-kind="current">${fTok}</span>
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
            ? `<span class="token token-eval eval-${evalVal}" data-row-kind="current">${eTok}</span>`
            : `<span class="token token-eval token-placeholder" data-row-kind="current"></span>`;
        const html = `
            <span class="token token-fundamental" data-row-kind="current">${fTok}</span>
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
            <span class="token token-fundamental" data-row-kind="current">${fTok}</span>
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
        const deleteButtons = el.querySelectorAll('.multi-line-delete');
        deleteButtons.forEach((btn) => {
            btn.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const kind = btn.getAttribute('data-row-kind') || '';
                const idxRaw = btn.getAttribute('data-row-index');
                const idx = idxRaw == null ? null : parseInt(idxRaw, 10);
                __mvsDeleteActionRow(kind, Number.isFinite(idx) ? idx : null);
            });
        });
    } catch(_) {}
    try {
        const fundSpans = el.querySelectorAll('.token-fundamental');
        fundSpans.forEach(span => {
            span.style.cursor = 'context-menu';
            addLongPressListener(span, 650, () => __mvsOpenFundamentalMenuForSpan(span));
            span.addEventListener('contextmenu', (ev) => { ev.preventDefault(); __mvsOpenFundamentalMenuForSpan(span); });
        });
        const evalSpans = el.querySelectorAll('.token-eval');
        evalSpans.forEach(span => {
            if (span.classList.contains('token-placeholder')) return;
            span.style.cursor = 'context-menu';
            addLongPressListener(span, 650, () => __mvsOpenEvaluationMenuForSpan(span));
            span.addEventListener('contextmenu', (ev) => { ev.preventDefault(); __mvsOpenEvaluationMenuForSpan(span); });
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

function __mvsDeleteActionRow(kind, index){
    try {
        const targetKind = String(kind || '').trim();
        if (targetKind === 'current') {
            appState.selectedPlayer = null;
            appState.selectedEvaluation = null;
            appState.selectedEvaluationButtonText = '';
            appState.opponentErrorPressed = false;
            if (appState.autoCloseTimerId) {
                clearTimeout(appState.autoCloseTimerId);
                appState.autoCloseTimerId = null;
            }
            appState.autoClosePending = false;
            appState.autoClosePayload = null;
            document.querySelectorAll('.eval-btn').forEach((btn) => {
                btn.classList.remove('selected');
                btn.classList.remove('timer-pending');
                btn.style.removeProperty('--pulse-duration');
            });
        } else if (targetKind === 'sequence') {
            const idx = Number.isFinite(index) ? index : parseInt(index, 10);
            if (Number.isFinite(idx) && Array.isArray(appState.currentSequence) && idx >= 0 && idx < appState.currentSequence.length) {
                appState.currentSequence.splice(idx, 1);
                try { __markScoutingAutosaveDirty(); __scheduleScoutingAutosave(600); } catch(_) {}
                if (appState.replacePlayerMode && appState.replaceTarget && appState.replaceTarget.kind === 'sequence') {
                    const tIdx = Number(appState.replaceTarget.index);
                    if (Number.isFinite(tIdx) && tIdx === idx) {
                        appState.replacePlayerMode = false;
                        appState.replaceTarget = null;
                    }
                }
            }
        }
    } catch(_) {}
    try { updateNextFundamental(); } catch(_) {}
    try { updateDescriptiveQuartet(); } catch(_) {}
}

function resetCurrentRally() {
    // Se non c'è nessuna sequenza in corso, niente da resettare
    if (!appState.currentSequence || appState.currentSequence.length === 0) {
        // Reset comunque player/eval selezionati
        appState.selectedPlayer = null;
        appState.selectedEvaluation = null;
        appState.selectedEvaluationButtonText = '';
        appState.overrideFundamental = null;
        appState.nextFundamentalPreview = null;
        appState.calculatedFundamental = null;
        appState.justClosedAction = false;
        if (appState.pressedButtons) appState.pressedButtons = [];
        try { updatePressedButtonsDisplay(); } catch(_) {}
        try { updateScoutingUI(); } catch(_) {}
        try { updateNextFundamental(); } catch(_) {}
        try { updateDescriptiveQuartet(); } catch(_) {}
        return;
    }

    // Cancella la sequenza corrente
    appState.currentSequence = [];
    appState.selectedPlayer = null;
    appState.selectedEvaluation = null;
    appState.selectedEvaluationButtonText = '';
    appState.opponentErrorPressed = false;
    appState.overrideFundamental = null;
    appState.nextFundamentalPreview = null;
    appState.calculatedFundamental = null;
    appState.justClosedAction = false;
    try { __persistCurrentSequenceQuick(); } catch(_) {}

    // Cancella auto-close timer se attivo
    if (appState.autoCloseTimerId) {
        clearTimeout(appState.autoCloseTimerId);
        appState.autoCloseTimerId = null;
    }
    appState.autoClosePending = false;
    appState.autoClosePayload = null;

    // Reset fase inizio rally alla fase corrente
    appState.rallyStartPhase = appState.currentPhase;

    // Reset display tasti premuti
    if (appState.pressedButtons) appState.pressedButtons = [];
    try { updatePressedButtonsDisplay(); } catch(_) {}

    // Aggiorna UI
    try { updateScoutingUI(); } catch(_) {}
    try { updateNextFundamental(); } catch(_) {}
    try { updateDescriptiveQuartet(); } catch(_) {}
}
window.resetCurrentRally = resetCurrentRally;

// Mappa inversione rotazione: P1↔P4, P2↔P5, P3↔P6
var __rotationSwapMap = { 'P1':'P4', 'P2':'P5', 'P3':'P6', 'P4':'P1', 'P5':'P2', 'P6':'P3' };

function __openRotationSwapDialog() {
    var curRot = (window.appState?.currentRotation) ? String(window.appState.currentRotation).toUpperCase() : '';
    if (!curRot.startsWith('P')) curRot = 'P' + curRot;
    var newRot = __rotationSwapMap[curRot];
    if (!newRot) return;

    // Rimuovi dialog precedente se esiste
    var old = document.getElementById('rotation-swap-dialog');
    if (old) old.remove();

    // Crea dialog di conferma
    var dlg = document.createElement('div');
    dlg.id = 'rotation-swap-dialog';
    dlg.className = 'dialog is-open';

    var panel = document.createElement('div');
    panel.className = 'dialog-content';
    panel.style.maxWidth = '380px';
    panel.style.width = '88%';

    // Header
    var header = document.createElement('div');
    header.className = 'dialog-header';
    var h3 = document.createElement('h3');
    h3.textContent = 'Inversione Rotazione';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'close-btn';
    closeBtn.textContent = 'Chiudi';
    closeBtn.addEventListener('click', function(){ closeDialog('rotation-swap-dialog'); });
    header.appendChild(h3);
    header.appendChild(closeBtn);

    // Body
    var body = document.createElement('div');
    body.className = 'dialog-body';
    body.style.textAlign = 'center';
    var msg = document.createElement('p');
    msg.style.fontSize = '1rem';
    msg.style.color = '#374151';
    msg.style.margin = '8px 0';
    msg.textContent = 'Confermi di invertire la rotazione da ' + curRot + ' a ' + newRot + '?';
    body.appendChild(msg);

    // Footer
    var footer = document.createElement('div');
    footer.className = 'dialog-footer';
    footer.style.justifyContent = 'center';

    var btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'secondary-btn';
    btnCancel.textContent = 'Annulla';
    btnCancel.style.background = '#fff';
    btnCancel.style.color = '#374151';
    btnCancel.style.border = '1px solid #d1d5db';
    btnCancel.addEventListener('click', function(){ closeDialog('rotation-swap-dialog'); });

    var btnConfirm = document.createElement('button');
    btnConfirm.type = 'button';
    btnConfirm.className = 'primary-btn';
    btnConfirm.textContent = 'Conferma';
    btnConfirm.style.background = '#2563eb';
    btnConfirm.style.color = '#fff';
    btnConfirm.style.border = '1px solid #2563eb';
    btnConfirm.addEventListener('click', function(){
        __applyRotationSwap(curRot, newRot);
        closeDialog('rotation-swap-dialog');
    });

    footer.appendChild(btnCancel);
    footer.appendChild(btnConfirm);

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(footer);
    dlg.appendChild(panel);
    document.body.appendChild(dlg);
}

function __applyRotationSwap(fromRot, toRot) {
    try {
        appState.currentRotation = toRot;
        // Aggiorna UI
        try { updateNextFundamental(); } catch(_) {}
        try { updateDescriptiveQuartet(); } catch(_) {}
        // Persisti il cambio
        try { __markScoutingAutosaveDirty(); __scheduleScoutingAutosave(1500); } catch(_) {}
    } catch(_) {}
}

// Attiva l'override MURO per la singola azione corrente
function activateMuroOverride() {
    try {
        const isFirstQuartet = !(appState.currentSequence && appState.currentSequence.length);
        const nextFundamental = appState.calculatedFundamental || predictNextFundamental();
        const hasCurrentCompleteQuartet = !!(appState.selectedPlayer && appState.selectedEvaluation != null);
        if (!hasCurrentCompleteQuartet && isFirstQuartet && (nextFundamental === 'b' || nextFundamental === 'r')) {
            try { __showAlert('Muro non disponibile all\'inizio dell\'azione', { title: 'Scouting', okText: 'OK' }); } catch(_){ }
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

        if (hasCurrentCompleteQuartet && !appState.autoClosePending) {
            const prevPlayer = appState.selectedPlayer;
            const evaluation = appState.selectedEvaluation;
            try {
                let fundamental = appState.calculatedFundamental || predictNextFundamental();
                if (appState.currentSequence && appState.currentSequence.length === 0) {
                    const f0 = String(fundamental || '').toLowerCase();
                    if (f0 !== 'b' && f0 !== 'r') {
                        window.__quartetStartAction = function(val) {
                            if (val === 'avv') {
                                appState.selectedPlayer = null;
                                appState.selectedEvaluation = null;
                                appState.calculatedFundamental = null;
                                appState.overrideFundamental = null;
                                try { submitOpponentError(); } catch(_) {}
                                try { activateMuroOverride(); } catch(_) {}
                                return;
                            }
                            appState.calculatedFundamental = val;
                            appState.overrideFundamental = null;
                            try { activateMuroOverride(); } catch(_) {}
                        };
                        openQuartetStartDialog(f0);
                        return;
                    }
                }
                const quartet = `${String(prevPlayer.number).padStart(2, '0')}${fundamental}${evaluation}`;
                appState.currentSequence.push({ quartet, playerName: prevPlayer.name });
                updateActionSummary();

                const tempResult = determineFinalResult(fundamental, evaluation);
                const isPoint = tempResult === 'home_point' || tempResult === 'away_point';
                if (isPoint) {
                    const actionString = appState.currentSequence.map(s => String(s?.quartet || '').trim()).filter(Boolean).join(' ');
                    const result = parseAction(actionString);
                    result.playerName = prevPlayer.name;
                    result.actionType = evaluation === 5 ? 'Punto' : 'Errore';
                    processActionResult(result);

                    appState.actionsLog.push({
                        action: actionString,
                        result: result,
                        setNumber: (appState && appState.currentSet) ? appState.currentSet : 1,
                        score: `${appState.homeScore}-${appState.awayScore}`,
                        guided: true,
                        rotation: normalizeRotation(appState.currentRotation)
                    });

                    appState.currentSequence = [];
                    updateActionSummary();
                }
            } catch (_) {}

            appState.selectedEvaluation = null;
            try { document.querySelectorAll('.eval-btn').forEach(btn => btn.classList.remove('selected')); } catch(_) {}
            appState.selectedPlayer = null;
            try { document.querySelectorAll('.player-btn').forEach(btn => btn.classList.remove('selected')); } catch(_) {}
        }

        appState.overrideFundamental = 'm';
        appState.calculatedFundamental = 'm';
        // Puliamo eventuale preview precedente per evitare che sovrascriva il banner
        appState.nextFundamentalPreview = null;
        appState.justClosedAction = false;
        // Aggiorna banner e descrizione corrente
        updateNextFundamental();
        updateDescriptiveQuartet();
        // Porta alla selezione del giocatore (ordine: MURO → Player → Valutazione)
        showScoutingStep('step-player');
    } catch (_) {}
}
try {
  window.appBuild = window.appBuild || { version: '', commit: '' };
  if (!window.appBuild.commit) window.appBuild.commit = '';
  if (!window.appBuild.version && window.MVS_APP_VERSION) window.appBuild.version = String(window.MVS_APP_VERSION);
  function renderAppVersion(){
    try {
      if (typeof window.updateAppVersionDisplay === 'function') { window.updateAppVersionDisplay(); return; }
      var els = document.querySelectorAll('.app-version');
      var v = window.MVS_APP_VERSION ? String(window.MVS_APP_VERSION) : ((window.appBuild && window.appBuild.version) ? String(window.appBuild.version) : '');
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
