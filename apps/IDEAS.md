# Where the ideas come from

The brief was to copy ideas that are making money right now from the [Starter Story YouTube channel](https://www.youtube.com/@starterstory) and host them so friends and family can use them.

## What I could and could not read

- The sandbox this was built in blocks `youtube.com` and `starterstory.com`, so **I did not watch or read the videos**. I used web search results, which carry summaries of titles and descriptions.
- Every revenue number below is **self-reported by the founders on the channel**. I could not verify any of them.
- Treat this file as a lead list, not research. Watch the videos before betting money on any of it.

## The ideas found, and what was done with each

| Idea (as reported) | Claimed result | Built? |
|---|---|---|
| **Early**, an alarm you switch off with pushups. Built by Jake, an accountant. 19 days from first commit to App Store. Sold at $29.99 a year or $9.99 a month. Growth came from paying TikTok and Instagram creators ($2 to $3 CPM with a view guarantee) to show it in "day in the life" posts. | $30K a month at month 3, $50K at month 4, 200K+ downloads | Yes, as **Pushwake** |
| **Cal AI** and the copy of it: Tomer built a Hebrew version for Israel (**CalBuddy**) with Cursor in about two weeks and grew it with paid ads and revenue-share influencers. | $80K a month 12 months in. Cal AI itself reported 15M+ downloads and $30M+ a year before [MyFitnessPal bought it in March 2026](https://techcrunch.com/2026/03/02/myfitnesspal-has-acquired-cal-ai-the-viral-calorie-app-built-by-teens/) | Yes, as **BiteLog**, without the photo AI |
| **Audiopen**, voice notes turned into clean text, "built in 12 hours" | $15K a month | Yes, as **Voicepad**, with plain rules instead of AI |
| A founder who copied a $100M SaaS and undercut its price | about $10K to $11K a month | No. No specific product to build without watching the video |
| Connor Burd's vibe coded app, built in 14 days, grown with Facebook ads | $20K a month | No. Product not identified from search results |
| Visualizee, an AI rendering tool that sat at $150 a month for years before a pivot | $10K a month | No. Needs a paid AI model and a server |

Sources: [Starter Story on YouTube](https://www.youtube.com/@starterstory), the [Early post](https://x.com/starter_story/status/2100265779073835162), [Audiopen](https://www.starterstory.com/stories/audiopen), [Connor's story](https://www.starterstory.com/connor), and the video titles "This Insanely Simple App Makes $50K/Month" and "I Copied A Huge App. Now I Make $80K/Month".

## Copying the idea, not the product

Names, icons, copy and code are original. Nothing is lifted from Early, Cal AI, CalBuddy or Audiopen. The idea (alarm plus pushups, calorie tracking, voice to clean notes) is not protected, the specific branding and code are.

## What these apps do not do: make money

Read this before expecting income.

- In every story above the money comes from **subscriptions in the App Store plus paid distribution** (creators, TikTok, Facebook ads). The code was the cheap part: 12 hours to 3 weeks.
- These versions are **free web apps with no payment and no user accounts**. They are good for friends and family and for learning what people actually use. They will not earn anything on their own.
- A web page cannot replace a native alarm. Pushwake cannot ring from a locked phone, which is the whole point of Early. That is a real reason the real thing is a native app.
- BiteLog lacks the one feature that made Cal AI go viral: take a photo, get the calories. That needs an AI vision model, a server to hold the API key, and a per-scan cost you have to price into a subscription.
- The apps and channels that work are crowded. Early, Cal AI and CalBuddy already exist. A copy only wins with a niche or a market the original ignored (that is what the Israel story is).

## If you want to take one further

Ranked by how little extra work it needs:

1. **Pick the one friends actually open**, from usage, not from this list.
2. **Localise it.** The most credible lesson in the stories is "proven app, empty local market". BiteLog's food table and Voicepad's language list are the places to start. Voicepad already listens in 16 languages.
3. **Wrap it for the stores** with [Capacitor](https://capacitorjs.com/). That gives push notifications and background alarms, which fixes Pushwake's biggest limit. Needs an Apple Developer account ($99 a year) and a Google Play account ($25 once).
4. **Add payments** with RevenueCat or Stripe Payment Links. Needs your accounts, so it is not done here.
5. **Add photo calories to BiteLog** with a small serverless function that calls an AI vision model. Needs an API key and a cost per scan.
