// Servizio Firestore per My Volley Scout
// Gestisce tutte le operazioni di salvataggio e recupero dati da Firestore

const firestoreService = {
    _emailKey: (email) => String(email||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'_'),
    _chooseLocalOrCloud: async (options = {}) => {
        const title = String(options.title || 'Conflitto dati').trim();
        const subtitle = String(options.subtitle || '').trim();
        const message = String(options.message || '').trim();
        const hint = String(options.hint || '').trim();
        const localLabel = String(options.localLabel || 'Usa dati locali').trim() || 'Usa dati locali';
        const cloudLabel = String(options.cloudLabel || 'Usa dati Cloud').trim() || 'Usa dati Cloud';
        const defaultChoice = (options.defaultChoice === 'cloud') ? 'cloud' : 'local';

        try {
            if (typeof document === 'undefined' || !document.body) return defaultChoice;
        } catch (_) { return defaultChoice; }

        const dialogId = 'mvs-conflict-choice-dialog';
        let dlg = document.getElementById(dialogId);
        if (!dlg) {
            dlg = document.createElement('div');
            dlg.id = dialogId;
            dlg.className = 'dialog';
            dlg.setAttribute('hidden', '');
            try { dlg.style.zIndex = '11050'; } catch (_) {}

            const panel = document.createElement('div');
            panel.className = 'dialog-panel';
            try {
                panel.style.maxWidth = '520px';
                panel.style.width = '92%';
                panel.style.border = '1px solid #e5e7eb';
                panel.style.borderRadius = '12px';
                panel.style.background = '#fff';
                panel.style.overflow = 'hidden';
            } catch (_) {}

            const header = document.createElement('div');
            header.className = 'dialog-header';
            try {
                header.style.display = 'grid';
                header.style.gridTemplateColumns = '1fr auto';
                header.style.alignItems = 'center';
                header.style.columnGap = '8px';
                header.style.padding = '10px 12px';
            } catch (_) {}

            const h3 = document.createElement('h3');
            h3.setAttribute('data-role', 'title');
            try { h3.style.margin = '0'; } catch (_) {}

            const close = document.createElement('button');
            close.type = 'button';
            close.textContent = '✕';
            close.setAttribute('data-role', 'close');
            try {
                close.style.background = '#fff';
                close.style.border = '1px solid #e5e7eb';
                close.style.borderRadius = '10px';
                close.style.padding = '4px 8px';
                close.style.cursor = 'pointer';
            } catch (_) {}

            header.appendChild(h3);
            header.appendChild(close);

            const body = document.createElement('div');
            body.className = 'dialog-body';
            try { body.style.padding = '12px 16px'; body.style.display = 'grid'; body.style.gap = '8px'; } catch (_) {}

            const sub = document.createElement('div');
            sub.setAttribute('data-role', 'subtitle');
            try { sub.style.fontWeight = '600'; } catch (_) {}

            const msgEl = document.createElement('div');
            msgEl.setAttribute('data-role', 'message');
            try { msgEl.style.whiteSpace = 'pre-wrap'; } catch (_) {}

            const hintEl = document.createElement('div');
            hintEl.setAttribute('data-role', 'hint');
            try { hintEl.style.whiteSpace = 'pre-wrap'; hintEl.style.color = '#64748b'; } catch (_) {}

            body.appendChild(sub);
            body.appendChild(msgEl);
            body.appendChild(hintEl);

            const footer = document.createElement('div');
            footer.className = 'dialog-footer';
            try {
                footer.style.display = 'flex';
                footer.style.justifyContent = 'flex-end';
                footer.style.gap = '8px';
                footer.style.padding = '10px 12px 12px 12px';
                footer.style.borderTop = '1px solid #e5e7eb';
            } catch (_) {}

            const btnLocal = document.createElement('button');
            btnLocal.type = 'button';
            btnLocal.className = 'btn';
            btnLocal.setAttribute('data-choice', 'local');
            try {
                btnLocal.style.background = '#fff';
                btnLocal.style.color = '#0d6efd';
                btnLocal.style.border = '1px solid #0d6efd';
                btnLocal.style.borderRadius = '10px';
                btnLocal.style.padding = '8px 10px';
                btnLocal.style.fontWeight = '700';
            } catch (_) {}

            const btnCloud = document.createElement('button');
            btnCloud.type = 'button';
            btnCloud.className = 'btn';
            btnCloud.setAttribute('data-choice', 'cloud');
            try {
                btnCloud.style.background = '#0d6efd';
                btnCloud.style.color = '#fff';
                btnCloud.style.border = '1px solid #0d6efd';
                btnCloud.style.borderRadius = '10px';
                btnCloud.style.padding = '8px 10px';
                btnCloud.style.fontWeight = '700';
            } catch (_) {}

            footer.appendChild(btnLocal);
            footer.appendChild(btnCloud);

            panel.appendChild(header);
            panel.appendChild(body);
            panel.appendChild(footer);
            dlg.appendChild(panel);
            document.body.appendChild(dlg);
        }

        const setOpen = (v) => {
            try {
                if (v) {
                    try { dlg.style.zIndex = '11050'; } catch (_) {}
                    dlg.removeAttribute('hidden');
                    dlg.classList.add('is-open');
                    document.body.style.overflow = 'hidden';
                } else {
                    dlg.setAttribute('hidden', '');
                    dlg.classList.remove('is-open');
                    const anyOpen = document.querySelector('.dialog.is-open:not([hidden])');
                    if (!anyOpen) document.body.style.overflow = '';
                }
            } catch (_) {}
        };

        const titleEl = dlg.querySelector('[data-role="title"]');
        const subEl = dlg.querySelector('[data-role="subtitle"]');
        const msgEl = dlg.querySelector('[data-role="message"]');
        const hintEl = dlg.querySelector('[data-role="hint"]');
        const btnLocal = dlg.querySelector('button[data-choice="local"]');
        const btnCloud = dlg.querySelector('button[data-choice="cloud"]');
        if (titleEl) titleEl.textContent = title || 'Conflitto dati';
        if (subEl) subEl.textContent = subtitle || '';
        if (msgEl) msgEl.textContent = message || '';
        if (hintEl) hintEl.textContent = hint || '';
        if (btnLocal) btnLocal.textContent = localLabel;
        if (btnCloud) btnCloud.textContent = cloudLabel;

        return await new Promise((resolve) => {
            let resolved = false;
            const cleanup = () => {
                try {
                    dlg.removeEventListener('click', onBackdropClick);
                    document.removeEventListener('keydown', onKeydown, true);
                    const closeBtn = dlg.querySelector('button[data-role="close"]');
                    if (closeBtn) closeBtn.removeEventListener('click', onClose);
                    if (btnLocal) btnLocal.removeEventListener('click', onLocal);
                    if (btnCloud) btnCloud.removeEventListener('click', onCloud);
                } catch (_) {}
            };
            const finish = (choice) => {
                if (resolved) return;
                resolved = true;
                cleanup();
                setOpen(false);
                resolve(choice);
            };
            const onLocal = () => finish('local');
            const onCloud = () => finish('cloud');
            const onClose = () => finish(defaultChoice);
            const onBackdropClick = (e) => {
                try {
                    if (e.target === dlg) finish(defaultChoice);
                } catch (_) {}
            };
            const onKeydown = (e) => {
                if (e.key === 'Escape') finish(defaultChoice);
            };

            try {
                const closeBtn = dlg.querySelector('button[data-role="close"]');
                if (closeBtn) closeBtn.addEventListener('click', onClose);
                if (btnLocal) btnLocal.addEventListener('click', onLocal);
                if (btnCloud) btnCloud.addEventListener('click', onCloud);
                dlg.addEventListener('click', onBackdropClick);
                document.addEventListener('keydown', onKeydown, true);
            } catch (_) {}

            setOpen(true);
        });
    },
    _sanitizeRosterPlayers: (players) => {
        const list = Array.isArray(players)?players:[];
        return list.map(p=>({
            number: String(p.number||'').trim(),
            nickname: String(p.nickname||'').trim(),
            role: String(p.role||'').trim().toUpperCase()
        })).filter(p=>p.number||p.nickname||p.role);
    },

    syncLocalTeamsToFirestore: async (options = {}) => {
        try {
            const isAuthed = !!authFunctions.getCurrentUser();
            if (!isAuthed) return { success: false, error: 'Utente non autenticato' };
            const userRef = await firestoreService.getUserRefEnsured();
            const teamsRef = userRef.collection('teams');
            let local = [];
            try { local = JSON.parse(localStorage.getItem('volleyTeams')||'[]'); } catch(_){ local = []; }
            if (!Array.isArray(local) || !local.length) return { success: true, synced: 0 };
            const conflictMode = String(options?.conflictMode || 'preferLocal');

            const toEpochMs = (v) => {
                try {
                    if (!v) return null;
                    if (typeof v === 'number' && isFinite(v)) return v;
                    if (typeof v === 'string') {
                        const t = Date.parse(v);
                        return Number.isFinite(t) ? t : null;
                    }
                    if (typeof v.toMillis === 'function') return v.toMillis();
                    if (typeof v.seconds === 'number') return (v.seconds * 1000) + Math.floor((v.nanoseconds || 0) / 1e6);
                    return null;
                } catch (_) { return null; }
            };

            let synced = 0;
            for (const t of local) {
                // Skip syncing shared teams (teams where I am an observer) to my own collection
                if (t.source === 'shared' || t._mvsRole === 'observer' || (t.shared && t._mvsOwner && t._mvsOwner !== userRef.id && t._mvsOwner !== authFunctions.getCurrentUser()?.email)) {
                    continue;
                }

                const club = String(t.clubName||'').trim();
                const squad = String(t.teamName||t.name||'').trim();
                const combined = (squad ? squad : '').trim() + (club ? ` - ${club}` : '');
                const id = combined || String(t.id||Date.now());
                const docRef = teamsRef.doc(id);
                const localPlayers = firestoreService._sanitizeRosterPlayers(Array.isArray(t.players) ? t.players : []);
                const baseData = {
                    id,
                    name: combined,
                    teamName: squad,
                    clubName: club,
                    players: localPlayers,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                try {
                    let shouldWrite = true;
                    let shouldSetCreatedAt = true;
                    let cloudTeam = null;
                    try {
                        const snap = await docRef.get();
                        if (snap.exists) {
                            shouldSetCreatedAt = false;
                            cloudTeam = Object.assign({ id: snap.id }, snap.data() || {});
                        }
                    } catch (_) {}

                    if (cloudTeam && conflictMode !== 'preferLocal') {
                        const cloudPlayers = firestoreService._sanitizeRosterPlayers(Array.isArray(cloudTeam.players) ? cloudTeam.players : []);
                        const localUpdated = toEpochMs(t?.updatedAt) || null;
                        const cloudUpdated = toEpochMs(cloudTeam?.updatedAt) || null;
                        const localSig = JSON.stringify({
                            name: String(combined || '').trim(),
                            teamName: String(squad || '').trim(),
                            clubName: String(club || '').trim(),
                            players: localPlayers
                        });
                        const cloudSig = JSON.stringify({
                            name: String(cloudTeam?.name || '').trim(),
                            teamName: String(cloudTeam?.teamName || '').trim(),
                            clubName: String(cloudTeam?.clubName || '').trim(),
                            players: cloudPlayers
                        });
                        const hasDiff = (localSig !== cloudSig) || (localUpdated && cloudUpdated && localUpdated !== cloudUpdated);
                        if (hasDiff) {
                            if (conflictMode === 'preferCloud') {
                                shouldWrite = false;
                            } else if (conflictMode === 'ask') {
                                let hint = '';
                                if (localUpdated && cloudUpdated) {
                                    if (localUpdated > cloudUpdated) hint = 'Suggerimento: sembrano più recenti i dati locali.';
                                    else if (cloudUpdated > localUpdated) hint = 'Suggerimento: sembrano più recenti i dati cloud.';
                                }
                                const choice = await firestoreService._chooseLocalOrCloud({
                                    title: 'Conflitto dati squadra (upload)',
                                    subtitle: String(combined || cloudTeam?.name || id),
                                    message: '',
                                    hint,
                                    localLabel: 'Invia dati locali',
                                    cloudLabel: 'Mantieni dati Cloud',
                                    defaultChoice: 'local'
                                });
                                shouldWrite = choice !== 'cloud';
                            }
                        }
                    }

                    if (!shouldWrite) continue;
                    baseData.shared = typeof t.shared === 'boolean' ? t.shared : !!(cloudTeam?.shared);
                    const payload = Object.assign({}, baseData);
                    if (shouldSetCreatedAt) payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    await docRef.set(payload, { merge: true });
                    try {
                        const currentEmail = String(authFunctions.getCurrentUser()?.email || '').trim();
                        if (currentEmail) {
                            const uaRef = docRef.collection('user_access').doc(currentEmail);
                            await uaRef.set({
                                userEmail: currentEmail,
                                role: 'coach',
                                active: true,
                                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                                createdAt: firebase.firestore.FieldValue.serverTimestamp()
                            }, { merge: true });
                        }
                    } catch(_) {}
                    synced++;
                } catch(_){ }
            }
            return { success: true, synced };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    syncLocalMatchesToFirestore: async (options = {}) => {
        try {
            const isAuthed = !!authFunctions.getCurrentUser();
            if (!isAuthed) return { success: false, error: 'Utente non autenticato' };
            const userRef = await firestoreService.getUserRefEnsured();
            const conflictMode = String(options?.conflictMode || 'preferLocal');
            // Mappa dei team locali: name -> docId
            let localTeams = [];
            try { localTeams = JSON.parse(localStorage.getItem('volleyTeams')||'[]'); } catch(_){ localTeams = []; }
            const teamMap = new Map();
            (Array.isArray(localTeams) ? localTeams : []).forEach(t => {
                const club = String(t.clubName||'').trim();
                const squad = String(t.teamName||t.name||'').trim();
                const combined = (squad + (club ? ` - ${club}` : '')).trim();
                const localId = String(t.id || '').trim();
                const docId = combined || localId;
                const nameCombined = String(t.name || '').trim() || combined;
                if (docId) {
                    teamMap.set(nameCombined, docId);
                    if (combined) teamMap.set(combined, docId);
                    if (squad) teamMap.set(squad, docId);
                    if (localId) teamMap.set(localId, docId);
                }
            });

            let localMatches = [];
            try { localMatches = JSON.parse(localStorage.getItem('volleyMatches')||'[]'); } catch(_){ localMatches = []; }
            if (!Array.isArray(localMatches) || !localMatches.length) return { success: true, synced: 0 };
            const onlyIdsRaw = Array.isArray(options?.matchIds) ? options.matchIds : null;
            if (onlyIdsRaw && onlyIdsRaw.length) {
                const onlyIds = new Set(onlyIdsRaw.map(v => String(v || '').trim()).filter(Boolean));
                localMatches = localMatches.filter(m => onlyIds.has(String(m?.id || '').trim()));
                if (!localMatches.length) return { success: true, synced: 0 };
            }

            const toEpochMs = (v) => {
                try {
                    if (!v) return null;
                    if (typeof v === 'number' && isFinite(v)) return v;
                    if (typeof v === 'string') {
                        const t = Date.parse(v);
                        return Number.isFinite(t) ? t : null;
                    }
                    if (typeof v.toMillis === 'function') return v.toMillis();
                    if (typeof v.seconds === 'number') return (v.seconds * 1000) + Math.floor((v.nanoseconds || 0) / 1e6);
                    return null;
                } catch (_) { return null; }
            };

            const isNewFormatId = (id) => String(id || '').trim().match(/^\d{4}-\d{2}-\d{2}_/);
            const matchKey = (m) => {
                const t = String(m?.teamId || '').trim();
                const id = String(m?.id || '').trim();
                const date = String(m?.matchDate || m?.date || '').trim();
                const type = String(m?.eventType || m?.matchType || '').trim();
                const home = String(m?.homeTeam || m?.myTeam || m?.teamName || '').trim();
                const away = String(m?.awayTeam || m?.opponentTeam || '').trim();
                if (id && isNewFormatId(id)) return `id:${t}|${id}`;
                return `sig:${t}|${date}|${home}|${away}|${type}`;
            };
            const matchScore = (m) => {
                let s = 0;
                try {
                    if (Array.isArray(m?.roster) && m.roster.length) s += 4;
                    if (m?.actionsBySet && typeof m.actionsBySet === 'object' && Object.keys(m.actionsBySet).length) s += 6;
                    if (m?.setMeta && typeof m.setMeta === 'object' && Object.keys(m.setMeta).length) s += 3;
                    if (m?.setStateBySet && typeof m.setStateBySet === 'object' && Object.keys(m.setStateBySet).length) s += 2;
                    if (m?.setSummary && typeof m.setSummary === 'object' && Object.keys(m.setSummary).length) s += 2;
                    if (m?.scoreHistoryBySet && typeof m.scoreHistoryBySet === 'object' && Object.keys(m.scoreHistoryBySet).length) s += 2;
                    const score = m?.score;
                    if (score && typeof score === 'object' && (Number(score.home || 0) || Number(score.away || 0))) s += 1;
                } catch (_) { }
                return s;
            };
            const mergePreferMoreInfo = (a, b) => {
                const aScore = matchScore(a);
                const bScore = matchScore(b);
                const aTime = toEpochMs(a?.updatedAt) || toEpochMs(a?.scoutingEndTime) || toEpochMs(a?.createdAt) || 0;
                const bTime = toEpochMs(b?.updatedAt) || toEpochMs(b?.scoutingEndTime) || toEpochMs(b?.createdAt) || 0;
                const primary = (bScore > aScore) || (bScore === aScore && bTime > aTime) ? b : a;
                const secondary = primary === a ? b : a;
                const out = Object.assign({}, secondary, primary);
                const aRoster = Array.isArray(a?.roster) ? a.roster : [];
                const bRoster = Array.isArray(b?.roster) ? b.roster : [];
                if (aRoster.length || bRoster.length) out.roster = (bRoster.length > aRoster.length) ? bRoster : aRoster;
                const ensureObj = (v) => (v && typeof v === 'object') ? v : null;
                const preferObj = (k) => {
                    const ao = ensureObj(a?.[k]);
                    const bo = ensureObj(b?.[k]);
                    if (bo && Object.keys(bo).length) return bo;
                    if (ao && Object.keys(ao).length) return ao;
                    return out?.[k];
                };
                out.actionsBySet = preferObj('actionsBySet');
                out.setMeta = preferObj('setMeta');
                out.setStateBySet = preferObj('setStateBySet');
                out.setSummary = preferObj('setSummary');
                out.scoreHistoryBySet = preferObj('scoreHistoryBySet');
                return out;
            };

            const matchLabel = (m) => {
                const home = String(m?.homeTeam || '').trim();
                const away = String(m?.awayTeam || '').trim();
                const my = String(m?.myTeam || m?.teamName || '').trim();
                const opp = String(m?.opponentTeam || '').trim();
                const date = String(m?.matchDate || m?.date || '').trim();
                const vs = (home && away) ? `${home} vs ${away}` : (my && opp ? `${my} vs ${opp}` : '');
                return `${vs}${date ? ` (${date})` : ''}`.trim() || String(m?.id || '').trim() || 'partita';
            };

            const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null;
            const shouldCancel = typeof options?.shouldCancel === 'function' ? options.shouldCancel : null;

            const dedupedLocal = [];
            const idxByKey = new Map();
            for (const m of localMatches) {
                const key = matchKey(m);
                const idx = idxByKey.get(key);
                if (idx == null) {
                    idxByKey.set(key, dedupedLocal.length);
                    dedupedLocal.push(m);
                } else {
                    dedupedLocal[idx] = mergePreferMoreInfo(dedupedLocal[idx], m);
                }
            }
            localMatches = dedupedLocal;

            let synced = 0;
            let index = 0;
            const total = localMatches.length;
            for (const m of localMatches) {
                index++;
                if (shouldCancel && shouldCancel(m)) {
                    if (onProgress) {
                        try { onProgress({ match: m, index, total, status: 'cancelled' }); } catch(_){}
                    }
                    continue;
                }
                let finalStatus = 'done';
                if (onProgress) {
                    try { onProgress({ match: m, index, total, status: 'start' }); } catch(_){}
                }
                try {
                    let teamId = null;
                    try { if (m.teamId) teamId = String(m.teamId); } catch(_){}
                    if (teamId && teamMap.has(teamId)) {
                        teamId = teamMap.get(teamId);
                    }
                    if (!teamId) {
                        const my = String(m.myTeam||m.teamName||'').trim();
                        const home = String(m.homeTeam||'').trim();
                        const away = String(m.awayTeam||'').trim();
                        teamId = teamMap.get(my) || teamMap.get(home) || teamMap.get(away) || null;
                    }
                    if (!teamId) { finalStatus = 'skipped'; continue; }
                    let matchId = String(m?.id || '').trim();
                    if (!matchId) { finalStatus = 'skipped'; continue; }
                    const isNewFormat = matchId.match(/^\d{4}-\d{2}-\d{2}_/);
                    if (!isNewFormat) {
                        try {
                            const generatedId = firestoreService._generateMatchDocId(m);
                            if (generatedId) {
                                const genRef = userRef.collection('teams').doc(String(teamId)).collection('matches').doc(String(generatedId));
                                const genSnap = await genRef.get();
                                if (genSnap.exists) {
                                    matchId = String(generatedId);
                                }
                            }
                        } catch (_) {}
                    }

                    let shouldWrite = true;
                    let shouldSetCreatedAt = true;
                    let cloudMeta = null;

                    try {
                        const matchRef = userRef.collection('teams').doc(String(teamId)).collection('matches').doc(matchId);
                        const snap = await matchRef.get();
                        if (snap.exists) {
                            shouldSetCreatedAt = false;
                            cloudMeta = Object.assign({ id: snap.id }, snap.data() || {});
                        }
                    } catch (_) {}

                    if (cloudMeta && conflictMode !== 'preferLocal') {
                        const localUpdated = toEpochMs(m?.updatedAt) || toEpochMs(m?.scoutingEndTime) || null;
                        const cloudUpdated = toEpochMs(cloudMeta?.updatedAt) || toEpochMs(cloudMeta?.scoutingEndTime) || null;
                        const localMeta = firestoreService._sanitizeMatchMeta(Object.assign({}, m, { id: matchId }));
                        const cloudMetaSan = firestoreService._sanitizeMatchMeta(Object.assign({}, cloudMeta, { id: matchId }));
                        const localSig = JSON.stringify(localMeta);
                        const cloudSig = JSON.stringify(cloudMetaSan);
                        const hasDiff = (localSig !== cloudSig) || (localUpdated && cloudUpdated && localUpdated !== cloudUpdated);

                        if (hasDiff) {
                            if (conflictMode === 'preferCloud') {
                                shouldWrite = false;
                            } else if (conflictMode === 'ask') {
                                let hint = '';
                                if (localUpdated && cloudUpdated) {
                                    if (localUpdated > cloudUpdated) hint = 'Suggerimento: sembrano più recenti i dati locali.';
                                    else if (cloudUpdated > localUpdated) hint = 'Suggerimento: sembrano più recenti i dati cloud.';
                                }
                                const choice = await firestoreService._chooseLocalOrCloud({
                                    title: 'Conflitto dati partita (upload)',
                                    subtitle: String(matchLabel(m) || matchId),
                                    message: '',
                                    hint,
                                    localLabel: 'Invia dati locali',
                                    cloudLabel: 'Mantieni dati Cloud',
                                    defaultChoice: 'local'
                                });
                                shouldWrite = choice !== 'cloud';
                            }
                        }
                    }

                    if (!shouldWrite) { finalStatus = 'skipped'; continue; }

                    try {
                        // Unifica logica di salvataggio usando saveMatchTree
                        // Preserva metadati cloud esistenti se mancano in locale (opzionale, ma utile)
                        const metaSource = (() => {
                            const base = Object.assign({}, m);
                            if (cloudMeta && typeof cloudMeta === 'object') {
                                const fields = ['matchNumber','excelFileName','excelFileUrl','excelFilePath'];
                                fields.forEach((f) => {
                                    const lv = base[f];
                                    const hasLocal = !(lv == null || String(lv).trim() === '');
                                    if (!hasLocal) {
                                        const cv = cloudMeta[f];
                                        if (!(cv == null || String(cv).trim() === '')) base[f] = cv;
                                    }
                                });
                            }
                            return base;
                        })();

                        // Usa saveMatchTree che gestisce automaticamente la creazione del documento unico
                        // e la generazione di ID parlanti se necessario.
                        await firestoreService.saveMatchTree(teamId, Object.assign({}, metaSource, { id: matchId }));
                        synced++;
                    } catch (e) {
                        console.error('Sync error for match', matchId, e);
                        finalStatus = 'error';
                    }
                } catch(_){ 
                    finalStatus = 'error';
                }
                finally {
                    if (onProgress) {
                        try { onProgress({ match: m, index, total, status: finalStatus }); } catch(_){}
                    }
                }
            }
            return { success: true, synced };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    deleteTeamByIdOrName: async (teamId, teamName) => {
        try {
            const userRef = await firestoreService.getUserRefEnsured();
            const idStr = String(teamId||'').trim();
            const nameStr = String(teamName||'').trim();
            const tryIds = [];
            if (idStr) tryIds.push(idStr);
            if (nameStr && !tryIds.includes(nameStr)) tryIds.push(nameStr);
            let deleted = 0;
            for (const dId of tryIds) {
                const teamRef = userRef.collection('teams').doc(dId);
                const snap = await teamRef.get();
                if (snap.exists) {
                    try {
                        const qs = await teamRef.collection('matches').get();
                        const dels = [];
                        qs.forEach(doc => { dels.push(teamRef.collection('matches').doc(doc.id).delete().catch(()=>{})); });
                        await Promise.all(dels);
                    } catch(_) {}
                    await teamRef.delete();
                    deleted++;
                } else {
                    await teamRef.delete().catch(()=>{});
                }
            }
            if (!deleted && nameStr) {
                const parts = nameStr.split(' - ');
                const teamNm = parts[0] || '';
                const clubNm = parts.slice(1).join(' - ');
                if (teamNm) {
                    const qs = await userRef.collection('teams')
                        .where('teamName','==',teamNm)
                        .where('clubName','==',clubNm)
                        .get();
                    const dels = [];
                    qs.forEach(doc => {
                        const tRef = userRef.collection('teams').doc(doc.id);
                        dels.push((async () => {
                            try {
                                const ms = await tRef.collection('matches').get();
                                const mDels = [];
                                ms.forEach(m => { mDels.push(tRef.collection('matches').doc(m.id).delete().catch(()=>{})); });
                                await Promise.all(mDels);
                            } catch(_) {}
                            await tRef.delete();
                        })());
                    });
                    await Promise.all(dels);
                    deleted += dels.length;
                }
                // Prova anche la variante invertita "Società - Squadra"
                const rev = nameStr.includes(' - ') ? (parts.slice(1).join(' - ') + ' - ' + parts[0]) : '';
                if (rev) {
                    const rs = await userRef.collection('teams').doc(rev).get();
                    if (rs.exists) {
                        try {
                            const ms = await userRef.collection('teams').doc(rev).collection('matches').get();
                            const mDels = [];
                            ms.forEach(m => { mDels.push(userRef.collection('teams').doc(rev).collection('matches').doc(m.id).delete().catch(()=>{})); });
                            await Promise.all(mDels);
                        } catch(_) {}
                        await userRef.collection('teams').doc(rev).delete();
                        deleted++;
                    }
                }
            }
            return { success: true, deleted };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    _sanitizeMatchMeta: (match) => ({
        id: String(match.id||Date.now()),
        myTeam: match.myTeam||match.homeTeam||'',
        opponentTeam: match.opponentTeam||match.awayTeam||'',
        homeTeam: match.homeTeam||'',
        awayTeam: match.awayTeam||'',
        homeAway: match.homeAway||'',
        matchType: match.matchType||match.eventType||'partita',
        date: match.matchDate||match.date||new Date().toISOString().slice(0,10),
        description: match.description||'',
        status: match.status||'created',
        currentSet: match.currentSet||1,
        score: match.score||{home:0,away:0},
        matchNumber: match.matchNumber||match.matchNo||match.fileNumber||'',
        excelFileName: match.excelFileName||'',
        excelFileUrl: match.excelFileUrl||'',
        excelFilePath: match.excelFilePath||''
    }),
    _generateInviteToken: (length = 22) => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const bytes = new Uint8Array(length);
        if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
            window.crypto.getRandomValues(bytes);
        } else {
            for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
        }
        let out = '';
        for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
        return out;
    },
    getUserRef: () => {
        const user = authFunctions.getCurrentUser();
        if (!user) throw new Error('Utente non autenticato');
        const userDocId = String(user.email || '').trim();
        if (!userDocId) throw new Error('Email utente non valida');
        return window.db.collection('users').doc(userDocId);
    },
    getUserRefByEmail: (email) => {
        const userDocId = String(email || '').trim();
        if (!userDocId) throw new Error('Email utente non valida');
        return window.db.collection('users').doc(userDocId);
    },
    getUserRefEnsured: async () => {
        const user = authFunctions.getCurrentUser();
        if (!user) throw new Error('Utente non autenticato');
        const userDocId = String(user.email || '').trim();
        if (!userDocId) throw new Error('Email utente non valida');
        const ref = window.db.collection('users').doc(userDocId);
        const snap = await ref.get();
        if (!snap.exists) {
            await ref.set({
                email: user.email,
                role: 'user',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastAccess: firebase.firestore.FieldValue.serverTimestamp(),
                stats: { totalMatches: 0, totalRosters: 0, lastMatchDate: null }
            });
        }
        return ref;
    },

    saveTeam: async (team) => {
        try {
            const userRef = await firestoreService.getUserRefEnsured();
            const teamsRef = userRef.collection('teams');
            const club = String(team.clubName || '').trim();
            const squad = String(team.teamName || team.name || '').trim();
            const combined = (squad ? squad : '').trim() + (club ? ` - ${club}` : '');
            const id = combined || String(team.id || Date.now());
            const docRef = teamsRef.doc(id);
            const data = {
                id,
                name: combined,
                teamName: squad,
                clubName: club,
                players: Array.isArray(team.players) ? team.players : [],
                shared: !!team.shared,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            await docRef.set(data, { merge: true });
            try {
                const currentEmail = String(authFunctions.getCurrentUser()?.email || '').trim();
                if (currentEmail) {
                    const uaRef = docRef.collection('user_access').doc(currentEmail);
                    await uaRef.set({
                        userEmail: currentEmail,
                        role: 'coach',
                        active: true,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                }
            } catch(_) {}
            return { success: true, id };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    updateTeamById: async (teamId, updates = {}) => {
        try {
            const userRef = await firestoreService.getUserRefEnsured();
            const docRef = userRef.collection('teams').doc(String(teamId));
            const squad = String(updates.teamName || '').trim();
            const club = String(updates.clubName || '').trim();
            const combined = (squad ? squad : '').trim() + (club ? ` - ${club}` : '');
            const payload = {
                teamName: squad,
                clubName: club,
                name: combined || String(updates.name || '').trim(),
                shared: !!updates.shared,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (Array.isArray(updates.players)) payload.players = updates.players;
            await docRef.set(payload, { merge: true });
            try {
                const currentEmail = String(authFunctions.getCurrentUser()?.email || '').trim();
                if (currentEmail) {
                    const uaRef = docRef.collection('user_access').doc(currentEmail);
                    await uaRef.set({
                        userEmail: currentEmail,
                        role: 'coach',
                        active: true,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                }
            } catch(_) {}
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    loadUserTeams: async () => {
        try {
            const userRef = await firestoreService.getUserRefEnsured();
            const snap = await userRef.collection('teams').get();
            const teams = [];
            snap.forEach(d => teams.push({ id: d.id, ...d.data() }));
            return { success: true, documents: teams };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    loadSharedTeams: async () => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) return { success: false, error: 'Utente non autenticato' };
            const currentEmail = String(user.email || '').trim();
            if (!currentEmail) return { success: false, error: 'Email utente non valida' };
            const accesses = [];
            try {
                const accessSnap = await window.db.collectionGroup('user_access').where('userEmail', '==', currentEmail).get();
                accessSnap.forEach(d => accesses.push({ ref: d.ref, data: d.data() || {} }));
            } catch (_) {}
            const teams = [];
            for (const access of accesses) {
                const data = access?.data || {};
                if (data?.active === false) continue;
                const teamRef = access?.ref?.parent?.parent;
                if (!teamRef) continue;
                const teamId = String(teamRef?.id || '').trim();
                const ownerId = String(teamRef?.parent?.parent?.id || '').trim();
                if (!ownerId || !teamId) continue;
                if (ownerId === currentEmail) continue;
                try {
                    const teamDoc = await teamRef.get();
                    if (teamDoc.exists) {
                        const data = teamDoc.data() || {};
                        teams.push(Object.assign({ id: teamDoc.id }, data, { _mvsOwner: ownerId, _mvsRole: access?.data?.role || 'observer', source: 'shared' }));
                    }
                } catch (_) {}
            }
            return { success: true, documents: teams };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    getTeamRole: async (teamId, ownerId = null) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) return { success: false, error: 'Utente non autenticato' };
            const currentEmail = String(user.email || '').trim();
            const tId = String(teamId || '').trim();
            if (!tId) return { success: false, error: 'teamId non valido' };
            const owner = String(ownerId || currentEmail || '').trim();
            if (!owner) return { success: false, error: 'ownerId non valido' };
            if (owner === currentEmail) return { success: true, role: 'coach', ownerId: owner };
            let data = null;
            try {
                const ownerRef = firestoreService.getUserRefByEmail(owner);
                const accessSnap = await ownerRef.collection('teams').doc(tId).collection('user_access').doc(currentEmail).get();
                if (accessSnap.exists) data = accessSnap.data() || {};
            } catch (_) {}
            if (!data) {
                try {
                    const safeEmail = currentEmail.replace('.', '_');
                    const ownerRef = firestoreService.getUserRefByEmail(owner);
                    const accessSnap = await ownerRef.collection('teams').doc(tId).collection('user_access').doc(safeEmail).get();
                    if (accessSnap.exists) data = accessSnap.data() || {};
                } catch (_) {}
            }
            if (data) {
                if (data?.active === false) return { success: true, role: 'none', ownerId: owner };
                return { success: true, role: data?.role || 'observer', ownerId: owner };
            }
            return { success: true, role: 'none', ownerId: owner };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    createTeamInvite: async (teamId) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) return { success: false, error: 'Utente non autenticato' };
            const ownerId = String(user.email || '').trim();
            const tId = String(teamId || '').trim();
            if (!tId) return { success: false, error: 'teamId non valido' };
            const userRef = await firestoreService.getUserRefEnsured();
            const teamDoc = await userRef.collection('teams').doc(tId).get();
            if (!teamDoc.exists) return { success: false, error: 'Team non trovato' };
            const team = teamDoc.data() || {};
            let inviteId = firestoreService._generateInviteToken(24);
            let tries = 0;
            const invitesRef = userRef.collection('invites');
            
            while (tries < 3) {
                const exists = await invitesRef.doc(inviteId).get();
                if (!exists.exists) break;
                inviteId = firestoreService._generateInviteToken(24);
                tries++;
            }
            const payload = {
                ownerId,
                teamId: tId,
                role: 'observer',
                inviteId: inviteId, // Aggiunto per query collectionGroup
                active: true,
                teamName: String(team?.teamName || '').trim(),
                clubName: String(team?.clubName || '').trim(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            await invitesRef.doc(inviteId).set(payload);
            try { await userRef.collection('teams').doc(tId).set({ shared: true }, { merge: true }); } catch(_) {}
            const base = (window.location && window.location.origin) ? window.location.origin : '';
            const link = `${base}/my-teams.html?invite=${encodeURIComponent(inviteId)}&owner=${encodeURIComponent(ownerId)}`;
            return { success: true, inviteId, link, payload };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    acceptTeamInvite: async (inviteId, optionalOwnerId = null) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) return { success: false, error: 'Utente non autenticato' };
            const token = String(inviteId || '').trim();
            if (!token) return { success: false, error: 'Invito non valido' };
            
            // Try to resolve ownerId: from param or try to infer? 
            // We cannot infer easily without ownerId if it's in a subcollection.
            // But let's check if the inviteId is old-style (global) or new-style (subcollection).
            // Actually, we must rely on ownerId being passed or provided.
            
            let inviteDoc = null;
            let ownerId = String(optionalOwnerId || '').trim();

            if (ownerId) {
                 // New style: users/{ownerId}/invites/{inviteId}
                 try {
                     const ownerRef = firestoreService.getUserRefByEmail(ownerId);
                     inviteDoc = await ownerRef.collection('invites').doc(token).get();
                 } catch(e) { console.error('Error fetching subcollection invite', e); }
            }
            
            // Fallback: prova con replace punto se non trovato
            if (ownerId && (!inviteDoc || !inviteDoc.exists)) {
                 try {
                     const safeOwner = ownerId.replace('.', '_');
                     if (safeOwner !== ownerId) {
                         const ownerRef = firestoreService.getUserRefByEmail(safeOwner);
                         inviteDoc = await ownerRef.collection('invites').doc(token).get();
                         if (inviteDoc.exists) {
                             ownerId = safeOwner; // Usa questo ownerId per il resto
                         }
                     }
                 } catch(e) { console.error('Error fetching subcollection invite fallback', e); }
            }
            
            // Fallback for backward compatibility: check global collection if not found in subcollection
            if (!inviteDoc || !inviteDoc.exists) {
                 try {
                     inviteDoc = await window.db.collection('teamInvites').doc(token).get();
                 } catch(_) {}
            }
            
            // Ultimo tentativo: cerca in tutte le sottocollezioni 'invites' tramite inviteId
            if (!inviteDoc || !inviteDoc.exists) {
                try {
                    const q = await window.db.collectionGroup('invites').where('inviteId', '==', token).limit(1).get();
                    if (!q.empty) {
                        inviteDoc = q.docs[0];
                    }
                } catch(_) {}
            }

            if (!inviteDoc || !inviteDoc.exists) return { success: false, error: 'Invito non trovato' };
            
            const invite = inviteDoc.data() || {};
            if (invite?.active === false) return { success: false, error: 'Invito non attivo' };
            
            ownerId = String(invite?.ownerId || ownerId || '').trim();
            const teamId = String(invite?.teamId || '').trim();
            
            if (!ownerId || !teamId) return { success: false, error: 'Invito non valido' };
            
            const userRef = await firestoreService.getUserRefEnsured();
            const currentEmail = String(user.email || '').trim();
            const payload = {
                ownerId,
                teamId,
                userEmail: currentEmail,
                role: 'observer',
                inviteId: token,
                active: true,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            try {
                const ownerRef = firestoreService.getUserRefByEmail(ownerId);
                const teamRef = ownerRef.collection('teams').doc(teamId);
                await teamRef.collection('user_access').doc(currentEmail).set(payload, { merge: true });
                await teamRef.set({ shared: true }, { merge: true });
            } catch (_) {}
            let teamData = null;
            try {
                const ownerRef = firestoreService.getUserRefByEmail(ownerId);
                const teamDoc = await ownerRef.collection('teams').doc(teamId).get();
                if (teamDoc.exists) teamData = Object.assign({ id: teamDoc.id }, teamDoc.data() || {});
            } catch (_) {}
            return { success: true, accessId: String(teamId || ''), invite: Object.assign({}, invite), team: teamData };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    hydrateTeamsFromFirestore: async (options = {}) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) return { success: false, error: 'Utente non autenticato' };

            const res = await firestoreService.loadUserTeams();
            if (!res?.success) return { success: false, error: res?.error || 'Errore caricamento squadre' };

            let localTeams = [];
            try { localTeams = JSON.parse(localStorage.getItem('volleyTeams') || '[]'); } catch (_) { localTeams = []; }
            if (!Array.isArray(localTeams)) localTeams = [];

            const toEpochMs = (v) => {
                try {
                    if (!v) return null;
                    if (typeof v === 'number' && isFinite(v)) return v;
                    if (typeof v === 'string') {
                        const t = Date.parse(v);
                        return Number.isFinite(t) ? t : null;
                    }
                    if (typeof v.toMillis === 'function') return v.toMillis();
                    if (typeof v.seconds === 'number') return (v.seconds * 1000) + Math.floor((v.nanoseconds || 0) / 1e6);
                    return null;
                } catch (_) { return null; }
            };

            const normalizeTeamFromFs = (doc) => {
                const idStr = String(doc?.id || '').trim();
                const hasDash = idStr.includes(' - ');
                const parts = hasDash ? idStr.split(' - ') : [];
                const clubFromId = hasDash ? String(parts[0] || '').trim() : '';
                const teamFromId = hasDash ? String(parts.slice(1).join(' - ') || '').trim() : '';
                const teamName = String(doc?.teamName || teamFromId || '').trim();
                const clubName = String(doc?.clubName || clubFromId || '').trim();
                const canonicalName = (teamName ? teamName : '').trim() + (clubName ? ` - ${clubName}` : '');
                return {
                    id: idStr || canonicalName || String(Date.now()),
                    name: canonicalName || idStr,
                    teamName,
                    clubName,
                    players: Array.isArray(doc?.players) ? doc.players : [],
                    _updatedAt: doc?.updatedAt || null
                };
            };

            const byId = new Map();
            for (const t of localTeams) {
                const id = String(t?.id || '').trim();
                if (id) byId.set(id, t);
            }

            const conflictMode = String(options?.conflictMode || 'ask');
            const defaultChoice = options?.defaultChoice === 'cloud' ? 'cloud' : 'local';
            let merged = 0;
            for (const doc of (Array.isArray(res.documents) ? res.documents : [])) {
                const fsTeam = normalizeTeamFromFs(doc);
                const id = String(fsTeam.id || '').trim();
                if (!id) continue;

                const bySameId = byId.get(id);
                const bySameName = !bySameId ? localTeams.find(t => String(t?.name || '').trim() && String(t?.name || '').trim() === String(fsTeam.name || '').trim()) : null;
                const existing = bySameId || bySameName;
                if (existing) {
                    const existingId = String(existing?.id || '').trim();
                    const localPlayers = Array.isArray(existing.players) ? existing.players : [];
                    const fsPlayers = Array.isArray(fsTeam.players) ? fsTeam.players : [];
                    const localName = String(existing?.name || '').trim();
                    const fsName = String(fsTeam?.name || '').trim();
                    const localTeamName = String(existing?.teamName || '').trim();
                    const fsTeamName = String(fsTeam?.teamName || '').trim();
                    const localClubName = String(existing?.clubName || '').trim();
                    const fsClubName = String(fsTeam?.clubName || '').trim();
                    const localUpdated = toEpochMs(existing?.updatedAt) || null;
                    const fsUpdated = toEpochMs(fsTeam?._updatedAt) || null;

                    const hasDiff =
                        (localPlayers.length && fsPlayers.length && localPlayers.length !== fsPlayers.length) ||
                        (localTeamName && fsTeamName && localTeamName !== fsTeamName) ||
                        (localClubName && fsClubName && localClubName !== fsClubName) ||
                        (localName && fsName && localName !== fsName) ||
                        (localUpdated && fsUpdated && localUpdated !== fsUpdated);

                    let useLocal = true;
                    if (hasDiff) {
                        if (conflictMode === 'preferCloud') {
                            useLocal = false;
                        } else if (conflictMode === 'preferLocal') {
                            useLocal = true;
                        } else {
                            let msg = `Conflitto dati squadra:\n${fsTeam.name || existing.name || id}\n\nUsare dati LOCALI (OK) o CLOUD (Annulla)?`;
                            if (localUpdated && fsUpdated) {
                                const newer = localUpdated > fsUpdated ? 'locali' : (fsUpdated > localUpdated ? 'cloud' : null);
                                if (newer) msg += `\n\nSuggerimento: sembrano più recenti i dati ${newer}.`;
                            }
                            try {
                                const hint = (localUpdated && fsUpdated)
                                    ? ((localUpdated > fsUpdated) ? 'Suggerimento: sembrano più recenti i dati locali.' : ((fsUpdated > localUpdated) ? 'Suggerimento: sembrano più recenti i dati cloud.' : ''))
                                    : '';
                                const choice = await firestoreService._chooseLocalOrCloud({
                                    title: 'Conflitto dati squadra',
                                    subtitle: String(fsTeam.name || existing.name || id),
                                    message: '',
                                    hint,
                                    localLabel: 'Usa dati locali',
                                    cloudLabel: 'Usa dati Cloud',
                                    defaultChoice
                                });
                                useLocal = choice !== 'cloud';
                            } catch (_) { useLocal = true; }
                        }
                    }

                    const chosen = useLocal
                        ? Object.assign({}, fsTeam, existing)
                        : Object.assign({}, existing, fsTeam);

                    chosen.id = id;
                    chosen.teamName = String(chosen.teamName || '').trim() || fsTeam.teamName;
                    chosen.clubName = String(chosen.clubName || '').trim() || fsTeam.clubName;
                    chosen.name = (chosen.teamName ? String(chosen.teamName).trim() : '').trim() + ((chosen.clubName ? ` - ${String(chosen.clubName).trim()}` : ''));
                    chosen.players = Array.isArray(chosen.players) ? chosen.players : (useLocal ? localPlayers : fsPlayers);

                    if (!bySameId && existingId && existingId !== id) byId.delete(existingId);
                    byId.set(id, chosen);
                    merged++;
                } else {
                    byId.set(id, fsTeam);
                    merged++;
                }
            }

            const out = Array.from(byId.values()).map(t => ({
                id: String(t.id || '').trim(),
                name: String(t.name || '').trim(),
                teamName: String(t.teamName || '').trim(),
                clubName: String(t.clubName || '').trim(),
                players: Array.isArray(t.players) ? t.players : []
            })).filter(t => t.id || t.name);

            localStorage.setItem('volleyTeams', JSON.stringify(out));
            return { success: true, merged };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    hydrateTeamMatchesFromFirestore: async (teamId, options = {}) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) return { success: false, error: 'Utente non autenticato' };

            const tId = String(teamId || '').trim();
            if (!tId) return { success: false, error: 'teamId non valido' };

            const res = await firestoreService.loadTeamMatches(tId);
            if (!res?.success) return { success: false, error: res?.error || 'Errore caricamento partite squadra' };

            let all = [];
            try { all = JSON.parse(localStorage.getItem('volleyMatches') || '[]'); } catch (_) { all = []; }
            if (!Array.isArray(all)) all = [];

            let teamName = '';
            try {
                const teams = JSON.parse(localStorage.getItem('volleyTeams') || '[]');
                const found = Array.isArray(teams) ? teams.find(t => String(t?.id || '').trim() === tId) : null;
                teamName = String(found?.name || '').trim();
            } catch (_) { teamName = ''; }

            const isMatchForTeam = (m) => {
                const mid = String(m?.teamId || '').trim();
                if (mid && mid === tId) return true;
                if (!teamName) return false;
                const my = String(m?.myTeam || m?.teamName || '').trim();
                const home = String(m?.homeTeam || '').trim();
                const away = String(m?.awayTeam || '').trim();
                return (my && my === teamName) || (home && home === teamName) || (away && away === teamName);
            };

            const existingLocalTeamMatches = all.filter(isMatchForTeam);

            const localById = new Map();
            for (const m of existingLocalTeamMatches) {
                const id = String(m?.id || '').trim();
                if (id) localById.set(id, m);
            }

            const fsDocs = Array.isArray(res.documents) ? res.documents : [];
            const matchIds = Array.isArray(options?.matchIds) ? options.matchIds.map(v => String(v || '').trim()).filter(Boolean) : [];
            const matchIdSet = matchIds.length ? new Set(matchIds) : null;
            const fsById = new Map();
            for (const d of fsDocs) {
                const id = String(d?.id || '').trim();
                if (!id) continue;
                if (matchIdSet && !matchIdSet.has(id)) continue;
                const dateStr = String(d?.date || d?.matchDate || '').trim();
                const matchType = d?.matchType || d?.eventType || '';
                const base = Object.assign({}, d);
                base.id = id;
                base.teamId = tId;
                if (dateStr && !base.matchDate) base.matchDate = dateStr;
                if (!base.date && dateStr) base.date = dateStr;
                if (matchType && !base.eventType) base.eventType = matchType;
                fsById.set(id, base);
            }

            const toEpochMs = (v) => {
                try {
                    if (!v) return null;
                    if (typeof v === 'number' && isFinite(v)) return v;
                    if (typeof v === 'string') {
                        const t = Date.parse(v);
                        return Number.isFinite(t) ? t : null;
                    }
                    if (typeof v.toMillis === 'function') return v.toMillis();
                    if (typeof v.seconds === 'number') return (v.seconds * 1000) + Math.floor((v.nanoseconds || 0) / 1e6);
                    return null;
                } catch (_) { return null; }
            };

            const matchLabel = (m) => {
                const home = String(m?.homeTeam || '').trim();
                const away = String(m?.awayTeam || '').trim();
                const my = String(m?.myTeam || m?.teamName || '').trim();
                const opp = String(m?.opponentTeam || '').trim();
                const date = String(m?.matchDate || m?.date || '').trim();
                const vs = (home && away) ? `${home} vs ${away}` : (my && opp ? `${my} vs ${opp}` : '');
                return `${vs}${date ? ` (${date})` : ''}`.trim() || String(m?.id || '').trim() || 'partita';
            };

            const conflictMode = String(options?.conflictMode || 'ask');
            const defaultChoice = options?.defaultChoice === 'cloud' ? 'cloud' : 'local';
            const mergedTeam = [];
            for (const [id, fsMatch] of fsById.entries()) {
                const existing = localById.get(id);
                if (existing) {
                    const localUpdated = toEpochMs(existing?.updatedAt) || toEpochMs(existing?.scoutingEndTime) || null;
                    const fsUpdated = toEpochMs(fsMatch?.updatedAt) || toEpochMs(fsMatch?.scoutingEndTime) || null;
                    const localSig = JSON.stringify({
                        matchDate: String(existing?.matchDate || existing?.date || '').trim(),
                        opponentTeam: String(existing?.opponentTeam || '').trim(),
                        homeTeam: String(existing?.homeTeam || '').trim(),
                        awayTeam: String(existing?.awayTeam || '').trim(),
                        status: String(existing?.status || '').trim()
                    });
                    const fsSig = JSON.stringify({
                        matchDate: String(fsMatch?.matchDate || fsMatch?.date || '').trim(),
                        opponentTeam: String(fsMatch?.opponentTeam || '').trim(),
                        homeTeam: String(fsMatch?.homeTeam || '').trim(),
                        awayTeam: String(fsMatch?.awayTeam || '').trim(),
                        status: String(fsMatch?.status || '').trim()
                    });
                    const hasDiff = (localSig !== fsSig) || (localUpdated && fsUpdated && localUpdated !== fsUpdated);

                    let useLocal = true;
                    if (hasDiff) {
                        if (conflictMode === 'preferCloud') {
                            useLocal = false;
                        } else if (conflictMode === 'preferLocal') {
                            useLocal = true;
                        } else {
                            let msg = `Conflitto dati partita:\n${matchLabel(existing) || matchLabel(fsMatch)}\n\nUsare dati LOCALI (OK) o CLOUD (Annulla)?`;
                            if (localUpdated && fsUpdated) {
                                const newer = localUpdated > fsUpdated ? 'locali' : (fsUpdated > localUpdated ? 'cloud' : null);
                                if (newer) msg += `\n\nSuggerimento: sembrano più recenti i dati ${newer}.`;
                            }
                            try {
                                const hint = (localUpdated && fsUpdated)
                                    ? ((localUpdated > fsUpdated) ? 'Suggerimento: sembrano più recenti i dati locali.' : ((fsUpdated > localUpdated) ? 'Suggerimento: sembrano più recenti i dati cloud.' : ''))
                                    : '';
                                const choice = await firestoreService._chooseLocalOrCloud({
                                    title: 'Conflitto dati partita',
                                    subtitle: String(matchLabel(existing) || matchLabel(fsMatch)),
                                    message: '',
                                    hint,
                                    localLabel: 'Usa dati locali',
                                    cloudLabel: 'Usa dati Cloud',
                                    defaultChoice
                                });
                                useLocal = choice !== 'cloud';
                            } catch (_) { useLocal = true; }
                        }
                    }

                    const mergedMatch = useLocal
                        ? Object.assign({}, fsMatch, existing)
                        : Object.assign({}, existing, fsMatch);

                    mergedMatch._mvsSource = useLocal ? 'local' : 'cloud';
                    mergedMatch.id = id;
                    mergedMatch.teamId = tId;
                    mergedMatch.matchDate = mergedMatch.matchDate || mergedMatch.date || fsMatch.matchDate || fsMatch.date || '';
                    mergedTeam.push(mergedMatch);
                } else {
                    mergedTeam.push(fsMatch);
                }
            }

            const detailsMode = String(options?.detailsMode || 'none');
            const maxDetails = Number(options?.maxDetails || 0);
            const shouldLoadDetails = detailsMode === 'all' || (detailsMode === 'recent' && maxDetails > 0);
            const idsForDetails = shouldLoadDetails
                ? (detailsMode === 'all'
                    ? mergedTeam.map(m => String(m?.id || '').trim()).filter(Boolean)
                    : mergedTeam.slice(0, maxDetails).map(m => String(m?.id || '').trim()).filter(Boolean))
                : [];

            let detailsLoaded = 0;
            for (const mId of idsForDetails) {
                try {
                    const r = await firestoreService.getMatchData(tId, mId);
                    if (r?.success) {
                        const idx = mergedTeam.findIndex(m => String(m?.id || '') === mId);
                        if (idx >= 0) {
                            const cur = mergedTeam[idx] || {};
                            const roster = Array.isArray(r.roster) ? r.roster : [];
                            const details = r.details || {};
                            const updated = Object.assign({}, cur);
                            const shouldOverride = String(updated?._mvsSource || '') === 'cloud';
                            if (roster.length && (shouldOverride || !(Array.isArray(updated.roster) && updated.roster.length))) updated.roster = roster;
                            if (details && typeof details === 'object') {
                                if (shouldOverride || !updated.actionsBySet) updated.actionsBySet = details.actionsBySet || {};
                                if (shouldOverride || !updated.setMeta) updated.setMeta = details.setMeta || {};
                                if (shouldOverride || !updated.setStateBySet) updated.setStateBySet = details.setStateBySet || {};
                                if (shouldOverride || !updated.setSummary) updated.setSummary = details.setSummary || {};
                                if (shouldOverride || !updated.scoreHistoryBySet) updated.scoreHistoryBySet = details.scoreHistoryBySet || {};
                            }
                            mergedTeam[idx] = updated;
                        }
                        detailsLoaded++;
                    }
                } catch (_) { }
            }

            const mergedIds = new Set(mergedTeam.map(m => String(m?.id || '').trim()).filter(Boolean));
            const localOnly = existingLocalTeamMatches.filter(m => {
                const id = String(m?.id || '').trim();
                return id && !mergedIds.has(id);
            });

            const others = all.filter(m => !isMatchForTeam(m));
            const localOnlyWithTeam = localOnly.map(m => {
                if (m && (!m.teamId || String(m.teamId).trim() !== tId)) return Object.assign({}, m, { teamId: tId });
                return m;
            });
            const combinedTeam = mergedTeam.concat(localOnlyWithTeam).map((m) => {
                const out = Object.assign({}, m);
                const src = String(out?.source || '').toLowerCase();
                if (src.startsWith('firestore')) out.source = 'local_hydrated';
                return out;
            });
            combinedTeam.sort((a, b) => {
                const da = String(a?.matchDate || a?.date || a?.updatedAt || a?.createdAt || '');
                const db = String(b?.matchDate || b?.date || b?.updatedAt || b?.createdAt || '');
                if (da === db) return 0;
                return da < db ? 1 : -1;
            });

            const nextAll = others.concat(combinedTeam);

            const dedupeKey = (m) => {
                const t = String(m?.teamId || '').trim();
                const date = String(m?.matchDate || m?.date || '').trim();
                const status = String(m?.status || '').trim();
                const type = String(m?.eventType || m?.matchType || '').trim();
                const home = String(m?.homeTeam || m?.myTeam || m?.teamName || '').trim();
                const away = String(m?.awayTeam || m?.opponentTeam || '').trim();
                if (date || home || away || status || type) return `sig:${t}|${date}|${home}|${away}|${status}|${type}`;
                const id = String(m?.id || '').trim();
                if (id) return `id:${t}|${id}`;
                return `raw:${t}|${String(m?.createdAt || m?.updatedAt || '')}`;
            };

            const matchScore = (m) => {
                let s = 0;
                try {
                    if (Array.isArray(m?.roster) && m.roster.length) s += 6;
                    if (m?.actionsBySet && typeof m.actionsBySet === 'object' && Object.keys(m.actionsBySet).length) s += 8;
                    if (m?.setMeta && typeof m.setMeta === 'object' && Object.keys(m.setMeta).length) s += 4;
                    if (m?.setStateBySet && typeof m.setStateBySet === 'object' && Object.keys(m.setStateBySet).length) s += 3;
                    if (m?.setSummary && typeof m.setSummary === 'object' && Object.keys(m.setSummary).length) s += 3;
                    if (m?.scoreHistoryBySet && typeof m.scoreHistoryBySet === 'object' && Object.keys(m.scoreHistoryBySet).length) s += 2;
                    if (Array.isArray(m?.sets) && m.sets.length) s += 1;
                    const score = m?.score;
                    if (score && typeof score === 'object' && (Number(score.home || 0) || Number(score.away || 0))) s += 1;
                } catch (_) { }
                return s;
            };

            const mergePreferMoreInfo = (a, b) => {
                const aScore = matchScore(a);
                const bScore = matchScore(b);
                const aTime = toEpochMs(a?.updatedAt) || toEpochMs(a?.scoutingEndTime) || toEpochMs(a?.createdAt) || 0;
                const bTime = toEpochMs(b?.updatedAt) || toEpochMs(b?.scoutingEndTime) || toEpochMs(b?.createdAt) || 0;

                const primary = (bScore > aScore) || (bScore === aScore && bTime > aTime) ? b : a;
                const secondary = primary === a ? b : a;
                const out = Object.assign({}, secondary, primary);

                const aRoster = Array.isArray(a?.roster) ? a.roster : [];
                const bRoster = Array.isArray(b?.roster) ? b.roster : [];
                if (aRoster.length || bRoster.length) out.roster = (bRoster.length > aRoster.length) ? bRoster : aRoster;

                const ensureObj = (v) => (v && typeof v === 'object') ? v : null;
                const preferObj = (k) => {
                    const ao = ensureObj(a?.[k]);
                    const bo = ensureObj(b?.[k]);
                    if (bo && Object.keys(bo).length) return bo;
                    if (ao && Object.keys(ao).length) return ao;
                    return out?.[k];
                };

                out.actionsBySet = preferObj('actionsBySet');
                out.setMeta = preferObj('setMeta');
                out.setStateBySet = preferObj('setStateBySet');
                out.setSummary = preferObj('setSummary');
                out.scoreHistoryBySet = preferObj('scoreHistoryBySet');

                return out;
            };

            const deduped = [];
            const indexByKey = new Map();
            for (const m of nextAll) {
                const key = dedupeKey(m);
                const idx = indexByKey.get(key);
                if (idx == null) {
                    indexByKey.set(key, deduped.length);
                    deduped.push(m);
                } else {
                    deduped[idx] = mergePreferMoreInfo(deduped[idx], m);
                }
            }

            localStorage.setItem('volleyMatches', JSON.stringify(deduped));

            return { success: true, hydrated: mergedTeam.length, detailsLoaded };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    hydrateUserDataToLocal: async (options = {}) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) return { success: false, error: 'Utente non autenticato' };

            const teamsRes = await firestoreService.hydrateTeamsFromFirestore(options);
            if (!teamsRes?.success) return teamsRes;

            const hydrateMatches = options?.hydrateMatches === true;
            let matchesHydrated = 0;
            let detailsLoaded = 0;

            if (hydrateMatches) {
                let teams = [];
                try { teams = JSON.parse(localStorage.getItem('volleyTeams') || '[]'); } catch (_) { teams = []; }
                if (!Array.isArray(teams)) teams = [];

                for (const t of teams) {
                    const id = String(t?.id || '').trim();
                    if (!id) continue;
                    const r = await firestoreService.hydrateTeamMatchesFromFirestore(id, options);
                    if (r?.success) {
                        matchesHydrated += Number(r.hydrated || 0);
                        detailsLoaded += Number(r.detailsLoaded || 0);
                    }
                }
            }

            return { success: true, teamsMerged: Number(teamsRes.merged || 0), matchesHydrated, detailsLoaded };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // --- FUNZIONI DI SUPPORTO PER FORMATTAZIONE ID PARLANTI ---
    _formatMatchDate: (dateStr) => {
        try {
            if (!dateStr) return '0000-00-00';
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return String(dateStr).substring(0, 10);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        } catch (_) { return '0000-00-00'; }
    },

    _sanitizeForId: (str) => {
        return String(str || 'unknown').trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
    },

    _generateMatchDocId: (match) => {
        const date = firestoreService._formatMatchDate(match.date || match.matchDate || match.createdAt);
        const time = (match.time || '00:00').replace(':', '');
        const opp = firestoreService._sanitizeForId(match.opponentTeam || match.opponent || 'avversario');
        // Usa data_ora_avversario per unicità deterministica
        // Se non c'è ora, sarà 0000, che va bene per partite singole giornaliere.
        // Se ci sono più partite lo stesso giorno contro lo stesso avversario senza orario, si sovrascriveranno.
        // È un compromesso accettabile per avere ID parlanti.
        return `${date}_${time}_${opp}`;
    },

    saveMatchTree: async (teamId, match) => {
        try {
            const userRef = await firestoreService.getUserRefEnsured();
            // Determina il nuovo ID se non esiste, o mantieni quello esistente se valido (ma migra struttura)
            // Se match.id è già nel formato nuovo, usalo. Altrimenti generane uno nuovo se è un ID vecchio stile (timestamp numerico)
            // o se è vuoto.
            let matchDocId = String(match.id || '').trim();
            const isNewFormat = matchDocId.match(/^\d{4}-\d{2}-\d{2}_/);
            if (!matchDocId) {
                matchDocId = firestoreService._generateMatchDocId(match);
            }

            const matchesRef = userRef.collection('teams').doc(String(teamId)).collection('matches');
            const matchDoc = matchesRef.doc(matchDocId);
            
            // Preparazione payload UNICO (single document)
            const meta = firestoreService._sanitizeMatchMeta(match);
            
            // Roster
            const roster = Array.isArray(match.roster) ? firestoreService._sanitizeRosterPlayers(match.roster) : [];
            
            // Dettagli Sets
            const setsData = {};
            const actionsBySet = match.actionsBySet || {};
            const setMeta = match.setMeta || {};
            const setStateBySet = match.setStateBySet || {};
            const setSummary = match.setSummary || {};
            const scoreHistoryBySet = match.scoreHistoryBySet || {};
            
            // Unifica i dati dei set in un oggetto strutturato
            for (let i = 1; i <= 6; i++) {
                if (actionsBySet[i] || setMeta[i] || setStateBySet[i] || setSummary[i]) {
                    setsData[i] = {
                        actions: actionsBySet[i] || [],
                        meta: setMeta[i] || {},
                        state: setStateBySet[i] || {},
                        summary: setSummary[i] || {},
                        scoreHistory: scoreHistoryBySet[i] || []
                    };
                }
            }

            const payload = {
                id: matchDocId,
                // Metadati principali
                date: meta.date,
                matchDate: meta.date, // ridondanza utile
                time: meta.time || '',
                matchType: meta.matchType,
                homeTeam: meta.homeTeam,
                awayTeam: meta.awayTeam,
                opponentTeam: meta.opponentTeam,
                myTeam: meta.myTeam,
                location: meta.location || '',
                description: meta.description || '',
                status: meta.status,
                score: meta.score, // { home, away }
                finalResult: meta.finalResult || '',
                
                // Roster completo
                roster: roster,
                
                // Dettagli completi dei set
                sets: setsData,
                
                // Timestamps
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            // Gestione createdAt
            let shouldSetCreatedAt = true;
            try {
                const snap = await matchDoc.get();
                if (snap.exists) shouldSetCreatedAt = false;
            } catch (_) {}
            
            if (shouldSetCreatedAt) {
                payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            }

            // Scrittura documento unico (sovrascrive o merge)
            await matchDoc.set(payload, { merge: true });

            return { success: true, id: matchDocId };
        } catch (error) {
            console.error('SaveMatch error:', error);
            return { success: false, error: error.message };
        }
    },

    // Funzione legacy mantenuta per compatibilità chiamate, ma ora usa saveMatchTree unificato
    saveMatchDetailsTree: async (teamId, matchId, details) => {
         // In questo nuovo schema, i dettagli sono parte del documento principale.
         // Se viene chiamata questa funzione, dobbiamo aggiornare il documento principale.
         // Richiede che 'details' contenga le chiavi corrette.
         try {
             const userRef = await firestoreService.getUserRefEnsured();
             const matchDoc = userRef.collection('teams').doc(String(teamId)).collection('matches').doc(String(matchId));
             
             // Mappa i dettagli nella nuova struttura 'sets'
             const setsUpdate = {};
             const keys = ['actionsBySet', 'setMeta', 'setStateBySet', 'setSummary', 'scoreHistoryBySet'];
             
             // Poiché Firestore merge non supporta facilmente deep merge di mappe nested senza dot notation,
             // e qui stiamo ristrutturando, è meglio leggere prima o usare dot notation.
             // Usiamo dot notation per aggiornare campi specifici
             const updates = {
                 updatedAt: firebase.firestore.FieldValue.serverTimestamp()
             };
             
             // Costruiamo updates con dot notation es: "sets.1.actions"
             for (let i = 1; i <= 6; i++) {
                 if (details.actionsBySet && details.actionsBySet[i]) updates[`sets.${i}.actions`] = details.actionsBySet[i];
                 if (details.setMeta && details.setMeta[i]) updates[`sets.${i}.meta`] = details.setMeta[i];
                 if (details.setStateBySet && details.setStateBySet[i]) updates[`sets.${i}.state`] = details.setStateBySet[i];
                 if (details.setSummary && details.setSummary[i]) updates[`sets.${i}.summary`] = details.setSummary[i];
                 if (details.scoreHistoryBySet && details.scoreHistoryBySet[i]) updates[`sets.${i}.scoreHistory`] = details.scoreHistoryBySet[i];
             }
             
             await matchDoc.update(updates);
             return { success: true };
         } catch (error) {
             return { success: false, error: error.message };
         }
    },

    saveMatchRosterTree: async (teamId, matchId, rosterData) => {
        try {
            const userRef = await firestoreService.getUserRefEnsured();
            const matchDoc = userRef.collection('teams').doc(String(teamId)).collection('matches').doc(String(matchId));
            await matchDoc.update({
                roster: firestoreService._sanitizeRosterPlayers(rosterData),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    saveSetStartTree: async (teamId, matchId, setNumber, payload) => {
        try {
             const userRef = await firestoreService.getUserRefEnsured();
             const matchDoc = userRef.collection('teams').doc(String(teamId)).collection('matches').doc(String(matchId));
             const key = `sets.${setNumber}.meta`; // Assumiamo che start info vada in meta
             // Nota: payload contiene phase, rotation, opponentRotation, startTime
             // Dobbiamo fare merge con esistente meta se c'è, ma update con dot notation sostituisce l'oggetto a quella chiave se non usiamo nested field paths.
             // Per sicurezza usiamo set con merge su campi specifici se possibile, o update puntuali.
             const updates = {
                 [`sets.${setNumber}.meta.phase`]: payload?.phase || 'servizio',
                 [`sets.${setNumber}.meta.rotation`]: payload?.rotation || 'P1',
                 [`sets.${setNumber}.meta.opponentRotation`]: payload?.opponentRotation || 'P1',
                 [`sets.${setNumber}.meta.startTime`]: payload?.startTime || new Date().toISOString(),
                 updatedAt: firebase.firestore.FieldValue.serverTimestamp()
             };
             await matchDoc.update(updates);
             return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    loadTeamMatches: async (teamId) => {
        try {
            const userRef = await firestoreService.getUserRefEnsured();
            const matchesSnap = await userRef.collection('teams').doc(String(teamId)).collection('matches').orderBy('createdAt','desc').get();
            const out = [];
            matchesSnap.forEach(doc => { 
                const data = doc.data();
                // Adatta la struttura per il frontend che si aspetta i campi "flat" per i dettagli se necessario,
                // o lascia che il frontend gestisca la nuova struttura.
                // Per compatibilità immediata, rimappiamo 'sets' nei vecchi oggetti *BySet se il frontend li usa.
                const adapted = { id: doc.id, ...data, source: 'firestore_team' };
                adapted.teamId = String(teamId);
                
                if (data.sets) {
                    adapted.actionsBySet = {};
                    adapted.setMeta = {};
                    adapted.setStateBySet = {};
                    adapted.setSummary = {};
                    adapted.scoreHistoryBySet = {};
                    
                    Object.keys(data.sets).forEach(k => {
                        const s = data.sets[k];
                        if (s.actions) adapted.actionsBySet[k] = s.actions;
                        if (s.meta) adapted.setMeta[k] = s.meta;
                        if (s.state) adapted.setStateBySet[k] = s.state;
                        if (s.summary) adapted.setSummary[k] = s.summary;
                        if (s.scoreHistory) adapted.scoreHistoryBySet[k] = s.scoreHistory;
                    });
                }
                out.push(adapted); 
            });
            return { success: true, documents: out };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    loadTeamMatchesByOwner: async (ownerId, teamId) => {
        try {
            const owner = String(ownerId || '').trim();
            if (!owner) return { success: false, error: 'ownerId non valido' };
            const matchesSnap = await firestoreService.getUserRefByEmail(owner)
                .collection('teams').doc(String(teamId)).collection('matches').orderBy('createdAt','desc').get();
            const out = [];
            matchesSnap.forEach(doc => { 
                const data = doc.data();
                const adapted = { id: doc.id, ...data, source: 'firestore_team' };
                adapted.teamId = String(teamId);
                if (data.sets) {
                    adapted.actionsBySet = {};
                    adapted.setMeta = {};
                    adapted.setStateBySet = {};
                    adapted.setSummary = {};
                    adapted.scoreHistoryBySet = {};
                    Object.keys(data.sets).forEach(k => {
                        const s = data.sets[k];
                        if (s.actions) adapted.actionsBySet[k] = s.actions;
                        if (s.meta) adapted.setMeta[k] = s.meta;
                        if (s.state) adapted.setStateBySet[k] = s.state;
                        if (s.summary) adapted.setSummary[k] = s.summary;
                        if (s.scoreHistory) adapted.scoreHistoryBySet[k] = s.scoreHistory;
                    });
                }
                out.push(adapted); 
            });
            return { success: true, documents: out };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    
    deleteMatchTree: async (teamId, matchId, options = {}) => {
        try {
            // Nuova struttura: cancella solo il documento principale
            const userRef = await firestoreService.getUserRefEnsured();
            const matchRef = userRef.collection('teams').doc(String(teamId)).collection('matches').doc(String(matchId));
            
            // Tenta di cancellare anche le vecchie sottocollezioni per pulizia (se presenti da vecchi dati)
            const deletes = [];
            deletes.push(matchRef.collection('match_data').doc('main').delete().catch(()=>{}));
            deletes.push(matchRef.collection('match_roster').doc('main').delete().catch(()=>{}));
            const maxSets = 6;
            for (let i = 1; i <= maxSets; i++) {
                deletes.push(matchRef.collection(`set_${i}_start`).doc('main').delete().catch(()=>{}));
            }
            await Promise.all(deletes);
            
            await matchRef.delete();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    getMatchData: async (teamId, matchId) => {
        try {
            const userRef = await firestoreService.getUserRefEnsured();
            const matchRef = userRef.collection('teams').doc(String(teamId)).collection('matches').doc(String(matchId));
            const doc = await matchRef.get();
            
            if (!doc.exists) return { success: false, error: 'Match not found' };
            
            const data = doc.data();
            const meta = { id: doc.id, ...data }; // Meta include tutto ora
            
            // Estrai roster e details per compatibilità return
            const roster = data.roster || [];
            
            const details = {
                actionsBySet: {},
                setMeta: {},
                setStateBySet: {},
                setSummary: {},
                scoreHistoryBySet: {}
            };
            
            if (data.sets) {
                Object.keys(data.sets).forEach(k => {
                    const s = data.sets[k];
                    if (s.actions) details.actionsBySet[k] = s.actions;
                    if (s.meta) details.setMeta[k] = s.meta;
                    if (s.state) details.setStateBySet[k] = s.state;
                    if (s.summary) details.setSummary[k] = s.summary;
                    if (s.scoreHistory) details.scoreHistoryBySet[k] = s.scoreHistory;
                });
            } else {
                 // Fallback per vecchi documenti (se non migrati) che usano subcollections?
                 // Se stiamo "ripartendo da pulito", non serve, ma per robustezza potremmo controllare subcollections.
                 // Per ora assumiamo nuova struttura.
            }

            return { success: true, meta, roster, details };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    getMatchDataByOwner: async (ownerId, teamId, matchId) => {
        try {
            const owner = String(ownerId || '').trim();
            if (!owner) return { success: false, error: 'ownerId non valido' };
            const matchRef = firestoreService.getUserRefByEmail(owner)
                .collection('teams').doc(String(teamId)).collection('matches').doc(String(matchId));
            const doc = await matchRef.get();
            if (!doc.exists) return { success: false, error: 'Match not found' };
            const data = doc.data();
            const meta = { id: doc.id, ...data };
            const roster = data.roster || [];
            const details = {
                actionsBySet: {},
                setMeta: {},
                setStateBySet: {},
                setSummary: {},
                scoreHistoryBySet: {}
            };
            if (data.sets) {
                Object.keys(data.sets).forEach(k => {
                    const s = data.sets[k];
                    if (s.actions) details.actionsBySet[k] = s.actions;
                    if (s.meta) details.setMeta[k] = s.meta;
                    if (s.state) details.setStateBySet[k] = s.state;
                    if (s.summary) details.setSummary[k] = s.summary;
                    if (s.scoreHistory) details.scoreHistoryBySet[k] = s.scoreHistory;
                });
            }
            return { success: true, meta, roster, details };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    hydrateSharedTeamMatchesFromFirestore: async (ownerId, teamId, options = {}) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) return { success: false, error: 'Utente non autenticato' };
            const owner = String(ownerId || '').trim();
            const tId = String(teamId || '').trim();
            if (!owner) return { success: false, error: 'ownerId non valido' };
            if (!tId) return { success: false, error: 'teamId non valido' };
            const res = await firestoreService.loadTeamMatchesByOwner(owner, tId);
            if (!res?.success) return { success: false, error: res?.error || 'Errore caricamento partite squadra' };
            let all = [];
            try { all = JSON.parse(localStorage.getItem('volleyMatches') || '[]'); } catch (_) { all = []; }
            if (!Array.isArray(all)) all = [];
            let teamName = '';
            try {
                const teams = JSON.parse(localStorage.getItem('volleyTeams') || '[]');
                const found = Array.isArray(teams) ? teams.find(t => String(t?.id || '').trim() === tId) : null;
                teamName = String(found?.name || '').trim();
            } catch (_) { teamName = ''; }
            const isMatchForTeam = (m) => {
                const mid = String(m?.teamId || '').trim();
                if (mid && mid === tId) return true;
                if (!teamName) return false;
                const my = String(m?.myTeam || m?.teamName || '').trim();
                const home = String(m?.homeTeam || '').trim();
                const away = String(m?.awayTeam || '').trim();
                return (my && my === teamName) || (home && home === teamName) || (away && away === teamName);
            };
            const existingLocalTeamMatches = all.filter(isMatchForTeam);
            const localById = new Map();
            for (const m of existingLocalTeamMatches) {
                const id = String(m?.id || '').trim();
                if (id) localById.set(id, m);
            }
            const fsDocs = Array.isArray(res.documents) ? res.documents : [];
            const matchIds = Array.isArray(options?.matchIds) ? options.matchIds.map(v => String(v || '').trim()).filter(Boolean) : [];
            const matchIdSet = matchIds.length ? new Set(matchIds) : null;
            const fsById = new Map();
            for (const d of fsDocs) {
                const id = String(d?.id || '').trim();
                if (!id) continue;
                if (matchIdSet && !matchIdSet.has(id)) continue;
                const dateStr = String(d?.date || d?.matchDate || '').trim();
                const matchType = d?.matchType || d?.eventType || '';
                const base = Object.assign({}, d);
                base.id = id;
                base.teamId = tId;
                if (dateStr && !base.matchDate) base.matchDate = dateStr;
                if (!base.date && dateStr) base.date = dateStr;
                if (matchType && !base.eventType) base.eventType = matchType;
                fsById.set(id, base);
            }
            const toEpochMs = (v) => {
                try {
                    if (!v) return null;
                    if (typeof v === 'number' && isFinite(v)) return v;
                    if (typeof v === 'string') {
                        const t = Date.parse(v);
                        return Number.isFinite(t) ? t : null;
                    }
                    if (typeof v.toMillis === 'function') return v.toMillis();
                    if (typeof v.seconds === 'number') return (v.seconds * 1000) + Math.floor((v.nanoseconds || 0) / 1e6);
                    return null;
                } catch (_) { return null; }
            };
            const matchLabel = (m) => {
                const home = String(m?.homeTeam || '').trim();
                const away = String(m?.awayTeam || '').trim();
                const my = String(m?.myTeam || m?.teamName || '').trim();
                const opp = String(m?.opponentTeam || '').trim();
                const date = String(m?.matchDate || m?.date || '').trim();
                const vs = (home && away) ? `${home} vs ${away}` : (my && opp ? `${my} vs ${opp}` : '');
                return `${vs}${date ? ` (${date})` : ''}`.trim() || String(m?.id || '').trim() || 'partita';
            };
            const conflictMode = String(options?.conflictMode || 'ask');
            const defaultChoice = options?.defaultChoice === 'cloud' ? 'cloud' : 'local';
            const mergedTeam = [];
            for (const [id, fsMatch] of fsById.entries()) {
                const existing = localById.get(id);
                if (existing) {
                    const localUpdated = toEpochMs(existing?.updatedAt) || toEpochMs(existing?.scoutingEndTime) || null;
                    const fsUpdated = toEpochMs(fsMatch?.updatedAt) || toEpochMs(fsMatch?.scoutingEndTime) || null;
                    const localSig = JSON.stringify({
                        matchDate: String(existing?.matchDate || existing?.date || '').trim(),
                        opponentTeam: String(existing?.opponentTeam || '').trim(),
                        homeTeam: String(existing?.homeTeam || '').trim(),
                        awayTeam: String(existing?.awayTeam || '').trim(),
                        status: String(existing?.status || '').trim()
                    });
                    const fsSig = JSON.stringify({
                        matchDate: String(fsMatch?.matchDate || fsMatch?.date || '').trim(),
                        opponentTeam: String(fsMatch?.opponentTeam || '').trim(),
                        homeTeam: String(fsMatch?.homeTeam || '').trim(),
                        awayTeam: String(fsMatch?.awayTeam || '').trim(),
                        status: String(fsMatch?.status || '').trim()
                    });
                    const hasDiff = (localSig !== fsSig) || (localUpdated && fsUpdated && localUpdated !== fsUpdated);
                    let useLocal = true;
                    if (hasDiff) {
                        if (conflictMode === 'preferCloud') {
                            useLocal = false;
                        } else if (conflictMode === 'preferLocal') {
                            useLocal = true;
                        } else {
                            let msg = `Conflitto dati partita:\n${matchLabel(existing) || matchLabel(fsMatch)}\n\nUsare dati LOCALI (OK) o CLOUD (Annulla)?`;
                            if (localUpdated && fsUpdated) {
                                const newer = localUpdated > fsUpdated ? 'locali' : (fsUpdated > localUpdated ? 'cloud' : null);
                                if (newer) msg += `\n\nSuggerimento: sembrano più recenti i dati ${newer}.`;
                            }
                            try {
                                const hint = (localUpdated && fsUpdated)
                                    ? ((localUpdated > fsUpdated) ? 'Suggerimento: sembrano più recenti i dati locali.' : ((fsUpdated > localUpdated) ? 'Suggerimento: sembrano più recenti i dati cloud.' : ''))
                                    : '';
                                const choice = await firestoreService._chooseLocalOrCloud({
                                    title: 'Conflitto dati partita',
                                    subtitle: String(matchLabel(existing) || matchLabel(fsMatch)),
                                    message: '',
                                    hint,
                                    localLabel: 'Usa dati locali',
                                    cloudLabel: 'Usa dati Cloud',
                                    defaultChoice
                                });
                                useLocal = choice !== 'cloud';
                            } catch (_) { useLocal = true; }
                        }
                    }
                    const mergedMatch = useLocal
                        ? Object.assign({}, fsMatch, existing)
                        : Object.assign({}, existing, fsMatch);
                    mergedMatch._mvsSource = useLocal ? 'local' : 'cloud';
                    mergedMatch.id = id;
                    mergedMatch.teamId = tId;
                    mergedMatch.matchDate = mergedMatch.matchDate || mergedMatch.date || fsMatch.matchDate || fsMatch.date || '';
                    mergedTeam.push(mergedMatch);
                } else {
                    mergedTeam.push(fsMatch);
                }
            }
            const detailsMode = String(options?.detailsMode || 'none');
            const maxDetails = Number(options?.maxDetails || 0);
            const shouldLoadDetails = detailsMode === 'all' || (detailsMode === 'recent' && maxDetails > 0);
            const idsForDetails = shouldLoadDetails
                ? (detailsMode === 'all'
                    ? mergedTeam.map(m => String(m?.id || '').trim()).filter(Boolean)
                    : mergedTeam.slice(0, maxDetails).map(m => String(m?.id || '').trim()).filter(Boolean))
                : [];
            let detailsLoaded = 0;
            for (const mId of idsForDetails) {
                try {
                    const r = await firestoreService.getMatchDataByOwner(owner, tId, mId);
                    if (r?.success) {
                        const idx = mergedTeam.findIndex(m => String(m?.id || '') === mId);
                        if (idx >= 0) {
                            const cur = mergedTeam[idx] || {};
                            const roster = Array.isArray(r.roster) ? r.roster : [];
                            const details = r.details || {};
                            const updated = Object.assign({}, cur);
                            const shouldOverride = String(updated?._mvsSource || '') === 'cloud';
                            if (roster.length && (shouldOverride || !(Array.isArray(updated.roster) && updated.roster.length))) updated.roster = roster;
                            if (details && typeof details === 'object') {
                                if (shouldOverride || !updated.actionsBySet) updated.actionsBySet = details.actionsBySet || {};
                                if (shouldOverride || !updated.setMeta) updated.setMeta = details.setMeta || {};
                                if (shouldOverride || !updated.setStateBySet) updated.setStateBySet = details.setStateBySet || {};
                                if (shouldOverride || !updated.setSummary) updated.setSummary = details.setSummary || {};
                                if (shouldOverride || !updated.scoreHistoryBySet) updated.scoreHistoryBySet = details.scoreHistoryBySet || {};
                            }
                            mergedTeam[idx] = updated;
                        }
                        detailsLoaded++;
                    }
                } catch (_) { }
            }
            const mergedIds = new Set(mergedTeam.map(m => String(m?.id || '').trim()).filter(Boolean));
            const localOnly = existingLocalTeamMatches.filter(m => {
                const id = String(m?.id || '').trim();
                return id && !mergedIds.has(id);
            });
            const others = all.filter(m => !isMatchForTeam(m));
            const localOnlyWithTeam = localOnly.map(m => {
                if (m && (!m.teamId || String(m.teamId).trim() !== tId)) return Object.assign({}, m, { teamId: tId });
                return m;
            });
            const combinedTeam = mergedTeam.concat(localOnlyWithTeam).map((m) => {
                const out = Object.assign({}, m);
                const src = String(out?.source || out?._mvsSource || '').toLowerCase();
                if (src.startsWith('firestore')) out.source = 'local_hydrated';
                return out;
            });
            const nextAll = others.concat(combinedTeam);
            const dedupeKey = (m) => {
                const id = String(m?.id || '').trim();
                if (id) return `id:${id}`;
                const date = String(m?.matchDate || m?.date || '').trim();
                const my = String(m?.myTeam || m?.teamName || '').trim();
                const opp = String(m?.opponentTeam || '').trim();
                const home = String(m?.homeTeam || '').trim();
                const away = String(m?.awayTeam || '').trim();
                return `h:${home}|a:${away}|my:${my}|opp:${opp}|d:${date}`;
            };
            const mergePreferMoreInfo = (a, b) => {
                const na = Object.assign({}, a);
                const nb = Object.assign({}, b);
                const hasRosterA = Array.isArray(na?.roster) && na.roster.length;
                const hasRosterB = Array.isArray(nb?.roster) && nb.roster.length;
                const hasSetsA = na?.sets && typeof na.sets === 'object' && Object.keys(na.sets).length;
                const hasSetsB = nb?.sets && typeof nb.sets === 'object' && Object.keys(nb.sets).length;
                if ((hasRosterB && !hasRosterA) || (hasSetsB && !hasSetsA)) return Object.assign({}, na, nb);
                return Object.assign({}, nb, na);
            };
            const deduped = [];
            const indexByKey = new Map();
            for (const m of nextAll) {
                const key = dedupeKey(m);
                const idx = indexByKey.get(key);
                if (idx == null) {
                    indexByKey.set(key, deduped.length);
                    deduped.push(m);
                } else {
                    deduped[idx] = mergePreferMoreInfo(deduped[idx], m);
                }
            }
            localStorage.setItem('volleyMatches', JSON.stringify(deduped));
            return { success: true, hydrated: mergedTeam.length, detailsLoaded };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    // Crea una collection per l'utente con nome basato sull'email
    createUserCollection: async (userEmail) => {
        try {
            if (!userEmail) {
                throw new Error('Email utente non fornita');
            }

            const user = authFunctions.getCurrentUser();
            if (!user) {
                throw new Error('Utente non autenticato');
            }

            // Crea nome collection sicuro dall'email
            const safeCollectionName = userEmail.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            
            // Riferimento alla collection dell'utente
            const userDocId = String(user.email || userEmail || '').trim();
            const userCollectionRef = window.db.collection('users').doc(userDocId);
            
            // Verifica se esiste già
            const doc = await userCollectionRef.get();
            
            if (!doc.exists) {
                // Crea documento utente con struttura base e ruolo
            await userCollectionRef.set({
                email: userEmail,
                collectionName: safeCollectionName,
                role: 'user', // Ruolo predefinito per nuovi utenti
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastAccess: firebase.firestore.FieldValue.serverTimestamp(),
                stats: {
                    totalMatches: 0,
                    totalRosters: 0,
                    lastMatchDate: null
                }
            });
                
                console.log('Collection utente creata:', userDocId);
            } else {
                // Aggiorna solo lastAccess se esiste già
                await userCollectionRef.update({
                    lastAccess: firebase.firestore.FieldValue.serverTimestamp()
                });
                console.log('Collection utente già esistente, aggiornato lastAccess');
            }

            return {
                success: true,
                collectionName: safeCollectionName,
                userId: user.uid
            };

        } catch (error) {
            console.error('Errore nella creazione collection utente:', error);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Aggiorna l'ultimo accesso dell'utente
    updateUserLastAccess: async (userEmail) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) return { success: false, error: 'Utente non autenticato' };

            const userRef = firestoreService.getUserRef();
            await userRef.update({
                lastAccess: firebase.firestore.FieldValue.serverTimestamp()
            });

            return { success: true };
        } catch (error) {
            console.error('Errore nell\'aggiornamento ultimo accesso:', error);
            return { success: false, error: error.message };
        }
    },

    // Gestione ruoli utente
    setUserRole: async (userEmail, role) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) return { success: false, error: 'Utente non autenticato' };

            // Solo admin può modificare ruoli
            const currentUserDoc = await firestoreService.getUserRef().get();
            const currentUserData = currentUserDoc.data();
            
            if (currentUserData?.role !== 'admin') {
                return { success: false, error: 'Permessi insufficienti: solo admin può modificare ruoli' };
            }

            // Trova l'utente target per email
            const targetUserQuery = await window.db.collection('users')
                .where('email', '==', userEmail)
                .limit(1)
                .get();

            if (targetUserQuery.empty) {
                return { success: false, error: 'Utente target non trovato' };
            }

            const targetUserDoc = targetUserQuery.docs[0];
            await targetUserDoc.ref.update({
                role: role,
                roleUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                roleUpdatedBy: user.email
            });

            console.log(`Ruolo ${role} assegnato a ${userEmail}`);
            return { success: true };

        } catch (error) {
            console.error('Errore nella gestione ruoli:', error);
            return { success: false, error: error.message };
        }
    },

    // Ottieni ruolo utente
    getUserRole: async (userEmail = null) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) return { success: false, error: 'Utente non autenticato' };

            const targetEmail = userEmail || user.email;
            const userDoc = await firestoreService.getUserRef().get();
            
            if (!userDoc.exists) {
                // Crea utente se non esiste
                await firestoreService.createUserCollection(targetEmail);
                return { success: true, role: 'user' };
            }

            const userData = userDoc.data();
            return { success: true, role: userData?.role || 'user' };

        } catch (error) {
            console.error('Errore nel recupero ruolo:', error);
            return { success: false, error: error.message };
        }
    },

    // Verifica se l'utente è admin
    isUserAdmin: async () => {
        try {
            const result = await firestoreService.getUserRole();
            return { success: true, isAdmin: result.success && result.role === 'admin' };
        } catch (error) {
            return { success: false, error: error.message, isAdmin: false };
        }
    },

    // Carica i dati dell'utente
    loadUserData: async (userId) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) {
                return { success: false, error: 'Utente non autenticato' };
            }

            // Carica il profilo utente
            const profileDoc = await firestoreService.getUserRef().get();
            
            if (profileDoc.exists) {
                const userData = profileDoc.data();
                console.log('Dati utente caricati:', userData);
                return { success: true, data: userData };
            } else {
                console.log('Nessun profilo utente trovato');
                return { success: false, error: 'Profilo utente non trovato' };
            }
            
        } catch (error) {
            console.error('Errore nel caricamento dei dati utente:', error);
            return { success: false, error: error.message };
        }
    },

    // Salva le statistiche di una partita
    saveMatchStats: async (matchData) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) {
                throw new Error('Utente non autenticato');
            }

            const matchRef = firestoreService.getUserRef()
                .collection('matches').doc();

            const matchToSave = {
                ...matchData,
                id: matchRef.id,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await matchRef.set(matchToSave);

            // Aggiorna le statistiche utente
            await firestoreService.getUserRef().update({
                'stats.totalMatches': firebase.firestore.FieldValue.increment(1),
                'stats.lastMatchDate': firebase.firestore.FieldValue.serverTimestamp()
            });

            console.log('Partita salvata con ID:', matchRef.id);
            return { success: true, id: matchRef.id };

        } catch (error) {
            console.error('Errore nel salvataggio partita:', error);
            return { success: false, error: error.message };
        }
    },

    // Sincronizza i dati locali con Firestore
    syncLocalData: async () => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) {
                return { success: false, error: 'Utente non autenticato' };
            }

            const results = {
                matches: { synced: 0, errors: 0 },
                rosters: { synced: 0, errors: 0 }
            };

            // Sincronizza partite
            const localMatches = JSON.parse(localStorage.getItem('matches') || '[]');
            for (const match of localMatches) {
                try {
                    await firestoreService.saveMatchStats(match);
                    results.matches.synced++;
                } catch (error) {
                    console.error('Errore sincronizzazione partita:', error);
                    results.matches.errors++;
                }
            }

            // Sincronizza roster
            const localRosters = JSON.parse(localStorage.getItem('rosters') || '[]');
            for (const roster of localRosters) {
                try {
                    await firestoreService.saveRoster(roster);
                    results.rosters.synced++;
                } catch (error) {
                    console.error('Errore sincronizzazione roster:', error);
                    results.rosters.errors++;
                }
            }

            return { success: true, syncResults: results };

        } catch (error) {
            console.error('Errore nella sincronizzazione:', error);
            return { success: false, error: error.message };
        }
    },

    // Salva un roster
    saveRoster: async (rosterData) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) {
                throw new Error('Utente non autenticato');
            }

            const rosterRef = firestoreService.getUserRef()
                .collection('rosters').doc();

            const rosterToSave = {
                ...rosterData,
                id: rosterRef.id,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await rosterRef.set(rosterToSave);

            // Aggiorna le statistiche utente
            await firestoreService.getUserRef().update({
                'stats.totalRosters': firebase.firestore.FieldValue.increment(1)
            });

            console.log('Roster salvato con ID:', rosterRef.id);
            return { success: true, id: rosterRef.id };

        } catch (error) {
            console.error('Errore nel salvataggio roster:', error);
            return { success: false, error: error.message };
        }
    },

    // Carica i roster dell'utente
    loadUserRosters: async () => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) {
                return { success: false, error: 'Utente non autenticato' };
            }

            const rostersSnapshot = await firestoreService.getUserRef()
                .collection('rosters')
                .orderBy('createdAt', 'desc')
                .get();

            const rosters = [];
            rostersSnapshot.forEach(doc => {
                rosters.push({ id: doc.id, ...doc.data() });
            });

            return { success: true, documents: rosters };

        } catch (error) {
            console.error('Errore nel caricamento roster:', error);
            return { success: false, error: error.message };
        }
    },

    // Elimina un roster per ID (Firestore)
    deleteRosterById: async (rosterId) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) {
                return { success: false, error: 'Utente non autenticato' };
            }
            if (!rosterId) {
                return { success: false, error: 'ID roster non valido' };
            }

            await firestoreService.getUserRef()
                .collection('rosters')
                .doc(rosterId)
                .delete();

            // Non decrementiamo stats.totalRosters per evitare inconsistenze (potrebbe contare storici)
            return { success: true };
        } catch (error) {
            console.error('Errore nella cancellazione roster per ID:', error);
            return { success: false, error: error.message };
        }
    },

    // Elimina tutti i roster che hanno un certo nome (Firestore)
    deleteRostersByName: async (name) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) {
                return { success: false, error: 'Utente non autenticato' };
            }
            if (!name) {
                return { success: false, error: 'Nome roster non valido' };
            }

            const querySnap = await firestoreService.getUserRef()
                .collection('rosters')
                .where('name', '==', name)
                .get();

            const batch = window.db.batch();
            querySnap.forEach((doc) => batch.delete(doc.ref));
            if (!querySnap.empty) {
                await batch.commit();
            }

            return { success: true, deleted: querySnap.size };
        } catch (error) {
            console.error('Errore nella cancellazione roster per nome:', error);
            return { success: false, error: error.message };
        }
    },

    // Rimuove dal localStorage eventuali roster salvati con quel nome (compat con vecchio storage)
    deleteLocalRostersByName: (name) => {
        try {
            const stored = JSON.parse(localStorage.getItem('volleyRosters') || '[]');
            const filtered = stored.filter((r) => (r?.name || '').toLowerCase() !== (name || '').toLowerCase());
            localStorage.setItem('volleyRosters', JSON.stringify(filtered));
            return { success: true };
        } catch (error) {
            console.warn('Errore cancellazione roster locale per nome:', error);
            return { success: false, error: error.message };
        }
    },

    // Carica le partite dell'utente
    loadUserMatches: async () => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) {
                return { success: false, error: 'Utente non autenticato' };
            }

            const matchesSnapshot = await firestoreService.getUserRef()
                .collection('matches')
                .orderBy('createdAt', 'desc')
                .get();

            const matches = [];
            matchesSnapshot.forEach(doc => {
                matches.push({ id: doc.id, ...doc.data() });
            });

            return { success: true, documents: matches };

        } catch (error) {
            console.error('Errore nel caricamento partite:', error);
            return { success: false, error: error.message };
        }
    },

    // Backup automatico dei dati
    autoBackup: async () => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) {
                return { success: false, error: 'Utente non autenticato' };
            }

            // Ottieni tutti i dati locali
            const appState = {
                matches: JSON.parse(localStorage.getItem('matches') || '[]'),
                rosters: JSON.parse(localStorage.getItem('rosters') || '[]'),
                settings: JSON.parse(localStorage.getItem('appSettings') || '{}'),
                timestamp: new Date()
            };

            // Salva lo stato nell'oggetto backup dell'utente
            await firestoreService.getUserRef().update({
                lastBackup: {
                    data: appState,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                }
            });

            console.log('Backup automatico completato');
            return {
                success: true,
                message: 'Backup automatico completato',
                timestamp: new Date()
            };

        } catch (error) {
            console.error('Errore nel backup automatico:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
};

// Esposizione globale del servizio
window.firestoreService = firestoreService;
