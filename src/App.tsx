import './App.css'

const agents = [
  {
    id: 'A-01',
    name: 'Zoe',
    role: 'Orchestrator',
    level: 27,
    status: 'Commanding',
    energy: 92,
    morale: 88,
    focus: 95,
    current: 'Routing 3 active squads',
    location: 'Bridge',
    xp: 71,
    avatar: '🜲',
  },
  {
    id: 'C-17',
    name: 'Codex',
    role: 'Backend Alchemist',
    level: 19,
    status: 'Shipping',
    energy: 76,
    morale: 81,
    focus: 90,
    current: 'Refactor payments saga',
    location: 'Forge',
    xp: 54,
    avatar: '⚙️',
  },
  {
    id: 'CL-08',
    name: 'Claude',
    role: 'Frontend Ranger',
    level: 16,
    status: 'Polishing',
    energy: 63,
    morale: 74,
    focus: 77,
    current: 'Dashboard HUD redesign',
    location: 'Atrium',
    xp: 48,
    avatar: '🧭',
  },
  {
    id: 'G-05',
    name: 'Gemini',
    role: 'Design Seer',
    level: 22,
    status: 'Sketching',
    energy: 84,
    morale: 92,
    focus: 86,
    current: 'Crystal UI palette',
    location: 'Atelier',
    xp: 66,
    avatar: '🔮',
  },
  {
    id: 'MX-31',
    name: 'Mox',
    role: 'QA Sentinel',
    level: 14,
    status: 'Testing',
    energy: 58,
    morale: 69,
    focus: 73,
    current: 'E2E run 7/12',
    location: 'Range',
    xp: 39,
    avatar: '🛡️',
  },
]

const missions = [
  {
    title: 'E2E suite: onboarding rewrite',
    eta: '11m',
    risk: 'Low',
    squad: 'C-17 + MX-31',
  },
  {
    title: 'AI reviews: billing engine PR #492',
    eta: '22m',
    risk: 'Medium',
    squad: 'Zoe + Gemini',
  },
  {
    title: 'UI snapshots: /agents/board',
    eta: '4m',
    risk: 'Low',
    squad: 'Claude',
  },
]

const signals = [
  '🧪 CI green across 4 worktrees',
  '🛰️ 2 new feature requests triaged',
  '🛠️ Auto-retry armed for flaky tests',
  '🧭 Claude flagged a11y contrast drift',
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

function App() {
  return (
    <div className="dashboard">
      <header className="topbar">
        <div>
          <p className="eyebrow">OpenBoard • Agent Ops Console</p>
          <h1>Guild Ledger</h1>
          <p className="sub">
            Real-time orchestration of autonomous squads, with RPG cadence and
            full command authority.
          </p>
        </div>
        <div className="status">
          <div>
            <span className="pulse" />
            Live sync
          </div>
          <button className="primary">Deploy new agent</button>
          <button>Queue mission</button>
        </div>
      </header>

      <section className="grid">
        <div className="panel panel--wide">
          <div className="panel__header">
            <h2>Roster</h2>
            <span>5 active • 2 resting • 1 queued</span>
          </div>
          <div className="roster">
            <div className="roster__header">
              <span>Agent</span>
              <span>Role</span>
              <span>Status</span>
              <span>Vitals</span>
              <span>Quest Log</span>
              <span>XP</span>
            </div>
            {agents.map((agent) => (
              <div className="roster__row" key={agent.id}>
                <div className="agent">
                  <div className="agent__avatar">{agent.avatar}</div>
                  <div>
                    <strong>{agent.name}</strong>
                    <span>{agent.id} • Lvl {agent.level}</span>
                  </div>
                </div>
                <div className="role">
                  <strong>{agent.role}</strong>
                  <span>{agent.location}</span>
                </div>
                <div className={`badge badge--${agent.status.toLowerCase()}`}>
                  {agent.status}
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
                <div className="quest">
                  <strong>{agent.current}</strong>
                  <span>Last ping 1m ago</span>
                </div>
                <div className="xp">
                  <div className="xp__ring">
                    <span style={{ '--xp': `${agent.xp}%` } as React.CSSProperties} />
                  </div>
                  <em>{agent.xp}%</em>
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
              <div className="mission__item" key={mission.title}>
                <strong>{mission.title}</strong>
                <div>
                  <span>ETA {mission.eta}</span>
                  <span className={`risk risk--${mission.risk.toLowerCase()}`}>
                    {mission.risk} risk
                  </span>
                </div>
                <em>{mission.squad}</em>
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
            {signals.map((signal) => (
              <li key={signal}>{signal}</li>
            ))}
          </ul>
          <div className="summary">
            <div>
              <h3>Swarm Health</h3>
              <p>92%</p>
            </div>
            <div>
              <h3>Open PRs</h3>
              <p>7</p>
            </div>
            <div>
              <h3>CI Velocity</h3>
              <p>1.3x</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default App
