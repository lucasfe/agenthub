import { useEffect, useState } from 'react'
import { LayoutTemplate } from 'lucide-react'
import Header from './Header'
import TemplateCard from './TemplateCard'
import { fetchTemplates } from '../lib/templatesApi'

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchTemplates()
      .then((result) => {
        if (cancelled) return
        setTemplates(Array.isArray(result) ? result : [])
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.message || 'Failed to load templates')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  return (
    <>
      <Header />
      <section className="px-8 pt-8 pb-6">
        <div className="flex items-center gap-5">
          <div className="hero-icon w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-500/5 border border-purple-500/20 flex items-center justify-center">
            <LayoutTemplate size={32} className="text-purple-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-text-primary tracking-tight">Templates</h1>
            <p className="text-text-secondary text-base mt-0.5">
              Reusable Kanban tickets you can spin up in one click
            </p>
          </div>
        </div>
      </section>

      <div className="px-8 pb-12">
        {loading ? (
          <div className="text-center py-16" role="status">
            <p className="text-text-muted text-lg">Loading templates...</p>
          </div>
        ) : error ? (
          <div className="text-center py-16" role="alert">
            <p className="text-text-muted text-lg">Failed to load templates</p>
            <p className="text-text-muted/60 text-sm mt-1">{error}</p>
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-text-muted text-lg">No templates yet</p>
            <p className="text-text-muted/60 text-sm mt-1">
              Save a board ticket as a template to see it here
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <TemplateCard key={template.id} template={template} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
