# Admin Control Center

Parent index: [[Home|PBO Site Wiki]]

The authenticated `/admin` area uses a shared responsive navigation shell from
`src/components/admin/admin-shell.tsx`. Administrative pages keep their existing
business logic; the shell controls only navigation and presentation around each
page.

## Navigation Structure

- Overview: Dashboard.
- League: Seasons, Coaches, Rosters, and Pokemon.
- Battles: Matches, Transactions, and Battle Records.
- Community: Pick'Ems, Engagement, Discord, and Users.
- Integrations: Sheets.
- System: Audit Log, plus development-only tools outside production.

The desktop sidebar can collapse to icons and remembers that preference in
local storage. Small screens use a modal navigation drawer. The current route
is highlighted in both versions.

The Pokemon navigation item uses a Poké Ball icon. The shared shell keeps
navigation presentation separate from admin API behavior and page state.

## Admin Search And Shortcuts

`Ctrl+K` opens the admin command search. It searches page labels, descriptions,
and workflow keywords such as replay, aliases, trades, and sync. Pressing Enter
opens the first result. The desktop content header also exposes the most common
match-result and transaction destinations.

## Safety Boundary

The shell must not alter API behavior, database writes, form submission, import
logic, or page-specific state. Navigation changes should remain cosmetic unless
a separate data or workflow change is explicitly requested and reviewed.

When adding an admin page, add its route, description, keywords, icon, and group
to the shared navigation configuration. Verify active-route highlighting,
command search, collapsed desktop navigation, and the mobile drawer.

## Verification

Run:

    npx tsc --noEmit
    npx eslint src/components/admin/admin-shell.tsx src/app/admin/layout.tsx
    npm run build
