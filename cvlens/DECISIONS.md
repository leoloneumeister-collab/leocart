# Decisions

Calls I made where the brief was open. Newest thinking first within each section.

## Product

- **Skills are measured in years of use, not levels.** My first idea was a 1 to 5 skill rating. A CV does not contain that, so the model would have invented it, and a chart of invented numbers sent to recruiters is worse than no chart. Instead each role lists the skills it used and the chart adds up the months (overlapping jobs counted once). Every bar can be traced back to the CV.
- **No gap highlighting.** Career gaps are easy to compute and would make an obvious feature. They are also the thing a job seeker least wants a tool to point at. The timeline shows what happened and says nothing about what did not.
- **The traffic funnel is a button and a footer, not model text.** Free traction comes from people sharing the exported image (its footer carries the site address) and from the "Get a polished version" button in the widget. The text the model reads back is factual and carries no promotion. That is both better for the user and more likely to survive directory review than tool output that tells the model to advertise.
- **Offers are placeholders on purpose.** The brief says to sell "something" without saying what. The three tiers in `site/config.js` (free overview, polished one-pager, CV and portfolio makeover) are services that need no extra software, and their prices are invented. Paid buttons are disabled until a checkout URL exists, so a half-configured site cannot take or promise anything.
- **Nothing invented on the site.** No testimonials, no user counts, no "trusted by". The demo CV is a fictional person.

## Technical

- **One server for both apps.** ChatGPT's Apps SDK and Claude's MCP Apps both sit on MCP and the `ui://` resource with the `text/html;profile=mcp-app` type, so there is one tool and one widget. The tool also sets `openai/outputTemplate` and the widget reads `window.openai.toolOutput` as a fallback.
- **Stateless, in-memory rate limit, no logging of requests.** A CV is personal data. The cheapest way to handle it safely is to never keep it. The limiter keys on IP in memory only and is never written out.
- **Validate dates leniently, report what was skipped.** The model fills in the arguments, and models make date mistakes. A strict schema would fail the whole call on one bad date. Instead the tool draws what it can and returns warnings the model can fix and retry, and the widget lists them.
- **Plain JS, no framework.** Same call as the rest of the repo. The renderer is string building, so it runs unchanged in Node (server and tests), in the iframe and on the site.
- **Widget bundled to one file with Vite.** Hosts load the widget into a sandboxed iframe with no network by default. Loading the SDK from a CDN would need a CSP exception and add a dependency on someone else's uptime.
- **Two layouts, picked by container width.** A single 760px chart shrinks to roughly 5px text on a phone, which I saw in the first screenshots. The narrow layout stacks each label above its bar. The widget and site switch on a resize observer. Exports are always the wide layout.
- **Export is pinned to the light palette.** A shared image gets pasted onto unknown backgrounds. The inline version follows the host's theme; the saved file does not.
- **Rendering is SVG with native hover titles, plus a table view.** Every mark has a `<title>` tooltip, and the Table tab holds the same data for screen readers and for the skills past the chart cap.

## Chart design

- **Palette validated, not eyeballed.** Two series on the timeline (experience in blue, education in orange), checked for colour-blind separation and contrast against both the light and dark surface. The skills chart is one series, so it uses the experience blue, which keeps "blue means time at work" consistent across both charts.
- **Gantt-style timeline instead of a graph.** The job is "when did what happen and for how long", which is positions on a time axis. Bars are thin, labelled at the bar end with the duration, and current roles end in a dot.
- **At most ten skill bars.** More than that is a table, not a chart, so the rest go in the Table tab and are mentioned under the chart.

## Things I would do next

- A real checkout and fulfilment path (right now a purchase is a link you set).
- A shareable hosted page per CV, which is a natural paid upgrade and a second source of inbound links. It needs storage and a deletion path, so it is a deliberate step, not a quiet one.
- An Open Graph image for the site, generated from the sample chart.
- Run the end-to-end test in CI. It needs a Chromium on the runner; right now CI runs the build and the unit tests only.
