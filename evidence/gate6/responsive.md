# Responsive audit

Rendered browser checks covered `1440x900`, `1280x800`, `1024x768`, `768x1024`, `430x932`, `390x844`, and `375x812`.

The final narrow-width checks measured `document.documentElement.scrollWidth === window.innerWidth` at both `430px` and `375px` on markets and at `375px` on market detail. No horizontal overflow was present. Mobile navigation, market cards, detail tabs, chart empty state, trading rail warning, and bottom navigation remain usable.

Desktop review focused on the 380–420px trading rail, metric alignment, table density, chart area, and proof/status hierarchy. Tablet review focused on wrapping, sticky behavior, and the transition from table rows to compact cards.

Final screenshot captures are stored beside this file.
