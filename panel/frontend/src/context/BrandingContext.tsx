import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface Branding {
  panelName: string;
  logoUrl: string;
  accentColor: string;
  hideBranding: boolean;
  oauthProviders: string[];
  /**
   * DockPanel Lite profile, from /api/branding's `lite` field (backend
   * DOCKPANEL_LITE=1). Defaults false so a branding fetch that predates
   * the field — or any fetch failure — never hides menus by accident.
   * UX profile only, not a security boundary: routes stay reachable.
   */
  lite: boolean;
}

const defaultBranding: Branding = {
  panelName: "DockPanel",
  logoUrl: "",
  accentColor: "",
  hideBranding: false,
  oauthProviders: [],
  lite: false,
};

const BrandingContext = createContext<Branding>(defaultBranding);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(defaultBranding);

  useEffect(() => {
    fetch("/api/branding")
      .then((r) => r.json())
      .then((data) => {
        setBranding({
          panelName: data.panel_name || "DockPanel",
          logoUrl: data.logo_url || "",
          accentColor: data.accent_color || "",
          hideBranding: data.hide_branding || false,
          oauthProviders: data.oauth_providers || [],
          lite: data.lite === true,
        });
      })
      .catch(() => {});
  }, []);

  // Apply accent color as CSS custom property
  useEffect(() => {
    if (branding.accentColor) {
      document.documentElement.style.setProperty("--brand-accent", branding.accentColor);
    }
  }, [branding.accentColor]);

  return (
    <BrandingContext.Provider value={branding}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
