interface Props {
  onGuest: () => void;
  error?: string | null;
  onClearError?: () => void;
}

export function LoginScreen({ onGuest, error, onClearError }: Props) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 28, background: 'rgba(5,7,12,0.97)',
    }}>
      {/* Decorative rings */}
      <div style={{
        position: 'absolute', width: 400, height: 400, borderRadius: '50%',
        border: '1px solid rgba(200,169,110,0.1)', pointerEvents: 'none',
        boxShadow: '0 0 80px 10px rgba(200,169,110,0.05)',
      }} />
      <div style={{
        position: 'absolute', width: 580, height: 580, borderRadius: '50%',
        border: '1px dashed rgba(200,169,110,0.06)', pointerEvents: 'none',
      }} />

      {/* Title */}
      <div style={{ textAlign: 'center', zIndex: 1 }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 52, letterSpacing: '.32em',
          lineHeight: 1, color: 'var(--gold)', textShadow: '0 0 30px rgba(200,169,110,.5)',
        }}>
          MAGNET ARENA
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '.48em',
          color: 'var(--text-dim)', marginTop: 8,
        }}>
          TACTICAL MAGNETIC COMBAT
        </div>
      </div>

      {/* Divider */}
      <div style={{
        width: 320, height: 1, zIndex: 1,
        background: 'linear-gradient(90deg,transparent,rgba(200,169,110,.45),transparent)',
      }} />

      {/* Auth label */}
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '.44em',
        color: 'var(--text-dim)', zIndex: 1,
      }}>
        AUTHENTICATE COMMANDER
      </div>

      {/* Error message */}
      {error && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '.1em',
          color: 'var(--player-0)', background: 'rgba(255,68,85,.1)',
          border: '1px solid rgba(255,68,85,.3)', padding: '10px 16px',
          borderRadius: 2, maxWidth: 320, zIndex: 1, textAlign: 'center',
          position: 'relative',
        }}>
          {error}
          <button
            onClick={onClearError}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', color: 'var(--player-0)', cursor: 'pointer',
              fontSize: 14, lineHeight: 1, padding: 0,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Auth buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 320, zIndex: 1 }}>
        <OAuthButton
          href="/auth/google"
          label="SIGN IN WITH GOOGLE"
          icon={<GoogleIcon />}
          color="var(--player-0)"
        />
        <OAuthButton
          href="/auth/github"
          label="SIGN IN WITH GITHUB"
          icon={<GitHubIcon />}
          color="var(--player-1)"
        />

        {/* Divider */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0',
        }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(200,169,110,.15)' }} />
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.2em',
            color: 'var(--text-dim)',
          }}>OR</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(200,169,110,.15)' }} />
        </div>

        <button
          onClick={onGuest}
          style={{
            width: '100%', padding: '12px',
            fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '.2em',
            cursor: 'pointer', borderRadius: 2,
            background: 'transparent', border: 'none',
            color: 'var(--text-dim)', transition: 'color .2s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--gold)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-dim)'; }}
        >
          PLAY AS GUEST
        </button>
      </div>
    </div>
  );
}

function OAuthButton({
  href, label, icon, color,
}: {
  href: string; label: string; icon: React.ReactNode; color: string;
}) {
  return (
    <a
      href={href}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        padding: '14px 22px', borderRadius: 2, textDecoration: 'none',
        background: 'rgba(14,20,32,0.98)', border: `1px solid ${color}44`,
        cursor: 'pointer', transition: 'all .25s',
        fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '.18em',
        color: 'var(--text-primary)',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLAnchorElement;
        el.style.borderColor   = `${color}aa`;
        el.style.boxShadow     = `0 0 30px ${color}28`;
        el.style.background    = 'rgba(18,26,42,0.99)';
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLAnchorElement;
        el.style.borderColor = `${color}44`;
        el.style.boxShadow   = 'none';
        el.style.background  = 'rgba(14,20,32,0.98)';
      }}
    >
      {icon}
      {label}
    </a>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}
