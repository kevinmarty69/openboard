import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const dataDir = path.join(process.cwd(), 'server', 'data')
const dbPath = path.join(dataDir, 'openboard.db')

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const db = new Database(dbPath)

db.pragma('journal_mode = WAL')

db.exec(`
  create table if not exists agents (
    id text primary key,
    name text not null,
    role text not null,
    avatar text,
    status text not null,
    level integer not null,
    energy integer not null,
    morale integer not null,
    focus integer not null,
    location text,
    current text,
    xp integer not null,
    skills text not null,
    equipment text not null,
    driver text default 'local',
    tmux_session text,
    repo text,
    nickname text,
    created_at text default (datetime('now'))
  );

  create table if not exists missions (
    id text primary key,
    title text not null,
    eta text,
    risk text,
    squad text,
    status text not null,
    assignees text,
    created_at text default (datetime('now'))
  );

  create table if not exists directives (
    id text primary key,
    title text not null,
    detail text,
    state text not null,
    created_at text default (datetime('now'))
  );

  create table if not exists resources (
    id text primary key,
    label text not null,
    value integer not null,
    created_at text default (datetime('now'))
  );

  create table if not exists activity (
    id text primary key,
    time text not null,
    text text not null,
    created_at text default (datetime('now'))
  );
`)

function addColumnIfMissing(table, column, definition) {
  const columns = db.prepare(`pragma table_info(${table})`).all().map((c) => c.name)
  if (!columns.includes(column)) {
    db.exec(`alter table ${table} add column ${column} ${definition}`)
  }
}

addColumnIfMissing('agents', 'driver', "text default 'local'")
addColumnIfMissing('agents', 'tmux_session', 'text')
addColumnIfMissing('agents', 'repo', 'text')
addColumnIfMissing('agents', 'nickname', 'text')
addColumnIfMissing('missions', 'assignees', 'text')

const avatarMap = new Map([
  ['Zoe', '/avatars/zoe.jpg'],
  ['Codex', '/avatars/codex.jpg'],
  ['Claude', '/avatars/claude.jpg'],
])

avatarMap.forEach((path, name) => {
  db.prepare("update agents set avatar = ? where name = ? and avatar not like '/avatars/%'").run(path, name)
})

const nicknameMap = new Map([
  ['Zoe', 'Seraphine'],
  ['Codex', 'Branwyn'],
  ['Claude', 'Elyra'],
  ['Gemini', 'Nymera'],
  ['Mox', 'Garrick'],
])

nicknameMap.forEach((nickname, name) => {
  db.prepare("update agents set nickname = ? where name = ? and (nickname is null or nickname = '')").run(nickname, name)
})

function seedIfEmpty() {
  if (process.env.SEED_DATA === 'false') return
  const count = db.prepare('select count(*) as count from agents').get().count
  if (count > 0) return

  const insertAgent = db.prepare(`
    insert into agents (id, name, role, avatar, status, level, energy, morale, focus, location, current, xp, skills, equipment, driver, tmux_session, repo, nickname)
    values (@id, @name, @role, @avatar, @status, @level, @energy, @morale, @focus, @location, @current, @xp, @skills, @equipment, @driver, @tmux_session, @repo, @nickname)
  `)

  const agents = [
    {
      id: 'A-01',
      name: 'Zoe',
      role: 'Orchestrator',
      avatar: '/avatars/zoe.jpg',
      status: 'Commanding',
      level: 27,
      energy: 92,
      morale: 88,
      focus: 95,
      location: 'Bridge',
      current: 'Routing 3 active squads',
      xp: 71,
      skills: JSON.stringify([
        { name: 'Strategy', value: 92 },
        { name: 'Promptcraft', value: 95 },
        { name: 'Triage', value: 88 },
      ]),
      equipment: JSON.stringify(['Signal Wand', 'Ops Ledger', 'Recall Prism']),
      driver: 'openclaw',
      tmux_session: null,
      repo: 'openboard',
      nickname: 'Seraphine',
    },
    {
      id: 'C-17',
      name: 'Codex',
      role: 'Backend Alchemist',
      avatar: '/avatars/codex.jpg',
      status: 'Shipping',
      level: 19,
      energy: 76,
      morale: 81,
      focus: 90,
      location: 'Forge',
      current: 'Refactor payments saga',
      xp: 54,
      skills: JSON.stringify([
        { name: 'Systems', value: 91 },
        { name: 'Reliability', value: 87 },
        { name: 'Testing', value: 78 },
      ]),
      equipment: JSON.stringify(['Runtime Hammer', 'Schema Codex']),
      driver: 'tmux',
      tmux_session: 'codex-core',
      repo: 'openboard',
      nickname: 'Branwyn',
    },
    {
      id: 'CL-08',
      name: 'Claude',
      role: 'Frontend Ranger',
      avatar: '/avatars/claude.jpg',
      status: 'Polishing',
      level: 16,
      energy: 63,
      morale: 74,
      focus: 77,
      location: 'Atrium',
      current: 'Dashboard HUD redesign',
      xp: 48,
      skills: JSON.stringify([
        { name: 'UX', value: 88 },
        { name: 'UI', value: 84 },
        { name: 'Speed', value: 72 },
      ]),
      equipment: JSON.stringify(['Pixel Brush', 'Layout Compass']),
      driver: 'tmux',
      tmux_session: 'claude-ui',
      repo: 'openboard',
      nickname: 'Elyra',
    },
    {
      id: 'G-05',
      name: 'Gemini',
      role: 'Design Seer',
      avatar: '🔮',
      status: 'Sketching',
      level: 22,
      energy: 84,
      morale: 92,
      focus: 86,
      location: 'Atelier',
      current: 'Crystal UI palette',
      xp: 66,
      skills: JSON.stringify([
        { name: 'Visuals', value: 96 },
        { name: 'Motion', value: 80 },
        { name: 'Delight', value: 89 },
      ]),
      equipment: JSON.stringify(['Prism Deck', 'Mood Loom']),
      driver: 'local',
      tmux_session: null,
      repo: 'openboard',
      nickname: 'Nymera',
    },
    {
      id: 'MX-31',
      name: 'Mox',
      role: 'QA Sentinel',
      avatar: '🛡️',
      status: 'Testing',
      level: 14,
      energy: 58,
      morale: 69,
      focus: 73,
      location: 'Range',
      current: 'E2E run 7/12',
      xp: 39,
      skills: JSON.stringify([
        { name: 'Coverage', value: 81 },
        { name: 'Bugs', value: 88 },
        { name: 'Discipline', value: 77 },
      ]),
      equipment: JSON.stringify(['Assertion Bow', 'Log Shield']),
      driver: 'tmux',
      tmux_session: 'qa-sentinel',
      repo: 'openboard',
      nickname: 'Garrick',
    },
  ]

  const insertMission = db.prepare(`
    insert into missions (id, title, eta, risk, squad, status, assignees)
    values (@id, @title, @eta, @risk, @squad, @status, @assignees)
  `)

  const insertDirective = db.prepare(`
    insert into directives (id, title, detail, state)
    values (@id, @title, @detail, @state)
  `)

  const insertResource = db.prepare(`
    insert into resources (id, label, value)
    values (@id, @label, @value)
  `)

  const insertActivity = db.prepare(`
    insert into activity (id, time, text)
    values (@id, @time, @text)
  `)

  const missions = [
    {
      id: 'M-001',
      title: 'E2E suite: onboarding rewrite',
      eta: '11m',
      risk: 'Low',
      squad: 'C-17 + MX-31',
      status: 'Active',
      assignees: JSON.stringify(['C-17', 'MX-31']),
    },
    {
      id: 'M-002',
      title: 'AI reviews: billing engine PR #492',
      eta: '22m',
      risk: 'Medium',
      squad: 'Zoe + Gemini',
      status: 'Queued',
      assignees: JSON.stringify(['A-01', 'G-05']),
    },
    {
      id: 'M-003',
      title: 'UI snapshots: /agents/board',
      eta: '4m',
      risk: 'Low',
      squad: 'Claude',
      status: 'Active',
      assignees: JSON.stringify(['CL-08']),
    },
  ]

  const directives = [
    {
      id: 'D-01',
      title: 'Auto-merge low-risk PRs',
      detail: 'Requires CI green + 2 AI approvals',
      state: 'Enabled',
    },
    {
      id: 'D-02',
      title: 'Night watch (02:00–06:00)',
      detail: 'Only incident alerts, no pings',
      state: 'Enabled',
    },
    {
      id: 'D-03',
      title: 'Sentry sweep',
      detail: 'Spawn agents for new error spikes',
      state: 'Armed',
    },
  ]

  const resources = [
    { id: 'R-01', label: 'Compute', value: 68 },
    { id: 'R-02', label: 'Context window', value: 74 },
    { id: 'R-03', label: 'API budget', value: 57 },
  ]

  const activity = [
    { id: 'L-01', time: '14:42', text: 'Codex pushed 3 commits on feat/ledger-sync' },
    { id: 'L-02', time: '14:39', text: 'Gemini delivered UI spec v2.1' },
    { id: 'L-03', time: '14:33', text: 'Zoe approved mission: “Agent HR dashboard”' },
    { id: 'L-04', time: '14:27', text: 'Claude triggered snapshot audit (UI)' },
  ]

  const insertAll = db.transaction(() => {
    agents.forEach((agent) => insertAgent.run(agent))
    missions.forEach((mission) => insertMission.run(mission))
    directives.forEach((directive) => insertDirective.run(directive))
    resources.forEach((resource) => insertResource.run(resource))
    activity.forEach((entry) => insertActivity.run(entry))
  })

  insertAll()
}

seedIfEmpty()

export default db
