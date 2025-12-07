/**
 * My Volley Scout - Main Application
 * Coordina tutti i moduli e gestisce la navigazione tra le schermate
 */

class VolleyScoutApp {
    constructor() {
        this.state = {
            currentScreen: 'loading',
            isInitialized: false,
            modules: {
                auth: null,
                teams: null,
                matches: null,
                scouting: null
            }
        };
        
        this.init();
    }

    /**
     * Inizializza l'applicazione
     */
    async init() {
        try {
            console.log('🚀 Inizializzazione My Volley Scout...');
            
            // Mostra schermata di caricamento
            this.showLoadingScreen();
            console.log('📱 Schermata di caricamento mostrata');
            
            // Aspetta che tutti i moduli siano caricati
            console.log('⏳ Attesa caricamento moduli...');
            await this.waitForModules();
            console.log('✅ Tutti i moduli caricati');
            
            // Configura i callback tra moduli
            console.log('🔗 Configurazione callback moduli...');
            this.setupModuleCallbacks();
            
            // Configura gli event listeners globali
            console.log('👂 Configurazione event listeners...');
            this.setupGlobalEventListeners();
            
            // Inizializzazione completata
            this.state.isInitialized = true;
            
            console.log('🎉 My Volley Scout inizializzato correttamente');
            console.log('📊 Stato app:', this.state);
            
            // L'AuthModule gestirà automaticamente la navigazione
            // in base allo stato di autenticazione
            
        } catch (error) {
            console.error('❌ Errore nell\'inizializzazione dell\'app:', error);
            this.showError('Errore nell\'inizializzazione dell\'applicazione');
        }
    }

    /**
     * Aspetta che tutti i moduli siano disponibili
     */
    async waitForModules() {
        const maxWait = 10000; // 10 secondi
        const startTime = Date.now();
        
        return new Promise((resolve, reject) => {
            const checkModules = () => {
                // Debug: mostra stato moduli
                const moduleStatus = {
                    authModule: !!window.authModule,
                    teamsModule: !!window.teamsModule,
                    matchesModule: !!window.matchesModule,
                    scoutingModule: !!window.scoutingModule
                };
                console.log('🔍 Stato moduli:', moduleStatus);
                
                // Verifica se tutti i moduli sono disponibili
                if (window.authModule && window.teamsModule && window.matchesModule) {
                    this.state.modules.auth = window.authModule;
                    this.state.modules.teams = window.teamsModule;
                    this.state.modules.matches = window.matchesModule;
                    console.log('✅ Tutti i moduli richiesti sono disponibili');
                    resolve();
                } else if (Date.now() - startTime > maxWait) {
                    console.error('⏰ Timeout nel caricamento dei moduli. Stato finale:', moduleStatus);
                    reject(new Error('Timeout nel caricamento dei moduli'));
                } else {
                    setTimeout(checkModules, 100);
                }
            };
            
            checkModules();
        });
    }

    /**
     * Configura i callback tra moduli
     */
    setupModuleCallbacks() {
        // Callback per cambiamenti di autenticazione
        if (this.state.modules.auth) {
            this.state.modules.auth.onAuthStateChange((user, isAuthenticated) => {
                this.handleAuthStateChange(user, isAuthenticated);
            });
            
            this.state.modules.auth.onError((error) => {
                this.handleAuthError(error);
            });
        }
        
        // Callback per cambiamenti di squadra
        if (this.state.modules.teams) {
            this.state.modules.teams.onTeamChange((team) => {
                this.handleTeamChange(team);
            });
            
            this.state.modules.teams.onError((error) => {
                this.handleTeamsError(error);
            });
        }
        
        // Callback per cambiamenti di partita
        if (this.state.modules.matches) {
            this.state.modules.matches.onMatchChange((match) => {
                this.handleMatchChange(match);
            });
            
            this.state.modules.matches.onSetStart((setData, match) => {
                this.handleSetStart(setData, match);
            });
            
            this.state.modules.matches.onError((error) => {
                this.handleMatchesError(error);
            });
        }
    }

    /**
     * Configura gli event listeners globali
     */
    setupGlobalEventListeners() {
        // Event listeners per la schermata di benvenuto
        this.setupWelcomeScreenListeners();
        
        // Event listeners per la gestione delle squadre
        this.setupTeamManagementListeners();
        
        // Event listeners per la gestione delle partite
        this.setupMatchManagementListeners();
        
        // Event listeners per il scouting
        this.setupScoutingListeners();
    }

    /**
     * Event listeners per la schermata di benvenuto
     */
    setupWelcomeScreenListeners() {
        const selectTeamCard = document.getElementById('selectTeamCard');
        const createTeamCard = document.getElementById('createTeamCard');
        const manageTeamsCard = document.getElementById('manageTeamsCard');
        
        if (selectTeamCard) {
            selectTeamCard.addEventListener('click', () => {
                this.showTeamSelection();
            });
        }
        
        if (createTeamCard) {
            createTeamCard.addEventListener('click', () => {
                this.showCreateTeamForm();
            });
        }
        
        if (manageTeamsCard) {
            manageTeamsCard.addEventListener('click', () => {
                this.showTeamManagement();
            });
        }
    }

    /**
     * Event listeners per la gestione squadre
     */
    setupTeamManagementListeners() {
        // Implementazione futura per UI gestione squadre
    }

    /**
     * Event listeners per la gestione partite
     */
    setupMatchManagementListeners() {
        // Implementazione futura per UI gestione partite
    }

    /**
     * Event listeners per il scouting
     */
    setupScoutingListeners() {
        // Implementazione futura per UI scouting
    }

    /**
     * Gestisce i cambiamenti di stato dell'autenticazione
     */
    handleAuthStateChange(user, isAuthenticated) {
        console.log('Cambio stato autenticazione:', { user: user?.email, isAuthenticated });
        
        if (isAuthenticated) {
            // Utente autenticato - mostra schermata di benvenuto
            this.state.currentScreen = 'welcome';
        } else {
            // Utente non autenticato - mostra schermata di login
            this.state.currentScreen = 'auth';
        }
    }

    /**
     * Gestisce i cambiamenti di squadra
     */
    handleTeamChange(team) {
        console.log('Squadra cambiata:', team?.name);
        
        if (team) {
            // Squadra selezionata - mostra selezione partita
            this.showMatchSelection();
        }
    }

    /**
     * Gestisce i cambiamenti di partita
     */
    handleMatchChange(match) {
        console.log('Partita cambiata:', match?.homeTeam, 'vs', match?.awayTeam);
        
        if (match) {
            // Partita selezionata - mostra configurazione set
            this.showSetConfiguration();
        }
    }

    /**
     * Gestisce l'avvio del set
     */
    handleSetStart(setData, match) {
        console.log('Set avviato:', setData.setNumber, 'per la partita', match.homeTeam, 'vs', match.awayTeam);
        
        // Avvia il sistema di scouting
        this.startScouting(setData, match);
    }

    /**
     * Mostra la schermata di caricamento
     */
    showLoadingScreen() {
        this.hideAllScreens();
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.style.display = 'flex';
        }
        this.state.currentScreen = 'loading';
    }

    /**
     * Mostra la selezione delle squadre
     */
    showTeamSelection() {
        window.location.href = '/my-teams.html';
    }

    /**
     * Mostra il form di creazione squadra
     */
    showCreateTeamForm() {
        console.log('Mostra form creazione squadra');
        
        // Crea e mostra l'UI per la creazione squadra
        this.createTeamFormUI();
    }

    /**
     * Mostra la gestione squadre
     */
    showTeamManagement() {
        console.log('Mostra gestione squadre');
        
        // Crea e mostra l'UI per la gestione squadre
        this.createTeamManagementUI();
    }

    /**
     * Mostra la selezione partita
     */
    showMatchSelection() {
        console.log('Mostra selezione partita');
        
        // Crea e mostra l'UI per la selezione partita
        this.createMatchSelectionUI();
    }

    /**
     * Mostra la configurazione del set
     */
    showSetConfiguration() {
        console.log('Mostra configurazione set');
        
        // Crea e mostra l'UI per la configurazione set
        this.createSetConfigurationUI();
    }

    /**
     * Avvia il sistema di scouting
     */
    startScouting(setData, match) {
        console.log('Avvio scouting per set', setData.setNumber);
        
        // Integra con il sistema di scouting esistente
        // TODO: Implementare integrazione con scouting esistente
        
        // Per ora, mostra un messaggio
        this.showNotification(`Scouting avviato per il Set ${setData.setNumber}`, 'success');
    }

    /**
     * Crea l'UI per la selezione squadre
     */
    createTeamSelectionUI() {
        window.location.href = '/my-teams.html';
    }

    /**
     * Crea l'UI per il form di creazione squadra
     */
    createTeamFormUI() {
        // Implementazione semplificata - in futuro sarà più completa
        const html = `
            <div class="screen" id="create-team-screen">
                <div class="container">
                    <header class="screen-header">
                        <button class="btn btn-outline" onclick="app.showWelcomeScreen()">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M19 12H5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M12 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            Indietro
                        </button>
                        <h1>Crea Nuova Squadra</h1>
                        <div></div>
                    </header>
                    
                    <main class="screen-content">
                        <div class="form-container">
                            <form id="createTeamForm">
                                <div class="form-group">
                                    <label for="teamName">Nome Squadra</label>
                                    <input type="text" id="teamName" required placeholder="Inserisci il nome della squadra">
                                </div>
                                
                                <div class="form-actions">
                                    <button type="button" class="btn btn-secondary" onclick="app.showWelcomeScreen()">Annulla</button>
                                    <button type="submit" class="btn btn-primary">Crea Squadra</button>
                                </div>
                            </form>
                        </div>
                        
                        <div class="info-box">
                            <h3>Informazioni</h3>
                            <p>Dopo aver creato la squadra, potrai aggiungere i giocatori e configurare il roster completo.</p>
                        </div>
                    </main>
                </div>
            </div>
        `;
        
        this.showDynamicScreen(html);
        
        // Aggiungi event listener per il form
        const form = document.getElementById('createTeamForm');
        if (form) {
            form.addEventListener('submit', (e) => this.handleCreateTeam(e));
        }
    }

    /**
     * Crea l'UI per la gestione squadre
     */
    createTeamManagementUI() {
        // Implementazione futura
        this.showNotification('Gestione squadre in fase di implementazione', 'info');
    }

    /**
     * Crea l'UI per la selezione partita
     */
    createMatchSelectionUI() {
        const html = `
            <div class="screen" id="match-selection-screen">
                <div class="container">
                    <header class="screen-header">
                        <button class="btn btn-outline" onclick="app.showTeamSelection()">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M19 12H5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M12 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            Indietro
                        </button>
                        <h1>Seleziona Partita</h1>
                        <div></div>
                    </header>
                    
                    <main class="screen-content">
                        <div class="match-options">
                            <div class="option-card" onclick="app.showNewMatchForm()">
                                <div class="option-icon">
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                                        <line x1="12" y1="8" x2="12" y2="16" stroke="currentColor" stroke-width="2"/>
                                        <line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" stroke-width="2"/>
                                    </svg>
                                </div>
                                <h3>Nuova Partita</h3>
                                <p>Crea una nuova partita e inizia lo scouting</p>
                            </div>
                            
                            <div class="option-card" onclick="app.showMatchArchive()">
                                <div class="option-icon">
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="2"/>
                                        <polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="2"/>
                                        <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" stroke-width="2"/>
                                        <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" stroke-width="2"/>
                                        <polyline points="10,9 9,9 8,9" stroke="currentColor" stroke-width="2"/>
                                    </svg>
                                </div>
                                <h3>Archivio Partite</h3>
                                <p>Carica una partita precedente (funzione futura)</p>
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        `;
        
        this.showDynamicScreen(html);
    }

    /**
     * Crea l'UI per la configurazione del set
     */
    createSetConfigurationUI() {
        const currentMatch = this.state.modules.matches.getCurrentMatch();
        if (!currentMatch) return;
        
        const html = `
            <div class="screen" id="set-configuration-screen">
                <div class="container">
                    <header class="screen-header">
                        <button class="btn btn-outline" onclick="app.showMatchSelection()">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M19 12H5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M12 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            Indietro
                        </button>
                        <h1>Configurazione Set</h1>
                        <div></div>
                    </header>
                    
                    <main class="screen-content">
                        <div class="match-info">
                            <h2>${currentMatch.homeTeam} vs ${currentMatch.awayTeam}</h2>
                            <p>${currentMatch.matchType} - ${currentMatch.date}</p>
                        </div>
                        
                        <form id="setConfigForm" class="set-config-form">
                            <div class="form-row">
                                <div class="form-group">
                                    <label for="setNumber">Set Corrente</label>
                                    <select id="setNumber" required>
                                        <option value="1">Set 1</option>
                                        <option value="2">Set 2</option>
                                        <option value="3">Set 3</option>
                                        <option value="4">Set 4</option>
                                        <option value="5">Set 5</option>
                                        <option value="6">Set 6</option>
                                    </select>
                                </div>
                                
                                <div class="form-group">
                                    <label for="gamePhase">Fase di Gioco</label>
                                    <select id="gamePhase" required>
                                        <option value="servizio">Servizio</option>
                                        <option value="ricezione">Ricezione</option>
                                    </select>
                                </div>
                                
                                <div class="form-group">
                                    <label for="rotation">Rotazione Iniziale</label>
                                    <select id="rotation" required>
                                        <option value="P1">P1</option>
                                        <option value="P2">P2</option>
                                        <option value="P3">P3</option>
                                        <option value="P4">P4</option>
                                        <option value="P5">P5</option>
                                        <option value="P6">P6</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div class="form-actions">
                                <button type="submit" class="btn btn-primary btn-large">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <polygon points="5,3 19,12 5,21 5,3" stroke="currentColor" stroke-width="2" fill="currentColor"/>
                                    </svg>
                                    SCOUT!
                                </button>
                            </div>
                        </form>
                    </main>
                </div>
            </div>
        `;
        
        this.showDynamicScreen(html);
        
        // Aggiungi event listener per il form
        const form = document.getElementById('setConfigForm');
        if (form) {
            form.addEventListener('submit', (e) => this.handleSetConfiguration(e));
        }
    }

    /**
     * Mostra una schermata dinamica
     */
    showDynamicScreen(html) {
        this.hideAllScreens();
        
        // Rimuovi schermate dinamiche esistenti
        const existingDynamic = document.querySelectorAll('.screen:not(#loading-screen):not(#auth-screen):not(#welcome-screen):not(#main-screen)');
        existingDynamic.forEach(screen => screen.remove());
        
        // Aggiungi la nuova schermata
        const app = document.getElementById('app');
        app.insertAdjacentHTML('beforeend', html);
    }

    /**
     * Nasconde tutte le schermate
     */
    hideAllScreens() {
        const screens = document.querySelectorAll('.screen');
        screens.forEach(screen => {
            screen.classList.add('hidden');
            screen.style.display = 'none';
        });
    }

    /**
     * Mostra la schermata di benvenuto
     */
    showWelcomeScreen() {
        this.hideAllScreens();
        const welcomeScreen = document.getElementById('welcome-screen');
        if (welcomeScreen) {
            welcomeScreen.classList.remove('hidden');
            welcomeScreen.style.display = 'flex';
        }
        this.state.currentScreen = 'welcome';
    }

    /**
     * Gestisce la creazione di una nuova squadra
     */
    async handleCreateTeam(event) {
        event.preventDefault();
        
        const teamName = document.getElementById('teamName')?.value?.trim();
        if (!teamName) {
            this.showNotification('Inserisci il nome della squadra', 'error');
            return;
        }
        
        const result = await this.state.modules.teams.saveTeam({
            name: teamName,
            players: []
        });
        
        if (result.success) {
            this.showNotification(`Squadra "${teamName}" creata con successo!`, 'success');
            this.showWelcomeScreen();
        } else {
            this.showNotification(result.error, 'error');
        }
    }

    /**
     * Seleziona una squadra
     */
    selectTeam(teamId) {
        const result = this.state.modules.teams.selectTeam(teamId);
        if (result.success) {
            this.showNotification(`Squadra "${result.team.name}" selezionata`, 'success');
            // Il callback handleTeamChange gestirà la navigazione
        } else {
            this.showNotification(result.error, 'error');
        }
    }

    /**
     * Mostra il form per nuova partita
     */
    showNewMatchForm() {
        const currentTeam = this.state.modules.teams.getCurrentTeam();
        if (!currentTeam) {
            this.showNotification('Errore: nessuna squadra selezionata', 'error');
            return;
        }
        
        const html = `
            <div class="screen" id="new-match-screen">
                <div class="container">
                    <header class="screen-header">
                        <button class="btn btn-outline" onclick="app.showMatchSelection()">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M19 12H5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M12 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            Indietro
                        </button>
                        <h1>Nuova Partita</h1>
                        <div></div>
                    </header>
                    
                    <main class="screen-content">
                        <form id="newMatchForm" class="match-form">
                            <div class="form-group">
                                <label for="myTeam">La Mia Squadra</label>
                                <input type="text" id="myTeam" value="${currentTeam.name}" readonly>
                            </div>
                            
                            <div class="form-group">
                                <label for="opponentTeam">Squadra Avversaria</label>
                                <input type="text" id="opponentTeam" required placeholder="Nome squadra avversaria">
                            </div>
                            
                            <div class="form-group">
                                <label for="homeAway">La mia squadra gioca</label>
                                <select id="homeAway" required>
                                    <option value="">Seleziona...</option>
                                    <option value="home">In Casa</option>
                                    <option value="away">In Trasferta</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="matchType">Tipo Partita</label>
                                <select id="matchType" required>
                                    <option value="">Seleziona...</option>
                                    <option value="campionato">Campionato</option>
                                    <option value="coppa">Coppa</option>
                                    <option value="pgs">PGS</option>
                                    <option value="csi">CSI</option>
                                    <option value="amichevole">Amichevole</option>
                                    <option value="playoff">Playoff</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="matchDate">Data</label>
                                <input type="date" id="matchDate" value="${new Date().toISOString().split('T')[0]}">
                            </div>
                            
                            <div class="form-group">
                                <label for="description">Descrizione (opzionale)</label>
                                <textarea id="description" placeholder="Note aggiuntive sulla partita"></textarea>
                            </div>
                            
                            <div class="form-actions">
                                <button type="button" class="btn btn-secondary" onclick="app.showMatchSelection()">Annulla</button>
                                <button type="submit" class="btn btn-primary">Crea Partita</button>
                            </div>
                        </form>
                    </main>
                </div>
            </div>
        `;
        
        this.showDynamicScreen(html);
        
        // Aggiungi event listener per il form
        const form = document.getElementById('newMatchForm');
        if (form) {
            form.addEventListener('submit', (e) => this.handleCreateMatch(e));
        }
    }

    /**
     * Gestisce la creazione di una nuova partita
     */
    async handleCreateMatch(event) {
        event.preventDefault();
        
        const formData = new FormData(event.target);
        const currentTeam = this.state.modules.teams.getCurrentTeam();
        
        const matchData = {
            myTeam: currentTeam.name,
            opponentTeam: document.getElementById('opponentTeam').value.trim(),
            homeAway: document.getElementById('homeAway').value,
            matchType: document.getElementById('matchType').value,
            date: document.getElementById('matchDate').value,
            description: document.getElementById('description').value.trim()
        };
        try {
            const selId = localStorage.getItem('selectedMatchId');
            if (!selId) {
                this.showNotification('ID partita mancante. Usa il pulsante "+" in Elenco Partite.', 'error');
                return;
            }
            matchData.id = String(selId);
        } catch(_){
            this.showNotification('Errore lettura ID partita', 'error');
            return;
        }
        
        // Determina squadra casa e trasferta
        matchData.homeTeam = matchData.homeAway === 'home' ? matchData.myTeam : matchData.opponentTeam;
        matchData.awayTeam = matchData.homeAway === 'home' ? matchData.opponentTeam : matchData.myTeam;
        
        const result = await this.state.modules.matches.createMatch(matchData);
        
        if (result.success) {
            this.showNotification('Partita creata con successo!', 'success');
            // Il callback handleMatchChange gestirà la navigazione
        } else {
            this.showNotification(result.error, 'error');
        }
    }

    /**
     * Gestisce la configurazione del set
     */
    async handleSetConfiguration(event) {
        event.preventDefault();
        
        const setNumber = parseInt(document.getElementById('setNumber').value);
        const phase = document.getElementById('gamePhase').value;
        const rotation = document.getElementById('rotation').value;
        
        const configResult = await this.state.modules.matches.configureSet(setNumber, {
            phase,
            rotation
        });
        
        if (configResult.success) {
            const startResult = await this.state.modules.matches.startSet();
            
            if (startResult.success) {
                this.showNotification(`Set ${setNumber} avviato!`, 'success');
                // Il callback handleSetStart gestirà la navigazione al scouting
            } else {
                this.showNotification(startResult.error, 'error');
            }
        } else {
            this.showNotification(configResult.error, 'error');
        }
    }

    /**
     * Mostra l'archivio partite
     */
    showMatchArchive() {
        this.showNotification('Archivio partite in fase di implementazione', 'info');
    }

    /**
     * Mostra una notifica
     */
    showNotification(message, type = 'info') {
        // Implementazione semplice - in futuro sarà più sofisticata
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // Per ora usa alert, in futuro sarà un toast
        if (type === 'error') {
            alert(`Errore: ${message}`);
        } else if (type === 'success') {
            alert(`Successo: ${message}`);
        } else if (type === 'warning') {
            alert(`Attenzione: ${message}`);
        } else {
            alert(`Info: ${message}`);
        }
    }

    /**
     * Mostra un errore
     */
    showError(message) {
        console.error('App Error:', message);
        this.showNotification(message, 'error');
    }

    /**
     * Gestori di errore per i moduli
     */
    handleAuthError(error) {
        console.error('Auth Error:', error);
    }

    handleTeamsError(error) {
        console.error('Teams Error:', error);
        this.showNotification('Errore nella gestione squadre', 'error');
    }

    handleMatchesError(error) {
        console.error('Matches Error:', error);
        this.showNotification('Errore nella gestione partite', 'error');
    }

    /**
     * API pubblica
     */
    getCurrentScreen() {
        return this.state.currentScreen;
    }

    isInitialized() {
        return this.state.isInitialized;
    }

    getModules() {
        return { ...this.state.modules };
    }
}

// Inizializza l'applicazione
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.app = new VolleyScoutApp();
    });
} else {
    window.app = new VolleyScoutApp();
}

// Esporta per compatibilità
window.VolleyScoutApp = VolleyScoutApp;

console.log('[App] main.js file loaded');
window.addEventListener('error', (e) => {
  console.error('[GlobalError]', e.message || e.type, e.error || e);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[UnhandledRejection]', e.reason);
});
