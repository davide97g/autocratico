import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { PrivacyProvider } from "@/components/privacy"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { TooltipProvider } from "@/components/ui/tooltip"
import { I18nProvider } from "@/i18n"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="light">
      <I18nProvider>
        <PrivacyProvider>
          <TooltipProvider>
            <App />
          </TooltipProvider>
        </PrivacyProvider>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>
)
