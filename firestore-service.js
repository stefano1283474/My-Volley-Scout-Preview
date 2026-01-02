// Servizio Firestore per My Volley Scout
// Gestisce tutte le operazioni di salvataggio e recupero dati da Firestore

const firestoreService = {
    _emailKey: (email) => String(email||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'_'),
    _sanitizeRosterPlayers: (players) => {
        const list = Array.isArray(players)?players:[];
        return list.map(p=>({
            number: String(p.number||'').trim(),
            nickname: String(p.nickname||'').trim(),
            role: String(p.role||'').trim().toUpperCase()
        })).filter(p=>p.number||p.nickname||p.role);
    },

    syncLocalTeamsToFirestore: async () => {
        try {
            const isAuthed = !!authFunctions.getCurrentUser();
            if (!isAuthed) return { success: false, error: 'Utente non autenticato' };
            const userRef = await firestoreService.getUserRefEnsured();
            const teamsRef = userRef.collection('teams');
            let local = [];
            try { local = JSON.parse(localStorage.getItem('volleyTeams')||'[]'); } catch(_){ local = []; }
            if (!Array.isArray(local) || !local.length) return { success: true, synced: 0 };
            let synced = 0;
            for (const t of local) {
                const club = String(t.clubName||'').trim();
                const squad = String(t.teamName||t.name||'').trim();
                const combined = (squad ? squad : '').trim() + (club ? ` - ${club}` : '');
                const id = combined || String(t.id||Date.now());
                const docRef = teamsRef.doc(id);
                const data = {
                    id,
                    name: combined,
                    teamName: squad,
                    clubName: club,
                    players: Array.isArray(t.players) ? t.players : [],
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                try { await docRef.set(data, { merge: true }); synced++; } catch(_){ }
            }
            return { success: true, synced };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    syncLocalMatchesToFirestore: async () => {
        try {
            const isAuthed = !!authFunctions.getCurrentUser();
            if (!isAuthed) return { success: false, error: 'Utente non autenticato' };
            const userRef = await firestoreService.getUserRefEnsured();
            // Mappa dei team locali: name -> docId
            let localTeams = [];
            try { localTeams = JSON.parse(localStorage.getItem('volleyTeams')||'[]'); } catch(_){ localTeams = []; }
            const teamMap = new Map();
            (Array.isArray(localTeams) ? localTeams : []).forEach(t => {
                const club = String(t.clubName||'').trim();
                const squad = String(t.teamName||t.name||'').trim();
                const docId = (club || squad) ? `${club} - ${squad}`.trim() : String(t.id||'');
                const nameCombined = (squad + (club ? ` - ${club}` : '')).trim();
                if (docId) {
                    teamMap.set(nameCombined, docId);
                    teamMap.set(String(t.name||'').trim(), docId);
                }
            });

            let localMatches = [];
            try { localMatches = JSON.parse(localStorage.getItem('volleyMatches')||'[]'); } catch(_){ localMatches = []; }
            if (!Array.isArray(localMatches) || !localMatches.length) return { success: true, synced: 0 };

            let synced = 0;
            for (const m of localMatches) {
                let teamId = null;
                try { if (m.teamId) teamId = String(m.teamId); } catch(_){}
                if (!teamId) {
                    const my = String(m.myTeam||m.teamName||'').trim();
                    const home = String(m.homeTeam||'').trim();
                    const away = String(m.awayTeam||'').trim();
                    teamId = teamMap.get(my) || teamMap.get(home) || null;
                }
                if (!teamId) continue;
                try {
                    await firestoreService.saveMatchTree(teamId, m);
                    // Salva roster se presente
                    const rosterArr = Array.isArray(m.roster) ? m.roster : (Array.isArray(m.players) ? m.players : []);
                    if (Array.isArray(rosterArr) && rosterArr.length) {
                        await firestoreService.saveMatchRosterTree(teamId, String(m.id), rosterArr);
                    }
                    synced++;
                } catch(_){ }
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
        score: match.score||{home:0,away:0}
    }),
    getUserRef: () => {
        const user = authFunctions.getCurrentUser();
        if (!user) throw new Error('Utente non autenticato');
        const userDocId = String(user.email || '').trim();
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
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            await docRef.set(data, { merge: true });
            return { success: true, id };
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

    hydrateTeamsFromFirestore: async () => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) return { success: false, error: 'Utente non autenticato' };

            const res = await firestoreService.loadUserTeams();
            if (!res?.success) return { success: false, error: res?.error || 'Errore caricamento squadre' };

            let localTeams = [];
            try { localTeams = JSON.parse(localStorage.getItem('volleyTeams') || '[]'); } catch (_) { localTeams = []; }
            if (!Array.isArray(localTeams)) localTeams = [];

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
                    players: Array.isArray(doc?.players) ? doc.players : []
                };
            };

            const byId = new Map();
            for (const t of localTeams) {
                const id = String(t?.id || '').trim();
                if (id) byId.set(id, t);
            }

            let merged = 0;
            for (const doc of (Array.isArray(res.documents) ? res.documents : [])) {
                const fsTeam = normalizeTeamFromFs(doc);
                const id = String(fsTeam.id || '').trim();
                if (!id) continue;

                const bySameId = byId.get(id);
                const bySameName = !bySameId ? localTeams.find(t => String(t?.name || '').trim() && String(t?.name || '').trim() === String(fsTeam.name || '').trim()) : null;
                const existing = bySameId || bySameName;
                if (existing) {
                    const mergedTeam = Object.assign({}, existing);
                    mergedTeam.id = id;
                    mergedTeam.teamName = String(existing.teamName || '').trim() || fsTeam.teamName;
                    mergedTeam.clubName = String(existing.clubName || '').trim() || fsTeam.clubName;
                    mergedTeam.name = (mergedTeam.teamName ? mergedTeam.teamName : '').trim() + ((mergedTeam.clubName ? ` - ${mergedTeam.clubName}` : ''));

                    const localPlayers = Array.isArray(existing.players) ? existing.players : [];
                    const fsPlayers = Array.isArray(fsTeam.players) ? fsTeam.players : [];
                    mergedTeam.players = (localPlayers.length >= fsPlayers.length && localPlayers.length) ? localPlayers : fsPlayers;

                    const existingId = String(existing?.id || '').trim();
                    if (!bySameId && existingId && existingId !== id) byId.delete(existingId);
                    byId.set(id, mergedTeam);
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
            const fsById = new Map();
            for (const d of fsDocs) {
                const id = String(d?.id || '').trim();
                if (!id) continue;
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

            const mergedTeam = [];
            for (const [id, fsMatch] of fsById.entries()) {
                const existing = localById.get(id);
                if (existing) {
                    const mergedMatch = Object.assign({}, fsMatch, existing);
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
                            if (roster.length && !(Array.isArray(updated.roster) && updated.roster.length)) updated.roster = roster;
                            if (details && typeof details === 'object') {
                                if (!updated.actionsBySet) updated.actionsBySet = details.actionsBySet || {};
                                if (!updated.setMeta) updated.setMeta = details.setMeta || {};
                                if (!updated.setStateBySet) updated.setStateBySet = details.setStateBySet || {};
                                if (!updated.setSummary) updated.setSummary = details.setSummary || {};
                                if (!updated.scoreHistoryBySet) updated.scoreHistoryBySet = details.scoreHistoryBySet || {};
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
            const combinedTeam = mergedTeam.concat(localOnlyWithTeam);
            combinedTeam.sort((a, b) => {
                const da = String(a?.matchDate || a?.date || a?.updatedAt || a?.createdAt || '');
                const db = String(b?.matchDate || b?.date || b?.updatedAt || b?.createdAt || '');
                if (da === db) return 0;
                return da < db ? 1 : -1;
            });

            const nextAll = others.concat(combinedTeam);
            localStorage.setItem('volleyMatches', JSON.stringify(nextAll));

            return { success: true, hydrated: mergedTeam.length, detailsLoaded };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    hydrateUserDataToLocal: async (options = {}) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) return { success: false, error: 'Utente non autenticato' };

            const teamsRes = await firestoreService.hydrateTeamsFromFirestore();
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

    saveMatchTree: async (teamId, match) => {
        try {
            const userRef = await firestoreService.getUserRefEnsured();
            const matchesRef = userRef.collection('teams').doc(String(teamId)).collection('matches');
            const meta = firestoreService._sanitizeMatchMeta(match);
            const matchDoc = matchesRef.doc(meta.id);
            await matchDoc.set(Object.assign({}, meta, {
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }), { merge: true });
            const subRef = matchDoc.collection('match_data').doc('main');
            await subRef.set({
                myTeam: meta.myTeam,
                opponentTeam: meta.opponentTeam,
                matchType: meta.matchType,
                date: meta.date,
                status: meta.status,
                score: meta.score,
                ts: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return { success: true, id: meta.id };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    saveMatchDetailsTree: async (teamId, matchId, details) => {
        try {
            const userRef = await firestoreService.getUserRefEnsured();
            const matchDoc = userRef.collection('teams').doc(String(teamId)).collection('matches').doc(String(matchId));
            const subRef = matchDoc.collection('match_data').doc('main');
            const payload = {
                actionsBySet: details?.actionsBySet || {},
                setMeta: details?.setMeta || {},
                setStateBySet: details?.setStateBySet || {},
                setSummary: details?.setSummary || {},
                scoreHistoryBySet: details?.scoreHistoryBySet || {},
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            await subRef.set(payload, { merge: true });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    saveMatchRosterTree: async (teamId, matchId, rosterData) => {
        try {
            const userRef = await firestoreService.getUserRefEnsured();
            const matchDoc = userRef.collection('teams').doc(String(teamId)).collection('matches').doc(String(matchId));
            const subRef = matchDoc.collection('match_roster').doc('main');
            await subRef.set({ roster: firestoreService._sanitizeRosterPlayers(rosterData), ts: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    saveSetStartTree: async (teamId, matchId, setNumber, payload) => {
        try {
            const userRef = await firestoreService.getUserRefEnsured();
            const matchDoc = userRef.collection('teams').doc(String(teamId)).collection('matches').doc(String(matchId));
            const subName = `set_${setNumber}_start`;
            const subRef = matchDoc.collection(subName).doc('main');
            await subRef.set({
                setNumber: Number(setNumber)||1,
                phase: payload?.phase||'servizio',
                rotation: payload?.rotation||'P1',
                opponentRotation: payload?.opponentRotation||'P1',
                startTime: payload?.startTime||new Date().toISOString(),
                ts: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
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
            matchesSnap.forEach(doc => { out.push({ id: doc.id, ...doc.data(), source: 'firestore_team' }); });
            return { success: true, documents: out };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    getMatchData: async (teamId, matchId) => {
        try {
            const userRef = await firestoreService.getUserRefEnsured();
            const matchRef = userRef.collection('teams').doc(String(teamId)).collection('matches').doc(String(matchId));
            const metaDoc = await matchRef.get();
            const rosterDoc = await matchRef.collection('match_roster').doc('main').get();
            const dataDoc = await matchRef.collection('match_data').doc('main').get();
            const meta = metaDoc.exists ? { id: metaDoc.id, ...metaDoc.data() } : null;
            const roster = rosterDoc.exists ? (rosterDoc.data()?.roster || []) : [];
            const details = dataDoc.exists ? dataDoc.data() : {};
            return { success: true, meta, roster, details };
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
