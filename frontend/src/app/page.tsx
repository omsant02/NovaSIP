import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { TwoWorlds } from "@/components/landing/TwoWorlds";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Strategies } from "@/components/landing/Strategies";
import { ActivityPreview } from "@/components/landing/ActivityPreview";
import { Limits } from "@/components/landing/Limits";
import { FinalCta } from "@/components/landing/FinalCta";
import { Footer } from "@/components/landing/Footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <TwoWorlds />
        <HowItWorks />
        <Strategies />
        <ActivityPreview />
        <Limits />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}