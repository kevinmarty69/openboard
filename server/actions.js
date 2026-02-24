import { exec } from 'node:child_process'

const ENABLE_SHELL_ACTIONS = process.env.ENABLE_SHELL_ACTIONS === 'true'
const RAW_ALLOWED = (process.env.ALLOWED_COMMANDS || '')
  .split(',')
  .map((cmd) => cmd.trim())
  .filter(Boolean)

const DEFAULT_ALLOWED = ['tmux', 'openclaw', 'gh', 'git']
const ALLOWED_COMMANDS = RAW_ALLOWED.length > 0 ? RAW_ALLOWED : DEFAULT_ALLOWED

function isAllowed(cmd) {
  if (!ENABLE_SHELL_ACTIONS) return false
  return ALLOWED_COMMANDS.some((allowed) => cmd.startsWith(allowed))
}

export function runShell(cmd) {
  return new Promise((resolve, reject) => {
    if (!isAllowed(cmd)) {
      reject(new Error('Command not allowed'))
      return
    }
    exec(cmd, { timeout: 60_000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message))
        return
      }
      resolve(stdout.trim())
    })
  })
}
