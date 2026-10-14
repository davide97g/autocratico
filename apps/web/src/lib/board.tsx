/**
 * The Board (docs/generative-ui.md): its widgets, the data they read and what their buttons do, shared by
 * the Board view and the widget previews in the chat. Main provides it; the finance data is loaded
 * only once a widget needs it.
 */
import * as React from "react"
import type { WidgetAction, WidgetContext, WidgetInput } from "@autocratico/core"

import { type Board, board as loadBoard, type Data, type FinanceData, moveWidget, removeWidget, saveWidget, Unauthenticated } from "@/lib/api"
import { useLiveRefresh } from "@/lib/events"
import { unlessChanged } from "@/lib/utils"

type BoardState = {
  board: Board | null
  /** What the widgets' queries read; null until the register is loaded. */
  context: WidgetContext | null
  /** A widget reads transactions or investments: load the finance data. */
  wantFinance: () => void
  save: (w: WidgetInput) => Promise<{ added: boolean; hash: string | null }>
  remove: (id: string) => Promise<string | null>
  move: (id: string, index: number) => Promise<void>
  /** A widget's Button. */
  act: (a: WidgetAction) => void
  /** Opens the chat about a widget on the Board. */
  askAbout: (w: { id: string; title: string }) => void
}

const BoardContext = React.createContext<BoardState | null>(null)

export function useBoard(): BoardState {
  const s = React.useContext(BoardContext)
  if (!s) throw new Error("useBoard outside BoardProvider")
  return s
}

export function BoardProvider({
  data,
  finance,
  onWantFinance,
  onAction,
  onAskAbout,
  onSignedOut,
  children,
}: {
  data: Data | null
  finance: FinanceData | null
  onWantFinance: () => void
  onAction: (a: WidgetAction) => void
  onAskAbout: (w: { id: string; title: string }) => void
  onSignedOut: () => void
  children: React.ReactNode
}) {
  const [board, setBoard] = React.useState<Board | null>(null)
  const reload = React.useCallback(() => {
    loadBoard().then(
      (b) => setBoard(unlessChanged(b)),
      (e: Error) => e instanceof Unauthenticated && onSignedOut()
    )
  }, [onSignedOut])
  React.useEffect(reload, [reload])
  useLiveRefresh("board", reload, 60_000)

  const context = React.useMemo<WidgetContext | null>(() => (data ? { data, finance } : null), [data, finance])
  const value = React.useMemo<BoardState>(
    () => ({
      board,
      context,
      wantFinance: onWantFinance,
      save: async (w) => {
        const r = await saveWidget(w)
        reload()
        return r
      },
      remove: async (id) => {
        const { hash } = await removeWidget(id)
        reload()
        return hash
      },
      move: async (id, index) => {
        // Moved at once on screen; the server's order follows.
        setBoard((b) => {
          if (!b) return b
          const widgets = [...b.widgets]
          const from = widgets.findIndex((w) => w.id === id)
          if (from < 0) return b
          const [w] = widgets.splice(from, 1)
          widgets.splice(Math.max(0, Math.min(widgets.length, index)), 0, w)
          return { ...b, widgets }
        })
        await moveWidget(id, index).finally(reload)
      },
      act: onAction,
      askAbout: onAskAbout,
    }),
    [board, context, onWantFinance, onAction, onAskAbout, reload]
  )
  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>
}
