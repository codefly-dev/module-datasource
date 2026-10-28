import type { Metadata } from "next";

// Named for what a person is looking at, so a tab among many says which run
// this is. The shell brings its own styling (@codefly-dev/ui/preview.css,
// imported where it mounts), so there is nothing to load here.
export const metadata: Metadata = {
  title: "Datasource playground",
  description: "The datasources a deployment composed, read with a credential handed over for one call.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
