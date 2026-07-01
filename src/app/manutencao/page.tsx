export const metadata = {
  title: 'Em breve — Mikma Lençóis',
};

export default function ManutencaoPage() {
  return (
    <>
      {/* Dispara o geo lookup assim que a página carrega.
          Roda durante um request HTTP ativo → Cloud Run não congela a instância.
          É isso que garante que o geo deixe de ficar "pending" no painel. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `fetch('/api/maintenance/geo').catch(function(){});`,
        }}
      />
      <style>{`
        .mnt-page {
          min-height: 100vh;
          width: 100%;
          background: #1E1208;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
        }

        .mnt-bg {
          position: absolute;
          inset: 0;
          background-image: url('/hero-bg.jpg');
          background-size: cover;
          background-position: center;
          opacity: 0.18;
        }

        .mnt-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            to bottom,
            rgba(30,18,8,0.3) 0%,
            rgba(30,18,8,0.1) 40%,
            rgba(30,18,8,0.7) 100%
          );
        }

        .mnt-content {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          padding: 2.5rem;
        }

        .mnt-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .mnt-logo {
          height: 28px;
          width: auto;
          filter: brightness(0) invert(1);
          opacity: 0.9;
        }

        .mnt-badge {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 0.6rem;
          font-weight: 600;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.45);
          border: 1px solid rgba(255,255,255,0.15);
          padding: 0.35rem 0.75rem;
        }

        .mnt-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding-bottom: 1rem;
        }

        .mnt-label {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: #C4714A;
          margin-bottom: 1.5rem;
        }

        .mnt-title {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: clamp(3rem, 10vw, 7rem);
          font-weight: normal;
          color: #FAF8F5;
          line-height: 0.95;
          letter-spacing: -0.02em;
          margin-bottom: 2rem;
        }

        .mnt-title em {
          font-style: italic;
          color: rgba(250,248,245,0.45);
        }

        .mnt-footer {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 2rem;
          flex-wrap: wrap;
          padding-top: 2rem;
          border-top: 1px solid rgba(255,255,255,0.1);
          margin-top: 1rem;
        }

        .mnt-desc {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 0.85rem;
          color: rgba(250,248,245,0.5);
          line-height: 1.65;
          max-width: 28ch;
          font-weight: 300;
        }

        .mnt-city {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 0.65rem;
          font-weight: 400;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.25);
          text-align: right;
          white-space: nowrap;
        }

        @media (max-width: 480px) {
          .mnt-content { padding: 1.75rem; }
          .mnt-footer { flex-direction: column; align-items: flex-start; }
          .mnt-city { text-align: left; }
        }
      `}</style>

      <div className="mnt-page">
        <div className="mnt-bg" />
        <div className="mnt-overlay" />

        <div className="mnt-content">
          <header className="mnt-header">
            <img src="/logo-white.png" alt="Mikma Lençóis" className="mnt-logo" />
            <span className="mnt-badge">Manutenção</span>
          </header>

          <main className="mnt-main">
            <p className="mnt-label">Em breve de volta</p>
            <h1 className="mnt-title">
              Voltamos<br />
              <em>em breve.</em>
            </h1>
          </main>

          <footer className="mnt-footer">
            <p className="mnt-desc">
              Estamos melhorando sua experiência.<br />
              Voltamos em instantes.
            </p>
            <p className="mnt-city">
              Blumenau, SC<br />
              Mikma Lençóis
            </p>
          </footer>
        </div>
      </div>
    </>
  );
}
