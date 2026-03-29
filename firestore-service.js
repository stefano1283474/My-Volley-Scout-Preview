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

            if (!updated) return { success: false, error: 'Nessun accesso Ospite trovato per questo team' };
            return { success: true, updated };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    _emailCompareKey: (email) => String(email || '').trim().toLowerCase().replace(/\./g, '_'),
    _chooseLocalOrCloud: async (options = {}) => {
        // Cloud-only: nessun conflitto locale/cloud, si usa sempre il cloud
        return 'cloud';
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
            number: String(pick(p, ['number','numero','num','jersey','jerseyNumber','maglia']) || '').trim().padStart(2, '0'),
            name: String(pick(p, ['name','nome','firstName','nomi']) || '').trim(),
            surname: String(pick(p, ['surname','cognome','lastName','cognomi']) || '').trim(),
            nickname: String(pick(p, ['nickname','soprannome','nick']) || '').trim(),
            role: String(pick(p, ['role','ruolo','position','posizione']) || '').trim().toUpperCase()
        })).filter(p=>p.number||p.name||p.surname||p.nickname||p.role);
    },

    syncLocalTeamsToFirestore: async (options = {}) => {
        // Cloud-only: i dati risiedono già in Firestore, nessun sync locale→cloud necessario
        return { success: true, synced: 0, message: 'Cloud-only mode: nessun dato locale da sincronizzare' };
    },

    syncLocalMatchesToFirestore: async (options = {}) => {
        // Cloud-only: i dati risiedono già in Firestore, nessun sync locale→cloud necessario
        return { success: true, synced: 0, message: 'Cloud-only mode: nessun dato locale da sincronizzare' };
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
    _sanitizeMatchMeta: (match) => {
        const m = (match && typeof match === 'object') ? match : {};
        const safeNum = (v) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : 0;
        };
        const readSetScore = (idx) => {
            const sum = (m.setSummary && m.setSummary[idx]) ? m.setSummary[idx] : null;
            const st = (m.setStateBySet && m.setStateBySet[idx]) ? m.setStateBySet[idx] : null;
            const home = sum && sum.home != null ? safeNum(sum.home) : (st && st.homeScore != null ? safeNum(st.homeScore) : 0);
            const away = sum && sum.away != null ? safeNum(sum.away) : (st && st.awayScore != null ? safeNum(st.awayScore) : 0);
            return { home, away };
        };
        const computeOverall = () => {
            let our = 0;
            let opp = 0;
            for (let i = 1; i <= 6; i++) {
                const sc = readSetScore(i);
                if ((sc.home + sc.away) <= 0) continue;
                if (sc.home > sc.away) our++;
                else if (sc.away > sc.home) opp++;
            }
            return { home: our, away: opp };
        };

        const baseScore = (m.score && typeof m.score === 'object') ? { home: safeNum(m.score.home), away: safeNum(m.score.away) } : { home: 0, away: 0 };
        const computedScore = computeOverall();
        const score = (baseScore.home || baseScore.away) ? baseScore : computedScore;

        const id = String(m.id || Date.now());
        const myTeam = m.myTeam || m.homeTeam || '';
        const opponentTeam = m.opponentTeam || m.awayTeam || '';
        const date = m.matchDate || m.date || new Date().toISOString().slice(0, 10);
        const matchType = m.matchType || m.eventType || 'partita';

        const finalResultRaw = String(m.finalResult || m.result || '').trim();
        const finalResult = finalResultRaw || `${score.home || 0}-${score.away || 0}`;

        const outcomeRaw = String(m.matchOutcome || m.outcome || '').trim();
        const matchOutcome = outcomeRaw || (score.home > score.away ? 'Vinto' : (score.away > score.home ? 'Perso' : ''));

        return {
            id,
            myTeam,
            opponentTeam,
            homeTeam: m.homeTeam || '',
            awayTeam: m.awayTeam || '',
            homeAway: m.homeAway || '',
            matchType,
            date,
            description: m.description || '',
            status: m.status || 'created',
            currentSet: m.currentSet || 1,
            score,
            finalResult,
            matchOutcome,
            matchNumber: m.matchNumber || m.matchNo || m.fileNumber || '',
            excelFileName: m.excelFileName || '',
            excelFileUrl: m.excelFileUrl || '',
            excelFilePath: m.excelFilePath || ''
        };
    },
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
            if (existingData?.active === false) return { success: false, error: 'Accesso Ospite sospeso' };
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
            localTeams = [];
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

            // Cloud-only: no local storage for teams
            // localStorage.setItem('volleyTeams', JSON.stringify(out));
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
            all = [];
            if (!Array.isArray(all)) all = [];

            let teamName = '';
            try {
                const teams = [];
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

            // Cloud-only: no local storage for matches
            // localStorage.setItem('volleyMatches', JSON.stringify(deduped));

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
                teams = [];
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
    _parseDateCompat: (dateStr) => {
        try {
            const raw = String(dateStr || '').trim();
            if (!raw) return null;
            const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (iso) {
                const y = Number(iso[1]);
                const m = Number(iso[2]);
                const d = Number(iso[3]);
                if (y && m >= 1 && m <= 12 && d >= 1 && d <= 31) return { y, m, d };
            }
            const it = raw.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/);
            if (it) {
                const d = Number(it[1]);
                const m = Number(it[2]);
                const yRaw = it[3];
                let y = Number(yRaw);
                if (String(yRaw).length === 2) y = 2000 + y;
                if (y && m >= 1 && m <= 12 && d >= 1 && d <= 31) return { y, m, d };
            }
            const dObj = new Date(raw);
            if (!isNaN(dObj.getTime())) {
                return { y: dObj.getFullYear(), m: dObj.getMonth() + 1, d: dObj.getDate() };
            }
        } catch (_) {}
        return null;
    },

    _formatDateIdPart: (dateStr) => {
        const parsed = firestoreService._parseDateCompat(dateStr);
        if (!parsed) return '00-00-00';
        const dd = String(parsed.d).padStart(2, '0');
        const mm = String(parsed.m).padStart(2, '0');
        const yy = String(parsed.y).slice(-2).padStart(2, '0');
        return `${dd}-${mm}-${yy}`;
    },

    _formatDateYYMMDD: (dateStr) => {
        const parsed = firestoreService._parseDateCompat(dateStr);
        if (!parsed) return '000000';
        const yy = String(parsed.y).slice(-2).padStart(2, '0');
        const mm = String(parsed.m).padStart(2, '0');
        const dd = String(parsed.d).padStart(2, '0');
        return `${yy}${mm}${dd}`;
    },

    _formatDateItalianShort: (dateStr) => {
        const parsed = firestoreService._parseDateCompat(dateStr);
        if (!parsed) return '00/00/00';
        const dd = String(parsed.d).padStart(2, '0');
        const mm = String(parsed.m).padStart(2, '0');
        const yy = String(parsed.y).slice(-2).padStart(2, '0');
        return `${dd}/${mm}/${yy}`;
    },

    _sanitizeForMatchId: (str) => {
        try {
            const raw = String(str || '').trim();
            const normalized = raw.normalize ? raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : raw;
            return String(normalized || 'avversario')
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '')
                .replace(/_+/g, '_')
                .slice(0, 48) || 'avversario';
        } catch (_) {
            return 'avversario';
        }
    },

    _formatEventType4: (value) => {
        const raw = String(value || '').trim().toLowerCase();
        if (!raw) return 'Part';
        if (raw.includes('camp')) return 'Camp';
        if (raw.includes('cop')) return 'Copp';
        if (raw.includes('pgs')) return 'PGS_';
        if (raw.includes('csi')) return 'CSI_';
        if (raw.includes('amic')) return 'Amic';
        if (raw.includes('torn')) return 'Torn';
        if (raw.includes('play')) return 'Play';
        const clean = raw.replace(/[^a-z0-9]+/g, '');
        const out = clean ? (clean.charAt(0).toUpperCase() + clean.slice(1)) : 'Part';
        return String(out).slice(0, 4).padEnd(4, '_');
    },

    _formatDescriptionMarker: (value) => {
        const raw = String(value || '').trim().toLowerCase();
        if (!raw) return '';
        if (raw.includes('(a)') || raw.includes('andata')) return 'A';
        if (raw.includes('(r)') || raw.includes('ritorno')) return 'R';
        return '';
    },

    _generateMatchDocId: (match) => {
        const yymmddPrefix = firestoreService._formatDateYYMMDD(match.matchDate || match.date || match.createdAt);
        const type4 = firestoreService._formatEventType4(match.matchType || match.eventType || 'partita');
        const dateId = firestoreService._formatDateIdPart(match.matchDate || match.date || match.createdAt);
        const opp = firestoreService._sanitizeForMatchId(match.opponentTeam || match.opponent || match.awayTeam || 'avversario');
        const ar = firestoreService._formatDescriptionMarker(match.description || '');
        const matchNoRaw = String(match.matchNumber || match.matchNo || match.fileNumber || '').trim();
        const matchNo = matchNoRaw && String(Number(matchNoRaw)) === matchNoRaw ? String(matchNoRaw).padStart(3, '0').slice(-3) : '';
        const base = [type4, dateId, opp, ar].filter(Boolean).join('_');
        const tail = matchNo ? `${base}_${matchNo}` : base;
        return `${yymmddPrefix}_${tail}`;
    },

    saveMatchTree: async (teamId, match) => {
        try {
            const userRef = await firestoreService.getUserRefEnsured();
            const matchesRef = userRef.collection('teams').doc(String(teamId)).collection('matches');

            const requestedId = String(match?.id || '').trim();
            let requestedExists = false;
            if (requestedId) {
                try {
                    const snap = await matchesRef.doc(requestedId).get();
                    requestedExists = !!snap.exists;
                } catch (_) {
                    requestedExists = false;
                }
            }

            let matchDocId = requestedId;
            if (!matchDocId || !requestedExists) {
                const baseId = firestoreService._generateMatchDocId(match || {});
                matchDocId = baseId;
                for (let i = 2; i <= 20; i++) {
                    try {
                        const snap = await matchesRef.doc(matchDocId).get();
                        if (!snap.exists) break;
                    } catch (_) {
                        break;
                    }
                    matchDocId = `${baseId}__${i}`;
                }
            }

            const matchDoc = matchesRef.doc(matchDocId);
            
            // Preparazione payload UNICO (single document)
            const meta = firestoreService._sanitizeMatchMeta(Object.assign({}, match, { id: matchDocId }));
            
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

            // ── Calcolo risultato finale se non presente ──
            const score = meta.score || { home: 0, away: 0 };
            const finalResult = meta.finalResult || `${score.home || 0}-${score.away || 0}`;

            // ── Determinazione casa/trasferta ──
            const loc = String(meta.location || match.location || '').toLowerCase();
            const homeAway = loc.includes('casa') ? 'home' : (loc.includes('trasf') ? 'away' : '');

            const payload = {
                id: matchDocId,
                _type: 'match',
                _source: 'mvs',
                _version: '2.0',

                // ── Metadata strutturato (wrapper per MVTA) ──
                metadata: {
                    date: meta.date,
                    time: meta.time || '',
                    opponent: meta.opponentTeam || meta.awayTeam || '',
                    myTeam: meta.myTeam || meta.homeTeam || '',
                    matchType: meta.matchType || 'partita',
                    location: meta.location || '',
                    homeAway: homeAway,
                    phase: String(match.phase || '').trim(),
                    matchNumber: meta.matchNumber || '',
                    description: meta.description || '',
                    teamName: meta.myTeam || meta.homeTeam || '',
                    result: finalResult,
                    label: `${firestoreService._formatEventType4(meta.matchType)} ${firestoreService._formatDateItalianShort(meta.date)} ${(meta.opponentTeam || meta.awayTeam || '').trim()}${firestoreService._formatDescriptionMarker(meta.description) ? ` (${firestoreService._formatDescriptionMarker(meta.description)})` : ''}`.trim()
                },

                // ── Campi flat mantenuti per backward compatibility ──
                date: meta.date,
                matchDate: meta.date,
                matchType: meta.matchType,
                homeTeam: meta.homeTeam,
                awayTeam: meta.awayTeam,
                opponentTeam: meta.opponentTeam,
                myTeam: meta.myTeam,
                location: meta.location || '',
                description: meta.description || '',
                status: meta.status,
                score: score,
                finalResult: finalResult,

                // ── Roster ──
                roster: roster,

                // ── Set data (struttura nested) ──
                sets: setsData,

                // ── Timestamps ──
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
            all = [];
            if (!Array.isArray(all)) all = [];
            let teamName = '';
            try {
                const teams = [];
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
            // Cloud-only: no local storage for matches
            // localStorage.setItem('volleyMatches', JSON.stringify(deduped));
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
                apps: {
                    mvs: {
                        role: 'user',
                        pacchetto: 'Base',
                        assignedProfile: 'base',
                        enabled: true
                    }
                },
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
                await userCollectionRef.set({
                    lastAccess: firebase.firestore.FieldValue.serverTimestamp(),
                    apps: {
                        mvs: {
                            role: 'user',
                            pacchetto: 'Base',
                            assignedProfile: 'base',
                            enabled: true
                        }
                    }
                }, { merge: true });
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

            const userData = userDoc.data() || {};
            const appRole = String(userData?.apps?.mvs?.role || '').trim().toLowerCase();
            const role = appRole || String(userData?.role || 'user').trim().toLowerCase() || 'user';
            return { success: true, role };

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

    _normalizePackageName: (value) => {
        const v = String(value || '').trim().toLowerCase();
        if (v === 'promax' || v === 'pro_max' || v === 'pro-max' || v === 'pro max') return 'ProMax';
        if (v === 'pro') return 'Pro';
        return 'Base';
    },

    _profileFromPackage: (pkg) => {
        if (pkg === 'ProMax') return 'promax';
        if (pkg === 'Pro') return 'pro';
        return 'base';
    },

    _allowedViewsForPackage: (pkg) => {
        if (pkg === 'ProMax') return ['base', 'pro', 'promax'];
        if (pkg === 'Pro') return ['base', 'pro'];
        return ['base'];
    },

    _packageRank: (pkg) => {
        if (pkg === 'ProMax') return 3;
        if (pkg === 'Pro') return 2;
        return 1;
    },

    _nextPackageFor: (pkg) => {
        if (pkg === 'Base') return 'Pro';
        if (pkg === 'Pro') return 'ProMax';
        return '';
    },

    getUserAppContext: async (appKey = 'mvs') => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) return { success: false, error: 'Utente non autenticato' };
            const ref = firestoreService.getUserRef();
            const snap = await ref.get();
            if (!snap.exists) {
                await firestoreService.createUserCollection(user.email);
            }
            const refreshed = await ref.get();
            const data = refreshed.exists ? (refreshed.data() || {}) : {};
            const app = (data.apps && data.apps[appKey]) ? data.apps[appKey] : {};
            const role = String(app.role || data.role || 'user').trim().toLowerCase() || 'user';
            const pacchetto = firestoreService._normalizePackageName(app.pacchetto || app.assignedProfile || 'Base');
            const assignedProfile = String(app.assignedProfile || firestoreService._profileFromPackage(pacchetto)).trim().toLowerCase();
            const enabled = app.enabled !== false;
            const allowedViews = firestoreService._allowedViewsForPackage(pacchetto);
            return {
                success: true,
                context: {
                    email: String(user.email || '').trim(),
                    role,
                    pacchetto,
                    assignedProfile,
                    enabled,
                    allowedViews,
                    appKey
                }
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    listUsersForAdmin: async (limitCount = 200) => {
        try {
            const adminCheck = await firestoreService.isUserAdmin();
            if (!adminCheck.success || !adminCheck.isAdmin) return { success: false, error: 'Permessi insufficienti' };
            const size = Math.max(1, Math.min(500, Number(limitCount) || 200));
            const snap = await window.db.collection('users').limit(size).get();
            const users = [];
            snap.forEach((docSnap) => {
                const data = docSnap.data() || {};
                const app = (data.apps && data.apps.mvs) ? data.apps.mvs : {};
                const pacchetto = firestoreService._normalizePackageName(app.pacchetto || app.assignedProfile || 'Base');
                users.push({
                    id: docSnap.id,
                    email: String(data.email || docSnap.id || '').trim(),
                    role: String(app.role || data.role || 'user').trim().toLowerCase() || 'user',
                    pacchetto,
                    assignedProfile: String(app.assignedProfile || firestoreService._profileFromPackage(pacchetto)).trim().toLowerCase(),
                    enabled: app.enabled !== false,
                    appMembership: String(data.appMembership || '').trim(),
                    stats: (data.stats && typeof data.stats === 'object') ? data.stats : {},
                    usage: (data.usage && typeof data.usage === 'object') ? data.usage : {},
                    createdAt: data.createdAt || null,
                    updatedAt: data.updatedAt || null
                });
            });
            users.sort((a, b) => String(a.email || '').localeCompare(String(b.email || ''), 'it', { sensitivity: 'base' }));
            return { success: true, users };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    updateUserAppAccess: async (userEmail, payload = {}) => {
        try {
            const adminCheck = await firestoreService.isUserAdmin();
            if (!adminCheck.success || !adminCheck.isAdmin) return { success: false, error: 'Permessi insufficienti' };
            const target = String(userEmail || '').trim();
            if (!target) return { success: false, error: 'Email utente non valida' };
            let role = '';
            if (payload.role != null) {
                role = String(payload.role || '').trim().toLowerCase() === 'admin' ? 'admin' : 'user';
            } else {
                try {
                    const currentSnap = await window.db.collection('users').doc(target).get();
                    const currentData = currentSnap.exists ? (currentSnap.data() || {}) : {};
                    role = String(currentData?.apps?.mvs?.role || currentData?.role || 'user').trim().toLowerCase() === 'admin' ? 'admin' : 'user';
                } catch (_) {
                    role = 'user';
                }
            }
            const pacchetto = firestoreService._normalizePackageName(payload.pacchetto || 'Base');
            const assignedProfile = String(payload.assignedProfile || firestoreService._profileFromPackage(pacchetto)).trim().toLowerCase();
            const enabled = payload.enabled !== false;
            const actor = String(authFunctions.getCurrentUser()?.email || '').trim();
            const ref = window.db.collection('users').doc(target);
            await ref.set({
                email: target,
                role,
                apps: {
                    mvs: {
                        role,
                        pacchetto,
                        assignedProfile,
                        enabled,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedBy: actor
                    }
                },
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    requestPackageUpgrade: async (targetPackage = '', appKey = 'mvs') => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) return { success: false, error: 'Utente non autenticato' };
            const target = firestoreService._normalizePackageName(targetPackage || '');
            const ctxRes = await firestoreService.getUserAppContext(appKey);
            if (!ctxRes?.success) return { success: false, error: String(ctxRes?.error || 'Profilo non disponibile') };
            const ctx = ctxRes.context || {};
            const current = firestoreService._normalizePackageName(ctx.pacchetto || 'Base');
            if (current === 'ProMax') return { success: false, error: 'Hai già il pacchetto massimo' };
            const expectedNext = firestoreService._nextPackageFor(current);
            if (!target || target !== expectedNext) return { success: false, error: `Upgrade consentito solo a ${expectedNext}` };
            const reqRef = window.db.collection('users').doc(String(user.email || '').trim()).collection('profile_requests').doc();
            const now = firebase.firestore.FieldValue.serverTimestamp();
            await reqRef.set({
                id: reqRef.id,
                appKey,
                type: 'package_upgrade',
                userEmail: String(user.email || '').trim(),
                currentPackage: current,
                targetPackage: target,
                status: 'pending',
                note: '',
                createdAt: now,
                updatedAt: now
            });
            return { success: true, requestId: reqRef.id };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    listPackageUpgradeRequestsForAdmin: async (status = 'pending') => {
        try {
            const adminCheck = await firestoreService.isUserAdmin();
            if (!adminCheck.success || !adminCheck.isAdmin) return { success: false, error: 'Permessi insufficienti' };
            const query = window.db.collectionGroup('profile_requests')
                .where('type', '==', 'package_upgrade')
                .where('appKey', '==', 'mvs')
                .where('status', '==', String(status || 'pending').trim().toLowerCase());
            const snap = await query.get();
            const requests = [];
            snap.forEach((docSnap) => {
                const d = docSnap.data() || {};
                requests.push({
                    id: d.id || docSnap.id,
                    path: docSnap.ref.path,
                    userEmail: String(d.userEmail || '').trim(),
                    currentPackage: firestoreService._normalizePackageName(d.currentPackage || 'Base'),
                    targetPackage: firestoreService._normalizePackageName(d.targetPackage || 'Base'),
                    status: String(d.status || 'pending').trim().toLowerCase(),
                    createdAt: d.createdAt || null,
                    updatedAt: d.updatedAt || null
                });
            });
            requests.sort((a, b) => {
                const at = a.createdAt?.seconds || 0;
                const bt = b.createdAt?.seconds || 0;
                return bt - at;
            });
            return { success: true, requests };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    resolvePackageUpgradeRequest: async (requestPath, action = 'approve') => {
        try {
            const adminCheck = await firestoreService.isUserAdmin();
            if (!adminCheck.success || !adminCheck.isAdmin) return { success: false, error: 'Permessi insufficienti' };
            const path = String(requestPath || '').trim();
            if (!path) return { success: false, error: 'Richiesta non valida' };
            const reqRef = window.db.doc(path);
            const snap = await reqRef.get();
            if (!snap.exists) return { success: false, error: 'Richiesta non trovata' };
            const d = snap.data() || {};
            const status = String(d.status || 'pending').trim().toLowerCase();
            if (status !== 'pending') return { success: false, error: 'Richiesta già processata' };
            const userEmail = String(d.userEmail || '').trim();
            const currentPackage = firestoreService._normalizePackageName(d.currentPackage || 'Base');
            const targetPackage = firestoreService._normalizePackageName(d.targetPackage || 'Base');
            const expectedNext = firestoreService._nextPackageFor(currentPackage);
            if (!userEmail) return { success: false, error: 'Email richiesta non valida' };
            if (targetPackage !== expectedNext) return { success: false, error: 'Upgrade richiesto non coerente' };
            const actor = String(authFunctions.getCurrentUser()?.email || '').trim();
            if (String(action || '').trim().toLowerCase() === 'approve') {
                await firestoreService.updateUserAppAccess(userEmail, {
                    role: 'user',
                    pacchetto: targetPackage,
                    assignedProfile: firestoreService._profileFromPackage(targetPackage),
                    enabled: true
                });
                await reqRef.set({
                    status: 'approved',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: actor
                }, { merge: true });
                return { success: true, status: 'approved' };
            }
            await reqRef.set({
                status: 'rejected',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: actor
            }, { merge: true });
            return { success: true, status: 'rejected' };
        } catch (error) {
            return { success: false, error: error.message };
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
                _type: 'match',
                _source: 'mvs',
                _version: '2.0',
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
        // Cloud-only: i dati risiedono già in Firestore, nessun sync locale→cloud necessario
        return { success: true, syncResults: { matches: { synced: 0, errors: 0 }, rosters: { synced: 0, errors: 0 } }, message: 'Cloud-only mode: nessun dato locale da sincronizzare' };
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
        // Cloud-only: no local storage for rosters
        return { success: true, message: 'Cloud-only mode: nessun dato locale da eliminare' };
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

            // Cloud-only: backup operates on Firestore data, appSettings from localStorage only
            const appState = {
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
                message: 'Backup automatico completato (cloud-only mode)',
                timestamp: new Date()
            };

        } catch (error) {
            console.error('Errore nel backup automatico:', error);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Carica il roster di default (da ROSTER DEFAULT.csv) se l'utente non ha ancora roster in Firestore.
    // Viene chiamato al primo accesso per permettere all'utente di provare l'app con dati placeholder.
    loadDefaultRosterIfNeeded: async () => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) return { success: false, skipped: true, reason: 'not_authenticated' };

            // Controlla se l'utente ha già almeno un roster in Firestore (lettura economica: limit 1)
            const rostersSnap = await firestoreService.getUserRef()
                .collection('rosters')
                .limit(1)
                .get();

            if (!rostersSnap.empty) {
                // Roster già presenti: nessuna azione necessaria
                return { success: true, skipped: true, reason: 'roster_exists' };
            }

            // Nessun roster trovato → carica i dati da ROSTER DEFAULT.csv
            const DEFAULT_ROSTER_PLAYERS = [
                { number: '04', name: 'NOME 01', surname: 'COGNOME 01', nickname: 'PALL. 1',  role: 'P' },
                { number: '08', name: 'NOME 02', surname: 'COGNOME 02', nickname: 'PALL. 2',  role: 'P' },
                { number: '14', name: 'NOME 03', surname: 'COGNOME 03', nickname: 'LIB. 1',   role: 'L' },
                { number: '15', name: 'NOME 04', surname: 'COGNOME 04', nickname: 'LIB. 2',   role: 'L' },
                { number: '03', name: 'NOME 05', surname: 'COGNOME 05', nickname: 'BANDA 1',  role: 'M' },
                { number: '06', name: 'NOME 06', surname: 'COGNOME 06', nickname: 'BANDA 2',  role: 'M' },
                { number: '07', name: 'NOME 07', surname: 'COGNOME 07', nickname: 'BANDA 3',  role: 'M' },
                { number: '11', name: 'NOME 08', surname: 'COGNOME 08', nickname: 'BANDA 4',  role: 'M' },
                { number: '01', name: 'NOME 09', surname: 'COGNOME 09', nickname: 'CENTRO 1', role: 'C' },
                { number: '02', name: 'NOME 10', surname: 'COGNOME 10', nickname: 'CENTRO 2', role: 'C' },
                { number: '13', name: 'NOME 11', surname: 'COGNOME 11', nickname: 'CENTRO 3', role: 'C' },
                { number: '05', name: 'NOME 12', surname: 'COGNOME 12', nickname: 'CENTRO 4', role: 'C' },
                { number: '09', name: 'NOME 13', surname: 'COGNOME 13', nickname: 'OPP. 1',   role: 'O' },
                { number: '12', name: 'NOME 14', surname: 'COGNOME 14', nickname: 'OPP. 2',   role: 'O' },
            ];

            // Scrive direttamente con ID fisso 'roster_default'
            const rosterRef = firestoreService.getUserRef()
                .collection('rosters')
                .doc('roster_default');

            const rosterData = {
                id: 'roster_default',
                name: 'MY TEAM',
                teamName: 'MY TEAM',
                clubName: 'MY VOLLEY',
                roster: DEFAULT_ROSTER_PLAYERS,
                players: DEFAULT_ROSTER_PLAYERS,
                isDefault: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await rosterRef.set(rosterData);

            // Aggiorna le statistiche utente
            try {
                await firestoreService.getUserRef().update({
                    'stats.totalRosters': firebase.firestore.FieldValue.increment(1)
                });
            } catch(_) {}

            console.log('[VolleyScout] Roster di default creato in Firestore con ID: roster_default');
            return { success: true, id: 'roster_default' };
        } catch (error) {
            console.error('[VolleyScout] Errore nel caricamento roster di default:', error);
            return { success: false, error: error.message };
        }
    },

    // ── Eliminazione account utente (GDPR Art. 17 — Diritto all'oblio) ──────────
    deleteUserAccount: async (userEmail) => {
        try {
            const user = authFunctions.getCurrentUser();
            if (!user) throw new Error('Utente non autenticato');
            const email = String(userEmail || user.email || '').trim();
            if (!email) throw new Error('Email utente non disponibile');

            const emailKey = email.toLowerCase().replace(/\./g, '_');
            const emailVariants = [email, email.toLowerCase(), emailKey];

            // Elimina il documento utente principale e tutte le subcollection raggiungibili
            for (const variant of emailVariants) {
                try {
                    const userRef = window.db.collection('users').doc(variant);
                    const snap = await userRef.get();
                    if (!snap.exists) continue;

                    // Elimina subcollection teams (con matches e roster annidati)
                    const subcollections = ['teams', 'invites', 'shared_teams', 'usage', 'shared_access', 'news', 'offers'];
                    for (const subCol of subcollections) {
                        try {
                            const subSnap = await userRef.collection(subCol).get();
                            for (const subDoc of subSnap.docs) {
                                // Per teams: elimina anche le sottocollection annidate
                                if (subCol === 'teams') {
                                    const innerCols = ['matches', 'user_access', 'calendar'];
                                    for (const ic of innerCols) {
                                        try {
                                            const icSnap = await subDoc.ref.collection(ic).get();
                                            for (const icDoc of icSnap.docs) { try { await icDoc.ref.delete(); } catch(_) {} }
                                        } catch(_) {}
                                    }
                                }
                                try { await subDoc.ref.delete(); } catch(_) {}
                            }
                        } catch(_) {}
                    }
                    // Elimina il documento radice utente
                    await userRef.delete();
                } catch(_) {}
            }

            // Elimina anche dalle collection legacy (rosters, matches, teams flat)
            const legacyCollections = ['rosters', 'matches', 'teams'];
            for (const legCol of legacyCollections) {
                try {
                    const legSnap = await window.db.collection(legCol)
                        .where('userId', 'in', [user.email, user.uid, emailKey].slice(0, 3))
                        .get();
                    for (const legDoc of legSnap.docs) { try { await legDoc.ref.delete(); } catch(_) {} }
                } catch(_) {}
            }

            console.log('[VolleyScout] Account e dati eliminati per:', email);
            return { success: true };
        } catch (error) {
            console.error('[VolleyScout] Errore eliminazione account:', error);
            return { success: false, error: error.message };
        }
    }
};

// Esposizione globale del servizio
window.firestoreService = firestoreService;
