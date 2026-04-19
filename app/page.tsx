"use client";

import Link from "next/link";
import { Backdrop } from "@/components/scenery/Scenery";
import { BRAND } from "@/components/shared/constants";

export default function Home() {
  return (
    <div className="app-stage" data-time="day" data-intensity="normal">
      <Backdrop />

      <Link href="/career" className="career-nav-btn" aria-label="View your career">
        <span className="career-nav-icon" aria-hidden="true">◎</span>
        <span className="career-nav-label">Career</span>
      </Link>

      <div className="home-wrap">
        <div className="home-hero">
          <div className="home-eyebrow mono">{BRAND.event}</div>
          <h1 className="home-title">{BRAND.gameName}</h1>
          <p className="home-sub">
            Move your body. Match the pose. Outlast the crew.
          </p>
        </div>

        <div className="home-actions">
          <Link href="/create" className="home-cta primary">
            <span className="cta-icon">◉</span>
            <span>
              <strong>Host a room</strong>
              <span className="cta-sub">Create a code, invite your crew</span>
            </span>
          </Link>
          <Link href="/join" className="home-cta ghost">
            <span className="cta-icon">→</span>
            <span>
              <strong>Join a room</strong>
              <span className="cta-sub">Enter a four-letter word</span>
            </span>
          </Link>
        </div>

        <div className="home-badge mono">webcam · no controller · just you</div>
      </div>

      <style>{`
        .home-wrap {
          position: relative;
          z-index: 10;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100dvh;
          gap: 40px;
          padding: 40px 20px;
        }
        .home-hero {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .home-eyebrow {
          font-size: 12px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ink-soft);
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          padding: 6px 14px;
          border-radius: 999px;
        }
        .home-title {
          font-family: var(--font-shrikhand), serif;
          font-size: clamp(64px, 12vw, 120px);
          color: var(--ink);
          margin: 0;
          text-shadow: 0 6px 0 rgba(58,46,76,0.18);
          line-height: 1;
          letter-spacing: -0.02em;
        }
        .home-sub {
          font-size: 18px;
          color: var(--ink-soft);
          margin: 0;
          max-width: 360px;
          line-height: 1.5;
        }
        .home-actions {
          display: flex;
          flex-direction: column;
          gap: 14px;
          width: 100%;
          max-width: 400px;
        }
        .home-cta {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 20px 24px;
          border-radius: var(--radius);
          text-decoration: none;
          font-weight: 600;
          font-size: 16px;
          color: var(--ink);
          transition: transform 0.15s ease, box-shadow 0.15s ease;
          cursor: pointer;
        }
        .home-cta.primary {
          background: var(--sun);
          box-shadow: var(--shadow-chunky);
          color: white;
        }
        .home-cta.ghost {
          background: var(--card-bg);
          border: 1.5px solid var(--card-border);
          box-shadow: var(--shadow-soft);
        }
        .home-cta:hover { transform: translateY(-2px); }
        .home-cta:active { transform: translateY(1px); }
        .home-cta > span:last-child {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .cta-icon {
          font-size: 22px;
          flex-shrink: 0;
          width: 32px;
          text-align: center;
        }
        .cta-sub {
          font-size: 13px;
          font-weight: 400;
          opacity: 0.75;
        }
        .career-nav-btn {
          position: fixed;
          top: 24px;
          right: 24px;
          z-index: 20;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 11px 20px 11px 16px;
          background: var(--card-bg);
          border: 1.5px solid var(--card-border);
          border-radius: 999px;
          box-shadow: var(--shadow-chunky);
          color: var(--ink);
          font-family: var(--font-outfit), system-ui, sans-serif;
          font-weight: 600;
          font-size: 14px;
          letter-spacing: 0.02em;
          text-decoration: none;
          cursor: pointer;
          backdrop-filter: blur(6px);
          transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
        }
        .career-nav-btn:hover {
          transform: translateY(-2px);
          border-color: var(--sun);
          box-shadow: 0 14px 28px rgba(58, 46, 76, 0.18);
        }
        .career-nav-btn:active {
          transform: translateY(0);
        }
        .career-nav-icon {
          font-size: 18px;
          color: var(--sun);
          line-height: 1;
        }
        @media (max-width: 520px) {
          .career-nav-btn {
            top: 16px;
            right: 16px;
            padding: 9px 16px 9px 14px;
            font-size: 13px;
          }
        }
        .home-badge {
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ink-soft);
          opacity: 0.75;
        }
      `}</style>
    </div>
  );
}
