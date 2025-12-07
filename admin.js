// Admin Panel - Gestione Ruoli Utenti
class AdminManager {
    constructor() {
        this.currentUser = null;
        this.currentUserRole = null;
        this.initializeAdmin();
    }

    async initializeAdmin() {
        // Aspetta che Firebase sia caricato
        if (typeof authFunctions === 'undefined' || typeof firestoreService === 'undefined') {
            setTimeout(() => this.initializeAdmin(), 100);
            return;
        }

        // Verifica autenticazione e ruolo
        await this.checkAdminAccess();
        this.setupEventListeners();
    }

    async checkAdminAccess() {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) {
                this.showAccessDenied();
                return;
            }

            this.currentUser = user;
            
            // Verifica ruolo admin
            const roleResult = await firestoreService.getUserRole();
            if (roleResult.success && roleResult.role === 'admin') {
                this.currentUserRole = roleResult.role;
                this.showAdminPanel();
                await this.loadUsersList();
            } else {
                this.showAccessDenied();
            }
        } catch (error) {
            console.error('Errore verifica accesso admin:', error);
            this.showAccessDenied();
        }
    }

    setupEventListeners() {
        const setRoleBtn = document.getElementById('setRoleBtn');
        const checkRoleBtn = document.getElementById('checkRoleBtn');
        const backBtn = document.getElementById('backBtn');
        const backToAppBtn = document.getElementById('backToAppBtn');

        if (setRoleBtn) {
            setRoleBtn.addEventListener('click', () => this.setUserRole());
        }

        if (checkRoleBtn) {
            checkRoleBtn.addEventListener('click', () => this.checkCurrentRole());
        }

        if (backBtn) {
            backBtn.addEventListener('click', () => this.goBack());
        }

        if (backToAppBtn) {
            backToAppBtn.addEventListener('click', () => this.goBack());
        }
    }

    async setUserRole() {
        const email = document.getElementById('userEmail').value;
        const role = document.getElementById('userRole').value;
        const resultDiv = document.getElementById('roleResult');

        if (!email) {
            resultDiv.textContent = 'Inserisci un\'email valida';
            resultDiv.className = 'result-message error';
            return;
        }

        try {
            const result = await firestoreService.setUserRole(email, role);
            if (result.success) {
                resultDiv.textContent = `Ruolo ${role} assegnato con successo a ${email}`;
                resultDiv.className = 'result-message success';
                
                // Ricarica la lista utenti
                await this.loadUsersList();
                
                // Pulisci i campi
                document.getElementById('userEmail').value = '';
            } else {
                resultDiv.textContent = result.error || 'Errore nell\'assegnazione del ruolo';
                resultDiv.className = 'result-message error';
            }
        } catch (error) {
            resultDiv.textContent = `Errore: ${error.message}`;
            resultDiv.className = 'result-message error';
        }
    }

    async checkCurrentRole() {
        const resultDiv = document.getElementById('currentRole');
        
        try {
            const result = await firestoreService.getUserRole();
            if (result.success) {
                resultDiv.textContent = `Il tuo ruolo attuale è: ${result.role}`;
                resultDiv.className = 'result-message info';
            } else {
                resultDiv.textContent = result.error || 'Errore nel recupero del ruolo';
                resultDiv.className = 'result-message error';
            }
        } catch (error) {
            resultDiv.textContent = `Errore: ${error.message}`;
            resultDiv.className = 'result-message error';
        }
    }

    async loadUsersList() {
        const usersListDiv = document.getElementById('usersList');
        
        try {
            // Questa è una funzione semplificata - in produzione potresti voler limitare
            // il numero di utenti caricati o aggiungere paginazione
            const usersRef = window.db.collection('users');
            const snapshot = await usersRef.limit(50).get();
            
            if (snapshot.empty) {
                usersListDiv.innerHTML = '<p>Nessun utente trovato</p>';
                return;
            }

            let html = '<table class="users-table">';
            html += '<thead><tr><th>Email</th><th>Ruolo</th><th>Creato il</th></tr></thead>';
            html += '<tbody>';

            snapshot.forEach(doc => {
                const userData = doc.data();
                const createdAt = userData.createdAt ? 
                    new Date(userData.createdAt.toDate()).toLocaleDateString('it-IT') : 
                    'N/A';
                
                html += `<tr>
                    <td>${userData.email || 'N/A'}</td>
                    <td><span class="role-badge ${userData.role || 'user'}">${userData.role || 'user'}</span></td>
                    <td>${createdAt}</td>
                </tr>`;
            });

            html += '</tbody></table>';
            usersListDiv.innerHTML = html;

        } catch (error) {
            console.error('Errore nel caricamento lista utenti:', error);
            usersListDiv.innerHTML = '<p>Errore nel caricamento lista utenti</p>';
        }
    }

    showAdminPanel() {
        document.getElementById('adminContent').style.display = 'block';
        document.getElementById('adminError').style.display = 'none';
    }

    showAccessDenied() {
        document.getElementById('adminContent').style.display = 'none';
        document.getElementById('adminError').style.display = 'block';
    }

    goBack() {
        window.location.href = '/my-teams.html';
    }
}

// Inizializza quando il DOM è pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new AdminManager();
    });
} else {
    new AdminManager();
}
