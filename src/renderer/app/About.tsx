import { useEffect, useState } from 'react';
import type { MicrolabApi } from './api';
import { MICROPYTHON } from './useRun';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';

/**
 * About MicroLab (M11, Rev 13, F-108; screen 33) — the teacher: "add all right 2026 CodingSpaceKH, visit
 * codingspacekh.dev for contribution etc". The icon, the version, what MicroLab is and what is inside it; the
 * copyright; the website, opened in the computer's browser (only that address).
 */
export function About({ api, onClose, actions = [] }: { api: MicrolabApi; onClose: () => void; actions?: { label: string; icon: string; onClick: () => void }[] }) {
  const [python, setPython] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void api.python3.version().then((v) => { if (live) setPython(v); });
    return () => { live = false; };
  }, [api]);
  return (
    <Dialog role="dialog" title="About MicroLab" width={460} onCancel={onClose} hideTitle
      actions={[...actions.map((a) => ({ label: a.label, onClick: a.onClick })), { label: 'Close', primary: true, onClick: onClose }]}>
      <div className="about">
        <AppIcon />
        <h2>MicroLab</h2>
        <div className="ver">Version {api.versions.app}</div>
        <p className="what">Build circuits with a micro:bit, a Raspberry Pi Pico W or an ESP32, write MicroPython and Python 3 — and see them work, on the screen or on the real board.</p>
        <div className="parts">{python ? `Python ${python} · ` : ''}MicroPython {MICROPYTHON}</div>
        <div className="copy">© 2026 CodingSpaceKH. All rights reserved.</div>
        <button type="button" className="site" onClick={() => void api.app.openWebsite()}>
          <Icon name="ext" size={14} /> <span>To contribute, report a problem or share an idea, visit <b>codingspacekh.dev</b></span>
        </button>
      </div>
    </Dialog>
  );
}

/** The app icon (F-107): the top bar's logo, larger. */
function AppIcon() {
  return (
    <svg className="appicon" width="88" height="88" viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="6.3" fill="#2563d9" />
      <rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="#fff" strokeWidth="1.8" />
      <path d="M11 8V4.5M17 8V4.5M11 23.5V20M17 23.5V20M8 11H4.5M8 17H4.5M20 11h3.5M20 17h3.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="14" cy="14" r="2.2" fill="#7fe0a8" />
    </svg>
  );
}
