import db from './db.js'

const args = process.argv.slice(2)
const get = (key, fallback = '') => {
  const found = args.find((item) => item.startsWith(`${key}=`))
  return found ? found.split('=').slice(1).join('=') : fallback
}

const name = get('name')
const role = get('role')
const title = get('title')
const repo = get('repo')
const branch = get('branch')
const status = get('status', 'Running')

if (!name || !role || !title) {
  console.error('Missing name, role, or title')
  process.exit(1)
}

const agentId = `A-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
const missionId = `M-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

const agent = {
  id: agentId,
  name,
  role,
  avatar: '🧠',
  status,
  level: 1,
  energy: 90,
  morale: 90,
  focus: 90,
  location: repo || 'External',
  current: title,
  xp: 10,
  skills: JSON.stringify([{ name: 'Execution', value: 70 }]),
  equipment: JSON.stringify(['Remote Kit']),
  driver: 'external',
  tmux_session: null,
  repo: repo || null,
  nickname: null,
}

const mission = {
  id: missionId,
  title,
  eta: 'TBD',
  risk: 'Medium',
  squad: role,
  status,
  assignees: JSON.stringify([agentId]),
}

db.prepare(
  `insert into agents (id, name, role, avatar, status, level, energy, morale, focus, location, current, xp, skills, equipment, driver, tmux_session, repo, nickname)
   values (@id, @name, @role, @avatar, @status, @level, @energy, @morale, @focus, @location, @current, @xp, @skills, @equipment, @driver, @tmux_session, @repo, @nickname)`
).run(agent)

db.prepare(
  `insert into missions (id, title, eta, risk, squad, status, assignees)
   values (@id, @title, @eta, @risk, @squad, @status, @assignees)`
).run(mission)

console.log(`Registered mission ${title} with agent ${name} (${agentId})${branch ? ` on ${branch}` : ''}`)
