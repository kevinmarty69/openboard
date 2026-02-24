import { exec } from 'node:child_process'
import { nanoid } from 'nanoid'

const ENABLE_SHELL_ACTIONS = process.env.ENABLE_SHELL_ACTIONS === 'true'
const ALLOWED_COMMANDS = (process.env.ALLOWED_COMMANDS || '')
  .split(',')
  .map((cmd) => cmd.trim())
  .filter(Boolean)

function isAllowed(cmd) {
  if (!ENABLE_SHELL_ACTIONS) return false
  if (ALLOWED_COMMANDS.length === 0) return false
  return ALLOWED_COMMANDS.some((allowed) => cmd.startsWith(allowed))
}

function runShell(cmd) {
  return new Promise((resolve, reject) => {
    if (!isAllowed(cmd)) {
      reject(new Error('Command not allowed'))
      return
    }
    exec(cmd, { timeout: 120_000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message))
        return
      }
      resolve(stdout.trim())
    })
  })
}

export async function spawnMissionWorktree({
  repoPath,
  branch,
  worktreePath,
  role,
  prompt,
  model = 'gpt-5.2-codex',
  reasoning = 'high',
}) {
  const safeBranch = branch || `mission/${Date.now()}-${nanoid(4)}`
  const safeWorktree = worktreePath || `${repoPath}-worktrees/${safeBranch}`
  const session = `role:${role}`

  await runShell(`mkdir -p ${safeWorktree}`)
  await runShell(`git -C ${repoPath} worktree add ${safeWorktree} -b ${safeBranch} origin/main`)
  await runShell(`tmux new-session -d -s ${session} -c ${safeWorktree} "codex exec --full-auto --model ${model} -c \\\"model_reasoning_effort=${reasoning}\\\" ${shellQuote(prompt)}"`)

  return { session, branch: safeBranch, worktree: safeWorktree }
}

export async function createRepo({ name }) {
  const repo = name.toLowerCase().replace(/\s+/g, '-')
  await runShell(`gh repo create ${repo} --public`)
  return { repo }
}

function shellQuote(value) {
  const safe = String(value).replace(/'/g, "'\\''")
  return `'${safe}'`
}
