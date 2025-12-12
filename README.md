# Worder

<div align="center">
  <img src="public/logo.svg" alt="Worder Logo" width="120" height="120" />
  <h3>Marketing Automation & CRM Platform</h3>
  <p>Powerful dashboard for Shopify stores to track email marketing ROI, manage customer relationships, and automate communications.</p>
</div>

---

## ✨ Features

### 📊 Analytics Dashboard
- Real-time revenue and order tracking
- Email marketing performance metrics
- Campaign attribution analysis
- Visual charts and graphs with date range filtering

### 📧 Email Marketing (Klaviyo Integration)
- Campaign performance tracking
- Open rates, click rates, and conversions
- Delivery analytics and health monitoring
- Top performing campaigns

### 🛒 E-commerce Analytics (Shopify Integration)
- Revenue and order metrics
- Average order value tracking
- Customer acquisition analysis
- Product performance insights

### 💬 WhatsApp Business
- Real-time conversation management
- Message status tracking (sent, delivered, read)
- Contact info panel
- Template message support

### 🎯 CRM with Kanban Board
- Visual deal pipeline management
- Drag-and-drop card organization
- Multiple pipeline support
- Contact management with activity history

### ⚡ Automation Builder
- Visual flow canvas with drag-and-drop
- 18+ node types (triggers, actions, logic)
- Pre-built automation templates
- A/B testing and conditional branching

### ⚙️ Settings & Integrations
- Profile and team management
- Integration connections (Shopify, Klaviyo, WhatsApp, Meta)
- Billing and usage monitoring
- API key management

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account
- Shopify Partner account (for integration)
- Klaviyo account (for email marketing)
- Meta Business account (for WhatsApp)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/worder.git
   cd worder
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` with your credentials.

4. **Set up Supabase**
   - Create a new Supabase project
   - Run the schema migration:
     ```bash
     # Using Supabase CLI
     supabase db push
     
     # Or manually run the SQL in supabase/schema.sql
     ```

5. **Run the development server**
   ```bash
   npm run dev
   ```

6. **Open the app**
   Navigate to [http://localhost:3000](http://localhost:3000)

---

## 🏗️ Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| State | Zustand |
| Charts | Recharts |
| Drag & Drop | DnD Kit |
| Animations | Framer Motion |
| Icons | Lucide React |
| Deployment | Vercel |

---

## 📁 Project Structure

```
worder/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (dashboard)/        # Protected dashboard routes
│   │   │   ├── dashboard/      # Main dashboard
│   │   │   ├── crm/            # CRM Kanban
│   │   │   ├── whatsapp/       # WhatsApp messaging
│   │   │   ├── automations/    # Automation builder
│   │   │   ├── analytics/      # Analytics pages
│   │   │   │   ├── email/
│   │   │   │   ├── ecommerce/
│   │   │   │   └── reports/
│   │   │   ├── settings/       # Settings pages
│   │   │   └── help/           # Help center
│   │   ├── api/                # API routes
│   │   │   ├── auth/           # Authentication
│   │   │   ├── shopify/        # Shopify webhooks
│   │   │   ├── klaviyo/        # Klaviyo integration
│   │   │   ├── whatsapp/       # WhatsApp Business API
│   │   │   ├── automations/    # Automation engine
│   │   │   ├── contacts/       # Contact management
│   │   │   ├── deals/          # CRM deals/pipelines
│   │   │   └── analytics/      # Analytics data
│   │   ├── globals.css         # Global styles
│   │   ├── layout.tsx          # Root layout
│   │   └── page.tsx            # Login page
│   ├── components/
│   │   ├── ui/                 # Base UI components
│   │   ├── layout/             # Layout components
│   │   ├── dashboard/          # Dashboard components
│   │   ├── crm/                # CRM components
│   │   ├── whatsapp/           # WhatsApp components
│   │   └── automation/         # Automation builder
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client
│   │   └── utils.ts            # Utility functions
│   ├── stores/
│   │   └── index.ts            # Zustand stores
│   └── types/
│       └── index.ts            # TypeScript types
├── supabase/
│   └── schema.sql              # Database schema
├── public/                     # Static assets
├── .env.example                # Environment template
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```

---

## 🔌 Integrations

### 📊 Ads Platforms (NEW!)

#### Facebook Ads (Meta)
1. Create app at [Meta for Developers](https://developers.facebook.com/apps/)
2. Add "Marketing API" product
3. Configure OAuth redirect URI: `https://your-domain.com/api/integrations/meta/callback`
4. Set `META_APP_ID` and `META_APP_SECRET` in `.env.local`

#### Google Ads
1. Create project at [Google Cloud Console](https://console.cloud.google.com/)
2. Enable Google Ads API
3. Create OAuth 2.0 credentials
4. Get Developer Token at [Google Ads API Center](https://ads.google.com/aw/apicenter)
5. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_ADS_DEVELOPER_TOKEN`

#### TikTok Ads
1. Create app at [TikTok Business API Portal](https://business-api.tiktok.com/portal/apps)
2. Request Marketing API access
3. Configure OAuth redirect URI: `https://your-domain.com/api/integrations/tiktok/callback`
4. Set `TIKTOK_APP_ID` and `TIKTOK_APP_SECRET`

### Shopify Setup

1. Create a Shopify app at [partners.shopify.com](https://partners.shopify.com)
2. Configure OAuth scopes:
   - `read_orders`, `read_customers`, `read_checkouts`
3. Set callback URL: `https://your-domain.com/api/shopify`
4. Add credentials to `.env.local`

### Klaviyo Setup

1. Get API keys from Klaviyo Settings → API Keys
2. Create both Private and Public API keys
3. Add to `.env.local`

### WhatsApp Business Setup

1. Create a Meta Business account
2. Set up WhatsApp Business API at [developers.facebook.com](https://developers.facebook.com)
3. Configure webhook URL: `https://your-domain.com/api/whatsapp`
4. Add credentials to `.env.local`

---

## 🎨 Design System

The app uses a custom dark theme with glass morphism effects:

### Colors
- **Primary**: Purple/Violet (`#8b5cf6`)
- **Accent**: Electric Cyan (`#06b6d4`)
- **Background**: Deep Navy (`#020617` → `#0f172a`)
- **Success**: Emerald (`#10b981`)
- **Warning**: Amber (`#f59e0b`)
- **Error**: Rose (`#f43f5e`)

### Effects
- Glass morphism with backdrop blur
- Gradient borders
- Glow shadows
- Smooth animations

---

## 📝 API Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth` | POST | Login, signup, logout |
| `/api/shopify` | GET/POST | OAuth & webhooks |
| `/api/klaviyo` | GET/POST | Sync & campaigns |
| `/api/whatsapp` | GET/POST | Messages & webhooks |
| `/api/contacts` | CRUD | Contact management |
| `/api/deals` | CRUD | Deal/pipeline management |
| `/api/automations` | CRUD | Automation workflows |
| `/api/analytics` | GET | Dashboard metrics |
| `/api/dashboard/metrics` | GET | Aggregated dashboard data |
| `/api/integrations/meta` | GET/POST/DELETE | Facebook Ads integration |
| `/api/integrations/google` | GET/POST/DELETE | Google Ads integration |
| `/api/integrations/tiktok` | GET/POST/DELETE | TikTok Ads integration |

---

## 🚢 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

```bash
# Or use Vercel CLI
vercel --prod
```

### Environment Variables for Production

Ensure all variables from `.env.example` are set in your deployment platform.

---

## 🧪 Development

```bash
# Start development server
npm run dev

# Type checking
npm run type-check

# Linting
npm run lint

# Build for production
npm run build

# Start production server
npm start
```

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

---

## 📞 Support

- Documentation: [docs.worder.com](https://docs.worder.com)
- Email: support@worder.com
- Discord: [Join our community](https://discord.gg/worder)

---

<div align="center">
  <p>Built with ❤️ by Convertfy</p>
</div>
