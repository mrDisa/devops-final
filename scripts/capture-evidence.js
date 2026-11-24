// CI screenshots: live service pages and clearly labelled reports of real command output.
const { chromium } = require('playwright');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const assert = require('node:assert/strict');

const mode = process.argv[2];
const output = 'evidence';
const repo = process.env.GITHUB_REPOSITORY || 'mrDisa/devops-final';
const runUrl = `https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;
const escape = value => String(value).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

async function main() {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    httpCredentials: { username: 'admin', password: 'admin' }
  });
  const page = await context.newPage();
  async function screenshot(name, url) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: false });
  }
  async function report(name, title, sections) {
    const html = `<!doctype html><html lang="ru"><meta charset="utf-8">
<style>body{margin:40px;background:#101827;color:#edf3ff;font:18px system-ui}
h1{font-size:30px}h2{font-size:21px;color:#9ac9ff}pre{white-space:pre-wrap;overflow-wrap:anywhere;
background:#182338;padding:20px;border-radius:8px;font:15px monospace;line-height:1.6}
p{color:#b3c2da}a{color:#9ac9ff}</style>
<h1>${escape(title)}</h1><p>Actual CI output / fetched responses; this is a generated evidence report.</p>
<p>Source commit: ${escape(process.env.GITHUB_SHA)}<br>Run: <a href="${runUrl}">${runUrl}</a></p>
${sections.map(([heading, text]) => `<h2>${escape(heading)}</h2><pre>${escape(text)}</pre>`).join('')}</html>`;
    await writeFile(`${output}/${name}.html`, html);
    await page.setContent(html);
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  }
  async function json(url) {
    const headers = { 'User-Agent': 'devops-final-evidence' };
    if (url.startsWith('https://api.github.com/') && process.env.GH_TOKEN) {
      headers.Authorization = 'Bearer ' + process.env.GH_TOKEN;
    }
    const response = await fetch(url, { headers });
    assert.equal(response.ok, true, `HTTP ${response.status}: ${url}`);
    return response.json();
  }
  try {
    if (mode === 'monitoring') {
      const root = await fetch('http://localhost:3000/').then(r => r.text());
      assert.equal(root, 'DevOps Final Project');
      const health = await json('http://localhost:3000/health');
      assert.deepEqual(health, { status: 'ok' });
      const metrics = await fetch('http://localhost:3000/metrics').then(r => r.text());
      assert.match(metrics, /http_requests_total/);
      assert.match(metrics, /process_cpu_seconds_total/);
      await screenshot('01-app-root', 'http://localhost:3000/');
      await screenshot('02-app-health', 'http://localhost:3000/health');
      await report('03-metrics-and-containers', 'Application metrics and Docker Compose', [
        ['docker compose ps', await readFile(`${output}/docker-compose-ps.txt`, 'utf8')],
        ['GET /metrics — selected actual lines', metrics.split('\n').filter(l => /http_requests_total|process_cpu_seconds_total/.test(l)).join('\n')]
      ]);
      const targets = await json('http://localhost:9090/api/v1/targets');
      const app = targets.data.activeTargets.find(t => t.labels.job === 'app');
      assert.equal(app?.health, 'up');
      await page.goto('http://localhost:9090/targets', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${output}/04-prometheus-targets.png`, fullPage: true });
      const connection = await fetch('http://localhost:3001/api/datasources/uid/prometheus/health', {
        headers: { Authorization: 'Basic ' + Buffer.from('admin:admin').toString('base64') }
      }).then(r => r.json());
      assert.equal(connection.status, 'OK');
      await screenshot('05-grafana-prometheus-connection', 'http://localhost:3001/api/datasources/uid/prometheus/health');
      await report('06-monitoring-verification', 'Prometheus target UP and Grafana connection', [
        ['Prometheus /api/v1/targets: app', JSON.stringify(app, null, 2)],
        ['Grafana :3001 /api/datasources/uid/prometheus/health', JSON.stringify(connection, null, 2)]
      ]);
    } else if (mode === 'ansible') {
      const first = await readFile('ansible-first.log', 'utf8');
      const second = await readFile('ansible-second.log', 'utf8');
      assert.match(first, /failed=0/);
      assert.match(second, /changed=0\s+unreachable=0\s+failed=0/);
      await report('07-ansible-first-and-second-run', 'Ansible: first deployment and idempotence', [
        ['ansible-playbook -i localhost, deploy.yml — first run', first],
        ['ansible-playbook -i localhost, deploy.yml — second run', second]
      ]);
      const base = `https://api.github.com/repos/${repo}`;
      const pulls = await json(base + '/pulls?state=closed&base=main&per_page=20');
      const merged = pulls.filter(pr => pr.merged_at && pr.head.ref === 'develop');
      assert.ok(merged.length);
      const rules = await json(base + '/rulesets');
      const active = rules.find(rule => rule.enforcement === 'active' && rule.name === 'main');
      assert.ok(active);
      const rule = await json(base + '/rulesets/' + active.id);
      await report('08-pull-request-and-main-protection', 'Merged develop PR and active main protection', [
        ['Merged PRs from develop', JSON.stringify(merged.map(pr => ({
          number: pr.number, url: pr.html_url, merged_at: pr.merged_at, head: pr.head.ref, base: pr.base.ref
        })), null, 2)],
        ['Active protection rules fetched from GitHub', JSON.stringify({
          name: rule.name, enforcement: rule.enforcement, conditions: rule.conditions, rules: rule.rules
        }, null, 2)]
      ]);
    } else if (mode === 'publication') {
      assert.match(process.env.IMAGE_DIGEST || '', /^sha256:[0-9a-f]{64}$/);
      await report('09-ghcr-published-image', 'Successful GHCR publication', [
        ['docker/build-push-action result', JSON.stringify({
          image: process.env.IMAGE_NAME,
          tags: [process.env.IMAGE_NAME + ':latest', process.env.IMAGE_NAME + ':' + process.env.GITHUB_SHA],
          digest: process.env.IMAGE_DIGEST,
          run: runUrl
        }, null, 2)]
      ]);
    } else {
      throw new Error('Expected mode: monitoring, ansible, or publication');
    }
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
