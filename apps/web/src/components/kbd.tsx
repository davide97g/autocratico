import { cn } from "cn"

const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
/** The modifier of the shortcuts, as this keyboard labels it. */
export const MOD = MAC ? "⌘" : "Ctrl"

/** A key, as printed on the keyboard. */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-muted px-1 font-mono text-[0.7rem] leading-none font-medium text-muted-foreground ring-1 ring-foreground/10 ring-inset",
        className
      )}
    >
      {children}
    </kbd>
  )
}
