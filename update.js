'use strict';

const fs = require('fs');

const PATCHES_URL = 'https://www.dota2.com/datafeed/patchnoteslist?language=english';
const REQUEST_TIMEOUT_MS = 20000;
const MAX_HISTORY = 5000;

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

async function fetchJson(url, label) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'When-Is-Patch/2.0 (GitHub Actions)' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(label + ': HTTP ' + response.status);
  }

  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(label + ': источник вернул некорректный JSON (' + error.message + ')');
  }
}

function readHistory() {
  if (!fs.existsSync('history.json')) return [];

  let history;
  try {
    history = JSON.parse(fs.readFileSync('history.json', 'utf8'));
  } catch (error) {
    throw new Error('history.json повреждён; файл не будет перезаписан: ' + error.message);
  }

  if (!Array.isArray(history)) {
    throw new Error('history.json должен содержать массив; файл не будет перезаписан');
  }

  for (let i = 0; i < history.length; i++) {
    const item = history[i];
    const timestamp = item && Date.parse(item.timestamp);
    if (
      !item ||
      !BRANCHES.some(function (branch) { return branch.name === item.branch; }) ||
      (typeof item.version !== 'string' && typeof item.version !== 'number') ||
      String(item.version).trim() === '' ||
      !Number.isFinite(timestamp)
    ) {
      throw new Error('Некорректная запись #' + (i + 1) + ' в history.json; история сохранена без изменений');
    }
  }

  return history;
}

function median(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort(function (a, b) { return a - b; });
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function hoursAgo(timestamp, nowMs) {
  return (nowMs - Date.parse(timestamp)) / 3600000;
}

function writeJsonAtomically(path, value) {
  const temporaryPath = path + '.tmp';
  fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function publishJsonFiles(files) {
  const paths = Object.keys(files);
  const backups = new Set();
  const installed = new Set();

  try {
    paths.forEach(function (path) {
      writeJsonAtomically(path, files[path]);
    });

    paths.forEach(function (path) {
      const backupPath = path + '.bak';
      if (fs.existsSync(path)) {
        if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
        fs.renameSync(path, backupPath);
        backups.add(path);
      }
    });

    paths.forEach(function (path) {
      fs.renameSync(path + '.tmp', path);
      installed.add(path);
    });
  } catch (error) {
    paths.forEach(function (path) {
      try {
        if (installed.has(path) && fs.existsSync(path)) fs.unlinkSync(path);
        const backupPath = path + '.bak';
        if (backups.has(path) && fs.existsSync(backupPath)) {
          fs.renameSync(backupPath, path);
        }
      } catch (rollbackError) {
        console.error('Не удалось полностью откатить ' + path + ': ' + rollbackError.message);
      }
    });
    throw error;
  } finally {
    paths.forEach(function (path) {
      try { if (fs.existsSync(path + '.tmp')) fs.unlinkSync(path + '.tmp'); } catch (_) {}
    });
  }

  paths.forEach(function (path) {
    try { if (fs.existsSync(path + '.bak')) fs.unlinkSync(path + '.bak'); } catch (_) {}
  });
}

async function main() {
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  console.log('🔎 Получаем официальные патчи и версии веток…');

  // Все источники обязательны. При сбое хотя бы одного источника работа
  // завершится до записи файлов — предыдущий корректный снимок останется.
  const results = await Promise.all([
    fetchJson(PATCHES_URL, 'Официальный список патчей')
  ].concat(BRANCHES.map(function (branch) {
    return fetchJson(branch.url, branch.name);
  })));

  const patchData = results[0];
  if (!patchData || !Array.isArray(patchData.patches) || patchData.patches.length === 0) {
    throw new Error('Официальный API не вернул список патчей');
  }

  const versions = {};
  const history = readHistory();

  BRANCHES.forEach(function (branch, index) {
    const payload = results[index + 1];
    const activeVersion = payload && payload.result && payload.result.active_version;

    if (activeVersion === undefined || activeVersion === null || String(activeVersion).trim() === '') {
      throw new Error(branch.name + ': в ответе отсутствует active_version');
    }

    const version = String(activeVersion);
    versions[branch.name] = version;

    const previous = history.slice().reverse().find(function (entry) {
      return entry.branch === branch.name;
    });

    if (!previous || String(previous.version) !== version) {
      history.push({ branch: branch.name, version: version, timestamp: nowIso });
      console.log('📝 ' + branch.name + ': ' + (previous ? previous.version + ' → ' : '') + version);
    } else {
      console.log('✓ ' + branch.name + ': ' + version + ' (без изменений)');
    }
  });

  const patches = patchData.patches
    .map(function (patch) {
      return {
        patch_number: patch && patch.patch_number,
        patch_timestamp: Number(patch && patch.patch_timestamp)
      };
    })
    .filter(function (patch) {
      return patch.patch_number !== undefined &&
        patch.patch_number !== null &&
        String(patch.patch_number).trim() !== '' &&
        Number.isFinite(patch.patch_timestamp) &&
        patch.patch_timestamp > 0;
    })
    .sort(function (a, b) { return a.patch_timestamp - b.patch_timestamp; });

  if (!patches.length) {
    throw new Error('В официальном списке нет корректных дат патчей');
  }

  const latestPatch = patches[patches.length - 1];
  const latestDate = new Date(latestPatch.patch_timestamp * 1000);

  if (!Number.isFinite(latestDate.getTime()) || latestDate.getTime() > nowMs + 86400000) {
    throw new Error('Дата последнего официального патча выглядит некорректно');
  }

  const daysSince = Math.max(0, Math.floor((nowMs - latestDate.getTime()) / 86400000));
  const sinceIndex = patches.findIndex(function (patch) {
    return String(patch.patch_number) === '7.33';
  });
  const comparisonWindow = sinceIndex >= 0 ? patches.slice(sinceIndex) : patches;
  const intervals = [];

  for (let i = 1; i < comparisonWindow.length; i++) {
    const days = (comparisonWindow[i].patch_timestamp - comparisonWindow[i - 1].patch_timestamp) / 86400;
    if (days > 3 && days < 200) intervals.push(days);
  }

  const medianPause = intervals.length ? Math.round(median(intervals)) : 27;
  const signals = [];

  const stagingHistory = history
    .filter(function (entry) { return entry.branch === 'Staging'; })
    .sort(function (a, b) { return Date.parse(a.timestamp) - Date.parse(b.timestamp); });

  if (stagingHistory.length) {
    const lastChange = stagingHistory[stagingHistory.length - 1].timestamp;
    const elapsed = hoursAgo(lastChange, nowMs);
    const changes24h = stagingHistory.filter(function (entry) {
      const age = hoursAgo(entry.timestamp, nowMs);
      return age >= 0 && age <= 24;
    }).length;
    const changes7d = stagingHistory.filter(function (entry) {
      const age = hoursAgo(entry.timestamp, nowMs);
      return age >= 0 && age <= 168;
    }).length;

    let status = 'calm';
    let note;

    if (stagingHistory.length < 2) {
      note = 'История только собирается — нужно больше наблюдений';
    } else if (elapsed <= 24 && changes24h >= 3) {
      status = 'wait';
      note = changes24h + ' смены за сутки — повышенная активность';
    } else if (elapsed <= 24) {
      status = 'wait';
      note = 'Менялся ' + (elapsed < 1 ? 'меньше часа' : Math.round(elapsed) + ' ч.') + ' назад';
    } else if (changes7d >= 4) {
      status = 'wait';
      note = changes7d + ' смен за неделю — повышенная активность';
    } else if (changes7d >= 1) {
      note = changes7d + ' смен за неделю — в пределах наблюдаемого фона';
    } else {
      note = 'Без изменений ' + Math.round(elapsed / 24) + ' дн.';
    }

    signals.push({
      key: 'staging',
      label: 'Staging',
      value: 'v' + versions.Staging,
      note: note,
      status: status
    });
  }

  signals.push({
    key: 'pause',
    label: 'Пауза после патча',
    value: daysSince + ' дн.',
    note: daysSince > medianPause
      ? 'Дольше медианного интервала (' + medianPause + ' дн.)'
      : 'Медианный интервал — ' + medianPause + ' дн.',
    status: daysSince > medianPause ? 'wait' : 'calm'
  });

  const experimentalHistory = history.filter(function (entry) {
    return entry.branch === 'Experimental';
  });
  const experimental7d = experimentalHistory.filter(function (entry) {
    const age = hoursAgo(entry.timestamp, nowMs);
    return age >= 0 && age <= 168;
  }).length;

  signals.push({
    key: 'experimental',
    label: 'Experimental',
    value: 'v' + versions.Experimental,
    note: experimentalHistory.length < 2
      ? 'Фоновая ветка — сама по себе не указывает на дату патча'
      : experimental7d + ' смен за 7 дн. — справочный показатель',
    status: 'calm'
  });

  const waitingSignals = signals.filter(function (signal) {
    return signal.status === 'wait';
  }).length;

  const trimmedHistory = history.length > MAX_HISTORY
    ? history.slice(-MAX_HISTORY)
    : history;

  const output = {
    dataFormatVersion: 2,
    currentVersion: String(latestPatch.patch_number),
    currentDate: latestDate.toISOString().slice(0, 10),
    latestPatch: {
      version: String(latestPatch.patch_number),
      timestamp: latestDate.toISOString()
    },
    daysSince: daysSince,
    medianPause: medianPause,
    versions: versions,
    signals: signals,
    waitingSignals: waitingSignals,
    historySize: trimmedHistory.length,
    updatedAt: nowIso,
    sourcesCheckedAt: nowIso
  };

  // Оба JSON-файла устанавливаются вместе с резервными копиями и откатом при ошибке.
  publishJsonFiles({
    'history.json': trimmedHistory,
    'data.json': output
  });

  console.log('✅ Данные проверены и сохранены.');
  console.log(JSON.stringify(output, null, 2));
}

main().catch(function (error) {
  console.error('❌ Обновление отменено: ' + error.message);
  console.error('ℹ️ Предыдущие data.json и history.json должны остаться без изменений.');
  try { if (fs.existsSync('history.json.tmp')) fs.unlinkSync('history.json.tmp'); } catch (_) {}
  try { if (fs.existsSync('data.json.tmp')) fs.unlinkSync('data.json.tmp'); } catch (_) {}
  process.exitCode = 1;
});
