import { Copy, Terminal } from 'lucide-react'
import type { LogEntry } from '../../shared/contracts'
export function LogsView({ logs, onCopy }: { logs: LogEntry[]; onCopy(): void }) {
  return <section className="panel log-panel"><div className="panel-heading"><h2><Terminal size={17}/> Launcher activity</h2><button className="secondary" onClick={onCopy} disabled={!logs.length}><Copy size={14}/> Copy logs</button></div>
    <div className="log-output" aria-label="Launcher logs" role="log">{logs.length ? logs.map((line, i) => <div className={`log-line ${line.level}`} key={`${line.time}-${i}`}><time>{new Date(line.time).toLocaleTimeString()}</time><span>{line.message}</span></div>) : <p>No activity yet. Your next adventure starts with a launch.</p>}</div>
  </section>
}
