// infrlo agent：QQ 机器人的远程执行器（token 鉴权）
// GET  /              状态（无需鉴权，保活/巡检用）
// POST /run  {command} 在容器内执行 shell 命令
// POST /fetch {url}    让容器抓取网页，返回正文前 N 字符
import http from 'node:http';
import { exec } from 'node:child_process';
import os from 'node:os';

const {
  PORT = '8080',
  AGENT_TOKEN = '',
  BOT_PING_URL = '',            // Orkestr 上机器人的健康检查地址，定时 ping 保活
  PING_INTERVAL_MS = '240000',  // 4 分钟
  EXEC_TIMEOUT_MS = '60000',
  MAX_OUTPUT = '4000',
} = process.env;

if (!AGENT_TOKEN) { console.error('缺少 AGENT_TOKEN'); process.exit(1); }

const auth = (req) => (req.headers['authorization'] || '') === `Bearer ${AGENT_TOKEN}`;

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const readBody = (req) => new Promise((resolve, reject) => {
  let data = '';
  req.on('data', (c) => { data += c; if (data.length > 1e6) { reject(new Error('body too large')); req.destroy(); } });
  req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(new Error('invalid json')); } });
  req.on('error', reject);
});

const trim = (s) => (s && s.length > Number(MAX_OUTPUT)) ? s.slice(0, Number(MAX_OUTPUT)) + `…(+${s.length - Number(MAX_OUTPUT)} 字符)` : (s || '');

// 同时监听 5000（infrlo 该应用的路由端口）和平台注入的 PORT，哪个通走哪个
const listenPorts = [...new Set([5000, Number(PORT) || 0].filter(Boolean))];
for (const p of listenPorts) {
  http.createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (e) {
      try { send(res, 500, { error: String(e.message || e) }); } catch {}
    }
  }).listen(p, () => console.log(`agent listening on :${p}`));
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/') {
    return send(res, 200, {
      service: 'infrlo-agent', ok: true,
      uptime_s: Math.round(process.uptime()),
      host: `${os.type()} ${os.release()} ${os.arch()}`,
      cpu: os.cpus().length, mem_free_mb: Math.round(os.freemem() / 1e6),
      ping_target: BOT_PING_URL || '(none)',
    });
  }
  if (!auth(req)) return send(res, 401, { error: 'unauthorized' });
  if (req.method === 'POST' && url.pathname === '/run') {
    const { command } = await readBody(req);
    if (!command || typeof command !== 'string') return send(res, 400, { error: 'command required' });
    const out = await new Promise((resolve) => {
      exec(command, { timeout: Number(EXEC_TIMEOUT_MS), maxBuffer: 10 * 1024 * 1024, encoding: 'utf8' },
        (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, stdout, stderr, killed: !!(err && err.killed) }));
    });
    console.log(`[run] ${command.slice(0, 100)} -> exit ${out.code}`);
    return send(res, 200, { exit_code: out.code, killed: out.killed, stdout: trim(out.stdout), stderr: trim(out.stderr) });
  }
  if (req.method === 'POST' && url.pathname === '/fetch') {
    const { url: target } = await readBody(req);
    if (!target || !/^https?:\/\//.test(target)) return send(res, 400, { error: 'url required' });
    const r = await fetch(target, { redirect: 'follow', signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'qqbot-agent/1.0' } });
    const body = await r.text();
    console.log(`[fetch] ${target.slice(0, 100)} -> ${r.status}`);
    return send(res, 200, { status: r.status, content_type: r.headers.get('content-type'), body: trim(body) });
  }
  send(res, 404, { error: 'not found' });
}

// 双向保活：定时 ping Orkestr 上的机器人
if (BOT_PING_URL) {
  setInterval(async () => {
    try {
      const r = await fetch(BOT_PING_URL, { signal: AbortSignal.timeout(15000) });
      console.log(`[keepalive] ${BOT_PING_URL} -> ${r.status}`);
    } catch (e) { console.error('[keepalive] ping failed:', e.message); }
  }, Number(PING_INTERVAL_MS)).unref?.();
}
