import { execFileSync } from 'node:child_process';

/** N-05 (M11.5): the memory MicroLab holds — every process it started (Electron's own, MicroPython's worker in the
 *  window, Python 3, Jedi) — as the computer's own monitor shows it, in MB: on a Mac, Activity Monitor's Memory
 *  (`top`'s MEM, the physical footprint); on Windows, each process's private memory (Win32_Process.PrivatePageCount,
 *  close to Task Manager's Memory). Summing resident memory instead would count Electron's shared framework once in
 *  every process (510 MB for a 40-part run that Activity Monitor shows far lower). */
export function treeMemoryMB(rootPid: number): { mb: number; processes: number } {
  const rows: { pid: number; ppid: number; bytes: number }[] = [];
  if (process.platform === 'win32') {
    const json = execFileSync('powershell.exe', ['-NoProfile', '-Command',
      'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,PrivatePageCount | ConvertTo-Json -Compress'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    for (const p of JSON.parse(json) as { ProcessId: number; ParentProcessId: number; PrivatePageCount: number }[]) {
      rows.push({ pid: p.ProcessId, ppid: p.ParentProcessId, bytes: Number(p.PrivatePageCount) });
    }
  } else if (process.platform === 'darwin') {
    for (const line of execFileSync('top', ['-l', '1', '-stats', 'pid,ppid,mem'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n')) {
      const m = /^\s*(\d+)\s+(\d+)\s+([\d.]+)([BKMG])[+-]?\s*$/.exec(line);
      if (m) rows.push({ pid: Number(m[1]), ppid: Number(m[2]), bytes: Number(m[3]) * { B: 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 }[m[4] as 'B'] });
    }
  } else {
    for (const line of execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss='], { encoding: 'utf8' }).trim().split('\n')) {
      const [pid, ppid, kb] = line.trim().split(/\s+/).map(Number);
      rows.push({ pid: pid!, ppid: ppid!, bytes: kb! * 1024 });
    }
  }
  const tree = new Set([rootPid]);
  for (let grew = true; grew;) {
    grew = false;
    for (const r of rows) if (tree.has(r.ppid) && !tree.has(r.pid)) { tree.add(r.pid); grew = true; }
  }
  const bytes = rows.filter((r) => tree.has(r.pid)).reduce((s, r) => s + r.bytes, 0);
  return { mb: Math.round(bytes / 1024 ** 2), processes: tree.size };
}
