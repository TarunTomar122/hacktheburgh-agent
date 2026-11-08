import type { Metadata } from "next";
import "./globals.css";
import LiveView from "./LiveView";

export const metadata: Metadata = {
  title: "Elliot",
  description: "Work out what to do next after a medical mistake",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <LiveView />
      </body>
    </html>
  );
}
