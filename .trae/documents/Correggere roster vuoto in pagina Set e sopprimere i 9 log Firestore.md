## Diagnosi
- La griglia giocatori è renderizzata da `updatePlayersGrid()` in `app.js:1798–1950`. I giocatori sono estratti da `appState.currentRoster` e filtrati via `(p.number || p.name || p.surname)`. Se gli elementi del roster non hanno almeno uno di questi campi, vengono scartati e la griglia risulta vuota/solo placeholder.
- Il roster viene caricato quando si entra nello scouting:
  - `loadScoutingSession()` in `app.js:57–207` tenta: `window.teamsModule.getCurrentTeam().players` → fallback a `localStorage.selectedTeamId` e poi a `localStorage.volleyTeams` (`app.js:107–139`).
  - `initializeScoutingPage()` in `app.js:1429–1516` ha gli stessi fallback e si registra a `onTeamsUpdate`/`onTeamChange` per ripopolare la griglia.
- Flusso dati confermato:
  - Selezione squadra salva `localStorage.selectedTeamId` in `welcome.html:597–609` e il team è letto in `matches.html:587–621`.
  - La creazione partita salva `teamId` dentro `currentMatchSetup` in `match-setup.html:445–475` e poi `set-config.html` salva l’oggetto finale `currentScoutingSession` con `teamId` in `set-config.html:640–651`.
- Ipotesi più probabile: l’oggetto squadra in `localStorage.volleyTeams` contiene `players` come numero o un array con soli `nickname/role`, senza `number/name/surname`. In `welcome.html` il conteggio "14 giocatori" mostra il numero, ma la griglia li filtra e resta vuota.
- I 9 log provengono dalla SDK Firebase Firestore compat (stream Write/`channel`) con `net::ERR_ABORTED`, tipici di rete/emulatore assente o firewall. La nostra app usa Firestore in salvataggi best‑effort (`app.js:1172–1180`) e inizializza Firestore in `firebase-config.js:15–44`.

## Piano di intervento
1) Robustire il caricamento del roster
- In `app.js` aggiungere un ulteriore fallback: se il team selezionato non ha `players` come array valido, cercare un roster omonimo in `localStorage.savedRosters` e usarne `players`.
- Replicare lo stesso fallback in `initializeScoutingPage()` (`app.js:1466–1485`) per popolare subito la griglia.
- Lasciare il filtro di `updatePlayersGrid()` per garantire che ogni giocatore abbia almeno `number` o `name/surname`. Se alcuni roster hanno solo `nickname`, normalizzare a runtime: quando `nickname` esiste ma `name/surname` mancano, valorizzare `name` con `nickname` e richiedere `number` (la logica di quartine usa il numero).

2) Migrare/normalizzare i dati locali (non distruttivo)
- All’avvio (`initializeApp()` in `app.js:787–857`), se una squadra in `volleyTeams` ha `players` non‑array, tentare di sostituirla con i `players` del corrispondente item in `savedRosters` (match per `team.name`). Persistenza in `localStorage.volleyTeams` solo se trovato un roster valido.

3) Sopprimere i log Firestore in locale
- In `firebase-config.js`:
  - Rilevare ambiente locale: `const isLocal = location.hostname === 'localhost';`
  - Se `isLocal`, impostare `firebase.firestore.setLogLevel('error')` e `db.settings({ experimentalAutoDetectLongPolling: true, cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED, ignoreUndefinedProperties: true })` per evitare i canali `Write/channel` che generano abort.
  - Facoltativo: in ambiente locale, rendere i metodi di `firestoreFunctions` no‑op a meno che l’utente sia autenticato e `navigator.onLine` sia vero; i salvataggi locali rimangono attivi (`app.js:1164–1170`).

4) Verifica end‑to‑end
- Selezionare una squadra con giocatori validi (presenza di `number` e `name/surname`): la griglia deve popolarsi (`index.html:275`, `app.js:197–201`).
- Avviare lo scouting da `set-config.html`: controllare che `currentScoutingSession.teamId` coincida con `selectedTeamId` (guard in `index.html:1600–1626`).
- Eseguire un paio di azioni: verificare che `actionsLog` e `scoreHistory` si aggiornino e che il salvataggio locale funzioni (`app.js:1164–1170`).
- In locale, controllare che i 9 log Firestore non compaiano più.

## Deliverables
- Modifiche puntuali in `app.js` per i fallback e la migrazione non distruttiva.
- Aggiornamento `firebase-config.js` con log level e long polling in locale.
- Nessuna modifica al data model a runtime oltre alla normalizzazione minima; nessun impatto su flussi esistenti.

Confermi che procedo con le modifiche proposte?