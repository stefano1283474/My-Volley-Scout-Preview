// Gestore delle connessioni Firebase per ridurre errori
class FirebaseConnectionManager {
    constructor() {
        this.isOnline = navigator.onLine;
        this.retryAttempts = 0;
        this.maxRetries = 3;
        this.retryDelay = 1000;
        this.connectionErrors = new Set();
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Monitora lo stato della connessione
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.retryAttempts = 0;
            console.log('Connessione ripristinata');
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            console.log('Connessione persa');
        });
    }
    
    // Verifica se possiamo tentare operazioni Firestore
    canAttemptFirestoreOperation() {
        if (!this.isOnline) {
            console.warn('Operazione Firestore saltata: offline');
            return false;
        }
        
        if (!window.authFunctions || typeof window.authFunctions.getCurrentUser !== 'function' || !window.authFunctions.getCurrentUser()) {
            console.warn('Operazione Firestore saltata: utente non autenticato');
            return false;
        }
        
        if (this.retryAttempts >= this.maxRetries) {
            console.warn('Operazione Firestore saltata: troppi tentativi falliti');
            return false;
        }
        
        return true;
    }
    
    // Wrapper per operazioni Firestore con gestione errori
    async executeFirestoreOperation(operation, operationName = 'Operazione Firestore') {
        if (!this.canAttemptFirestoreOperation()) {
            return { success: false, error: 'Operazione non consentita' };
        }
        
        try {
            const result = await operation();
            this.retryAttempts = 0; // Reset su successo
            this.connectionErrors.delete(operationName);
            return result;
        } catch (error) {
            this.retryAttempts++;
            this.connectionErrors.add(operationName);
            
            console.error(`Errore in ${operationName}:`, error);
            
            // Se è un errore di rete, non ritentare immediatamente
            if (error.code === 'unavailable' || error.message.includes('net::ERR_ABORTED')) {
                console.warn(`Errore di rete in ${operationName}, operazione saltata`);
                return { success: false, error: 'Errore di rete' };
            }
            
            // Ritenta dopo un delay se non abbiamo superato il limite
            if (this.retryAttempts < this.maxRetries) {
                console.log(`Ritento ${operationName} tra ${this.retryDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                return this.executeFirestoreOperation(operation, operationName);
            }
            
            return { success: false, error: error.message };
        }
    }
    
    // Ottieni statistiche degli errori
    getErrorStats() {
        return {
            isOnline: this.isOnline,
            retryAttempts: this.retryAttempts,
            activeErrors: Array.from(this.connectionErrors),
            canOperate: this.canAttemptFirestoreOperation()
        };
    }
    
    // Reset degli errori
    resetErrors() {
        this.retryAttempts = 0;
        this.connectionErrors.clear();
        console.log('Errori di connessione resettati');
    }
}

// Istanza globale del gestore connessioni
const connectionManager = new FirebaseConnectionManager();

// Esponi globalmente
window.connectionManager = connectionManager;

// Funzione di utilità per operazioni Firestore sicure
window.safeFirestoreOperation = async (operation, operationName) => {
    return await connectionManager.executeFirestoreOperation(operation, operationName);
};

console.log('Connection Manager inizializzato');

(function () {
    window.MVS_APP_VERSION = '7.3.1';
    window.appBuild = window.appBuild || { version: '', commit: '' };
    window.appBuild.version = String(window.MVS_APP_VERSION || '');
    function renderVersion() {
        const nodes = document.querySelectorAll('.app-version');
        if (!nodes || !nodes.length) return;
        const text = 'MyVolleyScout Vers. ' + String(window.MVS_APP_VERSION || '');
        nodes.forEach((el) => {
            el.textContent = text;
        });
    }
    window.updateAppVersionDisplay = renderVersion;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderVersion);
    else renderVersion();
})();
