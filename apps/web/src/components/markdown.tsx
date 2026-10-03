import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "cn"

import { Sensitive } from "@/components/privacy"
import { Checkbox } from "@/components/ui/checkbox"

// `||text||` marks personal data: it becomes a placeholder link, then rendered as <Sensitive>.
const REDACTED = "#redacted"
const prepare = (md: string) => md.replace(/\|\|(.+?)\|\|/g, `[$1](${REDACTED})`)

const components: Components = {
  h1: () => null,
  h2: ({ children }) => (
    <h2 className="mt-8 mb-3 text-lg font-medium tracking-tight first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => <h3 className="mt-6 mb-2 font-medium">{children}</h3>,
  p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
  ul: ({ children, className }) => (
    <ul
      className={cn(
        "my-2 flex flex-col gap-1.5 pl-5",
        className?.includes("contains-task-list") ? "pl-0" : "list-disc"
      )}
    >
      {children}
    </ul>
  ),
  ol: ({ children }) => <ol className="my-2 flex list-decimal flex-col gap-1.5 pl-5">{children}</ol>,
  li: ({ children, className }) => (
    <li
      className={cn(
        "leading-relaxed",
        className?.includes("task-list-item") && "relative list-none rounded-lg bg-muted py-2.5 pr-4 pl-11"
      )}
    >
      {children}
    </li>
  ),
  input: ({ checked }) => (
    <Checkbox checked={Boolean(checked)} disabled className="absolute top-3.5 left-4" />
  ),
  strong: ({ children }) => <strong className="font-medium">{children}</strong>,
  code: ({ children }) => (
    <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">{children}</code>
  ),
  a: ({ href, children }) =>
    href === REDACTED ? (
      <Sensitive>{children}</Sensitive>
    ) : (
      <a href={href} target="_blank" rel="noreferrer" className="break-words underline underline-offset-4">
        {children}
      </a>
    ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-lg ring-1 ring-border">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="bg-muted px-4 py-2.5 text-xs font-medium text-muted-foreground">{children}</th>
  ),
  td: ({ children }) => <td className="border-t px-4 py-2.5 align-top">{children}</td>,
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("max-w-3xl text-sm", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {prepare(text)}
      </ReactMarkdown>
    </div>
  )
}
