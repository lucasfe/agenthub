import { render } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import { ThemeProvider } from '../context/ThemeContext'
import { StackProvider } from '../context/StackContext'

export function renderWithProviders(component, options = {}) {
  return render(
    <BrowserRouter>
      <ThemeProvider>
        <StackProvider>
          {component}
        </StackProvider>
      </ThemeProvider>
    </BrowserRouter>,
    options
  )
}

export * from '@testing-library/react'
