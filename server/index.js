import express from 'express'
import dotenv from 'dotenv'
import cookieSession from 'cookie-session'
import { nanoid } from 'nanoid'
import http from 'node:http'
import { WebSocketServer } from 'ws'
import db from './db.js'
import { runShell } from './actions.js'
import { spawnMissionWorktree, createRepo } from './orchestrator.js'

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

function shellQuote(value) {
  const safe = String(value).replace(/'/g, "'\\''")
  return `'${safe}'`
}

async function tmuxSend(session, message) {
  if (!session) return null
  const cmd = `tmux send-keys -t ${session} ${shellQuote(message)} Enter`
  return runShell(cmd)
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
  const missions = db.prepare('select * from missions order by created_at desc').all().map((row) => ({
    ...row,
    assignees: row.assignees ? JSON.parse(row.assignees) : [],
  }))
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
    driver: payload.driver || 'local',
    tmux_session: payload.tmux_session || null,
    repo: payload.repo || null,
  }
  db.prepare(
    `insert into agents (id, name, role, avatar, status, level, energy, morale, focus, location, current, xp, skills, equipment, driver, tmux_session, repo)
     values (@id, @name, @role, @avatar, @status, @level, @energy, @morale, @focus, @location, @current, @xp, @skills, @equipment, @driver, @tmux_session, @repo)`
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
     skills=@skills, equipment=@equipment, driver=@driver, tmux_session=@tmux_session, repo=@repo where id=@id`
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
    assignees: JSON.stringify(payload.assignees || []),
  }
  db.prepare(
    `insert into missions (id, title, eta, risk, squad, status, assignees)
     values (@id, @title, @eta, @risk, @squad, @status, @assignees)`
  ).run(mission)
  logActivity(`📜 Mission queued: ${mission.title}`)
  broadcast('mission.created', mission)
  res.json(mission)
})

app.put('/api/missions/:id', requireAuth, (req, res) => {
  const id = req.params.id
  const existing = db.prepare('select * from missions where id = ?').get(id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const updated = {
    ...existing,
    ...req.body,
    assignees: JSON.stringify(req.body.assignees ?? (existing.assignees ? JSON.parse(existing.assignees) : [])),
  }
  db.prepare(
    `update missions set title=@title, eta=@eta, risk=@risk, squad=@squad, status=@status, assignees=@assignees where id=@id`
  ).run(updated)
  logActivity(`🗺️ Mission updated: ${updated.title}`)
  broadcast('mission.updated', { ...updated, assignees: JSON.parse(updated.assignees) })
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

app.post('/api/actions/broadcast', requireAuth, (req, res) => {
  const { message } = req.body
  if (!message) return res.status(400).json({ error: 'Missing message' })
  logActivity(`📣 Broadcast: ${message}`)
  broadcast('broadcast', { message })
  res.json({ ok: true })
})

app.post('/api/actions/pause-all', requireAuth, async (_req, res) => {
  const agents = db.prepare('select * from agents').all()
  agents.forEach((agent) => {
    db.prepare('update agents set status = ? where id = ?').run('Paused', agent.id)
  })
  for (const agent of agents) {
    if (agent.driver === 'tmux' && agent.tmux_session) {
      await tmuxSend(agent.tmux_session, 'Pause. Enter standby mode and await new mission.')
    }
  }
  logActivity('⏸️ All agents paused')
  broadcast('agents.paused', { ok: true })
  res.json({ ok: true })
})

app.post('/api/actions/agent/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const { action, message } = req.body
  const agent = db.prepare('select * from agents where id = ?').get(id)
  if (!agent) return res.status(404).json({ error: 'Not found' })

  if (action === 'pause') {
    db.prepare('update agents set status = ? where id = ?').run('Paused', id)
    if (agent.driver === 'tmux' && agent.tmux_session) {
      await tmuxSend(agent.tmux_session, message || 'Pause. Enter standby mode and await new mission.')
    }
    logActivity(`⏸️ ${agent.name} paused`)
  }

  if (action === 'resume') {
    db.prepare('update agents set status = ? where id = ?').run('Active', id)
    if (agent.driver === 'tmux' && agent.tmux_session) {
      await tmuxSend(agent.tmux_session, message || 'Resume active duty.')
    }
    logActivity(`▶️ ${agent.name} resumed`)
  }

  if (action === 'assign') {
    if (agent.driver === 'tmux' && agent.tmux_session && message) {
      await tmuxSend(agent.tmux_session, message)
    }
    if (agent.driver === 'openclaw' && message) {
      await runShell(`openclaw system event --text ${shellQuote(`Mission for ${agent.name}: ${message}`)} --mode now`)
    }
    logActivity(`🗺️ Mission sent to ${agent.name}`)
  }

  if (action === 'terminate') {
    if (agent.driver === 'tmux' && agent.tmux_session) {
      await runShell(`tmux kill-session -t ${agent.tmux_session}`)
    }
    logActivity(`🧨 Terminated ${agent.name} session`)
  }

  res.json({ ok: true })
})

app.post('/api/actions/spawn-mission', requireAuth, async (req, res) => {
  const { title, prompt, role, repoPath } = req.body
  if (!title || !prompt || !role || !repoPath) {
    return res.status(400).json({ error: 'Missing title, prompt, role, repoPath' })
  }

  const { session, branch, worktree } = await spawnMissionWorktree({
    repoPath,
    role,
    prompt,
  })

  const agent = {
    id: `A-${nanoid(4)}`,
    name: role,
    role,
    avatar: '🧠',
    status: 'Active',
    level: 1,
    energy: 80,
    morale: 80,
    focus: 80,
    location: 'Worktree Bay',
    current: title,
    xp: 10,
    skills: JSON.stringify([{ name: 'Execution', value: 72 }]),
    equipment: JSON.stringify(['Worktree Kit']),
    driver: 'tmux',
    tmux_session: session,
    repo: 'openboard',
  }

  db.prepare(
    `insert into agents (id, name, role, avatar, status, level, energy, morale, focus, location, current, xp, skills, equipment, driver, tmux_session, repo)
     values (@id, @name, @role, @avatar, @status, @level, @energy, @morale, @focus, @location, @current, @xp, @skills, @equipment, @driver, @tmux_session, @repo)`
  ).run(agent)

  const mission = {
    id: `M-${nanoid(4)}`,
    title,
    eta: 'TBD',
    risk: 'Medium',
    squad: role,
    status: 'Active',
    assignees: JSON.stringify([agent.id]),
  }

  db.prepare(
    `insert into missions (id, title, eta, risk, squad, status, assignees)
     values (@id, @title, @eta, @risk, @squad, @status, @assignees)`
  ).run(mission)

  logActivity(`🧭 Spawned mission: ${title} (${role})`)
  broadcast('agent.created', { ...agent, skills: JSON.parse(agent.skills), equipment: JSON.parse(agent.equipment) })
  broadcast('mission.created', { ...mission, assignees: JSON.parse(mission.assignees) })

  res.json({ ok: true, session, branch, worktree })
})

app.post('/api/actions/create-repo', requireAuth, async (req, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ error: 'Missing name' })
  const repo = await createRepo({ name })
  logActivity(`📦 Created new repo: ${repo.repo}`)
  res.json(repo)
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
