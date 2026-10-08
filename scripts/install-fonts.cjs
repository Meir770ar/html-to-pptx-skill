#!/usr/bin/env node
'use strict';
// Installs (or removes) the bundled open-licence Hebrew fonts for the current user only, no admin rights needed.
// PowerPoint needs the fonts installed to show editable text the way the HTML deck looks.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { FONTS } = require('./deck/themes.cjs');

const SOURCE = path.resolve(__dirname, '../assets/fonts/ttf');
const REGISTRY = 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts';

function target() {
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData/Local'), 'Microsoft/Windows/Fonts');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library/Fonts');
  return path.join(os.homedir(), '.local/share/fonts');
}

// Tells running Windows apps that new fonts exist (no logoff needed for apps started afterwards).
function broadcastWindows(files) {
  const script = `Add-Type -Namespace W -Name F -MemberDefinition '[DllImport("gdi32.dll")] public static extern int AddFontResource(string f); [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h,uint m,UIntPtr w,IntPtr l,uint f,uint t,out UIntPtr r);'
${files.map(f => `[void][W.F]::AddFontResource('${f.replace(/'/g, "''")}')`).join('\n')}
$r=[UIntPtr]::Zero; [void][W.F]::SendMessageTimeout([IntPtr]0xffff,0x1D,[UIntPtr]::Zero,[IntPtr]::Zero,2,1000,[ref]$r)`;
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { stdio: 'pipe' });
}

function main() {
  const args = process.argv.slice(2), uninstall = args.includes('--uninstall'), dry = args.includes('--dry-run');
  const dest = target();
  const plan = Object.entries(FONTS).map(([family, { ttf }]) => ({ from: path.join(SOURCE, ttf), to: path.join(dest, ttf), name: `${family}${/Variable/.test(ttf) ? ' Variable' : ''} (TrueType)` }));
  console.log(`${uninstall ? 'Removing' : 'Installing'} ${plan.length} font file(s) ${uninstall ? 'from' : 'into'} ${dest}`);
  for (const item of plan) console.log(`  ${path.basename(item.to)}`);
  if (dry) { console.log('Dry run: nothing changed.'); return; }
  if (!uninstall) fs.mkdirSync(dest, { recursive: true });
  for (const item of plan) {
    if (uninstall) {
      fs.rmSync(item.to, { force: true });
      if (process.platform === 'win32') { try { execFileSync('reg', ['delete', REGISTRY, '/v', item.name, '/f'], { stdio: 'pipe' }); } catch { /* not registered */ } }
    } else {
      fs.copyFileSync(item.from, item.to);
      if (process.platform === 'win32') execFileSync('reg', ['add', REGISTRY, '/v', item.name, '/t', 'REG_SZ', '/d', item.to, '/f'], { stdio: 'pipe' });
    }
  }
  if (process.platform === 'win32' && !uninstall) broadcastWindows(plan.map(p => p.to));
  else if (process.platform === 'linux') { try { execFileSync('fc-cache', ['-f', dest], { stdio: 'pipe' }); } catch { /* fc-cache is optional */ } }
  console.log(uninstall ? 'Done. Restart PowerPoint to refresh its font list.' : 'Done. Restart PowerPoint (or any open Office app) so it sees the new fonts.');
}

try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
