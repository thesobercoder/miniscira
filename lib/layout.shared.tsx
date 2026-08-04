import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"

/** Shared chrome for every fumadocs layout (docs pages, search, 404). */
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="font-[family-name:var(--font-be-vietnam-pro)] font-semibold tracking-tight">
          miniscira
        </span>
      ),
      url: "/docs",
    },
    githubUrl: "https://github.com/zaidmukaddam/miniscira",
    links: [
      {
        text: "Open the app",
        url: "/",
        // The app is a client-routed SPA shell; a hard navigation avoids
        // dragging the docs bundle into it.
        external: true,
      },
    ],
  }
}
