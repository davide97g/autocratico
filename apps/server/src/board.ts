/**
 * The Board: widgets the chat agent designed and the user added (data/board.json, docs/generative-ui.md).
 * Server-owned: the agents only read it. Widgets come from the web app, checked against the catalog in
 * core/widgets.ts whatever the client sends; each add, update, move and removal is one commit,
 * so Activity lists it and Undo reverts it.
 */
import { existsSync, readFileSync } from "node:fs"

import { Board as BoardFile, EMPTY_BOARD, Widget, type Widget as WidgetType, widgetFields, type WidgetInput } from "@autocratico/core"
import { dataPaths } from "@autocratico/core/node"

import { locks, writeJson } from "./files.ts"
import type { DataRepo } from "./git.ts"

/** A request that cannot be applied; the message is shown to the user. */
export class BoardError extends Error {}

export const MAX_WIDGETS = 60

export class Board {
  readonly #repo: DataRepo
  readonly #file: string

  constructor(dir: string, repo: DataRepo) {
    this.#repo = repo
    this.#file = dataPaths(dir).board
  }

  /**
   * The board on disk. A widget that no longer passes the catalog is left out (and dropped at the next
   * write) instead of hiding the others; a file that does not parse reads as empty.
   */
  load(): BoardFile {
    if (!existsSync(this.#file)) return EMPTY_BOARD
    try {
      const raw = JSON.parse(readFileSync(this.#file, "utf8")) as { widgets?: unknown }
      const widgets = (Array.isArray(raw?.widgets) ? raw.widgets : []).flatMap((w) => {
        const r = Widget.safeParse(w)
        if (!r.success) console.error(`board.json: widget ${(w as { id?: unknown })?.id ?? "?"}: ${r.error.issues[0]?.message ?? "invalid"}`)
        return r.success ? [r.data as WidgetType] : []
      })
      return BoardFile.parse({ version: 1, widgets })
    } catch (e) {
      console.error(`board.json: ${(e as Error).message}`)
    }
    return EMPTY_BOARD
  }

  /** Add a widget, or replace the one with the same id (keeping its place). */
  async save(w: WidgetInput): Promise<{ widget: WidgetType; added: boolean; hash: string | null }> {
    const now = new Date().toISOString()
    const result = await locks.run(this.#file, () => {
      const board = this.load()
      const at = board.widgets.findIndex((x) => x.id === w.id)
      const before = at >= 0 ? board.widgets[at] : null
      if (!before && board.widgets.length >= MAX_WIDGETS) throw new BoardError(`the board holds at most ${MAX_WIDGETS} widgets`)
      const widget: WidgetType = { ...widgetFields(w), created: before?.created ?? now, updated: now }
      const widgets = [...board.widgets]
      if (before) widgets[at] = widget
      else widgets.push(widget)
      writeJson(this.#file, { version: 1, widgets })
      return { widget, added: !before }
    })
    const hash = await this.#repo.commitPaths(`Board: ${result.added ? "add" : "update"} ${w.id}\n\n${w.title}`, ["board.json"])
    return { ...result, hash }
  }

  async remove(id: string): Promise<string | null> {
    await locks.run(this.#file, () => {
      const board = this.load()
      if (!board.widgets.some((x) => x.id === id)) throw new BoardError(`no widget with id "${id}"`)
      writeJson(this.#file, { version: 1, widgets: board.widgets.filter((x) => x.id !== id) })
    })
    return this.#repo.commitPaths(`Board: remove ${id}`, ["board.json"])
  }

  /** Move a widget to `index` (clamped). */
  async move(id: string, index: number): Promise<string | null> {
    const moved = await locks.run(this.#file, () => {
      const board = this.load()
      const from = board.widgets.findIndex((x) => x.id === id)
      if (from < 0) throw new BoardError(`no widget with id "${id}"`)
      const to = Math.max(0, Math.min(board.widgets.length - 1, index))
      if (to === from) return false
      const widgets = [...board.widgets]
      const [w] = widgets.splice(from, 1)
      widgets.splice(to, 0, w)
      writeJson(this.#file, { version: 1, widgets })
      return true
    })
    return moved ? this.#repo.commitPaths(`Board: move ${id}`, ["board.json"]) : null
  }
}
