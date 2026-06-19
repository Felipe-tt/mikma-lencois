export default function ManutencaoPage() {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Site em manutenção — Mikma Lençóis</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #FAF8F5;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem;
          }
          .card {
            max-width: 420px;
            width: 100%;
            text-align: center;
          }
          .icon {
            font-size: 2.5rem;
            margin-bottom: 1.5rem;
          }
          h1 {
            font-size: 1.5rem;
            font-weight: 600;
            color: #1E1208;
            margin-bottom: 0.75rem;
            letter-spacing: -0.02em;
          }
          p {
            font-size: 0.9rem;
            color: #705A48;
            line-height: 1.6;
            margin-bottom: 0.5rem;
          }
          .small {
            font-size: 0.75rem;
            color: #B09C8C;
            margin-top: 2rem;
            padding-top: 1.5rem;
            border-top: 1px solid #E6DFD5;
          }
        `}</style>
      </head>
      <body>
        <div className="card">
          <div className="icon">🔧</div>
          <h1>Site em manutenção</h1>
          <p>Estamos trabalhando para melhorar sua experiência.</p>
          <p>Voltamos em breve!</p>
          <p className="small">
            Seu acesso foi registrado e será liberado assim que a manutenção terminar.
          </p>
        </div>
      </body>
    </html>
  );
}
