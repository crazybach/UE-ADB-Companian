import { useState, useMemo } from 'react'
import previewData from '../../data/ue_local_preview.json'
import styles from './LocalPreviewScreen.module.css'

interface SelectItem {
  display_name: string
  value: string
}

interface PreviewConfig {
  levels: SelectItem[]
  tanks: SelectItem[]
  skins: SelectItem[]
  defaults: {
    level: string
    tank: string
    skin: string
  }
}

export default function LocalPreviewScreen() {
  const config: PreviewConfig = useMemo(() => previewData as unknown as PreviewConfig, [])

  const [level, setLevel] = useState(config.defaults.level)
  const [tank, setTank] = useState(config.defaults.tank)
  const [skin, setSkin] = useState(config.defaults.skin)

  const handlePreview = async () => {
    const cmd = `quickpreview ${level} ${tank} ${skin}`
    try {
      await window.electronAPI.sendCommand(cmd)
    } catch { /* ADB error */ }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>Local Preview</div>
      <div className={styles.content}>
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Level</div>
          <div className={styles.radioGroup}>
            {config.levels.map((l) => (
              <label key={l.value} className={styles.radio}>
                <input
                  type="radio"
                  name="level"
                  value={l.value}
                  checked={level === l.value}
                  onChange={() => setLevel(l.value)}
                />
                <span>{l.display_name}</span>
              </label>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Tank</div>
          <div className={styles.tankGrid}>
            {config.tanks.map((t) => (
              <label key={t.value} className={styles.radio}>
                <input
                  type="radio"
                  name="tank"
                  value={t.value}
                  checked={tank === t.value}
                  onChange={() => setTank(t.value)}
                />
                <span>{t.display_name}</span>
              </label>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Skin</div>
          <div className={styles.radioGroup}>
            {config.skins.map((s) => (
              <label key={s.value} className={styles.radio}>
                <input
                  type="radio"
                  name="skin"
                  value={s.value}
                  checked={skin === s.value}
                  onChange={() => setSkin(s.value)}
                />
                <span>{s.display_name}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <button className={styles.previewBtn} onClick={handlePreview}>
          Preview
        </button>
      </div>
    </div>
  )
}
