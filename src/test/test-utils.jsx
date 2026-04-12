import { render } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import { ThemeProvider } from '../context/ThemeContext'
import { StackProvider } from '../context/StackContext'
import { DataProvider } from '../context/DataContext'
import { AuthProvider } from '../context/AuthContext'

export function renderWithProviders(component, options = {}) {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <DataProvider>
          <ThemeProvider>
            <StackProvider>
              {component}
            </StackProvider>
          </ThemeProvider>
        </DataProvider>
      </AuthProvider>
    </BrowserRouter>,
    options
  )
}

export * from '@testing-library/react'
