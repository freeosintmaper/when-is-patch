<div align="center">

<img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64' width='96' height='96'><defs><linearGradient id='g' x1='0' y1='0' x2='64' y2='64'><stop offset='0' stop-color='%23ff5a45'/><stop offset='1' stop-color='%23f0b232'/></linearGradient></defs><rect width='64' height='64' rx='14' fill='%230a0a12'/><path d='M32 8 L50 16 V32 C50 44 42 52 32 56 C22 52 14 44 14 32 V16 Z' fill='none' stroke='url(%23g)' stroke-width='3' stroke-linejoin='round'/><path d='M24 22 H40 M24 22 L32 32 L40 22 M32 32 L24 42 H40 L32 32' fill='none' stroke='url(%23g)' stroke-width='2.8' stroke-linecap='round' stroke-linejoin='round'/></svg>" alt="Когда патч?" width="96" height="96">

# Когда патч?

**Трекер версий Dota 2: Public, Staging, Experimental и признаки скорого обновления**

[🌐 Открыть сайт](https://freeosintmaper.github.io/when-is-patch/) · [🐛 Сообщить о проблеме](https://github.com/freeosintmaper/when-is-patch/issues)

</div>

---

## 📖 О проекте

Небольшой сайт для игроков в **Dota 2**, которые хотят понимать, когда ждать следующее обновление. Valve **никогда не объявляет даты патчей заранее** — но по косвенным признакам можно оценить, что происходит.

Сайт следит за тремя ветками клиента Dota 2:

| Ветка | Что это | Что показывает |
|---|---|---|
| 🔶 **Public** | Игра, в которую играют все | Номер клиента, обновляется часто |
| 🔴 **Staging** | Закрытая служебная ветка Valve | Оживает перед крупными патчами |
| 🟣 **Experimental** | Внутренняя «кухня» Valve | Меняется почти каждый день, фон |

На основе этих данных сайт показывает **вердикт**: «Пока тихо» / «Есть сигнал» / «Похоже, патч близко» / «Скоро патч».

> ⚠️ **Важно:** сайт не предсказывает дату патча. Он показывает признаки и сравнивает текущую ситуацию с прошлой. Valve анонсирует патч **в момент выхода**.

---

## ✨ Что показывает сайт

- **Текущие версии** всех трёх веток клиента
- **Вердикт** — насколько ситуация «горит»
- **Сигналы** — пауза после патча, активность Staging, фон Experimental
- **Хронология** — журнал последних смен версий с группировкой по дням
- **FAQ** — короткие ответы на частые вопросы

---

## 🛠️ Как это работает

```
┌─────────────────────┐    ┌────────────────────┐    ┌─────────────────┐
│  GitHub Actions     │───▶│  update.js         │───▶│  data.json      │
│  (по расписанию)    │    │  Node.js скрипт    │    │  history.json   │
└─────────────────────┘    └────────────────────┘    └────────┬────────┘
                                                               │
                                                               ▼
                                                    ┌─────────────────────┐
                                                    │  index.html         │
                                                    │  GitHub Pages       │
                                                    └─────────────────────┘
```

### Источники данных

- **Список патчей** — официальный API Dota 2: `dota2.com/datafeed/patchnoteslist`
- **Версии веток** — открытый репозиторий [muk-as/DOTA2_WEB](https://github.com/muk-as/DOTA2_WEB), который агрегирует данные SteamDB
- **История** — накапливается в `history.json` при каждом запуске

### Как считается вердикт

Скрипт сравнивает текущую ситуацию с прошлыми:

| Сигнал | Что значит |
|---|---|
| 🟢 **Staging молчит** | Обычная ситуация |
| 🔴 **Staging менялся < 24 ч назад** | Часто бывает перед патчами |
| 🔴 **Пауза дольше медианы** | Патч уже должен был выйти |
| 🟢 **Experimental шумит** | Это фон, не связан со сроками |

**0 сигналов** → «Пока тихо» · **1–2** → «Есть сигнал» · **3** → «Скоро патч»

---

## 📁 Структура репозитория

```
when-is-patch/
├── index.html                    # Страница (GitHub Pages)
├── update.js                     # Скрипт сбора данных
├── data.json                     # Текущий снимок (создаётся автоматически)
├── history.json                  # История смен версий
├── README.md                     # Этот файл
└── .github/
    └── workflows/
        └── update.yml            # GitHub Actions — расписание
```


## 🚀 Как развернуть свой

1. **Fork** этот репозиторий (кнопка сверху).
2. Зайди в **Settings → Pages**, выбери:
   - Source: **Deploy from a branch**
   - Branch: **main** / **(root)**
   - **Save**
3. Зайди в **Actions → Update Patch Data → Run workflow**.
4. Через минуту открой `https://твой-username.github.io/when-is-patch/`.

---

## 🧩 Технологии

<p>
<img alt="HTML5" src="https://img.shields.io/badge/HTML5-e34f26?style=for-the-badge&logo=html5&logoColor=white">
<img alt="CSS3" src="https://img.shields.io/badge/CSS3-1572b6?style=for-the-badge&logo=css3&logoColor=white">
<img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-f7df1e?style=for-the-badge&logo=javascript&logoColor=000">
<img alt="Node.js" src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white">
<img alt="GitHub Actions" src="https://img.shields.io/badge/GitHub_Actions-2088ff?style=for-the-badge&logo=githubactions&logoColor=white">
<img alt="GitHub Pages" src="https://img.shields.io/badge/GitHub_Pages-222222?style=for-the-badge&logo=githubpages&logoColor=white">
</p>

Никаких фреймворков и сборщиков — только чистый HTML, CSS и JavaScript. Обновление данных — через GitHub Actions по расписанию.

---

## 📅 Частота обновления

Данные обновляются **автоматически** через GitHub Actions по расписанию. GitHub может задерживать запуск на 5–30 минут в часы пик — это нормально.

Версии веток и история смен растут со временем: чем дольше сайт работает, тем точнее сигналы.

---

## 🤝 Обратная связь

- Нашёл ошибку или что-то не работает — [открой issue](https://github.com/freeosintmaper/when-is-patch/issues).
- Есть идея — пиши туда же.

---

## 📜 Дисклеймер

Сайт **не связан с Valve** и не является официальным. Dota 2 — торговая марка Valve Corporation.

Все данные получены из **открытых источников**: публичные API Valve, официальный список патчей и агрегированные данные сообщества.

Прогнозы на сайте — **вероятностные**, а не гарантированные. Valve не публикует расписание патчей и может выпустить обновление внезапно.

Сайт был полностью запущен **10.10.2026**

---

<div align="center">

**Сделано для сообщества Dota 2** ❤️

</div>
