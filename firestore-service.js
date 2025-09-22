// Servizio Firestore per My Volley Scout
// Gestisce tutte le operazioni di salvataggio e recupero dati da Firestore

const firestoreService = {
    // Crea una collection per l'utente con nome basato sull'email
    createUserCollection: async (userEmail) => {
        try {
            if (!userEmail) {
                throw new Error('Email utente non fornita');
            }

            const user = authFunctions.getCurrentUser();
            if (!user) {
                throw new Error('Utente non autenticato');
            }

            // Crea nome collection sicuro dall'email
            const safeCollectionName = userEmail.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            
            // Riferimento alla collection dell'utente
            const userCollectionRef = window.db.collection('users').doc(user.uid);
            
            // Verifica se esiste già
            const doc = await userCollectionRef.get();
            
            if (!doc.exists) {
                // Crea documento utente con struttura base e ruolo
            await userCollectionRef.set({
                email: userEmail,
                collectionName: safeCollectionName,
                role: 'user', // Ruolo predefinito per nuovi utenti
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastAccess: firebase.firestore.FieldValue.serverTimestamp(),
                stats: {
                    totalMatches: 0,
                    totalRosters: 0,
                    lastMatchDate: null
                }
            });
                
                console.log('Collection utente creata:', safeCollectionName);
            } else {
                // Aggiorna solo lastAccess se esiste già
                await userCollectionRef.update({
                    lastAccess: firebase.firestore.FieldValue.serverTimestamp()
                });
                console.log('Collection utente già esistente, aggiornato lastAccess');
            }

            return {
                success: true,
                collectionName: safeCollectionName,
                userId: user.uid
            };

        } catch (error) {
            console.error('Errore nella creazione collection utente:', error);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Aggiorna l'ultimo accesso dell'utente
    updateUserLastAccess: async (userEmail) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) return { success: false, error: 'Utente non autenticato' };

            await window.db.collection('users').doc(user.uid).update({
                lastAccess: firebase.firestore.FieldValue.serverTimestamp()
            });

            return { success: true };
        } catch (error) {
            console.error('Errore nell\'aggiornamento ultimo accesso:', error);
            return { success: false, error: error.message };
        }
    },

    // Gestione ruoli utente
    setUserRole: async (userEmail, role) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) return { success: false, error: 'Utente non autenticato' };

            // Solo admin può modificare ruoli
            const currentUserDoc = await window.db.collection('users').doc(user.uid).get();
            const currentUserData = currentUserDoc.data();
            
            if (currentUserData?.role !== 'admin') {
                return { success: false, error: 'Permessi insufficienti: solo admin può modificare ruoli' };
            }

            // Trova l'utente target per email
            const targetUserQuery = await window.db.collection('users')
                .where('email', '==', userEmail)
                .limit(1)
                .get();

            if (targetUserQuery.empty) {
                return { success: false, error: 'Utente target non trovato' };
            }

            const targetUserDoc = targetUserQuery.docs[0];
            await targetUserDoc.ref.update({
                role: role,
                roleUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                roleUpdatedBy: user.email
            });

            console.log(`Ruolo ${role} assegnato a ${userEmail}`);
            return { success: true };

        } catch (error) {
            console.error('Errore nella gestione ruoli:', error);
            return { success: false, error: error.message };
        }
    },

    // Ottieni ruolo utente
    getUserRole: async (userEmail = null) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) return { success: false, error: 'Utente non autenticato' };

            const targetEmail = userEmail || user.email;
            const userDoc = await window.db.collection('users').doc(user.uid).get();
            
            if (!userDoc.exists) {
                // Crea utente se non esiste
                await firestoreService.createUserCollection(targetEmail);
                return { success: true, role: 'user' };
            }

            const userData = userDoc.data();
            return { success: true, role: userData?.role || 'user' };

        } catch (error) {
            console.error('Errore nel recupero ruolo:', error);
            return { success: false, error: error.message };
        }
    },

    // Verifica se l'utente è admin
    isUserAdmin: async () => {
        try {
            const result = await firestoreService.getUserRole();
            return { success: true, isAdmin: result.success && result.role === 'admin' };
        } catch (error) {
            return { success: false, error: error.message, isAdmin: false };
        }
    },

    // Carica i dati dell'utente
    loadUserData: async (userId) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) {
                return { success: false, error: 'Utente non autenticato' };
            }

            // Carica il profilo utente
            const profileDoc = await window.db.collection('users').doc(user.uid).get();
            
            if (profileDoc.exists) {
                const userData = profileDoc.data();
                console.log('Dati utente caricati:', userData);
                return { success: true, data: userData };
            } else {
                console.log('Nessun profilo utente trovato');
                return { success: false, error: 'Profilo utente non trovato' };
            }
            
        } catch (error) {
            console.error('Errore nel caricamento dei dati utente:', error);
            return { success: false, error: error.message };
        }
    },

    // Salva le statistiche di una partita
    saveMatchStats: async (matchData) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) {
                throw new Error('Utente non autenticato');
            }

            const matchRef = window.db.collection('users').doc(user.uid)
                .collection('matches').doc();

            const matchToSave = {
                ...matchData,
                id: matchRef.id,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await matchRef.set(matchToSave);

            // Aggiorna le statistiche utente
            await window.db.collection('users').doc(user.uid).update({
                'stats.totalMatches': firebase.firestore.FieldValue.increment(1),
                'stats.lastMatchDate': firebase.firestore.FieldValue.serverTimestamp()
            });

            console.log('Partita salvata con ID:', matchRef.id);
            return { success: true, id: matchRef.id };

        } catch (error) {
            console.error('Errore nel salvataggio partita:', error);
            return { success: false, error: error.message };
        }
    },

    // Sincronizza i dati locali con Firestore
    syncLocalData: async () => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) {
                return { success: false, error: 'Utente non autenticato' };
            }

            const results = {
                matches: { synced: 0, errors: 0 },
                rosters: { synced: 0, errors: 0 }
            };

            // Sincronizza partite
            const localMatches = JSON.parse(localStorage.getItem('matches') || '[]');
            for (const match of localMatches) {
                try {
                    await firestoreService.saveMatchStats(match);
                    results.matches.synced++;
                } catch (error) {
                    console.error('Errore sincronizzazione partita:', error);
                    results.matches.errors++;
                }
            }

            // Sincronizza roster
            const localRosters = JSON.parse(localStorage.getItem('rosters') || '[]');
            for (const roster of localRosters) {
                try {
                    await firestoreService.saveRoster(roster);
                    results.rosters.synced++;
                } catch (error) {
                    console.error('Errore sincronizzazione roster:', error);
                    results.rosters.errors++;
                }
            }

            return { success: true, syncResults: results };

        } catch (error) {
            console.error('Errore nella sincronizzazione:', error);
            return { success: false, error: error.message };
        }
    },

    // Salva un roster
    saveRoster: async (rosterData) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) {
                throw new Error('Utente non autenticato');
            }

            const rosterRef = window.db.collection('users').doc(user.uid)
                .collection('rosters').doc();

            const rosterToSave = {
                ...rosterData,
                id: rosterRef.id,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await rosterRef.set(rosterToSave);

            // Aggiorna le statistiche utente
            await window.db.collection('users').doc(user.uid).update({
                'stats.totalRosters': firebase.firestore.FieldValue.increment(1)
            });

            console.log('Roster salvato con ID:', rosterRef.id);
            return { success: true, id: rosterRef.id };

        } catch (error) {
            console.error('Errore nel salvataggio roster:', error);
            return { success: false, error: error.message };
        }
    },

    // Carica i roster dell'utente
    loadUserRosters: async () => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) {
                return { success: false, error: 'Utente non autenticato' };
            }

            const rostersSnapshot = await window.db.collection('users').doc(user.uid)
                .collection('rosters')
                .orderBy('createdAt', 'desc')
                .get();

            const rosters = [];
            rostersSnapshot.forEach(doc => {
                rosters.push({ id: doc.id, ...doc.data() });
            });

            return { success: true, documents: rosters };

        } catch (error) {
            console.error('Errore nel caricamento roster:', error);
            return { success: false, error: error.message };
        }
    },

    // Elimina un roster per ID (Firestore)
    deleteRosterById: async (rosterId) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) {
                return { success: false, error: 'Utente non autenticato' };
            }
            if (!rosterId) {
                return { success: false, error: 'ID roster non valido' };
            }

            await window.db
                .collection('users')
                .doc(user.uid)
                .collection('rosters')
                .doc(rosterId)
                .delete();

            // Non decrementiamo stats.totalRosters per evitare inconsistenze (potrebbe contare storici)
            return { success: true };
        } catch (error) {
            console.error('Errore nella cancellazione roster per ID:', error);
            return { success: false, error: error.message };
        }
    },

    // Elimina tutti i roster che hanno un certo nome (Firestore)
    deleteRostersByName: async (name) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) {
                return { success: false, error: 'Utente non autenticato' };
            }
            if (!name) {
                return { success: false, error: 'Nome roster non valido' };
            }

            const querySnap = await window.db
                .collection('users')
                .doc(user.uid)
                .collection('rosters')
                .where('name', '==', name)
                .get();

            const batch = window.db.batch();
            querySnap.forEach((doc) => batch.delete(doc.ref));
            if (!querySnap.empty) {
                await batch.commit();
            }

            return { success: true, deleted: querySnap.size };
        } catch (error) {
            console.error('Errore nella cancellazione roster per nome:', error);
            return { success: false, error: error.message };
        }
    },

    // Rimuove dal localStorage eventuali roster salvati con quel nome (compat con vecchio storage)
    deleteLocalRostersByName: (name) => {
        try {
            const stored = JSON.parse(localStorage.getItem('volleyRosters') || '[]');
            const filtered = stored.filter((r) => (r?.name || '').toLowerCase() !== (name || '').toLowerCase());
            localStorage.setItem('volleyRosters', JSON.stringify(filtered));
            return { success: true };
        } catch (error) {
            console.warn('Errore cancellazione roster locale per nome:', error);
            return { success: false, error: error.message };
        }
    },

    // Carica le partite dell'utente
    loadUserMatches: async () => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) {
                return { success: false, error: 'Utente non autenticato' };
            }

            const matchesSnapshot = await window.db.collection('users').doc(user.uid)
                .collection('matches')
                .orderBy('createdAt', 'desc')
                .get();

            const matches = [];
            matchesSnapshot.forEach(doc => {
                matches.push({ id: doc.id, ...doc.data() });
            });

            return { success: true, documents: matches };

        } catch (error) {
            console.error('Errore nel caricamento partite:', error);
            return { success: false, error: error.message };
        }
    },

    // Backup automatico dei dati
    autoBackup: async () => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) {
                return { success: false, error: 'Utente non autenticato' };
            }

            // Ottieni tutti i dati locali
            const appState = {
                matches: JSON.parse(localStorage.getItem('matches') || '[]'),
                rosters: JSON.parse(localStorage.getItem('rosters') || '[]'),
                settings: JSON.parse(localStorage.getItem('appSettings') || '{}'),
                timestamp: new Date()
            };

            // Salva lo stato nell'oggetto backup dell'utente
            await window.db.collection('users').doc(user.uid).update({
                lastBackup: {
                    data: appState,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                }
            });

            console.log('Backup automatico completato');
            return {
                success: true,
                message: 'Backup automatico completato',
                timestamp: new Date()
            };

        } catch (error) {
            console.error('Errore nel backup automatico:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
};

// Esposizione globale del servizio
window.firestoreService = firestoreService;