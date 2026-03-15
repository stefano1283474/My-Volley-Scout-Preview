/**
 * live-stats-computer.js
 *
 * Emula le formule Excel presenti nei fogli Riepilogo, Gioco e Giri di Rice
 * del file DataVolley (.xlsm), calcolando le stesse statistiche a partire
 * dalle azioni registrate da My Volley Scout durante il live-scouting.
 *
 * Questo permette a My Volley Team Analysis di ricevere dataset completi
 * (riepilogo + gioco + giriDiRice + rallies) anche per le partite scoutate
 * live, senza attendere l'importazione del file xlsm DataVolley.
 *
 * ── Mappa qualità/valutazione (DataVolley standard) ─────────────────────────
 *   5 = Kill / Ace / Muro vincente   (#)
 *   4 = Positivo                     (+)
 *   3 = Accettabile / In-sistema     (!)
 *   2 = Negativo                     (-)
 *   1 = Errore                       (/)
 *
 * ── Codici fondamentali ──────────────────────────────────────────────────────
 *   'a' = Attacco
 *   'b' = Battuta (serve)
 *   'm' = Muro (block)
 *   'r' = Ricezione
 *   'd' = Difesa
 *
 * ── Campi output ─────────────────────────────────────────────────────────────
 *   riepilogo   → equivalente foglio "Riepilogo"    (playerStats, team, opponent, rotations)
 *   gioco       → equivalente foglio "Gioco"         (overview, rotationStats, attackFrom...)
 *   giriDiRice  → equivalente foglio "Giri di Rice"  (serveRotations, receiveRotations)
 *   rallies     → array rally nel formato MVTA        (quartine, phase, rotation, isPoint...)
 */
(function (global) {
    'use strict';

    // ── Utilities ────────────────────────────────────────────────────────────

    /** Crea un oggetto statistico vuoto. */
    function mkStat() {
        return { kill: 0, pos: 0, exc: 0, neg: 0, err: 0, tot: 0 };
    }

    /**
     * Aggiunge una valutazione a un oggetto statistico.
     * @param {object} stat  - Oggetto statistico target
     * @param {number} e     - Valutazione 1-5
     */
    function addEval(stat, e) {
        stat.tot++;
        e = Number(e) || 0;
        if      (e === 5) stat.kill++;
        else if (e === 4) stat.pos++;
        else if (e === 3) stat.exc++;
        else if (e === 2) stat.neg++;
        else if (e === 1) stat.err++;
    }

    /**
     * Calcola percentuali derivate su un oggetto statistico.
     * Formula DataVolley:
     *   pct        = kill / tot * 100            (% punti diretti)
     *   efficacy   = (kill - err) / tot * 100    (efficacia)
     *   efficiency = (kill - err - neg) / tot * 100  (efficienza)
     */
    function finalizeStat(s) {
        if (!s || !s.tot) return Object.assign({}, s || mkStat(), { pct: 0, efficacy: 0, efficiency: 0 });
        return Object.assign({}, s, {
            pct:        +(( s.kill                        / s.tot) * 100).toFixed(1),
            efficacy:   +(((s.kill - s.err)               / s.tot) * 100).toFixed(1),
            efficiency: +(((s.kill - s.err - s.neg)       / s.tot) * 100).toFixed(1),
        });
    }

    /** Converte 'P1'-'P6' → numero 1-6. Accetta anche numeri già convertiti. */
    function parseRotation(raw) {
        if (!raw) return 0;
        const n = parseInt(String(raw).replace(/^[Pp]/i, ''), 10);
        return (n >= 1 && n <= 6) ? n : 0;
    }

    /**
     * Estrae l'array di azioni da un entry di actionsBySet.
     * Supporta sia il formato { result: { actions: [...] } } sia { actions: [...] }.
     */
    function extractActions(entry) {
        if (Array.isArray(entry?.result?.actions)) return entry.result.actions;
        if (Array.isArray(entry?.actions))          return entry.actions;
        return [];
    }

    /**
     * Normalizza l'esito di un rally.
     * @returns {'home_point'|'away_point'|'continue'}
     */
    function extractOutcome(entry) {
        const r = String(entry?.result?.result || entry?.outcome || entry?.result || '').toLowerCase();
        if (r === 'home_point' || r === 'point')  return 'home_point';
        if (r === 'away_point' || r === 'error')  return 'away_point';
        return 'continue';
    }

    // ── Riepilogo ─────────────────────────────────────────────────────────────

    /**
     * Calcola statistiche equivalenti al foglio "Riepilogo" del DataVolley xlsm.
     *
     * @param {object}  actionsBySet  - { [setNum]: [{result:{actions,result}, rotation, ...}] }
     * @param {Array}   roster        - Array giocatori { number, surname, name, ... }
     * @returns {object} Struttura riepilogo compatibile con MVTA dataParser.js
     */
    function computeRiepilogo(actionsBySet, roster) {

        // Mappa roster per numero
        const rosterMap = {};
        (Array.isArray(roster) ? roster : []).forEach(function (p) {
            var num = String(p.number || p.num || '').replace(/^'+/, '').padStart(2, '0');
            if (num) rosterMap[num] = {
                surname: String(p.surname  || p.lastName  || '').trim(),
                name:    String(p.name     || p.firstName || '').trim(),
            };
        });

        var pMap    = {};  // numero → stats per giocatore
        var team    = { attack: mkStat(), serve: mkStat(), block: mkStat(), reception: mkStat(), defense: mkStat() };
        var opp     = { attack: mkStat(), serve: mkStat(), reception: mkStat(), defense: mkStat() };
        var rotMap  = {};  // rotation → { totalPoints, pointsMade, pointsLost }
        var totalPointsMade = 0, totalErrors = 0;

        function getP(num) {
            var n = String(num || '').replace(/^'+/, '').padStart(2, '0');
            if (!pMap[n]) {
                var info = rosterMap[n] || { surname: '', name: '' };
                pMap[n] = {
                    number:     n,
                    surname:    info.surname,
                    name:       info.name,
                    attack:     mkStat(),
                    serve:      mkStat(),
                    block:      mkStat(),
                    reception:  mkStat(),
                    defense:    mkStat(),
                    pointsMade: 0,
                    errors:     0,
                };
            }
            return pMap[n];
        }

        function processEntry(entry) {
            var acts    = extractActions(entry);
            var outcome = extractOutcome(entry);
            var rot     = parseRotation(entry && entry.rotation);

            // Rotazioni
            if (rot) {
                if (!rotMap[rot]) rotMap[rot] = { rotation: rot, totalPoints: 0, pointsMade: 0, pointsLost: 0 };
                rotMap[rot].totalPoints++;
                if (outcome === 'home_point') rotMap[rot].pointsMade++;
                if (outcome === 'away_point') rotMap[rot].pointsLost++;
            }
            if (outcome === 'home_point') totalPointsMade++;
            if (outcome === 'away_point') totalErrors++;

            acts.forEach(function (act) {
                var f = String(act && act.fundamental || '').toLowerCase();
                var e = Number(act && (act.evaluation !== undefined ? act.evaluation : act.value) || 0);
                var p = getP(act && act.player);

                switch (f) {
                    case 'a': // Attacco
                        addEval(p.attack,   e); addEval(team.attack,   e);
                        if (e === 5) { p.pointsMade++;  addEval(opp.defense,   1); }
                        else if (e === 1) { p.errors++; addEval(opp.defense,   5); }
                        else { addEval(opp.defense, Math.max(1, Math.min(5, 5 - e + 1))); }
                        break;
                    case 'b': // Battuta (serve)
                        addEval(p.serve,    e); addEval(team.serve,    e);
                        if (e === 5) { p.pointsMade++;  addEval(opp.reception, 1); }  // ace → errore ricezione avv
                        else if (e === 1) { p.errors++; addEval(opp.reception, 5); }  // errore battuta → buona ricezione avv
                        else { addEval(opp.reception, Math.max(1, Math.min(5, 5 - e + 1))); }
                        break;
                    case 'm': // Muro (block)
                        addEval(p.block,    e); addEval(team.block,    e);
                        if (e === 5) { p.pointsMade++;  addEval(opp.attack,    1); }  // muro vincente → errore attacco avv
                        else if (e === 1) { p.errors++; addEval(opp.attack,    4); }  // muro out → attacco positivo avv
                        break;
                    case 'r': // Ricezione
                        addEval(p.reception, e); addEval(team.reception, e);
                        // Inferisci qualità battuta avversaria (inversa)
                        if      (e === 1) addEval(opp.serve, 5);      // errore ricezione → ace avversario
                        else if (e >= 4)  addEval(opp.serve, 2);      // ricezione ottima → battuta debole
                        else              addEval(opp.serve, 3);
                        break;
                    case 'd': // Difesa
                        addEval(p.defense,   e); addEval(team.defense,  e);
                        // Inferisci qualità attacco avversario (inversa)
                        if      (e === 1) addEval(opp.attack, 5);     // errore difesa → kill avversario
                        else if (e >= 4)  addEval(opp.attack, 2);     // difesa ottima → attacco debole
                        else              addEval(opp.attack, 3);
                        break;
                }
            });
        }

        if (actionsBySet && typeof actionsBySet === 'object') {
            Object.values(actionsBySet).forEach(function (setActions) {
                (Array.isArray(setActions) ? setActions : []).forEach(processEntry);
            });
        }

        // Costruisci playerStats
        var playerStats = Object.values(pMap).map(function (p) {
            var made  = p.pointsMade;
            var errs  = p.errors;
            var tot   = p.attack.tot + p.serve.tot + p.block.tot;
            return {
                number: p.number,
                name:   (p.surname + (p.name ? ' ' + p.name : '')).trim() || p.number,
                attack: finalizeStat(p.attack),
                serve:  finalizeStat(p.serve),
                block: {
                    kill: p.block.kill, pos: p.block.pos,
                    exc:  p.block.exc,  neg: p.block.neg, err: p.block.err,
                },
                points: {
                    made:      made,
                    madePct:   tot ? +((made / tot) * 100).toFixed(1) : 0,
                    errors:    errs,
                    errorsPct: tot ? +((errs / tot) * 100).toFixed(1) : 0,
                    balance:   made - errs,
                },
            };
        });

        var playerReception = Object.values(pMap)
            .filter(function (p) { return p.reception.tot > 0; })
            .map(function (p) {
                return Object.assign(
                    { number: p.number, name: (p.surname + ' ' + p.name).trim() },
                    finalizeStat(p.reception)
                );
            });

        var playerDefense = Object.values(pMap)
            .filter(function (p) { return p.defense.tot > 0; })
            .map(function (p) {
                return Object.assign(
                    { number: p.number, name: (p.surname + ' ' + p.name).trim() },
                    finalizeStat(p.defense)
                );
            });

        return {
            playerStats:    playerStats,
            playerReception: playerReception,
            playerDefense:   playerDefense,
            team: {
                attack:    finalizeStat(team.attack),
                serve:     finalizeStat(team.serve),
                block:     finalizeStat(team.block),
                reception: finalizeStat(team.reception),
                defense:   finalizeStat(team.defense),
            },
            opponent: {
                attack:    finalizeStat(opp.attack),
                serve:     finalizeStat(opp.serve),
                reception: finalizeStat(opp.reception),
                defense:   finalizeStat(opp.defense),
            },
            rotations:       Object.values(rotMap),
            totalPointsMade: totalPointsMade,
            totalErrors:     totalErrors,
        };
    }

    // ── Gioco ─────────────────────────────────────────────────────────────────

    /**
     * Calcola statistiche equivalenti al foglio "Gioco" del DataVolley xlsm.
     *
     * @param {object} actionsBySet
     * @returns {object} Struttura gioco compatibile con MVTA dataParser.js
     */
    function computeGioco(actionsBySet) {
        var overview = { attack: mkStat(), serve: mkStat(), reception: mkStat(), defense: mkStat() };
        var rotStats = {};      // rotation → { attack, serve, reception, defense }
        var arBuckets = { R5: mkStat(), R4: mkStat(), R3: mkStat() }; // attacco dopo ricezione per qualità
        var adBuckets = { D5: mkStat(), D4: mkStat(), D3: mkStat() }; // attacco dopo difesa per qualità
        var recByRot  = {};    // rotation → stat ricezione

        function getRotStats(r) {
            if (!rotStats[r]) rotStats[r] = {
                rotation: r,
                attack: mkStat(), serve: mkStat(), reception: mkStat(), defense: mkStat()
            };
            return rotStats[r];
        }

        function processSet(setActions) {
            var lastRecevaluation = null;   // qualità ultima ricezione
            var lastDefEvaluation = null;   // qualità ultima difesa
            var lastRot = 0;

            (Array.isArray(setActions) ? setActions : []).forEach(function (entry) {
                var acts = extractActions(entry);
                var rot  = parseRotation(entry && entry.rotation) || lastRot;
                lastRot  = rot;
                var rs   = rot ? getRotStats(rot) : null;

                // Ricezione per rotazione
                if (rot && !recByRot[rot]) recByRot[rot] = Object.assign({ rotation: rot }, mkStat());

                acts.forEach(function (act) {
                    var f = String(act && act.fundamental || '').toLowerCase();
                    var e = Number(act && (act.evaluation !== undefined ? act.evaluation : act.value) || 0);

                    switch (f) {
                        case 'a':
                            addEval(overview.attack, e);
                            if (rs) addEval(rs.attack, e);
                            // Qualità attacco dopo ultima ricezione
                            if (lastRecevaluation !== null) {
                                var rk = lastRecevaluation >= 4 ? 'R5' : (lastRecevaluation >= 3 ? 'R4' : 'R3');
                                addEval(arBuckets[rk], e);
                                lastRecevaluation = null;
                            }
                            // Qualità attacco dopo ultima difesa
                            if (lastDefEvaluation !== null) {
                                var dk = lastDefEvaluation >= 4 ? 'D5' : (lastDefEvaluation >= 3 ? 'D4' : 'D3');
                                addEval(adBuckets[dk], e);
                                lastDefEvaluation = null;
                            }
                            break;
                        case 'b':
                            addEval(overview.serve, e);
                            if (rs) addEval(rs.serve, e);
                            break;
                        case 'r':
                            addEval(overview.reception, e);
                            if (rs) addEval(rs.reception, e);
                            if (rot && recByRot[rot]) addEval(recByRot[rot], e);
                            lastRecevaluation = e;
                            lastDefEvaluation = null;
                            break;
                        case 'd':
                            addEval(overview.defense, e);
                            if (rs) addEval(rs.defense, e);
                            lastDefEvaluation = e;
                            lastRecevaluation = null;
                            break;
                    }
                });
            });
        }

        if (actionsBySet && typeof actionsBySet === 'object') {
            Object.values(actionsBySet).forEach(processSet);
        }

        // Formato MVTA per attackFromReception/Defense
        var attackFromReception = {};
        var attackFromDefense   = {};
        ['R5', 'R4', 'R3'].forEach(function (k) {
            var s = finalizeStat(arBuckets[k]);
            attackFromReception[k] = [{ role: 'ATT', attacks: s.tot, pointsStr: s.kill + '/' + s.err }];
        });
        ['D5', 'D4', 'D3'].forEach(function (k) {
            var s = finalizeStat(adBuckets[k]);
            attackFromDefense[k] = [{ role: 'ATT', attacks: s.tot, pointsStr: s.kill + '/' + s.err }];
        });

        var receptionByRotation = Object.values(recByRot).map(function (r) {
            var rot  = r.rotation;
            var copy = Object.assign({}, r);
            delete copy.rotation;
            return Object.assign({ rotation: rot }, finalizeStat(copy));
        });

        return {
            overview: {
                attack:    finalizeStat(overview.attack),
                serve:     finalizeStat(overview.serve),
                reception: finalizeStat(overview.reception),
                defense:   finalizeStat(overview.defense),
            },
            rotationStats: Object.values(rotStats).map(function (rs) {
                return {
                    rotation: rs.rotation,
                    fundamentals: {
                        attack:    finalizeStat(rs.attack),
                        serve:     finalizeStat(rs.serve),
                        reception: finalizeStat(rs.reception),
                        defense:   finalizeStat(rs.defense),
                    },
                };
            }),
            attackFromReception: attackFromReception,
            attackFromDefense:   attackFromDefense,
            receptionByRotation: receptionByRotation,
        };
    }

    // ── Giri di Rice ──────────────────────────────────────────────────────────

    /**
     * Calcola statistiche equivalenti al foglio "Giri di Rice" del DataVolley xlsm.
     *
     * "Giri di Battuta"   (serveRotations)  = rotazioni quando battiamo (fase break-point)
     * "Giri di Ricezione" (receiveRotations) = rotazioni quando riceviamo (fase side-out)
     *
     * @param {object} actionsBySet
     * @returns {object} Struttura giriDiRice compatibile con MVTA dataParser.js
     */
    function computeGiriDiRice(actionsBySet) {
        var serveRot   = {};   // rot → { breakPts, attackPts, blockPts, errors, total }
        var receiveRot = {};   // rot → { attackPts, blockPts, oppServeErrors, oppGiftPts, total }

        function getSR(r) {
            if (!serveRot[r]) serveRot[r]   = { rotation: r, breakPts: 0, attackPts: 0, blockPts: 0, errors: 0, total: 0 };
            return serveRot[r];
        }
        function getRR(r) {
            if (!receiveRot[r]) receiveRot[r] = { rotation: r, attackPts: 0, blockPts: 0, oppServeErrors: 0, oppGiftPts: 0, total: 0 };
            return receiveRot[r];
        }

        function processSet(setActions) {
            var currentPhase = null;   // null | 'b' | 'r'
            var lastRot = 0;

            (Array.isArray(setActions) ? setActions : []).forEach(function (entry) {
                var acts    = extractActions(entry);
                var outcome = extractOutcome(entry);
                var rot     = parseRotation(entry && entry.rotation) || lastRot;
                lastRot = rot;
                if (!rot) return;

                // Determina fase dal primo fondamentale del rally
                var phase = currentPhase;
                for (var i = 0; i < acts.length; i++) {
                    var f0 = String(acts[i] && acts[i].fundamental || '').toLowerCase();
                    if (f0 === 'b') { phase = 'b'; break; }
                    if (f0 === 'r') { phase = 'r'; break; }
                }
                if (phase === null) phase = 'r'; // default: ricezione
                currentPhase = (outcome !== 'continue') ? (phase === 'b' ? 'r' : 'b') : phase;
                // Al cambio punto la fase si inverte (chi ha appena segnato, ora serve)

                if (phase === 'b') {
                    // Fase break-point: siamo noi a servire
                    var sr = getSR(rot);
                    sr.total++;
                    if (outcome === 'home_point') {
                        // Determina come abbiamo segnato
                        var scored = false;
                        for (var j = acts.length - 1; j >= 0; j--) {
                            var fa = String(acts[j] && acts[j].fundamental || '').toLowerCase();
                            var ea = Number(acts[j] && (acts[j].evaluation !== undefined ? acts[j].evaluation : acts[j].value) || 0);
                            if (fa === 'a' && ea >= 4) { sr.attackPts++; scored = true; break; }
                            if (fa === 'm' && ea === 5) { sr.blockPts++;  scored = true; break; }
                            if (fa === 'b' && ea === 5) { sr.breakPts++;  scored = true; break; }
                        }
                        if (!scored) sr.breakPts++; // punto da continuazione / errore avversario
                    } else if (outcome === 'away_point') {
                        // Verifica se abbiamo fatto errore di battuta
                        var serveErr = acts.some(function (a) {
                            return String(a && a.fundamental || '').toLowerCase() === 'b'
                                && Number(a && (a.evaluation !== undefined ? a.evaluation : a.value) || 0) === 1;
                        });
                        if (serveErr) sr.errors++;
                    }
                } else {
                    // Fase side-out: riceviamo noi
                    var rr = getRR(rot);
                    rr.total++;
                    if (outcome === 'home_point') {
                        var hasBlockPt = acts.some(function (a) {
                            return String(a && a.fundamental || '').toLowerCase() === 'm'
                                && Number(a && (a.evaluation !== undefined ? a.evaluation : a.value) || 0) === 5;
                        });
                        if (hasBlockPt) rr.blockPts++;
                        else            rr.attackPts++;
                    } else if (outcome === 'away_point') {
                        // Punto avversario: da ace (errore ricezione) o da attacco
                        var recErr2 = acts.some(function (a) {
                            return String(a && a.fundamental || '').toLowerCase() === 'r'
                                && Number(a && (a.evaluation !== undefined ? a.evaluation : a.value) || 0) === 1;
                        });
                        if (recErr2) rr.oppServeErrors++;
                        // else: punto da attacco avversario (già conteggiato indirettamente)
                    }
                }
            });
        }

        if (actionsBySet && typeof actionsBySet === 'object') {
            Object.values(actionsBySet).forEach(processSet);
        }

        return {
            serveRotations:   Object.values(serveRot),
            receiveRotations: Object.values(receiveRot),
        };
    }

    // ── Rallies (formato MVTA) ────────────────────────────────────────────────

    /**
     * Converte actionsBySet di MVS nel formato rallies richiesto da MVTA
     * (usato da analyticsEngine.js per analisi avanzate).
     *
     * @param {object} actionsBySet
     * @returns {Array} Array rally nel formato MVTA
     */
    function actionsToRallies(actionsBySet) {
        var rallies = [];
        if (!actionsBySet || typeof actionsBySet !== 'object') return rallies;

        Object.entries(actionsBySet).forEach(function (entry) {
            var setNumStr  = entry[0];
            var setActions = entry[1];
            var setNum     = Number(setNumStr) || 0;
            if (!Array.isArray(setActions)) return;

            var ourScore = 0, theirScore = 0;
            var phase    = 'r';  // inizia con ricezione (può essere sovrascritto)

            setActions.forEach(function (e, idx) {
                var acts    = extractActions(e);
                var outcome = extractOutcome(e);
                var rot     = parseRotation(e && e.rotation);

                // Aggiorna punteggio da stringa "home-away" se disponibile
                if (e && e.score) {
                    var parts = String(e.score).split(/[-–]/);
                    if (parts.length === 2) {
                        ourScore   = Number(parts[0]) || ourScore;
                        theirScore = Number(parts[1]) || theirScore;
                    }
                }

                // Determina fase dal primo fondamentale
                if (acts.length) {
                    var f0 = String(acts[0] && acts[0].fundamental || '').toLowerCase();
                    if (f0 === 'b') phase = 'b';
                    else if (f0 === 'r') phase = 'r';
                }

                // Costruisci quartine nel formato MVTA
                var quartine = acts.map(function (act) {
                    var player = String(act && act.player || '').replace(/^'+/, '').padStart(2, '0');
                    var fund   = String(act && act.fundamental || '').toLowerCase();
                    var val    = Number(act && (act.evaluation !== undefined ? act.evaluation : act.value) || 0);
                    return {
                        type:        'action',
                        player:      player,
                        fundamental: fund,
                        value:       val,
                        raw:         player + fund + val,
                    };
                });

                var isPoint = (outcome === 'home_point');
                var isError = (outcome === 'away_point');

                rallies.push({
                    set:          setNum,
                    row:          idx + 1,
                    quartine:     quartine,
                    ourScore:     ourScore,
                    theirScore:   theirScore,
                    isPoint:      isPoint,
                    isError:      isError,
                    rotation:     rot || 0,
                    phase:        phase,
                    actionString: String(e && (e.actionString || e.action) || ''),
                    pointDesc:    isPoint ? 'Punto' : '',
                    errorDesc:    isError ? 'Errore' : '',
                });

                // Aggiorna punteggio per il prossimo rally
                if (outcome === 'home_point')  ourScore++;
                else if (outcome === 'away_point') theirScore++;

                // La fase si inverte dopo un punto (chi ha segnato ora serve)
                if (outcome !== 'continue') {
                    phase = (outcome === 'home_point') ? 'b' : 'r';
                }
            });
        });

        return rallies;
    }

    // ── Entry point principale ────────────────────────────────────────────────

    /**
     * Calcola TUTTI i campi statistici compatibili con MVTA a partire
     * dai dati live-scouting di MVS.
     *
     * Sostituisce i valori null/[] in riepilogo, gioco, giriDiRice, rallies
     * con dati calcolati dagli stessi dati di partenza usati da DataVolley.
     *
     * @param {object} mvsMatch - Match MVS con actionsBySet, setMeta, roster
     * @returns {{ riepilogo, gioco, giriDiRice, rallies }}
     */
    function computeStatsFromLiveScout(mvsMatch) {
        var actionsBySet = (mvsMatch && mvsMatch.actionsBySet) || {};
        var roster       = (mvsMatch && (mvsMatch.roster || mvsMatch.players)) || [];

        // Verifica che ci siano effettivamente azioni
        var hasActions = Object.values(actionsBySet).some(function (s) {
            return Array.isArray(s) && s.length > 0;
        });

        if (!hasActions) {
            return { riepilogo: null, gioco: null, giriDiRice: null, rallies: [] };
        }

        try {
            var riepilogo  = computeRiepilogo(actionsBySet, roster);
            var gioco      = computeGioco(actionsBySet);
            var giriDiRice = computeGiriDiRice(actionsBySet);
            var rallies    = actionsToRallies(actionsBySet);

            console.log('[LiveStatsComputer] Statistiche calcolate:',
                'playerStats:', riepilogo.playerStats.length,
                'rallies:', rallies.length,
                'rotazioni:', riepilogo.rotations.length
            );

            return { riepilogo: riepilogo, gioco: gioco, giriDiRice: giriDiRice, rallies: rallies };
        } catch (err) {
            console.error('[LiveStatsComputer] Errore nel calcolo statistiche:', err);
            return { riepilogo: null, gioco: null, giriDiRice: null, rallies: [] };
        }
    }

    // Esposizione globale
    global.computeStatsFromLiveScout = computeStatsFromLiveScout;
    global.liveStatsComputer = {
        computeRiepilogo:         computeRiepilogo,
        computeGioco:             computeGioco,
        computeGiriDiRice:        computeGiriDiRice,
        actionsToRallies:         actionsToRallies,
        computeStatsFromLiveScout: computeStatsFromLiveScout,
    };

})(typeof window !== 'undefined' ? window : this);
