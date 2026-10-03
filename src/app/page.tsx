import React from 'react';
import LandingNavbar from './components/LandingNavbar';
import HeroSection from './components/HeroSection';
import FeaturesSection from './components/FeaturesSection';
import MonitoringPreview from './components/MonitoringPreview';
import AIAssistantPreview from './components/AIAssistantPreview';
import AboutSection from './components/AboutSection';
import ContactSection from './components/ContactSection';
import LandingFooter from './components/LandingFooter';
import LandingSessionRedirect from './components/LandingSessionRedirect';

export default function LandingPage() {
  return (
    <div className="min-h-screen text-foreground">
      <LandingSessionRedirect />
      <LandingNavbar />
      <HeroSection />
      <FeaturesSection />
      <MonitoringPreview />
      <AIAssistantPreview />
      <AboutSection />
      <ContactSection />
      <LandingFooter />
    </div>
  );
}
