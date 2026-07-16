import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "cron-mcp — schedule any prompt to fire a webhook",
  description:
    "Cron-as-a-service MCP. Your agent schedules prompts on any cron expression; when they fire we POST to your callback URL. No LLM in our stack — just storage and a fire loop.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        {children}
      </body>
    </html>
  );
}
