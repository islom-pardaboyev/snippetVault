import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import App from "./App";
import { AuthProvider } from "./hooks/auth";
import { ThemeProvider, ToastProvider } from "./hooks/ui";
import { ModalProvider } from "./components/Modal";

registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <ModalProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ModalProvider>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
);
