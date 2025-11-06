import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import TradingViewWidget from "./components/TradingViewWidget";
import useDebouncedValue from "./hooks/useDebouncedValue";
import {
  searchEquities,
  fetchEquityQuotes,
  fetchEquityNews,
  searchCrypto,
  fetchCryptoQuotes,
  fetchCryptoNews,
  fetchFearGreedIndex,
} from "./services/marketData";

const FMP_API_KEY = import.meta.env.VITE_FMP_API_KEY || "demo";
const USING_FMP_DEMO = !import.meta.env.VITE_FMP_API_KEY;
const REFRESH_INTERVAL_MS = 30_000;
const DEFAULT_SENTIMENT = 38;
const SENTIMENT_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

const NASDAQ_CODES = new Set(["NASDAQ", "NAS", "NASD", "NASDAQGS", "NASDAQGM", "NASDAQCM", "NMS", "NGM", "NCM", "NMQ"]);
const NYSE_CODES = new Set(["NYSE", "NYQ", "NYE", "NYS"]);
const AMEX_CODES = new Set(["AMEX", "ASE", "ARCA", "BATS", "PCX"]);

function normalizeExchangeName(value = "") {
  if (!value) return "";
  const upper = value.toUpperCase();
  if (NASDAQ_CODES.has(upper)) return "NASDAQ";
  if (NYSE_CODES.has(upper)) return "NYSE";
  if (AMEX_CODES.has(upper)) return "AMEX";
  return upper.replace(/\s+/g, " ");
}

function inferTradingViewSymbol(symbol, exchange = "") {
  const normalized = normalizeExchangeName(exchange);
  if (normalized === "NASDAQ") return `NASDAQ:${symbol}`;
  if (normalized === "NYSE") return `NYSE:${symbol}`;
  if (normalized === "AMEX") return `AMEX:${symbol}`;
  return symbol;
}

const DEFAULT_EQUITIES = [
  { symbol: "QQQ", name: "Invesco QQQ Trust", exchange: "NASDAQ", tvSymbol: "NASDAQ:QQQ" },
  { symbol: "SPY", name: "SPDR S&P 500 ETF", exchange: "AMEX", tvSymbol: "AMEX:SPY" },
  { symbol: "TSM", name: "Taiwan Semiconductor", exchange: "NYSE", tvSymbol: "NYSE:TSM" },
  { symbol: "DIA", name: "SPDR Dow Jones Industrial Average", exchange: "AMEX", tvSymbol: "AMEX:DIA" },
  { symbol: "TSLA", name: "Tesla", exchange: "NASDAQ", tvSymbol: "NASDAQ:TSLA" },
];

const DEFAULT_CRYPTO = [
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin", tvSymbol: "BINANCE:BTCUSDT" },
  { id: "ethereum", symbol: "ETH", name: "Ethereum", tvSymbol: "BINANCE:ETHUSDT" },
  { id: "solana", symbol: "SOL", name: "Solana", tvSymbol: "BINANCE:SOLUSDT" },
  { id: "ripple", symbol: "XRP", name: "XRP", tvSymbol: "BINANCE:XRPUSDT" },
  { id: "sui", symbol: "SUI", name: "Sui", tvSymbol: "BINANCE:SUIUSDT" },
];

const translations = {
  en: {
    appName: "TradeScope",
    subtitle: "US stocks / Crypto / Macro events",
    languageLabel: "Language",
    sections: {
      indexes: "US Equities",
      crypto: "Crypto",
      events: "Upcoming US Macro Events",
      today: "Today's Take",
      todayNote: "Risk sentiment is cautious: tech and crypto are under pressure ahead of Core CPI and the FOMC decision. Consider smaller size and faster profit-taking.",
      searchPlaceholder: "Search symbol or name",
      noResults: "No matches found.",
    },
    views: {
      dashboard: "Overview",
      calendar: "Calendar",
      news: "Financial News",
    },
    sentimentLabels: {
      neutral: "Neutral",
      extremeFear: "Extreme Fear",
      fear: "Fear",
      greed: "Greed",
      extremeGreed: "Extreme Greed",
    },
    cardChange: {
      up: "+",
      down: "-",
    },
    news: {
      title: "Latest news",
      empty: "No recent news for this asset.",
      error: "Could not load news right now.",
    },
    feedStatus: {
      equitiesError: "Unable to load US equity prices right now.",
      equitiesUnavailable: "No prices returned for these tickers.",
      equitiesFallback: "Primary feed is unavailable. Showing delayed fallback quotes.",
      equitiesStatic: "All feeds failed. Showing snapshot quotes (not live).",
      equitiesDemoKey: "You're using Financial Modeling Prep's demo key. Only a few symbols (AAPL, TSLA, etc.) will load until you set VITE_FMP_API_KEY.",
    },
    search: {
      add: "Add",
      added: "Watchlist",
      loading: "Searching...",
      noResults: "No matches yet",
      error: "Search failed. Try again.",
    },
    detail: {
      overview: "Overview",
      lastUpdated: "Last updated",
      updatedJustNow: "just now",
      refresh: "Refresh",
      currency: "Currency",
      dataUnavailable: "Price data will appear once we load it.",
    },
    sentimentMeta: {
      updated: "Updated",
      stale: "Auto update failed; showing last value.",
      source: "Source",
      refresh: "Refresh",
    },
    common: {
      loading: "Loading...",
      retry: "Retry",
    },
  },
  zh: {
    appName: "TradeScope",
    subtitle: "美股 / 加密貨幣 / 宏觀事件",
    languageLabel: "語言",
    sections: {
      indexes: "美股",
      crypto: "加密貨幣",
      events: "即將公布的美國宏觀事件",
      today: "今日觀點",
      todayNote: "市場情緒偏保守：科技股與加密資產在核心CPI與聯準會決議前承壓，建議降低部位並加快獲利了結。",
      searchPlaceholder: "搜尋代碼或名稱",
      noResults: "找不到符合條件的項目。",
    },
    views: {
      dashboard: "總覽",
      calendar: "行事曆",
      news: "財經新聞",
    },
    sentimentLabels: {
      neutral: "中性",
      extremeFear: "極度恐慌",
      fear: "恐慌",
      greed: "貪婪",
      extremeGreed: "極度貪婪",
    },
    cardChange: {
      up: "+",
      down: "-",
    },
    news: {
      title: "最新新聞",
      empty: "目前沒有相關新聞。",
      error: "暫時無法載入新聞，請稍後重試。",
    },
    feedStatus: {
      equitiesError: "目前無法載入美股報價。",
      equitiesUnavailable: "查無這些代碼的即時價格。",
      equitiesFallback: "主要報價來源暫時中斷，顯示延遲的備援價格。",
      equitiesStatic: "所有報價來源皆失敗，改顯示快照價格（非即時）。",
      equitiesDemoKey: "目前使用 Financial Modeling Prep 的 demo 金鑰，僅支援 AAPL、TSLA 等少數代碼。請設定 VITE_FMP_API_KEY 以取得完整報價。",
    },
    search: {
      add: "加入",
      added: "已追蹤",
      loading: "搜尋中…",
      noResults: "暫時沒有結果",
      error: "搜尋失敗，請再試一次。",
    },
    detail: {
      overview: "資產概況",
      lastUpdated: "最後更新",
      updatedJustNow: "剛剛",
      refresh: "重新整理",
      currency: "計價幣別",
      dataUnavailable: "資料載入後會自動顯示。",
    },
    common: {
      loading: "載入中…",
      retry: "重試",
    },
  },
};

const SENTIMENT_META_TEXT = {
  en: {
    updated: "Updated",
    stale: "Auto update failed; showing last value.",
    source: "Source",
    refresh: "Refresh",
  },
  zh: {
    updated: "更新於",
    stale: "自動更新失敗，目前顯示上次的數值。",
    source: "資料來源",
    refresh: "重新整理",
  },
};

const STATIC_CALENDAR_EVENTS = [
  { date: "2025-11-12", time: "21:30", region: "US", title: "Core CPI (m/m)", importance: "high" },
  { date: "2025-11-13", time: "03:00", region: "US", title: "FOMC Rate Decision", importance: "high" },
  { date: "2025-11-14", time: "21:30", region: "US", title: "Non-Farm Payrolls", importance: "high" },
  { date: "2025-11-15", time: "22:00", region: "US", title: "University of Michigan Sentiment (Prel)", importance: "medium" },
  { date: "2025-11-16", time: "00:00", region: "CN", title: "Industrial Production (y/y)", importance: "medium" },
  { date: "2025-11-17", time: "09:00", region: "EU", title: "Eurozone CPI (final)", importance: "medium" },
  { date: "2025-11-18", time: "20:00", region: "US", title: "Fed Chair Speech", importance: "high" },
  { date: "2025-11-19", time: "05:00", region: "JP", title: "BOJ Policy Minutes", importance: "medium" },
];

const STATIC_FINANCIAL_NEWS = [
  {
    id: "news-001",
    title: "Fed officials hint at data-dependent path into year-end",
    summary: "Several FOMC members reiterated that future rate moves will hinge on inflation progress, while markets continue to price in cuts for mid-2026.",
    source: "Bloomberg (snapshot)",
    url: "https://www.bloomberg.com/",
    publishedAt: "2025-11-05T13:00:00Z",
  },
  {
    id: "news-002",
    title: "Chipmakers slide as supply chain jitters resurface",
    summary: "Semiconductor names led declines after a major foundry warned of slower smartphone orders, sparking concerns about inventory build-up.",
    source: "Reuters (snapshot)",
    url: "https://www.reuters.com/",
    publishedAt: "2025-11-05T10:30:00Z",
  },
  {
    id: "news-003",
    title: "Energy shares rally with crude back above $87",
    summary: "Oil extended gains on expectations of extended OPEC+ supply cuts, lifting integrated majors and boosting the energy sector.",
    source: "Financial Times (snapshot)",
    url: "https://www.ft.com/",
    publishedAt: "2025-11-04T22:45:00Z",
  },
  {
    id: "news-004",
    title: "Tech megacaps extend dominance in US equity benchmarks",
    summary: "Market breadth remains narrow as AI-focused leaders account for the majority of S&P 500 year-to-date gains.",
    source: "Wall Street Journal (snapshot)",
    url: "https://www.wsj.com/",
    publishedAt: "2025-11-04T18:10:00Z",
  },
  {
    id: "news-005",
    title: "Dollar softens ahead of key inflation data",
    summary: "The greenback retreated from weekly highs as traders trimmed long positions before the next CPI release.",
    source: "CNBC (snapshot)",
    url: "https://www.cnbc.com/",
    publishedAt: "2025-11-03T06:20:00Z",
  },
];

function createEquity(meta) {
  const exchange = normalizeExchangeName(meta.exchange ?? "");
  return {
    symbol: meta.symbol,
    name: meta.name ?? meta.symbol,
    exchange,
    tvSymbol: meta.tvSymbol ?? inferTradingViewSymbol(meta.symbol, exchange),
    type: "equity",
    price: null,
    change: null,
    changePct: null,
    currency: "USD",
    lastUpdated: null,
  };
}

function createCrypto(meta) {
  return {
    id: meta.id,
    symbol: meta.symbol ?? meta.id?.toUpperCase(),
    name: meta.name ?? meta.symbol ?? meta.id,
    tvSymbol: meta.tvSymbol ?? `BINANCE:${(meta.symbol ?? meta.id).toUpperCase()}USDT`,
    type: "crypto",
    price: null,
    change: null,
    changePct: null,
    currency: "USD",
    lastUpdated: null,
  };
}

function formatCurrency(value, currency = "USD") {
  if (value == null) return "--";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: value < 1 ? 4 : 2,
    }).format(value);
  } catch (error) {
    return typeof value === "number" ? value.toFixed(2) : String(value);
  }
}

function formatSignedNumber(value, fractionDigits = 2) {
  if (value == null) return "--";
  const formatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${prefix}${formatter.format(Math.abs(value))}`;
}

function formatCurrencyChange(value, currency = "USD") {
  if (value == null) return "--";
  const formatted = formatCurrency(Math.abs(value), currency);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function formatLastUpdated(timestamp, text) {
  if (!timestamp) return text.detail.dataUnavailable;
  const diffMs = Date.now() - timestamp;
  if (diffMs < 60_000) {
    return text.detail.updatedJustNow;
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      month: "short",
      day: "2-digit",
    }).format(timestamp);
  } catch (error) {
    return new Date(timestamp).toLocaleString();
  }
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return "";
  const diffMs = timestamp - Date.now();
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const diffSeconds = Math.round(diffMs / 1000);
  const divisions = [
    { amount: 60, unit: "seconds" },
    { amount: 60, unit: "minutes" },
    { amount: 24, unit: "hours" },
    { amount: 7, unit: "days" },
    { amount: 4.34524, unit: "weeks" },
    { amount: 12, unit: "months" },
    { amount: Number.POSITIVE_INFINITY, unit: "years" },
  ];

  let duration = diffSeconds;
  for (let i = 0; i < divisions.length; i += 1) {
    const division = divisions[i];
    if (Math.abs(duration) < division.amount) {
      const unit = division.unit.replace(/s$/, "");
      return rtf.format(Math.round(duration), unit);
    }
    duration /= division.amount;
  }
  return "";
}

function MarketCard({ item, onClick, isActive }) {
  const changeClass = item.changePct == null ? "" : item.changePct >= 0 ? "up" : "down";
  const changeValue = formatCurrencyChange(item.change, item.currency);
  const changePct = item.changePct != null ? `${formatSignedNumber(item.changePct)}%` : "";

  return (
    <button
      type="button"
      className={`card card-btn ${isActive ? "active" : ""}`}
      onClick={onClick}
    >
      <div className="card-header">
        <div className="card-symbol">{item.symbol}</div>
        {item.exchange && (
          <div className="card-exchange">{item.exchange}</div>
        )}
      </div>
      <div className="card-name">{item.name}</div>
      <div className="card-price">{formatCurrency(item.price, item.currency)}</div>
      <div className={`card-change ${changeClass}`}>
        {changeValue} {changePct && `(${changePct})`}
      </div>
    </button>
  );
}

function AssetDetail({ asset, text, newsState, onRefresh }) {
  if (!asset) return null;

  const changeClass = asset.changePct == null ? "" : asset.changePct >= 0 ? "up" : "down";
  const changeValue = formatCurrencyChange(asset.change, asset.currency);
  const changePct = asset.changePct != null ? `${formatSignedNumber(asset.changePct)}%` : "";

  return (
    <section className="section asset-detail">
      <div className="asset-detail-header">
        <div>
          <h2>{asset.name} ({asset.symbol})</h2>
          <p className="asset-detail-meta">
            {asset.exchange ? `${asset.exchange} · ` : ""}
            {text.detail.currency}: {asset.currency ?? "USD"}
          </p>
        </div>
        <button type="button" className="refresh-btn" onClick={onRefresh}>
          {text.detail.refresh}
        </button>
      </div>

      <div className="detail-layout">
        <div className="detail-chart">
          <TradingViewWidget symbol={asset.tvSymbol ?? asset.symbol} interval="60" />
        </div>

        <div className="detail-side">
          <div className="macro-card">
            <h3>{text.detail.overview}</h3>
            <p className="macro-label">{formatCurrency(asset.price, asset.currency)}</p>
            <p className={`macro-row ${changeClass}`}>
              <span>{changeValue}</span>
              <span>{changePct}</span>
            </p>
            <p className="macro-comment">
              {text.detail.lastUpdated}: {formatLastUpdated(asset.lastUpdated, text)}
            </p>
          </div>

          <div className="news-block">
            <h3>{text.news.title}</h3>
            {newsState.status === "loading" && (
              <p className="note">{text.common.loading}</p>
            )}
            {newsState.status === "error" && (
              <p className="note">{text.news.error}</p>
            )}
            {newsState.status === "ready" && newsState.items.length === 0 && (
              <p className="note">{text.news.empty}</p>
            )}
            {newsState.status === "ready" && newsState.items.length > 0 && (
              <ul className="news-list">
                {newsState.items.map((item) => (
                  <li key={item.id} className="news-item">
                    <a href={item.url} target="_blank" rel="noreferrer" className="news-title">
                      {item.title}
                    </a>
                    <div className="news-meta">
                      <span>{item.source}</span>
                      {item.formattedTime && <span>{item.formattedTime}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function CalendarSection({ events, text }) {
  const formatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit", weekday: "short" });
  const sorted = [...events].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  return (
    <section className="section">
      <h2>{text.views.calendar}</h2>
      <div className="calendar-grid">
        {sorted.map((event, index) => {
          const dateLabel = formatter.format(new Date(event.date));
          return (
            <div key={`${event.date}-${event.time}-${index}`} className="calendar-card">
              <div className="calendar-date">{dateLabel}</div>
              <div className="calendar-time">{event.time}</div>
              <div className="calendar-region">{event.region}</div>
              <div className="calendar-title">{event.title}</div>
              <div className={`calendar-badge importance-${event.importance}`}>
                {event.importance.toUpperCase()}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FinancialNewsSection({ articles, text }) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <section className="section">
      <h2>{text.views.news}</h2>
      <div className="news-board">
        {articles.map((article) => {
          const published = article.publishedAt ? formatter.format(new Date(article.publishedAt)) : "";
          return (
            <article key={article.id} className="news-card">
              <header className="news-card-header">
                <div className="news-card-source">{article.source}</div>
                {published && <div className="news-card-time">{published}</div>}
              </header>
              <h3 className="news-card-title">
                <a href={article.url} target="_blank" rel="noreferrer">{article.title}</a>
              </h3>
              <p className="news-card-summary">{article.summary}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SearchResults({
  visible,
  query,
  isLoading,
  results,
  alreadyTracked = new Set(),
  onSelect,
  text,
  error,
}) {
  if (!visible || !query) return null;

  let content = null;
  if (isLoading) {
    content = <div className="search-result">{text.search.loading}</div>;
  } else if (error) {
    content = <div className="search-result error">{text.search.error}</div>;
  } else if ((results ?? []).length === 0) {
    content = <div className="search-result empty">{text.search.noResults}</div>;
  } else {
    content = results.map((item) => {
      const key = item.id ?? item.symbol;
      const displaySymbol = item.symbol ?? item.id;
      const isAdded = alreadyTracked.has(key);
      return (
        <button
          type="button"
          key={key}
          className="search-result option"
          onClick={() => onSelect(item)}
          disabled={isAdded}
        >
          <div className="search-result-info">
            <span className="search-result-symbol">{displaySymbol}</span>
            <span className="search-result-name">{item.name}</span>
          </div>
          <span className="search-result-action">{isAdded ? text.search.added : text.search.add}</span>
        </button>
      );
    });
  }

  return (
    <div className="search-results">
      {content}
    </div>
  );
}

function getEventDateTime(event) {
  return new Date(`${event.date}T${event.time ?? "00:00"}`);
}

function App() {
  const [language, setLanguage] = useState("en");
  const text = translations[language] ?? translations.en;
  const sentimentText = SENTIMENT_META_TEXT[language] ?? SENTIMENT_META_TEXT.en;
  const [sentimentScore, setSentimentScore] = useState(DEFAULT_SENTIMENT);
  const [sentimentTimestamp, setSentimentTimestamp] = useState(null);
  const [sentimentError, setSentimentError] = useState(false);
  const [sentimentSource, setSentimentSource] = useState("static");

  const [equities, setEquities] = useState(() => DEFAULT_EQUITIES.map(createEquity));
  const [crypto, setCrypto] = useState(() => DEFAULT_CRYPTO.map(createCrypto));

  const [equityQuery, setEquityQuery] = useState("");
  const [cryptoQuery, setCryptoQuery] = useState("");
  const debouncedEquityQuery = useDebouncedValue(equityQuery);
  const debouncedCryptoQuery = useDebouncedValue(cryptoQuery);

  const [equityResults, setEquityResults] = useState([]);
  const [cryptoResults, setCryptoResults] = useState([]);
  const [isSearchingEquities, setIsSearchingEquities] = useState(false);
  const [isSearchingCrypto, setIsSearchingCrypto] = useState(false);
  const [equitySearchError, setEquitySearchError] = useState(null);
  const [cryptoSearchError, setCryptoSearchError] = useState(null);
  const [equityFeedStatus, setEquityFeedStatus] = useState("idle");
  const [equityFeedNotice, setEquityFeedNotice] = useState(null);
  const [activeView, setActiveView] = useState("dashboard");

  const [selectedRef, setSelectedRef] = useState(() => ({
    type: "equity",
    symbol: DEFAULT_EQUITIES[0].symbol,
  }));
  const selectedAsset = useMemo(() => {
    if (!selectedRef) return null;
    if (selectedRef.type === "equity") {
      return equities.find((item) => item.symbol === selectedRef.symbol) ?? null;
    }
    return crypto.find((item) => item.id === selectedRef.id) ?? null;
  }, [selectedRef, equities, crypto]);

  const [newsState, setNewsState] = useState({ status: "idle", items: [] });

  const equitiesKey = equities.map((item) => item.symbol).join("|");
  const cryptoKey = crypto.map((item) => item.id).join("|");

  const applyEquityQuotes = useCallback((quotes) => {
    if (!quotes || quotes.length === 0) return;
    const map = new Map(quotes.map((item) => [item.symbol, item]));
    setEquities((prev) => prev.map((item) => {
      const quote = map.get(item.symbol);
      if (!quote) return item;
      const updatedExchange = normalizeExchangeName(quote.exchange ?? item.exchange);
      return {
        ...item,
        price: quote.price,
        change: quote.change,
        changePct: quote.changePct,
        lastUpdated: quote.lastUpdated,
        currency: quote.currency ?? item.currency,
        exchange: updatedExchange || item.exchange,
        tvSymbol: inferTradingViewSymbol(item.symbol, updatedExchange || item.exchange),
      };
    }));
  }, []);

  const updateEquityQuotes = useCallback(async (symbols) => {
    const uniqueSymbols = Array.from(new Set(symbols)).filter(Boolean);
    if (uniqueSymbols.length === 0) return;

    try {
      const { quotes, missingSymbols, usedFallback, usedStatic } = await fetchEquityQuotes(uniqueSymbols, FMP_API_KEY);

      if (quotes.length > 0) {
        applyEquityQuotes(quotes);
        setEquityFeedStatus("ready");

        if (usedStatic) {
          setEquityFeedNotice("static");
        } else if (missingSymbols.length > 0) {
          setEquityFeedNotice(USING_FMP_DEMO ? "demo" : "empty");
        } else if (usedFallback) {
          setEquityFeedNotice("fallback");
        } else {
          setEquityFeedNotice(null);
        }
      } else {
        setEquityFeedStatus("ready");
        if (missingSymbols.length > 0) {
          setEquityFeedNotice(USING_FMP_DEMO ? "demo" : "empty");
        } else {
          setEquityFeedNotice(null);
        }
      }
    } catch (error) {
      console.error("Failed to load equity quotes", error);
      setEquityFeedStatus("error");
      setEquityFeedNotice(null);
    }
  }, [applyEquityQuotes]);

  useEffect(() => {
    updateEquityQuotes(equities.map((item) => item.symbol));
  }, [equitiesKey, updateEquityQuotes]);

  useEffect(() => {
    let cancelled = false;

    async function loadCrypto() {
      if (crypto.length === 0) return;
      try {
        const quotes = await fetchCryptoQuotes(crypto.map((item) => item.id));
        if (cancelled) return;
        const map = new Map(quotes.map((item) => [item.id, item]));
        setCrypto((prev) => prev.map((item) => {
          const quote = map.get(item.id);
          return quote
            ? { ...item, price: quote.price, change: quote.change, changePct: quote.changePct, lastUpdated: quote.lastUpdated, currency: quote.currency ?? item.currency }
            : item;
        }));
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load crypto quotes", error);
        }
      }
    }

    loadCrypto();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!debouncedEquityQuery) {
      setEquityResults([]);
      setEquitySearchError(null);
      return;
    }

    let cancelled = false;
    setIsSearchingEquities(true);
    setEquitySearchError(null);

    searchEquities(debouncedEquityQuery, FMP_API_KEY)
      .then((results) => {
        if (cancelled) return;
        setEquityResults(results);
      })
      .catch((error) => {
        console.error("Equity search failed", error);
        if (cancelled) return;
        setEquitySearchError(error);
      })
      .finally(() => {
        if (!cancelled) {
          setIsSearchingEquities(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedEquityQuery]);

  useEffect(() => {
    if (!debouncedCryptoQuery) {
      setCryptoResults([]);
      setCryptoSearchError(null);
      return;
    }

    let cancelled = false;
    setIsSearchingCrypto(true);
    setCryptoSearchError(null);

    searchCrypto(debouncedCryptoQuery)
      .then((results) => {
        if (cancelled) return;
        setCryptoResults(results);
      })
      .catch((error) => {
        console.error("Crypto search failed", error);
        if (cancelled) return;
        setCryptoSearchError(error);
      })
      .finally(() => {
        if (!cancelled) {
          setIsSearchingCrypto(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedCryptoQuery]);

  useEffect(() => {
    if (!selectedRef || activeView !== "dashboard") {
      setNewsState((prev) => (prev.status === "idle" ? prev : { status: "idle", items: [] }));
      return;
    }

    let cancelled = false;
    setNewsState({ status: "loading", items: [] });

    const loadNews = async () => {
      try {
        const items = selectedRef.type === "equity"
          ? await fetchEquityNews(selectedRef.symbol, FMP_API_KEY)
          : await fetchCryptoNews(selectedRef.symbol ?? selectedRef.id);
        if (!cancelled) {
          setNewsState({ status: "ready", items });
        }
      } catch (error) {
        console.error("Failed to load news", error);
        if (!cancelled) {
          setNewsState({ status: "error", items: [] });
        }
      }
    };

    loadNews();

    return () => {
      cancelled = true;
    };
  }, [selectedRef?.type, selectedRef?.symbol, selectedRef?.id, activeView]);

  useEffect(() => {
    if (equities.length === 0 && crypto.length === 0) return;

    const interval = setInterval(() => {
      if (equities.length > 0) {
        updateEquityQuotes(equities.map((item) => item.symbol));
      }

      if (crypto.length > 0) {
        fetchCryptoQuotes(crypto.map((item) => item.id))
          .then((quotes) => {
            const map = new Map(quotes.map((item) => [item.id, item]));
            setCrypto((prev) => prev.map((item) => {
              const quote = map.get(item.id);
              return quote
                ? { ...item, price: quote.price, change: quote.change, changePct: quote.changePct, lastUpdated: quote.lastUpdated }
                : item;
            }));
          })
          .catch((error) => console.error("Failed to refresh crypto quotes", error));
      }
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [equitiesKey, cryptoKey, updateEquityQuotes]);

  const handleAddEquity = (result) => {
    if (!result?.symbol) return;
    setEquityQuery("");
    setEquityResults([]);

    const exists = equities.some((item) => item.symbol === result.symbol);
    if (!exists) {
      const next = createEquity({
        symbol: result.symbol,
        name: result.name,
        exchange: result.exchange,
      });
      setEquities((prev) => [...prev, next]);
    }

    setSelectedRef({ type: "equity", symbol: result.symbol });
    updateEquityQuotes([result.symbol]);
  };

  const handleAddCrypto = (result) => {
    if (!result?.id) return;
    setCryptoQuery("");
    setCryptoResults([]);

    const exists = crypto.some((item) => item.id === result.id);
    if (!exists) {
      const next = createCrypto({
        id: result.id,
        symbol: result.symbol,
        name: result.name,
      });
      setCrypto((prev) => [...prev, next]);
    }

    setSelectedRef({ type: "crypto", id: result.id, symbol: result.symbol?.toUpperCase() });
    fetchCryptoQuotes([result.id])
      .then((quotes) => {
        const quote = quotes[0];
        if (!quote) return;
        setCrypto((prev) => prev.map((item) => (
          item.id === result.id
            ? { ...item, price: quote.price, change: quote.change, changePct: quote.changePct, lastUpdated: quote.lastUpdated }
            : item
        )));
      })
      .catch((error) => console.error("Failed to load crypto quote", error));
  };

  const equitySymbolSet = useMemo(
    () => new Set(equities.map((item) => item.symbol)),
    [equitiesKey],
  );
  const cryptoIdSet = useMemo(
    () => new Set(crypto.map((item) => item.id)),
    [cryptoKey],
  );

  const refreshSentiment = useCallback(async () => {
    try {
      const data = await fetchFearGreedIndex();
      if (data?.score != null) {
        setSentimentScore(data.score);
      }
      setSentimentTimestamp(data?.timestamp ?? Date.now());
      setSentimentError(false);
       setSentimentSource(data?.source ?? "live");
    } catch (error) {
      console.error("Failed to update Fear & Greed index", error);
      setSentimentError(true);
    }
  }, []);

  useEffect(() => {
    refreshSentiment();
    const interval = setInterval(refreshSentiment, SENTIMENT_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshSentiment]);

  const handleRefreshSelected = () => {
    if (!selectedRef) return;
    if (selectedRef.type === "equity") {
      updateEquityQuotes([selectedRef.symbol]);
    } else {
      fetchCryptoQuotes([selectedRef.id])
        .then((quotes) => {
          const quote = quotes[0];
          if (!quote) return;
          setCrypto((prev) => prev.map((item) => (
            item.id === selectedRef.id
              ? { ...item, price: quote.price, change: quote.change, changePct: quote.changePct, lastUpdated: quote.lastUpdated }
              : item
          )));
        })
        .catch((error) => console.error("Manual crypto refresh failed", error));
    }
  };

  const viewOptions = [
    { id: "dashboard", label: text.views.dashboard },
    { id: "calendar", label: text.views.calendar },
    { id: "news", label: text.views.news },
  ];

  const upcomingUsEvents = useMemo(() => (
    STATIC_CALENDAR_EVENTS
      .filter((event) => event.region === "US")
      .slice()
      .sort((a, b) => getEventDateTime(a) - getEventDateTime(b))
      .slice(0, 3)
  ), []);

  const upcomingDateFormatter = useMemo(() => (
    new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "2-digit",
    })
  ), []);

  const sourceLabels = language === "zh"
    ? { cnn: "CNN", alternative: "Alternative.me", static: "快照", default: "資料來源" }
    : { cnn: "CNN", alternative: "Alternative.me", static: "Snapshot", default: "Source" };
  const sentimentSourceLabel = sourceLabels[sentimentSource] ?? sourceLabels.default;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>{text.appName}</h1>
          <p className="subtitle">{text.subtitle}</p>
        </div>
        <div className="header-actions">
          <select
            className="language-select"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            aria-label={text.languageLabel}
          >
            <option value="en">English</option>
            <option value="zh">繁體中文</option>
          </select>
          <div className="sentiment-wrapper">
            <SentimentBadge score={sentimentScore} labels={text.sentimentLabels} />
            <div className="sentiment-meta">
              {sentimentTimestamp && (
                <span>{sentimentText.updated}: {formatRelativeTime(sentimentTimestamp)}</span>
              )}
              {!sentimentError && sentimentSource && (
                <span className="sentiment-source">
                  {sentimentText.source}: {sentimentSourceLabel}
                </span>
              )}
              <div className="sentiment-actions">
                <button
                  type="button"
                  className="sentiment-refresh"
                  onClick={refreshSentiment}
                >
                  {sentimentText.refresh}
                </button>
                {sentimentError && (
                  <span className="sentiment-warning">{sentimentText.stale}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="view-tabs">
        {viewOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`view-tab ${activeView === option.id ? "active" : ""}`}
            onClick={() => setActiveView(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {activeView === "dashboard" && (
        <>
          <section className="section">
            <div className="section-header">
              <h2>{text.sections.indexes}</h2>
              <div className="search-wrapper">
                <input
                  type="search"
                  className="section-search"
                  value={equityQuery}
                  onChange={(event) => setEquityQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && equityResults.length > 0) {
                      event.preventDefault();
                      handleAddEquity(equityResults[0]);
                    }
                  }}
                  placeholder={text.sections.searchPlaceholder}
                  aria-label={text.sections.searchPlaceholder}
                />
                <SearchResults
                  visible={Boolean(equityQuery)}
                  query={equityQuery}
                  isLoading={isSearchingEquities}
                  results={equityResults}
                  alreadyTracked={equitySymbolSet}
                  onSelect={handleAddEquity}
                  text={text}
                  error={equitySearchError}
                />
              </div>
            </div>
            {equityFeedStatus === "error" && (
              <p className="section-empty warning">{text.feedStatus.equitiesError}</p>
            )}
            {equityFeedNotice === "empty" && (
              <p className="section-empty warning">{text.feedStatus.equitiesUnavailable}</p>
            )}
            {equityFeedNotice === "fallback" && (
              <p className="section-empty info">{text.feedStatus.equitiesFallback}</p>
            )}
            {equityFeedNotice === "static" && (
              <p className="section-empty info">{text.feedStatus.equitiesStatic}</p>
            )}
            {equityFeedNotice === "demo" && (
              <p className="section-empty info">{text.feedStatus.equitiesDemoKey}</p>
            )}
            {equities.length === 0 ? (
              <p className="section-empty">{text.sections.noResults}</p>
            ) : (
              <div className="grid">
                {equities.map((item) => (
                  <MarketCard
                    key={item.symbol}
                    item={item}
                    onClick={() => setSelectedRef({ type: "equity", symbol: item.symbol })}
                    isActive={selectedRef?.type === "equity" && selectedRef.symbol === item.symbol}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <div className="section-header">
              <h2>{text.sections.crypto}</h2>
              <div className="search-wrapper">
                <input
                  type="search"
                  className="section-search"
                  value={cryptoQuery}
                  onChange={(event) => setCryptoQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && cryptoResults.length > 0) {
                      event.preventDefault();
                      handleAddCrypto(cryptoResults[0]);
                    }
                  }}
                  placeholder={text.sections.searchPlaceholder}
                  aria-label={text.sections.searchPlaceholder}
                />
                <SearchResults
                  visible={Boolean(cryptoQuery)}
                  query={cryptoQuery}
                  isLoading={isSearchingCrypto}
                  results={cryptoResults.map((item) => ({
                    ...item,
                    symbol: item.symbol?.toUpperCase(),
                  }))}
                  alreadyTracked={cryptoIdSet}
                  onSelect={handleAddCrypto}
                  text={text}
                  error={cryptoSearchError}
                />
              </div>
            </div>
            {crypto.length === 0 ? (
              <p className="section-empty">{text.sections.noResults}</p>
            ) : (
              <div className="grid">
                {crypto.map((item) => (
                  <MarketCard
                    key={item.id}
                    item={{ ...item, exchange: item.type === "crypto" ? "CRYPTO" : item.exchange }}
                    onClick={() => setSelectedRef({ type: "crypto", id: item.id, symbol: item.symbol })}
                    isActive={selectedRef?.type === "crypto" && selectedRef.id === item.id}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <h2>{text.sections.events}</h2>
            <div className="events">
              {upcomingUsEvents.map((event, index) => {
                const dateKey = `${event.date}-${event.time}-${index}`;
                const eventDate = getEventDateTime(event);
                const stars = event.importance === "high" ? 3 : event.importance === "medium" ? 2 : 1;
                return (
                  <div key={dateKey} className="event-row">
                    <div className="event-date">
                      {upcomingDateFormatter.format(eventDate)} {event.time}
                    </div>
                    <div className="event-title">{event.title}</div>
                    <div className="event-stars">{"*".repeat(stars)}</div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="section">
            <h2>{text.sections.today}</h2>
            <p className="note">{text.sections.todayNote}</p>
          </section>
        </>
      )}

      {activeView === "calendar" && (
        <CalendarSection events={STATIC_CALENDAR_EVENTS} text={text} />
      )}

      {activeView === "news" && (
        <FinancialNewsSection articles={STATIC_FINANCIAL_NEWS} text={text} />
      )}

      {activeView === "dashboard" && selectedAsset && (
        <AssetDetail
          asset={selectedAsset}
          text={text}
          newsState={newsState}
          onRefresh={handleRefreshSelected}
        />
      )}
    </div>
  );
}

function SentimentBadge({ score, labels }) {
  let labelKey = "neutral";
  let color = "#9ca3af";

  if (score <= 25) { labelKey = "extremeFear"; color = "#f97373"; }
  else if (score <= 45) { labelKey = "fear"; color = "#fb923c"; }
  else if (score >= 80) { labelKey = "extremeGreed"; color = "#22c55e"; }
  else if (score >= 60) { labelKey = "greed"; color = "#4ade80"; }

  return (
    <div className="sentiment">
      <div className="sentiment-score" style={{ borderColor: color, color }}>
        {score}
      </div>
      <div className="sentiment-label" style={{ color }}>
        {labels[labelKey]}
      </div>
    </div>
  );
}

export default App;
