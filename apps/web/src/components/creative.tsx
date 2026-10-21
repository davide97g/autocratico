/** Creative mode (custom widgets written by Claude, run in a sandbox): its brush and its gradient. */
import { BrushIcon } from "lucide-react"
import { cn } from "cn"

/** The brush on the gradient: the mark of a creative widget. */
export function CreativeMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md bg-linear-to-br from-creative-from via-creative-via to-creative-to text-white", className)}>
      <BrushIcon className="size-4" />
    </span>
  )
}

/** "Creative mode", in the gradient. */
export function CreativeBadge({ label, title }: { label: string; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-linear-to-r from-creative-from via-creative-via to-creative-to px-2 text-xs font-medium text-white"
    >
      <BrushIcon className="size-3" />
      {label}
    </span>
  )
}
