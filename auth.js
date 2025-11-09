// Stato dell'autenticazione
const authState = {
    user: null,
    isAuthenticated: false
};

// Inizializza l'autenticazione
function initializeAuth() {
    // Aspetta che firebase-config.js sia caricato
    if (typeof authFunctions === 'undefined') {
        setTimeout(initializeAuth, 100);
        return;
    }
    
    // Ascolta i cambiamenti dello stato di autenticazione
    authFunctions.onAuthStateChanged(async (user) => {
        authState.user = user;
        authState.isAuthenticated = !!user;
        
        // Utente autenticato
        if (user) {
            console.log('Utente autenticato:', user.email);
            
            // Aspetta un momento per assicurarsi che tutti i servizi siano caricati
            setTimeout(async () => {
                try {
                    // Crea la collection personalizzata per l'utente
                    if (window.firestoreService && window.firestoreService.createUserCollection) {
                        const result = await window.firestoreService.createUserCollection(user.email);
                        if (result.success) {
                            console.log('Collection utente creata/verificata:', result.collectionName);
                        }
                    }
                    
                    // Verifica ruolo utente
                    if (window.firestoreService && window.firestoreService.getUserRole) {
                        const roleResult = await window.firestoreService.getUserRole();
                        if (roleResult.success) {
                            authState.userRole = roleResult.role;
                            console.log('Ruolo utente:', roleResult.role);
                        }
                    }
                    
                    // Aggiorna l'ultimo accesso
                    if (window.firestoreService && window.firestoreService.updateUserLastAccess) {
                        await window.firestoreService.updateUserLastAccess(user.email);
                    }
                } catch (error) {
                    console.error('Errore nella gestione utente autenticato:', error);
                }
            }, 1000);
            
            // Aggiorna l'interfaccia utente
            updateAuthUI(user);
            
            // Carica i dati dell'utente
            if (window.firestoreService) {
                await window.firestoreService.loadUserData(user.uid);
            }
            
            hideAuthModal();
        } else {
            console.log('Utente non autenticato');
            authState.userRole = null;
            updateAuthUI(null);
        }
    });

    // Aggiungi event listeners per i form di autenticazione
    setupAuthEventListeners();
}

// Configura gli event listeners per l'autenticazione
function setupAuthEventListeners() {
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Register form
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }

    // Google sign-in button
    const googleSignInBtn = document.getElementById('googleSignInBtn');
    if (googleSignInBtn) {
        googleSignInBtn.addEventListener('click', handleGoogleSignIn);
    }

    // Sign out button
    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', handleSignOut);
    }

    // Auth modal buttons
    const showLoginBtn = document.getElementById('showLoginBtn');
    const showRegisterBtn = document.getElementById('showRegisterBtn');
    const authModalClose = document.getElementById('authModalClose');

    if (showLoginBtn) {
        showLoginBtn.addEventListener('click', () => showAuthModal('login'));
    }
    if (showRegisterBtn) {
        showRegisterBtn.addEventListener('click', () => showAuthModal('register'));
    }
    if (authModalClose) {
        authModalClose.addEventListener('click', hideAuthModal);
    }

    // Switch between login and register
    const switchToRegister = document.getElementById('switchToRegister');
    const switchToLogin = document.getElementById('switchToLogin');
    
    if (switchToRegister) {
        switchToRegister.addEventListener('click', (e) => {
            e.preventDefault();
            showAuthModal('register');
        });
    }
    if (switchToLogin) {
        switchToLogin.addEventListener('click', (e) => {
            e.preventDefault();
            showAuthModal('login');
        });
    }
}

// Gestisce il login
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');

    showLoading('loginBtn');
    
    const result = await authFunctions.signIn(email, password);
    
    hideLoading('loginBtn');
    
    if (result.success) {
        errorDiv.textContent = '';
        document.getElementById('loginForm').reset();
    } else {
        errorDiv.textContent = getErrorMessage(result.error);
    }
}

// Gestisce la registrazione
async function handleRegister(e) {
    e.preventDefault();
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const errorDiv = document.getElementById('registerError');

    if (password !== confirmPassword) {
        errorDiv.textContent = 'Le password non corrispondono';
        return;
    }

    if (password.length < 6) {
        errorDiv.textContent = 'La password deve essere di almeno 6 caratteri';
        return;
    }

    showLoading('registerBtn');
    
    const result = await authFunctions.signUp(email, password);
    
    hideLoading('registerBtn');
    
    if (result.success) {
        errorDiv.textContent = '';
        document.getElementById('registerForm').reset();
    } else {
        errorDiv.textContent = getErrorMessage(result.error);
    }
}

// Gestisce il login con Google
async function handleGoogleSignIn() {
    const errorDiv = document.getElementById('googleError');
    
    const result = await authFunctions.signInWithGoogle();
    
    if (!result.success) {
        errorDiv.textContent = getErrorMessage(result.error);
    }
}

// Gestisce il logout
async function handleSignOut() {
    const result = await authFunctions.signOut();
    if (result.success) {
        console.log('User signed out successfully');
        // Pulisce la sessione di scouting e reindirizza al login
        localStorage.removeItem('currentScoutingSession');
    window.location.replace('/auth-login.html');
    }
}

// Mostra il modal di autenticazione
function showAuthModal(mode = 'login') {
    const modal = document.getElementById('authModal');
    const loginForm = document.getElementById('loginFormContainer');
    const registerForm = document.getElementById('registerFormContainer');
    
    if (modal) {
        modal.style.display = 'flex';
        
        if (mode === 'login') {
            loginForm.style.display = 'block';
            registerForm.style.display = 'none';
        } else {
            loginForm.style.display = 'none';
            registerForm.style.display = 'block';
        }
    }
}

// Nasconde il modal di autenticazione
function hideAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Aggiorna l'interfaccia utente in base allo stato di autenticazione
async function updateAuthUI(user = null) {
    const authButtons = document.getElementById('authButtons');
    const userInfo = document.getElementById('userInfo');
    const userEmail = document.getElementById('userEmail');
    const userRole = document.getElementById('userRole');
    const adminBtn = document.getElementById('adminBtn');

    if (user || authState.isAuthenticated) {
        if (authButtons) authButtons.style.display = 'none';
        if (userInfo) userInfo.style.display = 'flex';
        if (userEmail) userEmail.textContent = (user || authState.user).email;

        // Mostra ruolo se disponibile
        if (userRole) {
            userRole.textContent = authState.userRole ? `(${authState.userRole})` : '';
        }

        // Mostra bottone admin solo per admin
        if (adminBtn) {
            adminBtn.style.display = authState.userRole === 'admin' ? 'inline-block' : 'none';
        }
    } else {
        if (authButtons) authButtons.style.display = 'flex';
        if (userInfo) userInfo.style.display = 'none';
        if (userRole) userRole.textContent = '';
        if (adminBtn) adminBtn.style.display = 'none';
    }
}

// Mostra loading su un bottone
function showLoading(buttonId) {
    const button = document.getElementById(buttonId);
    if (button) {
        button.disabled = true;
        button.textContent = 'Caricamento...';
    }
}

// Nasconde loading su un bottone
function hideLoading(buttonId) {
    const button = document.getElementById(buttonId);
    if (button) {
        button.disabled = false;
        if (buttonId === 'loginBtn') button.textContent = 'Accedi';
        if (buttonId === 'registerBtn') button.textContent = 'Registrati';
    }
}

// Converte gli errori Firebase in messaggi user-friendly
function getErrorMessage(error) {
    switch (error) {
        case 'auth/user-not-found':
            return 'Utente non trovato';
        case 'auth/wrong-password':
            return 'Password errata';
        case 'auth/email-already-in-use':
            return 'Email già in uso';
        case 'auth/weak-password':
            return 'Password troppo debole';
        case 'auth/invalid-email':
            return 'Email non valida';
        case 'auth/popup-closed-by-user':
            return 'Login con Google annullato';
        default:
            return 'Errore durante l\'autenticazione';
    }
}

// Verifica se l'utente è autenticato
function isAuthenticated() {
    return authState.isAuthenticated;
}

// Ottieni l'utente corrente
function getCurrentUser() {
    return authState.user;
}

// Richiedi autenticazione se necessario
function requireAuth() {
    if (!authState.isAuthenticated) {
        showAuthModal('login');
        return false;
    }
    return true;
}

// Esponi le funzioni globalmente
window.authModule = {
    initializeAuth,
    isAuthenticated,
    getCurrentUser,
    requireAuth
};