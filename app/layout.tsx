import "./globals.css";
export const metadata = { title: "BookVault 藏簡書房", description: "Your personal reading library" };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
