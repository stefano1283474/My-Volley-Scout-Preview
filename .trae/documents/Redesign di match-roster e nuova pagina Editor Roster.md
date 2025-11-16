## Obiettivo
- Rendere l’elenco roster più semplice: nome + cestino; click seleziona il roster; pressione prolungata apre menu con Modifica, Proprietà, Esporta.
- Spostare l’editor in una nuova pagina `edit-roster.html`, identica all’attuale editor.
- Mostrare correttamente il roster importato da partita.

## Modifiche
- `match-roster.html`
  - Rende la lista con soli elementi: label cliccabile e pulsante elimina.
  - Click sulla label: seleziona il roster e passa a `set-config.html` aggiornando `currentMatchSetup`, `currentScoutingSession.roster` e la voce in `volleyMatches`.
  - Pressione prolungata sulla label (mousedown/touchstart ≥500ms): apre un menu contestuale con:
    - Modifica: `location.href='edit-roster.html?id=saved_<idx>'`.
    - Proprietà: mostra un popup con origine (app/import), file di origine `sessionData.fileName`, data e numero giocatori.
    - Esporta: CSV come già previsto.
  - Elimina: rimuove dalla lista `savedRosters`.
  - Mantiene compatibilità con formato esistente di `savedRosters` (`label`/`name`, `roster`/`players`); aggiunge metadati quando disponibili.
- `edit-roster.html`
  - Nuova pagina con editor identico all’attuale (campi, righe, aggiungi/rimuovi, import CSV, salva).
  - Carica l’elemento da `savedRosters` via query `id`, salva aggiornamenti e torna a `match-roster.html`.

## Dati e metadati
- Proprietà roster:
  - `origin`: ‘import’ se deriva da `currentScoutingSession.roster`, altrimenti ‘app’.
  - `sourceFile`: `currentScoutingSession.fileName` se presente.
  - `date`: da voce `savedRosters` o `new Date().toISOString()`.
  - `playersCount`: lunghezza array.

## Verifica
- Import XLS → “El. gioc.” → lista mostra il roster importato; click seleziona; long‑press apre menu; Modifica apre editor, Proprietà mostra dettagli, Esporta scarica CSV.

Procedo con l’implementazione.