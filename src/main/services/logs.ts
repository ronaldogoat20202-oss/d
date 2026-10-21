import type { LogEntry } from '../../shared/contracts'
export class LogService {
  private lines: LogEntry[] = []
  private secrets = new Set<string>()
  registerSecret(secret: string): void { if (secret) this.secrets.add(secret) }
  append(level: 'info' | 'error', text: string): void {
    let safe = String(text)
    for (const secret of this.secrets) safe = safe.split(secret).join('[redacted]')
    safe = safe.replace(/((?:authorization|access[_-]?token|refresh[_-]?token|identityToken)\s*[=:]\s*)(?:Bearer\s+)?[^\s,;]+/gi, '$1[redacted]')
    this.lines.push({ time: Date.now(), level, message: safe.slice(0, 4096) })
    if (this.lines.length > 1000) this.lines.splice(0, this.lines.length - 1000)
  }
  entries(): LogEntry[] { return this.lines.map(line => ({ ...line })) }
}
