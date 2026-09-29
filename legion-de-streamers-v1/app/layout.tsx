import "./globals.css";
import "./brand.css";

export const metadata = {
  title: "Legión de Streamers",
  description: "Directorio oficial de streamers de la comunidad"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
