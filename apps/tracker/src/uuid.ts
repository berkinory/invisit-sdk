const HEX: string[] = []
for (let index = 0; index < 256; index += 1) HEX.push(index.toString(16).padStart(2, '0'))

export interface UuidV7Source {
  now(): number
  randomBytes(into: Uint8Array): Uint8Array
}

const defaultRandomBytes = (into: Uint8Array): Uint8Array => {
  crypto.getRandomValues(into as Uint8Array<ArrayBuffer>)
  return into
}

export function createUuidV7(source: Partial<UuidV7Source> = {}): () => string {
  const now = source.now ?? (() => Date.now())
  const randomBytes = source.randomBytes ?? defaultRandomBytes

  let lastMillisecond = -1
  let counter = 0

  return function uuidV7(): string {
    const millisecond = now()

    if (millisecond === lastMillisecond) {
      counter = (counter + 1) & 0xfff
    } else {
      lastMillisecond = millisecond
      counter = 0
    }

    const bytes = randomBytes(new Uint8Array(16))
    const time = Math.max(0, Math.floor(millisecond))

    bytes[0] = Math.floor(time / 2 ** 40) & 0xff
    bytes[1] = Math.floor(time / 2 ** 32) & 0xff
    bytes[2] = Math.floor(time / 2 ** 24) & 0xff
    bytes[3] = Math.floor(time / 2 ** 16) & 0xff
    bytes[4] = Math.floor(time / 2 ** 8) & 0xff
    bytes[5] = time & 0xff

    bytes[6] = 0x70 | ((counter >> 8) & 0x0f)
    bytes[7] = counter & 0xff
    bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f)

    const hex = (index: number): string => HEX[bytes[index] ?? 0] ?? '00'

    return (
      `${hex(0)}${hex(1)}${hex(2)}${hex(3)}-${hex(4)}${hex(5)}-${hex(6)}${hex(7)}-` +
      `${hex(8)}${hex(9)}-${hex(10)}${hex(11)}${hex(12)}${hex(13)}${hex(14)}${hex(15)}`
    )
  }
}

export const uuidV7 = createUuidV7()
