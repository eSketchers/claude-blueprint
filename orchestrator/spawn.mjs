// spawn.mjs — launch a headless Claude Code session to execute /ticket.
// Command is a template configurable in config/orchestrator.json so teams
// can swap in `claude -p`, custom wrappers, etc.

import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';

function expand(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

/**
 * @param {{ticket_id:string, ticket_url:string, repo_path:string, title:string}} ticket
 * @param {{command:string, args:string[], cwd?:string, env?:Record<string,string>, dry_run?:boolean}} spec
 * @param {string} logDir
 */
export function spawnTicketAgent(ticket, spec, logDir) {
  const vars = {
    ticket_url: ticket.ticket_url,
    ticket_id:  ticket.ticket_id,
    repo_path:  ticket.repo_path || process.cwd(),
    title:      ticket.title || '',
  };

  const cmd  = expand(spec.command, vars);
  const args = (spec.args || []).map(a => expand(a, vars));
  const cwd  = spec.cwd ? expand(spec.cwd, vars) : vars.repo_path;
  const env  = { ...process.env, ...(spec.env || {}) };

  if (spec.dry_run) {
    const line = `DRY-RUN would spawn: ${cmd} ${args.map(a => `'${a}'`).join(' ')} (cwd=${cwd})`;
    console.log(`[spawn] ${line}`);
    return { pid: null, logFile: null, dry_run: true, command: line };
  }

  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  const logFile = join(logDir, `${ticket.ticket_id.replace(/[^a-zA-Z0-9._-]/g, '_')}.log`);
  const out = createWriteStream(logFile, { flags: 'a' });
  out.write(`\n===== spawn @ ${new Date().toISOString()} =====\n`);
  out.write(`cmd: ${cmd} ${args.join(' ')}\ncwd: ${cwd}\n\n`);

  const child = nodeSpawn(cmd, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  child.unref();

  return { pid: child.pid, logFile, dry_run: false, command: `${cmd} ${args.join(' ')}` };
}
