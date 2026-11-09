import { describe, expect, it, vi } from 'vitest';
import { menuTemplate } from '../../../src/main/menu';

/** M11 slice 1 (Rev 13, F-108, F-109): the app menu — About MicroLab and Check for Updates… where each computer has
 *  them (the Mac's MicroLab menu; Windows' Help), the View menu's zoom (F-106), the website. */
type Item = { label?: string; role?: string; type?: string; submenu?: Item[]; click?: () => void; accelerator?: string };
const labels = (items: Item[]) => items.map((i) => i.label ?? i.role ?? i.type);

describe('the app menu', () => {
  it('on the Mac: MicroLab ▸ About MicroLab, Check for Updates…; Edit, View with the zoom, Window, Help', () => {
    const send = vi.fn();
    const t = menuTemplate({ mac: true, dev: false, send, website: vi.fn() }) as Item[];
    expect(labels(t)).toEqual(['MicroLab', 'Edit', 'View', 'window', 'help']);
    const app = t[0]!.submenu!;
    expect(labels(app).slice(0, 2)).toEqual(['About MicroLab', 'Check for Updates…']);
    app[0]!.click!();
    expect(send).toHaveBeenLastCalledWith('about');
    app[1]!.click!();
    expect(send).toHaveBeenLastCalledWith('updates');
    expect(labels(t[2]!.submenu!)).toEqual(['resetZoom', 'zoomIn', 'zoomOut', 'separator', 'togglefullscreen']);
  });

  it('on Windows: Help ▸ About MicroLab, Check for Updates…, the website', () => {
    const send = vi.fn();
    const website = vi.fn();
    const t = menuTemplate({ mac: false, dev: false, send, website }) as Item[];
    expect(labels(t)).toEqual(['File', 'Edit', 'View', 'help']);
    const help = t[3]!.submenu!;
    expect(labels(help)).toEqual(['About MicroLab', 'Check for Updates…', 'separator', 'codingspacekh.dev']);
    help[3]!.click!();
    expect(website).toHaveBeenCalledOnce();
  });

  it('while developing: the View menu has Reload and the developer tools too', () => {
    const t = menuTemplate({ mac: true, dev: true, send: vi.fn(), website: vi.fn() }) as Item[];
    expect(labels(t[2]!.submenu!)).toEqual(['reload', 'toggleDevTools', 'separator', 'resetZoom', 'zoomIn', 'zoomOut', 'separator', 'togglefullscreen']);
  });
});
