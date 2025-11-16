## Architettura
- Frontend vanilla JS/HTML/CSS senza bundler; hosting statico con `serve`.
- Due superfici principali:
  - PWA legacy in root (`index.html`, `styles.css`, `sw.js`) con toolbar, salvataggi e gestione sessione.
  - Nuova SPA modulare in `src/` con schermate e moduli separati.
- Persistenza locale con `localStorage` e cloud con Firebase Auth + Firestore (compat via CDN).

## Moduli e Interfacce (API)
- `src/main.js`: classe `VolleyScoutApp` (orchestratore)
  - `init()` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\main.js:25
  - `waitForModules()` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\main.js:64
  - `setupModuleCallbacks()` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\main.js:101
  - `showDynamicScreen(html)` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\main.js:588
  - `handleSetConfiguration(e)` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\main.js:785
- `src/modules/auth/auth.js`: classe `AuthModule`
  - `onAuthStateChange(cb)` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\modules\auth\auth.js:483
  - `handleLogin(e)` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\modules\auth\auth.js:180
  - `handleRegister(e)` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\modules\auth\auth.js:213
  - `handleGoogleSignIn()` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\modules\auth\auth.js:258
  - `requireAuth()` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\modules\auth\auth.js:530
- `src/modules/teams/teams.js`: classe `TeamsModule`
  - `loadTeams()` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\modules\teams\teams.js:63
  - `saveTeam(teamData)` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\modules\teams\teams.js:148
  - `deleteTeam(teamId)` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\modules\teams\teams.js:241
  - `selectTeam(teamId)` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\modules\teams\teams.js:306
  - `importFromCSV(file)` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\modules\teams\teams.js:324
  - `exportToCSV(teamIds?)` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\modules\teams\teams.js:433
- `src/modules/matches/matches.js`: classe `MatchesModule`
  - `createMatch(data)` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\modules\matches\matches.js:157
  - `configureSet(setNumber, configuration)` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\modules\matches\matches.js:344
  - `startSet()` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\modules\matches\matches.js:385
  - `getMatchStats(matchId?)` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\modules\matches\matches.js:442
  - Callback: `onSetStart(cb)` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\modules\matches\matches.js:710
- `src/modules/scouting/scouting.js`: classe `ScoutingModule`
  - `start(match, setData)` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\modules\scouting\scouting.js:30
  - `stop()` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\modules\scouting\scouting.js:53
  - `addAction(action)` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\modules\scouting\scouting.js:66
- `src/components/ui.js`: classe `UIComponents`
  - `showNotification(message, type, duration)` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\components\ui.js:65
  - `createModal(id, options)` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\components\ui.js:184
  - `showLoader(message)` / `hideLoader(id)` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\components\ui.js:364 / 414
  - `createTooltip(element, text, position)` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\components\ui.js:424
- `src/utils/helpers.js`: oggetto `Utils`
  - `formatDate(date)` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\utils\helpers.js:13
  - `debounce(func, wait)` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\utils\helpers.js:137
  - `storage.set/get/remove/clear` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\utils\helpers.js:420
  - `handleError(error, context)` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\utils\helpers.js:464

## Firebase e Servizi
- `firebase-config.js`: init app/auth/db, provider Google, persistenza offline; API globali:
  - `authFunctions.signUp/signIn/signInWithGoogle/signOut` c:\Users\STEFANO\Desktop\My-Volley-Scout\firebase-config.js:53,63,73,86
  - `firestoreFunctions.addDocument/getDocuments/updateDocument/deleteDocument` c:\Users\STEFANO\Desktop\My-Volley-Scout\firebase-config.js:109,123,146,159
  - `getUserMatches/getUserRosters` c:\Users\STEFANO\Desktop\My-Volley-Scout\firebase-config.js:174,188
- `firestore-service.js`: API applicative annidate in `users/{uid}`
  - `createUserCollection(email)` c:\Users\STEFANO\Desktop\My-Volley-Scout\firestore-service.js:6
  - `saveMatchStats(match)` c:\Users\STEFANO\Desktop\My-Volley-Scout\firestore-service.js:183
  - `loadUserMatches()` c:\Users\STEFANO\Desktop\My-Volley-Scout\firestore-service.js:393
  - `saveRoster(roster)` / `loadUserRosters()` c:\Users\STEFANO\Desktop\My-Volley-Scout\firestore-service.js:263 / 297
  - `setUserRole/getUserRole/isUserAdmin` c:\Users\STEFANO\Desktop\My-Volley-Scout\firestore-service.js:83,123,147

## Pagine e Schermate
- SPA `src/index.html` (schermate principali):
  - `loading-screen` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\index.html:17
  - `auth-screen` con `login-form`/`register-form` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\index.html:29,40,78
  - `welcome-screen` con card azioni c:\Users\STEFANO\Desktop\My-Volley-Scout\src\index.html:107,135
  - `team-selection-screen` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\index.html:177
  - `match-management-screen` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\index.html:212
  - `match-setup-screen` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\index.html:261
  - `set-config-screen` e `scouting-screen` (sezioni successive del file)
- PWA legacy `index.html` in root: gating su sessione, toolbar, service worker c:\Users\STEFANO\Desktop\My-Volley-Scout\index.html:13–41, 155–200
- Ulteriori pagine legacy: `welcome.html`, `matches.html`, `match-setup.html`, `set-config.html`, `report-riepilogo-all.html`, ecc.

## Gestione Stato e Navigazione
- Stato per modulo (auth/teams/matches/scouting) + orchestrazione in `VolleyScoutApp`.
- Navigazione manuale: toggle DOM (`showScreen/hideScreen/hideAllScreens`) nei moduli e in `main.js`.
- Persistenza: `localStorage` chiavi `volleyTeams`, `volleyMatches`, `selectedTeamId`, ecc.; sincronizzazione Firestore quando autenticato.

## Grafica e Design
- Design tokens CSS in `src/styles/main.css` (palette, tipografia, spaziature, radius, ombre) c:\Users\STEFANO\Desktop\My-Volley-Scout\src\styles\main.css:7–108
- Layout schermate, header sticky, grid azioni, componenti card, form, selettori set c:\Users\STEFANO\Desktop\My-Volley-Scout\src\styles\main.css:326–406, 479–507, 508–599
- Stili componenti riutilizzabili in `src/styles/components.css` (cards, grid, option-card, forms) c:\Users\STEFANO\Desktop\My-Volley-Scout\src\styles\components.css:46–100, 104–156, 161–200
- Componenti dinamici (notifiche, modals, loader, tooltip) in `src/components/ui.js`.

## Osservazioni e Allineamenti
- Scouting API: `MatchesModule` invoca `window.scoutingModule.startScouting(...)` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\modules\matches\matches.js:676–678, mentre `ScoutingModule` espone `start(...)` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\modules\scouting\scouting.js:30. Da allineare.
- ID dei campi Auth: `AuthModule` usa `login-email/login-password` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\modules\auth\auth.js:183–185, mentre la UI usa `loginEmail/loginPassword` c:\Users\STEFANO\Desktop\My-Volley-Scout\src\index.html:44,48. Da uniformare.
- Notifiche e alert: `main.js` usa `alert` temporanei c:\Users\STEFANO\Desktop\My-Volley-Scout\src\main.js:825–834; preferibile centralizzare su `UIComponents.showNotification`.

## Prossimi Passi Proposti (una volta approvato)
- Allineare Scouting (`startScouting` → `start`) e ID dei form Auth per evitare rotture.
- Integrare `UIComponents.showNotification` ovunque per messaggistica coerente.
- Aggiungere JSDoc alle API pubbliche e piccoli type guard nelle funzioni chiave.
- Creare una mappa di routing dichiarativa minima (tabella `screenId` → handler) in `main.js` per ridurre duplicazioni.

Conferma e procederò con le correzioni minime (senza alterare il flusso) e con un breve test manuale sulla SPA in `src/`. 