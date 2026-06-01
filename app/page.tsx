"use client";

import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { assetUrl } from "@/src/config";

const Editor = lazy(() => import("./Editor"));

const PRELOAD_IMAGES = [
  assetUrl("char1.webp"),
  assetUrl("char2.webp"),
  assetUrl("char3.webp"),
  assetUrl("logo.webp"),
];

function preloadAssets(): Promise<unknown[]> {
  const imageLoads = PRELOAD_IMAGES.map(
    (src) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = src;
      })
  );
  return Promise.all(imageLoads);
}

export default function Home() {
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dots, setDots] = useState("");

  useEffect(() => {
    preloadAssets().then(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (loaded) return;
    const id = setInterval(() => setDots((d) => (d.length >= 3 ? "" : d + ".")), 400);
    return () => clearInterval(id);
  }, [loaded]);

  const handleReady = useCallback(() => setReady(true), []);

  if (ready) {
    return (
      <Suspense
        fallback={
          <div style={landingStyles.container}>
            <p style={{ fontSize: 14, color: "#64748b" }}>Loading editor...</p>
          </div>
        }
      >
        <Editor />
      </Suspense>
    );
  }

  return (
    <div style={landingStyles.container}>
      <h1 style={landingStyles.title}>VIDEOBOX 2.0</h1>
      <p style={landingStyles.subtitle}>Advanced video editor</p>

      {loaded ? (
        <button
          onClick={handleReady}
          style={landingStyles.button}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px) scale(1.02)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 12px 32px rgba(124, 58, 237, 0.55), 0 0 0 1px rgba(255,255,255,0.15) inset";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0) scale(1)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 24px rgba(124, 58, 237, 0.4), 0 0 0 1px rgba(255,255,255,0.1) inset";
          }}
        >
          Open Editor
        </button>
      ) : (
        <p style={landingStyles.loading}>Loading assets{dots}</p>
      )}
    </div>
  );
}

const landingStyles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#0a0a0a",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: 32,
    color: "#e2e8f0",
    fontFamily: "system-ui, sans-serif",
  },
  title: {
    fontSize: 64,
    fontWeight: 800,
    margin: 0,
    color: "#fff",
    letterSpacing: "0.08em",
    background: "linear-gradient(135deg, #ffffff 0%, #a78bfa 50%, #7c3aed 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  },
  subtitle: {
    fontSize: 18,
    color: "#94a3b8",
    margin: 0,
    letterSpacing: "0.04em",
  },
  button: {
    marginTop: 24,
    padding: "16px 48px",
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #ec4899 100%)",
    color: "#ffffff",
    cursor: "pointer",
    boxShadow: "0 8px 24px rgba(124, 58, 237, 0.4), 0 0 0 1px rgba(255,255,255,0.1) inset",
    transition: "transform 150ms ease, box-shadow 150ms ease",
  },
  loading: {
    fontSize: 14,
    color: "#64748b",
    margin: 0,
    marginTop: 24,
  },
};
