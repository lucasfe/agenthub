import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { Routes, Route, MemoryRouter } from 'react-router'
import { render } from '@testing-library/react'
import TemplateDetailPage from './TemplateDetailPage'
import { ThemeProvider } from '../context/ThemeContext'
import { DataProvider } from '../context/DataContext'

vi.mock('../lib/api', () => ({
  fetchTeams: vi.fn().mockResolvedValue([]),
  fetchTools: vi.fn().mockResolvedValue([]),
  trackAgentUsage: vi.fn().mockResolvedValue(null),
}))

vi.mock('../lib/agentsRepo', () => ({
  listAgents: vi.fn().mockResolvedValue([]),
  getAgent: vi.fn(),
  createAgent: vi.fn(),
  updateAgent: vi.fn(),
  deleteAgent: vi.fn(),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    session: { access_token: 'test-access-token' },
    user: { email: 'lucasfe@gmail.com' },
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}))

function renderAtRoute(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DataProvider>
        <ThemeProvider>
          <Routes>
            <Route path="/templates/:id" element={<TemplateDetailPage />} />
          </Routes>
        </ThemeProvider>
      </DataProvider>
    </MemoryRouter>,
  )
}

describe('TemplateDetailPage', () => {
  it('renders the template id pulled from the URL', () => {
    renderAtRoute('/templates/tpl-123')
    expect(screen.getByText('tpl-123')).toBeInTheDocument()
  })

  it('renders a back link to /templates', () => {
    renderAtRoute('/templates/tpl-456')
    const back = screen.getByRole('link', { name: /back to templates/i })
    expect(back).toHaveAttribute('href', '/templates')
  })
})
