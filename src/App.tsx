import { AppShell } from "./layout/AppShell";
import { ThemeProvider } from "./theme/ThemeProvider";
import { FeedbackProvider } from "./ui/overlays";

export default function App() {
  return (
    <ThemeProvider>
      <FeedbackProvider>
        <AppShell />
      </FeedbackProvider>
    </ThemeProvider>
  );
}
