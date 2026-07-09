const SPOKEN_NUMBERS: Record<string, number> = {
  zero: 0, oh: 0, one: 1, first: 1, two: 2, second: 2, three: 3, third: 3,
  four: 4, fourth: 4, five: 5, fifth: 5, six: 6, sixth: 6, seven: 7,
  seventh: 7, eight: 8, eighth: 8, nine: 9, ninth: 9, ten: 10, tenth: 10,
  eleven: 11, eleventh: 11, twelve: 12, twelfth: 12, thirteen: 13,
  thirteenth: 13, fourteen: 14, fourteenth: 14, fifteen: 15, fifteenth: 15,
  sixteen: 16, sixteenth: 16, seventeen: 17, seventeenth: 17, eighteen: 18,
  eighteenth: 18, nineteen: 19, nineteenth: 19, twenty: 20, twentieth: 20,
  thirty: 30, thirtieth: 30, thirtyfirst: 31,
}

const SPOKEN_MONTHS: Record<string, string> = {
  january: '01', jan: '01', february: '02', feb: '02', march: '03', mar: '03',
  april: '04', apr: '04', may: '05', june: '06', jun: '06', july: '07',
  jul: '07', august: '08', aug: '08', september: '09', sep: '09',
  october: '10', oct: '10', november: '11', nov: '11', december: '12', dec: '12',
}

export function verifyDob(dobInput: string, jobDob: string): boolean {
  const digits = dobInput.replace(/\D/g, '')
  const jobDigits = jobDob.replace(/\D/g, '')
  const spokenDigits = normalizeSpokenDob(dobInput)
  if (digits.length < 4 && !spokenDigits && jobDigits.length < 4) return false

  const expectedValues = new Set<string>()
  const dateParts = jobDob.match(/(\d{1,4})\D+(\d{1,2})\D+(\d{1,4})/)
  if (dateParts) {
    const first = dateParts[1]!
    const second = dateParts[2]!
    const third = dateParts[3]!
    const yearFirst = first.length === 4
    const month = (yearFirst ? second : first).padStart(2, '0')
    const day = (yearFirst ? third : second).padStart(2, '0')
    const year = (yearFirst ? first : third).padStart(4, '0')
    expectedValues.add(`${month}${day}`)
    expectedValues.add(`${month}${day}${year}`)
    expectedValues.add(`${year}${month}${day}`)
    expectedValues.add(year.slice(-4))
  }

  if (jobDigits.length >= 8) {
    expectedValues.add(jobDigits.slice(0, 4))
    expectedValues.add(jobDigits.slice(-4))
    expectedValues.add(jobDigits)
  }

  return expectedValues.has(digits) || Boolean(spokenDigits && expectedValues.has(spokenDigits))
}

function normalizeSpokenDob(input: string): string | null {
  const words = input.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
  if (words.length === 0) return null

  const digitWords = words.map((word) => SPOKEN_NUMBERS[word]).filter((n): n is number => n !== undefined && n >= 0 && n <= 9)
  if (digitWords.length >= 4) return digitWords.slice(0, 4).join('')

  const monthIndex = words.findIndex((word) => SPOKEN_MONTHS[word])
  if (monthIndex < 0) return null

  const day = parseSpokenDay(words.slice(monthIndex + 1, monthIndex + 4))
  return day ? `${SPOKEN_MONTHS[words[monthIndex]!]!}${String(day).padStart(2, '0')}` : null
}

function parseSpokenDay(words: string[]): number | null {
  const compact = words.join('')
  if (SPOKEN_NUMBERS[compact] !== undefined) return SPOKEN_NUMBERS[compact]!

  const total = words.reduce((sum, word) => sum + (SPOKEN_NUMBERS[word] ?? 0), 0)
  return total >= 1 && total <= 31 ? total : null
}
