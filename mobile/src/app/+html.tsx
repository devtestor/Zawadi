import { ScrollViewStyleReset } from 'expo-router/html';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        {/* --- Page identity + rich link previews (Open Graph / Twitter) --- */}
        <title>Alcurry — Africa's Marketplace</title>
        <meta
          name="description"
          content="Buy and sell Property, Land, Cars, Mining Sites, and Machinery across 54 African countries."
        />
        <meta name="theme-color" content="#D4A843" />

        {/* Favicon — SVG scales crisply on every tab/bookmark size.
            iOS home-screen icon falls back to the same mark. */}
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        {/* Open Graph — used by WhatsApp, Facebook, LinkedIn, iMessage, Slack, etc. */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Alcurry" />
        <meta property="og:title" content="Alcurry — Africa's Marketplace" />
        <meta
          property="og:description"
          content="Buy and sell Property, Land, Cars, Mining Sites, and Machinery across 54 African countries."
        />
        <meta property="og:url" content="https://alcurry.app" />
        <meta property="og:image" content="https://alcurry.app/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="Alcurry — Africa's Marketplace" />

        {/* Twitter / X large-image card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Alcurry — Africa's Marketplace" />
        <meta
          name="twitter:description"
          content="Buy and sell Property, Land, Cars, Mining Sites, and Machinery across 54 African countries."
        />
        <meta name="twitter:image" content="https://alcurry.app/og-image.png" />

        {/*
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native. 
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        {/* Using raw CSS styles as an escape-hatch to ensure the background color never flickers in dark-mode. */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
        {/* Add any additional <head> elements that you want globally available on web... */}
      </head>
      <body>{children}</body>
    </html>
  );
}

const responsiveBackground = `
body {
  background-color: #fff;
}
@media (prefers-color-scheme: dark) {
  body {
    background-color: #000;
  }
}`;
