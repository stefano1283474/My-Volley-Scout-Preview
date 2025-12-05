const XLSX = require('xlsx');

function ensureTwoDigits(v){
  const digits = String(v||'').replace(/\D/g,'');
  if (!digits) return '';
  return digits.padStart(2,'0').slice(-2);
}
function normalizeRoleImport(raw){
  const s = String(raw||'').trim().toUpperCase();
  if (!s) return '';
  if (/^P(\w)?$/.test(s) || /PAL/.test(s) || /PALLEGG/.test(s)) return 'P';
  if (/^O(\w)?$/.test(s) || /OPP/.test(s) || /OPPOSTO/.test(s)) return 'O';
  if (/^C(\w)?$/.test(s) || /CENTR/.test(s) || /CTR/.test(s) || /MB/.test(s)) return 'C';
  if (/^S(\w)?$/.test(s) || /SCH/.test(s) || /SCHIAC/.test(s) || /BANDA/.test(s)) return 'S';
  if (/^L(\w)?$/.test(s) || /LIB/.test(s) || /LIBERO/.test(s)) return 'L';
  return s.slice(0,1);
}

function pickElGiocSheet(wb){
  let ws = wb.Sheets['El. Gioc.'] || null;
  if (!ws){
    const alt = (wb.SheetNames||[]).find(n => /gioc/i.test(String(n||'')));
    if (alt) ws = wb.Sheets[alt] || null;
  }
  return ws;
}

function readRoster(ws){
  const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : { s:{r:0,c:0}, e:{r:220,c:10} };
  const roster = [];
  for (let r = 3; r <= (range.e.r + 1); r++){
    const b = ws['B'+r];
    const rawB = b && (b.v != null ? String(b.v).trim() : (b.w ? String(b.w).trim() : ''));
    if (!rawB) break;
    const c = ws['C'+r], d = ws['D'+r], e = ws['E'+r], f = ws['F'+r];
    let number = rawB;
    if (number.startsWith("'")) number = number.slice(1);
    number = ensureTwoDigits(number);
    const surname = c && c.v != null ? String(c.v).trim() : '';
    const name = d && d.v != null ? String(d.v).trim() : '';
    const nick = e && e.v != null ? String(e.v).trim() : '';
    const role = normalizeRoleImport(f && f.v != null ? String(f.v).trim() : '');
    if (!number && !surname && !name && !nick && !role) continue;
    roster.push({ number, surname, name, nickname: nick, role });
  }
  return roster;
}

function readMeta(ws){
  const opponent = ws['D20'] && (ws['D20'].v != null ? String(ws['D20'].v).trim() : (ws['D20'].w ? String(ws['D20'].w).trim() : ''));
  let matchDate = ws['D21'] && (ws['D21'].v != null ? ws['D21'].v : (ws['D21'].w ? ws['D21'].w : ''));
  try {
    if (typeof matchDate === 'number'){
      const dt = XLSX.SSF.parse_date_code(matchDate);
      if (dt && dt.y && dt.m && dt.d) matchDate = new Date(dt.y, dt.m-1, dt.d).toISOString().slice(0,10);
    }
  } catch(_){}
  const eventType = ws['D22'] && (ws['D22'].v != null ? String(ws['D22'].v).trim() : (ws['D22'].w ? String(ws['D22'].w).trim() : ''));
  const locLabel = ws['D23'] && (ws['D23'].v != null ? String(ws['D23'].v).trim() : (ws['D23'].w ? String(ws['D23'].w).trim() : '')).toLowerCase();
  const notes = ws['D24'] && (ws['D24'].v != null ? String(ws['D24'].v).trim() : (ws['D24'].w ? String(ws['D24'].w).trim() : ''));
  const finalResult = ws['D25'] && (ws['D25'].v != null ? String(ws['D25'].v).trim() : (ws['D25'].w ? String(ws['D25'].w).trim() : ''));
  const matchOutcome = ws['D26'] && (ws['D26'].v != null ? String(ws['D26'].v).trim() : (ws['D26'].w ? String(ws['D26'].w).trim() : ''));
  return { opponent, matchDate: String(matchDate||''), eventType, homeAway: (locLabel==='casa'?'home':(locLabel==='trasferta'?'away':'')), location: locLabel, description: notes, finalResult, matchOutcome };
}

function readSetSheet(wb, setNum){
  const name = (wb.SheetNames||[]).includes('Set '+setNum) ? ('Set '+setNum) : (wb.SheetNames||[]).find(n => new RegExp('^set\\s*'+setNum+'$','i').test(String(n||'')));
  if (!name) return null;
  const ws = wb.Sheets[name];
  const oppRot = ws['A6'] && (ws['A6'].v != null ? String(ws['A6'].v).trim() : (ws['A6'].w ? String(ws['A6'].w).trim() : ''));
  const ourRot = ws['A7'] && (ws['A7'].v != null ? String(ws['A7'].v).trim() : (ws['A7'].w ? String(ws['A7'].w).trim() : ''));
  const home = ws['C12'] && ((ws['C12'].v != null && ws['C12'].v !== '') ? Number(ws['C12'].v) : (ws['C12'].w ? Number(String(ws['C12'].w).replace(/\s/g,'')) : 0));
  const away = ws['E12'] && ((ws['E12'].v != null && ws['E12'].v !== '') ? Number(ws['E12'].v) : (ws['E12'].w ? Number(String(ws['E12'].w).replace(/\s/g,'')) : 0));
  const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : { s:{r:0,c:0}, e:{r:220,c:10} };
  let actions = 0;
  for (let r = 18; r <= (range.e.r + 1); r++){
    const val = ws['B'+r] ? ((ws['B'+r].v != null ? String(ws['B'+r].v).trim() : (ws['B'+r].w ? String(ws['B'+r].w).trim() : ''))) : '';
    if (!val) break;
    actions++;
  }
  let esito = '';
  if (home || away){ esito = home>away ? 'Vinto' : (away>home ? 'Perso' : ''); }
  return { setNum, opponentRotation: oppRot, ourRotation: ourRot, home, away, actions, outcome: esito };
}

function main(){
  const fp = process.argv[2];
  if (!fp){
    console.error('Usage: node scripts/read-xlsm-summary.js <path-to-xlsm/xlsx/xls>');
    process.exit(2);
  }
  const wb = XLSX.readFile(fp, { cellDates: true, raw: true, sheetRows: 220 });
  const el = pickElGiocSheet(wb);
  const summary = { meta: {}, roster: [], sets: [] };
  if (el){
    summary.roster = readRoster(el);
    summary.meta = readMeta(el);
  }
  for (let i=1;i<=6;i++){
    const st = readSetSheet(wb, i);
    if (st) summary.sets.push(st);
  }
  console.log(JSON.stringify(summary, null, 2));
}

main();
