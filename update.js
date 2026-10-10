const https = require('https');
const fs = require('fs');

const url = 'https://www.dota2.com/datafeed/patchnoteslist?language=english';

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      const patches = json.patches || [];

      if (patches.length === 0) {
        throw new Error('No patches found in response');
      }

      const latest = patches[0];
      const version = latest.patch_number || latest.version || 'unknown';
      const releaseDate = new Date(latest.release_date);

      // Считаем средний интервал между последними крупными патчами (берём до 6 штук)
      const intervals = [];
      for (let i = 1; i < Math.min(6, patches.length); i++) {
        const prev = new Date(patches[i].release_date);
        const curr = new Date(patches[i - 1].release_date);
        const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
        if (diffDays > 0 && diffDays < 400) {
          intervals.push(diffDays);
        }
      }

      const avgInterval = intervals.length > 0
        ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
        : 150;

      const estimatedNext = new Date(releaseDate);
      estimatedNext.setDate(estimatedNext.getDate() + avgInterval);

      const daysSince = Math.floor((new Date() - releaseDate) / (1000 * 60 * 60 * 24));

      const output = {
        currentVersion: version,
        currentDate: releaseDate.toISOString().split('T')[0],
        daysSince: daysSince,
        estimatedNextDate: estimatedNext.toISOString().split('T')[0],
        averageIntervalDays: avgInterval,
        updatedAt: new Date().toISOString()
      };

      fs.writeFileSync('data.json', JSON.stringify(output, null, 2));
      console.log('✅ data.json успешно обновлён:', output);
    } catch (e) {
      console.error('❌ Ошибка обработки данных:', e.message);
      process.exit(1);
    }
  });
}).on('error', (err) => {
  console.error('❌ Ошибка запроса:', err.message);
  process.exit(1);
});
