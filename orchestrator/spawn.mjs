// spawn.mjs — launch a headless Claude Code session to execute /ticket.
// Command is a template configurable in config/orchestrator.json so teams
// can swap in `claude -p`, custom wrappers, etc.

import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync, mkdirSync, createWriteStream, readFileSync } from 'node:fs';
import { join } from 'node:path';

function expand(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

/**
 * @param {{ticket_id:string, ticket_url:string, repo_path:string, title:string}} ticket
 * @param {{command:string, args:string[], cwd?:string, env?:Record<string,string>, dry_run?:boolean}} spec
 * @param {string} logDir
 * @param {import('./budget.mjs').Budget} [budget] - Optional budget instance for cost tracking
 */
export function spawnTicketAgent(ticket, spec, logDir, budget) {
  const vars = {
    ticket_url: ticket.ticket_url,
    ticket_id:  ticket.ticket_id,
    repo_path:  ticket.repo_path || process.cwd(),
    title:      ticket.title || '',
  };

  const cmd  = expand(spec.command, vars);
  // If args contains '/ticket', add JSON output flags before it
  const rawArgs = spec.args || [];
  const finalArgs = [];
  let hasTicketCommand = false;
  for (const arg of rawArgs) {
    const expandedArg = expand(arg, vars);
    if (expandedArg === '/ticket') {
      // Insert JSON output flags before /ticket
      finalArgs.push('-p', '--output-format', 'stream-json');
      hasTicketCommand = true;
    }
    finalArgs.push(expandedArg);
  }
  const args = finalArgs;
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

  // After the child process exits, extract and track real costs
  child.on('exit', async (code) => {
    // Read the log file to extract the final cost
    try {
      const logContent = readFileSync(logFile, 'utf8');
      const lines = logContent.split('\n');

      // Look for the final result event with total_cost_usd
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('{') && line.includes('total_cost_usd')) {
          try {
            const event = JSON.parse(line);
            if (event.total_cost_usd !== undefined) {
              if (budget) {
                budget.addRealCost(ticket.ticket_id, event.total_cost_usd);
                console.log(`[spawn] Tracked real cost for ${ticket.ticket_id}: $${event.total_cost_usd}`);
              }
              break;
            }
          } catch (e) {
            // Not a valid JSON event, continue
          }
        }
      }
    } catch (err) {
      console.error(`[spawn] Failed to extract cost for ${ticket.ticket_id}:`, err.message);
    }
  });

  return { pid: child.pid, logFile, dry_run: false, command: `${cmd} ${args.join(' ')}` };
}
