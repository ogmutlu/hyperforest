import { initializeDomain } from "./domainClient";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, Recovery } from "./App";
import { DesktopApp } from "./DesktopApp";
import { desktopEnabled } from "./desktop";
import { Workspace } from "./storage";
import "./style.css";

const element = document.getElementById("root");
if (!element) throw new Error("App root is missing");
const root = createRoot(element);
async function start(): Promise<void> {
  await initializeDomain();
  if (desktopEnabled) root.render(<DesktopApp />);
  else
    try {
      const workspace = new Workspace(localStorage);
      root.render(
        <StrictMode>
          <App workspace={workspace} />
        </StrictMode>,
      );
    } catch (error: unknown) {
      root.render(<Recovery error={error} />);
    }
}
void start().catch((error: unknown) => root.render(<Recovery error={error} />));
