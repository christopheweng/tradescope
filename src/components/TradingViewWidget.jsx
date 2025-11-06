// src/components/TradingViewWidget.jsx
import { useEffect, useRef } from "react";

export default function TradingViewWidget({
  symbol = "BTCUSDT",   // 例如 BTCUSDT、ETHUSDT...
  interval = "60",      // K 線週期：60 = 1h, 240 = 4h, D = 日線
  theme = "dark",
}) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef("tv_chart_" + Math.random().toString(36).slice(2));

  useEffect(() => {
    if (!containerRef.current) return;

    // 清空舊內容
    containerRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => {
      if (window.TradingView) {
        // eslint-disable-next-line no-new
        new window.TradingView.widget({
          width: "100%",
          height: 420,
          symbol,               // 例如 "BINANCE:BTCUSDT"
          interval,             // "60" / "240" / "D"
          timezone: "Etc/UTC",
          theme,
          style: "1",
          locale: "en",
          toolbar_bg: "#131722",
          enable_publishing: false,
          hide_top_toolbar: false,
          hide_legend: false,
          container_id: widgetIdRef.current,
        });
      }
    };

    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [symbol, interval, theme]);

  return (
    <div className="tv-wrapper">
      <div id={widgetIdRef.current} ref={containerRef} />
    </div>
  );
}
