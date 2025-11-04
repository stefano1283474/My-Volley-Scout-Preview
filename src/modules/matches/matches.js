/**
 * Matches Module
 * Gestisce le partite con la nuova struttura: selezione partita, dati gara, configurazione set
 */

class MatchesModule {
    constructor() {
        this.state = {
            matches: [],
            currentMatch: null,
            currentSet: 1,
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
            
            // Carica da localStorage
            const localMatches = this.getLocalMatches();
            
            // Carica da Firestore se disponibile
            let firestoreMatches = [];
            // 1) Struttura annidata: users/{uid}/matches
            if (window.authModule?.isAuthenticated() && window.firestoreService?.loadUserMatches) {
                const result = await window.firestoreService.loadUserMatches();
                if (result.success) {
                    firestoreMatches = result.documents.map(doc => ({
                        ...doc,
                        source: 'firestore_nested'
                    }));
                }
            }
            // 2) Struttura top-level: collection 'matches' con userId
            let firestoreTopLevel = [];
            if (window.authModule?.isAuthenticated() && window.firestoreFunctions?.getUserMatches) {
                try {
                    const res2 = await window.firestoreFunctions.getUserMatches();
                    if (res2?.success) {
                        firestoreTopLevel = res2.documents.map(doc => ({
                            ...doc,
                            source: 'firestore_top'
                        }));
                    }
                } catch (e) {
                    console.warn('Caricamento partite (top-level) non riuscito:', e);
                }
            }
            
            // Combina e deduplica
            const allMatches = [...localMatches, ...firestoreMatches, ...firestoreTopLevel];
            this.state.matches = this.deduplicateMatches(allMatches);
            
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
        try {
            const stored = localStorage.getItem('volleyMatches');
            const matches = stored ? JSON.parse(stored) : [];
            return matches.map(match => ({ ...match, source: 'local' }));
        } catch (error) {
            console.error('Errore nel caricamento partite locali:', error);
            return [];
        }
    }

    /**
     * Deduplica le partite basandosi sull'ID
     */
    deduplicateMatches(matches) {
        const seen = new Map();
        
        matches.forEach(match => {
            if (!seen.has(match.id) || match.source === 'firestore') {
                seen.set(match.id, match);
            }
        });
        
        return Array.from(seen.values());
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
            
            const match = {
                id: Date.now(),
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
            // Salva localmente
            await this.saveMatchLocally(match);
            
            // Salva su Firestore se disponibile
            if (window.authModule?.isAuthenticated() && window.firestoreService?.saveMatchStats) {
                try {
                    await window.firestoreService.saveMatchStats(match);
                } catch (firestoreError) {
                    console.warn('Errore nel salvataggio su Firestore:', firestoreError);
                    // Non bloccare il salvataggio locale
                }
            }
            
            // Aggiorna lo stato
            const existingIndex = this.state.matches.findIndex(m => m.id === match.id);
            if (existingIndex >= 0) {
                this.state.matches[existingIndex] = match;
            } else {
                this.state.matches.unshift(match); // Aggiungi in cima
            }
            
            this.notifyMatchesUpdate();
            
            return { success: true, match };
            
        } catch (error) {
            console.error('Errore nel salvataggio partita:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Salva la partita nel localStorage
     */
    async saveMatchLocally(match) {
        const matches = this.getLocalMatches();
        const existingIndex = matches.findIndex(m => m.id === match.id);
        
        if (existingIndex >= 0) {
            matches[existingIndex] = match;
        } else {
            matches.unshift(match);
        }
        
        localStorage.setItem('volleyMatches', JSON.stringify(matches));
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
    async deleteMatch(matchId) {
        try {
            // Rimuovi dal localStorage
            const localMatches = this.getLocalMatches();
            const filteredMatches = localMatches.filter(m => m.id !== matchId);
            localStorage.setItem('volleyMatches', JSON.stringify(filteredMatches));
            
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
    startSet() {
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