export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, after } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getClientIp } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';

// Chamado pelo browser do visitante quando a página /manutencao carrega.
// Por rodar durante um request HTTP ativo (não via event.waitUntil/after),
// tem garantia de completar, Cloud Run não congela instâncias mid-request.
// Ao contrário do middleware (Edge Runtime), aqui temos Node.js e o Admin
// SDK, então a escrita no Firestore é direta via SDK (sem REST autenticado).

type GeoResult = {
  city: string;
  region: string;
  country: string;
  isp: string;
  debugError: string;
};

async function lookupIpGeo(ip: string): Promise<GeoResult> {
  if (
    ip === '0.0.0.0' ||
    ip.startsWith('127.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('10.')
  ) {
    return { city: '', region: '', country: '', isp: '', debugError: 'ip_local' };
  }

  type Attempt = () => Promise<GeoResult | null>;
  const attempts: Attempt[] = [
    // 1. ip-api.com, funciona de cloud, sem chave, 45 req/min grátis
    async () => {
      const res = await fetch(
        `http://ip-api.com/json/${ip}?fields=status,city,regionName,country,org`,
        { signal: AbortSignal.timeout(4000), cache: 'no-store' }
      );
      if (!res.ok) return null;
      const d = await res.json();
      if (d.status !== 'success') return null;
      return {
        city: d.city ?? '',
        region: d.regionName ?? '',
        country: d.country ?? '',
        isp: d.org ?? '',
        debugError: '',
      };
    },
    // 2. freeipapi.com, funciona de cloud, sem chave
    async () => {
      const res = await fetch(`https://freeipapi.com/api/json/${ip}`, {
        signal: AbortSignal.timeout(4000),
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const d = await res.json();
      if (!d.cityName) return null;
      return {
        city: d.cityName ?? '',
        region: d.regionName ?? '',
        country: d.countryName ?? '',
        isp: '',
        debugError: '',
      };
    },
    // 3. ipapi.co, fallback (funciona de IPs residenciais, bloqueia cloud)
    async () => {
      const res = await fetch(`https://ipapi.co/${ip}/json/`, {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'MikmaLencois/1.0' },
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const d = await res.json();
      if (d.error) return null;
      return {
        city: d.city ?? '',
        region: d.region ?? '',
        country: d.country_name ?? '',
        isp: d.org ?? '',
        debugError: '',
      };
    },
  ];

  // Antes era sequencial (tentativa 1 -> espera timeout -> tentativa 2 ->
  // espera timeout -> tentativa 3), o que podia levar até ~13s no pior caso
  // (uma API lenta ou fora do ar segurando a invocação inteira, faturada
  // por tempo de compute). Rodando em paralelo, o pior caso vira o maior
  // timeout individual (5s) em vez da soma de todos.
  const results = await Promise.allSettled(attempts.map((attempt) => attempt()));

  const errors: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value) return r.value;
    if (r.status === 'fulfilled') errors.push(`attempt_${i + 1}_no_data`);
    else errors.push(`attempt_${i + 1}_${r.reason instanceof Error ? r.reason.message.slice(0, 40) : 'err'}`);
  }

  return { city: '', region: '', country: '', isp: '', debugError: errors.join('|') };
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);

  // Rate limit: 3 req/min por IP, o browser chama uma vez ao carregar /manutencao
  if (!await rateLimit(`geo:${ip}`, 3, 60 * 1000)) {
    return NextResponse.json({ ok: true }); // silencioso, não expõe o rate limit
  }

  const docId = ip.replace(/[.:]/g, '_');
  const ref = adminDb.doc(`maintenance_queue/${docId}`);

  // Só atualiza se o documento existe e ainda está pending, evita
  // sobrescrever um geo que já foi resolvido por outra instância.
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ ok: true });
  }

  const data = snap.data();
  if (data?.geoDebug !== 'pending') {
    return NextResponse.json({ ok: true }); // já resolvido
  }

  // Responde ao cliente na hora (ele não faz nada com esse resultado, é só
  // um fetch disparado no carregamento da página) e faz o lookup + escrita
  // depois de a resposta já ter sido enviada. Antes, a invocação inteira
  // ficava faturada (compute) pelo tempo das chamadas às APIs externas de
  // geo, que não afeta em nada a experiência de quem está vendo a tela de
  // manutenção.
  after(async () => {
    const geo = await lookupIpGeo(ip);
    await ref.set(
      {
        geoCity: geo.city,
        geoRegion: geo.region,
        geoCountry: geo.country,
        isp: geo.isp,
        geoDebug: geo.debugError,
      },
      { merge: true }
    );
  });

  return NextResponse.json({ ok: true });
}
