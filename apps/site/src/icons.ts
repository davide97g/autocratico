// Only the icons the page uses, so the bundle stays small.
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Camera,
  Car,
  Check,
  CircleCheck,
  Copy,
  Eye,
  EyeOff,
  FileText,
  FolderOpen,
  GitCommitHorizontal,
  Image,
  Inbox,
  Lock,
  Mail,
  MailCheck,
  MessageCircle,
  Mic,
  Paperclip,
  Receipt,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
  TriangleAlert,
  Undo2,
  Upload,
  createIcons,
} from "lucide"

const icons = {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Camera,
  Car,
  Check,
  CircleCheck,
  Copy,
  Eye,
  EyeOff,
  FileText,
  FolderOpen,
  GitCommitHorizontal,
  Image,
  Inbox,
  Lock,
  Mail,
  MailCheck,
  MessageCircle,
  Mic,
  Paperclip,
  Receipt,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
  TriangleAlert,
  Undo2,
  Upload,
}

export function renderIcons(root: Element | Document = document) {
  createIcons({ icons, root, attrs: { "aria-hidden": "true" } })
}

/** Swaps the icon inside `host` for another one. */
export function swapIcon(host: Element, name: string) {
  const i = document.createElement("i")
  i.setAttribute("data-lucide", name)
  host.querySelector("svg, i[data-lucide]")?.replaceWith(i)
  renderIcons(host)
}
