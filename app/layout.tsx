import "./globals.css";

export const metadata = {
  title: "BD AI Breakdown Dashboard",
  description: "Live breakdown analytics from the master Google Sheet"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}