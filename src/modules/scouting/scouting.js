/**
 * Scouting Module
 * Integra il sistema di scouting esistente nella nuova architettura
 */

class ScoutingModule {
    constructor() {
        this.state = {
            isActive: false,
            currentMatch: null,
            currentSet: null,
            actions: [],
            score: { home: 0, away: 0 },
            rotation: 'P1',
            phase: 'servizio'
        };
        
        this.callbacks = {
            onActionAdd: [],
            onScoreChange: [],
            onError: []
        };
        
        console.log('ScoutingModule inizializzato');
    }

    /**
     * Avvia il scouting per una partita e set specifici
     */
    start(match, setData) {
        try {
            this.state.isActive = true;
            this.state.currentMatch = match;
            this.state.currentSet = setData;
            this.state.rotation = setData.rotation;
            this.state.phase = setData.phase;
            this.state.actions = [];
            
            console.log('Scouting avviato per:', match.homeTeam, 'vs', match.awayTeam, '- Set', setData.setNumber);
            
            return { success: true };
            
        } catch (error) {
            console.error('Errore nell\'avvio scouting:', error);
            this.handleError(error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Ferma il scouting
     */
    stop() {
        this.state.isActive = false;
        this.state.currentMatch = null;
        this.state.currentSet = null;
        
        console.log('Scouting fermato');
        
        return { success: true };
    }

    /**
     * Aggiunge un'azione di scouting
     */
    addAction(action) {
        try {
            if (!this.state.isActive) {
                throw new Error('Scouting non attivo');
            }
            
            const actionData = {
                id: Date.now(),
                timestamp: new Date().toISOString(),
                matchId: this.state.currentMatch.id,
                setNumber: this.state.currentSet.setNumber,
                ...action
            };
            
            this.state.actions.push(actionData);
            
            // Notifica i callback
            this.notifyActionAdd(actionData);
            
            return { success: true, action: actionData };
            
        } catch (error) {
            console.error('Errore nell\'aggiunta azione:', error);
            this.handleError(error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Gestione errori
     */
    handleError(error) {
        console.error('ScoutingModule Error:', error);
        this.notifyError(error);
    }

    /**
     * Sistema di callback
     */
    onActionAdd(callback) {
        this.callbacks.onActionAdd.push(callback);
    }

    onScoreChange(callback) {
        this.callbacks.onScoreChange.push(callback);
    }

    onError(callback) {
        this.callbacks.onError.push(callback);
    }

    notifyActionAdd(action) {
        this.callbacks.onActionAdd.forEach(callback => {
            try {
                callback(action);
            } catch (error) {
                console.error('Errore nel callback onActionAdd:', error);
            }
        });
    }

    notifyScoreChange(score) {
        this.callbacks.onScoreChange.forEach(callback => {
            try {
                callback(score);
            } catch (error) {
                console.error('Errore nel callback onScoreChange:', error);
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
    isActive() {
        return this.state.isActive;
    }

    getCurrentMatch() {
        return this.state.currentMatch;
    }

    getCurrentSet() {
        return this.state.currentSet;
    }

    getActions() {
        return [...this.state.actions];
    }

    getScore() {
        return { ...this.state.score };
    }
}

// Inizializza il modulo
let scoutingModule;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        scoutingModule = new ScoutingModule();
        window.scoutingModule = scoutingModule;
    });
} else {
    scoutingModule = new ScoutingModule();
    window.scoutingModule = scoutingModule;
}

// Esporta per compatibilità
window.ScoutingModule = ScoutingModule;