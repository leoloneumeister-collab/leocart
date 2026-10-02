// Everything you need to edit before going live is in this file.
// Empty strings are safe: the page hides or disables whatever depends on them.

export const config = {
  brand: 'CV Lens',

  // Public address of this website, e.g. 'https://cvlens.example.com'.
  // Printed in the footer of every exported image, so it is the traffic funnel.
  siteUrl: '',

  // Address of the deployed MCP server, e.g. 'https://cvlens.example.com/mcp'.
  // GitHub Pages cannot host it: see README.md, "Deploy the server".
  mcpUrl: '',

  // Where "built by" in the footer points (your portfolio). Hidden when empty.
  portfolioUrl: '',

  // Shown on the privacy page. Directory reviews ask for a way to reach you.
  contactEmail: '',

  // The offers. A button stays disabled ("Coming soon") until checkoutUrl is set.
  // Use a Stripe Payment Link, Gumroad, Lemon Squeezy, a Calendly page, anything with a URL.
  // The wording and prices below are PLACEHOLDERS. Replace them with what you really sell.
  offers: [
    {
      id: 'free',
      name: 'In-chat overview',
      price: 'Free',
      note: 'Inside ChatGPT or Claude',
      points: ['Career timeline and skills chart', 'Table view for screen readers', 'Save as SVG'],
      cta: 'Try the demo',
      href: '#try',
      featured: false,
    },
    {
      id: 'polished',
      name: 'Polished one-pager',
      price: '$29',
      note: 'One time, done for you',
      points: ['Your overview redesigned by hand', 'PDF and PNG, ready to send', 'Your colours and typeface'],
      cta: 'Get the one-pager',
      checkoutUrl: '',
      featured: true,
    },
    {
      id: 'makeover',
      name: 'CV and portfolio makeover',
      price: '$149',
      note: 'One time, done for you',
      points: ['CV rewritten around your strongest roles', 'One-page portfolio site', 'Review call'],
      cta: 'Book the makeover',
      checkoutUrl: '',
      featured: false,
    },
  ],
};
