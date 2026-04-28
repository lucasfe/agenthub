import { useEffect, useState } from 'react'
import { Wand2 } from 'lucide-react'
import Header from './Header'
import SkillCard from './SkillCard'
import { listSkills } from '../lib/skills'
import { useAuth } from '../context/AuthContext'

export default function SkillsPage() {
  const { session } = useAuth()
  const accessToken = session?.access_token
  const [skills, setSkills] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    setLoading(true)
    setError(null)
    listSkills({ accessToken })
      .then((result) => {
        if (cancelled) return
        setSkills(Array.isArray(result) ? result : [])
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.message || 'Failed to load skills')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [accessToken])

  return (
    <>
      <Header />
      <section className="px-8 pt-8 pb-6">
        <div className="flex items-center gap-5">
          <div className="hero-icon w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-500/5 border border-purple-500/20 flex items-center justify-center">
            <Wand2 size={32} className="text-purple-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-text-primary tracking-tight">Skills</h1>
            <p className="text-text-secondary text-base mt-0.5">
              Claude Code skills you can install with one command
            </p>
          </div>
        </div>
      </section>

      <div className="px-8 pb-12">
        {loading ? (
          <div className="text-center py-16" role="status">
            <p className="text-text-muted text-lg">Loading skills...</p>
          </div>
        ) : error ? (
          <div className="text-center py-16" role="alert">
            <p className="text-text-muted text-lg">Failed to load skills</p>
            <p className="text-text-muted/60 text-sm mt-1">{error}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {skills.map((skill) => (
              <SkillCard key={skill.slug} skill={skill} />
            ))}
            <SkillCard variant="create" />
          </div>
        )}
      </div>
    </>
  )
}
