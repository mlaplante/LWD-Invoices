# Feature E: Mobile Polish Pass

## Summary

Fix broken mobile layouts on 4 list pages and ClientForm, plus add overflow safety to detail page headers.

## Scope

### 1. Mobile card layouts for 4 list pages

Each page gets `sm:hidden` card layout for mobile, `hidden sm:block` for desktop table:
- **Projects** — name, status badge, client name
- **Expenses** — name, supplier, amount, date
- **Tickets** — #number, subject, status badge
- **Timesheets** — project name, hours, date range

### 2. ClientForm grid fix

- Email/Phone: `grid-cols-2` → `grid-cols-1 sm:grid-cols-2`
- City/State/ZIP: `grid-cols-3` → `grid-cols-1 sm:grid-cols-3`

### 3. Detail page button wrapping

- Invoice detail + client detail headers: add `flex-wrap` to action button containers

## What it doesn't do

- No swipe gestures or pull-to-refresh
- No bulk actions on new pages
- No MobileNav changes
