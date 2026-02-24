import { runShell } from './actions.js'

export async function listPRs(repo) {
  try {
    const args = repo ? `--repo ${repo}` : ''
    const cmd = `gh pr list ${args} --state open --json number,title,author,headRefName,createdAt,reviewDecision,mergeable`;
    const out = await runShell(cmd)
    return JSON.parse(out || '[]')
  } catch {
    return []
  }
}

export async function prChecks(repo, prNumber) {
  try {
    const cmd = `gh pr checks ${prNumber} ${repo ? `--repo ${repo}` : ''} --json name,conclusion,state`;
    const out = await runShell(cmd)
    return JSON.parse(out || '[]')
  } catch {
    return []
  }
}

export async function prDetails(repo, prNumber) {
  try {
    const cmd = `gh pr view ${prNumber} ${repo ? `--repo ${repo}` : ''} --json body,files,mergeable,reviewDecision`;
    const out = await runShell(cmd)
    return JSON.parse(out || '{}')
  } catch {
    return {}
  }
}

export async function autoMerge(repo, prNumber) {
  const cmd = `gh pr merge ${prNumber} ${repo ? `--repo ${repo}` : ''} --squash --auto`;
  return runShell(cmd)
}
