import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 min-w-0 px-6 lg:px-10 py-6 lg:py-8 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
