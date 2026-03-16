export function formatNumber(value: number | null, digits = 1) {
  if (value === null || Number.isNaN(value)) {
    return 'Veri yok'
  }

  return new Intl.NumberFormat('tr-TR', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value)
}

export function formatPercent(value: number | null, digits = 1) {
  if (value === null || Number.isNaN(value)) {
    return 'Veri yok'
  }

  return `${formatNumber(value * 100, digits)}%`
}

export function formatSigned(value: number | null, digits = 1) {
  if (value === null || Number.isNaN(value)) {
    return 'Veri yok'
  }

  const formatted = formatNumber(Math.abs(value), digits)
  return value > 0 ? `+${formatted}` : value < 0 ? `-${formatted}` : formatted
}

export function formatDateLabel(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Veri yok'
  }

  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}
