import { Bot, Plus, Users } from 'lucide-react'
import { Link } from 'react-router'

const variants = {
  agents: {
    icon: Bot,
    title: 'Agents',
    subtitle: 'Specialized AI agents for every development task',
    createLabel: 'Create Agent',
    createPath: '/create',
    color: 'from-accent-green/20 to-accent-green/5 border-accent-green/20',
    iconColor: 'text-accent-green',
  },
  teams: {
    icon: Users,
    title: 'Teams',
    subtitle: 'Coordinate groups of agents working together',
    createLabel: 'Create Team',
    createPath: '/teams/create',
    color: 'from-accent-blue/20 to-accent-blue/5 border-accent-blue/20',
    iconColor: 'text-accent-blue',
  },
}

export default function HeroSection({ variant = 'agents' }) {
  const v = variants[variant]
  const IconComponent = v.icon

  return (
    <section className="px-8 pt-8 pb-6">
      <div className="flex items-center gap-5">
        <div className={`hero-icon w-16 h-16 rounded-2xl bg-gradient-to-br ${v.color} border flex items-center justify-center cursor-pointer`}>
          <IconComponent size={32} className={v.iconColor} />
        </div>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">{v.title}</h1>
          <p className="text-text-secondary text-base mt-0.5">{v.subtitle}</p>
        </div>
        <Link
          to={v.createPath}
          className="flex items-center gap-2 px-5 py-2.5 bg-accent-blue text-white text-sm font-medium rounded-xl hover:bg-accent-blue/90 transition-colors"
        >
          <Plus size={16} />
          {v.createLabel}
        </Link>
      </div>
    </section>
  )
}
