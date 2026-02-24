import { useEffect, useMemo, useState } from 'react'
import './App.css'

type Skill = { name: string; value: number }

type Agent = {
  id: string
  name: string
  role: string
  avatar: string
  status: string
  level: number
  energy: number
  morale: number
  focus: number
  location: string
  current: string
  xp: number
  skills: Skill[]
  equipment: string[]
}

type Mission = {
  id: string
  title: string
  eta: string
  risk: string
  squad: string
  status: string
  assignees: string[]
}

type Directive = {
  id: string
  title: string
  detail: string
  state: string
}

type Resource = {
  id: string
  label: string
  value: number
}

type Activity = {
  id: string
  time: string
  text: string
}

const recruitTemplates = [
  {
    name: 'Nova',
    role: 'Automation Tinkerer',
    avatar: '🪄',
    skills: [
      { name: 'Integrations', value: 72 },
      { name: 'Scripting', value: 68 },
      { name: 'Ops', value: 75 },
    ],
    equipment: ['Webhook Satchel', 'Cron Charm'],
  },
  {
    name: 'Rift',
    role: 'Incident Duelist',
    avatar: '⚡',
    skills: [
      { name: 'Alerts', value: 84 },
      { name: 'Containment', value: 79 },
      { name: 'Postmortems', value: 70 },
    ],
    equipment: ['Pager Blade', 'Runbook Codex'],
  },
  {
    name: 'Piko',
    role: 'Pixel Artisan',
    avatar: '🎮',
    skills: [
      { name: 'UI', value: 88 },
      { name: 'Motion', value: 74 },
      { name: 'Polish', value: 81 },
    ],
    equipment: ['Sprite Loom', 'Palette Orb'],
  },
]

function StatBar({ value }: { value: number }) {
  return (
    <div className="stat">
      <div className="stat__track">
        <span style={{ width: `${value}%` }} />
      </div>
      <em>{value}%</em>
    </div>
  )
}

function SkillMeter({ skill }: { skill: Skill }) {
  return (
    <div className="skill">
      <span>{skill.name}</span>
      <div className="skill__track">
        <span style={{ width: `${skill.value}%` }} />
      </div>
      <em>{skill.value}</em>
    </div>
  )
}

function App() {
  const [authorized, setAuthorized] = useState(false)
  const [wsToken, setWsToken] = useState<string | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [missions, setMissions] = useState<Mission[]>([])
  const [directives, setDirectives] = useState<Directive[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [missionTitle, setMissionTitle] = useState('')
  const [missionEta, setMissionEta] = useState('15m')
  const [missionRisk, setMissionRisk] = useState('Low')
  const [missionAssignees, setMissionAssignees] = useState<string[]>([])
  const [missionPrompt, setMissionPrompt] = useState('')
  const [spawnRole, setSpawnRole] = useState('builder')
  const [repoPath, setRepoPath] = useState('/Users/kevinmarty/opendev/openboard')
  const [repoName, setRepoName] = useState('')
  const [broadcastMessage, setBroadcastMessage] = useState('')

  const bestAgent = useMemo(() => {
    if (agents.length === 0) return null
    return [...agents].sort((a, b) => b.level - a.level)[0]
  }, [agents])

  useEffect(() => {
    fetch('/api/me')
      .then((res) => res.json())
      .then((data) => {
        if (data?.user?.wsToken) {
          setAuthorized(true)
          setWsToken(data.user.wsToken)
        } else {
          setAuthorized(false)
        }
      })
  }, [])

  useEffect(() => {
    if (!authorized) return
    fetch('/api/state')
      .then((res) => res.json())
      .then((data) => {
        setAgents(data.agents || [])
        setMissions(data.missions || [])
        setDirectives(data.directives || [])
        setResources(data.resources || [])
        setActivity(data.activity || [])
      })
  }, [authorized])

  useEffect(() => {
    if (!wsToken) return
    const socket = new WebSocket(`${window.location.origin.replace('http', 'ws')}/ws?token=${wsToken}`)
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.type === 'activity') {
        setActivity((prev) => [message.payload, ...prev].slice(0, 50))
      }
      if (message.type === 'agent.created') {
        setAgents((prev) => [...prev, message.payload])
      }
      if (message.type === 'agent.updated') {
        setAgents((prev) => prev.map((agent) => (agent.id === message.payload.id ? message.payload : agent)))
      }
      if (message.type === 'agent.deleted') {
        setAgents((prev) => prev.filter((agent) => agent.id !== message.payload.id))
      }
      if (message.type.startsWith('mission.')) {
        fetch('/api/state')
          .then((res) => res.json())
          .then((data) => {
            setMissions(data.missions || [])
          })
      }
      if (message.type.startsWith('directive.')) {
        fetch('/api/state')
          .then((res) => res.json())
          .then((data) => {
            setDirectives(data.directives || [])
          })
      }
      if (message.type.startsWith('resource.')) {
        fetch('/api/state')
          .then((res) => res.json())
          .then((data) => {
            setResources(data.resources || [])
          })
      }
    }
    return () => socket.close()
  }, [wsToken])

  const recruitAgent = async () => {
    const template = recruitTemplates[Math.floor(Math.random() * recruitTemplates.length)]
    const payload = {
      name: template.name,
      role: template.role,
      avatar: template.avatar,
      level: 8,
      energy: 80,
      morale: 82,
      focus: 78,
      location: 'HQ Bay',
      current: 'Onboarding protocol',
      xp: 20,
      skills: template.skills,
      equipment: template.equipment,
    }
    await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }

  const updateAgentStatus = async (agent: Agent, status: string) => {
    await fetch(`/api/agents/${agent.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, current: status === 'Paused' ? 'Stasis field engaged' : agent.current }),
    })
  }

  const fireAgent = async (agent: Agent) => {
    await fetch(`/api/agents/${agent.id}`, { method: 'DELETE' })
  }

  const pauseAll = async () => {
    await fetch('/api/actions/pause-all', { method: 'POST' })
  }

  const broadcastOrder = async () => {
    if (!broadcastMessage.trim()) return
    await fetch('/api/actions/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: broadcastMessage }),
    })
    setBroadcastMessage('')
  }

  const createMission = async () => {
    if (!missionTitle.trim()) return
    const assignees = missionAssignees
    await fetch('/api/missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: missionTitle,
        eta: missionEta,
        risk: missionRisk,
        squad: assignees.join(', ') || 'Unassigned',
        assignees,
      }),
    })

    for (const id of assignees) {
      const agent = agents.find((item) => item.id === id)
      if (agent) {
        await fetch(`/api/actions/agent/${agent.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'assign', message: `Mission: ${missionTitle}` }),
        })
      }
    }

    setMissionTitle('')
    setMissionAssignees([])
  }

  const spawnMission = async () => {
    if (!missionTitle.trim() || !missionPrompt.trim()) return
    await fetch('/api/actions/spawn-mission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: missionTitle,
        prompt: missionPrompt,
        role: spawnRole,
        repoPath,
      }),
    })
    setMissionTitle('')
    setMissionPrompt('')
  }

  const createRepo = async () => {
    if (!repoName.trim()) return
    await fetch('/api/actions/create-repo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: repoName }),
    })
    setRepoName('')
  }

  const login = () => {
    window.location.href = '/api/auth/github/login'
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.reload()
  }

  if (!authorized) {
    return (
      <div className="login">
        <div className="login__panel">
          <p className="eyebrow">OpenBoard secure gate</p>
          <h1>Guild Entry Requires OAuth Seal</h1>
          <p className="sub">
            This board is guarded by GitHub OAuth. Only kevinmarty69 is allowed to enter the guild.
          </p>
          <button className="primary" onClick={login}>Connect GitHub</button>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <header className="topbar">
        <div>
          <p className="eyebrow">OpenBoard • Agent Ops Console</p>
          <h1>Guild Ledger</h1>
          <p className="sub">
            Real-time orchestration of autonomous squads, with RPG cadence and full command authority.
          </p>
        </div>
        <div className="status">
          <div>
            <span className="pulse" />
            Live sync
          </div>
          <button className="primary" onClick={recruitAgent}>Recruit agent</button>
          <button onClick={pauseAll}>Pause all</button>
          <button onClick={logout}>Logout</button>
        </div>
      </header>

      <section className="grid">
        <div className="panel panel--wide">
          <div className="panel__header">
            <h2>Roster</h2>
            <span>{agents.length} active • {Math.max(0, agents.length - 4)} resting</span>
          </div>
          <div className="roster">
            {agents.map((agent) => (
              <div className="roster__card" key={agent.id}>
                <div className="card__header">
                  <div className="agent__avatar">{agent.avatar}</div>
                  <div>
                    <strong>{agent.name}</strong>
                    <span>{agent.role} • {agent.id}</span>
                  </div>
                  <div className={`badge badge--${agent.status.toLowerCase()}`}>
                    {agent.status}
                  </div>
                </div>
                <div className="card__grid">
                  <div className="stats">
                    <div>
                      <small>Level</small>
                      <h3>{agent.level}</h3>
                    </div>
                    <div>
                      <small>Location</small>
                      <h3>{agent.location}</h3>
                    </div>
                    <div>
                      <small>XP</small>
                      <div className="xp__ring">
                        <span style={{ '--xp': `${agent.xp}%` } as React.CSSProperties} />
                      </div>
                    </div>
                  </div>
                  <div className="vitals">
                    <div>
                      <small>Energy</small>
                      <StatBar value={agent.energy} />
                    </div>
                    <div>
                      <small>Morale</small>
                      <StatBar value={agent.morale} />
                    </div>
                    <div>
                      <small>Focus</small>
                      <StatBar value={agent.focus} />
                    </div>
                  </div>
                  <div className="skills">
                    <small>Skill board</small>
                    {agent.skills.map((skill) => (
                      <SkillMeter key={skill.name} skill={skill} />
                    ))}
                  </div>
                  <div className="gear">
                    <small>Equipment</small>
                    <ul>
                      {agent.equipment.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="quest">
                  <strong>{agent.current}</strong>
                  <span>Last ping moments ago</span>
                </div>
                <div className="card__actions">
                  <button onClick={() => updateAgentStatus(agent, 'Paused')}>Pause</button>
                  <button onClick={() => updateAgentStatus(agent, 'Active')}>Resume</button>
                  <button className="danger" onClick={() => fireAgent(agent)}>Release</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel__header">
            <h2>Mission Queue</h2>
            <span>Next 60 minutes</span>
          </div>
          <div className="mission">
            {missions.map((mission) => (
              <div className="mission__item" key={mission.id}>
                <strong>{mission.title}</strong>
                <div>
                  <span>ETA {mission.eta}</span>
                  <span className={`risk risk--${mission.risk.toLowerCase()}`}>
                    {mission.risk} risk
                  </span>
                </div>
                <em>{mission.assignees?.length ? mission.assignees.join(', ') : mission.squad}</em>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel__header">
            <h2>Signals</h2>
            <span>Auto-scout intel</span>
          </div>
          <ul className="signals">
            {activity.slice(0, 4).map((signal) => (
              <li key={signal.id}>{signal.text}</li>
            ))}
          </ul>
          <div className="summary">
            <div>
              <h3>Swarm Health</h3>
              <p>{bestAgent ? bestAgent.energy : 92}%</p>
            </div>
            <div>
              <h3>Open PRs</h3>
              <p>{missions.length}</p>
            </div>
            <div>
              <h3>CI Velocity</h3>
              <p>1.3x</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid--secondary">
        <div className="panel">
          <div className="panel__header">
            <h2>Mission Control</h2>
            <span>Assign the day</span>
          </div>
          <div className="mission-form">
            <label>
              Mission title
              <input
                value={missionTitle}
                onChange={(event) => setMissionTitle(event.target.value)}
                placeholder="Deploy agent onboarding revamp"
              />
            </label>
            <label>
              Mission prompt (for Codex)
              <textarea
                value={missionPrompt}
                onChange={(event) => setMissionPrompt(event.target.value)}
                placeholder="Describe the task in detail. Include constraints, files, tests, and definition of done."
              />
            </label>
            <div className="mission-form__row">
              <label>
                Role
                <input value={spawnRole} onChange={(event) => setSpawnRole(event.target.value)} />
              </label>
              <label>
                Repo path
                <input value={repoPath} onChange={(event) => setRepoPath(event.target.value)} />
              </label>
            </div>
            <div className="mission-form__row">
              <label>
                ETA
                <input value={missionEta} onChange={(event) => setMissionEta(event.target.value)} />
              </label>
              <label>
                Risk
                <select value={missionRisk} onChange={(event) => setMissionRisk(event.target.value)}>
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                </select>
              </label>
            </div>
            <div className="assignees">
              <span>Assign existing agents</span>
              <div>
                {agents.map((agent) => (
                  <label key={agent.id}>
                    <input
                      type="checkbox"
                      checked={missionAssignees.includes(agent.id)}
                      onChange={() => {
                        setMissionAssignees((prev) =>
                          prev.includes(agent.id)
                            ? prev.filter((id) => id !== agent.id)
                            : [...prev, agent.id]
                        )
                      }}
                    />
                    {agent.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="mission-actions">
              <button className="primary" onClick={createMission}>Dispatch mission</button>
              <button onClick={spawnMission}>Spawn mission agent</button>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel__header">
            <h2>Command Center</h2>
            <span>Live directives</span>
          </div>
          <div className="directives">
            {directives.map((item) => (
              <div className="directive" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </div>
                <button className="chip">{item.state}</button>
              </div>
            ))}
          </div>
          <div className="broadcast">
            <input
              value={broadcastMessage}
              onChange={(event) => setBroadcastMessage(event.target.value)}
              placeholder="Broadcast order to the guild..."
            />
            <button className="primary" onClick={broadcastOrder}>Send</button>
          </div>
          <div className="command-actions">
            <button onClick={pauseAll}>Pause all agents</button>
          </div>
          <div className="repo-form">
            <label>
              New product repo
              <input
                value={repoName}
                onChange={(event) => setRepoName(event.target.value)}
                placeholder="pixel-invoicing"
              />
            </label>
            <button className="primary" onClick={createRepo}>Create public repo</button>
          </div>
        </div>

        <div className="panel">
          <div className="panel__header">
            <h2>Resource Forge</h2>
            <span>Capacity meter</span>
          </div>
          <div className="resources">
            {resources.map((resource) => (
              <div key={resource.id}>
                <div className="resources__label">
                  <span>{resource.label}</span>
                  <em>{resource.value}%</em>
                </div>
                <div className="resources__track">
                  <span style={{ width: `${resource.value}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="resource-meta">
            <div>
              <h3>Worktrees</h3>
              <p>{resources.length + 3}</p>
            </div>
            <div>
              <h3>Active loops</h3>
              <p>{Math.max(1, Math.floor(agents.length / 2))}</p>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel__header">
            <h2>Activity Log</h2>
            <span>Last 20 minutes</span>
          </div>
          <div className="activity">
            {activity.map((entry) => (
              <div key={entry.id} className="activity__row">
                <span>{entry.time}</span>
                <p>{entry.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

export default App
