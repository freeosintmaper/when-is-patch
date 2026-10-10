const https = require('https');
const fs = require('fs');

const PATCHES_URL = 'https://www.dota2.com/datafeed/patchnoteslist?language=english';
// Публичная веб-версия канала — доступна без авторизации
const TELEGRAM_URL = 'https://t.me/s/DOTA_DM_SPAM';

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

/**
 * Вытаскивает из HTML-страницы Telegram последние сообщения
 * и находит в них строки вида "[v] 2305270 - Dota 2 Staging 3330 => 3332"
 */
function parseTelegramVersions(html) {
  const result = {};
  // Ищем блоки сообщений
  const msgRegex = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  let m;
  while ((m = msgRegex.exec(html)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    // Public (570)
    let pub = text.match(/\[v\]\s*570\s*-\s*Dota 2\s+(\d+)\s*=>\s*(\d+)/i);
    if (pub) result.Public = pub[2];
    // Staging (2305270)
    let st = text.match(/\[v\]\s*2305270\s*-\s*Dota 2 Staging\s+(\d+)\s*=>\s*(\d+)/i);
    if (st) result.Staging = st[2];
    // Experimental (247040)
    let ex = text.match(/\[v\]\s*247040\s*-\s*Dota 2 Experimental\s+(\d+)\s*=>\s*(\d+)/i);
    if (ex) result.Experimental = ex[2];
  }
  return result;
}

(async () => {
  try {
    let history = [];
    try { history = JSON.parse(fs.readFileSync('history.json', 'utf8')); } catch (e) {}

    const now = new Date().toISOString();
    const versions = {};

    // 1. Версии из Telegram
    const tgHtml = await get(TELEGRAM_URL);
    const tgVersions = parseTelegramVersions(tgHtml);
    console.log('📡 Telegram:', tgVersions);

    for (const branch of ['Public', 'Staging', 'Experimental']) {
      const v = tgVersions[branch];
      if (v) {
        versions[branch] = v;
        const last = [...history].reverse().find(h => h.branch === branch);
        if (!last || last.version !== v) {
          history.push({ branch, version: v, timestamp: now });
          console.log(`📝 ${branch}: ${last ? last.version + ' → ' : ''}${v}`);
        } else {
          console.log(`   ${branch}: ${v} (без изменений)`);
        }
      } else {
        console.log(`⚠️  ${branch}: не найдено в последних сообщениях`);
      }
    }

    // 2. Патчи (официальный список)
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
