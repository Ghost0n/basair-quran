import { sheetStack } from "./sheet-stack";

export type BackOutcome = "sheet" | "back" | "exit";

/**
 * What Android's back button does, in order: close the open sheet, else go
 * back a screen, else leave the app (to the background, as Android apps do).
 */
export function handleBack(deps: {
  closeTopSheet: () => boolean;
  canGoBack: () => boolean;
  goBack: () => void;
  exit: () => void;
}): BackOutcome {
  if (deps.closeTopSheet()) return "sheet";
  if (deps.canGoBack()) {
    deps.goBack();
    return "back";
  }
  deps.exit();
  return "exit";
}

/** Wires the app's back button (Android, through @capacitor/app); returns its removal. */
export async function installAppBack(): Promise<() => void> {
  const { App } = await import("@capacitor/app");
  const handle = await App.addListener("backButton", ({ canGoBack }) => {
    handleBack({
      closeTopSheet: () => sheetStack.closeTop(),
      canGoBack: () => canGoBack,
      goBack: () => window.history.back(),
      exit: () => void App.minimizeApp(),
    });
  });
  return () => void handle.remove();
}
