/**
 * xlsm-full-parser.js
 * Parser completo per file xlsm/xlsx DataVolley.
 * Produce una struttura dati compatibile con My Volley Team Analysis (MVTA).
 *
 * Dipendenza: XLSX (SheetJS) già incluso nella pagina host.
 * Espone: window.parseXlsmFull(wb, fileName) → oggetto match MVTA-compatibile
 */

(function (global) {
    'use strict';

    // ─── Utilities ────────────────────────────────────────────────────────────

    function getCellValue(ws, ref) {
        if (!ws) return null;
        const cell = ws[ref];
        if (!cell) return null;
        if (cell.v != null) return cell.v;
        if (cell.w != null) return String(cell.w).trim();
        return null;
    }

    function n(val) {
        if (val === null || val === undefined || val === '' || val === '--') return 0;
        const num = Number(val);
        return isNaN(num) ? 0 : num;
    }

    function cellRef(col, row) {
        // col is 1-based
        let s = '';
        let c = col;
        while (c > 0) {
            c--;
            s = String.fromCharCode(65 + (c % 26)) + s;
            c = Math.floor(c / 26);
        }
        return s + row;
    }

    function parseRatioString(val) {
        if (!val) return { count: 0, total: 0 };
        const str = String(val);
        const match = str.match(/(\d+)\s*su\s*(\d+)/);
        if (match) return { count: parseInt(match[1]), total: parseInt(match[2]) };
        return { count: 0, total: 0 };
    }

    function parsePointString(val) {
        if (!val) return { total: 0, pct: 0 };
        const str = String(val);
        const match = str.match(/(\d+)\s*\(?([\d.]+)%?\)?/);
        if (match) return { total: parseInt(match[1]), pct: parseFloat(match[2]) };
        return { total: parseInt(str) || 0, pct: 0 };
    }

    // ─── Metadata parser ──────────────────────────────────────────────────────

    function parseMetadata(wb) {
        const ws = wb.Sheets['El. Gioc.'];
        if (!ws) return {};

        const teamName = String(getCellValue(ws, 'C1') || '');
        const opponent = String(getCellValue(ws, 'D20') || '');
        const dateRaw = getCellValue(ws, 'D21');
        const matchType = String(getCellValue(ws, 'D22') || '');
        const homeAway = String(getCellValue(ws, 'D23') || '');
        const phase = String(getCellValue(ws, 'D24') || '');

        let date = '';
        if (dateRaw instanceof Date) {
            date = dateRaw.toISOString().split('T')[0];
        } else if (typeof dateRaw === 'number') {
            try {
                if (typeof XLSX !== 'undefined' && XLSX.SSF) {
                    const dt = XLSX.SSF.parse_date_code(dateRaw);
                    if (dt && dt.y && dt.m && dt.d) {
                        date = new Date(dt.y, dt.m - 1, dt.d).toISOString().slice(0, 10);
                    }
                }
            } catch (_) {}
        } else if (typeof dateRaw === 'string') {
            date = dateRaw.trim();
        }

        return { teamName, opponent, date, matchType, homeAway, phase };
    }

    // ─── Roster parser ────────────────────────────────────────────────────────

    function parseRoster(wb) {
        const ws = wb.Sheets['El. Gioc.'];
        if (!ws) return [];

        const players = [];
        for (let row = 3; row <= 16; row++) {
            const num = getCellValue(ws, 'B' + row);
            const surname = getCellValue(ws, 'C' + row);
            const name = getCellValue(ws, 'D' + row);
            const nickname = getCellValue(ws, 'E' + row);
            const role = getCellValue(ws, 'F' + row);

            if (num && surname && String(surname).trim()) {
                players.push({
                    number: String(num).padStart(2, '0'),
                    surname: String(surname).trim(),
                    name: String(name || '').trim(),
                    nickname: String(nickname || '').trim(),
                    role: String(role || '').trim(),
                    fullName: (String(surname).trim() + ' ' + String(name || '').trim()).trim(),
                });
            }
        }
        return players;
    }

    // ─── Sets parser ──────────────────────────────────────────────────────────

    function parseSets(wb) {
        const sets = [];
        for (let s = 1; s <= 5; s++) {
            const sheetName = 'Set ' + s;
            const ws = wb.Sheets[sheetName];
            if (!ws) continue;

            const ourScore = getCellValue(ws, 'C12');
            const theirScore = getCellValue(ws, 'E12');

            const oppStartRotRaw = getCellValue(ws, 'A6');
            const ourStartRotRaw = getCellValue(ws, 'A7');
            const oppStartRotation = oppStartRotRaw ? (Number(oppStartRotRaw) || null) : null;
            const ourStartRotation = ourStartRotRaw ? (Number(ourStartRotRaw) || null) : null;

            if (ourScore && Number(ourScore) > 0) {
                sets.push({
                    number: s,
                    ourScore: Number(ourScore),
                    theirScore: Number(theirScore) || 0,
                    margin: Number(ourScore) - (Number(theirScore) || 0),
                    won: Number(ourScore) > (Number(theirScore) || 0),
                    oppStartRotation: (oppStartRotation >= 1 && oppStartRotation <= 6) ? oppStartRotation : null,
                    ourStartRotation: (ourStartRotation >= 1 && ourStartRotation <= 6) ? ourStartRotation : null,
                });
            }
        }
        return sets;
    }

    // ─── Riepilogo (match summary) parser ─────────────────────────────────────

    function parseRiepilogo(wb) {
        const ws = wb.Sheets['Riepilogo'];
        if (!ws) return null;

        // Player stats: rows 8-21
        const playerStats = [];
        for (let row = 8; row <= 21; row++) {
            const num = getCellValue(ws, 'A' + row);
            const name = getCellValue(ws, 'B' + row);
            if (!num || !name || name === '--') continue;

            playerStats.push({
                number: String(num).padStart(2, '0'),
                name: String(name).trim(),
                attack: {
                    kill: n(getCellValue(ws, 'C' + row)), pos: n(getCellValue(ws, 'D' + row)),
                    exc: n(getCellValue(ws, 'E' + row)), neg: n(getCellValue(ws, 'F' + row)),
                    err: n(getCellValue(ws, 'G' + row)), tot: n(getCellValue(ws, 'H' + row)),
                    efficacy: n(getCellValue(ws, 'J' + row)), efficiency: n(getCellValue(ws, 'K' + row)),
                },
                serve: {
                    kill: n(getCellValue(ws, 'M' + row)), pos: n(getCellValue(ws, 'N' + row)),
                    exc: n(getCellValue(ws, 'O' + row)), neg: n(getCellValue(ws, 'P' + row)),
                    err: n(getCellValue(ws, 'Q' + row)), tot: n(getCellValue(ws, 'R' + row)),
                    efficacy: n(getCellValue(ws, 'T' + row)), efficiency: n(getCellValue(ws, 'U' + row)),
                },
                block: {
                    kill: n(getCellValue(ws, 'W' + row)), pos: n(getCellValue(ws, 'X' + row)),
                    exc: n(getCellValue(ws, 'Y' + row)), neg: n(getCellValue(ws, 'Z' + row)),
                    err: n(getCellValue(ws, 'AA' + row)),
                    efficacy: n(getCellValue(ws, 'AB' + row)), efficiency: n(getCellValue(ws, 'AC' + row)),
                },
                points: {
                    made: n(getCellValue(ws, 'AE' + row)),
                    madePct: n(getCellValue(ws, 'AF' + row)),
                    errors: n(getCellValue(ws, 'AG' + row)),
                    errorsPct: n(getCellValue(ws, 'AH' + row)),
                    balance: n(getCellValue(ws, 'AI' + row)),
                },
            });
        }

        // Team totals: row 22
        const teamAttack = {
            kill: n(getCellValue(ws, 'C22')), pos: n(getCellValue(ws, 'D22')),
            exc: n(getCellValue(ws, 'E22')), neg: n(getCellValue(ws, 'F22')),
            err: n(getCellValue(ws, 'G22')), tot: n(getCellValue(ws, 'H22')),
            efficacy: n(getCellValue(ws, 'J22')), efficiency: n(getCellValue(ws, 'K22')),
        };
        const teamServe = {
            kill: n(getCellValue(ws, 'M22')), pos: n(getCellValue(ws, 'N22')),
            exc: n(getCellValue(ws, 'O22')), neg: n(getCellValue(ws, 'P22')),
            err: n(getCellValue(ws, 'Q22')), tot: n(getCellValue(ws, 'R22')),
            efficacy: n(getCellValue(ws, 'T22')), efficiency: n(getCellValue(ws, 'U22')),
        };
        const teamBlock = {
            kill: n(getCellValue(ws, 'W22')), pos: n(getCellValue(ws, 'X22')),
            exc: n(getCellValue(ws, 'Y22')), neg: n(getCellValue(ws, 'Z22')),
            err: n(getCellValue(ws, 'AA22')),
            efficacy: n(getCellValue(ws, 'AB22')), efficiency: n(getCellValue(ws, 'AC22')),
        };

        // Opponent totals: row 24
        const oppAttack = {
            kill: n(getCellValue(ws, 'C24')), pos: n(getCellValue(ws, 'D24')),
            exc: n(getCellValue(ws, 'E24')), neg: n(getCellValue(ws, 'F24')),
            err: n(getCellValue(ws, 'G24')), tot: n(getCellValue(ws, 'H24')),
            efficacy: n(getCellValue(ws, 'J24')), efficiency: n(getCellValue(ws, 'K24')),
        };
        const oppServe = {
            kill: n(getCellValue(ws, 'M24')), pos: n(getCellValue(ws, 'N24')),
            exc: n(getCellValue(ws, 'O24')), neg: n(getCellValue(ws, 'P24')),
            err: n(getCellValue(ws, 'Q24')), tot: n(getCellValue(ws, 'R24')),
            efficacy: n(getCellValue(ws, 'T24')), efficiency: n(getCellValue(ws, 'U24')),
        };

        // Player reception/defense: rows 29-42
        const playerReception = [];
        const playerDefense = [];
        for (let row = 29; row <= 42; row++) {
            const num = getCellValue(ws, 'A' + row);
            const name = getCellValue(ws, 'B' + row);
            if (!num || !name || name === '--') continue;

            playerReception.push({
                number: String(num).padStart(2, '0'),
                name: String(name).trim(),
                kill: n(getCellValue(ws, 'C' + row)), pos: n(getCellValue(ws, 'D' + row)),
                exc: n(getCellValue(ws, 'E' + row)), neg: n(getCellValue(ws, 'F' + row)),
                err: n(getCellValue(ws, 'G' + row)), tot: n(getCellValue(ws, 'H' + row)),
                pct: n(getCellValue(ws, 'I' + row)),
                efficacy: n(getCellValue(ws, 'J' + row)), efficiency: n(getCellValue(ws, 'K' + row)),
            });

            playerDefense.push({
                number: String(num).padStart(2, '0'),
                name: String(name).trim(),
                kill: n(getCellValue(ws, 'M' + row)), pos: n(getCellValue(ws, 'N' + row)),
                exc: n(getCellValue(ws, 'O' + row)), neg: n(getCellValue(ws, 'P' + row)),
                err: n(getCellValue(ws, 'Q' + row)), tot: n(getCellValue(ws, 'R' + row)),
                pct: n(getCellValue(ws, 'S' + row)),
                efficacy: n(getCellValue(ws, 'T' + row)), efficiency: n(getCellValue(ws, 'U' + row)),
            });
        }

        // Team reception/defense totals: row 43
        const teamReception = {
            kill: n(getCellValue(ws, 'C43')), pos: n(getCellValue(ws, 'D43')),
            exc: n(getCellValue(ws, 'E43')), neg: n(getCellValue(ws, 'F43')),
            err: n(getCellValue(ws, 'G43')), tot: n(getCellValue(ws, 'H43')),
            efficacy: n(getCellValue(ws, 'J43')), efficiency: n(getCellValue(ws, 'K43')),
        };
        const teamDefense = {
            kill: n(getCellValue(ws, 'M43')), pos: n(getCellValue(ws, 'N43')),
            exc: n(getCellValue(ws, 'O43')), neg: n(getCellValue(ws, 'P43')),
            err: n(getCellValue(ws, 'Q43')), tot: n(getCellValue(ws, 'R43')),
            efficacy: n(getCellValue(ws, 'T43')), efficiency: n(getCellValue(ws, 'U43')),
        };

        // Opponent reception/defense: row 47
        const oppReception = {
            pos: n(getCellValue(ws, 'D47')), exc: n(getCellValue(ws, 'E47')),
            neg: n(getCellValue(ws, 'F47')), err: n(getCellValue(ws, 'G47')),
            tot: n(getCellValue(ws, 'H47')),
            efficacy: n(getCellValue(ws, 'J47')), efficiency: n(getCellValue(ws, 'K47')),
        };
        const oppDefense = {
            pos: n(getCellValue(ws, 'N47')), exc: n(getCellValue(ws, 'O47')),
            neg: n(getCellValue(ws, 'P47')), err: n(getCellValue(ws, 'Q47')),
            tot: n(getCellValue(ws, 'R47')),
            efficacy: n(getCellValue(ws, 'T47')), efficiency: n(getCellValue(ws, 'U47')),
        };

        // Points summary
        const totalPointsMade = n(getCellValue(ws, 'AH28')) || 0;
        const totalErrors = n(getCellValue(ws, 'AJ28')) || 0;

        // Rotation analysis: rows 51-56
        const rotations = [];
        for (let row = 51; row <= 56; row++) {
            const rotNum = n(getCellValue(ws, 'AG' + row));
            const lineup = getCellValue(ws, 'AH' + row) || '';
            const totPts = getCellValue(ws, 'AD' + row);
            const ptsMade = getCellValue(ws, 'AE' + row);
            const ptsLost = getCellValue(ws, 'AF' + row);

            if (rotNum) {
                rotations.push({
                    rotation: rotNum,
                    lineup: String(lineup).trim(),
                    totalPoints: parsePointString(totPts),
                    pointsMade: parsePointString(ptsMade),
                    pointsLost: parsePointString(ptsLost),
                });
            }
        }

        return {
            playerStats,
            playerReception,
            playerDefense,
            team: { attack: teamAttack, serve: teamServe, block: teamBlock, reception: teamReception, defense: teamDefense },
            opponent: { attack: oppAttack, serve: oppServe, reception: oppReception, defense: oppDefense },
            rotations,
            totalPointsMade,
            totalErrors,
        };
    }

    // ─── Gioco (game analysis) parser ─────────────────────────────────────────

    function parseGioco(wb) {
        const ws = wb.Sheets['Gioco'];
        if (!ws) return null;

        const fundOrder = ['attack', 'serve', 'reception', 'defense'];
        const colPairs = [[5, 6], [9, 10], [13, 14], [17, 18]];

        // Overview: rows 3-4
        const overview = {};
        for (let i = 0; i < 4; i++) {
            const posStr = getCellValue(ws, cellRef(colPairs[i][0], 3));
            const negStr = getCellValue(ws, cellRef(colPairs[i][0], 4));
            overview[fundOrder[i]] = {
                posRatio: parseRatioString(posStr),
                negRatio: parseRatioString(negStr),
                posPct: n(getCellValue(ws, cellRef(colPairs[i][1], 3))),
                negPct: n(getCellValue(ws, cellRef(colPairs[i][1], 4))),
            };
        }

        // Rotation stats: rows 5-16
        const rotationStats = [];
        for (let r = 0; r < 6; r++) {
            const posRow = 5 + r * 2;
            const negRow = 6 + r * 2;
            const rotNum = n(getCellValue(ws, 'B' + posRow));
            const rot = { rotation: rotNum, fundamentals: {} };
            for (let i = 0; i < 4; i++) {
                const posStr = getCellValue(ws, cellRef(colPairs[i][0], posRow));
                const negStr = getCellValue(ws, cellRef(colPairs[i][0], negRow));
                rot.fundamentals[fundOrder[i]] = {
                    posRatio: parseRatioString(posStr),
                    negRatio: parseRatioString(negStr),
                    posPct: n(getCellValue(ws, cellRef(colPairs[i][1], posRow))),
                    negPct: n(getCellValue(ws, cellRef(colPairs[i][1], negRow))),
                };
            }
            rotationStats.push(rot);
        }

        // Attack from reception distribution: rows 45-51
        const parseAttackDistribution = (ws, labelCol, attCol, ptCol, rowRange) => {
            const data = [];
            for (let row = rowRange[0] + 1; row <= rowRange[1]; row++) {
                const role = getCellValue(ws, cellRef(labelCol, row));
                const attacks = getCellValue(ws, cellRef(attCol, row));
                const points = getCellValue(ws, cellRef(ptCol, row));
                if (role && String(role).includes(':')) {
                    data.push({
                        role: String(role).split(':')[0].trim(),
                        attacks: n(attacks),
                        pointsStr: String(points || ''),
                    });
                }
            }
            return data;
        };

        const attackFromReception = {
            R5: parseAttackDistribution(ws, 2, 3, 4, [45, 50]),
            R4: parseAttackDistribution(ws, 5, 6, 7, [45, 50]),
            R3: parseAttackDistribution(ws, 8, 9, 10, [45, 50]),
        };

        const attackFromDefense = {
            D5: parseAttackDistribution(ws, 2, 3, 4, [54, 60]),
            D4: parseAttackDistribution(ws, 5, 6, 7, [54, 60]),
            D3: parseAttackDistribution(ws, 8, 9, 10, [54, 60]),
        };

        // Reception by rotation: rows 45-50, cols T-Z
        const receptionByRotation = [];
        for (let row = 45; row <= 50; row++) {
            const rotLabel = getCellValue(ws, 'T' + row);
            if (rotLabel && String(rotLabel).startsWith('P')) {
                receptionByRotation.push({
                    rotation: String(rotLabel),
                    R5: n(getCellValue(ws, 'U' + row)),
                    R4: n(getCellValue(ws, 'V' + row)),
                    R3: n(getCellValue(ws, 'W' + row)),
                    R2: n(getCellValue(ws, 'X' + row)),
                    R1: n(getCellValue(ws, 'Y' + row)),
                    total: n(getCellValue(ws, 'Z' + row)),
                });
            }
        }

        return { overview, rotationStats, attackFromReception, attackFromDefense, receptionByRotation };
    }

    // ─── Giri di Rice (rotation matchups) parser ──────────────────────────────

    function parseGiriDiRice(wb) {
        const ws = wb.Sheets['Giri di Rice'];
        if (!ws) return null;

        // Serve rotations: rows 4-9
        const serveRotations = [];
        for (let row = 4; row <= 9; row++) {
            const label = getCellValue(ws, 'G' + row);
            if (!label || !String(label).startsWith('SP')) continue;
            const rotNum = parseInt(String(label).replace('SP', ''));
            const oppLabel = getCellValue(ws, 'I' + row);
            const oppRot = oppLabel ? parseInt(String(oppLabel).replace('RP', '')) : null;
            serveRotations.push({
                rotation: rotNum,
                breakPts: n(getCellValue(ws, 'B' + row)),
                attackPts: n(getCellValue(ws, 'C' + row)),
                blockPts: n(getCellValue(ws, 'D' + row)),
                errors: n(getCellValue(ws, 'E' + row)),
                total: n(getCellValue(ws, 'F' + row)),
                oppReceiveRotation: (oppRot >= 1 && oppRot <= 6) ? oppRot : null,
            });
        }

        // Receive rotations: rows 13-18
        const receiveRotations = [];
        for (let row = 13; row <= 18; row++) {
            const label = getCellValue(ws, 'G' + row);
            if (!label || !String(label).startsWith('RP')) continue;
            const rotNum = parseInt(String(label).replace('RP', ''));
            const oppLabel = getCellValue(ws, 'I' + row);
            const oppRot = oppLabel ? parseInt(String(oppLabel).replace('SP', '')) : null;
            receiveRotations.push({
                rotation: rotNum,
                attackPts: n(getCellValue(ws, 'B' + row)),
                blockPts: n(getCellValue(ws, 'C' + row)),
                oppServeErrors: n(getCellValue(ws, 'D' + row)),
                oppGiftPts: n(getCellValue(ws, 'E' + row)),
                total: n(getCellValue(ws, 'F' + row)),
                oppServeRotation: (oppRot >= 1 && oppRot <= 6) ? oppRot : null,
            });
        }

        return { serveRotations, receiveRotations };
    }

    // ─── Rally sequences parser ───────────────────────────────────────────────

    function parseQuartine(str) {
        if (!str) return [];
        const tokens = String(str).split(/\s+/).filter(function (t) { return t.length > 0; });
        const actions = [];
        for (const token of tokens) {
            if (token.toLowerCase() === 'avv') {
                actions.push({ type: 'opponent_error', player: null, fundamental: null, value: null, raw: token });
                continue;
            }
            const match = token.match(/^(\d{2})([abrdm])(\d)$/i);
            if (match) {
                actions.push({
                    type: 'action',
                    player: match[1],
                    fundamental: match[2].toLowerCase(),
                    value: parseInt(match[3]),
                    raw: token,
                });
            }
        }
        return actions;
    }

    function parseAllRallies(wb) {
        const allRallies = [];
        for (let s = 1; s <= 5; s++) {
            const sheetName = 'Set ' + s;
            const ws = wb.Sheets[sheetName];
            if (!ws) continue;

            const score = getCellValue(ws, 'C12');
            if (!score || Number(score) === 0) continue;

            for (let row = 18; row <= 600; row++) {
                const actionStr = getCellValue(ws, 'B' + row);
                if (!actionStr || String(actionStr).trim() === '' || String(actionStr) === '0') break;

                const strVal = String(actionStr).trim();
                if (strVal.length < 2) continue;

                const ourScore = n(getCellValue(ws, 'C' + row));
                const theirScore = n(getCellValue(ws, 'E' + row));
                const pointDesc = getCellValue(ws, 'G' + row) || '';
                const errorDesc = getCellValue(ws, 'H' + row) || '';
                const rotation = n(getCellValue(ws, 'O' + row));
                const phase = getCellValue(ws, 'N' + row) || '';
                const server = getCellValue(ws, 'R' + row) || '';
                const receptionLine = getCellValue(ws, 'S' + row) || '';
                const attackLine = getCellValue(ws, 'V' + row) || '';
                const riceVal = getCellValue(ws, 'W' + row) || '';
                const attackRole = getCellValue(ws, 'AC' + row) || '';
                const distr1P = getCellValue(ws, 'Y' + row) || '';
                const ptRot = n(getCellValue(ws, 'T' + row));
                const erRot = n(getCellValue(ws, 'U' + row));

                const quartine = parseQuartine(strVal);

                allRallies.push({
                    set: s,
                    row: row,
                    actionString: strVal,
                    quartine: quartine,
                    ourScore: ourScore,
                    theirScore: theirScore,
                    pointDesc: String(pointDesc).trim(),
                    errorDesc: String(errorDesc).trim(),
                    isPoint: ptRot === 1,
                    isError: erRot === 1,
                    rotation: rotation,
                    phase: phase,
                    server: String(server).trim(),
                    receptionLine: String(receptionLine).trim(),
                    attackLine: String(attackLine).trim(),
                    riceVal: String(riceVal).trim(),
                    attackRole: String(attackRole).trim(),
                    distr1P: String(distr1P).trim(),
                });
            }
        }
        return allRallies;
    }

    // ─── Outcome detector from raw quartine ──────────────────────────────────

    /**
     * Determina l'esito di un rally dall'array delle azioni (quartine).
     *
     * Standard DataVolley:
     *   Valore 5 (kill / ace / muro vincente)  → home_point (punto nostro)
     *   Token 'avv' (opponent_error)            → home_point (regalo avversario)
     *   Valore 1 (errore)                       → away_point (punto avversario)
     *   Altro                                   → 'continue' (raro nei dati archiviati)
     *
     * @param {Array} quartine - Output di parseQuartine()
     * @returns {'home_point'|'away_point'|'continue'}
     */
    function determineOutcomeFromQuartine(quartine) {
        if (!quartine || !quartine.length) return 'continue';
        const last = quartine[quartine.length - 1];
        if (last.type === 'opponent_error') return 'home_point';
        if (last.value === 5) return 'home_point';
        if (last.value === 1) return 'away_point';
        return 'continue';
    }

    // ─── ActionsBySet builder from raw Set sheets ─────────────────────────────

    /**
     * Costruisce actionsBySet nel formato atteso da live-stats-computer.js
     * a partire ESCLUSIVAMENTE dalle stringhe grezze in colonna B dei sheet Set 1-6.
     *
     * Questo permette di calcolare riepilogo/gioco/giriDiRice/rallies anche per
     * file .xlsx che non contengono i sheet formula (Riepilogo, Gioco, Giri di Rice)
     * né le colonne formula (O=rotazione, N=fase, T=isPoint, U=isError, ecc.).
     *
     * Calcola automaticamente:
     *   • outcome (home_point/away_point) dall'ultima azione del rally
     *   • rotation (1-6) tracciando i side-out a partire da A7 (rotazione iniziale)
     *   • phase ('b'=battuta  /  'r'=ricezione) dal primo fondamentale del rally
     *   • ourScore / theirScore con conteggio progressivo
     *
     * @param {object} wb - SheetJS workbook
     * @returns {object}  { [setNum]: Array<entry> }  compatibile con computeRiepilogo & co.
     */
    function buildActionsBySet(wb) {
        const actionsBySet = {};

        for (let s = 1; s <= 6; s++) {
            const ws = wb.Sheets['Set ' + s];
            if (!ws) continue;

            // Il set è stato giocato solo se il punteggio finale è > 0
            const finalScore = getCellValue(ws, 'C12');
            if (!finalScore || Number(finalScore) === 0) continue;

            // Rotazione iniziale nostra (A7) — limitata a 1-6
            const ourStartRot = Math.max(1, Math.min(6, n(getCellValue(ws, 'A7')) || 1));
            let ourRot    = ourStartRot;
            let ourScore  = 0;
            let theirScore = 0;
            let phase     = null;   // 'b' | 'r', determinato al primo rally

            const entries = [];

            for (let row = 18; row <= 600; row++) {
                const rawCell = getCellValue(ws, 'B' + row);
                if (!rawCell || String(rawCell).trim() === '' || String(rawCell) === '0') break;

                const strVal = String(rawCell).trim();
                if (strVal.length < 2) continue;

                const quartine = parseQuartine(strVal);
                if (!quartine.length) continue;

                // ── Fase: determinata dal primo fondamentale del rally ─────────
                // Al primo rally del set viene fissata guardando la prima azione.
                // Nei rally successivi la fase è già stata aggiornata alla fine
                // del rally precedente (inversione alla conquista/perdita servizio).
                if (phase === null) {
                    phase = 'r'; // default: ricezione
                    for (let i = 0; i < quartine.length; i++) {
                        const f = quartine[i].fundamental;
                        if (f === 'b') { phase = 'b'; break; }
                        if (f === 'r') { phase = 'r'; break; }
                    }
                }

                // ── Esito del rally ───────────────────────────────────────────
                const outcome = determineOutcomeFromQuartine(quartine);

                // ── Azioni nel formato live-stats-computer ────────────────────
                const actions = quartine
                    .filter(function (q) { return q.type === 'action'; })
                    .map(function (q) {
                        return { player: q.player, fundamental: q.fundamental, evaluation: q.value };
                    });

                entries.push({
                    result: { actions: actions, result: outcome },
                    rotation:     ourRot,
                    phase:        phase,
                    ourScore:     ourScore,
                    theirScore:   theirScore,
                    actionString: strVal,
                });

                // ── Aggiorna punteggio ────────────────────────────────────────
                if (outcome === 'home_point')   ourScore++;
                else if (outcome === 'away_point') theirScore++;

                // ── Aggiorna rotazione e fase per il prossimo rally ───────────
                // Regola DataVolley:
                //   side-out (ricezione + vittoria) → rotazione avanza di 1
                //   cambio servizio (battuta + sconfitta) → fase → ricezione, no rotazione
                if (outcome === 'home_point') {
                    if (phase === 'r') {
                        // Side-out: conquistiamo il servizio → ruotiamo in avanti
                        ourRot = (ourRot % 6) + 1;
                    }
                    phase = 'b'; // dopo aver segnato, serviamo
                } else if (outcome === 'away_point') {
                    if (phase === 'b') {
                        // Perdiamo il servizio → passiamo in ricezione
                        phase = 'r';
                    }
                    // Se eravamo in ricezione e perdiamo: restiamo in ricezione, nessuna rotazione
                }
                // 'continue': fase e rotazione invariate
            }

            if (entries.length > 0) {
                actionsBySet[s] = entries;
            }
        }

        return actionsBySet;
    }

    // ─── ID generation ────────────────────────────────────────────────────────

    function generateMVTAMatchId(metadata, fileName) {
        // Deterministic ID based on file name for idempotent re-import
        const safeName = String(fileName || '')
            .replace(/\.(xlsm|xlsx|xls)$/i, '')
            .replace(/[^a-zA-Z0-9_\-]/g, '_')
            .slice(0, 60);
        if (safeName) return 'mvs_' + safeName;
        // Fallback: use date + opponent
        const date = String(metadata.date || '').replace(/[^0-9]/g, '');
        const opp = String(metadata.opponent || '').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
        return 'mvs_' + (date || 'nodate') + '_' + (opp || 'noopp');
    }

    // ─── Main entry point ─────────────────────────────────────────────────────

    /**
     * Parses a SheetJS workbook object into a full MVTA-compatible match structure.
     * @param {object} wb       - SheetJS workbook (already read with XLSX.read())
     * @param {string} fileName - Original file name (used for match ID)
     * @returns {object}        - Full MVTA-compatible match object
     */
    function parseXlsmFull(wb, fileName) {
        try {
            const metadata   = parseMetadata(wb);
            const roster     = parseRoster(wb);
            const sets       = parseSets(wb);
            let riepilogo    = parseRiepilogo(wb);
            let gioco        = parseGioco(wb);
            let giriDiRice   = parseGiriDiRice(wb);
            let rallies      = parseAllRallies(wb);

            // ── Fallback: calcola statistiche dalle stringhe grezze ───────────
            // Per i file .xlsx che non contengono i sheet formula (Riepilogo,
            // Gioco, Giri di Rice) né le colonne formula nei sheet Set (rotation,
            // isPoint, isError), calcoliamo tutto dalle azioni in colonna B.
            //
            // Usa window.liveStatsComputer (live-stats-computer.js) che implementa
            // le stesse formule DataVolley in JavaScript.  Entrambi gli script sono
            // caricati nella stessa pagina, quindi liveStatsComputer è disponibile
            // al momento dell'esecuzione (anche se caricato dopo questo file).
            const needsStatsCompute = !riepilogo || !gioco || !giriDiRice;
            const needsRallyFix     = !needsStatsCompute && rallies.length > 0 &&
                                      rallies.every(function (r) {
                                          return !r.isPoint && !r.isError && r.rotation === 0;
                                      });

            if (needsStatsCompute || needsRallyFix) {
                try {
                    const actionsBySet = buildActionsBySet(wb);
                    const hasEntries   = Object.keys(actionsBySet).some(function (k) {
                        return actionsBySet[k] && actionsBySet[k].length > 0;
                    });

                    if (hasEntries) {
                        const lsc = (typeof window !== 'undefined') && window.liveStatsComputer;

                        if (lsc && typeof lsc.computeStatsFromLiveScout === 'function') {
                            const computed = lsc.computeStatsFromLiveScout({
                                actionsBySet: actionsBySet,
                                roster:       roster,
                            });

                            if (needsStatsCompute) {
                                if (!riepilogo  && computed.riepilogo)   riepilogo  = computed.riepilogo;
                                if (!gioco      && computed.gioco)        gioco      = computed.gioco;
                                if (!giriDiRice && computed.giriDiRice)   giriDiRice = computed.giriDiRice;
                            }

                            // I rally calcolati hanno isPoint/isError/rotation/phase
                            // corretti anche per file .xlsx senza colonne formula.
                            if (computed.rallies && computed.rallies.length > 0) {
                                rallies = computed.rallies;
                            }

                            console.log('[xlsm-full-parser] Statistiche calcolate da dati grezzi:',
                                'riepilogo:', !!computed.riepilogo,
                                'gioco:', !!computed.gioco,
                                'giriDiRice:', !!computed.giriDiRice,
                                'rallies:', computed.rallies ? computed.rallies.length : 0
                            );
                        } else {
                            console.warn('[xlsm-full-parser] window.liveStatsComputer non disponibile — ' +
                                'statistiche non calcolabili per questo file .xlsx. ' +
                                'Verifica che live-stats-computer.js sia caricato.');
                        }
                    } else {
                        console.warn('[xlsm-full-parser] Nessuna azione trovata nei sheet Set — ' +
                            'il file potrebbe essere vuoto o in un formato non supportato.');
                    }
                } catch (_computeErr) {
                    console.warn('[xlsm-full-parser] Errore nel calcolo statistiche da dati grezzi:',
                        _computeErr);
                }
            }

            const id = generateMVTAMatchId(metadata, fileName);

            return {
                id:          id,
                fileName:    String(fileName || ''),
                _source:     'my_volley_scout',
                metadata:    metadata,
                roster:      roster,
                sets:        sets,
                riepilogo:   riepilogo,
                gioco:       gioco,
                giriDiRice:  giriDiRice,
                rallies:     rallies,
            };
        } catch (e) {
            console.error('[xlsm-full-parser] Errore parsing:', e);
            return null;
        }
    }

    // Expose globally
    global.parseXlsmFull = parseXlsmFull;

})(typeof window !== 'undefined' ? window : this);
