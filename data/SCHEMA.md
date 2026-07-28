# Схема отчёта

Каждый отчёт — один файл `data/reports/<slug>.json`. Плюс запись в `data/index.json`.

**Все поля опциональны кроме `slug` и `symbol`.** Рендерер пропускает пустые секции: если нет
`derivatives` — вкладки «Деривативы» просто не будет. Лучше опустить поле, чем поставить выдуманное значение.

## `data/index.json`

```json
{
  "updated": "2026-07-28",
  "reports": [
    {
      "slug": "hype",            // = имя файла в data/reports/
      "symbol": "HYPE",
      "name": "Hyperliquid",
      "chain": "Hyperliquid L1", // становится фильтром на главной
      "date": "2026-07-28",
      "stance": "neutral",       // bullish | neutral | bearish | watch | avoid
      "price": 55.46,
      "change24h": -3.81,        // в процентах
      "mcap": 12335747203,
      "summary": "1–2 предложения для карточки"
    }
  ]
}
```

## `data/reports/<slug>.json`

Единицы: **все суммы в USD, числом без разделителей**. Проценты — числом (`-3.81` = −3.81%),
кроме долей, помеченных ниже как *доля* (`0.42` = 42%). Даты — `YYYY-MM-DD`.

```jsonc
{
  "slug": "hype", "symbol": "HYPE", "name": "Hyperliquid",
  "chain": "Hyperliquid L1", "sector": "Perp DEX / L1",
  "address": "0x…",             // показывается с кнопкой копирования
  "date": "2026-07-28",         // дата отчёта
  "updated": "2026-07-28T15:45:00Z",

  "verdict": {
    "stance": "neutral",        // те же значения, что в index.json
    "conviction": 3,            // 1–5, рисуется точками
    "summary": "Вывод в 3–5 предложений — самый верхний блок"
  },
  "thesis": "Длинный текст. Пустая строка = новый абзац.",

  "market": {
    "price": 55.46, "change24h": -3.81, "change7d": -10.43, "change30d": -11.61,
    "mcap": 12335747203, "fdv": 52976640536,
    "liquidity": 0, "volume24h": 502310868,
    "circulating": 222445714, "totalSupply": 1000000000,
    "ath": 76.7, "athDate": "2026-06-16",
    "pools": [ { "pair": "HYPE/USDC", "dex": "Uniswap v3", "liquidity": 0, "volume24h": 0 } ],
    "notes": "Комментарий под метриками"
  },

  "onchain": {
    "holders": 12345, "holdersChange30d": 8.2,
    "concentration": { "top10": 0.42, "top50": 0.61 },   // доли
    "topHolders": [
      { "label": "Binance", "address": "0x…", "pct": 0.081, "valueUsd": 0, "tag": "CEX" }
    ],
    "smartMoney": {
      "netFlow7d": -41400000,
      "notes": "Текст",
      "movers": [ { "label": "Wintermute", "address": "0x…", "netUsd": -8200000 } ]
    },
    "flows": [ { "period": "24ч", "cexIn": 0, "cexOut": 0, "net": 0 } ],
    "notes": "Текст"
  },

  "fundamentals": {
    "what": "Что за проект",
    "revenue": "Как зарабатывает",
    "tvl": 6345989410, "tvlChange30d": -4.1,
    "fees30d": 52561541, "revenue30d": 0,
    "priceToFees": 11.9,
    "highlights": ["Пункт списка", "Ещё пункт"],
    "team": [ { "role": "CEO", "name": "…", "note": "…" } ],
    "tokenomics": {
      "allocations": [ { "name": "Команда", "pct": 0.20 } ],  // доли, рисуется stacked bar
      "emissions": "Текст про эмиссию"
    },
    "unlocks": [
      { "date": "2026-11-29", "name": "Core contributors", "pctSupply": 0.023, "amountUsd": 0, "note": "…" }
    ]
  },

  "derivatives": {
    "oi": 1300000000, "oiChange24h": -5.2,
    "fundingRate": 0.00125, "fundingPeriod": "1ч · 10.95% годовых",
    "longShort": 1.24,
    "liq24h": 16728822, "liqLongShare": 0.9916,   // доля
    "notes": "Текст"
  },

  "narrative": {
    "sentiment": "Текст",
    "catalysts": ["Строка", { "date": "2026-09-01", "title": "Событие" }],
    "news": [ { "date": "2026-07-25", "title": "…", "url": "https://…", "source": "The Block" } ]
  },

  "risks": [
    { "severity": "high", "title": "Заголовок", "detail": "Описание" }   // high | med | low
  ],

  "scenarios": [
    { "name": "Бычий", "target": "$95–110", "prob": 0.25, "detail": "Условия" }
  ],

  "position": {
    "entry": "…", "target": "…", "invalidation": "…",
    "size": "…", "horizon": "2–4 квартала", "notes": "…"
  },

  "sources": [ { "name": "CoinGecko", "note": "цена, FDV", "url": "https://…" } ]
}
```

## Разметка в тексте

В любом текстовом поле работает: `**жирный**`, `` `моноширинный` ``, перенос строки, пустая строка = абзац.
HTML экранируется — вставлять теги нельзя.
