import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css' // <-- ESTA LÍNEA ES LA MAGIA. LE DICE A VITE QUE PROCESE TU CSS DE TAILWIND.

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)