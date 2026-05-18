import { useRef, useEffect } from 'react'
import styles from './AutocompleteDropdown.module.css'

interface AutocompleteDropdownProps {
  items: string[]
  selectedIndex: number
  onSelect: (item: string) => void
}

export default function AutocompleteDropdown({
  items,
  selectedIndex,
  onSelect,
}: AutocompleteDropdownProps) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current && selectedIndex >= 0) {
      const children = listRef.current.children
      if (children[selectedIndex]) {
        children[selectedIndex].scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  if (items.length === 0) return null

  return (
    <div className={styles.dropdown} ref={listRef}>
      {items.map((item, i) => (
        <div
          key={item}
          className={`${styles.item} ${i === selectedIndex ? styles.selected : ''}`}
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(item)
          }}
          onMouseEnter={() => {
            // Could track hover index
          }}
        >
          {item}
        </div>
      ))}
    </div>
  )
}
