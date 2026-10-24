import { APP_CONFIG } from "@/config/brand";

export default function HomePage() {
  return (
    <main>
      <h1>{APP_CONFIG.brandName}</h1>
      <p>{APP_CONFIG.tagline}</p>
    </main>
  );
}
