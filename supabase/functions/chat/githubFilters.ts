// Pure repo filter for the GitHub Issue Creator agent.
//
// Takes the raw array from the GitHub /user/repos response and returns the
// slim, filtered list the agent reasons about. Excludes archived repos
// (cannot accept new issues), forks (issues belong on the upstream), and
// empty repos with size === 0 (clutter without value). Maps survivors to the
// minimal shape so the LLM's working set stays compact.

export interface SlimRepo {
  name: string
  full_name: string
  description: string | null
  pushed_at: string
}

export interface RawRepo {
  name?: unknown
  full_name?: unknown
  description?: unknown
  pushed_at?: unknown
  archived?: unknown
  fork?: unknown
  size?: unknown
  [key: string]: unknown
}

export function filterAndSlim(repos: readonly RawRepo[]): SlimRepo[] {
  if (!Array.isArray(repos)) return []
  const out: SlimRepo[] = []
  for (const repo of repos) {
    if (!repo || typeof repo !== 'object') continue
    if (repo.archived === true) continue
    if (repo.fork === true) continue
    if (repo.size === 0) continue
    if (typeof repo.name !== 'string' || typeof repo.full_name !== 'string') continue
    if (typeof repo.pushed_at !== 'string') continue
    const description =
      typeof repo.description === 'string' ? repo.description : null
    out.push({
      name: repo.name,
      full_name: repo.full_name,
      description,
      pushed_at: repo.pushed_at,
    })
  }
  return out
}
