const https = require('https');
const fs = require('fs');

const url = 'https://www.dota2.com/datafeed/patchnoteslist?language=english';

https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Dota2-Patch-Bot)' } }, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('=== ОТВЕТ API (первые 3000 символов) ===');
    console.log(data.slice(0, 3000));
    console.log('=== КОНЕЦ ОТВЕТА ===');

    try {
      const json = JSON.parse(data);
      const patches = json.patches || json.patch_list || json.data || (Array.isArray(json) ? json : null);

      if (!patches || patches.length === 0) {
        console.log('❌ Список патчей не найден. Ключи верхнего уровня:', Object.keys(json));
        process.exit(1);
      }

      console.log('✅ Найдено патчей:', patches.length);
      console.log('=== ПЕРВЫЙ ПАТЧ (структура) ===');
      console.log(JSON.stringify(patches[0], null, 2));
      console.log('=== КОНЕЦ ПЕРВОГО ПАТЧА ===');

      // Ищем все поля, которые хоть как-то могут быть датой
      const first = patches[0];
      const dateCandidates = [];
      for (const key of Object.keys(first)) {
        const val = first[key];
        if (typeof val === 'string' && (val.includes('-') || val.includes('/') || val.includes(':'))) {
          dateCandidates.push(`${key}: ${val}`);
        }
        if (typeof val === 'number' && val > 1000000000 && val < 9999999999) {
          dateCandidates.push(`${key}: ${val} (возможно unix timestamp)`);
        }
      }
      console.log('=== ПОЛЯ, ПОХОЖИЕ НА ДАТУ ===');
      console.log(dateCandidates.length ? dateCandidates.join('\n') : 'НЕ НАЙДЕНО');

      // Далее — стандартная логика (на случай, если дата распознается)
      const releaseDate = new Date(first.release_date || first.date || first.timestamp);
      if (isNaN(releaseDate.getTime())) {
        throw new Error('Дата не распознана. Смотрите вывод выше.');
      }

      // ... остальная логика
      console.log('✅ Дата распознана:', releaseDate.toISOString());
      
    } catch (e) {
      console.error('❌ Ошибка:', e.message);
      process.exit(1);
    }
  });
}).on('error', (err) => {
  console.error('❌ Ошибка сети:', err.message);
  process.exit(1);
});
