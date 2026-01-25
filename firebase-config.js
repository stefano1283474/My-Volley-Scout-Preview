window.firebaseConfig = window.firebaseConfig || {
  apiKey: "AIzaSyADkMksRlaVVcsLIhV2XucfEt5Y-ELzUMA",
  authDomain: "volley-data-studio.firebaseapp.com",
  projectId: "volley-data-studio",
  storageBucket: "volley-data-studio.firebasestorage.app",
  messagingSenderId: "55271933225",
  appId: "1:55271933225:web:0b6135017431be3783e338",
  measurementId: "G-GFHR0LSQPR"
};

window.app = window.app || null;
window.analytics = window.analytics || null;
window.auth = window.auth || null;
window.db = window.db || null;
window.googleProvider = window.googleProvider || null;
const isLocal = (typeof location !== 'undefined') && (location.hostname === 'localhost');

if (typeof firebase !== 'undefined' && firebase && typeof firebase.initializeApp === 'function') {
  window.app = window.app || firebase.initializeApp(window.firebaseConfig);
  window.analytics = null;
  window.auth = window.auth || firebase.auth();
  window.db = window.db || firebase.firestore();
  if (isLocal && firebase && firebase.firestore && typeof firebase.firestore.setLogLevel === 'function') {
    firebase.firestore.setLogLevel('silent');
  }
  window.googleProvider = window.googleProvider || new firebase.auth.GoogleAuthProvider();
  window.googleProvider.setCustomParameters({ prompt: 'select_account' });
  try { window.googleProvider.addScope('https://www.googleapis.com/auth/drive.file'); } catch(_) {}
  try {
    window.db.settings(Object.assign({
      cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
      ignoreUndefinedProperties: true
    }, isLocal ? { experimentalAutoDetectLongPolling: true, experimentalForceLongPolling: true } : {}));
  } catch(_) {}
  if (!isLocal) {
    try {
      window.db.enablePersistence({ synchronizeTabs: true }).catch(function(){ });
    } catch(_) {}
  }
  try { if (isLocal && firebase && firebase.auth) { window.auth.setPersistence(firebase.auth.Auth.Persistence.SESSION).catch(function(){ }); } } catch(_) {}
  try {
    if (isLocal) {
      const originalError = console.error;
      console.error = function(){
        try {
          const msg = arguments && String(arguments[0]||'');
          const suppress = (msg.indexOf('google.firestore.v1.Firestore/Listen/channel')>=0) || (msg.indexOf('google.firestore.v1.Firestore/Write/channel')>=0) || (msg.indexOf('securetoken.googleapis.com')>=0);
          if (suppress) return;
        } catch(_){ }
        return originalError.apply(console, arguments);
      };
    }
  } catch(_){ }
}

const authFunctions = (function(){
  if (window.auth && typeof window.auth === 'object') {
    return {
      signUp: async (email, password) => {
        try { const userCredential = await window.auth.createUserWithEmailAndPassword(email, password); return { success: true, user: userCredential.user }; } catch (error) { return { success: false, error: error.message, code: error.code }; }
      },
      signIn: async (email, password) => {
        try { const userCredential = await window.auth.signInWithEmailAndPassword(email, password); return { success: true, user: userCredential.user }; } catch (error) { return { success: false, error: error.message, code: error.code }; }
      },
      signInWithGoogle: async () => {
        try {
          const result = await window.auth.signInWithPopup(window.googleProvider);
          try {
            const cred = firebase.auth.GoogleAuthProvider.credentialFromResult(result);
            const token = cred && cred.accessToken;
            if (token) {
              const expiresAt = Date.now() + 50 * 60 * 1000;
              window.__mvsDriveToken = token;
              window.__mvsDriveTokenExpiresAt = expiresAt;
              try {
                sessionStorage.setItem('mvsDriveToken', token);
                sessionStorage.setItem('mvsDriveTokenExpiresAt', String(expiresAt));
              } catch (_) {}
            }
          } catch (_) {}
          return { success: true, user: result.user };
        } catch (error) { return { success: false, error: error.message, code: error.code }; }
      },
      signOut: async () => {
        try {
          await window.auth.signOut();
          try {
            sessionStorage.removeItem('mvsDriveToken');
            sessionStorage.removeItem('mvsDriveTokenExpiresAt');
          } catch (_) {}
          window.__mvsDriveToken = null;
          window.__mvsDriveTokenExpiresAt = 0;
          return { success: true };
        } catch (error) { return { success: false, error: error.message, code: error.code }; }
      },
      getCurrentUser: () => { return window.auth.currentUser; },
      onAuthStateChanged: (callback) => { return window.auth.onAuthStateChanged(callback); }
    };
  }
  return {
    signUp: async () => ({ success: false, error: 'Firebase non disponibile' }),
    signIn: async () => ({ success: false, error: 'Firebase non disponibile' }),
    signInWithGoogle: async () => ({ success: false, error: 'Firebase non disponibile' }),
    signOut: async () => ({ success: false, error: 'Firebase non disponibile' }),
    getCurrentUser: () => null,
    onAuthStateChanged: (callback) => { try { if (typeof callback==='function') callback(null); } catch(_) {} return function(){}; }
  };
})();

const firestoreFunctions = (function(){
  if (window.db && typeof window.db === 'object') {
    return {
      addDocument: async (collectionName, data) => {
        try { const docRef = await window.db.collection(collectionName).add(Object.assign({}, data, { createdAt: new Date(), userId: authFunctions.getCurrentUser()?.uid })); return { success: true, id: docRef.id }; } catch (error) { return { success: false, error: error.message }; }
      },
      getDocuments: async (collectionName, userId = null) => {
        try { const query = userId ? window.db.collection(collectionName).where('userId','==',userId).orderBy('createdAt','desc') : window.db.collection(collectionName).orderBy('createdAt','desc'); const qs = await query.get(); const documents = []; qs.forEach(doc=> documents.push(Object.assign({ id: doc.id }, doc.data()))); return { success: true, documents }; } catch (error) { return { success: false, error: error.message }; }
      },
      updateDocument: async (collectionName, docId, data) => {
        try { await window.db.collection(collectionName).doc(docId).update(Object.assign({}, data, { updatedAt: new Date() })); return { success: true }; } catch (error) { return { success: false, error: error.message }; }
      },
      deleteDocument: async (collectionName, docId) => {
        try { await window.db.collection(collectionName).doc(docId).delete(); return { success: true }; } catch (error) { return { success: false, error: error.message }; }
      },
      saveMatch: async (matchData) => { return await firestoreFunctions.addDocument('matches', matchData); },
      getUserMatches: async () => { const userId = authFunctions.getCurrentUser()?.uid; if (!userId) return { success: false, error: 'User not authenticated' }; return await firestoreFunctions.getDocuments('matches', userId); },
      saveRoster: async (rosterData) => { return await firestoreFunctions.addDocument('rosters', rosterData); },
      getUserRosters: async () => { const userId = authFunctions.getCurrentUser()?.uid; if (!userId) return { success: false, error: 'User not authenticated' }; return await firestoreFunctions.getDocuments('rosters', userId); }
    };
  }
  return {
    addDocument: async () => ({ success: false, error: 'Firebase non disponibile' }),
    getDocuments: async () => ({ success: false, error: 'Firebase non disponibile' }),
    updateDocument: async () => ({ success: false, error: 'Firebase non disponibile' }),
    deleteDocument: async () => ({ success: false, error: 'Firebase non disponibile' }),
    saveMatch: async () => ({ success: false, error: 'Firebase non disponibile' }),
    getUserMatches: async () => ({ success: false, error: 'Firebase non disponibile' }),
    saveRoster: async () => ({ success: false, error: 'Firebase non disponibile' }),
    getUserRosters: async () => ({ success: false, error: 'Firebase non disponibile' })
  };
})();

window.authFunctions = authFunctions;
window.firestoreFunctions = firestoreFunctions;
