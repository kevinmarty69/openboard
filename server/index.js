import express from 'express'
import dotenv from 'dotenv'
import cookieSession from 'cookie-session'
import { nanoid } from 'nanoid'
import http from 'node:http'
import { WebSocketServer } from 'ws'
import db from './db.js'

dotenv.config()

const PORT = process.env.PORT || 3000
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET
const GITHUB_ALLOWED_LOGIN = process.env.GITHUB_ALLOWED_LOGIN
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL
const SESSION_SECRET = process.env.SESSION_SECRET || 'openboard-dev'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

const app = express()
app.use(express.json())
app.use(
  cookieSession({
    name: 'openboard_session',
    secret: SESSION_SECRET,
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
  })
)

const wsTokens = new Map()

function nowClock() {
  const now = new Date()
  return now.toTimeString().slice(0, 5)
}

function logActivity(text) {
  const entry = { id: `L-${nanoid(6)}`, time: nowClock(), text }
  db.prepare('insert into activity (id, time, text) values (?, ?, ?)').run(
    entry.id,
    entry.time,
    entry.text
  )
  broadcast('activity', entry)
}

function broadcast(type, payload) {
  const message = JSON.stringify({ type, payload })
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(message)
  })
}

function requireAuth(req, res, next) {
  if (req.session?.user?.login === GITHUB_ALLOWED_LOGIN) return next()
  return res.status(401).json({ error: 'Unauthorized' })
}

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.get('/api/auth/github/login', (_req, res) => {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_CALLBACK_URL,
    scope: 'read:user',
  })
  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`)
})

app.get('/api/auth/github/callback', async (req, res) => {
  const code = req.query.code
  if (!code) return res.status(400).send('Missing code')

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code: code.toString(),
      redirect_uri: GITHUB_CALLBACK_URL,
    }),
  })
  const tokenData = await tokenRes.json()
  const accessToken = tokenData.access_token
  if (!accessToken) return res.status(401).send('Auth failed')

  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const user = await userRes.json()

  if (user.login !== GITHUB_ALLOWED_LOGIN) {
    return res.status(403).send('Not allowed')
  }

  const wsToken = nanoid(24)
  wsTokens.set(wsToken, user.login)
  req.session.user = { login: user.login, wsToken }

  res.redirect(FRONTEND_URL)
})

app.post('/api/auth/logout', (req, res) => {
  if (req.session?.user?.wsToken) wsTokens.delete(req.session.user.wsToken)
  req.session = null
  res.json({ ok: true })
})

app.get('/api/me', (req, res) => {
  if (!req.session?.user) return res.status(200).json({ user: null })
  res.json({ user: req.session.user })
})

app.get('/api/state', requireAuth, (_req, res) => {
  const agents = db.prepare('select * from agents').all().map((row) => ({
    ...row,
    skills: JSON.parse(row.skills),
    equipment: JSON.parse(row.equipment),
  }))
  const missions = db.prepare('select * from missions order by created_at desc').all()
  const directives = db.prepare('select * from directives order by created_at desc').all()
  const resources = db.prepare('select * from resources order by created_at desc').all()
  const activity = db.prepare('select * from activity order by created_at desc limit 30').all()
  res.json({ agents, missions, directives, resources, activity })
})

app.post('/api/agents', requireAuth, (req, res) => {
  const payload = req.body
  const agent = {
    id: payload.id || `A-${nanoid(4)}`,
    name: payload.name,
    role: payload.role,
    avatar: payload.avatar || '🧠',
    status: payload.status || 'Idle',
    level: payload.level || 1,
    energy: payload.energy || 80,
    morale: payload.morale || 80,
    focus: payload.focus || 80,
    location: payload.location || 'HQ',
    current: payload.current || 'Awaiting mission',
    xp: payload.xp || 10,
    skills: JSON.stringify(payload.skills || []),
    equipment: JSON.stringify(payload.equipment || []),
  }
  db.prepare(
    `insert into agents (id, name, role, avatar, status, level, energy, morale, focus, location, current, xp, skills, equipment)
     values (@id, @name, @role, @avatar, @status, @level, @energy, @morale, @focus, @location, @current, @xp, @skills, @equipment)`
  ).run(agent)
  logActivity(`🧩 Recruited ${agent.name} (${agent.role})`)
  broadcast('agent.created', { ...agent, skills: JSON.parse(agent.skills), equipment: JSON.parse(agent.equipment) })
  res.json(agent)
})

app.put('/api/agents/:id', requireAuth, (req, res) => {
  const id = req.params.id
  const existing = db.prepare('select * from agents where id = ?').get(id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const payload = req.body
  const updated = {
    ...existing,
    ...payload,
    skills: JSON.stringify(payload.skills ?? JSON.parse(existing.skills)),
    equipment: JSON.stringify(payload.equipment ?? JSON.parse(existing.equipment)),
  }
  db.prepare(
    `update agents set name=@name, role=@role, avatar=@avatar, status=@status, level=@level,
     energy=@energy, morale=@morale, focus=@focus, location=@location, current=@current, xp=@xp,
     skills=@skills, equipment=@equipment where id=@id`
  ).run(updated)
  logActivity(`⚔️ Updated ${updated.name} (${updated.status})`)
  broadcast('agent.updated', { ...updated, skills: JSON.parse(updated.skills), equipment: JSON.parse(updated.equipment) })
  res.json(updated)
})

app.delete('/api/agents/:id', requireAuth, (req, res) => {
  const id = req.params.id
  const agent = db.prepare('select * from agents where id = ?').get(id)
  if (!agent) return res.status(404).json({ error: 'Not found' })
  db.prepare('delete from agents where id = ?').run(id)
  logActivity(`🧨 Released ${agent.name} from duty`)
  broadcast('agent.deleted', { id })
  res.json({ ok: true })
})

app.post('/api/missions', requireAuth, (req, res) => {
  const payload = req.body
  const mission = {
    id: payload.id || `M-${nanoid(4)}`,
    title: payload.title,
    eta: payload.eta || 'TBD',
    risk: payload.risk || 'Low',
    squad: payload.squad || 'Unassigned',
    status: payload.status || 'Queued',
  }
  db.prepare(
    `insert into missions (id, title, eta, risk, squad, status)
     values (@id, @title, @eta, @risk, @squad, @status)`
  ).run(mission)
  logActivity(`📜 Mission queued: ${mission.title}`)
  broadcast('mission.created', mission)
  res.json(mission)
})

app.put('/api/missions/:id', requireAuth, (req, res) => {
  const id = req.params.id
  const existing = db.prepare('select * from missions where id = ?').get(id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const updated = { ...existing, ...req.body }
  db.prepare(
    `update missions set title=@title, eta=@eta, risk=@risk, squad=@squad, status=@status where id=@id`
  ).run(updated)
  logActivity(`🗺️ Mission updated: ${updated.title}`)
  broadcast('mission.updated', updated)
  res.json(updated)
})

app.delete('/api/missions/:id', requireAuth, (req, res) => {
  const id = req.params.id
  const existing = db.prepare('select * from missions where id = ?').get(id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  db.prepare('delete from missions where id = ?').run(id)
  logActivity(`📕 Mission archived: ${existing.title}`)
  broadcast('mission.deleted', { id })
  res.json({ ok: true })
})

app.post('/api/directives', requireAuth, (req, res) => {
  const payload = req.body
  const directive = {
    id: payload.id || `D-${nanoid(4)}`,
    title: payload.title,
    detail: payload.detail || '',
    state: payload.state || 'Enabled',
  }
  db.prepare('insert into directives (id, title, detail, state) values (@id, @title, @detail, @state)').run(directive)
  logActivity(`📣 Directive issued: ${directive.title}`)
  broadcast('directive.created', directive)
  res.json(directive)
})

app.put('/api/directives/:id', requireAuth, (req, res) => {
  const id = req.params.id
  const existing = db.prepare('select * from directives where id = ?').get(id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const updated = { ...existing, ...req.body }
  db.prepare('update directives set title=@title, detail=@detail, state=@state where id=@id').run(updated)
  logActivity(`📣 Directive updated: ${updated.title}`)
  broadcast('directive.updated', updated)
  res.json(updated)
})

app.delete('/api/directives/:id', requireAuth, (req, res) => {
  const id = req.params.id
  const existing = db.prepare('select * from directives where id = ?').get(id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  db.prepare('delete from directives where id = ?').run(id)
  logActivity(`📣 Directive retired: ${existing.title}`)
  broadcast('directive.deleted', { id })
  res.json({ ok: true })
})

app.post('/api/resources', requireAuth, (req, res) => {
  const payload = req.body
  const resource = {
    id: payload.id || `R-${nanoid(4)}`,
    label: payload.label,
    value: payload.value ?? 0,
  }
  db.prepare('insert into resources (id, label, value) values (@id, @label, @value)').run(resource)
  logActivity(`🧪 Resource tuned: ${resource.label}`)
  broadcast('resource.created', resource)
  res.json(resource)
})

app.put('/api/resources/:id', requireAuth, (req, res) => {
  const id = req.params.id
  const existing = db.prepare('select * from resources where id = ?').get(id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const updated = { ...existing, ...req.body }
  db.prepare('update resources set label=@label, value=@value where id=@id').run(updated)
  logActivity(`🧪 Resource updated: ${updated.label}`)
  broadcast('resource.updated', updated)
  res.json(updated)
})

app.delete('/api/resources/:id', requireAuth, (req, res) => {
  const id = req.params.id
  const existing = db.prepare('select * from resources where id = ?').get(id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  db.prepare('delete from resources where id = ?').run(id)
  logActivity(`🧪 Resource removed: ${existing.label}`)
  broadcast('resource.deleted', { id })
  res.json({ ok: true })
})

app.get('/api/activity', requireAuth, (_req, res) => {
  const activity = db.prepare('select * from activity order by created_at desc limit 50').all()
  res.json(activity)
})

const server = http.createServer(app)
const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  const { url } = req
  if (!url?.startsWith('/ws')) {
    socket.destroy()
    return
  }
  const query = new URL(`http://localhost${url}`).searchParams
  const token = query.get('token')
  if (!token || !wsTokens.has(token)) {
    socket.destroy()
    return
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.user = wsTokens.get(token)
    wss.emit('connection', ws, req)
  })
})

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'hello', payload: { ok: true } }))
})

server.listen(PORT, () => {
  console.log(`OpenBoard API running on http://localhost:${PORT}`)
})
