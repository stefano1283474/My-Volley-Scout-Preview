## Problemi individuati
- La voce “El. gioc.” nella sidebar non apre la pagina elenco giocatori: il bottone punta a `switchPage('scouting')` e tenta solo lo scroll alla griglia (`index.html`:246), non naviga a una pagina dedicata.
- La pagina `match-roster.html` non legge il roster importato dalla sessione (`currentScoutingSession.roster` o `importedRoster`) ma cerca CSV o `currentMatchSetup`, quindi l’elenco risulta vuoto post‑import.

## Interventi mirati
- Navigazione:
  - Modificare il bottone “El. gioc.” in `index.html` per aprire `match-roster.html` con `location.href='match-roster.html'` oppure introdurre un `switchPage('roster')` se si desidera restare in `index.html`. Opzione più semplice: link diretto.
- Caricamento roster in `match-roster.html`:
  - Prima di tentare CSV, leggere da `localStorage` le chiavi usate in import: `currentScoutingSession.roster` e fallback `importedRoster`. Se presenti, renderizzare immediatamente l’elenco.
  - Impostare il `rosterNameInput` con `myTeam/teamName` dalla sessione.
- Coerenza stato:
  - Nessuna modifica all’import: già salva `sessionData.roster` e `importedRoster` (index.html:1299–1305, 1494). Assicurarsi solo che la pagina `match-roster.html` li consumi.

## Dettagli implementativi
- `index.html`:
  - Sostituire l’onclick del bottone a riga 246 da `switchPage('scouting')` + scroll a `location.href='match-roster.html'` per aprire la pagina elenco giocatori.
- `match-roster.html`:
  - In `DOMContentLoaded` (riga 147), aggiungere:
    - Lettura `const sess = JSON.parse(localStorage.getItem('currentScoutingSession')||'{}')`.
    - Se `Array.isArray(sess.roster) && sess.roster.length`, impostare `currentRoster = sess.roster` e chiamare `renderRosterList()` (o funzione di rendering già presente), saltando la ricerca CSV.
    - Fallback: se non presente, leggere `importedRoster`.
    - Impostare `rosterNameInput.value` da `sess.myTeam || sess.teamName` se disponibile.

## Verifica
- Flusso: Import da XLS → torna a `matches.html` → apri set → sidebar “El. gioc.” → apre `match-roster.html` → elenco popolato dai dati importati.
- Controllo: la griglia `players-grid` in `index.html` continua a funzionare poiché `loadScoutingSession` imposta `appState.currentRoster` (app.js:107–157) e `updatePlayersGrid()` viene chiamato (app.js:216).

Confermi e applico le correzioni?