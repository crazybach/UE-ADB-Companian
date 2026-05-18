import { HashRouter, Routes, Route } from 'react-router-dom'
import MainScreen from './components/screens/MainScreen'
import ScreenCaptureScreen from './components/screens/ScreenCaptureScreen'
import CommandPaletteScreen from './components/screens/CommandPaletteScreen'
import LocalPreviewScreen from './components/screens/LocalPreviewScreen'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<MainScreen />} />
        <Route path="/capture" element={<ScreenCaptureScreen />} />
        <Route path="/palette" element={<CommandPaletteScreen />} />
        <Route path="/preview" element={<LocalPreviewScreen />} />
      </Routes>
    </HashRouter>
  )
}
