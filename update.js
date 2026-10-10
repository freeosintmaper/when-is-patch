const https = require('https');
const fs = require('fs');

const PATCHES_URL = 'https://www.dota2.com/datafeed/patchnoteslist?language=english';

// Прямые ссылки на JSON-файлы с версиями веток
const BRANCHES = [
  {
    name: 'Public',
    url: 'https://raw.githubusercontent.com/muk-as/DOTA2_WEB/master/steam_api/versions/570%20-%20Dota%202.json'
  },
  {
    name: 'Staging',
    url: 'https://raw.githubusercontent.com/muk-as/DOTA2_WEB/master/steam_api/versions/2305270%20-%20Dota%202%20Staging.json'
  },
  {
    name: 'Experimental',
    url: 'https://raw.githubusercontent.com/muk-as/DOTA2_WEB/master/steam_api/versions/247040%20-%20Dota%202%20Experimental.json'
  }
];

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Dota2-Patch-Bot)' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function hoursAgo(iso) { return (Date.now() - new Date(iso).getTime()) / 3600000; }

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Получаем версию из JSON-файла muk-as
async function getBranchVersion(url) {
  try {
    const raw = await get(url);
    const json = JSON.parse(raw);
    const v = json?.result?.active_version;
    return v ? String(v) : null;
  } catch (e) {
    console.error(`⚠️  ${url}: ${e.message}`);
    return null;
  }
}

(async () => {
  try {
    let history = [];
    try { history = JSON.parse(fs.readFileSync('history.json', 'utf8')); } catch (e) {}

    const now = new Date().toISOString();
    const versions = {};

    // 1. Версии из muk-as/DOTA2_WEB
    for (const b of BRANCHES) {
      const v = await getBranchVersion(b.url);
      if (v) {
        versions[b.name] = v;
        const last = [...history].reverse().find(h => h.branch === b.name);
        if (!last || last.version !== v) {
          history.push({ branch: b.name, version: v, timestamp: now });
          console.log(`📝 ${b.name}: ${last ? last.version + ' → ' : ''}${v}`);
        } else {
          console.log(`   ${b.name}: ${v} (без изменений)`);
        }
      } else {
        console.log(`❌ ${b.name}: не получено`);
      }
    }

    // 2. Патчи
    const patchData = JSON.parse(await get(PATCHES_URL));
    const patches = patchData.patches || [];
    const sorted = [...patches].sort((a, b) => a.patch_timestamp - b.patch_timestamp);
    const latest = sorted[sorted.length - 1];
    const latestDate = new Date(latest.patch_timestamp * 1000);
    const daysSince = Math.floor((Date.now() - latestDate.getTime()) / 86400000);

    const sinceIdx = sorted.findIndex(p => p.patch_number === '7.33');
    const win = sinceIdx >= 0 ? sorted.slice(sinceIdx) : sorted;
    const intervals = [];
    for (let i = 1; i < win.length; i++) {
      const d = (win[i].patch_timestamp - win[i - 1].patch_timestamp) / 86400;
      if (d > 3 && d < 200) intervals.push(d);
    }
    const medianPause = intervals.length ? Math.round(median(intervals)) : 27;

    // 3. Сигналы
    const signals = [];

    const st = history.filter(h => h.branch === 'Staging');
    if (st.length) {
      const lastChange = st[st.length - 1].timestamp;
      const hAgo = hoursAgo(lastChange);
      const c24 = st.filter(h => hoursAgo(h.timestamp) <= 24).length;
      const c7  = st.filter(h => hoursAgo(h.timestamp) <= 168).length;

      let status = 'calm', note;
      if (st.length < 2) {
        note = 'История только собирается — нужно пару дней наблюдений';
      } else if (hAgo <= 24 && c24 >= 3) {
        status = 'wait'; note = `${c24} смены за сутки — сильный сигнал`;
      } else if (hAgo <= 24) {
        status = 'wait'; note = `Менялся ${hAgo < 1 ? 'меньше часа' : Math.round(hAgo) + ' ч.'} назад — так бывает перед патчами`;
      } else if (c7 >= 4) {
        status = 'wait'; note = `${c7} смен за неделю — оживление`;
      } else if (c7 >= 1) {
        note = `${c7} смен за неделю — в пределах обычного`;
      } else {
        note = `Молчит ${Math.round(hAgo / 24)} дн.`;
      }

      signals.push({ key: 'staging', label: 'Staging',
        value: versions.Staging ? 'v' + versions.Staging : '—', note, status });
    }

    signals.push({
      key: 'pause', label: 'Пауза после патча',
      value: daysSince + ' дн.',
      note: daysSince > medianPause
        ? `Дольше обычных ${medianPause} дн.`
        : `Обычно ${medianPause} дн. — в норме`,
      status: daysSince > medianPause ? 'wait' : 'calm'
    });

    const ex = history.filter(h => h.branch === 'Experimental');
    const ex7 = ex.filter(h => hoursAgo(h.timestamp) <= 168).length;
    signals.push({
      key: 'experimental', label: 'Experimental',
      value: versions.Experimental ? 'v' + versions.Experimental : '—',
      note: ex.length < 2 ? 'Фоновая ветка — со сроками патча не связана'
        : `${ex7} смен за 7 дн. — обычный фон`,
      status: 'calm'
    });

    const waitCount = signals.filter(s => s.status === 'wait').length;

    const output = {
      currentVersion: latest.patch_number,
      currentDate: latestDate.toISOString().split('T')[0],
      daysSince, medianPause, versions,
      signals, waitingSignals: waitCount,
      historySize: history.length,
      updatedAt: now
    };

    if (history.length > 5000) history = history.slice(-5000);

    fs.writeFileSync('history.json', JSON.stringify(history, null, 2));
    fs.writeFileSync('data.json', JSON.stringify(output, null, 2));
    console.log('✅ data.json:');
    console.log(JSON.stringify(output, null, 2));
  } catch (e) {
    console.error('❌', e.message);
    process.exit(1);
  }
})();
