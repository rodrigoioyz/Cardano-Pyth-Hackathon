import Wallet from "../components/Wallet";
import Chart from "../components/Chart";
import NFTCard from "../components/NFTCard";
import { subscribe, getPrice } from "../services/pythService";
import { useState, useEffect } from "react";

const ff =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', sans-serif";

export default function Dashboard() {
  const [price, setPrice] = useState(getPrice());
  const [priceDir, setPriceDir] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    const unsub = subscribe((newPrice) => {
      setPrice((prev) => {
        setPriceDir(newPrice >= prev ? "up" : "down");
        setTimeout(() => setPriceDir(null), 600);
        return newPrice;
      });
    });
    return unsub;
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#000",
        color: "#f5f5f7",
        fontFamily: ff,
        overflowX: "hidden",
      }}
    >
      {/* Ambient glow */}
      <div
        style={{
          position: "fixed",
          top: "15%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 700,
          height: 700,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(0,113,227,0.07) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Navbar */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 32px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(0,0,0,0.72)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "linear-gradient(135deg, #0071e3, #30d158)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 700,
              color: "#fff",
            }}
          >
            ₳
          </div>
          <span
            style={{
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: "-0.3px",
              color: "#f5f5f7",
            }}
          >
            Cardano Pyth
          </span>
        </div>

        <Wallet />
      </nav>

      {/* Main */}
      <main
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: "48px 24px 80px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Hero precio */}
        <section style={{ textAlign: "center", marginBottom: 52 }}>
          <p
            style={{
              fontSize: 12,
              color: "#98989d",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 12,
              fontWeight: 500,
            }}
          >
            Live ADA Price
          </p>

          <h1
            style={{
              fontSize: 80,
              fontWeight: 700,
              letterSpacing: "-4px",
              lineHeight: 1,
              color:
                priceDir === "up"
                  ? "#30d158"
                  : priceDir === "down"
                    ? "#ff453a"
                    : "#f5f5f7",
              marginBottom: 16,
              transition: "color 0.4s ease",
              fontFamily: ff,
              background: "none",
              WebkitTextFillColor: "unset",
            }}
          >
            ${price.toFixed(4)}
          </h1>

          {/* Indicador de dirección */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginBottom: 12,
            }}
          >
            {priceDir && (
              <span
                style={{
                  fontSize: 18,
                  color: priceDir === "up" ? "#30d158" : "#ff453a",
                  transition: "opacity 0.3s",
                }}
              >
                {priceDir === "up" ? "▲" : "▼"}
              </span>
            )}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(48,209,88,0.12)",
                border: "1px solid rgba(48,209,88,0.25)",
                borderRadius: 980,
                padding: "5px 14px",
                fontSize: 13,
                color: "#30d158",
                fontWeight: 500,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#30d158",
                  display: "inline-block",
                  boxShadow: "0 0 6px #30d158",
                  animation: "pulse 2s ease-in-out infinite",
                }}
              />
              Live · Pyth Network
            </span>
          </div>
        </section>

        {/* Chart card */}
        <section
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 20,
            padding: "24px",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 20,
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: 17,
                  fontWeight: 600,
                  color: "#f5f5f7",
                  letterSpacing: "-0.2px",
                }}
              >
                Price History
              </h2>
              <p style={{ fontSize: 12, color: "#98989d", marginTop: 3 }}>
                ADA / USD · Live
              </p>
            </div>

            <div
              style={{
                background: "rgba(0,113,227,0.12)",
                border: "1px solid rgba(0,113,227,0.25)",
                borderRadius: 980,
                padding: "4px 12px",
                fontSize: 12,
                color: "#0071e3",
                fontWeight: 500,
              }}
            >
              Lightweight Charts
            </div>
          </div>

          <Chart />
        </section>

        {/* Open Positions */}
        <section>
          <p
            style={{
              fontSize: 11,
              color: "#98989d",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontWeight: 600,
              marginBottom: 14,
            }}
          >
            Open Positions
          </p>

          <NFTCard entryPrice={0.26} currentPrice={price} amount={100} />
        </section>
      </main>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
