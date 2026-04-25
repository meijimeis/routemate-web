This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- Supabase account configured with SQL_MIGRATIONS.sql and SQL_RLS_POLICIES.sql applied

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create or update `.env.local` with your Supabase credentials from [Supabase Dashboard](https://app.supabase.com):

```
OPENROUTESERVICE_API_KEY=your_openrouteservice_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Notes:
- OpenStreetMap tiles do not require an API key.
- Routing is proxied through `app/api/routing/directions`, which uses `OPENROUTESERVICE_API_KEY` server-side.

### 3. Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to access Routemate.

**Features:**
- Email OTP authentication (Supabase Auth)
- Live parcel tracking via Supabase database
- Route planning and assignment
- Analytics dashboard

## Dashboard Live Tracking (Supervisor Guide)

Use the Live Tracking card on the dashboard right panel.

What to input:
- Shipment/Tracking ID shown on deliveries (example: `RM-2026-000431`)
- Delivery UUID (example: `d9ab0a2f-6fb2-4b9c-a8cd-6f85d6f4bf3d`)

How it works:
1. Paste the shipment or delivery ID into Live Tracking.
2. Click Track Order.
3. The map will show rider current location, destination pin, and route path.
4. Click Open Driver Details to jump to Drivers tab with that rider pre-selected.

Notes:
- Tracking now searches active deliveries globally, not just currently visible route cards.
- Delivery cards and driver assignment details show shipment/tracking IDs for easier lookup.

## Database Setup

The application uses Supabase for all data storage. To ensure tables and RLS policies are configured:

1. Open your Supabase project SQL editor
2. Run `SQL_MIGRATIONS.sql` - Creates location_logs and analytics tables
3. Run `SQL_RLS_POLICIES.sql` - Configures Row-Level Security policies
4. Run `SQL_MIGRATIONS_TRACKING.sql` - Adds shipment tracking column/indexes and live tracking functions
5. Run `SQL_RLS_POLICIES_TRACKING.sql` - Adds rider parcel-list visibility policy for both delivery parcel keys
6. Run `SQL_FINANCE_SETUP.sql` - Creates finance backend tables (`finance_cost_entries`, `finance_payout_entries`, `finance_billing_entries`) and RLS policies used by the Finance tab
7. Run `SQL_FINANCE_ANALYTICS_INTEGRATION.sql` - Adds optional `region` columns/indexes used by Finance and Analytics filter integration

Tables managed by Supabase:
- `parcels` / `parcel_lists` - Delivery parcels
- `riders` - Delivery personnel  
- `routes` - Route assignments
- `location_logs` - Historical location tracking
- `analytics` - Rider performance metrics

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
