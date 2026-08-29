export function isDefaultTitle(title: string) {
  return /^(New session - |Child session - )\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(title)
}

export function recentSidebarSessions<T extends { id: string; parentID?: string; time: { updated: number } }>(
  sessions: ReadonlyArray<T>,
  currentID: string,
  limit = 12,
) {
  const recency = (left: T, right: T) => right.time.updated - left.time.updated
  const current = sessions.find((session) => session.id === currentID)
  if (!current) return sessions.toSorted(recency).slice(0, limit)

  const familyID = current.parentID ?? currentID
  const family = sessions.filter((session) => session.id === familyID || session.parentID === familyID)
  const familyIDs = new Set(family.map((session) => session.id))
  const others = sessions.filter((session) => !familyIDs.has(session.id)).toSorted(recency)
  const familySorted = family.toSorted((left, right) => {
    if (left.id === familyID) return -1
    if (right.id === familyID) return 1
    return recency(left, right)
  })
  return [...familySorted, ...others].slice(0, limit)
}
