console.log('app.js loaded');

// Stato globale dell'applicazione
const appState = {
    currentPage: 'match-data',
    currentMatch: null,
    currentRoster: [],
    currentSet: 1,
    currentRotation: 'P1',
    currentPhase: 'servizio',
    homeScore: 0,
    awayScore: 0,
    actionsLog: [],
    currentSequence: [],
    setStarted: false
};

// Rotazioni in sequenza
const rotationSequence = ['P1', 'P6', 'P5', 'P4', 'P3', 'P2'];

// Inizializzazione dell'app
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded');
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js')
                .then(reg => console.log('Service Worker registered:', reg.scope))
                .catch(err => console.warn('Service Worker registration failed:', err));
        });
    }
    initializeApp();
    loadStoredData();
    console.log('initializeApp called');
});

function initializeApp() {
    console.log('initializeApp started');
    // Gestione navigazione
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.dataset.page;
            switchPage(page);
        });
    });

    // Inizializza pagine
    initializeMatchDataPage();
    initializeRosterPage();
    initializeScoutingPage();

    // Adatta la pagina alla viewport all'avvio e su resize
    requestAnimationFrame(fitActivePageToViewport);
    window.addEventListener('resize', fitActivePageToViewport);
    console.log('initializeApp completed');
}

function switchPage(pageId) {
    // Aggiorna stato
    appState.currentPage = pageId;
    
    // Aggiorna UI
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(pageId === 'roster' ? 'roster' : pageId).classList.add('active');
    document.querySelector(`[data-page="${pageId}"]`).classList.add('active');
    
    // Inizializza la pagina specifica se necessario
    if (pageId === 'match-data') {
        initializeMatchDataPage();
    } else if (pageId === 'scouting') {
        updateMatchInfo();
        // Non aprire il dialog qui; verrà aperto solo dopo l'avvio del set
        const dlg = document.getElementById('scouting-dialog');
        if (dlg && dlg.open) dlg.close();
    }

    // Adatta layout alla viewport dopo il cambio pagina
    fitActivePageToViewport();
}

// === MATCH DATA PAGE ===
function initializeMatchDataPage() {
    console.log('Initializing Match Data Page');
    const form = document.getElementById('new-match-form');
    if (form && !form.hasAttribute('data-initialized')) {
        form.addEventListener('submit', handleNewMatch);
        form.setAttribute('data-initialized', 'true');
    }
    
    loadMatchesList();

    // Gestione nuovi pulsanti
    const newMatchBtn = document.getElementById('new-match-btn');
    const loadMatchesBtn = document.getElementById('load-matches-btn');
    const newMatchSection = document.getElementById('new-match-section');
    const matchesListSection = document.getElementById('matches-list-section');

    console.log('newMatchBtn:', newMatchBtn);
    console.log('loadMatchesBtn:', loadMatchesBtn);
    console.log('newMatchSection:', newMatchSection);
    console.log('matchesListSection:', matchesListSection);

    if (newMatchBtn && loadMatchesBtn && newMatchSection && matchesListSection) {
        newMatchBtn.addEventListener('click', () => {
    console.log('New Match button clicked');
    newMatchSection.style.display = 'block';
    matchesListSection.style.display = 'none';
 });

            loadMatchesBtn.addEventListener('click', () => {
    console.log('Load Matches button clicked');
    newMatchSection.style.display = 'none';
    matchesListSection.style.display = 'block';
    loadMatchesList(); // Refresh lista
 });
            console.log('Listeners added to buttons');
            console.log('Button listeners successfully added');

            // Mostra di default la sezione "Nuova Partita"
            newMatchSection.style.display = 'block';
            matchesListSection.style.display = 'none';
        } else {
            console.log('Some elements not found');
        }
    }


function handleNewMatch(e) {
    e.preventDefault();
    
    const myTeamEl = document.getElementById('my-team');
    const opponentTeamEl = document.getElementById('opponent-team');
    const homeAwayEl = document.getElementById('home-away');
    const matchTypeEl = document.getElementById('match-type');
    
    if (!myTeamEl || !opponentTeamEl || !homeAwayEl || !matchTypeEl) {
        console.error('Uno o più elementi del form non sono stati trovati');
        return;
    }
    
    console.log('myTeamEl:', myTeamEl);
    console.log('opponentTeamEl:', opponentTeamEl);
    console.log('homeAwayEl:', homeAwayEl);
    console.log('matchTypeEl:', matchTypeEl);
    const myTeam = myTeamEl ? myTeamEl.value : '';
    const opponentTeam = opponentTeamEl ? opponentTeamEl.value : '';
    const homeAway = homeAwayEl ? homeAwayEl.value : '';
    const matchType = matchTypeEl ? matchTypeEl.value : '';
    
    // Determina quale squadra gioca in casa e quale in trasferta
    const homeTeam = homeAway === 'home' ? myTeam : opponentTeam;
    const awayTeam = homeAway === 'home' ? opponentTeam : myTeam;
    
    const match = {
        id: Date.now(),
        homeTeam,
        awayTeam,
        myTeam,
        opponentTeam,
        homeAway,
        matchType,
        date: new Date().toLocaleDateString('it-IT'),
        sets: [],
        completed: false
    };
    
    // Salva partita
    saveMatch(match);
    
    // Carica partita corrente
    appState.currentMatch = match;
    
    // Aggiorna le informazioni della partita se siamo nella pagina di scouting
    if (appState.currentPage === 'scouting') {
        updateMatchInfo();
    }
    
    // Aggiorna UI
    loadMatchesList();
    e.target.reset();
    
    alert(`Partita creata: ${homeTeam} vs ${awayTeam}\nIl tuo team: ${myTeam} (${homeAway === 'home' ? 'Casa' : 'Trasferta'})`);
}

function saveMatch(match) {
    const matches = getStoredMatches();
    const existingIndex = matches.findIndex(m => m.id === match.id);
    
    if (existingIndex >= 0) {
        matches[existingIndex] = match;
    } else {
        matches.push(match);
    }
    
    localStorage.setItem('volleyMatches', JSON.stringify(matches));
}

function getStoredMatches() {
    const stored = localStorage.getItem('volleyMatches');
    return stored ? JSON.parse(stored) : [];
}

function loadMatchesList() {
    const matches = getStoredMatches();
    const container = document.getElementById('matches-list');
    
    // Verifica se l'elemento esiste prima di modificarlo
    if (!container) {
        return;
    }
    
    if (matches.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666;">Nessuna partita salvata</p>';
        return;
    }
    
    container.innerHTML = matches.map(match => {
        // manteniamo compatibilità con eventuali vecchi campi
        const myTeam = match.myTeam || 'Team non specificato';
        const homeAway = match.homeAway; // non visualizzato nelle 4 righe richieste
        const matchType = match.matchType || '-';
        const matchDate = match.date || '-';
        
        return `
            <div class="match-item">
                <div class="match-title">${match.homeTeam} vs ${match.awayTeam}</div>
                <div class="match-details">${matchType}</div>
                <div class="match-details">${matchDate}</div>
                <div class="match-actions">
                    <button class="btn btn-primary" onclick="loadMatch(${match.id})">Carica</button>
                    <button class="btn btn-danger" onclick="deleteMatch(${match.id})">Elimina</button>
                </div>
            </div>
        `;
    }).join('');
}

function loadMatch(matchId) {
    const matches = getStoredMatches();
    const match = matches.find(m => m.id === matchId);
    
    if (match) {
        appState.currentMatch = match;
        
        // Aggiorna le informazioni della partita se siamo nella pagina di scouting
        if (appState.currentPage === 'scouting') {
            updateMatchInfo();
        }
        
        alert(`Partita caricata: ${match.homeTeam} vs ${match.awayTeam}`);
    }
}

function deleteMatch(matchId) {
    if (confirm('Sei sicuro di voler eliminare questa partita?')) {
        const matches = getStoredMatches();
        const filtered = matches.filter(m => m.id !== matchId);
        localStorage.setItem('volleyMatches', JSON.stringify(filtered));
        loadMatchesList();
    }
}

// === ROSTER PAGE ===
function initializeRosterPage() {
    const btnCreate = document.getElementById('btn-create-roster');
    const btnList = document.getElementById('btn-list-rosters');
    const btnLoad = document.getElementById('btn-load-roster');
    const savedSection = document.querySelector('#roster .section:nth-of-type(1)');

    // Nuovi controlli Import nella lista esterna
    const importListBtn = document.getElementById('import-roster-list-btn');
    const importListFile = document.getElementById('import-roster-list-file');

    // Carica elenco al primo accesso
    loadRostersList();

    if (btnCreate && !btnCreate.dataset.bound) {
        btnCreate.addEventListener('click', () => {
            // Reset stato corrente e prepara dialog
            appState.currentRoster = [];
            const nameInput = document.getElementById('roster-name-dialog');
            if (nameInput) nameInput.value = '';
            generateRosterFormIn('roster-form-dialog');
            setLoadRosterEnabled(false);
            openDialog('roster-dialog');

            const btnSave = document.getElementById('save-roster-dialog');
            const btnClear = document.getElementById('clear-roster-dialog');
            if (btnSave && !btnSave.dataset.bound) {
                btnSave.addEventListener('click', saveCurrentRosterFromDialog);
                btnSave.dataset.bound = '1';
            }
            if (btnClear && !btnClear.dataset.bound) {
                btnClear.addEventListener('click', () => clearRosterIn('roster-form-dialog'));
                btnClear.dataset.bound = '1';
            }
            const btnImport = document.getElementById('import-roster-dialog');
            const btnExport = document.getElementById('export-roster-dialog');
            const fileInput = document.getElementById('import-roster-file');
            if (btnImport && !btnImport.dataset.bound) {
                btnImport.addEventListener('click', () => fileInput && fileInput.click());
                btnImport.dataset.bound = '1';
            }
            if (fileInput && !fileInput.dataset.bound) {
                fileInput.addEventListener('change', (e) => importRosterFromFile(e.target.files && e.target.files[0]));
                fileInput.dataset.bound = '1';
            }
            if (btnExport && !btnExport.dataset.bound) {
                btnExport.addEventListener('click', exportCurrentRosterToFile);
                btnExport.dataset.bound = '1';
            }
        });
        btnCreate.dataset.bound = '1';
    }

    if (btnList && !btnList.dataset.bound) {
        btnList.addEventListener('click', () => {
            loadRostersList();
            if (savedSection) savedSection.scrollIntoView({behavior: 'smooth', block: 'start'});
        });
        btnList.dataset.bound = '1';
    }

    if (btnLoad && !btnLoad.dataset.bound) {
        btnLoad.addEventListener('click', () => {
            updatePlayersGrid();
            alert('Roster caricato per lo scouting. Vai alla scheda "Start-Scouting" per iniziare.');
        });
        btnLoad.dataset.bound = '1';
    }

    // Bind import esterno (fuori dialog)
    if (importListBtn && !importListBtn.dataset.bound) {
        importListBtn.addEventListener('click', () => importListFile && importListFile.click());
        importListBtn.dataset.bound = '1';
    }
    if (importListFile && !importListFile.dataset.bound) {
        importListFile.addEventListener('change', (e) => importRosterFromListFile(e.target.files && e.target.files[0]));
        importListFile.dataset.bound = '1';
    }
}

function generateRosterFormIn(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const roles = ['Palleggiatore', 'Opposto', 'Schiacciatore', 'Centrale', 'Libero'];

    let html = '<div class="player-row player-header" style="font-weight: bold; background: #e3f2fd;">';
    html += '<div>N°</div><div>Nome</div><div>Cognome</div><div>Ruolo</div><div>Soprannome</div><div></div>';
    html += '</div>';

    for (let i = 0; i < 16; i++) {
        html += `
            <div class="player-row">
                <input type="number" placeholder="N°" min="1" max="99" data-field="number" data-index="${i}">
                <input type="text" placeholder="Nome" data-field="name" data-index="${i}">
                <input type="text" placeholder="Cognome" data-field="surname" data-index="${i}">
                <select data-field="role" data-index="${i}">
                    <option value="">Seleziona...</option>
                    ${roles.map(role => `<option value="${role}">${role}</option>`).join('')}
                </select>
                <input type="text" placeholder="Soprannome" data-field="nickname" data-index="${i}">
                <button type="button" class="btn btn-danger" onclick="clearPlayerIn(${i}, '${containerId}')" style="padding: 0.3rem;">×</button>
            </div>
        `;
    }

    container.innerHTML = html;

    // Event listeners per aggiornare lo stato del roster dal container
    container.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('input', () => updateRosterStateFrom(containerId));
    });
}

function updateRosterStateFrom(containerId) {
    const root = document.getElementById(containerId);
    if (!root) return;

    const players = [];
    for (let i = 0; i < 16; i++) {
        const number = (root.querySelector(`[data-field="number"][data-index="${i}"]`) || {}).value || '';
        const name = (root.querySelector(`[data-field="name"][data-index="${i}"]`) || {}).value || '';
        const surname = (root.querySelector(`[data-field="surname"][data-index="${i}"]`) || {}).value || '';
        const role = (root.querySelector(`[data-field="role"][data-index="${i}"]`) || {}).value || '';
        const nickname = (root.querySelector(`[data-field="nickname"][data-index="${i}"]`) || {}).value || '';
        if (number || name || surname || role || nickname) {
            players[i] = { number, name, surname, role, nickname };
        }
    }
    appState.currentRoster = players;
}

function clearPlayerIn(index, containerId) {
    const root = document.getElementById(containerId);
    if (!root) return;
    const q = sel => root.querySelector(sel);
    const f = field => q(`[data-field="${field}"][data-index="${index}"]`);
    ['number','name','surname','role','nickname'].forEach(key => { const el = f(key); if (el) el.value = ''; });
    updateRosterStateFrom(containerId);
}

function clearRosterIn(containerId) {
    for (let i = 0; i < 16; i++) clearPlayerIn(i, containerId);
    const nameInput = document.getElementById('roster-name-dialog');
    if (nameInput) nameInput.value = '';
}

function saveCurrentRosterFromDialog() {
    const rosterName = (document.getElementById('roster-name-dialog') || {}).value?.trim();
    if (!rosterName) { alert('Inserisci un nome per il roster'); return; }

    // Assicurati che lo stato sia aggiornato
    updateRosterStateFrom('roster-form-dialog');

    const validPlayers = (appState.currentRoster || []).filter(p => p && (p.number || p.name || p.surname));
    if (validPlayers.length === 0) { alert('Inserisci almeno un giocatore'); return; }

    const roster = {
        id: Date.now(),
        name: rosterName,
        players: appState.currentRoster,
        date: new Date().toLocaleDateString('it-IT')
    };

    saveRoster(roster);
    loadRostersList();
    setLoadRosterEnabled(true);
    closeDialog('roster-dialog');
    alert(`Roster "${rosterName}" salvato con successo!`);
}

function saveRoster(roster) {
    const rosters = getStoredRosters();
    const existingIndex = rosters.findIndex(r => r.id === roster.id);
    
    if (existingIndex >= 0) {
        rosters[existingIndex] = roster;
    } else {
        rosters.push(roster);
    }
    
    localStorage.setItem('volleyRosters', JSON.stringify(rosters));
}

function getStoredRosters() {
    const stored = localStorage.getItem('volleyRosters');
    return stored ? JSON.parse(stored) : [];
}

function loadRostersList() {
    const rosters = getStoredRosters();
    const container = document.getElementById('saved-rosters');
    
    if (rosters.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666;">Nessun roster salvato</p>';
        return;
    }
    
    container.innerHTML = rosters.map(roster => {
        const playerCount = roster.players.filter(p => p && (p.number || p.name || p.surname)).length;
        return `
            <div class="roster-item">
                <div class="roster-info">
                    <div class="roster-title">${roster.name}</div>
                    <div class="roster-details">${playerCount} giocatori - ${roster.date}</div>
                </div>
                <div class="roster-actions">
                    <button class="btn btn-secondary" onclick="exportRoster(${roster.id})">Esporta</button>
                    <button class="btn btn-primary" onclick="loadRoster(${roster.id})">Carica</button>
                    <button class="btn btn-danger" onclick="deleteRoster(${roster.id})">Elimina</button>
                </div>
            </div>
        `;
    }).join('');
}

function loadRoster(rosterId) {
    const rosters = getStoredRosters();
    const roster = rosters.find(r => r.id === rosterId);
    
    if (roster) {
        appState.currentRoster = roster.players;
        const nameInput = document.getElementById('roster-name');
        if (nameInput) nameInput.value = roster.name; // se presente nel vecchio form
        
        // Popola il form classico se esiste
        for (let i = 0; i < 16; i++) {
            const player = roster.players[i] || {};
            const n = document.querySelector(`[data-field="number"][data-index="${i}"]`); if (n) n.value = player.number || '';
            const na = document.querySelector(`[data-field="name"][data-index="${i}"]`); if (na) na.value = player.name || '';
            const su = document.querySelector(`[data-field="surname"][data-index="${i}"]`); if (su) su.value = player.surname || '';
            const ro = document.querySelector(`[data-field="role"][data-index="${i}"]`); if (ro) ro.value = player.role || '';
            const ni = document.querySelector(`[data-field="nickname"][data-index="${i}"]`); if (ni) ni.value = player.nickname || '';
        }
        
        setLoadRosterEnabled(true);
        alert(`Roster "${roster.name}" caricato con successo!`);
    }
}

function deleteRoster(rosterId) {
    if (confirm('Sei sicuro di voler eliminare questo roster?')) {
        const rosters = getStoredRosters();
        const filtered = rosters.filter(r => r.id !== rosterId);
        localStorage.setItem('volleyRosters', JSON.stringify(filtered));
        loadRostersList();
    }
}

// Esporta un roster dalla lista esterna
function exportRoster(rosterId) {
    const rosters = getStoredRosters();
    const roster = rosters.find(r => r.id === rosterId);
    if (!roster) { alert('Roster non trovato'); return; }
    const payload = {
        name: roster.name || 'Roster',
        players: roster.players || [],
        exportedAt: new Date().toISOString(),
        format: 'my-volley-scout.roster.v1'
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (roster.name || 'Roster').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60) || 'Roster';
    a.download = `${safeName}.roster.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}

// Importa un file JSON direttamente nella lista salvata (fuori dialog)
function importRosterFromListFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            if (!data || !Array.isArray(data.players)) throw new Error('Formato non valido');
            const roster = {
                id: Date.now(),
                name: (data.name || 'Roster importato').toString(),
                players: data.players,
                date: new Date().toLocaleDateString('it-IT')
            };
            saveRoster(roster);
            loadRostersList();
            // imposta come roster corrente per abilitarne l'uso rapido
            appState.currentRoster = data.players;
            setLoadRosterEnabled(true);
            alert(`Roster "${roster.name}" importato nella lista`);
        } catch (e) {
            console.error(e);
            alert('Impossibile importare: il file non è un JSON roster valido.');
        }
    };
    reader.onerror = () => alert('Errore lettura file.');
    reader.readAsText(file, 'utf-8');
}
function updateCurrentPhaseDisplay() {
    const phaseElement = document.getElementById('current-phase');
    if (phaseElement) {
        phaseElement.textContent = appState.currentPhase.toUpperCase();
    }
}

function predictNextFundamental() {
    // Predice il prossimo fondamentale basato sulla fase di gioco e azioni precedenti
    const currentActionLogs = getCurrentActionLogs();
    if (currentActionLogs.length > 0) {
        const lastLog = currentActionLogs[currentActionLogs.length - 1];
        const lastFund = lastLog.action.charAt(2);
        const lastEval = parseInt(lastLog.action.charAt(3));
        if (lastFund === 'd') {
            if (lastEval === 2) {
                return 'd';
            } else if (lastEval >= 3 && lastEval <= 5) {
                return 'a';
            }
        } else if (lastFund === 'r') {
            if (lastEval === 2) {
                return 'd';
            } else if (lastEval >= 3 && lastEval <= 5) {
                return 'a';
            }
        } else if (lastFund === 'a') {
            if (lastEval !== 1 && lastEval !== 5) {
                return 'd';
            }
        } else if (lastFund === 'b') {
            if (lastEval !== 1 && lastEval !== 5) {
                return 'd';
            }
        }
    }
    // Se non c'è sequenza corrente, predici basato sulla fase
    if (appState.currentPhase === 'servizio') {
        return 'b';
    } else if (appState.currentPhase === 'ricezione') {
        return 'r';
    }
    return 'a'; // Default
}

function getCurrentActionLogs() {
    if (appState.currentSequence.length > 0) {
        return appState.currentSequence.map(s => ({action: s.quartet}));
    }
    
    const logs = appState.actionsLog;
    const currentSequence = [];
    
    for (let i = logs.length - 1; i >= 0; i--) {
        const log = logs[i];
        currentSequence.unshift(log);
        
        if (log.result.result === 'home_point' || log.result.result === 'away_point') {
            break;
        }
    }
    
    return currentSequence;
}

function updateNextFundamental() {
    const fundamental = predictNextFundamental();
    const fundamentalNames = {
        'b': 'Servizio (b)',
        'r': 'Ricezione (r)',
        'a': 'Attacco (a)',
        'd': 'Difesa (d)',
        'm': 'Muro (m)'
    };
    
    const element = document.getElementById('next-fundamental');
    if (element) {
        element.textContent = fundamentalNames[fundamental] || 'Sconosciuto';
    }
    
    // Aggiorna anche il fondamentale corrente nella schermata di valutazione
    const currentElement = document.getElementById('current-fundamental');
    if (currentElement) {
        currentElement.textContent = fundamentalNames[fundamental] || 'Sconosciuto';
    }
}

function startSet() {
    const setNumber = document.getElementById('current-set').value;
    const rotation = document.getElementById('rotation').value;
    const phase = document.getElementById('game-phase').value;
    
    appState.currentSet = parseInt(setNumber);
    appState.currentRotation = rotation;
    appState.currentPhase = phase;
    appState.homeScore = 0;
    appState.awayScore = 0;
    appState.actionsLog = [];
    appState.setStarted = true;
    appState.selectedPlayer = null;
    appState.selectedEvaluation = null;
    
    // Mostra sezione scouting
    document.getElementById('scouting-section').style.display = 'block';
    
    // Aggiorna UI
    updateMatchInfo();
    updateScoutingUI();
    updateCurrentPhaseDisplay();
    updateNextFundamental();
    updatePlayersGrid();
    
    // Apri l'interfaccia guidata e mostra il primo step (selezione giocatore)
    showScoutingStep('step-player');
    openDialog('scouting-dialog');
    
    alert(`Set ${setNumber} iniziato! Rotazione: ${rotation}, Fase: ${phase}`);
}

function updateMatchInfo() {
    const matchInfoSection = document.getElementById('match-info-section');
    
    if (appState.currentMatch) {
        // Mostra la sezione delle informazioni della partita
        matchInfoSection.style.display = 'block';
        
        // Determina quale squadra è la nostra e quale l'avversaria
        const myTeam = appState.currentMatch.myTeam || appState.currentMatch.homeTeam;
        const opponentTeam = appState.currentMatch.opponentTeam || appState.currentMatch.awayTeam;
        const homeAway = appState.currentMatch.homeAway;
        
        // Aggiorna i dati della partita con indicazione del nostro team
        let homeDisplay = appState.currentMatch.homeTeam;
        let awayDisplay = appState.currentMatch.awayTeam;
        
        // Aggiungi indicatori per il nostro team
        if (homeAway === 'home') {
            homeDisplay += ' (Il mio Team)';
        } else if (homeAway === 'away') {
            awayDisplay += ' (Il mio Team)';
        }
        
        document.getElementById('match-home-team').textContent = homeDisplay;
        document.getElementById('match-away-team').textContent = awayDisplay;
        document.getElementById('match-type').textContent = appState.currentMatch.matchType;
        document.getElementById('match-date').textContent = appState.currentMatch.date;
    } else {
        // Nasconde la sezione se non c'è una partita caricata
        matchInfoSection.style.display = 'none';
    }
}

function updateScoutingUI() {
    document.querySelector('.home-score').textContent = appState.homeScore;
    document.querySelector('.away-score').textContent = appState.awayScore;
    document.getElementById('current-rotation').textContent = appState.currentRotation;
    document.getElementById('current-phase').textContent = appState.currentPhase;
    document.getElementById('current-set-display').textContent = `Set ${appState.currentSet}`;
}

function submitAction() {
    const actionString = document.getElementById('action-string').value.trim();
    
    if (!actionString) {
        alert('Inserisci una stringa di azione');
        return;
    }
    
    if (!appState.setStarted) {
        alert('Devi prima iniziare il set');
        return;
    }
    
    try {
        const result = parseAction(actionString);
        processActionResult(result);
        
        // Aggiungi al log
        appState.actionsLog.push({
            action: actionString,
            result: result,
            timestamp: new Date().toLocaleTimeString('it-IT')
        });
        
        // Aggiorna UI
        updateScoutingUI();
        updateActionsLog();
        
        // Pulisci input
        document.getElementById('action-string').value = '';
        
        // Controlla fine set
        checkSetEnd();
        
    } catch (error) {
        alert(`Errore nella stringa: ${error.message}`);
    }
}

function parseAction(actionString) {
    // Parsing della stringa di azione
    const parts = actionString.split(' ');
    const actions = [];
    let finalResult = null;
    
    for (const part of parts) {
        if (part === 'avv') {
            finalResult = 'home_point';
            break;
        }
        
        if (part.length >= 3) {
            const playerNumber = part.substring(0, 2);
            const fundamental = part.charAt(2);
            const evaluation = parseInt(part.charAt(3));
            
            if (isNaN(evaluation) || evaluation < 1 || evaluation > 5) {
                throw new Error(`Valutazione non valida: ${evaluation}`);
            }
            
            actions.push({
                player: playerNumber,
                fundamental: fundamental,
                evaluation: evaluation
            });
            
            // Determina il risultato basato sull'ultima azione
            if (actions.length === parts.length) {
                finalResult = determineFinalResult(fundamental, evaluation);
            }
        }
    }
    
    return {
        actions: actions,
        result: finalResult
    };
}

function determineFinalResult(fundamental, evaluation) {
    // Logica per determinare il risultato finale
    switch (fundamental) {
        case 'b': // Servizio
        case 'a': // Attacco
        case 'm': // Muro
            if (evaluation === 1) return 'away_point'; // Errore
            if (evaluation === 5) return 'home_point'; // Punto
            return 'continue'; // Continua azione
            
        case 'r': // Ricezione
        case 'd': // Difesa
            if (evaluation === 1) return 'away_point'; // Errore
            return 'continue'; // Continua azione
            
        default:
            return 'continue';
    }
}

function processActionResult(result) {
    if (result.result === 'home_point') {
        appState.homeScore++;
        if (appState.currentPhase === 'ricezione') {
            appState.currentPhase = 'servizio';
            rotateTeam();
        }
    } else if (result.result === 'away_point') {
        appState.awayScore++;
        if (appState.currentPhase === 'servizio') {
            appState.currentPhase = 'ricezione';
        } else {
            appState.currentPhase = 'ricezione';
        }
    }
}

function rotateTeam() {
    const currentIndex = rotationSequence.indexOf(appState.currentRotation);
    const nextIndex = (currentIndex + 1) % rotationSequence.length;
    appState.currentRotation = rotationSequence[nextIndex];
}

function updateActionsLog() {
    const container = document.getElementById('actions-list');
    
    let displayLogs = appState.actionsLog.slice(-9).reverse();
    
    if (appState.currentSequence.length > 0) {
        const currentString = appState.currentSequence.map(s => s.quartet).join(' ');
        displayLogs.unshift({
            timestamp: 'Corrente',
            action: currentString,
            result: {result: 'continue'},
            guided: true
        });
    }
    
    if (displayLogs.length === 0) {
        container.innerHTML = '<p style="color: #666;">Nessuna azione registrata</p>';
        return;
    }
    
    container.innerHTML = displayLogs.map(log => {
        let resultText = '';
        switch (log.result.result) {
            case 'home_point':
                resultText = '🏐 Punto Casa';
                break;
            case 'away_point':
                resultText = '🏐 Punto Ospiti';
                break;
            default:
                resultText = '↔️ In corso';
        }
        
        const actionDisplay = log.action;
        
        return `
            <div class="action-entry ${log.guided ? 'guided-action' : ''}">
                <strong>${log.timestamp}</strong>: ${actionDisplay}
                <div class="action-result">${resultText}</div>
            </div>
        `;
    }).join('');
}

function checkSetEnd() {
    const homeScore = appState.homeScore;
    const awayScore = appState.awayScore;
    
    // Regole volley: primo a 25 con 2 punti di scarto, o oltre 25 con 2 di scarto
    if ((homeScore >= 25 || awayScore >= 25) && Math.abs(homeScore - awayScore) >= 2) {
        const winner = homeScore > awayScore ? 'Casa' : 'Ospiti';
        alert(`Set ${appState.currentSet} terminato! Vincitore: ${winner} (${homeScore}-${awayScore})`);
        
        // Reset per nuovo set
        appState.setStarted = false;
        document.getElementById('scouting-section').style.display = 'none';
    }
}

function loadStoredData() {
    // Carica dati salvati se necessario
    console.log('App inizializzata e dati caricati');
}


function fitActivePageToViewport() {
    try {
        const vh = window.innerHeight;
        const header = document.querySelector('.header');
        const nav = document.querySelector('.nav');
        const activePage = document.querySelector('.page.active');
        const main = document.querySelector('.main');
        if (!activePage || !main) return;

        const headerH = header ? header.offsetHeight : 0;
        const mainPaddingTop = parseFloat(getComputedStyle(main).paddingTop) || 0;
        const mainPaddingBottom = parseFloat(getComputedStyle(main).paddingBottom) || 0;
        const available = vh - headerH - mainPaddingTop - mainPaddingBottom;

        // Applica altezza massima alla pagina attiva
        activePage.style.maxHeight = available + 'px';
        // Il contenitore pagina non deve scrollare verticalmente
        activePage.style.overflow = 'hidden';

        // Solo la lista partite deve scrollare quando visibile
        if (activePage.id === 'match-data') {
            const listSection = document.getElementById('matches-list-section');
            const list = document.getElementById('matches-list');
            if (listSection && list) {
                const visible = getComputedStyle(listSection).display !== 'none';
                if (visible) {
                    const listTop = list.getBoundingClientRect().top;
                    // Spazio disponibile dal top della lista al fondo della viewport
                    const listAvailable = Math.max(0, window.innerHeight - listTop - (parseFloat(getComputedStyle(main).paddingBottom) || 0) - 8);
                    list.style.maxHeight = listAvailable + 'px';
                    list.style.overflowY = 'auto';
                    list.style.overflowX = 'hidden';
                } else {
                    list.style.maxHeight = '';
                    list.style.overflowY = '';
                    list.style.overflowX = '';
                }
            }
        }

        // Roster: scroll solo sulla griglia dei giocatori
        if (activePage.id === 'roster') {
            const grid = document.getElementById('roster-form');
            if (grid) {
                const gridTop = grid.getBoundingClientRect().top;
                const gridAvailable = Math.max(0, window.innerHeight - gridTop - (parseFloat(getComputedStyle(main).paddingBottom) || 0) - 8);
                grid.style.maxHeight = gridAvailable + 'px';
                grid.style.overflowY = 'auto';
                grid.style.overflowX = 'hidden';
            }
        }
        
        // Comprimi sezioni non essenziali se superano l’altezza disponibile
        activePage.classList.remove('compact', 'ultra-compact');
        document.body.classList.remove('compact-global');

        // Se il contenuto complessivo eccede, comprimi progressivamente
        const exceeds = activePage.scrollHeight > available;
        if (exceeds) {
            document.body.classList.add('compact-global');
            activePage.classList.add('compact');

            // Dopo l'applicazione della classe, ricalcola e verifica se serve ulteriore compressione
            requestAnimationFrame(() => {
                if (activePage.scrollHeight > available) {
                    activePage.classList.add('ultra-compact');
                }
            });
        }
    } catch (e) {
        console.warn('fitActivePageToViewport error:', e);
    }
}

function fitActivePageToViewport() {
    try {
        const vh = window.innerHeight;
        const header = document.querySelector('.header');
        const main = document.querySelector('.main');
        const activePage = document.querySelector('.page.active');
        if (!activePage || !main) return;

        const headerH = header ? header.offsetHeight : 0;
        const mainStyles = getComputedStyle(main);
        const mainPaddingTop = parseFloat(mainStyles.paddingTop) || 0;
        const mainPaddingBottom = parseFloat(mainStyles.paddingBottom) || 0;
        const available = vh - headerH - mainPaddingTop - mainPaddingBottom;

        // Imposta un limite massimo di altezza alla pagina attiva
        activePage.style.maxHeight = available + 'px';
        // Il contenitore pagina non deve scrollare verticalmente
        activePage.style.overflow = 'hidden';

        // Solo la lista partite deve scrollare quando visibile
        if (activePage.id === 'match-data') {
            const listSection = document.getElementById('matches-list-section');
            const list = document.getElementById('matches-list');
            if (listSection && list) {
                const visible = getComputedStyle(listSection).display !== 'none';
                if (visible) {
                    const listTop = list.getBoundingClientRect().top;
                    const listAvailable = Math.max(0, window.innerHeight - listTop - (parseFloat(getComputedStyle(main).paddingBottom) || 0) - 8);
                    list.style.maxHeight = listAvailable + 'px';
                    list.style.overflowY = 'auto';
                    list.style.overflowX = 'hidden';
                } else {
                    list.style.maxHeight = '';
                    list.style.overflowY = '';
                    list.style.overflowX = '';
                }
            }
        }

        // Roster: scroll solo sulla griglia dei giocatori
        if (activePage.id === 'roster') {
            const grid = document.getElementById('roster-form');
            if (grid) {
                const gridTop = grid.getBoundingClientRect().top;
                const gridAvailable = Math.max(0, window.innerHeight - gridTop - (parseFloat(getComputedStyle(main).paddingBottom) || 0) - 8);
                grid.style.maxHeight = gridAvailable + 'px';
                grid.style.overflowY = 'auto';
                grid.style.overflowX = 'hidden';
            }
        }

        // Reset classi di compattazione
        activePage.classList.remove('compact', 'ultra-compact');
        document.body.classList.remove('compact-global');

        // Se il contenuto complessivo eccede, comprimi progressivamente
        const exceeds = activePage.scrollHeight > available;
        if (exceeds) {
            document.body.classList.add('compact-global');
            activePage.classList.add('compact');

            // Dopo l'applicazione della classe, ricalcola e verifica se serve ulteriore compressione
            requestAnimationFrame(() => {
                if (activePage.scrollHeight > available) {
                    activePage.classList.add('ultra-compact');
                }
            });
        }
    } catch (e) {
        console.warn('fitActivePageToViewport error:', e);
    }
}


// Gestione abilitazione pulsante "Carica Roster"
function setLoadRosterEnabled(enabled) {
    const btnLoad = document.getElementById('btn-load-roster');
    if (!btnLoad) return;
    if (enabled) {
        btnLoad.removeAttribute('disabled');
        btnLoad.classList.remove('is-disabled');
        btnLoad.setAttribute('aria-disabled', 'false');
    } else {
        btnLoad.setAttribute('disabled', '');
        btnLoad.classList.add('is-disabled');
        btnLoad.setAttribute('aria-disabled', 'true');
    }
}


function exportCurrentRosterToFile() {
    // Assicurati che lo stato sia aggiornato
    updateRosterStateFrom('roster-form-dialog');
    const rosterName = (document.getElementById('roster-name-dialog') || {}).value?.trim() || 'Roster';
    const players = appState.currentRoster || [];
    const valid = players.some(p => p && (p.number || p.name || p.surname || p.role || p.nickname));
    if (!valid) { alert('Nessun dato da esportare'); return; }

    const payload = {
        name: rosterName,
        players: players,
        exportedAt: new Date().toISOString(),
        format: 'my-volley-scout.roster.v1'
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = rosterName.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60) || 'Roster';
    a.download = `${safeName}.roster.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}

function importRosterFromFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const text = reader.result;
            const data = JSON.parse(text);
            const isValid = data && Array.isArray(data.players);
            if (!isValid) throw new Error('Formato file non valido');
            // Nome
            const nameInput = document.getElementById('roster-name-dialog');
            if (nameInput) nameInput.value = (data.name || '').toString();
            // Popola 16 righe
            for (let i = 0; i < 16; i++) {
                const player = (data.players && data.players[i]) || {};
                const n = document.querySelector(`#roster-form-dialog [data-field="number"][data-index="${i}"]`); if (n) n.value = player.number || '';
                const na = document.querySelector(`#roster-form-dialog [data-field="name"][data-index="${i}"]`); if (na) na.value = player.name || '';
                const su = document.querySelector(`#roster-form-dialog [data-field="surname"][data-index="${i}"]`); if (su) su.value = player.surname || '';
                const ro = document.querySelector(`#roster-form-dialog [data-field="role"][data-index="${i}"]`); if (ro) ro.value = player.role || '';
                const ni = document.querySelector(`#roster-form-dialog [data-field="nickname"][data-index="${i}"]`); if (ni) ni.value = player.nickname || '';
            }
            // Aggiorna stato
            updateRosterStateFrom('roster-form-dialog');
            setLoadRosterEnabled(true);
            alert('Roster importato con successo!');
        } catch (e) {
            console.error(e);
            alert('Impossibile importare il file selezionato. Verifica che sia un JSON valido del roster.');
        }
    };
    reader.onerror = () => alert('Errore lettura file.');
    reader.readAsText(file, 'utf-8');
}

// === SCOUTING PAGE ===
function initializeScoutingPage() {
    // Inizializza solo se siamo nella pagina di scouting
    const scoutingPage = document.getElementById('scouting');
    if (scoutingPage) {
        const startSetBtn = document.getElementById('start-set');
        const submitActionBtn = document.getElementById('submit-action');
        const actionStringInput = document.getElementById('action-string');
        
        if (startSetBtn) {
            startSetBtn.addEventListener('click', startSet);
        }
        
        if (submitActionBtn) {
            submitActionBtn.addEventListener('click', submitAction);
        }
        
        // Enter key per submit azione
        if (actionStringInput) {
            actionStringInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    submitAction();
                }
            });
        }
        
        // Inizializza interfaccia guidata
        initializeGuidedScouting();
    }
}

function openDialog(dialogId) {
    const dialog = document.getElementById(dialogId);
    if (dialog) {
        try {
            if (typeof dialog.showModal === 'function') {
                dialog.showModal();
            } else {
                // Fallback se showModal non è supportato
                dialog.setAttribute('open', 'open');
            }
        } catch (e) {
            // Ulteriore fallback in caso di eccezioni
            dialog.setAttribute('open', 'open');
        }
    }
}

function closeDialog(dialogId) {
    const dialog = document.getElementById(dialogId);
    if (dialog) {
        try {
            if (typeof dialog.close === 'function') {
                dialog.close();
            } else {
                dialog.removeAttribute('open');
            }
        } catch (e) {
            dialog.removeAttribute('open');
        }
    }
}

function initializeGuidedScouting() {
    // Event listeners per interfaccia guidata
    const backBtn = document.getElementById('back-to-player');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            showScoutingStep('step-player');
        });
    }
    
    // Event listeners per valutazioni
    const evalButtons = document.querySelectorAll('.eval-btn');
    evalButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const evaluation = parseInt(e.target.dataset.eval);
            submitGuidedAction(evaluation);
        });
    });
    
    // Non aprire automaticamente il dialog; verrà aperto quando l'utente entra nella pagina Scouting
}

function showScoutingStep(stepId) {
    document.querySelectorAll('.scouting-step').forEach(step => {
        step.classList.remove('active');
    });
    document.getElementById(stepId).classList.add('active');
}

function updatePlayersGrid() {
    const container = document.getElementById('players-grid');
    
    if (!appState.currentRoster || appState.currentRoster.length === 0) {
        container.innerHTML = '<p style="color: #666;">Nessun roster caricato. Vai alla sezione Roster per creare un roster.</p>';
        return;
    }
    
    const validPlayers = appState.currentRoster.filter(p => p && (p.number || p.name || p.surname));
    
    if (validPlayers.length === 0) {
        container.innerHTML = '<p style="color: #666;">Nessun giocatore valido nel roster.</p>';
        return;
    }
    
    container.innerHTML = validPlayers.map(player => {
        const displayName = player.nickname || `${player.name} ${player.surname}`.trim() || `Giocatore ${player.number}`;
        return `
            <button class="player-btn" data-number="${player.number}" data-name="${displayName}">
                <div class="player-number">${player.number}</div>
                <div class="player-name">${displayName}</div>
                <div class="player-role">${player.role || ''}</div>
            </button>
        `;
    }).join('');
    
    // Aggiungi event listeners
    container.querySelectorAll('.player-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const number = e.currentTarget.dataset.number;
            const name = e.currentTarget.dataset.name;
            selectPlayer(number, name);
        });
    });
}

function selectPlayer(number, name) {
    appState.selectedPlayer = { number, name };
    
    const playerInfoElement = document.getElementById('selected-player-info');
    if (playerInfoElement) {
        playerInfoElement.textContent = `${number} - ${name}`;
    }
    
    // Aggiorna il fondamentale corrente
    updateNextFundamental();
    
    // Passa alla selezione della valutazione
    showScoutingStep('step-action');
}

function selectEvaluation(evaluation) {
    appState.selectedEvaluation = evaluation;
    
    // Evidenzia il pulsante selezionato
    const evalButtons = document.querySelectorAll('.eval-btn');
    evalButtons.forEach(btn => {
        btn.classList.remove('selected');
    });
    
    // Trova il pulsante corretto basandosi sul testo o data attribute
    const selectedBtn = Array.from(evalButtons).find(btn => {
        return btn.textContent.startsWith(evaluation.toString()) || btn.dataset.eval === evaluation.toString();
    });
    
    if (selectedBtn) {
        selectedBtn.classList.add('selected');
    }
}

function submitGuidedAction() {
    if (!appState.selectedPlayer) {
        alert('Errore: nessun giocatore selezionato');
        return;
    }
    
    if (!appState.selectedEvaluation) {
        alert('Seleziona una valutazione');
        return;
    }
    
    const fundamental = predictNextFundamental();
    const evaluation = appState.selectedEvaluation;
    const quartet = `${appState.selectedPlayer.number.padStart(2, '0')}${fundamental}${evaluation}`;
    appState.currentSequence.push({quartet, playerName: appState.selectedPlayer.name});
    
    const tempResult = determineFinalResult(fundamental, evaluation);
    let isPoint = tempResult === 'home_point' || tempResult === 'away_point';
    
    if (isPoint) {
        const actionString = appState.currentSequence.map(s => s.quartet).join(' ');
        try {
            const result = parseAction(actionString);
            processActionResult(result);
            
            appState.actionsLog.push({
                action: actionString,
                result: result,
                timestamp: new Date().toLocaleTimeString('it-IT'),
                guided: true
            });
            
            appState.currentSequence = [];
        } catch (error) {
            alert(`Errore nell'azione: ${error.message}`);
            appState.currentSequence.pop(); // Rimuovi l'ultima se errore
            return;
        }
    } else {
    }
    
    // Aggiorna UI
    updateScoutingUI();
    updateActionsLog();
    updateNextFundamental();
    updatePlayersGrid();
    
    // Torna alla selezione giocatore
    showScoutingStep('step-player');
    
    // Reset selezione
    appState.selectedPlayer = null;
    appState.selectedEvaluation = null;
    
    if (isPoint) checkSetEnd();
}

function submitOpponentError() {
    const actionString = 'avv';
    try {
        const result = parseAction(actionString);
        processActionResult(result);
        
        appState.actionsLog.push({
            action: actionString,
            result: result,
            timestamp: new Date().toLocaleTimeString('it-IT'),
            guided: true
        });
        
        updateScoutingUI();
        updateActionsLog();
        checkSetEnd();
        updateNextFundamental();
        showScoutingStep('player-selection');
    } catch (error) {
        alert(`Errore: ${error.message}`);
    }
}

function updateGamePhase(fundamental, evaluation) {
    const eval = parseInt(evaluation);

    // Logica per cambiare la fase di gioco basata sul risultato dell'azione
    if (fundamental === 'b') { // Servizio
        if (eval === 1) {
            // Errore al servizio = punto avversario, passiamo in ricezione
            appState.currentPhase = 'ricezione';
        } else if (eval === 5) {
            // Ace = punto nostro, rimaniamo al servizio
            appState.currentPhase = 'servizio';
        }
        // Per valutazioni 2,3,4 la fase rimane invariata fino al prossimo punto
    } else if (fundamental === 'r') { // Ricezione
        if (eval === 1) {
            // Errore in ricezione = punto avversario, passiamo al servizio
            appState.currentPhase = 'servizio';
        }
        // Per altre valutazioni continuiamo nella stessa fase
    } else if (fundamental === 'a') { // Attacco
        if (eval === 1) {
            // Errore in attacco = punto avversario
            if (appState.currentPhase === 'servizio') {
                appState.currentPhase = 'ricezione';
            } else {
                appState.currentPhase = 'servizio';
            }
        } else if (eval === 5) {
            // Punto in attacco = nostro punto
            if (appState.currentPhase === 'ricezione') {
                appState.currentPhase = 'servizio';
            } else {
                appState.currentPhase = 'ricezione';
            }
        }
    } else if (fundamental === 'd') { // Difesa
        if (eval === 1) {
            // Errore in difesa = punto avversario
            appState.currentPhase = 'ricezione';
        }
    }

    // Aggiorna il display della fase corrente
    updateCurrentPhaseDisplay();
}