import { Dashboard } from "@/components/app/Dashboard";
import { ChatPanel } from "@/components/app/ChatPanel";

export default function AppPage() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <Dashboard />
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <ChatPanel />
      </aside>
    </div>
  );
}