async function downloadText(filename: string, content: string, type: string) {
  const { saveAs } = await import('file-saver')
  const blob = new Blob([content], { type })
  saveAs(blob, filename)
}

function escapeCsvValue(value: string | number | null) {
  if (value === null) {
    return ''
  }

  const stringValue = String(value)

  if (/[,"\n]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`
  }

  return stringValue
}

export async function exportRowsAsCsv(
  rows: Array<Record<string, string | number | null>>,
  filename: string,
) {
  if (rows.length === 0) {
    return
  }

  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(',')),
  ].join('\n')

  await downloadText(filename, csv, 'text/csv;charset=utf-8')
}

export async function exportElementAsPng(element: HTMLElement, filename: string) {
  const [{ saveAs }, { toPng }] = await Promise.all([
    import('file-saver'),
    import('html-to-image'),
  ])
  const dataUrl = await toPng(element, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: '#faf4ea',
  })

  saveAs(dataUrl, filename)
}

export async function exportElementAsSvg(element: HTMLElement, filename: string) {
  const [{ saveAs }, { toSvg }] = await Promise.all([
    import('file-saver'),
    import('html-to-image'),
  ])
  const dataUrl = await toSvg(element, {
    cacheBust: true,
    backgroundColor: '#faf4ea',
  })

  saveAs(dataUrl, filename)
}
