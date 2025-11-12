// Firebase SDK viene caricato tramite CDN nel file HTML
// Utilizziamo le funzioni globali di Firebase

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyADkMksRlaVVcsLIhV2XucfEt5Y-ELzUMA",
  authDomain: "volley-data-studio.firebaseapp.com",
  projectId: "volley-data-studio",
  storageBucket: "volley-data-studio.firebasestorage.app",
  messagingSenderId: "55271933225",
  appId: "1:55271933225:web:0b6135017431be3783e338",
  measurementId: "G-GFHR0LSQPR"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);

// Analytics disabilitato temporaneamente per evitare errori
let analytics = null;
console.log('Analytics disabilitato per migliorare le performance');

const auth = firebase.auth();
const db = firebase.firestore();
const isLocal = (typeof location !== 'undefined') && (location.hostname === 'localhost');
if (isLocal && firebase && firebase.firestore && typeof firebase.firestore.setLogLevel === 'function') {
  firebase.firestore.setLogLevel('error');
}
const googleProvider = new firebase.auth.GoogleAuthProvider();
// Configura il provider Google per funzionare in locale
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Configure Firestore settings to reduce connection errors
db.settings(Object.assign({
  cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
  ignoreUndefinedProperties: true
}, isLocal ? { experimentalAutoDetectLongPolling: true } : {}));

// Enable offline persistence
db.enablePersistence({ synchronizeTabs: true })
  .catch((err) => {
    if (err.code == 'failed-precondition') {
      console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
    } else if (err.code == 'unimplemented') {
      console.warn('The current browser does not support all of the features required to enable persistence');
    }
  });

// Authentication functions
const authFunctions = {
  // Sign up with email and password
  signUp: async (email, password) => {
    try {
      const userCredential = await auth.createUserWithEmailAndPassword(email, password);
      return { success: true, user: userCredential.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Sign in with email and password
  signIn: async (email, password) => {
    try {
      const userCredential = await auth.signInWithEmailAndPassword(email, password);
      return { success: true, user: userCredential.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Sign in with Google
  signInWithGoogle: async () => {
    try {
      console.log('Tentativo di login con Google...');
      const result = await auth.signInWithPopup(googleProvider);
      console.log('Login Google riuscito:', result.user.email);
      return { success: true, user: result.user };
    } catch (error) {
      console.error('Errore login Google:', error.code, error.message);
      return { success: false, error: error.message, code: error.code };
    }
  },

  // Sign out
  signOut: async () => {
    try {
      await auth.signOut();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get current user
  getCurrentUser: () => {
    return auth.currentUser;
  },

  // Listen to auth state changes
  onAuthStateChanged: (callback) => {
    return auth.onAuthStateChanged(callback);
  }
};

// Firestore functions
const firestoreFunctions = {
  // Add a new document
  addDocument: async (collectionName, data) => {
    try {
      const docRef = await db.collection(collectionName).add({
        ...data,
        createdAt: new Date(),
        userId: auth.currentUser?.uid
      });
      return { success: true, id: docRef.id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get all documents from a collection
  getDocuments: async (collectionName, userId = null) => {
    try {
      let query;
      if (userId) {
        query = db.collection(collectionName)
          .where("userId", "==", userId)
          .orderBy("createdAt", "desc");
      } else {
        query = db.collection(collectionName)
          .orderBy("createdAt", "desc");
      }
      const querySnapshot = await query.get();
      const documents = [];
      querySnapshot.forEach((doc) => {
        documents.push({ id: doc.id, ...doc.data() });
      });
      return { success: true, documents };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Update a document
  updateDocument: async (collectionName, docId, data) => {
    try {
      await db.collection(collectionName).doc(docId).update({
        ...data,
        updatedAt: new Date()
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Delete a document
  deleteDocument: async (collectionName, docId) => {
    try {
      await db.collection(collectionName).doc(docId).delete();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Save match data
  saveMatch: async (matchData) => {
    return await firestoreFunctions.addDocument('matches', matchData);
  },

  // Get user matches
  getUserMatches: async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      return { success: false, error: 'User not authenticated' };
    }
    return await firestoreFunctions.getDocuments('matches', userId);
  },

  // Save roster data
  saveRoster: async (rosterData) => {
    return await firestoreFunctions.addDocument('rosters', rosterData);
  },

  // Get user rosters
  getUserRosters: async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      return { success: false, error: 'User not authenticated' };
    }
    return await firestoreFunctions.getDocuments('rosters', userId);
  }
};

// Esponi le funzioni globalmente
window.authFunctions = authFunctions;
window.firestoreFunctions = firestoreFunctions;
window.app = app;
window.auth = auth;
window.db = db;
window.analytics = analytics;
