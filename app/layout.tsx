import "./globals.css";
import { Providers } from "@/app/providers";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Campus Timetable Intelligence",
  description:
    "University timetable planning, room booking, workload and scheduling platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
