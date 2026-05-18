import { useState, useMemo, useEffect } from 'react'
import commandsData from '../data/ue_console_commands.json'

const COMMANDS: string[] = commandsData.commands || []

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase()
  const t = target.toLowerCase()

  if (t === q) return 1000
  if (t.startsWith(q)) return 500 + (t.length - q.length)
  if (t.includes(q)) return 300

  let qi = 0
  let score = 0
  let consecutive = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++
      consecutive++
      score += consecutive * 10
    } else {
      consecutive = 0
    }
  }

  if (qi === q.length) return score
  return 0
}

export function useAutocomplete(input: string, maxResults = 20) {
  const loaded = COMMANDS.length > 0

  const matches = useMemo(() => {
    if (!input.trim() || !loaded) return []
    const scored = COMMANDS.map((cmd) => ({ cmd, score: fuzzyScore(input, cmd) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
    return scored.map(({ cmd }) => cmd)
  }, [input, maxResults])

  return { matches, loaded }
}
