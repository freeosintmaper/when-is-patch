const https = require('https');
const fs = require('fs');

const url = 'https://www.dota2.com/datafeed/patchnoteslist?language=english';

https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Dota2-Patch-Bot)' } }, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      const patches = json.patches || [];

      if (patches.length === 0) {
        throw new Error('Список патчей пуст');
      }

      const sorted = [...patches].sort((a, b) => a.patch_timestamp - b.patch_timestamp);
      const latest = sorted[sorted.length - 1];

      const version = latest.patch_number || latest.patch_name || 'unknown';
      const releaseDate = new Date(latest.patch_timestamp * 1000);

      if (isNaN(releaseDate.getTime())) {
        throw new Error('Не удалось распознать дату последнего патча');
      }

      const majors = sorted.filter(p => /^\d+\.\d+$/.test(p.patch_number));
      const recent = majors.slice(-9);

      const intervals = [];
      for (let i = 1; i < recent.length; i++) {
        const diffDays = (recent[i].patch_timestamp - recent[i - 1].patch_timestamp) / 86400;
        if (diffDays > 30 && diffDays < 400) intervals.push(diffDays);
      }

      const avgInterval = intervals.length
        ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
        : 150;

      const estimatedNext = new Date(releaseDate.getTime() + avgInterval * 86400000);
      const daysSince = Math.floor((Date.now() - releaseDate.getTime()) / 86400000);

      const output = {
        currentVersion: version,
        currentDate: releaseDate.toISOString().split('T')[0],
        daysSince: daysSince,
        estimatedNextDate: estimatedNext.toISOString().split('T')[0],
        averageIntervalDays: avgInterval,
        updatedAt: new Date().toISOString()
      };

      fs.writeFileSync('data.json', JSON.stringify(output, null, 2));
      console.log('✅ data.json обновлён:');
      console.log(JSON.stringify(output, null, 2));
    } catch (e) {
      console.error('❌ Ошибка:', e.message);
      process.exit(1);
    }
  });
}).on('error', (err) => {
  console.error('❌ Ошибка сети:', err.message);
  process.exit(1);
});
