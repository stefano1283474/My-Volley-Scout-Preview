/**
 * Matches Module
 * Gestisce le partite con la nuova struttura: selezione partita, dati gara, configurazione set
 */

class MatchesModule {
    constructor() {
        const initialArchive = this.getInitialArchive();
        this.state = {
            matches: [],
            currentMatch: null,
            currentSet: 1,
            archive: initialArchive,
            setConfiguration: {
                phase: 'servizio', // 'servizio' o 'ricezione'
                rotation: 'P1',
                opponentRotation: 'P1'
            },
            isLoading: false,
            error: null
        };
        
        this.callbacks = {
            onMatchChange: [],
            onMatchesUpdate: [],
            onSetStart: [],
            onError: []
        };
        
        this.init();
    }

    /**
     * Inizializza il modulo partite
     */
    async init() {
        try {
            await this.loadMatches();
            this.setupEventListeners();
            console.log('MatchesModule inizializzato correttamente');
        } catch (error) {
            console.error('Errore nell\'inizializzazione MatchesModule:', error);
            this.handleError(error);
        }
    }

    getInitialArchive() {
        try {
            const stored = localStorage.getItem('mvsSelectedArchive');
            if (stored === 'cloud' || stored === 'local') return stored;
        } catch (_) {}
        return 'local';
    }

    setArchive(next, options = {}) {
        const v = (next === 'cloud') ? 'cloud' : 'local';
        const changed = this.state.archive !== v;
        if (!changed && options.force !== true && !options.reload) return;
        
        this.state.archive = v;
        try { localStorage.setItem('mvsSelectedArchive', v); } catch (_) {}
        
        if (options.reload !== false) {
            this.loadMatches();
        }
    }

    getArchive() {
        return this.state.archive;
    }

    reloadMatches() {
        return this.loadMatches();
    }

    /**
     * Configura gli event listeners
     */
    setupEventListeners() {
        // Event listeners per match management
        const newMatchBtn = document.getElementById('new-match-btn');
        const matchArchiveBtn = document.getElementById('match-archive-btn');
        const backToTeamSelectionBtn = document.getElementById('back-to-team-selection');
        
        if (newMatchBtn) {
            newMatchBtn.addEventListener('click', () => this.showMatchSetup());
        }
        
        if (matchArchiveBtn) {
            matchArchiveBtn.addEventListener('click', () => this.showMatchArchive());
        }
        
        if (backToTeamSelectionBtn) {
            backToTeamSelectionBtn.addEventListener('click', () => {
                if (window.teamsModule) {
                    window.teamsModule.showTeamSelection();
                }
            });
        }
        
        console.log('Event listeners configurati per MatchesModule');
    }

    /**
     * Carica le partite dal storage
     */
    async loadMatches() {
        try {
            this.state.isLoading = true;
            this.state.matches = []; // Clear matches to ensure no mixing
            this.notifyMatchesUpdate(); // Notify clear immediately

            const archive = this.state.archive === 'cloud' ? 'cloud' : 'local';
            const currentTeam = window.teamsModule?.getCurrentTeam?.() || null;
            const fallbackTeamId = (() => { try { return localStorage.getItem('selectedTeamId'); } catch(_) { return null; } })();
            const teamId = (currentTeam?.id != null ? String(currentTeam.id) : (fallbackTeamId != null ? String(fallbackTeamId) : null));
            const ownerId = (currentTeam?._mvsOwner ? String(currentTeam._mvsOwner) : (() => { try { return localStorage.getItem('selectedTeamOwner'); } catch(_) { return null; } })());
            const isAuthed = (window.authModule?.isAuthenticated?.() === true) || (!!(window.authFunctions?.getCurrentUser?.()));

            console.log(`MatchesModule: Loading matches from ${archive} for team ${teamId}`);

            if (archive === 'cloud') {
                if (!teamId || !isAuthed || !window.firestoreService?.loadTeamMatches) {
                    console.warn('MatchesModule: Cloud load skipped (missing team, auth, or service)');
                    this.state.matches = [];
                    this.notifyMatchesUpdate();
                    return;
                }

                // Risoluzione ID Team per Firestore (gestione ID basati su nome combinato)
                let targetTeamId = teamId;
                try {
                    const localTeams = JSON.parse(localStorage.getItem('volleyTeams') || '[]');
                    const teamMap = new Map();
                    (Array.isArray(localTeams) ? localTeams : []).forEach(t => {
                        const id = String(t.id || '').trim();
                        const squad = String(t.teamName || t.name || '').trim();
                        const club = String(t.clubName || '').trim();
                        const combined = (squad + (club ? ` - ${club}` : '')).trim();
                        const target = combined || id;
                        if (id) teamMap.set(id, target);
                        if (combined) teamMap.set(combined, target);
                    });
                    if (teamMap.has(teamId)) targetTeamId = teamMap.get(teamId);
                    else {
                        // Fallback se teamId non è nella mappa ma abbiamo l'oggetto team corrente
                        const squad = String(currentTeam?.teamName || currentTeam?.name || '').trim();
                        const club = String(currentTeam?.clubName || '').trim();
                        const combined = (squad + (club ? ` - ${club}` : '')).trim();
                        if (combined) targetTeamId = combined;
                    }
                } catch (e) { console.warn('MatchesModule: Error resolving team ID', e); }

                console.log(`MatchesModule: Resolved teamId ${teamId} to ${targetTeamId}`);

                const useSharedLoader = ownerId && window.firestoreService.loadTeamMatchesByOwner;
                const resTeam = useSharedLoader
                    ? await window.firestoreService.loadTeamMatchesByOwner(ownerId, targetTeamId)
                    : await window.firestoreService.loadTeamMatches(targetTeamId);
                const teamMatches = (resTeam?.success && Array.isArray(resTeam.matches)) ? resTeam.matches : ((resTeam?.success && Array.isArray(resTeam.documents)) ? resTeam.documents : []);
                this.state.matches = this.deduplicateMatchesCloud(teamMatches);
                console.log(`MatchesModule: Loaded ${this.state.matches.length} cloud matches`);
                this.notifyMatchesUpdate();
                return;
            }

            // Local archive
            const localMatches = this.getLocalMatches();
            this.state.matches = this.deduplicateMatchesLocal(localMatches);
            console.log(`MatchesModule: Loaded ${this.state.matches.length} local matches`);
            this.notifyMatchesUpdate();
            
        } catch (error) {
            console.error('Errore nel caricamento partite:', error);
            this.handleError(error);
        } finally {
            this.state.isLoading = false;
        }
    }

    /**
     * Ottiene le partite dal localStorage
     */
    getLocalMatches() {
        let list = [];
        try { list = JSON.parse(localStorage.getItem('volleyMatches')||'[]'); } catch(_) { list = []; }
        const currentTeam = window.teamsModule?.getCurrentTeam?.();
        if (!currentTeam) return Array.isArray(list) ? list : [];
        const selId = currentTeam?.id != null ? String(currentTeam.id) : null;
        const selName = currentTeam?.name || '';
        return (Array.isArray(list) ? list : []).filter(m => {
            const teamIdMatch = m.teamId != null && selId ? String(m.teamId) === selId : false;
            const my = m.myTeam || m.teamName;
            const home = m.homeTeam;
            const away = m.awayTeam;
            return teamIdMatch || (selName && (my === selName || home === selName || away === selName));
        });
    }

    /**
     * Deduplica le partite basandosi sull'ID
     */
    deduplicateMatches(matches) {
        const seen = new Map();
        matches.forEach(match => {
            const isFirestore = typeof match.source === 'string' && match.source.toLowerCase().startsWith('firestore');
            if (!seen.has(match.id) || isFirestore) {
                seen.set(match.id, match);
            }
        });
        return Array.from(seen.values());
    }

    deduplicateMatchesLocal(matches) {
        const out = [];
        const indexByKey = new Map();
        const score = (m) => {
            let s = 0;
            try {
                if (Array.isArray(m?.roster) && m.roster.length) s += 6;
                if (m?.actionsBySet && typeof m.actionsBySet === 'object' && Object.keys(m.actionsBySet).length) s += 8;
                if (m?.setMeta && typeof m.setMeta === 'object' && Object.keys(m.setMeta).length) s += 4;
                if (m?.setStateBySet && typeof m.setStateBySet === 'object' && Object.keys(m.setStateBySet).length) s += 3;
                if (m?.setSummary && typeof m.setSummary === 'object' && Object.keys(m.setSummary).length) s += 3;
                if (m?.scoreHistoryBySet && typeof m.scoreHistoryBySet === 'object' && Object.keys(m.scoreHistoryBySet).length) s += 2;
                if (Array.isArray(m?.sets) && m.sets.length) s += 1;
                const scoreObj = m?.score;
                if (scoreObj && typeof scoreObj === 'object' && (Number(scoreObj.home || 0) || Number(scoreObj.away || 0))) s += 1;
            } catch (_) { }
            return s;
        };
        const keyOf = (m) => {
            const date = String(m?.matchDate || m?.date || '').trim();
            const status = String(m?.status || '').trim();
            const type = String(m?.eventType || m?.matchType || '').trim();
            const home = String(m?.homeTeam || m?.myTeam || m?.teamName || '').trim();
            const away = String(m?.awayTeam || m?.opponentTeam || '').trim();
            if (date || home || away || status || type) return `sig:${date}|${home}|${away}|${status}|${type}`;
            const id = String(m?.id || '').trim();
            if (id) return `id:${id}`;
            return `raw:${String(m?.createdAt || m?.updatedAt || '')}`;
        };
        for (const m of (Array.isArray(matches) ? matches : [])) {
            const key = keyOf(m);
            const idx = indexByKey.get(key);
            if (idx == null) {
                indexByKey.set(key, out.length);
                out.push(m);
            } else {
                const current = out[idx];
                out[idx] = score(m) >= score(current) ? Object.assign({}, current, m) : Object.assign({}, m, current);
            }
        }
        return out;
    }

    deduplicateMatchesCloud(matches) {
        const out = [];
        const seen = new Set();
        for (const m of (Array.isArray(matches) ? matches : [])) {
            const id = String(m?.id || '').trim();
            if (!id || seen.has(id)) continue;
            seen.add(id);
            out.push(m);
        }
        return out;
    }

    /**
     * Crea una nuova partita
     */
    async createMatch(matchData) {
        try {
            // Validazione dati
            const validation = this.validateMatchData(matchData);
            if (!validation.isValid) {
                throw new Error(validation.errors.join(', '));
            }
            
            if (!matchData.id) {
                throw new Error('ID partita mancante');
            }
            const match = {
                id: String(matchData.id),
                homeTeam: matchData.homeTeam.trim(),
                awayTeam: matchData.awayTeam.trim(),
                myTeam: matchData.myTeam.trim(),
                opponentTeam: matchData.opponentTeam.trim(),
                homeAway: matchData.homeAway, // 'home' o 'away'
                matchType: matchData.matchType, // 'campionato', 'coppa', 'amichevole', 'playoff'
                date: matchData.date || new Date().toLocaleDateString('it-IT'),
                description: matchData.description || '',
                // opzionale: nome torneo quando tipo è "torneo"
                tournamentName: matchData.matchType === 'torneo' ? (matchData.tournamentName || '').trim() : undefined,
                sets: [],
                currentSet: 1,
                score: { home: 0, away: 0 },
                status: 'created', // 'created', 'in_progress', 'completed'
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            // Salva la partita
            const result = await this.saveMatch(match);
            if (result.success) {
                this.state.currentMatch = match;
                this.notifyMatchChange(match);
                return { success: true, match };
            }
            
            return result;
            
        } catch (error) {
            console.error('Errore nella creazione partita:', error);
            this.handleError(error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Valida i dati della partita
     */
    validateMatchData(data) {
        const errors = [];
        
        if (!data.myTeam?.trim()) {
            errors.push('Il nome della tua squadra è obbligatorio');
        }
        
        if (!data.opponentTeam?.trim()) {
            errors.push('Il nome della squadra avversaria è obbligatorio');
        }
        
        if (!data.homeAway) {
            errors.push('Specifica se giochi in casa o in trasferta');
        }
        
        if (!data.matchType) {
            errors.push('Seleziona il tipo di partita');
        }

        if (data.matchType === 'torneo' && !data.tournamentName?.trim()) {
            errors.push('Inserisci il nome del torneo');
        }
        
        if (data.myTeam?.trim().toLowerCase() === data.opponentTeam?.trim().toLowerCase()) {
            errors.push('La tua squadra e quella avversaria non possono avere lo stesso nome');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Salva una partita
     */
    async saveMatch(match) {
        try {
            const archive = this.state.archive === 'cloud' ? 'cloud' : 'local';
            let updatedMatch = match;

            if (archive === 'cloud') {
                const isAuthed = (window.authModule?.isAuthenticated?.() === true) || (!!(window.authFunctions?.getCurrentUser?.()));
                if (!isAuthed || !window.firestoreService?.saveMatchTree) {
                    return { success: false, error: 'Utente non autenticato' };
                }
                const currentTeam = window.teamsModule?.getCurrentTeam?.() || null;
                const fallbackTeamId = (() => { try { return localStorage.getItem('selectedTeamId'); } catch(_) { return null; } })();
                const teamId = (currentTeam?.id != null ? String(currentTeam.id) : (fallbackTeamId != null ? String(fallbackTeamId) : null));
                if (!teamId) return { success: false, error: 'Squadra non selezionata' };
                await window.firestoreService.saveMatchTree(teamId, match);
                if (Array.isArray(match.roster) && window.firestoreService?.saveMatchRosterTree) {
                    try { await window.firestoreService.saveMatchRosterTree(teamId, match.id, match.roster); } catch(_) {}
                }
                if (window.firestoreService?.saveMatchDetailsTree) {
                    try {
                        await window.firestoreService.saveMatchDetailsTree(teamId, match.id, {
                            actionsBySet: match.actionsBySet || {},
                            setMeta: match.setMeta || {},
                            setStateBySet: match.setStateBySet || {},
                            setSummary: match.setSummary || {},
                            scoreHistoryBySet: match.scoreHistoryBySet || {}
                        });
                    } catch(_) {}
                }
                updatedMatch = Object.assign({}, match, { source: 'firestore_team' });
            } else {
                await this.saveMatchLocally(match);
            }
            
            // Aggiorna lo stato
            const existingIndex = this.state.matches.findIndex(m => m.id === updatedMatch.id);
            if (existingIndex >= 0) {
                this.state.matches[existingIndex] = updatedMatch;
            } else {
                this.state.matches.unshift(updatedMatch); // Aggiungi in cima
            }
            
            this.notifyMatchesUpdate();
            
            return { success: true, match: updatedMatch };
            
        } catch (error) {
            console.error('Errore nel salvataggio partita:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Salva la partita nel localStorage
     */
    async saveMatchLocally(match) {
        let all = [];
        try { all = JSON.parse(localStorage.getItem('volleyMatches')||'[]'); } catch(_) { all = []; }
        const existingIndex = all.findIndex(m => m.id === match.id);
        if (existingIndex >= 0) {
            all[existingIndex] = match;
        } else {
            all.unshift(match);
        }
        localStorage.setItem('volleyMatches', JSON.stringify(all));
    }

    /**
     * Carica una partita esistente
     */
    loadMatch(matchId) {
        const match = this.state.matches.find(m => m.id === matchId);
        if (match) {
            this.state.currentMatch = match;
            this.state.currentSet = match.currentSet || 1;
            this.notifyMatchChange(match);
            return { success: true, match };
        }
        return { success: false, error: 'Partita non trovata' };
    }

    /**
     * Elimina una partita
     */
    async deleteMatch(matchId, options = { confirm: true }) {
        try {
            // Conferma eliminazione PRIMA di eseguire l'operazione
            if (options?.confirm) {
                const ok = typeof window !== 'undefined' ? window.confirm("Confermi l'eliminazione di questa partita?") : true;
                if (!ok) {
                    return { success: false, cancelled: true };
                }
            }
            const archive = this.state.archive === 'cloud' ? 'cloud' : 'local';

            if (archive === 'cloud') {
                const isAuthed = (window.authModule?.isAuthenticated?.() === true) || (!!(window.authFunctions?.getCurrentUser?.()));
                if (!isAuthed || !window.firestoreService?.deleteMatchTree) {
                    return { success: false, error: 'Utente non autenticato' };
                }
                const currentTeam = window.teamsModule?.getCurrentTeam?.() || null;
                const fallbackTeamId = (() => { try { return localStorage.getItem('selectedTeamId'); } catch(_) { return null; } })();
                const teamId = (currentTeam?.id != null ? String(currentTeam.id) : (fallbackTeamId != null ? String(fallbackTeamId) : null));
                if (!teamId) return { success: false, error: 'Squadra non selezionata' };
                const res = await window.firestoreService.deleteMatchTree(teamId, String(matchId), { maxSets: 6 });
                if (!res?.success) return { success: false, error: res?.error || 'Errore eliminazione' };
            } else {
                let all = [];
                try { all = JSON.parse(localStorage.getItem('volleyMatches')||'[]'); } catch(_) { all = []; }
                const kept = (Array.isArray(all) ? all : []).filter(m => String(m?.id) !== String(matchId));
                localStorage.setItem('volleyMatches', JSON.stringify(kept));
            }
            
            // Rimuovi dallo stato
            this.state.matches = this.state.matches.filter(m => m.id !== matchId);
            
            // Se era la partita corrente, resettala
            if (this.state.currentMatch?.id === matchId) {
                this.state.currentMatch = null;
                this.notifyMatchChange(null);
            }
            
            this.notifyMatchesUpdate();
            
            return { success: true };

        } catch (error) {
            console.error('Errore nell\'eliminazione partita:', error);
            this.handleError(error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Configura il set corrente
     */
    configureSet(setNumber, configuration) {
        try {
            // Validazione
            if (setNumber < 1 || setNumber > 6) {
                throw new Error('Numero set non valido (1-6)');
            }
            
            if (!['servizio', 'ricezione'].includes(configuration.phase)) {
                throw new Error('Fase non valida (servizio/ricezione)');
            }
            
            if (!['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].includes(configuration.rotation)) {
                throw new Error('Rotazione non valida (P1-P6)');
            }
            
            this.state.currentSet = setNumber;
            this.state.setConfiguration = {
                phase: configuration.phase,
                rotation: configuration.rotation,
                opponentRotation: configuration.opponentRotation || 'P1'
            };
            
            // Aggiorna la partita corrente se presente
            if (this.state.currentMatch) {
                this.state.currentMatch.currentSet = setNumber;
                this.state.currentMatch.updatedAt = new Date().toISOString();
                this.saveMatch(this.state.currentMatch);
            }
            
            return { success: true, configuration: this.state.setConfiguration };
            
        } catch (error) {
            console.error('Errore nella configurazione set:', error);
            this.handleError(error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Avvia il set con la configurazione corrente
     */
    async startSet() {
        try {
            if (!this.state.currentMatch) {
                throw new Error('Nessuna partita selezionata');
            }
            
            if (!this.state.setConfiguration.phase || !this.state.setConfiguration.rotation) {
                throw new Error('Configurazione set incompleta');
            }
            
            // Verifica che ci sia una squadra selezionata
            if (!window.teamsModule?.getCurrentTeam()) {
                throw new Error('Nessuna squadra selezionata. Seleziona prima una squadra.');
            }
            
            const setData = {
                setNumber: this.state.currentSet,
                phase: this.state.setConfiguration.phase,
                rotation: this.state.setConfiguration.rotation,
                opponentRotation: this.state.setConfiguration.opponentRotation,
                startTime: new Date().toISOString(),
                actions: []
            };
            
            // Aggiorna la partita
            this.state.currentMatch.status = 'in_progress';
            this.state.currentMatch.updatedAt = new Date().toISOString();
            
            // Inizializza il set se non esiste
            if (!this.state.currentMatch.sets) {
                this.state.currentMatch.sets = [];
            }
            
            const existingSetIndex = this.state.currentMatch.sets.findIndex(s => s.setNumber === this.state.currentSet);
            if (existingSetIndex >= 0) {
                this.state.currentMatch.sets[existingSetIndex] = setData;
            } else {
                this.state.currentMatch.sets.push(setData);
            }
            
            this.saveMatch(this.state.currentMatch);
            if (window.authModule?.isAuthenticated() && window.firestoreService?.saveSetStartTree) {
                try {
                    const currentTeam = window.teamsModule?.getCurrentTeam?.();
                    if (currentTeam?.id && this.state.currentMatch?.id) {
                        await window.firestoreService.saveSetStartTree(currentTeam.id, this.state.currentMatch.id, this.state.currentSet, setData);
                    }
                } catch (e) {}
            }
            
            // Notifica l'avvio del set
            this.notifySetStart(setData);
            
            return { success: true, setData };
            
        } catch (error) {
            console.error('Errore nell\'avvio set:', error);
            this.handleError(error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Ottiene le statistiche della partita
     */
    getMatchStats(matchId = null) {
        const match = matchId ? this.getMatchById(matchId) : this.state.currentMatch;
        if (!match) return null;
        
        const stats = {
            match: {
                id: match.id,
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
                myTeam: match.myTeam,
                date: match.date,
                type: match.matchType
            },
            sets: match.sets?.length || 0,
            score: match.score || { home: 0, away: 0 },
            status: match.status,
            duration: this.calculateMatchDuration(match)
        };
        
        return stats;
    }

    /**
     * Calcola la durata della partita
     */
    calculateMatchDuration(match) {
        if (!match.sets || match.sets.length === 0) return 0;
        
        const firstSet = match.sets[0];
        const lastSet = match.sets[match.sets.length - 1];
        
        if (!firstSet.startTime) return 0;
        
        const endTime = lastSet.endTime || new Date().toISOString();
        const start = new Date(firstSet.startTime);
        const end = new Date(endTime);
        
        return Math.floor((end - start) / 1000 / 60); // minuti
    }

    /**
     * Gestione errori
     */
    handleError(error) {
        console.error('MatchesModule Error:', error);
        this.state.error = error;
        this.notifyError(error);
    }

    /**
     * Utility per gestione schermate
     */
    showScreen(screenId) {
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.add('active');
            screen.classList.remove('hidden');
        }
    }

    hideScreen(screenId) {
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.remove('active');
            screen.classList.add('hidden');
        }
    }

    hideAllScreens() {
        const screens = ['loading-screen', 'auth-screen', 'welcome-screen', 'team-selection-screen', 'match-management-screen', 'match-setup-screen', 'set-config-screen', 'scouting-screen'];
        screens.forEach(screenId => this.hideScreen(screenId));
    }

    /**
     * Mostra la schermata di gestione partite
     */
    showMatchManagement() {
        this.hideAllScreens();
        this.showScreen('match-management-screen');
        this.updateMatchManagementUI();
    }

    /**
     * Mostra la schermata di setup partita
     */
    showMatchSetup() {
        this.hideAllScreens();
        this.showScreen('match-setup-screen');
        this.setupMatchForm();
    }

    /**
     * Mostra l'archivio partite
     */
    showMatchArchive() {
        // TODO: Implementare archivio partite
        console.log('Mostra archivio partite');
    }

    /**
     * Mostra la configurazione set
     */
    showSetConfiguration() {
        this.hideAllScreens();
        this.showScreen('set-config-screen');
        this.updateSetConfigUI();
    }

    /**
     * Aggiorna l'UI della gestione partite
     */
    updateMatchManagementUI() {
        const currentTeamName = document.getElementById('current-team-name');
        const currentTeam = window.teamsModule?.getCurrentTeam();
        
        if (currentTeamName && currentTeam) {
            currentTeamName.textContent = currentTeam.name;
        }
    }

    /**
     * Configura il form di creazione partita
     */
    setupMatchForm() {
        const matchForm = document.getElementById('match-form');
        const startScoutingBtn = document.getElementById('start-scouting-btn');
        
        if (matchForm) {
            matchForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleMatchFormSubmit(e);
            });
        }
        
        if (startScoutingBtn) {
            startScoutingBtn.addEventListener('click', () => {
                this.showSetConfiguration();
            });
        }
    }

    /**
     * Gestisce l'invio del form partita
     */
    async handleMatchFormSubmit(event) {
        const formData = new FormData(event.target);
        const currentTeam = window.teamsModule?.getCurrentTeam();
        
        if (!currentTeam) {
            this.showError('Nessuna squadra selezionata');
            return;
        }
        
        const matchData = {
            myTeam: currentTeam.name,
            opponentTeam: formData.get('opponent-team'),
            homeAway: formData.get('home-away'),
            matchType: formData.get('match-type'),
            date: formData.get('match-date'),
            description: formData.get('match-description')
        };
        try {
            const selId = localStorage.getItem('selectedMatchId');
            if (!selId) {
                this.showError('ID partita mancante. Usa il pulsante "+" in Elenco Partite.');
                return;
            }
            matchData.id = String(selId);
        } catch(_){
            this.showError('Errore lettura ID partita');
            return;
        }
        
        // Determina home e away team
        if (matchData.homeAway === 'home') {
            matchData.homeTeam = matchData.myTeam;
            matchData.awayTeam = matchData.opponentTeam;
        } else {
            matchData.homeTeam = matchData.opponentTeam;
            matchData.awayTeam = matchData.myTeam;
        }
        
        const result = await this.createMatch(matchData);
        if (result.success) {
            this.showSetConfiguration();
        } else {
            this.showError(result.error);
        }
    }

    /**
     * Aggiorna l'UI della configurazione set
     */
    updateSetConfigUI() {
        const currentMatch = this.state.currentMatch;
        if (!currentMatch) return;
        
        const matchInfo = document.getElementById('match-info');
        const setSelector = document.getElementById('set-selector');
        const scoutBtn = document.getElementById('scout-btn');
        
        if (matchInfo) {
            matchInfo.innerHTML = `
                <h3>${currentMatch.myTeam} vs ${currentMatch.opponentTeam}</h3>
                <p>${currentMatch.date} - ${currentMatch.matchType}</p>
            `;
        }
        
        if (setSelector) {
            setSelector.innerHTML = '';
            for (let i = 1; i <= 5; i++) {
                const option = document.createElement('option');
                option.value = i;
                option.textContent = `Set ${i}`;
                if (i === this.state.currentSet) {
                    option.selected = true;
                }
                setSelector.appendChild(option);
            }
        }
        
        if (scoutBtn) {
            scoutBtn.addEventListener('click', () => this.handleStartScouting());
        }
    }

    /**
     * Gestisce l'avvio dello scouting
     */
    async handleStartScouting() {
        const setNumber = parseInt(document.getElementById('set-selector')?.value || 1);
        const phase = document.querySelector('input[name="phase"]:checked')?.value || 'servizio';
        const rotation = document.getElementById('rotation-selector')?.value || 'P1';
        const opponentRotation = document.getElementById('opponent-rotation-selector')?.value || 'P1';
        
        const configResult = await this.configureSet(setNumber, {
            phase,
            rotation,
            opponentRotation
        });
        
        if (configResult.success) {
            const startResult = this.startSet();
            if (startResult.success) {
                // Avvia il sistema di scouting esistente
                if (window.scoutingModule) {
                    window.scoutingModule.startScouting(this.state.currentMatch, startResult.setData);
                } else {
                    this.hideAllScreens();
                    this.showScreen('scouting-screen');
                }
            } else {
                this.showError(startResult.error);
            }
        } else {
            this.showError(configResult.error);
        }
    }

    /**
     * Mostra errore
     */
    showError(message) {
        // TODO: Implementare sistema di notifiche
        console.error('Match Error:', message);
        alert(message); // Temporaneo
    }

    /**
     * Sistema di callback
     */
    onMatchChange(callback) {
        this.callbacks.onMatchChange.push(callback);
    }

    onMatchesUpdate(callback) {
        this.callbacks.onMatchesUpdate.push(callback);
    }

    onSetStart(callback) {
        this.callbacks.onSetStart.push(callback);
    }

    onError(callback) {
        this.callbacks.onError.push(callback);
    }

    notifyMatchChange(match) {
        this.callbacks.onMatchChange.forEach(callback => {
            try {
                callback(match);
            } catch (error) {
                console.error('Errore nel callback onMatchChange:', error);
            }
        });
    }

    notifyMatchesUpdate() {
        this.callbacks.onMatchesUpdate.forEach(callback => {
            try {
                callback(this.state.matches);
            } catch (error) {
                console.error('Errore nel callback onMatchesUpdate:', error);
            }
        });
    }

    notifySetStart(setData) {
        this.callbacks.onSetStart.forEach(callback => {
            try {
                callback(setData, this.state.currentMatch);
            } catch (error) {
                console.error('Errore nel callback onSetStart:', error);
            }
        });
    }

    notifyError(error) {
        this.callbacks.onError.forEach(callback => {
            try {
                callback(error);
            } catch (error) {
                console.error('Errore nel callback onError:', error);
            }
        });
    }

    /**
     * API pubblica
     */
    getMatches() {
        return [...this.state.matches];
    }

    getCurrentMatch() {
        return this.state.currentMatch;
    }

    getMatchById(id) {
        return this.state.matches.find(m => m.id === id);
    }

    getCurrentSet() {
        return this.state.currentSet;
    }

    getSetConfiguration() {
        return { ...this.state.setConfiguration };
    }

    isLoading() {
        return this.state.isLoading;
    }

    getError() {
        return this.state.error;
    }
}

// Inizializza il modulo
let matchesModule;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        matchesModule = new MatchesModule();
        window.matchesModule = matchesModule;
    });
} else {
    matchesModule = new MatchesModule();
    window.matchesModule = matchesModule;
}

// Esporta per compatibilità
window.MatchesModule = MatchesModule;
