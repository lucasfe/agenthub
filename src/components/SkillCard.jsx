import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Wand2, ExternalLink, Copy, Check, Plus } from 'lucide-react'

const SKILL_CREATOR_PATH = '/agent/ai-specialists/skill-creator'

function buildInstallCommand(slug) {
  return `npx degit lucasfe/skills/${slug} ~/.claude/skills/${slug}`
}

export default function SkillCard({ skill, variant }) {
  const [copied, setCopied] = useState(false)
  const navigate = useNavigate()

  if (variant === 'create') {
    return (
      <Link
        to={SKILL_CREATOR_PATH}
        className="group flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-dashed border-border-subtle hover:border-accent-blue/60 hover:bg-bg-card-hover transition-all duration-200 min-h-[180px] text-center"
      >
        <div className="w-11 h-11 rounded-xl bg-accent-blue/10 flex items-center justify-center mb-3 group-hover:bg-accent-blue/20 transition-colors">
          <Plus size={20} className="text-accent-blue" />
        </div>
        <h3 className="text-base font-semibold text-text-primary group-hover:text-accent-blue transition-colors">
          Create skill
        </h3>
        <p className="text-xs text-text-secondary mt-1 max-w-[16rem]">
          Author a new skill with the Skill Creator agent
        </p>
      </Link>
    )
  }

  const installCommand = buildInstallCommand(skill.slug)

  const handleCopy = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    await navigator.clipboard.writeText(installCommand)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Link
      to={`/skills/${skill.slug}`}
      className="group relative p-5 bg-bg-card border border-border-subtle rounded-2xl hover:bg-bg-card-hover card-glow transition-all duration-200 hover:-translate-y-0.5 flex flex-col"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="card-icon w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500/15 to-purple-600/5 flex items-center justify-center">
          <Wand2 size={20} className="text-purple-400" />
        </div>
        <a
          href={skill.sourceUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="View on GitHub"
          onClick={(e) => e.stopPropagation()}
          className="text-text-muted hover:text-text-primary transition-colors p-1.5 rounded-lg hover:bg-white/5"
        >
          <ExternalLink size={16} />
        </a>
      </div>

      <h3 className="text-base font-semibold text-text-primary mb-1.5">
        {skill.name}
      </h3>

      <p className="text-xs leading-relaxed text-text-secondary mb-4 flex-1 line-clamp-3">
        {skill.description}
      </p>

      <button
        type="button"
        onClick={handleCopy}
        className={`flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
          copied
            ? 'bg-accent-green/15 text-accent-green'
            : 'bg-bg-input text-text-secondary hover:bg-white/5 hover:text-text-primary'
        }`}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? 'Copied!' : 'Copy install command'}
      </button>
    </Link>
  )
}
