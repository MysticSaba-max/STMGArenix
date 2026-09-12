import { useEffect } from "react";

interface SEOOptions {
  title: string;
  description: string;
  canonical?: string;
  ogType?: string;
  keywords?: string;
}

const SITE_NAME = "STMGArenix";
const BASE_URL = "https://stmgarenix.fr";
const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.png`;

function setMetaTag(name: string, content: string, attribute = "name") {
  let element = document.querySelector(`meta[${attribute}="${name}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, name);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function setCanonical(url: string) {
  let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", url);
}

export function useSEO({ title, description, canonical, ogType = "website", keywords }: SEOOptions) {
  useEffect(() => {
    const fullTitle = `${title} | ${SITE_NAME} — projet arrêté`;
    document.title = fullTitle;

    setMetaTag("description", description);

    if (keywords) {
      setMetaTag("keywords", keywords);
    }

    // Open Graph
    setMetaTag("og:title", fullTitle, "property");
    setMetaTag("og:description", description, "property");
    setMetaTag("og:type", ogType, "property");
    setMetaTag("og:image", DEFAULT_OG_IMAGE, "property");
    setMetaTag("og:site_name", SITE_NAME, "property");

    const pageUrl = canonical ? `${BASE_URL}${canonical}` : BASE_URL;
    setMetaTag("og:url", pageUrl, "property");
    setCanonical(pageUrl);

    // Twitter
    setMetaTag("twitter:title", fullTitle);
    setMetaTag("twitter:description", description);

    return () => {
      document.title = `${SITE_NAME} — projet arrêté`;
    };
  }, [title, description, canonical, ogType, keywords]);
}
