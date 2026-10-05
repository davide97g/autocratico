import { Toaster as Sonner, type ToasterProps } from "sonner"

import { useTheme } from "@/components/theme-provider"

/** Notices at the bottom of the screen, above the tab bar on phones. */
function Toaster(props: ToasterProps) {
  const { theme } = useTheme()
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      position="bottom-right"
      offset={{ bottom: 24, right: 24 }}
      mobileOffset={{ bottom: "calc(6rem + env(safe-area-inset-bottom))" }}
      gap={8}
      toastOptions={{
        classNames: {
          toast: "rounded-xl! bg-popover! text-popover-foreground! ring-1! ring-foreground/10! border-0! shadow-lg! font-sans!",
          description: "text-muted-foreground!",
          actionButton: "bg-primary! text-primary-foreground! rounded-md! font-medium!",
          cancelButton: "bg-muted! text-muted-foreground! rounded-md!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
