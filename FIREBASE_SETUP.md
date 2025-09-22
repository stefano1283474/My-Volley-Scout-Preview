# Configurazione Firebase per Google Authentication

## Problema Identificato
L'errore "Errore durante l'autenticazione" con Google Auth è causato dal fatto che il dominio `localhost:3005` non è autorizzato nella configurazione Firebase.

## Soluzione: Configurare Domini Autorizzati

### Passo 1: Accedere alla Console Firebase
1. Vai su [Firebase Console](https://console.firebase.google.com/)
2. Seleziona il progetto `volley-data-studio`

### Passo 2: Configurare Authentication
1. Nel menu laterale, clicca su **Authentication**
2. Vai alla tab **Settings** (Impostazioni)
3. Scorri fino alla sezione **Authorized domains** (Domini autorizzati)

### Passo 3: Aggiungere Domini Locali
Aggiungi i seguenti domini alla lista:
- `localhost`
- `127.0.0.1`
- `localhost:3005`
- `127.0.0.1:3005`

### Passo 4: Salvare le Modifiche
1. Clicca **Add domain** per ogni dominio
2. Salva le modifiche

## Domini Attualmente Configurati
Verifica che questi domini siano presenti:
- `volley-data-studio.firebaseapp.com` (già presente)
- `volley-data-studio.web.app` (già presente)
- `localhost` (da aggiungere)
- `127.0.0.1` (da aggiungere)

## Test della Configurazione
Dopo aver aggiunto i domini:
1. Ricarica la pagina `http://127.0.0.1:3005/test-firebase.html`
2. Clicca "Test Google Auth"
3. Verifica che l'autenticazione funzioni

## Note Importanti
- Le modifiche ai domini autorizzati possono richiedere alcuni minuti per essere attive
- Assicurati di essere il proprietario del progetto Firebase
- In produzione, rimuovi i domini localhost per sicurezza

## Configurazione Alternativa (se non hai accesso alla console)
Se non hai accesso alla console Firebase, puoi:
1. Usare `firebase serve` invece di `http-server`
2. Configurare un dominio personalizzato
3. Contattare l'amministratore del progetto Firebase