# Istruzioni per il Deploy delle Regole di Sicurezza

Il corretto funzionamento del sistema di inviti (Shared Teams) dipende dall'aggiornamento delle regole di sicurezza di Firestore (Security Rules).

Se riscontri l'errore "Invito non trovato" o "Permesso negato", è molto probabile che le regole su Firebase siano obsolete e non permettano la lettura della sottocollezione `invites`.

## Come Aggiornare le Regole

Devi eseguire il deploy del file `firestore.rules` presente in questo repository.

### Metodo 1: Tramite Firebase Console (Web)

1. Vai su [Firebase Console](https://console.firebase.google.com/).
2. Seleziona il tuo progetto.
3. Nel menu laterale, vai su **Build** > **Firestore Database**.
4. Clicca sulla scheda **Regole** (Rules).
5. Copia interamente il contenuto del file `firestore.rules` che trovi nel codice sorgente locale.
6. Incolla il codice nell'editor della console Firebase.
7. Clicca su **Pubblica** (Publish).

### Metodo 2: Tramite Firebase CLI

Se hai la CLI di Firebase installata e configurata:

1. Apri il terminale nella root del progetto.
2. Esegui il comando:
   ```bash
   firebase deploy --only firestore:rules
   ```

## Verifica

Dopo aver pubblicato le regole, attendi fino a un minuto per la propagazione. Riprova quindi ad accettare l'invito tramite il link.
