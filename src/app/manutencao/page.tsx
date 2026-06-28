export const metadata = {
  title: 'Site em manutenção — Mikma Lençóis',
};

export default function ManutencaoPage() {
  return (
    <div className="theme-locked" style={{
      fontFamily: "Georgia, 'Times New Roman', serif",
      background: '#FAF8F5',
      minHeight: '100vh',
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
    }}>
      <style>{`
        .mnt-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          max-width: 360px;
          width: 100%;
        }
        .mnt-logo {
          font-family: Georgia, serif;
          font-size: 0.68rem;
          font-weight: normal;
          letter-spacing: 0.35em;
          text-transform: uppercase;
          color: #B09C8C;
          margin-bottom: 3.5rem;
        }
        .mnt-icon {
          width: 56px;
          height: 56px;
          border: 1px solid #D4C5B5;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 2rem;
          color: #705A48;
        }
        .mnt-h1 {
          font-family: Georgia, serif;
          font-size: 1.75rem;
          font-weight: normal;
          color: #1E1208;
          letter-spacing: -0.02em;
          margin-bottom: 1rem;
          line-height: 1.2;
        }
        .mnt-sub {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 0.875rem;
          color: #705A48;
          line-height: 1.65;
          margin-bottom: 2.5rem;
          font-weight: 300;
        }
        .mnt-divider {
          width: 28px;
          height: 1px;
          background: #D4C5B5;
          margin: 0 auto 2.5rem;
        }
        .mnt-note {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 0.7rem;
          letter-spacing: 0.04em;
          color: #B09C8C;
          line-height: 1.75;
          font-weight: 300;
        }
      `}</style>

      <div className="mnt-wrap">
        <p className="mnt-logo">Mikma Lençóis</p>

        <div className="mnt-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
          </svg>
        </div>

        <h1 className="mnt-h1">Em manutenção</h1>
        <p className="mnt-sub">
          Estamos trabalhando para melhorar<br />
          sua experiência. Voltamos em breve.
        </p>

        <div className="mnt-divider" />

        <p className="mnt-note">
          Seu acesso foi registrado e será<br />
          liberado assim que terminarmos.
        </p>
      </div>
    </div>
  );
}
