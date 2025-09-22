# 🔧 Soluzione per Errore Google Authentication

## 📋 Problema Identificato
L'errore "Errore durante l'autenticazione" con Google Auth è causato dal fatto che i domini localhost non sono autorizzati nella configurazione Firebase del progetto.

## ✅ Soluzioni Disponibili

### Soluzione 1: Configurare Domini Autorizzati (RACCOMANDATO)

#### Passo 1: Accesso alla Console Firebase
1. Vai su [Firebase Console](https://console.firebase.google.com/)
2. Seleziona il progetto **volley-data-studio**
3. Assicurati di avere i permessi di amministratore

#### Passo 2: Configurare Authentication
1. Menu laterale → **Authentication**
2. Tab **Settings** (Impostazioni)
3. Sezione **Authorized domains** (Domini autorizzati)

#### Passo 3: Aggiungere Domini Locali
Aggiungi questi domini:
```
localhost
127.0.0.1
localhost:3005
localhost:5000
127.0.0.1:3005
127.0.0.1:5000
```

#### Passo 4: Salvare e Attendere
- Clicca **Add domain** per ogni dominio
- Salva le modifiche
- Attendi 2-5 minuti per la propagazione

### Soluzione 2: Usare Firebase Hosting (ALTERNATIVA)

#### Configurazione Firebase CLI
```bash
# 1. Login a Firebase
firebase login

# 2. Inizializzare il progetto
firebase init hosting

# 3. Selezionare il progetto volley-data-studio
# 4. Configurare la cartella pubblica come "."
# 5. Non configurare come SPA

# 6. Avviare il server locale
firebase serve --port 5000
```

### Soluzione 3: Usare un Tunnel (TEMPORANEA)

#### Con ngrok (se installato)
```bash
# Installare ngrok se necessario
npm install -g ngrok

# Creare tunnel per porta 5000
ngrok http 5000

# Aggiungere l'URL ngrok ai domini autorizzati
```

## 🧪 Test della Configurazione

### Test Automatico
1. Apri: `http://127.0.0.1:5000/test-firebase.html`
2. Clicca "Test Google Auth"
3. Controlla i log nella pagina

### Test Manuale
1. Apri: `http://127.0.0.1:5000/auth-login.html`
2. Clicca "Continua con Google"
3. Verifica che si apra il popup di Google

## 🔍 Diagnostica Errori

### Errori Comuni e Soluzioni

| Errore | Causa | Soluzione |
|--------|-------|----------|
| `auth/unauthorized-domain` | Dominio non autorizzato | Aggiungere dominio alla console |
| `auth/popup-closed-by-user` | Utente ha chiuso popup | Riprovare |
| `auth/network-request-failed` | Problema di rete | Controllare connessione |
| `auth/invalid-api-key` | Chiave API errata | Verificare firebase-config.js |

### Console Browser (F12)
Controlla la console per errori dettagliati:
```javascript
// Dovrebbe mostrare:
// "Tentativo di login con Google..."
// Seguito da successo o errore specifico
```

## 📝 Note Importanti

### Sicurezza
- In produzione, rimuovi i domini localhost
- Usa solo domini HTTPS in produzione
- Non condividere le chiavi API

### Configurazione Attuale
- **Project ID**: volley-data-studio
- **Auth Domain**: volley-data-studio.firebaseapp.com
- **API Key**: AIzaSyADkMksRlaVVcsLIhV2XucfEt5Y-ELzUMA

### Domini Già Autorizzati
- volley-data-studio.firebaseapp.com
- volley-data-studio.web.app

## 🆘 Se Nulla Funziona

1. **Verifica Permessi**: Assicurati di essere owner/editor del progetto Firebase
2. **Contatta Amministratore**: Se non hai accesso alla console
3. **Crea Nuovo Progetto**: Come ultima risorsa
4. **Usa Email/Password**: Funziona sempre, Google Auth è opzionale

## 📞 Supporto
Se il problema persiste dopo aver seguito questi passaggi, fornisci:
- Screenshot della console Firebase (domini autorizzati)
- Screenshot della console browser (F12)
- Messaggio di errore esatto