// notifier.mjs — Slack webhook + console fallback.

export class Notifier {
  /**
   * @param {{slack?:{webhook_url_env:string, channel?:string, notify_on?:string[]}}} config
   */
  constructor(config) {
    this.config = config || {};
    const envKey = this.config.slack?.webhook_url_env;
    this.webhookUrl = envKey ? (process.env[envKey] || '') : '';
    this.events = new Set(this.config.slack?.notify_on || ['blocker','budget_cap','ticket_complete','error']);
  }

  /**
   * @param {'blocker'|'budget_cap'|'ticket_complete'|'error'|'info'} kind
   * @param {{title:string, body?:string, link?:string, ticket_id?:string}} payload
   */
  async notify(kind, payload) {
    const line = `[${kind}] ${payload.title}` +
      (payload.ticket_id ? ` · ${payload.ticket_id}` : '') +
      (payload.link ? ` · ${payload.link}` : '') +
      (payload.body ? `\n  ${payload.body}` : '');

    console.log(`[notifier] ${line}`);

    if (!this.webhookUrl || !this.events.has(kind)) return;

    const emoji = ({
      blocker: ':stop_sign:',
      budget_cap: ':moneybag:',
      ticket_complete: ':white_check_mark:',
      error: ':warning:',
      info: ':information_source:',
    })[kind] || ':robot_face:';

    const text = `${emoji} *${payload.title}*` +
      (payload.ticket_id ? `\n> Ticket: \`${payload.ticket_id}\`` : '') +
      (payload.body ? `\n> ${payload.body.split('\n').join('\n> ')}` : '') +
      (payload.link ? `\n<${payload.link}|Open>` : '');

    try {
      const r = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          channel: this.config.slack?.channel,
        }),
      });
      if (!r.ok) console.error(`[notifier:slack] webhook returned ${r.status}`);
    } catch (e) {
      console.error(`[notifier:slack] webhook error: ${e.message}`);
    }
  }
}
