import { useEffect } from 'react';
import { DojoWalletButton } from './DojoWalletButton';
import PixelTrail from './PixelTrail';
import logo from '../assets/icons/android-chrome-192x192.png';
import './Layout.css';

interface LayoutProps {
  title?: string;
  subtitle?: string;
  variant?: 'light' | 'dark';
  mainClassName?: string;
  children: React.ReactNode;
}

export function Layout({ title, subtitle, variant = 'light', mainClassName, children }: LayoutProps) {
  const resolvedTitle = title || 'Contagion';
  const resolvedSubtitle = subtitle || 'Trust No One — Social deduction on Starknet';

  // Apply theme to document for body/root-level dark styles
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', variant);
    return () => document.documentElement.removeAttribute('data-theme');
  }, [variant]);

  return (
    <div className="layout-root">
      <div className="layout-pixel-trail">
        <PixelTrail
          gridSize={60}
          trailSize={0.1}
          maxAge={250}
          interpolate={2}
          color="#88e888"
          gooeyFilter={{ id: 'custom-goo-filter', strength: 2 }}
          useGlobalMouse
        />
      </div>

      <div className="layout-content max-w-7xl mx-auto">
        <header className="flex justify-between items-center py-4">
          <div className="">
            <div className="brand-row">
              <img src={logo} alt="" className="brand-logo" width={48} height={48} aria-hidden />
              <div>
                <div className="text-2xl font-bold">{resolvedTitle}</div>
                <p className="text-sm brand-subtitle">{resolvedSubtitle}</p>
              </div>
            </div>
          </div>
          <div className="header-actions">
            <div className="network-pill">Testnet</div>
            <DojoWalletButton />
          </div>
        </header>

        <main className={mainClassName ?? 'studio-main'}>{children}</main>

        <footer className="studio-footer">
          <span>Built on Starknet</span>
        </footer>
      </div>
    </div>
  );
}
