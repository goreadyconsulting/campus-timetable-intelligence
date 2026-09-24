import { Header } from "@/components/header";
import { HelpAssistant } from "@/components/help-assistant";
import { Sidebar } from "@/components/sidebar";

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-soft">
      <Sidebar />
      <main className="lg:pl-72">
        <Header title={title} subtitle={subtitle} />
        <div className="p-6 lg:p-8">{children}</div>
      </main>
      <HelpAssistant />
    </div>
  );
}
