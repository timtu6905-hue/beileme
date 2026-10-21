// 九年级英语单词表 · Cloudflare Pages Functions 后端
// 接口：POST /api/register、POST /api/login、GET /api/progress、PUT /api/progress、GET /api/ping
// 需要在 Pages 项目里绑定 D1 数据库，变量名必须是 DB

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: HEADERS });
const enc = new TextEncoder();

function b64url(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomB64(len) {
  const b = new Uint8Array(len);
  crypto.getRandomValues(b);
  return b64url(b);
}
async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    key,
    256
  );
  return b64url(bits);
}
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
async function readJson(request) {
  try { return await request.json(); } catch (_) { return null; }
}
const publicUser = u => ({ name: u.name, gender: u.gender || '', avatar: u.avatar || '' });

async function findUser(env, name) {
  return env.DB.prepare('SELECT * FROM users WHERE name = ?').bind(name).first();
}
const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 登录状态有效期：180 天

async function createSession(env, userId) {
  const token = randomB64(32);
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)')
    .bind(token, userId, now).run();
  // 顺手清理该用户 90 天前的历史会话，避免 sessions 表无限增长
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND created_at < ?')
    .bind(userId, cutoff).run();
  return token;
}
async function authUser(request, env) {
  const header = request.headers.get('authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const row = await env.DB.prepare(
    'SELECT u.*, s.created_at AS session_created FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?'
  ).bind(token).first();
  if (!row) return null;
  const age = Date.now() - new Date(row.session_created || 0).getTime();
  if (!(age >= 0) || age > SESSION_TTL_MS) return null;
  return row;
}

async function handleRegister(request, env) {
  const body = await readJson(request);
  if (!body) return json({ error: '请求格式不正确' }, 400);
  const name = str(body.name, 24);
  const password = String(body.password || '');
  if (!name) return json({ error: '请输入名称' }, 400);
  if (password.length < 4) return json({ error: '密码至少 4 位' }, 400);
  const exists = await findUser(env, name);
  if (exists) return json({ error: '这个名称已经被注册了' }, 409);

  const salt = randomB64(16);
  const hash = await hashPassword(password, salt);
  const gender = str(body.gender, 8);
  const avatar = str(body.avatar, 8);
  const created = new Date().toISOString();
  const res = await env.DB.prepare(
    'INSERT INTO users (name, pass_hash, salt, gender, avatar, created_at) VALUES (?,?,?,?,?,?)'
  ).bind(name, hash, salt, gender, avatar, created).run();
  const token = await createSession(env, res.meta.last_row_id);
  return json({ token, user: { name, gender, avatar }, progress: {} });
}

async function handleLogin(request, env) {
  const body = await readJson(request);
  if (!body) return json({ error: '请求格式不正确' }, 400);
  const name = str(body.name, 24);
  const password = String(body.password || '');
  if (!name || !password) return json({ error: '请输入名称和密码' }, 400);
  const u = await findUser(env, name);
  if (!u) return json({ error: '没有找到这个账号，请先注册' }, 401);
  const hash = await hashPassword(password, u.salt);
  if (hash !== u.pass_hash) return json({ error: '密码不正确' }, 401);
  const token = await createSession(env, u.id);
  const row = await env.DB.prepare('SELECT data FROM progress WHERE user_id = ?').bind(u.id).first();
  return json({ token, user: publicUser(u), progress: row ? JSON.parse(row.data) : {} });
}

async function handleGetProgress(request, env) {
  const u = await authUser(request, env);
  if (!u) return json({ error: '登录状态已失效，请重新登录' }, 401);
  const row = await env.DB.prepare('SELECT data FROM progress WHERE user_id = ?').bind(u.id).first();
  return json({ user: publicUser(u), progress: row ? JSON.parse(row.data) : {} });
}

async function handlePutProgress(request, env) {
  const u = await authUser(request, env);
  if (!u) return json({ error: '登录状态已失效，请重新登录' }, 401);
  const body = await readJson(request);
  if (!body || typeof body !== 'object') return json({ error: '请求格式不正确' }, 400);
  const text = JSON.stringify(body);
  if (text.length > 200000) return json({ error: '进度数据过大' }, 413);
  const now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO progress (user_id, data, updated_at) VALUES (?,?,?) ' +
    'ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
  ).bind(u.id, text, now).run();
  return json({ ok: true, updatedAt: now });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (!env.DB) return json({ error: '后端数据库未绑定（缺少 D1 绑定 DB）' }, 500);
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '').toLowerCase();
  const method = request.method.toUpperCase();
  try {
    if (route === 'ping') return json({ ok: true, mode: 'cloud' });
    if (route === 'register' && method === 'POST') return await handleRegister(request, env);
    if (route === 'login' && method === 'POST') return await handleLogin(request, env);
    if (route === 'progress' && method === 'GET') return await handleGetProgress(request, env);
    if (route === 'progress' && method === 'PUT') return await handlePutProgress(request, env);
    if (route === 'ping' || route === 'register' || route === 'login' || route === 'progress') {
      return json({ error: '请求方法不被允许' }, 405);
    }
    return json({ error: '接口不存在' }, 404);
  } catch (err) {
    return json({ error: '服务器出错：' + (err && err.message ? err.message : '未知错误') }, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return onRequest({ request, env, ctx, params: {} });
    }
    return env.ASSETS.fetch(request);
  }
};
