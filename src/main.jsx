import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { ThemeProvider } from './context/ThemeContext'
import { DataProvider } from './context/DataContext'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename="/ai/agenthub">
      <DataProvider>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </DataProvider>
    </BrowserRouter>
  </StrictMode>,
)
