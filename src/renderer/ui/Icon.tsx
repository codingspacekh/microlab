import { FILLED, ICONS } from './icon-data';

/** One of the prototype's icons (design/build.py), 16 px unless `size` says otherwise. */
export function Icon({ name, size = 16 }: { name: string; size?: 12 | 14 | 16 | 18 | 20 | 24 }) {
  return (
    <svg
      className={`ico${FILLED.has(name) ? ' fill' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[name] ?? '' }}
    />
  );
}

/** The MicroLab logo (design/src/partials/logo.html). */
export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="#2563d9" />
      <rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="#fff" strokeWidth="1.8" />
      <path d="M11 8V4.5M17 8V4.5M11 23.5V20M17 23.5V20M8 11H4.5M8 17H4.5M20 11h3.5M20 17h3.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="14" cy="14" r="2.2" fill="#7fe0a8" />
    </svg>
  );
}
