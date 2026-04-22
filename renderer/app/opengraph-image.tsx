import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'ELM APP — Logiciel de caisse et gestion pour les PME';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '80px',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
        }}
      >
        {/* Accent circle */}
        <div style={{
          position: 'absolute', top: -80, right: -80,
          width: 400, height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.3) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', bottom: -60, left: 200,
          width: 300, height: 300,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
        }} />

        {/* Badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(99,102,241,0.15)',
          border: '1px solid rgba(99,102,241,0.4)',
          borderRadius: 100, padding: '6px 16px',
          marginBottom: 32,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#818cf8' }} />
          <span style={{ color: '#a5b4fc', fontSize: 16, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Essai gratuit 7 jours
          </span>
        </div>

        {/* Title */}
        <div style={{ color: '#ffffff', fontSize: 64, fontWeight: 900, lineHeight: 1.1, marginBottom: 24, maxWidth: 800 }}>
          Gérez votre business sans vous compliquer la vie
        </div>

        {/* Subtitle */}
        <div style={{ color: '#94a3b8', fontSize: 26, lineHeight: 1.5, marginBottom: 48, maxWidth: 700 }}>
          Caisse · Stock · Comptabilité · Livraisons · CRM
        </div>

        {/* Pills */}
        <div style={{ display: 'flex', gap: 12 }}>
          {['Restaurant', 'Retail', 'Hôtel', 'Services'].map((s) => (
            <div key={s} style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8, padding: '8px 18px',
              color: '#cbd5e1', fontSize: 18, fontWeight: 600,
            }}>{s}</div>
          ))}
        </div>

        {/* URL */}
        <div style={{
          position: 'absolute', bottom: 48, right: 80,
          color: '#475569', fontSize: 20, fontWeight: 600,
        }}>
          www.elm-app.click
        </div>
      </div>
    ),
    { ...size }
  );
}
