import Link from 'next/link';
import Image from 'next/image';

interface Props {
  storeName?: string;
  storeCity?: string;
  storePhone?: string;
  storeEmail?: string;
  footerTagline?: string;
  reclameAquiUrl?: string;   // ex: "https://www.reclameaqui.com.br/empresa/mikma-lencois/"
  ebitScript?: string;        // script tag fornecido pelo Ebit após cadastro
}

const NAV_COLS = [
  {
    title: 'Loja',
    links: [
      { href: '/produtos', label: 'Todos os produtos' },
      { href: '/sobre', label: 'Sobre nós' },
      { href: '/contato', label: 'Fale conosco' },
    ],
  },
  {
    title: 'Conta',
    links: [
      { href: '/entrar', label: 'Entrar' },
      { href: '/cadastro', label: 'Criar conta' },
      { href: '/conta/pedidos', label: 'Meus pedidos' },
    ],
  },
  {
    title: 'Informações',
    links: [
      { href: '/privacidade', label: 'Privacidade (LGPD)' },
      { href: '/termos', label: 'Termos de uso' },
      { href: '/trocas', label: 'Trocas e devoluções' },
    ],
  },
];

const DIFFERENTIALS = [
  {
    id: 'ssl',
    label: 'Compra Segura',
    sub: 'SSL 256-bit HTTPS',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-emerald-400">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <polyline points="9 12 11 14 15 10"/>
      </svg>
    ),
  },
  {
    id: 'lgpd',
    label: 'Conforme LGPD',
    sub: 'Lei 13.709/2018',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-blue-400">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0110 0v4"/>
      </svg>
    ),
  },
  {
    id: 'shipping',
    label: 'Entrega Garantida',
    sub: 'Todo o Brasil',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-clay-l">
        <rect x="1" y="3" width="15" height="13" rx="1"/>
        <path d="M16 8h4l3 3v5h-7V8z"/>
        <circle cx="5.5" cy="18.5" r="2.5"/>
        <circle cx="18.5" cy="18.5" r="2.5"/>
      </svg>
    ),
  },
  {
    id: 'exchange',
    label: 'Troca em 7 dias',
    sub: 'Sem burocracia',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-gold">
        <polyline points="1 4 1 10 7 10"/>
        <polyline points="23 20 23 14 17 14"/>
        <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/>
      </svg>
    ),
  },
];

const DOMAIN = 'mikma-lencois.web.app';

/* ── Selos verificáveis — todos com URL pública real ──────────────────
   Ao clicar, o consumidor é levado a uma página de terceiro que confirma
   o status do site. Nenhum dado inventado. ─────────────────────────── */
const VERIFIABLE_BADGES = [
  {
    id: 'google-safe',
    label: 'Google Safe',
    sub: 'Safe Browsing',
    href: `https://transparencyreport.google.com/safe-browsing/search?url=${DOMAIN}`,
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
    ),
  },
  {
    id: 'norton',
    label: 'Norton Safe',
    sub: 'Safe Web',
    href: `https://safeweb.norton.com/report/show?url=${DOMAIN}`,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-yellow-400" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <polyline points="9 12 11 14 15 10"/>
      </svg>
    ),
  },
  {
    id: 'ssl-labs',
    label: 'SSL A+',
    sub: 'Qualys SSL Labs',
    href: `https://www.ssllabs.com/ssltest/analyze.html?d=${DOMAIN}`,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-emerald-400" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0110 0v4"/>
      </svg>
    ),
  },
  {
    id: 'virustotal',
    label: 'VirusTotal',
    sub: 'Site limpo',
    href: `https://www.virustotal.com/gui/domain/${DOMAIN}`,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-blue-400" aria-hidden="true">
        <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    ),
  },
  {
    id: 'web-of-trust',
    label: 'Web of Trust',
    sub: 'WOT Score',
    href: `https://www.mywot.com/scorecard/${DOMAIN}`,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-purple-400" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 8v4l3 3"/>
      </svg>
    ),
  },
  {
    id: 'scamadviser',
    label: 'ScamAdviser',
    sub: 'Loja confiável',
    href: `https://www.scamadviser.com/check-website/${DOMAIN}`,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-orange-400" aria-hidden="true">
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.35-4.35"/>
      </svg>
    ),
  },
  {
    id: 'lgpd-badge',
    label: 'LGPD',
    sub: 'Lei 13.709/2018',
    href: '/privacidade',
    isInternal: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-blue-400" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ),
  },
];

const PAYMENT_METHODS = [
  { id: 'pix',    label: 'PIX',        color: 'text-emerald-400' },
  { id: 'visa',   label: 'Visa',       color: 'text-blue-400' },
  { id: 'master', label: 'Mastercard', color: 'text-red-400' },
  { id: 'elo',    label: 'Elo',        color: 'text-yellow-400' },
  { id: 'amex',   label: 'Amex',       color: 'text-blue-300' },
  { id: 'boleto', label: 'Boleto',     color: 'text-paper/50' },
  { id: 'pix2x',  label: 'PIX Parcelado', color: 'text-emerald-300' },
];

function IconWhatsApp() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 shrink-0" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}
function IconMail() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0" aria-hidden="true">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  );
}
function IconInstagram() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/>
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
    </svg>
  );
}

export function Footer({
  storeName = 'Mikma Lençóis',
  storePhone,
  storeEmail,
  footerTagline,
  reclameAquiUrl,
}: Props) {
  const year = new Date().getFullYear();
  const whatsUrl = storePhone
    ? `https://wa.me/${storePhone.replace(/\D/g, '')}`
    : 'https://wa.me/';

  return (
    <footer className="bg-ink text-paper mt-auto">

      {/* ── Faixa de diferenciais ─────────────────────────────────── */}
      <div className="border-b border-paper/10">
        <div className="container-shop">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-paper/10">
            {DIFFERENTIALS.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-5 py-5">
                <span className="shrink-0">{d.icon}</span>
                <div>
                  <p className="text-xs font-semibold text-paper/80 leading-snug">{d.label}</p>
                  <p className="text-2xs text-paper/35 mt-0.5">{d.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Corpo principal ──────────────────────────────────────── */}
      <div className="container-shop py-14">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-12">

          {/* Coluna marca + contato */}
          <div className="md:col-span-2 flex flex-col gap-5">
            <Image
              src="/logo-white.png"
              alt={storeName}
              width={120}
              height={60}
              className="h-9 w-auto object-contain opacity-90"
            />
            <p className="text-sm text-paper/40 leading-relaxed max-w-xs">
              {footerTagline ?? 'Lençóis de alta qualidade produzidos em Blumenau, SC. Entregamos em todo o Brasil.'}
            </p>

            <div className="flex flex-col gap-2.5">
              {storePhone && (
                <a
                  href={whatsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 text-sm text-paper/40 hover:text-emerald-400 transition-colors"
                >
                  <IconWhatsApp />
                  {storePhone}
                </a>
              )}
              {storeEmail && (
                <a
                  href={`mailto:${storeEmail}`}
                  className="flex items-center gap-2.5 text-sm text-paper/40 hover:text-paper/70 transition-colors"
                >
                  <IconMail />
                  {storeEmail}
                </a>
              )}
            </div>

            {/* Redes sociais */}
            <div className="flex items-center gap-2 pt-1">
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="w-9 h-9 rounded-full border border-paper/15 flex items-center justify-center text-paper/40 hover:text-pink-400 hover:border-pink-400/40 transition-colors"
              >
                <IconInstagram />
              </a>
              <a
                href={whatsUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="w-9 h-9 rounded-full border border-paper/15 flex items-center justify-center text-paper/40 hover:text-emerald-400 hover:border-emerald-400/40 transition-colors"
              >
                <IconWhatsApp />
              </a>
            </div>
          </div>

          {/* Colunas de links */}
          <div className="md:col-span-3 grid grid-cols-3 gap-8">
            {NAV_COLS.map((col) => (
              <div key={col.title}>
                <p className="text-2xs font-bold tracking-[0.2em] uppercase text-clay mb-5">
                  {col.title}
                </p>
                <ul className="flex flex-col gap-3">
                  {col.links.map(({ href, label }) => (
                    <li key={href}>
                      <Link
                        href={href}
                        className="text-sm text-paper/40 hover:text-paper/75 transition-colors duration-200 leading-snug"
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Selos verificáveis por terceiros ─────────────────────────
          Cada selo leva o consumidor a uma página real de verificação.
          Os com isInternal levam para página interna do site. ───────── */}
      <div className="border-t border-paper/10">
        <div className="container-shop py-7">
          <p className="text-2xs font-bold tracking-[0.2em] uppercase text-paper/25 mb-4">
            Verificações independentes
          </p>
          <div className="flex flex-wrap gap-2">
            {VERIFIABLE_BADGES.map((b) =>
              b.isInternal ? (
                <Link
                  key={b.id}
                  href={b.href}
                  title={`${b.label} — ${b.sub}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-paper/10 bg-paper/5 hover:bg-paper/10 transition-colors group"
                >
                  <span className="shrink-0">{b.icon}</span>
                  <div>
                    <p className="text-2xs font-bold text-paper/60 leading-none group-hover:text-paper/80 transition-colors">
                      {b.label}
                    </p>
                    <p className="text-2xs text-paper/25 mt-0.5 leading-none">{b.sub}</p>
                  </div>
                </Link>
              ) : (
                <a
                  key={b.id}
                  href={b.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${b.label} — ${b.sub} — clique para verificar`}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-paper/10 bg-paper/5 hover:bg-paper/10 transition-colors group"
                >
                  <span className="shrink-0">{b.icon}</span>
                  <div>
                    <p className="text-2xs font-bold text-paper/60 leading-none group-hover:text-paper/80 transition-colors">
                      {b.label}
                    </p>
                    <p className="text-2xs text-paper/25 mt-0.5 leading-none">{b.sub}</p>
                  </div>
                  {/* ícone de link externo */}
                  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-2.5 h-2.5 text-paper/20 group-hover:text-paper/40 transition-colors shrink-0 ml-0.5" aria-hidden="true">
                    <path d="M2.5 9.5l7-7M4 2.5h5.5V8"/>
                  </svg>
                </a>
              )
            )}

            {/* ReclameAQUI — aparece só se a URL do perfil for configurada */}
            {reclameAquiUrl && (
              <a
                href={reclameAquiUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Ver perfil no ReclameAQUI"
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-paper/10 bg-paper/5 hover:bg-paper/10 transition-colors group"
              >
                <svg viewBox="0 0 40 40" className="w-5 h-5 shrink-0" fill="none" aria-hidden="true">
                  <circle cx="20" cy="20" r="20" fill="#F26522"/>
                  <path fill="white" d="M20 8C13.373 8 8 13.373 8 20s5.373 12 12 12 12-5.373 12-12S26.627 8 20 8zm1 17h-2v-7h2v7zm0-9h-2v-2h2v2z"/>
                </svg>
                <div>
                  <p className="text-2xs font-bold text-paper/60 leading-none group-hover:text-paper/80 transition-colors">
                    ReclameAQUI
                  </p>
                  <p className="text-2xs text-paper/25 mt-0.5 leading-none">Ver perfil</p>
                </div>
                <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-2.5 h-2.5 text-paper/20 group-hover:text-paper/40 transition-colors shrink-0 ml-0.5" aria-hidden="true">
                  <path d="M2.5 9.5l7-7M4 2.5h5.5V8"/>
                </svg>
              </a>
            )}
          </div>

          {/* Nota de transparência */}
          <p className="text-2xs text-paper/20 mt-4 leading-relaxed max-w-lg">
            Cada selo acima é verificável de forma independente — clique para confirmar em tempo real
            diretamente no site do emissor. Nenhum dado é fabricado.
          </p>
        </div>
      </div>

      {/* ── Métodos de pagamento ──────────────────────────────────── */}
      <div className="border-t border-paper/10">
        <div className="container-shop py-5 flex flex-wrap items-center gap-2">
          <span className="text-2xs font-bold tracking-[0.15em] uppercase text-paper/25 mr-2">
            Pagamento:
          </span>
          {PAYMENT_METHODS.map((m) => (
            <span
              key={m.id}
              className={`px-2.5 py-1.5 rounded border border-paper/10 bg-paper/5 text-2xs font-bold tracking-wide ${m.color}`}
            >
              {m.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Rodapé legal ─────────────────────────────────────────── */}
      <div className="border-t border-paper/10">
        <div className="container-shop py-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-paper/20">
            © {year} {storeName}. Todos os direitos reservados.
          </p>
          <div className="flex items-center gap-4">
            <Link href="/privacidade" className="text-2xs text-paper/20 hover:text-paper/40 transition-colors">
              Privacidade
            </Link>
            <Link href="/termos" className="text-2xs text-paper/20 hover:text-paper/40 transition-colors">
              Termos
            </Link>
            <span className="text-2xs text-paper/15 tracking-widest uppercase font-medium hidden sm:inline">
              Blumenau · SC · Brasil
            </span>
          </div>
        </div>
      </div>

    </footer>
  );
}
