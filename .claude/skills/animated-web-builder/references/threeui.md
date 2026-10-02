# ThreeUI (threeui.com)

Open-source library of procedural Three.js / WebGL components by Meng To (Design+Code). Hero sections, backgrounds, buttons, text animation, motion pieces, full landing page templates. Community edition is MIT and login-free; Pro adds components, a CLI and an MCP server.

Sources checked directly: npm `@designcodeio/threeui@1.2.0` (unpacked and read) and the repo README. The live site was not reachable from the sandbox.

## Ways to use it

| Route | Command | Notes |
|---|---|---|
| React package | `npm install @designcodeio/threeui` then `import { WarpFieldBackground } from '@designcodeio/threeui'; import '@designcodeio/threeui/style.css'` | About 54 MB unpacked (bundled assets). Prefer subpath imports: `@designcodeio/threeui/components/WarpFieldBackground` |
| Copy source / prompt | threeui.com component page: Code tab or "Copy prompt" | Hand the prompt to the agent, then change theme, lighting, motion, layout |
| Pro CLI | `npx @designcodeio/threeui-cli add <slug>` | Pro members only, OAuth login |
| Non-React repo | Read the shader source in `node_modules/@designcodeio/threeui/lib-dist/shaders/<name>/` and port the idea | Components are TSX; the renderers inside are plain three.js and GLSL |

Some components render full HTML documents and need runtime files copied from `lib-dist/assets/` into the app's public dir (or override `sourceUrl` / `assetBaseUrl`).

Community catalog names (from `lib-dist/package-components`): AmberHalftone, AnimatedTopDock, AudioWordmark, BellFieldBackground, BrandOrbs, CharacterCarousel, CloudField, CondensationBackground, ConstellationField, CrtBackground, DataField, DotMatrixBackground, EmberStorm, FlowField, FluidFieldBackground, FluxVortex, GenerativeTree, GlassmorphismCta, GlobeCollection, GradientBeamCta, HalftoneFlow, IgnitionButton, LiquidFormBackground, LiquidMetalButton, NebulaBackground, NeonTypography, OrbitalSphereBackground, ParticleDrift, ParticleNetwork, ParticleWordmark, PlasmaButton, RibbonFieldBackground, ShaderButtons, TopoField, TypographyVortexCanvas, VoidField, WarpFieldBackground, WireframeForms, WovenCloth, plus landing-page templates.

## Patterns worth copying (read from the shipped source)

**1. Full-screen fragment shader background.** Two triangles, a `time`, `resolution` and `pointer` uniform, all look comes from math in the fragment shader (RibbonFieldBackground):

```glsl
float ribbon(vec2 uv, float offset, float width, float phase) {
  float y = 0.55 + 0.20 * sin(uv.x * 2.15 + phase) + 0.045 * sin(uv.x * 7.0 - phase * 0.7);
  return exp(-pow(uv.y - y - offset, 2.0) / width);   // gaussian falloff around a sine curve
}
```

**2. Halftone dot-grid finish.** The glow is multiplied by a dot mask so a smooth field becomes a printed, tactile texture:

```glsl
vec2 grid = fract(gl_FragCoord.xy / 7.0) - 0.5;
float dotShape = smoothstep(0.29, 0.11, length(grid));
float noise = hash(floor(gl_FragCoord.xy / 7.0));      // per-cell random brightness
float alpha = glow * dotShape * (0.48 + 0.52 * noise);
```

Use `vec2` world-space cells instead of `gl_FragCoord` when the dots should sit on a 3D floor.

**3. Warp field (speed streaks).** `LineSegments` with additive blending, random radius around the camera axis, each segment moves along +z and wraps back to the far plane. Opacity is a runtime knob, so scroll or boost state can scale it. Variants swap the line for textured planes (letters, keycaps).

**4. Lifecycle hygiene every component does.** `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`, `ResizeObserver` on the container, `IntersectionObserver` to pause when offscreen, explicit `dispose()` of geometries, materials and textures. Copy these, they are why the demos stay smooth.

**5. Variants and controls.** Each component exposes a small set of props (speed, brightness, hue, saturation, variant). Design your own scene the same way: a handful of uniforms the page can tween.

## Using the ideas in a vanilla Vite + three repo

- Import `three` directly. Keep one renderer for the whole page and one fixed canvas.
- Build backgrounds as a big `PlaneGeometry` with a `ShaderMaterial` (world-space dots) so they work with a perspective camera, or a screen-space quad for flat fields.
- Drive uniforms from a `state` object that GSAP tweens (see gsap.md).
- Respect reduced motion: render one frame, no loop.
- Credit ThreeUI in a code comment when you port a shader nearly line for line (MIT, attribution is courteous and keeps the license clean).
