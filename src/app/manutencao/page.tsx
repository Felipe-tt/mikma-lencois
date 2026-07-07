import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Em breve — Mikma Lençóis',
};

export default async function ManutencaoPage() {
  const s = await getSettings();

  const instagramUrl = s.instagramUrl || null;
  const whatsappUrl =
    s.whatsappUrl ||
    (s.storePhone ? `https://wa.me/${s.storePhone.replace(/\D/g, '')}` : null);

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

      {/* Polling: assim que a manutenção acabar (ou esse IP for liberado
          manualmente pelo painel), sai sozinho de /manutencao de volta pra
          "/" — sem precisar que o visitante dê refresh. Checa a cada 5s;
          silencioso em caso de erro de rede (só tenta de novo no próximo tick). */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function () {
              var checking = false;
              function checkMaintenanceStatus() {
                if (checking) return;
                checking = true;
                fetch('/api/maintenance/status', { cache: 'no-store' })
                  .then(function (res) { return res.json(); })
                  .then(function (data) {
                    if (!data.active || data.released) {
                      window.location.href = '/';
                    }
                  })
                  .catch(function () {})
                  .finally(function () { checking = false; });
              }
              setInterval(checkMaintenanceStatus, 5000);
            })();
          `,
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

        .mnt-contact {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-top: 0.5rem;
        }

        .mnt-contact-hint {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 0.8rem;
          font-weight: 300;
          color: rgba(250,248,245,0.55);
          margin-bottom: 0.9rem;
        }

        .mnt-contact-link {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #FAF8F5;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.18);
          padding: 0.6rem 1rem;
          border-radius: 999px;
          text-decoration: none;
          transition: background 0.2s ease, border-color 0.2s ease;
        }

        .mnt-contact-link:hover {
          background: rgba(255,255,255,0.15);
          border-color: rgba(255,255,255,0.3);
        }

        .mnt-contact-link svg {
          width: 14px;
          height: 14px;
          flex-shrink: 0;
        }

        @media (max-width: 480px) {
          .mnt-content { padding: 1.75rem; }
          .mnt-footer { flex-direction: column; align-items: flex-start; }
          .mnt-city { text-align: left; }
          .mnt-contact { flex-wrap: wrap; }
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

            {(instagramUrl || whatsappUrl) && (
              <>
                <p className="mnt-contact-hint">
                  Enquanto isso, fale com a gente:
                </p>
                <div className="mnt-contact">
                  {instagramUrl && (
                    <a
                      href={instagramUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mnt-contact-link"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="2" y="2" width="20" height="20" rx="5" />
                        <circle cx="12" cy="12" r="4" />
                        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                      </svg>
                      Instagram
                    </a>
                  )}
                  {whatsappUrl && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mnt-contact-link"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.45 1.33 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.5 0 9.96-4.46 9.96-9.96S17.54 2 12.04 2zm5.83 14.14c-.24.68-1.38 1.3-1.9 1.34-.5.05-1.03.24-3.45-.76-2.92-1.21-4.8-4.17-4.94-4.36-.14-.19-1.17-1.56-1.17-2.98 0-1.41.74-2.1 1-2.4.27-.29.58-.36.78-.36.19 0 .39.002.56.01.18.008.42-.07.65.5.24.6.82 2.06.9 2.2.07.15.12.32.02.51-.1.19-.15.31-.3.48-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.29.75 1.24 1.62 2.01 1.11 1 2.05 1.3 2.34 1.45.29.14.46.12.63-.07.17-.19.72-.84.92-1.13.19-.29.38-.24.63-.14.26.09 1.65.78 1.93.92.29.14.48.22.55.34.07.13.07.72-.17 1.4z" />
                      </svg>
                      WhatsApp
                    </a>
                  )}
                </div>
              </>
            )}
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
