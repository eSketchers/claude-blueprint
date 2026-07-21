# Troubleshooting Guide

This guide covers common issues with the Claude Agency Blueprint and their solutions.

## Table of Contents

- [Bootstrap Issues](#bootstrap-issues)
- [Adoption Issues](#adoption-issues)
- [Orchestrator Issues](#orchestrator-issues)
- [Dashboard Issues](#dashboard-issues)
- [Agent Issues](#agent-issues)
- [Getting Help](#getting-help)

---

## Bootstrap Issues

### Error: "claude CLI not found"

**Symptom:** Bootstrap fails immediately with Claude CLI error

**Diagnosis:**
```bash
which claude
claude --version
```

**Solutions:**
1. Install Claude Code first: https://claude.com/claude-code
2. Ensure Claude is in your PATH: `export PATH="$HOME/.local/bin:$PATH"`
3. Restart terminal after installation

---

### Error: "npx not found" or Node version issues

**Symptom:** Bootstrap fails with Node/npm errors

**Diagnosis:**
```bash
node --version  # Should be 20.0.0 or higher
npm --version   # Should be 10.0.0 or higher
```

**Solutions:**
1. Install Node.js 20+:
   \`\`\`bash
   # Using nvm (recommended)
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   nvm install 20
   nvm use 20
   \`\`\`

2. Using system package manager:
   \`\`\`bash
   # macOS
   brew install node@20

   # Ubuntu/Debian
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   \`\`\`

---

### Error: pip/Python commands failing

**Symptom:** Can't install graphify or pre-commit

**Diagnosis:**
```bash
python3 --version  # Should be 3.8+
pip3 --version
which pip3
```

**Solutions:**
1. Install Python 3.8+:
   \`\`\`bash
   # macOS
   brew install python@3.11

   # Ubuntu/Debian
   sudo apt update
   sudo apt install python3 python3-pip
   \`\`\`

2. Fix pip installation:
   \`\`\`bash
   python3 -m ensurepip --upgrade
   python3 -m pip install --upgrade pip
   \`\`\`

3. Use virtual environment:
   \`\`\`bash
   python3 -m venv ~/.claude-agency-env
   source ~/.claude-agency-env/bin/activate
   pip install graphifyy pre-commit
   \`\`\`

---

### MCP server registration fails

**Symptom:** "mcp add failed" warnings during bootstrap

**Diagnosis:**
```bash
claude mcp list
ls ~/.claude/mcp/
```

**Solutions:**
1. Clear MCP cache and retry:
   \`\`\`bash
   rm -rf ~/.claude/mcp/
   claude mcp refresh
   ./scripts/bootstrap.sh
   \`\`\`

2. Install MCP servers individually:
   \`\`\`bash
   # Try each one separately to identify the problem
   claude mcp add serena -- uvx --from git+https://github.com/oraios/serena serena-mcp-server
   \`\`\`

3. Check network connectivity:
   \`\`\`bash
   # Test npm registry
   npm ping

   # Test GitHub access
   curl -I https://github.com
   \`\`\`

---

## Adoption Issues

### Error: "BLUEPRINT_DIR not set"

**Symptom:** Adoption fails with blueprint directory error

**Diagnosis:**
```bash
echo $BLUEPRINT_DIR
ls -la ~/work/claude-agency-blueprint
```

**Solutions:**
1. Clone the blueprint first:
   \`\`\`bash
   git clone https://github.com/your-org/claude-agency-blueprint ~/work/claude-agency-blueprint
   \`\`\`

2. Set BLUEPRINT_DIR:
   \`\`\`bash
   export BLUEPRINT_DIR="$HOME/work/claude-agency-blueprint"
   # Add to ~/.bashrc or ~/.zshrc for persistence
   \`\`\`

3. Use absolute path:
   \`\`\`bash
   BLUEPRINT_DIR=/absolute/path/to/blueprint ./scripts/adopt.sh --framework python
   \`\`\`

---

### Error: "Not a git repository"

**Symptom:** Adoption fails in target project

**Diagnosis:**
```bash
git status
ls -la .git/
```

**Solutions:**
1. Initialize git:
   \`\`\`bash
   git init
   git add .
   git commit -m "Initial commit"
   \`\`\`

2. Clone instead of downloading:
   \`\`\`bash
   git clone <your-repo-url> project-name
   cd project-name
   \`\`\`

---

### Framework detection fails

**Symptom:** Wrong framework detected or "no framework found"

**Diagnosis:**
```bash
# Check what files exist
ls -la package.json pyproject.toml requirements.txt pom.xml

# Run detection debug
BLUEPRINT_DIR=~/work/claude-agency-blueprint \\
  bash -x scripts/adopt.sh --debug-detection
```

**Solutions:**
1. Specify framework explicitly:
   \`\`\`bash
   ./scripts/adopt.sh --framework python
   \`\`\`

2. For monorepos, specify multiple:
   \`\`\`bash
   ./scripts/adopt.sh --frameworks "python,nextjs"
   \`\`\`

3. Check supported frameworks:
   - python (Django, FastAPI, Flask)
   - node (Express, vanilla Node)
   - nextjs (Next.js apps)
   - nestjs (NestJS apps)
   - django-react (Full-stack monorepo)

---

## Orchestrator Issues

### Orchestrator won't start

**Symptom:** \`node server.mjs\` fails or exits immediately

**Diagnosis:**
```bash
cd orchestrator
node --version  # Must be 20+
ls -la orchestrator.json
cat ~/.claude-agency/orchestrator.log
```

**Solutions:**
1. Create config file:
   \`\`\`bash
   cp orchestrator.example.json orchestrator.json
   # Edit with your settings
   \`\`\`

2. Check port availability:
   \`\`\`bash
   lsof -i :7841  # Orchestrator port
   lsof -i :7842  # Dashboard port
   \`\`\`

3. Fix permissions:
   \`\`\`bash
   mkdir -p ~/.claude-agency
   chmod 755 ~/.claude-agency
   \`\`\`

4. Check Node.js errors:
   \`\`\`bash
   node --trace-warnings server.mjs
   \`\`\`

---

### "Budget cap hit" immediately

**Symptom:** Orchestrator refuses to spawn agents

**Diagnosis:**
```bash
cat ~/.claude-agency/registry.json | jq '.tickets'
cat orchestrator.json | jq '.budget'
```

**Solutions:**
1. Reset daily spend:
   \`\`\`bash
   # Edit registry.json, set today's spend to 0
   jq '.daily_spend = {}' ~/.claude-agency/registry.json > tmp.json
   mv tmp.json ~/.claude-agency/registry.json
   \`\`\`

2. Increase budget caps:
   \`\`\`json
   // orchestrator.json
   {
     "budget": {
       "daily_usd_cap": 50,        // Increase from 25
       "per_ticket_usd_cap": 5,    // Increase from 2
       "cost_per_event_usd": 0.001 // Calibrate based on actual costs
     }
   }
   \`\`\`

3. Check for runaway agents:
   \`\`\`bash
   ps aux | grep claude
   pkill -f "claude.*ticket"  # Kill all ticket agents
   \`\`\`

---

### Tickets stuck in "in_progress"

**Symptom:** Tickets never complete, agents appear frozen

**Diagnosis:**
```bash
# Check agent logs
tail -f ~/.claude-agency/agent-logs/*.log

# Check stuck detector
cat ~/.claude-agency/registry.json | jq '.tickets | map(select(.status == "in_progress"))'

# Check process status
ps aux | grep claude
```

**Solutions:**
1. Increase stuck detection timeout:
   \`\`\`json
   // orchestrator.json
   {
     "stuck": {
       "idle_timeout_ms": 1200000,  // 20 minutes instead of 10
       "tool_loop_threshold": 10    // Allow more tool calls
     }
   }
   \`\`\`

2. Manually mark as complete:
   \`\`\`bash
   # Edit registry.json, change status to "completed" or "failed"
   \`\`\`

3. Kill and retry:
   \`\`\`bash
   # Find PID from logs
   kill -TERM <pid>
   # Orchestrator should retry with backoff
   \`\`\`

---

## Dashboard Issues

### Dashboard shows blank page

**Symptom:** http://localhost:7842 loads but no data

**Diagnosis:**
```bash
ls -la ~/.claude-agency/events.jsonl
wc -l ~/.claude-agency/events.jsonl
curl http://localhost:7842/api/state
```

**Solutions:**
1. Check events file:
   \`\`\`bash
   # Ensure events.jsonl exists and is readable
   touch ~/.claude-agency/events.jsonl
   chmod 644 ~/.claude-agency/events.jsonl
   \`\`\`

2. Generate test event:
   \`\`\`bash
   echo '{"kind":"test","ts":'$(date +%s)',"session_id":"test","agent":"test"}' \\
     >> ~/.claude-agency/events.jsonl
   \`\`\`

3. Check dashboard logs:
   \`\`\`bash
   cd dashboard
   node server.mjs
   # Look for errors in console
   \`\`\`

---

### Dashboard performance issues

**Symptom:** Dashboard slow with large events.jsonl

**Diagnosis:**
```bash
ls -lh ~/.claude-agency/events.jsonl  # Check size
wc -l ~/.claude-agency/events.jsonl   # Check line count
```

**Solutions:**
1. Rotate large log files:
   \`\`\`bash
   cd ~/.claude-agency
   mv events.jsonl events-$(date +%Y%m%d).jsonl
   touch events.jsonl
   \`\`\`

2. Archive old events:
   \`\`\`bash
   # Keep only last 7 days
   ./dashboard/rotate-logs.sh
   \`\`\`

3. Use WebSocket mode (if not already):
   \`\`\`bash
   # Ensure dashboard v2 with WebSocket support
   cd dashboard
   npm install ws
   node server.mjs
   \`\`\`

---

## Agent Issues

### Agent crashes immediately

**Symptom:** Agent spawns but exits within seconds

**Diagnosis:**
```bash
tail -f ~/.claude-agency/agent-logs/<ticket-id>.log
cat ~/.claude-agency/registry.json | jq '.tickets["<ticket-id>"]'
```

**Solutions:**
1. Check Claude Code setup:
   \`\`\`bash
   # Test Claude directly
   claude -p "test"

   # Check plugins
   claude plugin list
   \`\`\`

2. Verify project setup:
   \`\`\`bash
   # In project directory
   ls -la .claude/
   cat .claude/settings.json
   \`\`\`

3. Check for missing dependencies:
   \`\`\`bash
   # For Python projects
   pip install -r requirements.txt

   # For Node projects
   npm install
   \`\`\`

---

### "Profile not found" errors

**Symptom:** Agent can't find expected profiles

**Diagnosis:**
```bash
ls -la .claude/agents/
cat .claude/agents.profiles.json
```

**Solutions:**
1. Re-run adoption:
   \`\`\`bash
   ./scripts/adopt.sh --framework <your-framework>
   \`\`\`

2. Switch to correct profile:
   \`\`\`bash
   ./scripts/switch-agents.sh fullstack
   \`\`\`

3. Check symlinks:
   \`\`\`bash
   # Agents should be symlinks
   ls -la .claude/agents/*.md
   readlink .claude/agents/*.md
   \`\`\`

---

## Getting Help

If the above solutions don't resolve your issue:

### 1. Collect Diagnostic Information

Run the diagnostic script:
```bash
./scripts/doctor.sh > diagnostic-report.txt
```

Or manually collect:
```bash
# System info
uname -a
node --version
python3 --version
claude --version

# Blueprint info
cd ~/work/claude-agency-blueprint
git rev-parse HEAD
git status

# Project info
ls -la .claude/
cat .claude/settings.json

# Recent logs
tail -n 100 ~/.claude-agency/orchestrator.log
tail -n 100 ~/.claude-agency/agent-logs/*.log
```

### 2. Check Documentation

- [README](../README.md) - Overview and quick start
- [SETUP](./SETUP.md) - Detailed setup and adoption instructions
- [ADVANCED](./ADVANCED.md) - Advanced topics including monorepo support, profiles, and optimization

### 3. Report Issues

Create an issue at: https://github.com/your-org/claude-agency-blueprint/issues

Include:
- Diagnostic report
- Steps to reproduce
- Expected vs actual behavior
- Any error messages

### 4. Community Support

- Slack: #claude-agency channel
- Discord: Agency Blueprint section
- Stack Overflow: Tag with \`claude-agency-blueprint\`

---

## Common Patterns

### After any major update:
```bash
# Re-run bootstrap to get latest tools
./scripts/bootstrap.sh --verify

# Re-adopt to update project configs
./scripts/adopt.sh --framework <your-framework>
```

### Daily maintenance:
```bash
# Check agent health
./scripts/doctor.sh

# Rotate logs if needed
./dashboard/rotate-logs.sh

# Clear stuck tickets
./scripts/cleanup-stuck.sh
```

### Performance tuning:
```bash
# Monitor costs
curl http://localhost:7842/api/stats | jq

# Calibrate token costs
./scripts/calibrate-costs.sh

# Optimize profiles
./scripts/switch-agents.sh minimal  # For simple tasks
./scripts/switch-agents.sh fullstack # For complex tasks
```
