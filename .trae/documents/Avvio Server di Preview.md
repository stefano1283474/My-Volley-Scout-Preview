## Obiettivo
Avviare un server HTTP locale nella cartella `c:\Users\STEFANO\Desktop\My-Volley-Scout` e aprire l’anteprima su `http://localhost:5501/matches`.

## Passi
1. Verifica prerequisiti
- Node.js disponibile in PATH
- Directory di lavoro corretta: `c:\Users\STEFANO\Desktop\My-Volley-Scout`

2. Avvio server statico
- Avvia un terminale nella cartella del progetto
- Esegui: `npx serve -p 5501`
- Se la porta è occupata, usa: `npx serve -p 3001`

3. Apertura preview
- Apri `http://localhost:5501/matches` (o `http://localhost:3001/matches` se fallback)
- Per scouting: `http://localhost:5501/index.html#/set/1`

4. Verifica
- La pagina non deve mostrare “Service is unavailable”
- Controlla console del terminale per conferma dell’avvio e dei percorsi serviti

5. Troubleshooting
- Se `npx` non è disponibile: `npm install -g serve` e poi `serve -p 5501`
- Se i file non si caricano, conferma la root corretta e che gli URL puntino ai file presenti (es. `matches.html`, `index.html`)