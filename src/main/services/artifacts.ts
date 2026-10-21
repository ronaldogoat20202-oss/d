export interface InstallFile {
  path: string
  urls: string[]
  size?: number
  checksum?: { algorithm: string; value: string }
}
