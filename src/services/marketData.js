import { STATIC_EQUITIES, STATIC_EQUITY_MAP } from "../data/staticEquities";

const FMP_BASE = "https://financialmodelingprep.com/api/v3";
const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const CRYPTO_NEWS_API = "https://min-api.cryptocompare.com/data/v2/news/";

function formatTimestamp(timestampMs) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      month: "short",
      day: "2-digit",
    }).format(timestampMs);
  } catch (error) {
    return "";
  }
}

export async function searchEquities(query, apiKey, { limit = 8 } = {}) {
  const normalized = query?.trim().toLowerCase();
  if (!normalized) return [];

  const staticMatches = STATIC_EQUITIES.filter((item) => {
    return (
      item.symbol.toLowerCase().includes(normalized) ||
      item.name.toLowerCase().includes(normalized)
    );
  }).slice(0, limit);

  try {
    const url = `${FMP_BASE}/search?query=${encodeURIComponent(query)}&limit=${limit}&apikey=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Equity search failed with status ${response.status}`);
    }
    const payload = await response.json();
    const apiResults = (payload ?? []).map((item) => ({
      symbol: item.symbol,
      name: item.name ?? item.symbol,
      exchange: item.exchangeShortName ?? item.exchange ?? "",
      type: item.type ?? "stock",
    }));

    if (apiResults.length > 0) {
      return apiResults;
    }
  } catch (error) {
    console.warn("Equity search falling back to static list", error);
  }

  return staticMatches;
}

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildStooqSymbol(symbol) {
  return `${symbol.toLowerCase()}.us`;
}

async function fetchStooqQuotes(symbols) {
  if (symbols.length === 0) {
    return [];
  }

  const symbolMap = symbols.map((symbol) => ({
    original: symbol,
    fallback: buildStooqSymbol(symbol),
  }));

  const baseUrl = `https://stooq.com/q/l/?s=${symbolMap.map((item) => item.fallback).join(",")}&f=sd2t2ohlcv&h&e=csv`;
  const proxiedUrl = `https://r.jina.ai/${baseUrl}`;

  let text;
  try {
    const response = await fetch(baseUrl);
    if (!response.ok) {
      throw new Error(`Stooq quotes failed with status ${response.status}`);
    }
    text = await response.text();
  } catch (error) {
    const proxyResponse = await fetch(proxiedUrl);
    if (!proxyResponse.ok) {
      throw new Error(`Stooq proxy quotes failed with status ${proxyResponse.status}`);
    }
    text = await proxyResponse.text();
  }

  const lines = text.trim().split(/\r?\n/);
  if (lines.length <= 1) {
    return [];
  }
  const headers = lines[0].split(",");
  const entries = lines.slice(1).map((line) => {
    const columns = line.split(",");
    const entry = {};
    headers.forEach((header, index) => {
      entry[header.trim().toLowerCase()] = columns[index]?.trim();
    });
    return entry;
  });

  const fallbackMap = new Map(symbolMap.map((item) => [item.fallback.toLowerCase(), item.original]));

  return entries
    .map((entry) => {
      const fallbackSymbol = entry.symbol?.toLowerCase();
      const originalSymbol = fallbackMap.get(fallbackSymbol);
      if (!originalSymbol) return null;

      const open = parseNumber(entry.open);
      const close = parseNumber(entry.close);
      const change = open != null && close != null ? close - open : null;
      const changePct = change != null && open ? (change / open) * 100 : null;
      const timestamp = entry.date && entry.time
        ? Date.parse(`${entry.date}T${entry.time}Z`)
        : Date.now();

      return {
        symbol: originalSymbol,
        name: originalSymbol,
        price: close,
        change,
        changePct,
        previousClose: open,
        currency: "USD",
        lastUpdated: Number.isFinite(timestamp) ? timestamp : Date.now(),
        exchange: "",
        source: "stooq",
      };
    })
    .filter(Boolean);
}

export async function fetchEquityQuotes(symbols, apiKey) {
  const uniqueSymbols = Array.from(new Set(symbols)).filter(Boolean);
  if (uniqueSymbols.length === 0) {
    return { quotes: [], missingSymbols: [], usedFallback: false, usedStatic: false };
  }

  const collected = new Map();
  let primaryError = null;

  if (apiKey) {
    try {
      const url = `${FMP_BASE}/quote/${uniqueSymbols.join(",")}?apikey=${apiKey}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Equity quotes failed with status ${response.status}`);
      }
      const payload = await response.json();
      (payload ?? []).forEach((item) => {
        collected.set(item.symbol, {
          symbol: item.symbol,
          name: item.name ?? item.symbol,
          price: typeof item.price === "number" ? item.price : parseNumber(item.price),
          change: typeof item.change === "number" ? item.change : parseNumber(item.change),
          changePct: typeof item.changesPercentage === "number"
            ? item.changesPercentage
            : parseNumber(item.changesPercentage),
          previousClose: typeof item.previousClose === "number"
            ? item.previousClose
            : parseNumber(item.previousClose),
          currency: item.currency ?? "USD",
          lastUpdated: item.timestamp ? item.timestamp * 1000 : Date.now(),
          exchange: item.exchange ?? item.exchangeShortName ?? "",
          source: "fmp",
        });
      });
    } catch (error) {
      primaryError = error;
    }
  }

  const missingAfterPrimary = uniqueSymbols.filter((symbol) => !collected.has(symbol));
  let usedFallback = false;
  let usedStatic = false;

  if (missingAfterPrimary.length > 0) {
    try {
      const fallbackQuotes = await fetchStooqQuotes(missingAfterPrimary);
      fallbackQuotes.forEach((quote) => {
        collected.set(quote.symbol, quote);
      });
      if (fallbackQuotes.length > 0) {
        usedFallback = true;
      }
    } catch (error) {
      if (!primaryError) {
        primaryError = error;
      }
    }
  }

  const missingAfterFallback = uniqueSymbols.filter((symbol) => !collected.has(symbol));

  if (missingAfterFallback.length > 0) {
    missingAfterFallback.forEach((symbol) => {
      const snapshot = STATIC_EQUITY_MAP.get(symbol);
      if (!snapshot) return;
      collected.set(symbol, {
        symbol,
        name: snapshot.name ?? symbol,
        price: snapshot.price ?? null,
        change: snapshot.change ?? null,
        changePct: snapshot.changePct ?? null,
        previousClose: snapshot.previousClose ?? null,
        currency: "USD",
        lastUpdated: Date.now(),
        exchange: snapshot.exchange ?? "",
        source: "static",
      });
      usedStatic = true;
    });
  }

  const quotes = uniqueSymbols
    .map((symbol) => collected.get(symbol))
    .filter(Boolean);

  const missingSymbols = uniqueSymbols.filter((symbol) => !collected.has(symbol));

  if (quotes.length === 0 && primaryError) {
    throw primaryError;
  }

  return { quotes, missingSymbols, usedFallback, usedStatic };
}

export async function fetchEquityNews(symbol, apiKey, { limit = 6 } = {}) {
  const primaryUrl = `${FMP_BASE}/stock_news?tickers=${encodeURIComponent(symbol)}&limit=${limit}&apikey=${apiKey}`;
  const fallbackUrl = `https://r.jina.ai/https://query1.finance.yahoo.com/v6/finance/news?symbols=${encodeURIComponent(symbol)}`;

  try {
    const response = await fetch(primaryUrl);
    if (!response.ok) {
      throw new Error(`Equity news failed with status ${response.status}`);
    }
    const payload = await response.json();

    const items = (payload ?? []).map((item) => ({
      id: item.id ?? item.url,
      title: item.title,
      url: item.url,
      source: item.site,
      publishedAt: item.publishedDate,
      formattedTime: item.publishedDate
        ? formatTimestamp(Date.parse(item.publishedDate))
        : "",
    }));

    if (items.length > 0) {
      return items;
    }
  } catch (error) {
    console.warn("Primary equity news feed failed, trying fallback", error);
  }

  try {
    const response = await fetch(fallbackUrl);
    if (!response.ok) {
      throw new Error(`Fallback equity news failed with status ${response.status}`);
    }
    const payload = await response.json();
    const stories = payload?.items?.result ?? [];
    return stories.slice(0, limit).map((item) => ({
      id: item.id ?? item.uuid ?? item.link,
      title: item.title ?? item.summary ?? item.description ?? "News",
      url: item.link,
      source: item.publisher ?? item.provider ?? "",
      publishedAt: item.pubDate ? item.pubDate * 1000 : item.pub_time ? item.pub_time * 1000 : null,
      formattedTime: item.pubDate
        ? formatTimestamp(item.pubDate * 1000)
        : item.pub_time
          ? formatTimestamp(item.pub_time * 1000)
          : "",
    }));
  } catch (error) {
    console.warn("Fallback equity news also failed", error);
  }

  return [];
}

export async function searchCrypto(query, { limit = 8 } = {}) {
  if (!query) return [];
  const url = `${COINGECKO_BASE}/search?query=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Crypto search failed with status ${response.status}`);
  }
  const payload = await response.json();

  return (payload?.coins ?? []).slice(0, limit).map((item) => ({
    id: item.id,
    symbol: item.symbol?.toUpperCase(),
    name: item.name,
    marketCapRank: item.market_cap_rank,
  }));
}

export async function fetchCryptoQuotes(ids) {
  const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
  if (uniqueIds.length === 0) return [];

  const url = `${COINGECKO_BASE}/simple/price?ids=${uniqueIds.join(",")}&vs_currencies=usd&include_24hr_change=true`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Crypto quotes failed with status ${response.status}`);
  }
  const payload = await response.json();

  return uniqueIds
    .map((id) => {
      const entry = payload?.[id];
      if (!entry) return null;
      const price = typeof entry.usd === "number" ? entry.usd : null;
      const changePct = typeof entry.usd_24h_change === "number" ? entry.usd_24h_change : null;
      const change = price != null && changePct != null ? (price * changePct) / 100 : null;

      return {
        id,
        price,
        change,
        changePct,
        currency: "USD",
        lastUpdated: Date.now(),
      };
    })
    .filter(Boolean);
}

export async function fetchCryptoNews(symbol, { limit = 6 } = {}) {
  const url = `${CRYPTO_NEWS_API}?lang=EN&categories=${encodeURIComponent(symbol.toUpperCase())}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Crypto news failed with status ${response.status}`);
  }
  const payload = await response.json();

  return (payload?.Data ?? []).slice(0, limit).map((item) => ({
    id: item.id,
    title: item.title,
    url: item.url,
    source: item.source_info?.name ?? item.source,
    publishedAt: item.published_on ? new Date(item.published_on * 1000).toISOString() : null,
    formattedTime: item.published_on ? formatTimestamp(item.published_on * 1000) : "",
  }));
}

export async function fetchFearGreedIndex() {
  const primaryUrl = "https://r.jina.ai/https://production.dataviz.cnn.io/data/fearandgreed/";
  try {
    const response = await fetch(primaryUrl);
    if (response.ok) {
      const payload = await response.json();
      const score = parseNumber(payload?.fear_and_greed?.score);
      if (score != null) {
        const timestamp = payload?.fear_and_greed?.timestamp
          ? payload.fear_and_greed.timestamp * 1000
          : Date.now();
        const rating = payload?.fear_and_greed?.rating ?? null;
        return {
          score,
          rating,
          timestamp,
          source: "cnn",
        };
      }
    } else {
      console.warn("Primary Fear & Greed feed failed", response.status);
    }
  } catch (error) {
    console.warn("Primary Fear & Greed feed error", error);
  }

  const fallbackUrl = "https://r.jina.ai/https://api.alternative.me/fng/?limit=1&format=json";
  try {
    const fallbackResponse = await fetch(fallbackUrl);
    if (fallbackResponse.ok) {
      const fallbackPayload = await fallbackResponse.json();
      const entry = fallbackPayload?.data?.[0];
      const score = parseNumber(entry?.value);
      if (score != null) {
        const timestamp = entry?.timestamp ? entry.timestamp * 1000 : Date.now();
        const rating = entry?.value_classification ?? null;
        return {
          score,
          rating,
          timestamp,
          source: "alternative",
        };
      }
    } else {
      console.warn("Fear & Greed fallback feed failed", fallbackResponse.status);
    }
  } catch (error) {
    console.warn("Fear & Greed fallback feed error", error);
  }

  return {
    score: 24,
    rating: "Extreme Fear",
    timestamp: Date.now(),
    source: "static",
  };
}
