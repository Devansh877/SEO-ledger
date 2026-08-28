import "./globals.css";
import { AuthProvider } from "../lib/auth-context";

export const metadata = {
  title: "SEO Ledger — NexIT Solutions",
  description: "Multi-tenant SEO reporting platform",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="font-sans text-sm">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
