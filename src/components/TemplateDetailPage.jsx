import { Link, useParams } from 'react-router'
import { ArrowLeft, LayoutTemplate } from 'lucide-react'
import Header from './Header'

export default function TemplateDetailPage() {
  const { id } = useParams()

  return (
    <>
      <Header />
      <section className="px-8 pt-8 pb-6">
        <Link
          to="/templates"
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors mb-6"
        >
          <ArrowLeft size={16} />
          Back to templates
        </Link>
        <div className="flex items-center gap-5">
          <div className="hero-icon w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-500/5 border border-purple-500/20 flex items-center justify-center">
            <LayoutTemplate size={32} className="text-purple-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-text-primary tracking-tight">Template details</h1>
            <p className="text-text-secondary text-base mt-0.5">
              ID: <code className="font-mono text-sm text-text-muted">{id}</code>
            </p>
          </div>
        </div>
      </section>

      <div className="px-8 pb-12">
        <div className="rounded-2xl border border-border-subtle bg-bg-card p-8 text-center">
          <p className="text-text-muted text-base">
            The full template detail view is coming soon.
          </p>
          <p className="text-text-muted/60 text-sm mt-2">
            For now this page exists so the &quot;Usar template&quot; CTA has a destination.
          </p>
        </div>
      </div>
    </>
  )
}
