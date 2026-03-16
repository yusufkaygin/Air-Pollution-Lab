import { useId } from 'react'

interface InfoHintProps {
  label: string
  hint: string
  className?: string
}

export function InfoHint({ label, hint, className }: InfoHintProps) {
  const hintId = useId()

  return (
    <span className={`info-hint ${className ?? ''}`.trim()}>
      <button
        type="button"
        className="info-button"
        aria-label={label}
        aria-describedby={hintId}
      >
        i
      </button>
      <span id={hintId} className="field-hint inline-hint" role="tooltip">
        {hint}
      </span>
    </span>
  )
}
