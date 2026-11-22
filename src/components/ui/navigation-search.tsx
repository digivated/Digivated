import { LiquefyProvider } from '@/lib/provider';
import { LiquidButton } from './liquid-button';

export function NavigationSearch() {
  return (
    <LiquefyProvider theme="light" intensity={0.72} refraction={0.65} wobbliness={0.05} webgl={false}>
      <LiquidButton className="dg-shell-icon dg-glass-search" size="sm" data-open-search="" aria-label="Search Digivated">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
      </LiquidButton>
    </LiquefyProvider>
  );
}
