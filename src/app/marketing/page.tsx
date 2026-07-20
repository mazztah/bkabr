import Navbar from "@/components/marketing/Navbar";
import Hero from "@/components/marketing/Hero";
import Features from "@/components/marketing/Features";
import Workflow from "@/components/marketing/Workflow";
import DashboardPreview from "@/components/marketing/DashboardPreview";
import Pricing from "@/components/marketing/Pricing";
import FAQ from "@/components/marketing/FAQ";
import CTA from "@/components/marketing/CTA";
import Footer from "@/components/marketing/Footer";

export default function MarketingPage() {
  return (
    <>
      <Navbar />
      <Hero />
      <Features />
      <Workflow />
      <DashboardPreview />
      <Pricing />
      <FAQ />
      <CTA />
      <Footer />
    </>
  );
}
