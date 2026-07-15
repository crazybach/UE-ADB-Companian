import { HashRouter, Routes, Route } from 'react-router-dom'
import MainScreen from './components/screens/MainScreen'
import ScreenCaptureScreen from './components/screens/ScreenCaptureScreen'
import CommandPaletteScreen from './components/screens/CommandPaletteScreen'
import LocalPreviewScreen from './components/screens/LocalPreviewScreen'
import CotfServerScreen from './components/screens/CotfServerScreen'
import CotfClientScreen from './components/screens/CotfClientScreen'
import PullLogsScreen from './components/screens/PullLogsScreen'
import AutoTestScreen from './components/screens/AutoTestScreen'
import TextureMemoryScreen from './components/screens/TextureMemoryScreen'
import ObjectMemoryScreen from './components/screens/ObjectMemoryScreen'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<MainScreen />} />
        <Route path="/capture" element={<ScreenCaptureScreen />} />
        <Route path="/palette" element={<CommandPaletteScreen />} />
        <Route path="/preview" element={<LocalPreviewScreen />} />
        <Route path="/cotf-server" element={<CotfServerScreen />} />
        <Route path="/cotf-client" element={<CotfClientScreen />} />
        <Route path="/pull-logs" element={<PullLogsScreen />} />
        <Route path="/auto-test" element={<AutoTestScreen />} />
        <Route path="/texture-memory" element={<TextureMemoryScreen />} />
        <Route path="/static-mesh-memory" element={<ObjectMemoryScreen kind="static-mesh" />} />
        <Route path="/skeletal-mesh-memory" element={<ObjectMemoryScreen kind="skeletal-mesh" />} />
        <Route path="/static-mesh-component-memory" element={<ObjectMemoryScreen kind="static-mesh-component" />} />
      </Routes>
    </HashRouter>
  )
}
