import { nanoid } from 'nanoid'
import { runShell } from './actions.js'

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

export async function createRepo({ name, baseDir = '/Users/kevinmarty/opendev' }) {
  const repo = name.toLowerCase().replace(/\s+/g, '-')
  await runShell(`gh repo create ${repo} --public --confirm`)
  await runShell(`git clone git@github.com:kevinmarty69/${repo}.git ${baseDir}/${repo}`)
  return { repo, repoPath: `${baseDir}/${repo}` }
}

function shellQuote(value) {
  const safe = String(value).replace(/'/g, "'\\''")
  return `'${safe}'`
}
