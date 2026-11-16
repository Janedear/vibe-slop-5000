/**
 * Display only observed connection state. Absence of a live source always
 * means synthetic demo mode, regardless of whether mock events are running.
 */
export function formatNCMStatus(hasLiveSource: boolean, isConnected: boolean, nAgents: number): string {
  if (!hasLiveSource) return `○ DEMO  ${nAgents} agents`
  if (isConnected) return `● LIVE  ${nAgents} agents`
  return `○ OFFLINE  ${nAgents} agents`
}
