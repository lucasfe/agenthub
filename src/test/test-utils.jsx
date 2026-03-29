import { render } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import { ThemeProvider } from '../context/ThemeContext'
import { StackProvider } from '../context/StackContext'
import { DataProvider } from '../context/DataContext'

export function renderWithProviders(component, options = {}) {
  return render(
    <BrowserRouter>
      <DataProvider>
        <ThemeProvider>
          <StackProvider>
            {component}
          </StackProvider>
        </ThemeProvider>
      </DataProvider>
    </BrowserRouter>,
    options
  )
}

export * from '@testing-library/react'
