/**
 * Teams Module
 * Gestisce le squadre e i roster con funzionalità CRUD e import/export CSV
 */

class TeamsModule {
    constructor() {
        this.state = {
            teams: [],
            currentTeam: null,
            isLoading: false,
            error: null
        };
        this._retryTeamsFetch = 0;
        
        this.callbacks = {
            onTeamChange: [],
            onTeamsUpdate: [],
            onError: []
        };
        
        this.init();
    }

    /**
     * Inizializza il modulo squadre
     */
    async init() {
        try {
            await this.loadTeams();
            try {
                const storedId = localStorage.getItem('selectedTeamId');
                if (storedId) {
                    const res = this.selectTeam(storedId);
                    if (!res?.success) {
                        const byId = this.getTeamById(storedId);
                        if (byId) this.selectTeam(byId.id);
                    }
                } else if (this.state.teams.length === 1) {
                    this.selectTeam(this.state.teams[0].id);
                }
            } catch(_) {}
            this.setupEventListeners();
            console.log('TeamsModule inizializzato correttamente');
        } catch (error) {
            console.error('Errore nell\'inizializzazione TeamsModule:', error);
            this.handleError(error);
        }
    }

    /**
     * Configura gli event listeners
     */
    setupEventListeners() {
        // Event listeners per la schermata di benvenuto
        const selectTeamCard = document.getElementById('selectTeamCard');
        const createTeamCard = document.getElementById('createTeamCard');
        const manageTeamsCard = document.getElementById('manageTeamsCard');
        
        if (selectTeamCard) {
            selectTeamCard.addEventListener('click', () => this.showTeamSelection());
        }
        
        if (createTeamCard) {
            createTeamCard.addEventListener('click', () => this.showCreateTeamForm());
        }
        
        if (manageTeamsCard) {
            manageTeamsCard.addEventListener('click', () => this.showTeamManagement());
        }
    }

    /**
     * Carica le squadre dal storage
     */
    async loadTeams() {
        try {
            this.state.isLoading = true;
            
            // Carica da localStorage
            const localTeams = this.getLocalTeams();
            
            // Carica da Firestore se disponibile
            let firestoreTeams = [];
            const isAuthed = (window.authModule?.isAuthenticated?.() === true) || (!!(window.authFunctions?.getCurrentUser?.()));
            if (isAuthed && window.firestoreService?.loadUserTeams) {
                const result = await window.firestoreService.loadUserTeams();
                if (result.success) {
                    firestoreTeams = result.documents.map(doc => {
                        const idStr = String(doc.id || '');
                        const hasDash = idStr.includes(' - ');
                        const parts = hasDash ? idStr.split(' - ') : [];
                        const clubFromId = hasDash ? parts[0] : '';
                        const teamFromId = hasDash ? parts.slice(1).join(' - ') : '';
                        const canonicalName = ((doc.teamName || teamFromId || '').trim()) + (((doc.clubName || clubFromId || '').trim()) ? ` - ${(doc.clubName || clubFromId || '').trim()}` : '');
                        return {
                            id: idStr,
                            name: canonicalName,
                            teamName: (doc.teamName || teamFromId || '').trim(),
                            clubName: (doc.clubName || clubFromId || '').trim(),
                            players: Array.isArray(doc.players) ? doc.players : [],
                            createdAt: doc.createdAt,
                            updatedAt: doc.updatedAt,
                            source: 'firestore'
                        };
                    });
                } else {
                    this.state.error = result.error || 'Errore fetch teams';
                }
            }
            
            // Combina e deduplica
            const allTeams = [...localTeams, ...firestoreTeams];
            this.state.teams = this.deduplicateTeams(allTeams);

            try {
                const firestoreIds = new Set(firestoreTeams.map(t => String(t.id)));
                const toStore = this.state.teams.map(t => ({
                    id: t.id,
                    name: t.name,
                    teamName: t.teamName,
                    clubName: t.clubName,
                    players: Array.isArray(t.players) ? t.players : []
                }));
                localStorage.setItem('volleyTeams', JSON.stringify(toStore));
                if (isAuthed && window.firestoreService?.saveTeam) {
                    for (const t of this.state.teams) {
                        const isFs = String(t.source||'').toLowerCase()==='firestore';
                        if (!firestoreIds.has(String(t.id)) && !isFs) {
                            try { await window.firestoreService.saveTeam(t); } catch(_) {}
                        }
                    }
                }
            } catch(_) {}
            
            this.notifyTeamsUpdate();

        } catch (error) {
            console.error('Errore nel caricamento squadre:', error);
            this.handleError(error);
            if (this._retryTeamsFetch < 5) {
                this._retryTeamsFetch++;
                setTimeout(() => { try { this.loadTeams(); } catch(_){} }, Math.min(1000 * this._retryTeamsFetch, 5000));
            }
        } finally {
            this.state.isLoading = false;
            if (this.state.teams && this.state.teams.length) this._retryTeamsFetch = 0;
        }
    }

    /**
     * Ottiene le squadre dal localStorage
     */
    getLocalTeams() {
        try {
            const raw = localStorage.getItem('volleyTeams');
            const arr = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(arr)) return [];
            return arr.map(t => {
                const id = t.id != null ? t.id : Date.now();
                const nameStr = String(t.name || '').trim();
                const teamName = String(t.teamName || (nameStr ? nameStr.split(' - ')[0] : '')).trim();
                const clubName = String(t.clubName || (() => {
                    const parts = nameStr.split(' - ');
                    return parts.length >= 2 ? parts.slice(1).join(' - ') : '';
                })()).trim();
                const combinedName = teamName + (clubName ? ` - ${clubName}` : '');
                return {
                    id,
                    name: combinedName,
                    teamName,
                    clubName,
                    players: Array.isArray(t.players) ? t.players : []
                };
            });
        } catch (_) {
            return [];
        }
    }

    /**
     * Deduplica le squadre basandosi sul nome
     */
    deduplicateTeams(teams) {
        const seen = new Map();
        
        teams.forEach(team => {
            const key = team.name.toLowerCase().trim();
            if (!seen.has(key) || team.source === 'firestore') {
                seen.set(key, team);
            }
        });
        
        return Array.from(seen.values());
    }

    /**
     * Salva una squadra
     */
    async saveTeam(teamData) {
        try {
            // Normalizza input: supporta {name} legacy o {teamName, clubName}
            const inputName = (teamData.name || '').trim();
            const inputTeamName = (teamData.teamName || '').trim();
            const inputClubName = (teamData.clubName || '').trim();
            // Costruisci il nome combinato per compatibilità: "Squadra - Società"
            const combinedName = (inputTeamName || inputName || '').trim() + (inputClubName ? ` - ${inputClubName}` : '');

            const team = {
                id: teamData.id || Date.now(),
                name: combinedName.trim(),
                teamName: inputTeamName || (inputName || '').trim(),
                clubName: inputClubName || '',
                players: teamData.players || [],
                createdAt: teamData.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            // Validazione
            if (!team.teamName) {
                throw new Error('Il Nome Squadra è obbligatorio');
            }
            
            if (this.teamExists(team.name, team.id)) {
                throw new Error('Esiste già una squadra con questo nome');
            }
            
            // Salva localmente
            await this.saveTeamLocally(team);
            
            // Salva su Firestore se disponibile
            if (window.authModule?.isAuthenticated() && window.firestoreService?.saveTeam) {
                try {
                    await window.firestoreService.saveTeam(team);
                } catch (firestoreError) {
                    console.warn('Errore nel salvataggio su Firestore:', firestoreError);
                }
            }
            
            // Aggiorna lo stato
            const existingIndex = this.state.teams.findIndex(t => t.id === team.id);
            if (existingIndex >= 0) {
                this.state.teams[existingIndex] = team;
            } else {
                this.state.teams.push(team);
            }
            
            this.notifyTeamsUpdate();
            
            return { success: true, team };
            
        } catch (error) {
            console.error('Errore nel salvataggio squadra:', error);
            this.handleError(error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Salva la squadra nel localStorage
     */
    async saveTeamLocally(team) {
        const teams = this.getLocalTeams();
        const existingIndex = teams.findIndex(t => t.id === team.id);
        
        if (existingIndex >= 0) {
            teams[existingIndex] = team;
        } else {
            teams.push(team);
        }
        
        localStorage.setItem('volleyTeams', JSON.stringify(teams));
    }

    /**
     * Verifica se esiste già una squadra con lo stesso nome
     */
    teamExists(name, excludeId = null) {
        return this.state.teams.some(team => 
            team.name.toLowerCase().trim() === name.toLowerCase().trim() && 
            team.id !== excludeId
        );
    }

    /**
     * Elimina una squadra
     */
    async deleteTeam(teamId) {
        try {
            const idStr = String(teamId);
            // Recupera il team per nome (serve per eliminazione su Firestore/roster locali)
            const teamToDelete = this.state.teams.find(t => String(t.id) === idStr);
            const teamName = teamToDelete?.name || null;

            // Esito cancellazione cloud
            let cloudAttempted = false;
            let cloudSuccess = false;
            let cloudDeleted = 0;

            // Rimuovi dal localStorage (lista squadre)
            const localTeams = this.getLocalTeams();
            const filteredTeams = localTeams.filter(t => String(t.id) !== idStr);
            localStorage.setItem('volleyTeams', JSON.stringify(filteredTeams));

            // Elimina eventuali roster associati nel vecchio storage locale
            try {
                if (teamName && window.firestoreService?.deleteLocalRostersByName) {
                    window.firestoreService.deleteLocalRostersByName(teamName);
                } else if (teamName) {
                    // Fallback manuale se il servizio non è disponibile
                    const storedRosters = JSON.parse(localStorage.getItem('volleyRosters') || '[]');
                    const filteredRosters = storedRosters.filter((r) => (r?.name || '').toLowerCase() !== teamName.toLowerCase());
                    localStorage.setItem('volleyRosters', JSON.stringify(filteredRosters));
                }
            } catch (e) {
                console.warn('Errore nella rimozione roster locali per squadra:', e);
            }

            // Rimuovi dallo stato
            this.state.teams = this.state.teams.filter(t => String(t.id) !== idStr);

            // Se era la squadra corrente, resettala
            if (this.state.currentTeam && String(this.state.currentTeam.id) === idStr) {
                this.state.currentTeam = null;
                this.notifyTeamChange(null);
            }

            // Eliminazione su Firestore del documento squadra e partite collegate
            if (window.authModule?.isAuthenticated() && window.firestoreService?.deleteTeamByIdOrName) {
                cloudAttempted = true;
                try {
                    const res = await window.firestoreService.deleteTeamByIdOrName(idStr, teamName);
                    cloudSuccess = !!res?.success;
                    cloudDeleted = res?.deleted || 0;
                } catch (firestoreError) {
                    cloudSuccess = false;
                }
            }

            this.notifyTeamsUpdate();
            return { success: true, cloud: { attempted: cloudAttempted, success: cloudSuccess, deleted: cloudDeleted } };
        } catch (error) {
            console.error('Errore nell\'eliminazione squadra:', error);
            this.handleError(error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Seleziona una squadra come corrente
     */
    selectTeam(teamId) {
        const idStr = String(teamId);
        const team = this.state.teams.find(t => String(t.id) === idStr);
        if (team) {
            this.state.currentTeam = team;
            // Sincronizza anche il localStorage per compatibilità tra pagine
            try { localStorage.setItem('selectedTeamId', String(team.id)); } catch(_) {}
            // Espone subito su window per script esterni
            try { window.teamsModule = this; } catch(_) {}
            this.notifyTeamChange(team);
            return { success: true, team };
        }
        return { success: false, error: 'Squadra non trovata' };
    }

    /**
     * Importa squadre da file CSV
     */
    async importFromCSV(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                try {
                    const csv = e.target.result;
                    const teams = this.parseCSV(csv);
                    
                    let imported = 0;
                    let errors = [];
                    
                    for (const teamData of teams) {
                        const result = await this.saveTeam(teamData);
                        if (result.success) {
                            imported++;
                        } else {
                            errors.push(`${teamData.name}: ${result.error}`);
                        }
                    }
                    
                    resolve({
                        success: true,
                        imported,
                        errors,
                        total: teams.length
                    });
                    
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => reject(new Error('Errore nella lettura del file'));
            reader.readAsText(file);
        });
    }

    /**
     * Parsing del CSV
     */
    parseCSV(csv) {
        const lines = csv.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
            throw new Error('File CSV non valido: deve contenere almeno un header e una riga di dati');
        }
        
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const teams = new Map();
        
        // Verifica headers richiesti
        const requiredHeaders = ['squadra', 'numero', 'nome', 'cognome', 'ruolo'];
        const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
        if (missingHeaders.length > 0) {
            throw new Error(`Headers mancanti nel CSV: ${missingHeaders.join(', ')}`);
        }
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            if (values.length !== headers.length) continue;
            
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index];
            });
            
            const fullName = row.squadra;
            if (!fullName) continue;

            // Prova a dividere "Squadra - Società" se presente
            let parsedTeamName = '';
            let parsedClubName = '';
            const parts = fullName.split(' - ');
            if (parts.length >= 2) {
                parsedTeamName = parts[0];
                parsedClubName = parts.slice(1).join(' - ');
            } else {
                parsedTeamName = fullName;
            }

            if (!teams.has(fullName)) {
                teams.set(fullName, {
                    name: fullName,
                    teamName: parsedTeamName,
                    clubName: parsedClubName,
                    players: []
                });
            }
            
            const player = {
                number: row.numero || '',
                name: row.nome || '',
                surname: row.cognome || '',
                role: row.ruolo || '',
                nickname: (row.soprannome || '').toString().slice(0,6)
            };
            
            // Aggiungi solo se ha almeno un campo compilato
            if (player.number || player.name || player.surname) {
                teams.get(fullName).players.push(player);
            }
        }
        
        return Array.from(teams.values());
    }

    /**
     * Esporta squadre in formato CSV
     */
    exportToCSV(teamIds = null) {
        const teamsToExport = teamIds ? 
            this.state.teams.filter(t => teamIds.includes(t.id)) : 
            this.state.teams;
        
        if (teamsToExport.length === 0) {
            throw new Error('Nessuna squadra da esportare');
        }
        
        const headers = ['Squadra', 'Numero', 'Nome', 'Cognome', 'Ruolo', 'Soprannome'];
        let csv = headers.join(',') + '\n';
        
        teamsToExport.forEach(team => {
            if (team.players && team.players.length > 0) {
                team.players.forEach(player => {
                    const row = [
                        team.name,
                        player.number || '',
                        player.name || '',
                        player.surname || '',
                        player.role || '',
                        player.nickname || ''
                    ];
                    csv += row.map(field => `"${field}"`).join(',') + '\n';
                });
            } else {
                // Squadra senza giocatori
                csv += `"${team.name}","","","","",""\n`;
            }
        });
        
        return csv;
    }

    /**
     * Download del file CSV
     */
    downloadCSV(teamIds = null, filename = null) {
        try {
            const csv = this.exportToCSV(teamIds);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename || `squadre_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            return { success: true };
            
        } catch (error) {
            console.error('Errore nell\'esportazione CSV:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Mostra la selezione squadre
     */
    showTeamSelection() {
        this.hideAllScreens();
        this.showScreen('team-selection-screen');
        this.updateTeamSelectionUI();
    }

    /**
     * Mostra il form di creazione squadra
     */
    showCreateTeamForm() {
        // TODO: Implementare modal o schermata per creazione squadra
        console.log('Mostra form creazione squadra');
        this.showCreateTeamModal();
    }

    /**
     * Mostra la gestione squadre
     */
    showTeamManagement() {
        // TODO: Implementare schermata di gestione squadre
        console.log('Mostra gestione squadre');
        this.showTeamManagementModal();
    }

    /**
     * Gestione errori
     */
    handleError(error) {
        console.error('TeamsModule Error:', error);
        this.state.error = error;
        this.notifyError(error);
    }

    /**
     * Sistema di callback
     */
    onTeamChange(callback) {
        this.callbacks.onTeamChange.push(callback);
    }

    onTeamsUpdate(callback) {
        this.callbacks.onTeamsUpdate.push(callback);
    }

    onError(callback) {
        this.callbacks.onError.push(callback);
    }

    notifyTeamChange(team) {
        this.callbacks.onTeamChange.forEach(callback => {
            try {
                callback(team);
            } catch (error) {
                console.error('Errore nel callback onTeamChange:', error);
            }
        });
    }

    notifyTeamsUpdate() {
        this.callbacks.onTeamsUpdate.forEach(callback => {
            try {
                callback(this.state.teams);
            } catch (error) {
                console.error('Errore nel callback onTeamsUpdate:', error);
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
     * Aggiorna l'UI della selezione squadre
     */
    updateTeamSelectionUI() {
        const teamsGrid = document.getElementById('teams-grid');
        const noTeamsMessage = document.getElementById('no-teams-message');
        
        if (!teamsGrid) return;
        
        if (this.state.teams.length === 0) {
            teamsGrid.innerHTML = '';
            if (noTeamsMessage) {
                noTeamsMessage.classList.remove('hidden');
            }
        } else {
            if (noTeamsMessage) {
                noTeamsMessage.classList.add('hidden');
            }
            
            teamsGrid.innerHTML = this.state.teams.map(team => `
                <div class="team-card" data-team-id="${team.id}">
                    <div class="team-card-header">
                        <h3 class="team-name">${team.name}</h3>
                        <span class="team-players-count">${team.players?.length || 0} giocatori</span>
                    </div>
                    <div class="team-card-actions">
                        <button class="btn btn-primary btn-sm" onclick="teamsModule.selectAndProceed('${team.id}')">
                            Seleziona
                        </button>
                        <button class="btn btn-ghost btn-sm" onclick="teamsModule.editTeam('${team.id}')">
                            Modifica
                        </button>
                    </div>
                </div>
            `).join('');
        }
    }

    /**
     * Seleziona squadra e procede al match management
     */
    selectAndProceed(teamId) {
        const result = this.selectTeam(teamId);
        if (result.success && window.matchesModule) {
            window.matchesModule.showMatchManagement();
        }
    }

    /**
     * Modifica squadra
     */
    editTeam(teamId) {
        const team = this.getTeamById(teamId);
        if (team) {
            // TODO: Implementare modal di modifica
            console.log('Modifica squadra:', team);
        }
    }

    /**
     * Mostra modal creazione squadra
     */
    showCreateTeamModal() {
        // TODO: Implementare modal
        console.log('Modal creazione squadra');
    }

    /**
     * Mostra modal gestione squadre
     */
    showTeamManagementModal() {
        // TODO: Implementare modal
        console.log('Modal gestione squadre');
    }

    /**
     * API pubblica
     */
    getTeams() {
        return [...this.state.teams];
    }

    getCurrentTeam() {
        return this.state.currentTeam;
    }

    getTeamById(id) {
        const idStr = String(id);
        return this.state.teams.find(t => String(t.id) === idStr) || null;
    }

    isLoading() {
        return this.state.isLoading;
    }

    getError() {
        return this.state.error;
    }
}

// Inizializza il modulo
let teamsModule;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        teamsModule = new TeamsModule();
        window.teamsModule = teamsModule;
    });
} else {
    teamsModule = new TeamsModule();
    window.teamsModule = teamsModule;
}

// Esporta per compatibilità
window.TeamsModule = TeamsModule;
