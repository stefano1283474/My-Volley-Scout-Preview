/**
 * Authentication Module
 * Gestisce l'autenticazione utente con Firebase Auth
 * Fornisce un'interfaccia moderna e gestione errori migliorata
 */

class AuthModule {
    constructor() {
        this.state = {
            user: null,
            isAuthenticated: false,
            isLoading: true,
            error: null
        };
        
        this.callbacks = {
            onAuthStateChange: [],
            onError: []
        };
        
        this.init();
    }

    /**
     * Inizializza il modulo di autenticazione
     */
    async init() {
        try {
            // Aspetta che Firebase sia caricato
            await this.waitForFirebase();
            
            // Configura il listener per i cambiamenti di stato
            this.setupAuthStateListener();
            
            // Configura gli event listeners dell'UI
            this.setupEventListeners();
            
            console.log('AuthModule inizializzato correttamente');
        } catch (error) {
            console.error('Errore nell\'inizializzazione AuthModule:', error);
            this.handleError(error);
        }
    }

    /**
     * Aspetta che Firebase sia disponibile
     */
    waitForFirebase() {
        return new Promise((resolve, reject) => {
            const checkFirebase = () => {
                if (typeof firebase !== 'undefined' && firebase.auth) {
                    resolve();
                } else {
                    setTimeout(checkFirebase, 100);
                }
            };
            checkFirebase();
            
            // Timeout dopo 10 secondi
            setTimeout(() => {
                reject(new Error('Firebase non disponibile dopo 10 secondi'));
            }, 10000);
        });
    }

    /**
     * Configura il listener per i cambiamenti di stato dell'autenticazione
     */
    setupAuthStateListener() {
        firebase.auth().onAuthStateChanged(async (user) => {
            try {
                this.state.user = user;
                this.state.isAuthenticated = !!user;
                this.state.isLoading = false;
                
                if (user) {
                    console.log('Utente autenticato:', user.email);
                    
                    // Inizializza i servizi utente
                    await this.initializeUserServices(user);
                    
                    // Reindirizza alla pagina "My Teams" dopo autenticazione
                    try {
                        window.location.replace('/my-teams.html');
                    } catch (_) {
                        window.location.href = '/my-teams.html';
                    }
                } else {
                    console.log('Utente non autenticato');
                    
                    // Mostra la schermata di autenticazione
                    this.showAuthScreen();
                }
                
                // Notifica i callback
                this.notifyAuthStateChange(user);
                
            } catch (error) {
                console.error('Errore nella gestione del cambio di stato auth:', error);
                this.handleError(error);
            }
        });
    }

    /**
     * Inizializza i servizi per l'utente autenticato
     */
    async initializeUserServices(user) {
        try {
            // Crea/verifica la collection utente
            if (window.firestoreService?.createUserCollection) {
                const result = await window.firestoreService.createUserCollection(user.email);
                if (result.success) {
                    console.log('Collection utente verificata:', result.collectionName);
                }
            }
            
            // Aggiorna l'ultimo accesso
            if (window.firestoreService?.updateUserLastAccess) {
                await window.firestoreService.updateUserLastAccess(user.email);
            }
            
            // Carica i dati utente
            if (window.firestoreService?.loadUserData) {
                await window.firestoreService.loadUserData(user.uid);
            }
            
        } catch (error) {
            console.warn('Errore nell\'inizializzazione servizi utente:', error);
            // Non bloccare l'autenticazione per errori dei servizi
        }
    }

    /**
     * Configura gli event listeners per l'UI
     */
    setupEventListeners() {
        // Form di login
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Form di registrazione
        const registerForm = document.getElementById('register-form');
        if (registerForm) {
            registerForm.addEventListener('submit', (e) => this.handleRegister(e));
        }

        // Login con Google
        const googleBtn = document.getElementById('google-signin-btn');
        if (googleBtn) {
            googleBtn.addEventListener('click', () => this.handleGoogleSignIn());
        }

        // Logout
        const signOutBtn = document.getElementById('logout-btn');
        if (signOutBtn) {
            signOutBtn.addEventListener('click', () => this.handleSignOut());
        }

        // Switch tra login e registrazione
        const switchToRegister = document.getElementById('switchToRegister');
        const switchToLogin = document.getElementById('switchToLogin');
        
        if (switchToRegister) {
            switchToRegister.addEventListener('click', (e) => {
                e.preventDefault();
                this.showRegisterForm();
            });
        }
        
        if (switchToLogin) {
            switchToLogin.addEventListener('click', (e) => {
                e.preventDefault();
                this.showLoginForm();
            });
        }
    }

    /**
     * Gestisce il login con email e password
     */
    async handleLogin(event) {
        event.preventDefault();
        
        const email = document.getElementById('login-email')?.value;
        const password = document.getElementById('login-password')?.value;
        const errorDiv = document.getElementById('login-error');
        const submitBtn = event.target.querySelector('button[type="submit"]');
        
        if (!email || !password) {
            this.showError(errorDiv, 'Inserisci email e password');
            return;
        }
        
        try {
            this.setButtonLoading(submitBtn, true);
            this.clearError(errorDiv);
            
            await firebase.auth().signInWithEmailAndPassword(email, password);
            
            // Reset form
            event.target.reset();
            
        } catch (error) {
            console.error('Errore nel login:', error);
            this.showError(errorDiv, this.getErrorMessage(error.code));
        } finally {
            this.setButtonLoading(submitBtn, false);
        }
    }

    /**
     * Gestisce la registrazione
     */
    async handleRegister(event) {
        event.preventDefault();
        
        const email = document.getElementById('register-email')?.value;
        const password = document.getElementById('register-password')?.value;
        const confirmPassword = document.getElementById('confirm-password')?.value;
        const errorDiv = document.getElementById('register-error');
        const submitBtn = event.target.querySelector('button[type="submit"]');
        
        // Validazione
        if (!email || !password || !confirmPassword) {
            this.showError(errorDiv, 'Compila tutti i campi');
            return;
        }
        
        if (password !== confirmPassword) {
            this.showError(errorDiv, 'Le password non corrispondono');
            return;
        }
        
        if (password.length < 6) {
            this.showError(errorDiv, 'La password deve essere di almeno 6 caratteri');
            return;
        }
        
        try {
            this.setButtonLoading(submitBtn, true);
            this.clearError(errorDiv);
            
            await firebase.auth().createUserWithEmailAndPassword(email, password);
            
            // Reset form
            event.target.reset();
            
        } catch (error) {
            console.error('Errore nella registrazione:', error);
            this.showError(errorDiv, this.getErrorMessage(error.code));
        } finally {
            this.setButtonLoading(submitBtn, false);
        }
    }

    /**
     * Gestisce il login con Google
     */
    async handleGoogleSignIn() {
        const errorDiv = document.getElementById('google-error');
        const googleBtn = document.getElementById('google-signin-btn');
        
        try {
            this.clearError(errorDiv);
            this.setButtonLoading(googleBtn, true);
            
            const provider = new firebase.auth.GoogleAuthProvider();
            await firebase.auth().signInWithPopup(provider);
            
        } catch (error) {
            console.error('Errore nel login con Google:', error);
            
            // Non mostrare errore se l'utente ha chiuso il popup
            if (error.code !== 'auth/popup-closed-by-user') {
                this.showError(errorDiv, this.getErrorMessage(error.code));
            }
        } finally {
            this.setButtonLoading(googleBtn, false);
        }
    }

    /**
     * Gestisce il logout
     */
    async handleSignOut() {
        try {
            await firebase.auth().signOut();
            console.log('Logout effettuato con successo');
        } catch (error) {
            console.error('Errore nel logout:', error);
            this.handleError(error);
        }
    }

    /**
     * Mostra la schermata di autenticazione
     */
    showAuthScreen() {
        this.hideLoadingScreen();
        this.hideAllScreens();
        this.showScreen('auth-screen');
        this.showLoginForm();
    }

    /**
     * Mostra la schermata di benvenuto
     */
    showWelcomeScreen() {
        this.hideLoadingScreen();
        this.hideAllScreens();
        this.showScreen('welcome-screen');
        this.updateWelcomeUI();
    }

    /**
     * Mostra il form di login
     */
    showLoginForm() {
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');
        
        if (loginForm) loginForm.classList.remove('hidden');
        if (registerForm) registerForm.classList.add('hidden');
        
        // Clear errors
        this.clearError(document.getElementById('loginError'));
        this.clearError(document.getElementById('registerError'));
    }

    /**
     * Mostra il form di registrazione
     */
    showRegisterForm() {
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');
        
        if (loginForm) loginForm.classList.add('hidden');
        if (registerForm) registerForm.classList.remove('hidden');
        
        // Clear errors
        this.clearError(document.getElementById('loginError'));
        this.clearError(document.getElementById('registerError'));
    }

    /**
     * Aggiorna l'UI della schermata di benvenuto
     */
    updateWelcomeUI() {
        if (!this.state.user) return;
        
        const userEmail = document.getElementById('user-email');
        const userAvatar = document.getElementById('user-avatar');
        const userName = document.getElementById('user-name');
        
        if (userEmail) {
            userEmail.textContent = this.state.user.email;
        }
        
        if (userAvatar) {
            const initials = this.getUserInitials(this.state.user.displayName || this.state.user.email);
            userAvatar.textContent = initials;
        }
        
        if (userName) {
            const name = this.state.user.displayName || this.state.user.email.split('@')[0];
            userName.textContent = name;
        }
    }

    /**
     * Ottiene le iniziali dell'utente
     */
    getUserInitials(name) {
        if (!name) return 'U';
        
        const parts = name.split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name[0].toUpperCase();
    }

    /**
     * Utility per mostrare/nascondere schermate
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

    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.remove('active');
            loadingScreen.style.display = 'none';
        }
    }

    /**
     * Gestione errori
     */
    showError(errorElement, message) {
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.classList.remove('hidden');
            errorElement.style.display = 'block';
        }
    }

    clearError(errorElement) {
        if (errorElement) {
            errorElement.textContent = '';
            errorElement.classList.add('hidden');
            errorElement.style.display = 'none';
        }
    }

    handleError(error) {
        console.error('AuthModule Error:', error);
        this.state.error = error;
        this.notifyError(error);
    }

    /**
     * Converte i codici di errore Firebase in messaggi user-friendly
     */
    getErrorMessage(errorCode) {
        const errorMessages = {
            'auth/user-not-found': 'Utente non trovato. Verifica l\'email inserita.',
            'auth/wrong-password': 'Password errata. Riprova.',
            'auth/email-already-in-use': 'Questa email è già registrata. Prova ad accedere.',
            'auth/weak-password': 'La password è troppo debole. Usa almeno 6 caratteri.',
            'auth/invalid-email': 'L\'email inserita non è valida.',
            'auth/user-disabled': 'Questo account è stato disabilitato.',
            'auth/too-many-requests': 'Troppi tentativi. Riprova più tardi.',
            'auth/network-request-failed': 'Errore di connessione. Verifica la tua connessione internet.',
            'auth/popup-closed-by-user': 'Login annullato.',
            'auth/cancelled-popup-request': 'Login annullato.',
            'auth/popup-blocked': 'Popup bloccato dal browser. Abilita i popup per questo sito.'
        };
        
        return errorMessages[errorCode] || 'Si è verificato un errore. Riprova.';
    }

    /**
     * Gestione stato loading dei bottoni
     */
    setButtonLoading(button, isLoading) {
        if (!button) return;
        
        const textSpan = button.querySelector('.btn-text');
        const spinner = button.querySelector('.btn-spinner');
        
        if (isLoading) {
            button.disabled = true;
            if (textSpan) textSpan.style.opacity = '0';
            if (spinner) spinner.classList.remove('hidden');
        } else {
            button.disabled = false;
            if (textSpan) textSpan.style.opacity = '1';
            if (spinner) spinner.classList.add('hidden');
        }
    }

    /**
     * Sistema di callback per eventi
     */
    onAuthStateChange(callback) {
        this.callbacks.onAuthStateChange.push(callback);
    }

    onError(callback) {
        this.callbacks.onError.push(callback);
    }

    notifyAuthStateChange(user) {
        this.callbacks.onAuthStateChange.forEach(callback => {
            try {
                callback(user, this.state.isAuthenticated);
            } catch (error) {
                console.error('Errore nel callback onAuthStateChange:', error);
            }
        });
    }

    notifyError(error) {
        this.callbacks.onError.forEach(callback => {
            try {
                callback(error);
            } catch (callbackError) {
                console.error('Errore nel callback onError:', callbackError);
            }
        });
    }

    /**
     * API pubblica
     */
    getCurrentUser() {
        return this.state.user;
    }

    isAuthenticated() {
        return this.state.isAuthenticated;
    }

    isLoading() {
        return this.state.isLoading;
    }

    getError() {
        return this.state.error;
    }

    requireAuth() {
        if (!this.state.isAuthenticated) {
            this.showAuthScreen();
            return false;
        }
        return true;
    }
}

// Inizializza il modulo quando il DOM è pronto
let authModule;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        authModule = new AuthModule();
        window.authModule = authModule;
    });
} else {
    authModule = new AuthModule();
    window.authModule = authModule;
}

// Esporta per compatibilità
window.AuthModule = AuthModule;
