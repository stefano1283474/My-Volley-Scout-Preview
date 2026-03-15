// Servizio Firestore per My Volley Scout
// Gestisce tutte le operazioni di salvataggio e recupero dati da Firestore

const firestoreService = {
    _emailKey: (email) => String(email||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'_'),
    _normalizeEmail: (email) => String(email || '').trim().toLowerCase(),
    _dotSafeEmail: (email) => String(email || '').trim().replace(/\./g, '_'),
    _emailVariants: (email) => {
        const raw = String(email || '').trim();
        const lower = String(email || '').trim().toLowerCase();
        const rawSafe = raw.replace(/\./g, '_');
        const lowerSafe = lower.replace(/\./g, '_');
        return Array.from(new Set([raw, lower, rawSafe, lowerSafe].filter(Boolean)));
    },

    observerLeaveSharedTeam: async (ownerId, teamId, reason = 'rescissione') => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) return { success: false, error: 'Utente non autenticato' };
            const owner = String(ownerId || '').trim();
            const tId = String(teamId || '').trim();
            const observerEmail = String(user.email || '').trim();
            if (!owner || !tId || !observerEmail) return { success: false, error: 'Parametri non validi' };
            if (owner === observerEmail) return { success: false, error: 'Operazione non valida per il proprietario' };

            const ownerRef = firestoreService.getUserRefByEmail(owner);
            const accessCol = ownerRef.collection('teams').doc(tId).collection('user_access');
            const observerVariants = firestoreService._emailVariants(observerEmail);
            const observerKey = firestoreService._emailCompareKey(observerEmail);
            const accessIds = new Set(observerVariants);
            try {
                const snap = await accessCol.get();
                snap.forEach((docSnap) => {
                    const data = docSnap.data() || {};
                    const idKey = firestoreService._emailCompareKey(docSnap.id);
                    const userEmailKey = firestoreService._emailCompareKey(data?.userEmail || '');
                    if (idKey === observerKey || userEmailKey === observerKey) accessIds.add(docSnap.id);
                });
            } catch (_) {}

            let updated = 0;
            const leavePayload = {
                userEmail: observerEmail,
                role: 'observer',
                active: false,
                accessState: 'observer_left',
                observerLeftReason: String(reason || 'rescissione').trim() || 'rescissione',
                observerLeftAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            };
            for (const accessId of accessIds) {
                try {
                    await accessCol.doc(accessId).set(leavePayload, { merge: true });
                    updated++;
                } catch (_) {}
            }

            try {
                const observerRef = firestoreService.getUserRefEnsured ? await firestoreService.getUserRefEnsured() : firestoreService.getUserRef();
                const ownerVariants = firestoreService._emailVariants(owner);
                for (const ownerVariant of ownerVariants) {
                    const mirrorId = `${ownerVariant}__${tId}`;
                    try { await observerRef.collection('shared_teams').doc(mirrorId).delete(); } catch (_) {}
                }
            } catch (_) {}

            if (!updated) return { success: false, error: 'Nessun accesso osservatore trovato per questo team' };
            return { success: true, updated };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    _emailCompareKey: (email) => String(email || '').trim().toLowerCase().replace(/\./g, '_'),
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
        const pick = (obj, keys) => {
            for (const k of keys) {
                const v = obj && obj[k];
                if (v !== undefined && v !== null && String(v).trim() !== '') return v;
            }
            return '';
        };
        return list.map((p) => ({
            number: String(pick(p, ['number','numero','num','jersey','jerseyNumber','maglia']) || '').trim(),
            name: String(pick(p, ['name','nome','firstName','nomi']) || '').trim(),
            surname: String(pick(p, ['surname','cognome','lastName','cognomi']) || '').trim(),
            nickname: String(pick(p, ['nickname','soprannome','nick']) || '').trim(),
            role: String(pick(p, ['role','ruolo','position','posizione']) || '').trim().toUpperCase()
        })).filter(p=>p.number||p.name||p.surname||p.nickname||p.role);
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
            const currentEmail = String(authFunctions.getCurrentUser()?.email || '').trim();
            const sharedTeamIds = (() => {
                const out = new Set();
                try {
                    const raw = JSON.parse(localStorage.getItem('mvsSharedTeamRefs') || '[]');
                    const arr = Array.isArray(raw) ? raw : [];
                    arr.forEach((r) => {
                        const id = String(r?.id || '').trim();
                        const owner = String(r?.owner || '').trim();
                        if (id && owner && owner !== currentEmail) out.add(id);
                    });
                } catch(_) {}
                try {
                    const metaRaw = localStorage.getItem('selectedSharedTeamMeta');
                    const meta = metaRaw ? JSON.parse(metaRaw) : null;
                    const id = String(meta?.id || '').trim();
                    const owner = String(meta?.owner || '').trim();
                    if (id && owner && owner !== currentEmail) out.add(id);
                } catch(_) {}
                return out;
            })();

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
                if (t.source === 'shared' || t._mvsRole === 'observer' || (t.shared && t._mvsOwner && t._mvsOwner !== userRef.id && t._mvsOwner !== currentEmail)) {
                    continue;
                }
                const localId = String(t?.id || '').trim();
                if (localId && sharedTeamIds.has(localId)) continue;

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
            const currentEmail = String(authFunctions.getCurrentUser()?.email || '').trim();
            const sharedTeamIds = (() => {
                const out = new Set();
                try {
                    const raw = JSON.parse(localStorage.getItem('mvsSharedTeamRefs') || '[]');
                    const arr = Array.isArray(raw) ? raw : [];
                    arr.forEach((r) => {
                        const id = String(r?.id || '').trim();
                        const owner = String(r?.owner || '').trim();
                        if (id && owner && owner !== currentEmail) out.add(id);
                    });
                } catch(_) {}
                try {
                    const metaRaw = localStorage.getItem('selectedSharedTeamMeta');
                    const meta = metaRaw ? JSON.parse(metaRaw) : null;
                    const id = String(meta?.id || '').trim();
                    const owner = String(meta?.owner || '').trim();
                    if (id && owner && owner !== currentEmail) out.add(id);
                } catch(_) {}
                return out;
            })();
            const teamMap = new Map();
            (Array.isArray(localTeams) ? localTeams : []).forEach(t => {
                const role = String(t?._mvsRole || '').trim().toLowerCase();
                const source = String(t?.source || '').trim().toLowerCase();
                const owner = String(t?._mvsOwner || '').trim();
                const localId = String(t?.id || '').trim();
                const isShared = !!(t?._mvsShared) || role === 'observer' || source === 'shared' || (!!owner && !!currentEmail && owner !== currentEmail) || (localId && sharedTeamIds.has(localId));
                if (isShared) return;
                const club = String(t.clubName||'').trim();
                const squad = String(t.teamName||t.name||'').trim();
                const combined = (squad + (club ? ` - ${club}` : '')).trim();
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
                    if (teamId && sharedTeamIds.has(String(teamId).trim())) {
                        finalStatus = 'skipped';
                        continue;
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
                        // ── Bridge MVTA ora integrato direttamente in saveMatchTree ──────────────
                        // Il salvataggio su volley_team_analysis_6_0/{uid}/datasets/ è gestito
                        // internamente da saveMatchTree — nessuna scrittura duplicata qui.
                        // ─────────────────────────────────────────────────────────────────────────
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
            const teams = [];
            const seen = new Set();
            const addTeam = (teamId, data, ownerId, role) => {
                const key = `${ownerId}::${teamId}`;
                if (seen.has(key)) return;
                seen.add(key);
                teams.push(Object.assign({ id: teamId }, data, { _mvsOwner: ownerId, _mvsRole: role || 'observer', source: 'shared' }));
            };
            let userRef = null;
            try { userRef = await firestoreService.getUserRefEnsured(); } catch(_) {}
            if (userRef) {
                try {
                    const sharedSnap = await userRef.collection('shared_teams').get();
                    for (const d of sharedSnap.docs || []) {
                        const data = d.data() || {};
                        if (data?.active === false) continue;
                        if (String(data?.accessState || '').trim().toLowerCase() === 'observer_left') continue;
                        const teamId = String(data?.teamId || '').trim();
                        const ownerId = String(data?.ownerId || '').trim();
                        if (!ownerId || !teamId) continue;
                        if (ownerId === currentEmail) continue;
                        try {
                            const teamDoc = await window.db.collection('users').doc(ownerId).collection('teams').doc(teamId).get();
                            if (teamDoc.exists) {
                                const t = teamDoc.data() || {};
                                addTeam(teamDoc.id, t, ownerId, data?.role || 'observer');
                            } else {
                                const fallback = {
                                    teamName: String(data?.teamName || '').trim(),
                                    clubName: String(data?.clubName || '').trim(),
                                    name: String(data?.teamName || '').trim() + (String(data?.clubName || '').trim() ? ` - ${String(data?.clubName || '').trim()}` : ''),
                                    shared: true
                                };
                                addTeam(teamId, fallback, ownerId, data?.role || 'observer');
                            }
                        } catch (_teamFetchErr) {
                            // permission-denied = accesso revocato ma mirror orfano (non pulito)
                            // Auto-pulizia: elimina il mirror così al prossimo caricamento la card sparisce
                            if (_teamFetchErr?.code === 'permission-denied' && userRef) {
                                try {
                                    await userRef.collection('shared_teams').doc(`${ownerId}__${teamId}`).delete();
                                    console.log('[MVS] mirror orfano auto-eliminato:', `${ownerId}__${teamId}`);
                                } catch (_) {}
                            }
                        }
                    }
                } catch (_) {}
            }
            try {
                const accesses = [];
                const accessSnap = await window.db.collectionGroup('user_access').where('userEmail', '==', currentEmail).get();
                accessSnap.forEach(d => accesses.push({ ref: d.ref, data: d.data() || {} }));
                const safeEmail = currentEmail.replace(/\./g, '_');
                if (safeEmail && safeEmail !== currentEmail) {
                    try {
                        const accessSnapSafe = await window.db.collectionGroup('user_access').where('userEmail', '==', safeEmail).get();
                        accessSnapSafe.forEach(d => accesses.push({ ref: d.ref, data: d.data() || {} }));
                    } catch (_) {}
                }
                for (const access of accesses) {
                    const data = access?.data || {};
                    if (data?.active === false) continue;
                    if (String(data?.accessState || '').trim().toLowerCase() === 'observer_left') continue;
                    const teamRef = access?.ref?.parent?.parent;
                    if (!teamRef) continue;
                    const teamId = String(teamRef?.id || '').trim();
                    const ownerId = String(teamRef?.parent?.parent?.id || '').trim();
                    if (!ownerId || !teamId) continue;
                    if (ownerId === currentEmail) continue;
                    try {
                        const teamDoc = await teamRef.get();
                        if (teamDoc.exists) {
                            const t = teamDoc.data() || {};
                            addTeam(teamDoc.id, t, ownerId, data?.role || 'observer');
                        }
                    } catch (_) {}
                }
            } catch (_) {}
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
                if (data?.active === false || String(data?.accessState || '').trim().toLowerCase() === 'observer_left') {
                    return { success: true, role: 'none', ownerId: owner };
                }
                return { success: true, role: data?.role || 'observer', ownerId: owner };
            }
            return { success: true, role: 'none', ownerId: owner };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    listTeamObserverAccesses: async (teamId) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) return { success: false, error: 'Utente non autenticato' };
            const tId = String(teamId || '').trim();
            if (!tId) return { success: false, error: 'teamId non valido' };
            const userRef = await firestoreService.getUserRefEnsured();
            const currentEmail = String(user.email || '').trim();
            const teamRef = userRef.collection('teams').doc(tId);
            const snap = await teamRef.collection('user_access').get();
            const users = [];
            snap.forEach((d) => {
                const data = d.data() || {};
                const email = String(data?.userEmail || d.id || '').trim();
                const role = String(data?.role || '').trim().toLowerCase();
                if (!email || email === currentEmail) return;
                users.push({
                    id: d.id,
                    userEmail: email,
                    role: role || 'observer',
                    active: data?.active !== false,
                    accessState: String(data?.accessState || (data?.active === false ? 'suspended' : 'active')).trim().toLowerCase(),
                    observerLeftAt: data?.observerLeftAt || null,
                    observerLeftReason: String(data?.observerLeftReason || '').trim(),
                    accessCount: Number(data?.accessCount || 0),
                    lastAccessAt: data?.lastAccessAt || null,
                    lastAccessPage: String(data?.lastAccessPage || '').trim(),
                    lastAccessArchive: String(data?.lastAccessArchive || '').trim(),
                    lastAccessAction: String(data?.lastAccessAction || '').trim(),
                    lastAccessUserAgent: String(data?.lastAccessUserAgent || '').trim(),
                    updatedAt: data?.updatedAt || null,
                    createdAt: data?.createdAt || null
                });
            });
            return { success: true, documents: users };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    setTeamObserverAccessState: async (teamId, observerEmail, active) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) return { success: false, error: 'Utente non autenticato' };
            const tId = String(teamId || '').trim();
            const email = String(observerEmail || '').trim();
            if (!tId || !email) return { success: false, error: 'Parametri non validi' };
            const userRef = await firestoreService.getUserRefEnsured();
            const ownerId = String(userRef?.id || user.email || '').trim();
            const docRef = userRef.collection('teams').doc(tId).collection('user_access').doc(email);
            await docRef.set({
                userEmail: email,
                role: 'observer',
                active: !!active,
                accessState: active ? 'active' : 'suspended',
                observerLeftAt: null,
                observerLeftReason: '',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            try {
                const observerRef = firestoreService.getUserRefByEmail(email);
                const mirrorId = `${ownerId}__${tId}`;
                await observerRef.collection('shared_teams').doc(mirrorId).set({
                    active: !!active,
                    accessState: active ? 'active' : 'suspended',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } catch (_) {}
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    removeTeamObserverAccess: async (teamId, observerEmail) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) return { success: false, error: 'Utente non autenticato' };
            const tId = String(teamId || '').trim();
            const email = String(observerEmail || '').trim();
            if (!tId || !email) return { success: false, error: 'Parametri non validi' };
            const userRef = await firestoreService.getUserRefEnsured();
            const ownerId = String(userRef?.id || user.email || '').trim();
            const accessCol = userRef.collection('teams').doc(tId).collection('user_access');
            const accessIdsToDelete = new Set(firestoreService._emailVariants(email));
            const targetKey = firestoreService._emailCompareKey(email);
            try {
                const allAccessSnap = await accessCol.get();
                allAccessSnap.forEach((docSnap) => {
                    const data = docSnap.data() || {};
                    const idKey = firestoreService._emailCompareKey(docSnap.id);
                    const userEmailKey = firestoreService._emailCompareKey(data?.userEmail || '');
                    if (idKey === targetKey || userEmailKey === targetKey) {
                        accessIdsToDelete.add(docSnap.id);
                    }
                });
            } catch (_) {}
            const deleteTasks = [];
            for (const accessId of accessIdsToDelete) {
                try { deleteTasks.push(accessCol.doc(accessId).delete()); } catch (_) {}
            }
            if (deleteTasks.length) {
                try { await Promise.all(deleteTasks); } catch (_) {}
            }
            try {
                const ownerVariants = firestoreService._emailVariants(ownerId);
                const observerVariants = firestoreService._emailVariants(email);
                for (const observerId of observerVariants) {
                    const observerRef = firestoreService.getUserRefByEmail(observerId);
                    for (const ownerVariant of ownerVariants) {
                        const mirrorId = `${ownerVariant}__${tId}`;
                        const mirrorRef = observerRef.collection('shared_teams').doc(mirrorId);
                        try {
                            await mirrorRef.delete();
                        } catch (_) {
                            try {
                                await mirrorRef.set(
                                    { active: false, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
                                    { merge: true }
                                );
                            } catch (_) {}
                        }
                    }
                }
            } catch (_) {}
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    bulkSetTeamObserverAccessState: async (teamId, active) => {
        try {
            const listRes = await firestoreService.listTeamObserverAccesses(teamId);
            if (!listRes?.success) return listRes;
            const docs = Array.isArray(listRes.documents) ? listRes.documents : [];
            let updated = 0;
            for (const item of docs) {
                const email = String(item?.userEmail || '').trim();
                if (!email) continue;
                const r = await firestoreService.setTeamObserverAccessState(teamId, email, !!active);
                if (r?.success) updated++;
            }
            return { success: true, updated };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    bulkRemoveTeamObserverAccess: async (teamId) => {
        try {
            const listRes = await firestoreService.listTeamObserverAccesses(teamId);
            if (!listRes?.success) return listRes;
            const docs = Array.isArray(listRes.documents) ? listRes.documents : [];
            let removed = 0;
            for (const item of docs) {
                const email = String(item?.userEmail || '').trim();
                if (!email) continue;
                const r = await firestoreService.removeTeamObserverAccess(teamId, email);
                if (r?.success) removed++;
            }
            return { success: true, removed };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    logObserverTeamAccess: async (ownerId, teamId, context = {}) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) return { success: false, error: 'Utente non autenticato' };
            const observerEmail = String(user.email || '').trim();
            const owner = String(ownerId || '').trim();
            const tId = String(teamId || '').trim();
            if (!observerEmail || !owner || !tId) return { success: false, error: 'Parametri non validi' };
            if (owner === observerEmail) return { success: true, skipped: true };
            const ownerRef = firestoreService.getUserRefByEmail(owner);
            const accessRef = ownerRef.collection('teams').doc(tId).collection('user_access').doc(observerEmail);
            const existing = await accessRef.get();
            const existingData = existing.exists ? (existing.data() || {}) : {};
            if (existingData?.active === false) return { success: false, error: 'Accesso osservatore sospeso' };
            const page = String(context?.page || '').trim();
            const archive = String(context?.archive || '').trim();
            const action = String(context?.action || '').trim();
            const userAgent = String((typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '').trim();
            await accessRef.set({
                userEmail: observerEmail,
                role: 'observer',
                active: true,
                accessCount: firebase.firestore.FieldValue.increment(1),
                lastAccessAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastAccessPage: page,
                lastAccessArchive: archive,
                lastAccessAction: action,
                lastAccessUserAgent: userAgent,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdAt: existing.exists ? (existingData?.createdAt || firebase.firestore.FieldValue.serverTimestamp()) : firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            try {
                const observerRef = firestoreService.getUserRefByEmail(observerEmail);
                const mirrorId = `${owner}__${tId}`;
                await observerRef.collection('shared_teams').doc(mirrorId).set({
                    ownerId: owner,
                    teamId: tId,
                    userEmail: observerEmail,
                    role: 'observer',
                    active: true,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } catch (_) {}
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    createTeamInvite: async (teamId) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) return { success: false, error: 'Utente non autenticato' };
            const tId = String(teamId || '').trim();
            if (!tId) return { success: false, error: 'teamId non valido' };
            const userRef = await firestoreService.getUserRefEnsured();
            const ownerId = String(userRef?.id || user.email || '').trim();
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
            
            let inviteDoc = null;
            let ownerId = String(optionalOwnerId || '').trim();

            console.log('Accepting invite:', token, 'Owner:', ownerId);

            // Attempt 1: Direct path with provided ownerId
            if (ownerId) {
                 try {
                     const ownerRef = firestoreService.getUserRefByEmail(ownerId);
                     inviteDoc = await ownerRef.collection('invites').doc(token).get();
                 } catch(e) { 
                     console.error('Error fetching subcollection invite (Attempt 1)', e); 
                     if (e.code === 'permission-denied') console.warn('Permission denied on direct read. Rules might be outdated.');
                 }
            }
            
            // Attempt 2: Direct path with lowercase ownerId (if different)
            if (ownerId && (!inviteDoc || !inviteDoc.exists)) {
                 try {
                     const lowerOwner = ownerId.toLowerCase();
                     if (lowerOwner !== ownerId) {
                         const ownerRef = firestoreService.getUserRefByEmail(lowerOwner);
                         inviteDoc = await ownerRef.collection('invites').doc(token).get();
                         if (inviteDoc.exists) ownerId = lowerOwner;
                     }
                 } catch(e) { console.error('Error fetching subcollection invite (Attempt 2)', e); }
            }

            // Attempt 3: Safe email (replace . with _)
            if (ownerId && (!inviteDoc || !inviteDoc.exists)) {
                 try {
                     const safeOwner = ownerId.replace(/\./g, '_');
                     if (safeOwner !== ownerId) {
                         const ownerRef = firestoreService.getUserRefByEmail(safeOwner);
                         inviteDoc = await ownerRef.collection('invites').doc(token).get();
                         if (inviteDoc.exists) ownerId = safeOwner;
                     }
                 } catch(e) { console.error('Error fetching subcollection invite (Attempt 3)', e); }
            }
            
            // Attempt 4: Collection Group Query (slower but exhaustive)
            if (!inviteDoc || !inviteDoc.exists) {
                try {
                    console.log('Trying collectionGroup query for invite...');
                    const q = await window.db.collectionGroup('invites').where('inviteId', '==', token).limit(1).get();
                    if (!q.empty) {
                        inviteDoc = q.docs[0];
                        const pathOwner = inviteDoc.ref.parent.parent.id;
                        if (pathOwner) ownerId = pathOwner;
                    }
                } catch(e) { 
                    console.error('Error collectionGroup invite (Attempt 4)', e); 
                    if (e.code === 'permission-denied') console.warn('Permission denied on collectionGroup query.');
                }
            }

            // Attempt 5: Legacy global collection
            if (!inviteDoc || !inviteDoc.exists) {
                 try {
                     inviteDoc = await window.db.collection('teamInvites').doc(token).get();
                 } catch(_) {}
            }

            if (!inviteDoc || !inviteDoc.exists) {
                return { success: false, error: `Invito non trovato (ID: ${token}). Se l'invito esiste, potrebbe essere un problema di permessi (Regole Firestore non aggiornate).` };
            }
            
            const invite = inviteDoc.data() || {};
            if (invite?.active === false) return { success: false, error: 'Invito non attivo' };
            
            // Resolve Owner ID finally
            const pathOwnerId = String(inviteDoc?.ref?.parent?.parent?.id || '').trim();
            ownerId = String(invite?.ownerId || ownerId || pathOwnerId || '').trim();
            
            if (!ownerId) return { success: false, error: 'Proprietario invito non identificato' };
            
            const teamId = String(invite?.teamId || '').trim();
            if (!teamId) return { success: false, error: 'ID Squadra mancante nell\'invito' };
            
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
                
                // Add user to user_access
                await teamRef.collection('user_access').doc(currentEmail).set(payload, { merge: true });
                try {
                    const observerRef = await firestoreService.getUserRefEnsured();
                    const mirrorId = `${ownerId}__${teamId}`;
                    const mirrorPayload = {
                        ownerId,
                        teamId,
                        userEmail: currentEmail,
                        role: 'observer',
                        inviteId: token,
                        active: true,
                        teamName: String(invite?.teamName || '').trim(),
                        clubName: String(invite?.clubName || '').trim(),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    await observerRef.collection('shared_teams').doc(mirrorId).set(mirrorPayload, { merge: true });
                } catch (_) {}
                
                // NOTE: We do NOT set {shared: true} on the team doc here because the Observer
                // does not have write permission on the team doc. 
                // The Owner should have set this when creating the invite.
                // If it's missing, the Owner must fix it (or we rely on user_access existence).
                
            } catch (err) {
                console.error('Error accepting invite write:', err);
                if (err.code === 'permission-denied') {
                    return { success: false, error: 'Errore scrittura accesso: Permesso negato. Verifica che le regole di sicurezza consentano la scrittura in user_access.' };
                }
                return { success: false, error: 'Errore scrittura accesso: ' + err.message };
            }
            
            let teamData = null;
            try {
                const ownerRef = firestoreService.getUserRefByEmail(ownerId);
                const teamDoc = await ownerRef.collection('teams').doc(teamId).get();
                if (teamDoc.exists) teamData = Object.assign({ id: teamDoc.id }, teamDoc.data() || {});
            } catch (_) {}
            
            return { success: true, accessId: String(teamId || ''), invite: Object.assign({}, invite), team: teamData };
        } catch (error) {
            console.error('Accept invite critical error:', error);
            if (error.code === 'permission-denied') {
                return { success: false, error: 'Permesso negato. Le regole di sicurezza di Firestore potrebbero non essere aggiornate.' };
            }
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
            const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null;

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
            const detailsTotal = idsForDetails.length;
            let detailsIndex = 0;
            for (const mId of idsForDetails) {
                detailsIndex++;
                const progressMatch = mergedTeam.find(m => String(m?.id || '') === mId) || { id: mId, teamId: tId, teamName };
                if (onProgress) {
                    try {
                        onProgress({
                            phase: 'matches',
                            status: 'start',
                            teamId: tId,
                            teamName,
                            matchId: mId,
                            match: progressMatch,
                            index: detailsIndex,
                            total: detailsTotal
                        });
                    } catch (_) {}
                }
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
                    if (onProgress) {
                        try {
                            onProgress({
                                phase: 'matches',
                                status: 'done',
                                teamId: tId,
                                teamName,
                                matchId: mId,
                                match: progressMatch,
                                index: detailsIndex,
                                total: detailsTotal
                            });
                        } catch (_) {}
                    }
                } catch (_) {
                    if (onProgress) {
                        try {
                            onProgress({
                                phase: 'matches',
                                status: 'error',
                                teamId: tId,
                                teamName,
                                matchId: mId,
                                match: progressMatch,
                                index: detailsIndex,
                                total: detailsTotal
                            });
                        } catch (_) {}
                    }
                }
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
            const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null;

            const teamsRes = await firestoreService.hydrateTeamsFromFirestore(options);
            if (!teamsRes?.success) return teamsRes;

            const hydrateMatches = options?.hydrateMatches === true;
            let matchesHydrated = 0;
            let detailsLoaded = 0;

            if (hydrateMatches) {
                let teams = [];
                try { teams = JSON.parse(localStorage.getItem('volleyTeams') || '[]'); } catch (_) { teams = []; }
                if (!Array.isArray(teams)) teams = [];
                const validTeams = teams.map(t => ({ id: String(t?.id || '').trim(), name: String(t?.name || '').trim() })).filter(t => t.id);
                let overallTotal = 0;
                let overallIndex = 0;

                if (onProgress) {
                    try { onProgress({ phase: 'prepare', status: 'start', teamCount: validTeams.length }); } catch (_) {}
                    for (const t of validTeams) {
                        try {
                            const scanRes = await firestoreService.loadTeamMatches(t.id);
                            const docs = Array.isArray(scanRes?.documents) ? scanRes.documents : [];
                            overallTotal += docs.length;
                        } catch (_) {}
                    }
                    try { onProgress({ phase: 'prepare', status: 'ready', total: overallTotal, teamCount: validTeams.length }); } catch (_) {}
                }

                for (const t of validTeams) {
                    const id = t.id;
                    if (onProgress) {
                        try { onProgress({ phase: 'team', status: 'start', teamId: id, teamName: t.name }); } catch (_) {}
                    }
                    const r = await firestoreService.hydrateTeamMatchesFromFirestore(id, Object.assign({}, options, {
                        onProgress: (info) => {
                            if (!onProgress || !info) return;
                            if (info.status === 'start') overallIndex += 1;
                            try {
                                onProgress(Object.assign({}, info, {
                                    teamId: info.teamId || id,
                                    teamName: info.teamName || t.name,
                                    overallIndex,
                                    overallTotal
                                }));
                            } catch (_) {}
                        }
                    }));
                    if (r?.success) {
                        matchesHydrated += Number(r.hydrated || 0);
                        detailsLoaded += Number(r.detailsLoaded || 0);
                    }
                    if (onProgress) {
                        try { onProgress({ phase: 'team', status: 'done', teamId: id, teamName: t.name }); } catch (_) {}
                    }
                }
                if (onProgress) {
                    try { onProgress({ phase: 'complete', status: 'done', overallIndex, overallTotal }); } catch (_) {}
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
            const rosterSource = Array.isArray(match.roster) && match.roster.length
                ? match.roster
                : (Array.isArray(match.players) ? match.players : []);
            const roster = firestoreService._sanitizeRosterPlayers(rosterSource);
            
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
                players: roster,

                // Dettagli completi dei set
                sets: setsData,

                // Link al documento MVTA corrispondente (se disponibile).
                // Persistito in Firestore (non solo localStorage) per garantire
                // che cloud-to-cloud sync funzioni anche dopo cambio dispositivo.
                ...(match._mvtaId ? { _mvtaId: String(match._mvtaId) } : {}),

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

            // ── Bridge MVTA integrato ─────────────────────────────────────────────
            // Principio fondamentale dell'ecosistema: qualsiasi dato che MVS
            // archivia in Firestore deve essere disponibile a MVTA nel suo formato.
            // Questo bridge è il punto unico e canonico di scrittura nel percorso MVTA:
            //   volley_team_analysis_6_0/{uid}/datasets/{mvtaId}
            //
            // Casi gestiti:
            //   A) match._mvtaId presente → già linkato (import xlsm pre-salvato)
            //      → aggiorna solo metadata col form dell'utente
            //   B) match._mvtaId assente → live-scouting
            //      → converte in formato MVTA + calcola statistiche, poi salva
            try {
                const _bridgeCu = authFunctions.getCurrentUser();
                const _bridgeUid = _bridgeCu ? _bridgeCu.uid : null;
                if (_bridgeUid && window.db) {
                    // _mvsTeamId garantisce che il doc MVTA sia ricercabile
                    // per team dall'altra app e da loadTeamMatches stesso.
                    const _bridgeMatchForSave = Object.assign({}, match, {
                        id: matchDocId,
                        _mvsTeamId: String(teamId),
                    });

                    if (match._mvtaId) {
                        // Caso A: partita già linkata a un doc MVTA (import xlsm o live precedente)
                        const _bridgeRef = window.db
                            .collection('volley_team_analysis_6_0')
                            .doc(_bridgeUid)
                            .collection('datasets')
                            .doc(String(match._mvtaId));
                        const _bridgeSnap = await _bridgeRef.get();
                        if (_bridgeSnap.exists) {
                            // Doc esiste → aggiorna metadata modificabili + _mvsTeamId
                            const _bridgeUpd = {
                                '_updatedAt':  firebase.firestore.FieldValue.serverTimestamp(),
                                '_mvsTeamId':  String(teamId),
                            };
                            const _bridgeOpp = String(match.opponentTeam || match.awayTeam || '').trim();
                            const _bridgeDt  = String(match.date || match.matchDate || '').trim();
                            const _bridgeTyp = String(match.matchType || match.eventType || '').trim();
                            const _bridgeHa  = String(match.homeAway || '').toLowerCase().trim();
                            if (_bridgeOpp) _bridgeUpd['metadata.opponent']  = _bridgeOpp;
                            if (_bridgeDt)  _bridgeUpd['metadata.date']      = _bridgeDt;
                            if (_bridgeTyp) _bridgeUpd['metadata.matchType'] = _bridgeTyp;
                            if (_bridgeHa)  _bridgeUpd['metadata.homeAway']  =
                                (_bridgeHa === 'away' || _bridgeHa === 'trasferta') ? 'away' : 'home';
                            await _bridgeRef.update(_bridgeUpd);
                        } else {
                            // Doc MVTA assente (es. utente ha cancellato il dataset da MVTA) →
                            // ricrealo dai dati MVS disponibili, esattamente come farebbe Case B.
                            // Per partite live-scouted: rigenera riepilogo/gioco/rallies da actionsBySet.
                            // Per partite xlsm senza actionsBySet: crea almeno un doc parziale con metadata.
                            console.warn('[saveMatchTree→MVTA] Doc MVTA assente per _mvtaId', match._mvtaId, '— ricreazione da dati MVS');
                            await saveMVTAMatchFromLocal(_bridgeUid, Object.assign({}, _bridgeMatchForSave, { _forceId: String(match._mvtaId) }));
                        }
                    } else {
                        // Caso B: live-scouting → converte e salva documento MVTA
                        // saveMVTAMatchFromLocal usa computeStatsFromLiveScout per
                        // calcolare riepilogo/gioco/giriDiRice/rallies dal live data
                        await saveMVTAMatchFromLocal(_bridgeUid, _bridgeMatchForSave);
                    }
                }
            } catch (_bridgeErr) {
                // Non bloccante: l'errore MVTA non impedisce il salvataggio MVS principale
                console.warn('[saveMatchTree→MVTA] Bridge MVTA fallito (non bloccante):', _bridgeErr);
            }
            // ─────────────────────────────────────────────────────────────────────

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
            // Set di _mvtaId già presenti dal percorso MVS: usato per deduplicare
            // quando lo stesso match appare anche nell'archivio MVTA condiviso.
            const seenMvtaIds = new Set();

            matchesSnap.forEach(doc => {
                const data = doc.data();
                const adapted = { id: doc.id, ...data, source: 'firestore_team' };
                adapted.teamId = String(teamId);
                if (data._mvtaId) seenMvtaIds.add(String(data._mvtaId));

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

            // ── Legge anche dall'archivio condiviso MVTA ─────────────────────────
            // Qualsiasi partita in volley_team_analysis_6_0/{uid}/datasets/ con
            // _mvsTeamId === teamId è parte di questo archivio squadra.
            // Questo permette alle due app di condividere un unico dataset Firestore:
            // - Partite salvate da MVS → bridge scrive su MVTA datasets con _mvsTeamId
            // - Partite importate direttamente in MVTA (con _mvsTeamId) → visibili in MVS
            // - Cancellazioni in MVTA → non compaiono più nemmeno in MVS (unica fonte di verità)
            try {
                const cu = authFunctions.getCurrentUser();
                const uid = cu ? cu.uid : null;
                if (uid && window.db) {
                    const mvtaSnap = await window.db
                        .collection('volley_team_analysis_6_0')
                        .doc(uid)
                        .collection('datasets')
                        .where('_mvsTeamId', '==', String(teamId))
                        .get();
                    mvtaSnap.forEach(mvtaDoc => {
                        const d = mvtaDoc.data();
                        if (!d || d._type !== 'match') return;
                        // Deduplica: se il doc è già nel percorso MVS (via _mvtaId), salta
                        if (seenMvtaIds.has(String(mvtaDoc.id))) return;
                        // Mappa formato MVTA → formato MVS atteso dal frontend
                        const meta = d.metadata || {};
                        const haRaw = String(meta.homeAway || '').toLowerCase();
                        const isHome = !(haRaw === 'away' || haRaw === 'trasferta');
                        const setsArr = Array.isArray(d.sets) ? d.sets : [];
                        const ourWins   = setsArr.filter(s => s.won).length;
                        const theirWins = setsArr.filter(s => !s.won).length;
                        out.push({
                            id:           mvtaDoc.id,
                            _mvtaId:      mvtaDoc.id,
                            _mvsTeamId:   String(teamId),
                            _source:      d._source || 'mvta_import',
                            source:       'mvta_datasets',
                            teamId:       String(teamId),
                            date:         meta.date || '',
                            matchDate:    meta.date || '',
                            matchType:    meta.matchType || '',
                            homeAway:     isHome ? 'home' : 'away',
                            myTeam:       meta.teamName || '',
                            homeTeam:     isHome ? (meta.teamName || '') : (meta.opponent || ''),
                            awayTeam:     isHome ? (meta.opponent || '') : (meta.teamName || ''),
                            opponentTeam: meta.opponent || '',
                            score:        { home: ourWins, away: theirWins },
                            finalResult:  `${ourWins}-${theirWins}`,
                            roster:       Array.isArray(d.roster) ? d.roster : [],
                            players:      Array.isArray(d.roster) ? d.roster : [],
                            // Dati statistici ricchi disponibili direttamente dall'archivio MVTA
                            riepilogo:    d.riepilogo  || null,
                            gioco:        d.gioco      || null,
                            giriDiRice:   d.giriDiRice || null,
                            rallies:      Array.isArray(d.rallies) ? d.rallies : [],
                        });
                    });
                }
            } catch (_mvtaReadErr) {
                // Non bloccante: fallback ai soli dati MVS
                console.warn('[loadTeamMatches] Lettura archivio MVTA fallita (non bloccante):', _mvtaReadErr);
            }
            // ────────────────────────────────────────────────────────────────────

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
            const roster = (Array.isArray(data.roster) && data.roster.length)
                ? data.roster
                : (Array.isArray(data.players) ? data.players : []);
            
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

// ─── Integrazione My Volley Team Analysis ────────────────────────────────────
// Salva una partita nel formato compatibile con My Volley Team Analysis.
// Percorso Firestore: volley_team_analysis_6_0/{uid}/datasets/{matchId}
// Questo permette alle due app di condividere lo stesso dataset Firestore.
// ─────────────────────────────────────────────────────────────────────────────

const MVTA_ROOT = 'volley_team_analysis_6_0';

/**
 * Sanitizza ricorsivamente un oggetto rimuovendo valori undefined
 * (Firestore non accetta undefined).
 */
function _mvsaSanitize(value) {
    if (value === undefined) return null;
    if (value === null) return null;
    if (Array.isArray(value)) return value.map(_mvsaSanitize);
    if (value instanceof Date) return value;
    if (typeof value !== 'object') return value;
    const out = {};
    Object.keys(value).forEach(function (k) {
        out[k] = _mvsaSanitize(value[k]);
    });
    return out;
}

/**
 * Trasforma un match nel formato MVS locale (localStorage) in un documento parziale
 * compatibile con la struttura MVTA. Usato durante "Aggiorna Cloud da Locale".
 *
 * I campi riepilogo/gioco/giriDiRice non sono disponibili dai dati live-scouting:
 * vengono impostati a null. Le analisi MVTA che li richiedono restituiranno null/vuoto.
 *
 * @param {object} mvsMatch  - Match nel formato MVS da localStorage
 * @returns {object|null}    - Documento parziale MVTA, o null se matchId mancante
 */
function _mvsLocalToMVTAPartial(mvsMatch) {
    const matchId = String(mvsMatch?.id || '').trim();
    if (!matchId) return null;

    // Se fornito esplicitamente (es. ricreazione doc MVTA cancellato) usa _forceId,
    // altrimenti genera ID MVTA deterministico dall'ID MVS locale.
    const mvtaId = mvsMatch?._forceId
        ? String(mvsMatch._forceId)
        : ('mvs_live_' + matchId.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').substring(0, 80));

    // ── metadata ──────────────────────────────────────────────────────────────
    const haRaw = String(mvsMatch?.homeAway || '').toLowerCase().trim();
    const homeAway = (haRaw === 'away' || haRaw === 'trasferta') ? 'away' : 'home';

    // MVTA (dataParser.js) si aspetta: teamName, opponent, date, matchType, homeAway, phase
    const myTeamName = String(mvsMatch?.myTeam || mvsMatch?.homeTeam || '').trim() || null;
    const metadata = {
        teamName:  myTeamName,                                                        // campo richiesto da MVTA
        opponent:  String(mvsMatch?.opponentTeam || mvsMatch?.awayTeam || '').trim() || null,
        date:      String(mvsMatch?.date || mvsMatch?.matchDate || '').trim() || null,
        matchType: String(mvsMatch?.matchType || mvsMatch?.eventType || '').trim() || null,
        homeAway:  homeAway,
        phase:     String(mvsMatch?.phase || mvsMatch?.matchPhase || '').trim() || null, // non sempre disponibile
        myTeam:    myTeamName,                                                        // campo aggiuntivo MVS
        location:  String(mvsMatch?.location || '').trim() || null,
    };

    // Calcola risultato dai set se non disponibile direttamente
    const sc = mvsMatch?.score;
    if (sc && (Number(sc.home || 0) || Number(sc.away || 0))) {
        metadata.result = Number(sc.home || 0) + '-' + Number(sc.away || 0);
    } else {
        let myWins = 0, oppWins = 0;
        for (let i = 1; i <= 6; i++) {
            const st  = (mvsMatch?.setStateBySet || {})[i] || (mvsMatch?.setStateBySet || {})[String(i)] || {};
            const sum = (mvsMatch?.setSummary || {})[i]    || (mvsMatch?.setSummary || {})[String(i)]    || {};
            const mine = Number(st.homeScore ?? st.myScore    ?? sum.home  ?? 0);
            const opp  = Number(st.awayScore ?? st.theirScore ?? sum.away  ?? 0);
            if (mine + opp > 0) { mine > opp ? myWins++ : oppWins++; }
        }
        if (myWins + oppWins > 0) metadata.result = myWins + '-' + oppWins;
    }

    // ── roster ────────────────────────────────────────────────────────────────
    // MVTA (dataParser.js) si aspetta: number, surname, name, nickname, role, fullName
    const rosterSrc = Array.isArray(mvsMatch?.roster) ? mvsMatch.roster
                    : (Array.isArray(mvsMatch?.players) ? mvsMatch.players : []);
    const roster = rosterSrc.map(function(p) {
        const sur  = String(p?.surname  || p?.lastName  || '').trim();
        const nm   = String(p?.name     || p?.firstName || p?.playerName || '').trim();
        const nick = String(p?.nickname || p?.nick      || '').trim();
        const numRaw = p?.number != null ? p.number : (p?.shirtNumber != null ? p.shirtNumber : null);
        const num    = numRaw != null ? String(numRaw).replace(/^'+/, '') : null;
        return {
            number:   num,
            surname:  sur,
            name:     nm,
            nickname: nick,
            role:     String(p?.role || p?.position || '').trim(),
            fullName: (sur + (nm ? ' ' + nm : '')).trim(),
        };
    }).filter(function(p) { return p.surname || p.name || p.number != null; });

    // ── sets: flat array {number, ourScore, theirScore, margin, won} ──────────
    // Stesso formato di dataParser.js e xlsm-full-parser.js di MVTA.
    const sets = [];
    for (let i = 1; i <= 5; i++) {
        const sm  = (mvsMatch?.setMeta        || {})[i] || (mvsMatch?.setMeta        || {})[String(i)];
        const st  = (mvsMatch?.setStateBySet  || {})[i] || (mvsMatch?.setStateBySet  || {})[String(i)];
        const su  = (mvsMatch?.setSummary     || {})[i] || (mvsMatch?.setSummary     || {})[String(i)];
        if (sm || st || su) {
            const our  = Number(st?.homeScore  ?? st?.myScore    ?? sm?.myScore    ?? su?.home  ?? 0) || 0;
            const opp  = Number(st?.awayScore  ?? st?.theirScore ?? sm?.theirScore ?? su?.away  ?? 0) || 0;
            if (our > 0 || opp > 0) {
                sets.push({
                    number:          i,
                    ourScore:        our,
                    theirScore:      opp,
                    margin:          our - opp,
                    won:             our > opp,
                    oppStartRotation: null,
                    ourStartRotation: null,
                });
            }
        }
    }

    // ── Calcolo statistiche dal live-scouting ─────────────────────────────────
    // Se actionsBySet è disponibile, emula le formule Excel DataVolley in JS
    // tramite live-stats-computer.js. Produce riepilogo/gioco/giriDiRice/rallies
    // equivalenti a quelli estratti dall'xlsm, senza richiedere il file.
    var computedStats = { riepilogo: null, gioco: null, giriDiRice: null, rallies: [] };
    try {
        if (typeof window !== 'undefined' && typeof window.computeStatsFromLiveScout === 'function') {
            computedStats = window.computeStatsFromLiveScout(mvsMatch);
        }
    } catch (_cse) {
        console.warn('[MVS→MVTA] Errore calcolo statistiche live (non bloccante):', _cse);
    }

    return {
        id:          mvtaId,
        fileName:    matchId,
        _source:     'my_volley_scout_live',
        // Collega il doc MVTA alla squadra MVS originale → usato da loadTeamMatches
        // per leggere dall'archivio MVTA (unico archivio condiviso tra le due app).
        _mvsTeamId:  mvsMatch._mvsTeamId ? String(mvsMatch._mvsTeamId) : null,
        metadata:    metadata,
        roster:      roster,
        sets:        sets,
        // Statistiche calcolate emulando le formule Excel del DataVolley xlsm.
        // Se actionsBySet non ha dati (match non ancora scouting), restano null/[].
        riepilogo:   computedStats.riepilogo,
        gioco:       computedStats.gioco,
        giriDiRice:  computedStats.giriDiRice,
        rallies:     computedStats.rallies,
    };
}

/**
 * Salva un match MVS locale nel percorso MVTA durante "Aggiorna Cloud da Locale".
 *
 * Logica di merge:
 * - Se il doc MVTA esiste già con dati ricchi (xlsm: riepilogo + rallies popolati)
 *   → aggiorna solo i metadata (non sovrascrivere dati statistici preziosi).
 * - Se il doc MVTA non esiste o è anch'esso da live-scouting (parziale)
 *   → crea/sovrascrive con i dati disponibili.
 *
 * @param {string} uid       - Firebase Auth UID
 * @param {object} mvsMatch  - Match MVS da localStorage
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
async function saveMVTAMatchFromLocal(uid, mvsMatch) {
    try {
        if (!uid)         return { success: false, error: 'UID utente mancante' };
        if (!window.db)   return { success: false, error: 'Firestore non disponibile' };
        if (!mvsMatch)    return { success: false, error: 'Dati match mancanti' };

        const partial = _mvsLocalToMVTAPartial(mvsMatch);
        if (!partial) return { success: false, error: 'Impossibile trasformare dati MVS (id mancante)' };

        const docRef = window.db
            .collection(MVTA_ROOT)
            .doc(uid)
            .collection('datasets')
            .doc(partial.id);

        const snap = await docRef.get();

        if (snap.exists) {
            const existing = snap.data() || {};
            // Dati "ricchi" = provengono da importazione xlsm con riepilogo e rallies
            const hasRichData = existing.riepilogo != null
                && Array.isArray(existing.rallies)
                && existing.rallies.length > 0;

            if (hasRichData) {
                // Aggiorna solo i metadati base — non toccare riepilogo/rallies/gioco/giriDiRice
                const meta = partial.metadata || {};
                const upd = { '_updatedAt': firebase.firestore.FieldValue.serverTimestamp() };
                if (meta.opponent  != null) upd['metadata.opponent']  = meta.opponent;
                if (meta.date      != null) upd['metadata.date']      = meta.date;
                if (meta.matchType != null) upd['metadata.matchType'] = meta.matchType;
                if (meta.homeAway  != null) upd['metadata.homeAway']  = meta.homeAway;
                if (meta.result    != null) upd['metadata.result']    = meta.result;
                await docRef.update(upd);
                console.log('[MVS→MVTA] Metadata aggiornati (dati xlsm preservati):', partial.id);
            } else {
                // Documento parziale / live-scout → sovrascriviamo
                const payload = _mvsaSanitize(Object.assign({}, partial, {
                    _type:       'match',
                    _updatedAt:  firebase.firestore.FieldValue.serverTimestamp(),
                }));
                await docRef.set(payload, { merge: false });
                console.log('[MVS→MVTA] Documento parziale aggiornato:', partial.id);
            }
        } else {
            // Documento non esiste — crea nuovo documento parziale
            const payload = _mvsaSanitize(Object.assign({}, partial, {
                _type:      'match',
                _createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                _updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            }));
            await docRef.set(payload);
            console.log('[MVS→MVTA] Nuovo documento parziale creato:', partial.id);
        }

        return { success: true, id: partial.id };
    } catch (error) {
        console.error('[MVS→MVTA] Errore saveMVTAMatchFromLocal:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Salva una partita nel formato MVTA su Firestore.
 * @param {string} uid        - Firebase Auth UID dell'utente corrente
 * @param {object} mvtaMatch  - Oggetto match MVTA (output di parseXlsmFull)
 * @returns {Promise<{success: boolean, id: string, error?: string}>}
 */
async function saveMVTAMatch(uid, mvtaMatch) {
    try {
        if (!uid) throw new Error('UID utente mancante');
        if (!mvtaMatch || !mvtaMatch.id) throw new Error('Dati partita MVTA non validi');
        if (!window.db) throw new Error('Firestore non disponibile');

        const docRef = window.db
            .collection(MVTA_ROOT)
            .doc(uid)
            .collection('datasets')
            .doc(mvtaMatch.id);

        const payload = _mvsaSanitize(Object.assign({}, mvtaMatch, {
            _type: 'match',
            _source: 'my_volley_scout',
            _updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }));

        // Gestione createdAt: non sovrascrivere se il documento esiste già
        let shouldSetCreatedAt = true;
        try {
            const snap = await docRef.get();
            if (snap.exists) shouldSetCreatedAt = false;
        } catch (_) {}

        if (shouldSetCreatedAt) {
            payload._createdAt = firebase.firestore.FieldValue.serverTimestamp();
        }

        await docRef.set(payload, { merge: false });

        console.log('[MVS→MVTA] Partita salvata:', mvtaMatch.id);
        return { success: true, id: mvtaMatch.id };
    } catch (error) {
        console.error('[MVS→MVTA] Errore salvataggio:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Elimina una partita dal dataset MVTA su Firestore.
 * @param {string} uid     - Firebase Auth UID
 * @param {string} matchId - ID del documento match in MVTA
 */
async function deleteMVTAMatch(uid, matchId) {
    try {
        if (!uid || !matchId) return { success: false, error: 'Parametri mancanti' };
        if (!window.db) return { success: false, error: 'Firestore non disponibile' };
        await window.db
            .collection(MVTA_ROOT)
            .doc(uid)
            .collection('datasets')
            .doc(matchId)
            .delete();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Esponi le funzioni di integrazione MVTA globalmente
window.saveMVTAMatch = saveMVTAMatch;
window.saveMVTAMatchFromLocal = saveMVTAMatchFromLocal;
window._mvsLocalToMVTAPartial = _mvsLocalToMVTAPartial;
window.deleteMVTAMatch = deleteMVTAMatch;

// Esposizione globale del servizio
window.firestoreService = firestoreService;
