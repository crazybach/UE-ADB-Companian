import { useState, useCallback, useRef, useEffect } from 'react'
import { useAppStore } from '../../stores/app-store'
import { useAutocomplete } from '../../hooks/use-autocomplete'
import AutocompleteDropdown from './AutocompleteDropdown'
import styles from './CommandSection.module.css'

interface CommandSectionProps {
  onSend: (cmd: string) => void
  autocompletePlacement?: 'top' | 'bottom'
}

export default function CommandSection({
  onSend,
  autocompletePlacement = 'bottom',
}: CommandSectionProps) {
  const [input, setInput] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [dropdownMode, setDropdownMode] = useState<'autocomplete' | 'history'>('autocomplete')
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const { matches } = useAutocomplete(input)
  const commandHistory = useAppStore((s) => s.commandHistory)
  const addToHistory = useAppStore((s) => s.addCommandToHistory)

  const dropdownItems = dropdownMode === 'autocomplete' ? matches : commandHistory

  const handleSend = useCallback(() => {
    const cmd = input.trim()
    if (!cmd) return
    onSend(cmd)
    addToHistory(cmd)
    setInput('')
    setDropdownOpen(false)
  }, [input, onSend, addToHistory])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (dropdownOpen && selectedIndex >= 0) {
          const selected = dropdownItems[selectedIndex]
          setInput(selected)
          setDropdownOpen(false)
          setSelectedIndex(-1)
        } else {
          handleSend()
        }
      } else if (e.key === 'Escape') {
        setDropdownOpen(false)
        setSelectedIndex(-1)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (!dropdownOpen && input === '' && commandHistory.length > 0) {
          // Show history when input is empty
          setDropdownMode('history')
          setDropdownOpen(true)
          setSelectedIndex(0)
          setInput(commandHistory[0])
        } else if (dropdownOpen) {
          setSelectedIndex((prev) =>
            prev < dropdownItems.length - 1 ? prev + 1 : 0,
          )
          if (dropdownMode === 'history') {
            const next = Math.min(selectedIndex + 1, commandHistory.length - 1)
            setInput(commandHistory[next])
          }
        } else if (matches.length > 0) {
          setDropdownMode('autocomplete')
          setDropdownOpen(true)
          setSelectedIndex(0)
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (dropdownOpen) {
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : dropdownItems.length - 1,
          )
          if (dropdownMode === 'history' && selectedIndex > 0) {
            setInput(commandHistory[selectedIndex - 1])
          }
        } else if (input === '' && commandHistory.length > 0) {
          setDropdownMode('history')
          setDropdownOpen(true)
          setSelectedIndex(0)
          setInput(commandHistory[0])
        }
      }
    },
    [dropdownOpen, selectedIndex, dropdownItems, dropdownMode, matches, commandHistory, input, handleSend],
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setInput(val)
    setSelectedIndex(-1)
    if (val.trim() && matches.length > 0) {
      setDropdownMode('autocomplete')
      setDropdownOpen(true)
    } else {
      setDropdownOpen(false)
    }
  }

  const handleSelectItem = useCallback(
    (item: string) => {
      setInput(item)
      setDropdownOpen(false)
      setSelectedIndex(-1)
      inputRef.current?.focus()
    },
    [],
  )

  return (
    <div className={styles.row}>
      <label className={styles.label}>Command:</label>
      <div className={styles.inputWrapper}>
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (input.trim() && matches.length > 0) {
              setDropdownMode('autocomplete')
              setDropdownOpen(true)
            }
          }}
          onBlur={() => {
            // Delay close to allow click on dropdown
            setTimeout(() => setDropdownOpen(false), 200)
          }}
          placeholder="Enter UE console command..."
        />
        {dropdownOpen && dropdownItems.length > 0 && (
          <AutocompleteDropdown
            items={dropdownItems}
            selectedIndex={selectedIndex}
            onSelect={handleSelectItem}
            placement={autocompletePlacement}
          />
        )}
      </div>
      <button className={styles.sendBtn} onClick={handleSend}>
        Send
      </button>
    </div>
  )
}
