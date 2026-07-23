import { useCallback, useState } from 'react'
import CommandSection from '../command/CommandSection'
import styles from './RemoteCommandScreen.module.css'

export default function RemoteCommandScreen() {
  const [host, setHost] = useState('')
  const [port, setPort] = useState('24002')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<RemoteCommandResult | null>(null)

  const handleSend = useCallback(async (command: string) => {
    if (sending) return
    setSending(true)
    setResult(null)
    try {
      setResult(await window.electronAPI.sendRemoteCommand(host, port, command))
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send the remote command.',
      })
    } finally {
      setSending(false)
    }
  }, [host, port, sending])

  return (
    <div className={styles.container}>
      <header className={styles.header}>Remote Command Line</header>

      <section className={styles.connectionBar}>
        <label className={styles.hostField}>
          <span>Device IP</span>
          <input
            type="text"
            value={host}
            onChange={(event) => setHost(event.target.value)}
            placeholder="10.183.74.103"
            spellCheck={false}
          />
        </label>
        <label className={styles.portField}>
          <span>Port</span>
          <input
            type="text"
            inputMode="numeric"
            value={port}
            onChange={(event) => setPort(event.target.value)}
            spellCheck={false}
          />
        </label>
      </section>

      <main className={styles.resultArea}>
        {result?.curlCommand && (
          <div className={styles.resultBlock}>
            <div className={styles.resultLabel}>Request</div>
            <code className={styles.request}>{result.curlCommand}</code>
          </div>
        )}
        {(result?.response || result?.error) && (
          <div className={styles.resultBlock}>
            <div className={styles.resultLabel}>
              Response{result.statusCode ? ` (${result.statusCode})` : ''}
            </div>
            <pre className={result.success ? styles.response : styles.error}>
              {result.response || result.error}
            </pre>
          </div>
        )}
      </main>

      <footer className={styles.commandArea}>
        <div className={styles.status} data-success={result?.success || undefined}>
          {sending ? 'Sending...' : result ? (result.success ? 'Sent' : 'Failed') : 'Ready'}
        </div>
        <CommandSection onSend={handleSend} autocompletePlacement="top" />
      </footer>
    </div>
  )
}
