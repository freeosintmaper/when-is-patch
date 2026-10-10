const https = require('https');
const fs = require('fs');

const STEAM_API = 'https://api.steampowered.com/ISteamApps/UpToDateCheck/v1/';
const PATCHES_URL = 'https://www.dota2.com/datafeed/patchnoteslist?language=english';

const BRANCHES = [
  { name: 'Public',       appid: 570 },
  { name: 'Staging',      appid: 2305270 },
  { name: 'Experimental', appid: 247040 }
];

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Dota2-Patch-Bot)' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Bad JSON from ' + url)); }
      });
    }).on('error', reject);
  });
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function hoursAgo(iso) {
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

(async () => {
  try {
    // 1. История
    let history = [];
    try { history = JSON.parse(fs.readFileSync('history.json', 'utf8')); } catch (e) {}

    const now = new Date().toISOString();
    const versions = {};
    const changes = { Public: [], Staging: [], Experimental: [] };

    // 2. Текущие версии веток
    for (const b of BRANCHES) {
      try {
        const data = await get(`${STEAM_API}?appid=${b.appid}&version=0`);
        const v = data && data.response && data.response.required_version;
        if (v) {
          versions[b.name] = v;
          const last = [...history].reverse().find(h => h.branch === b.name);
          if (!last || last.version !== v) {
            history.push({ branch: b.name, version: v, timestamp: now });
            console.log(`📝 ${b.name}: ${last ? last.version + ' → ' : ''}${v}`);
          } else {
            console.log(`  ${b.name}: ${v} (без изменений)`);
          }
        }
      } catch (e) {
        console.error(`⚠️  ${b.name}: ${e.message}`);
      }
    }

    // 3. Патчи
    const patchData = await get(PATCHES_URL);
    const patches = patchData.patches || [];
    const sorted = [...patches].sort((a, b) => a.patch_timestamp - b.patch_timestamp);
    const latest = sorted[sorted.length - 1];
    const latestDate = new Date(latest.patch_timestamp * 1000);
    const daysSince = Math.floor((Date.now() - latestDate.getTime()) / 86400000);

    // Медиана пауз с 7.33
    const sinceIdx = sorted.findIndex(p => p.patch_number === '7.33');
    const win = sinceIdx >= 0 ? sorted.slice(sinceIdx) : sorted;
    const intervals = [];
    for (let i = 1; i < win.length; i++) {
      const d = (win[i].patch_timestamp - win[i - 1].patch_timestamp) / 86400;
      if (d > 3 && d < 200) intervals.push(d);
    }
    const medianPause = intervals.length ? Math.round(median(intervals)) : 27;

    // 4. Собираем историю смен веток
    for (const b of BRANCHES) {
      changes[b.name] = history.filter(h => h.branch === b.name);
    }

    // 5. Сигналы
    const signals = [];

    // Staging
    const st = changes.Staging;
    if (st.length) {
      const lastChange = st[st.length - 1].timestamp;
      const hAgo = hoursAgo(lastChange);
      const c24 = st.filter(h => hoursAgo(h.timestamp) <= 24).length;
      const c7  = st.filter(h => hoursAgo(h.timestamp) <= 168).length;

      let status = 'calm';
      let note = `Последняя смена — ${hAgo < 1 ? '<1' : Math.round(hAgo)} ч. назад`;

      if (hAgo <= 24 && c24 >= 3) {
        status = 'wait';
        note = `${c24} смены за сутки — сильный сигнал`;
      } else if (hAgo <= 24) {
        status = 'wait';
        note = `Менялся ${hAgo < 1 ? 'меньше часа' : Math.round(hAgo) + ' ч.'} назад — как перед патчами`;
      } else if (c7 >= 4) {
        status = 'wait';
        note = `${c7} смен за неделю — оживление`;
      } else if (c7 >= 1) {
        note = `${c7} смен за неделю — в пределах обычного`;
      } else {
        note = `Молчит ${Math.round(hAgo / 24)} дн.`;
      }

      signals.push({
        key: 'staging',
        label: 'Staging',
        value: versions.Staging ? 'v' + versions.Staging : '—',
        note,
        status
      });
    }

    // Пауза
    const pauseWait = daysSince > medianPause;
    signals.push({
      key: 'pause',
      label: 'Пауза после патча',
      value: daysSince + ' дн.',
      note: pauseWait
        ? `Дольше обычных ${medianPause} дн.`
        : `Обычно ${medianPause} дн. — в норме`,
      status: pauseWait ? 'wait' : 'calm'
    });

    // Experimental — справочный, не сигнал
    const ex = changes.Experimental;
    const ex7 = ex.filter(h => hoursAgo(h.timestamp) <= 168).length;
    signals.push({
      key: 'experimental',
      label: 'Experimental',
      value: versions.Experimental ? 'v' + versions.Experimental : '—',
      note: `${ex7} смен за 7 дн. — обычный фон, со сроками не связан`,
      status: 'calm'
    });

    const waitCount = signals.filter(s => s.status === 'wait').length;

    const output = {
      currentVersion: latest.patch_number,
      currentDate: latestDate.toISOString().split('T')[0],
      daysSince,
      medianPause,
      versions: {
        Public: versions.Public,
        Staging: versions.Staging,
        Experimental: versions.Experimental
      },
      signals,
      waitingSignals: waitCount,
      historySize: history.length,
      updatedAt: now
    };

    if (history.length > 2000) history = history.slice(-2000);

    fs.writeFileSync('history.json', JSON.stringify(history, null, 2));
    fs.writeFileSync('data.json', JSON.stringify(output, null, 2));

    console.log('✅ data.json обновлён:');
    console.log(JSON.stringify(output, null, 2));
  } catch (e) {
    console.error('❌', e.message);
    process.exit(1);
  }
})();
