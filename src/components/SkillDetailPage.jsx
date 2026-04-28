import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, Wand2, ExternalLink, Copy, Check } from 'lucide-react'
import Header from './Header'
import Markdown from '../lib/markdown'
import { getSkill } from '../lib/skills'
import { useAuth } from '../context/AuthContext'

function buildInstallCommand(slug) {
  return `npx degit lucasfe/skills/${slug} ~/.claude/skills/${slug}`
}

export default function SkillDetailPage() {
  const { slug } = useParams()
  const { session } = useAuth()
  const accessToken = session?.access_token
  const [skill, setSkill] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setSkill(null)
    getSkill(slug, { accessToken })
      .then((result) => {
        if (cancelled) return
        setSkill(result)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.message || 'Failed to load skill')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [slug, accessToken])

  const installCommand = skill ? buildInstallCommand(skill.slug) : ''

  const handleCopy = async () => {
    if (!installCommand) return
    await navigator.clipboard.writeText(installCommand)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <>
        <Header />
        <div className="px-8 py-12 text-text-muted" role="status">
          Loading skill...
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <Header />
        <div className="px-8 py-12" role="alert">
          <p className="text-text-muted text-lg">Failed to load skill</p>
          <p className="text-text-muted/60 text-sm mt-1">{error}</p>
          <Link
            to="/skills"
            className="text-accent-blue text-sm mt-4 inline-block hover:underline"
          >
            Back to skills
          </Link>
        </div>
      </>
    )
  }

  if (!skill) {
    return (
      <>
        <Header />
        <div className="flex-1 flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <p className="text-text-muted text-lg">Skill not found</p>
            <Link
              to="/skills"
              className="text-accent-blue text-sm mt-2 inline-block hover:underline"
            >
              Back to skills
            </Link>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Header />
      <div className="px-8 py-6 max-w-5xl">
        <Link
          to="/skills"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors mb-6"
        >
          <ArrowLeft size={16} />
          Back to skills
        </Link>

        <div className="flex items-start gap-5 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/15 to-purple-600/5 flex items-center justify-center shrink-0">
            <Wand2 size={28} className="text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-text-primary">{skill.name}</h1>
            <p className="text-text-secondary text-sm mt-1">{skill.description}</p>
          </div>
        </div>

        <div className="mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">
            Install
          </p>
          <div className="flex items-stretch gap-2">
            <code className="flex-1 bg-bg-card border border-border-subtle rounded-xl px-4 py-3 text-sm font-mono text-text-secondary overflow-x-auto whitespace-nowrap">
              {installCommand}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy install command"
              className={`flex items-center justify-center gap-2 px-4 rounded-xl text-sm font-medium transition-colors ${
                copied
                  ? 'bg-accent-green/15 text-accent-green'
                  : 'bg-bg-card border border-border-subtle text-text-secondary hover:bg-white/5 hover:text-text-primary'
              }`}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="bg-bg-card border border-border-subtle rounded-2xl p-6 prose-dark mb-6">
          <Markdown text={skill.body} />
        </div>

        <a
          href={skill.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          <ExternalLink size={14} />
          View source on GitHub
        </a>
      </div>
    </>
  )
}
