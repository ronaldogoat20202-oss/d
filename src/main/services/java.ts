import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { access, readdir } from 'node:fs/promises'
import { delimiter, join, resolve } from 'node:path'
import type { JavaRuntime } from './types'

const execute = promisify(execFile)
type Probe = (executable: string, args: string[]) => Promise<string>
const defaultProbe: Probe = async (executable, args) => {
  const { stdout, stderr } = await execute(executable, args, { shell: false, windowsHide: true, timeout: 10000, maxBuffer: 524288 })
  return `${stdout}\n${stderr}`
}
function parseJava(executable: string, output: string): JavaRuntime {
  const version = output.match(/java\.version\s*=\s*(\d+)(?:\.(\d+))?/) || output.match(/version\s+"(\d+)(?:\.(\d+))?/)
  if (!version) throw new Error('Could not determine Java version. Select the java executable, not javaw.')
  const arch = output.match(/os\.arch\s*=\s*(\S+)/)?.[1]
  const architecture = ['amd64', 'x86_64'].includes(arch || '') ? 'x64' : ['x86', 'i386', 'i686'].includes(arch || '') ? 'ia32' : ['aarch64', 'arm64'].includes(arch || '') ? 'arm64' : 'unknown'
  return { executable, major: Number(version[1] === '1' ? version[2] : version[1]), architecture }
}
export class JavaService {
  constructor(private probe: Probe = defaultProbe) {}
  async verify(executable: string, requiredMajor: number): Promise<JavaRuntime> {
    if (!executable || executable.includes('\0')) throw new Error(`Select a Java ${requiredMajor} 64-bit x86 executable in Settings.`)
    let output: string
    try { output = await this.probe(executable, ['-XshowSettings:properties', '-version']) }
    catch { throw new Error('Java executable could not run. Select an installed Java executable in Settings.') }
    const runtime = parseJava(executable, output)
    if (runtime.architecture !== 'x64') throw new Error(`Java ${requiredMajor} requires a 64-bit x86 JVM for this launcher.`)
    if (runtime.major !== requiredMajor) throw new Error(`This Minecraft release requires Java ${requiredMajor} (64-bit x86); selected Java is ${runtime.major}.`)
    return runtime
  }
  async detect(): Promise<JavaRuntime[]> {
    const name = process.platform === 'win32' ? 'java.exe' : 'java'
    const candidates = (process.env.PATH || '').split(delimiter).filter(Boolean).map(dir => join(dir, name))
    if (process.env.JAVA_HOME) candidates.unshift(join(process.env.JAVA_HOME, 'bin', name))
    const roots = process.platform === 'win32' ? ['C:\\Program Files\\Java', 'C:\\Program Files\\Eclipse Adoptium', 'C:\\Program Files\\Microsoft'] : ['/usr/lib/jvm']
    for (const root of roots) {
      try { for (const child of await readdir(root)) candidates.push(join(root, child, 'bin', name)) } catch { /* optional search location */ }
    }
    const found: JavaRuntime[] = []
    for (const path of [...new Set(candidates.map(path => resolve(path)))]) {
      try { await access(path); found.push(parseJava(path, await this.probe(path, ['-XshowSettings:properties', '-version']))) } catch { /* continue detection */ }
    }
    return found
  }
}
